// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Params
/// @notice Protocol constants for TreeChain. One tree emits exactly 1.00 $Tree, ever:
///         0.25 planter upfront + 0.25 planter staking stream + 0.05 team + 0.45 verifiers.
library Params {
    uint256 internal constant UNIT = 1e18;

    // ---- emission split (per tree) ----
    uint256 internal constant PLANTER_UPFRONT = 0.25e18; // minted on plant
    uint256 internal constant PLANTER_STAKING = 0.25e18; // streamed while staked + verified-alive
    uint256 internal constant TEAM = 0.05e18; // minted on plant
    uint256 internal constant VERIFIER_PER_CHECK = 0.045e18; // paid per completed peer check
    uint256 internal constant MAX_CHECKS = 10; // one check per period, for 10 periods
    uint256 internal constant VERIFIER_TOTAL = VERIFIER_PER_CHECK * MAX_CHECKS; // 0.45
    uint256 internal constant TOTAL_PER_TREE = PLANTER_UPFRONT + PLANTER_STAKING + TEAM + VERIFIER_TOTAL; // 1.00

    // ---- anti-fraud geometry (millimetres, so GeoLib stays integer-only) ----
    uint256 internal constant MIN_TREE_DISTANCE_MM = 15_000; // 15 m between any two trees
    uint256 internal constant VERIFY_RADIUS_MM = 50_000; // verifier must be within 50 m of the tree

    // ---- time ----
    /// 5 years (365.25 d). Testnet deployments pass a compressed period so the whole
    /// 50-year chain can be demoed in minutes; mainnet uses this value.
    uint256 internal constant PRODUCTION_PERIOD = 157_788_000;
}
