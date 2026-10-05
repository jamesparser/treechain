// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Params} from "./Params.sol";
import {TreeNFT} from "./TreeNFT.sol";
import {TreeToken} from "./TreeToken.sol";
import {VerifierRegistry} from "./VerifierRegistry.sol";

/// @title StakingRewards
/// @notice Stake a TreeNFT to earn the planter's 0.25 $Tree stream, linearly over the tree's 50-year life,
///         but only while the tree is "verified alive" (see TreeNFT.coveredUntil). A failed check freezes the
///         stream. Staking is one transaction: `TreeNFT.safeTransferFrom(you, StakingRewards, tokenId)`.
contract StakingRewards is IERC721Receiver, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.UintSet;

    struct Stake {
        address staker;
        uint64 lastClaim;
        uint128 claimed;
    }

    TreeNFT public immutable nft;
    TreeToken public immutable token;
    VerifierRegistry public immutable registry;
    /// @notice $Tree per second while a tree is covered: 0.25 / (10 periods)
    uint256 public immutable ratePerSecond;

    mapping(uint256 => Stake) public stakes;
    mapping(address => EnumerableSet.UintSet) private _staked;

    event Staked(uint256 indexed tokenId, address indexed staker);
    event Claimed(uint256 indexed tokenId, address indexed staker, uint256 amount);
    event Unstaked(uint256 indexed tokenId, address indexed staker);

    error NotNFT();
    error NotStaker();
    error NotActive();
    error TreeNotAlive();

    constructor(TreeNFT nft_, TreeToken token_, VerifierRegistry registry_) {
        nft = nft_;
        token = token_;
        registry = registry_;
        ratePerSecond = Params.PLANTER_STAKING / (Params.MAX_CHECKS * nft_.period());
    }

    function onERC721Received(address, address from, uint256 tokenId, bytes calldata) external returns (bytes4) {
        if (msg.sender != address(nft)) revert NotNFT();
        if (!registry.isActive(from)) revert NotActive();
        if (!nft.isAlive(tokenId)) revert TreeNotAlive();
        stakes[tokenId] = Stake({staker: from, lastClaim: uint64(block.timestamp), claimed: 0});
        _staked[from].add(tokenId);
        emit Staked(tokenId, from);
        return IERC721Receiver.onERC721Received.selector;
    }

    /// @notice $Tree claimable right now for a staked tree.
    function pending(uint256 tokenId) public view returns (uint256) {
        Stake memory s = stakes[tokenId];
        if (s.staker == address(0)) return 0;
        uint256 end = nft.coveredUntil(tokenId);
        if (end > block.timestamp) end = block.timestamp;
        if (end <= s.lastClaim) return 0;
        uint256 amount = (end - s.lastClaim) * ratePerSecond;
        uint256 remaining = Params.PLANTER_STAKING - s.claimed; // hard cap: 0.25 per tree
        return amount > remaining ? remaining : amount;
    }

    function claim(uint256 tokenId) external nonReentrant {
        if (stakes[tokenId].staker != msg.sender) revert NotStaker();
        if (!registry.isActive(msg.sender)) revert NotActive();
        _claim(tokenId);
    }

    /// @notice Claim anything pending (unless the staker was kicked) and take the NFT back.
    function unstake(uint256 tokenId) external nonReentrant {
        if (stakes[tokenId].staker != msg.sender) revert NotStaker();
        if (registry.isActive(msg.sender)) _claim(tokenId);
        delete stakes[tokenId];
        _staked[msg.sender].remove(tokenId);
        nft.transferFrom(address(this), msg.sender, tokenId);
        emit Unstaked(tokenId, msg.sender);
    }

    function stakedTokensOf(address account) external view returns (uint256[] memory) {
        return _staked[account].values();
    }

    function _claim(uint256 tokenId) private {
        uint256 amount = pending(tokenId);
        Stake storage s = stakes[tokenId];
        uint256 end = nft.coveredUntil(tokenId);
        if (end > block.timestamp) end = block.timestamp;
        if (end > s.lastClaim) s.lastClaim = uint64(end);
        if (amount == 0) return;
        s.claimed += uint128(amount);
        token.mint(msg.sender, amount);
        emit Claimed(tokenId, msg.sender, amount);
    }
}
