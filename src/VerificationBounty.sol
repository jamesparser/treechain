// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Params} from "./Params.sol";
import {GeoLib} from "./GeoLib.sol";
import {TreeNFT} from "./TreeNFT.sol";
import {TreeToken} from "./TreeToken.sol";
import {VerifierRegistry} from "./VerifierRegistry.sol";

/// @title VerificationBounty
/// @notice Peer verification. A registered verifier who is NOT the planter (different account and different ID),
///         standing within 50 m of the tree, submits a fresh photo and an alive / not-alive verdict. They earn
///         0.045 $Tree per completed check; a tree has at most 10 checks (one per period), so verifiers can
///         never draw more than 0.45 $Tree per tree. A "not alive" verdict ends the tree's chain and freezes
///         its planter stream.
contract VerificationBounty is ReentrancyGuard {
    TreeNFT public immutable nft;
    VerifierRegistry public immutable registry;
    TreeToken public immutable token;

    mapping(uint256 => address) public lastVerifier;

    event TreeVerified(
        uint256 indexed tokenId,
        address indexed verifier,
        uint8 checkIndex,
        bool stillAlive,
        bytes32 photoHash,
        string evidenceURI,
        uint256 paid
    );

    error NotRegistered();
    error SelfVerification();
    error SameVerifierTwice();
    error TooFarFromTree(uint256 distanceMm);
    error BadCoordinates();

    constructor(TreeNFT nft_, VerifierRegistry registry_, TreeToken token_) {
        nft = nft_;
        registry = registry_;
        token = token_;
    }

    function verify(
        uint256 tokenId,
        int32 latE6,
        int32 lonE6,
        bytes32 photoHash,
        string calldata evidenceURI,
        bool stillAlive
    ) external nonReentrant {
        if (!registry.isActive(msg.sender)) revert NotRegistered();

        TreeNFT.Tree memory t = nft.getTree(tokenId); // reverts NoSuchTree
        // verifier != planter, by account and by ID
        if (registry.sameIdentity(msg.sender, t.planter)) revert SelfVerification();
        if (lastVerifier[tokenId] == msg.sender) revert SameVerifierTwice();

        if (latE6 > 90_000_000 || latE6 < -90_000_000 || lonE6 > 180_000_000 || lonE6 < -180_000_000) {
            revert BadCoordinates();
        }
        uint256 d = GeoLib.distanceMm(latE6, lonE6, t.latE6, t.lonE6);
        if (d > Params.VERIFY_RADIUS_MM) revert TooFarFromTree(d);

        lastVerifier[tokenId] = msg.sender;
        // reverts if: tree dead, 10 checks done, check not yet due, photo reused
        nft.recordCheck(tokenId, stillAlive, photoHash, msg.sender);

        token.mint(msg.sender, Params.VERIFIER_PER_CHECK);
        emit TreeVerified(
            tokenId, msg.sender, t.checks + 1, stillAlive, photoHash, evidenceURI, Params.VERIFIER_PER_CHECK
        );
    }
}
