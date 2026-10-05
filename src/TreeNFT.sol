// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Params} from "./Params.sol";
import {GeoLib} from "./GeoLib.sol";
import {TreeToken} from "./TreeToken.sol";
import {VerifierRegistry} from "./VerifierRegistry.sol";

/// @title TreeNFT
/// @notice One ERC-721 per planted tree. Stores (lat, long, plantedAt, imageHash, planter) on-chain and the
///         full metadata (photo + geo + date) on IPFS via `tokenURI`. Enforces the anti-fraud rules at plant time:
///         registered planter, unique photo, and a 15 m minimum distance to every other tree (haversine, checked
///         against a spatial grid so the cost stays constant as the forest grows).
///         Also holds each tree's health record, which only VerificationBounty can advance.
contract TreeNFT is ERC721Enumerable, AccessControl, ReentrancyGuard {
    bytes32 public constant CHECKER_ROLE = keccak256("CHECKER_ROLE");

    struct Tree {
        address planter;
        int32 latE6; // degrees * 1e6
        int32 lonE6;
        uint8 checks; // peer checks completed (pass or fail), max 10
        uint64 plantedAt;
        uint64 deadAt; // 0 while alive; timestamp of the failed check otherwise
        bytes32 imageHash; // sha-256 of the planting photo
    }

    // Placement limits. |lat| <= 66 keeps a 0.0004 degree grid cell >= 18 m wide in longitude,
    // so checking the 3x3 neighbourhood always covers the 15 m radius.
    int256 public constant MAX_ABS_LAT_E6 = 66_000_000;
    int256 private constant CELL_E6 = 400; // 0.0004 degrees ~ 44 m tall
    int256 private constant LAT_CELLS = 450_000; // 180 / 0.0004
    int256 private constant LON_CELLS = 900_000; // 360 / 0.0004

    TreeToken public immutable token;
    VerifierRegistry public immutable registry;
    address public immutable team;
    /// @notice One verification period. Production = 5 years; testnet demo clock = minutes.
    uint256 public immutable period;

    uint256 public lastTokenId;
    mapping(uint256 => Tree) private _trees;
    mapping(uint256 => string) private _uris;
    /// @notice every photo hash (planting or verification) can be used exactly once, protocol-wide
    mapping(bytes32 => bool) public photoUsed;
    mapping(uint256 => uint256[]) private _cells; // grid cell -> token ids

    event Planted(
        uint256 indexed tokenId,
        address indexed planter,
        int32 latE6,
        int32 lonE6,
        bytes32 imageHash,
        uint64 plantedAt,
        string metadataURI
    );
    event CheckRecorded(uint256 indexed tokenId, address indexed checker, uint8 checkIndex, bool stillAlive);

    error NotRegistered();
    error BadCoordinates();
    error BadURI();
    error DuplicatePhoto();
    /// @param nearestTokenId the existing tree that blocks this spot
    /// @param distanceMm how far (mm) the new tree is from it
    error TooClose(uint256 nearestTokenId, uint256 distanceMm);
    error NoSuchTree();
    error TreeNotAlive();
    error AllChecksDone();
    error CheckNotDue(uint256 dueAt);

    constructor(TreeToken token_, VerifierRegistry registry_, address team_, uint256 period_, address admin)
        ERC721("TreeChain Tree", "TREENFT")
    {
        require(period_ > 0 && team_ != address(0), "bad config");
        token = token_;
        registry = registry_;
        team = team_;
        period = period_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ------------------------------------------------------------------ plant

    /// @notice Plant a tree: mint the TreeNFT and emit 0.25 $Tree to the planter and 0.05 $Tree to the team.
    /// @param latE6 latitude in degrees * 1e6
    /// @param lonE6 longitude in degrees * 1e6
    /// @param imageHash sha-256 of the photo (computed in the browser, also pinned to IPFS)
    /// @param metadataURI ipfs://… JSON with geo + image + date
    function plant(int32 latE6, int32 lonE6, bytes32 imageHash, string calldata metadataURI)
        external
        nonReentrant
        returns (uint256 tokenId)
    {
        if (!registry.isActive(msg.sender)) revert NotRegistered();
        if (
            latE6 > MAX_ABS_LAT_E6 || latE6 < -MAX_ABS_LAT_E6 || lonE6 > 180_000_000 || lonE6 < -180_000_000
        ) revert BadCoordinates();
        uint256 uriLen = bytes(metadataURI).length;
        if (uriLen == 0 || uriLen > 4096) revert BadURI();
        if (imageHash == bytes32(0) || photoUsed[imageHash]) revert DuplicatePhoto();

        (uint256 nearestId, uint256 dist) = _nearest(latE6, lonE6);
        if (dist < Params.MIN_TREE_DISTANCE_MM) revert TooClose(nearestId, dist);

        tokenId = ++lastTokenId;
        photoUsed[imageHash] = true;
        _trees[tokenId] = Tree({
            planter: msg.sender,
            latE6: latE6,
            lonE6: lonE6,
            checks: 0,
            plantedAt: uint64(block.timestamp),
            deadAt: 0,
            imageHash: imageHash
        });
        _uris[tokenId] = metadataURI;
        _cells[_cellKey(latE6, lonE6)].push(tokenId);

        _safeMint(msg.sender, tokenId);
        token.mint(msg.sender, Params.PLANTER_UPFRONT);
        token.mint(team, Params.TEAM);

        emit Planted(tokenId, msg.sender, latE6, lonE6, imageHash, uint64(block.timestamp), metadataURI);
    }

    // ------------------------------------------------------------- health record

    /// @notice Called by VerificationBounty after it has validated a peer check.
    function recordCheck(uint256 tokenId, bool stillAlive, bytes32 photoHash, address checker)
        external
        onlyRole(CHECKER_ROLE)
    {
        Tree storage t = _trees[tokenId];
        if (t.plantedAt == 0) revert NoSuchTree();
        if (t.deadAt != 0) revert TreeNotAlive();
        if (t.checks >= Params.MAX_CHECKS) revert AllChecksDone();
        uint256 due = nextCheckAt(tokenId);
        if (block.timestamp < due) revert CheckNotDue(due);
        if (photoHash == bytes32(0) || photoUsed[photoHash]) revert DuplicatePhoto();

        photoUsed[photoHash] = true;
        t.checks += 1;
        if (!stillAlive) t.deadAt = uint64(block.timestamp);
        emit CheckRecorded(tokenId, checker, t.checks, stillAlive);
    }

    /// @notice Admin escape hatch for a wrongly-reported dead tree (testnet governance).
    function reinstate(uint256 tokenId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Tree storage t = _trees[tokenId];
        if (t.plantedAt == 0) revert NoSuchTree();
        t.deadAt = 0;
    }

    // -------------------------------------------------------------------- views

    function getTree(uint256 tokenId) external view returns (Tree memory) {
        if (_trees[tokenId].plantedAt == 0) revert NoSuchTree();
        return _trees[tokenId];
    }

    function isAlive(uint256 tokenId) public view returns (bool) {
        Tree storage t = _trees[tokenId];
        return t.plantedAt != 0 && t.deadAt == 0;
    }

    /// @notice When the next peer check opens: check n (1..10) opens n periods after planting.
    ///         Returns 0 when no further check is possible (dead, or all 10 done).
    function nextCheckAt(uint256 tokenId) public view returns (uint256) {
        Tree storage t = _trees[tokenId];
        if (t.plantedAt == 0 || t.deadAt != 0 || t.checks >= Params.MAX_CHECKS) return 0;
        return uint256(t.plantedAt) + (uint256(t.checks) + 1) * period;
    }

    /// @notice End of the 50-year life (10 periods after planting).
    function lifeEnd(uint256 tokenId) public view returns (uint256) {
        return uint256(_trees[tokenId].plantedAt) + Params.MAX_CHECKS * period;
    }

    /// @notice Until when this tree counts as "verified alive" — the stake stream may accrue up to here.
    ///         A living tree is covered through its next check window (c passed checks => c+1 periods);
    ///         a tree reported dead is covered only through its last passed check. Capped at 50 years.
    function coveredUntil(uint256 tokenId) public view returns (uint256) {
        Tree storage t = _trees[tokenId];
        if (t.plantedAt == 0) return 0;
        uint256 periods = t.deadAt == 0 ? uint256(t.checks) + 1 : uint256(t.checks) - 1; // failed check is not a pass
        if (periods > Params.MAX_CHECKS) periods = Params.MAX_CHECKS;
        return uint256(t.plantedAt) + periods * period;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _uris[tokenId];
    }

    /// @notice Read-only placement pre-flight for the UI (no gas, no state change).
    /// @return ok true if a tree can be planted here
    /// @return nearestTokenId closest tree within the grid neighbourhood (0 if none)
    /// @return distanceMm distance to it in mm (type(uint256).max if none nearby)
    function previewPlacement(int32 latE6, int32 lonE6)
        external
        view
        returns (bool ok, uint256 nearestTokenId, uint256 distanceMm)
    {
        (nearestTokenId, distanceMm) = _nearest(latE6, lonE6);
        ok = distanceMm >= Params.MIN_TREE_DISTANCE_MM;
    }

    // --------------------------------------------------------------- spatial grid

    function _nearest(int32 latE6, int32 lonE6) private view returns (uint256 nearestId, uint256 nearestDist) {
        nearestDist = GeoLib.FAR;
        (int256 laCell, int256 loCell) = _cellOf(latE6, lonE6);
        for (int256 dLa = -1; dLa <= 1; dLa++) {
            int256 la = laCell + dLa;
            if (la < 0 || la >= LAT_CELLS) continue;
            for (int256 dLo = -1; dLo <= 1; dLo++) {
                int256 lo = (loCell + dLo + LON_CELLS) % LON_CELLS;
                uint256[] storage ids = _cells[uint256(la * LON_CELLS + lo)];
                uint256 n = ids.length;
                for (uint256 i = 0; i < n; i++) {
                    Tree storage t = _trees[ids[i]];
                    uint256 d = GeoLib.distanceMm(latE6, lonE6, t.latE6, t.lonE6);
                    if (d < nearestDist) {
                        nearestDist = d;
                        nearestId = ids[i];
                    }
                }
            }
        }
    }

    function _cellOf(int32 latE6, int32 lonE6) private pure returns (int256 laCell, int256 loCell) {
        laCell = (int256(latE6) + 90_000_000) / CELL_E6;
        loCell = ((int256(lonE6) + 180_000_000) / CELL_E6) % LON_CELLS;
    }

    function _cellKey(int32 latE6, int32 lonE6) private pure returns (uint256) {
        (int256 la, int256 lo) = _cellOf(latE6, lonE6);
        return uint256(la * LON_CELLS + lo);
    }

    // ----------------------------------------------------------------- plumbing

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
