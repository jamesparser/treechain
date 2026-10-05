// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Params} from "../src/Params.sol";
import {TreeToken} from "../src/TreeToken.sol";
import {VerifierRegistry} from "../src/VerifierRegistry.sol";
import {TreeNFT} from "../src/TreeNFT.sol";
import {StakingRewards} from "../src/StakingRewards.sol";
import {VerificationBounty} from "../src/VerificationBounty.sol";
import {BurnVault} from "../src/BurnVault.sol";

/// @dev Shared fixture: full system deployed + wired exactly like script/Deploy.s.sol, with the production
///      5-year period so the real emission rates are what get tested.
abstract contract Base is Test {
    TreeToken public token;
    VerifierRegistry public registry;
    TreeNFT public nft;
    StakingRewards public staking;
    VerificationBounty public bounty;
    BurnVault public vault;

    address internal admin = makeAddr("admin");
    address internal team = makeAddr("team");
    address internal alice = makeAddr("alice"); // planter
    address internal bob = makeAddr("bob"); // verifier
    address internal carol = makeAddr("carol"); // verifier
    address internal biz = makeAddr("business");

    uint256 internal constant PERIOD = Params.PRODUCTION_PERIOD;

    // Phnom Penh, BKK1
    int32 internal constant LAT = 11_562_200;
    int32 internal constant LON = 104_916_000;

    uint256 internal photoSeed;

    function setUp() public virtual {
        vm.warp(1_760_000_000); // Oct 2025
        token = new TreeToken(admin);
        registry = new VerifierRegistry(admin);
        nft = new TreeNFT(token, registry, team, PERIOD, admin);
        staking = new StakingRewards(nft, token, registry);
        bounty = new VerificationBounty(nft, registry, token);
        vault = new BurnVault(token);

        vm.startPrank(admin);
        token.grantRole(token.MINTER_ROLE(), address(nft));
        token.grantRole(token.MINTER_ROLE(), address(staking));
        token.grantRole(token.MINTER_ROLE(), address(bounty));
        token.grantRole(token.BURNER_ROLE(), address(vault));
        nft.grantRole(nft.CHECKER_ROLE(), address(bounty));
        vm.stopPrank();

        _register(alice, "alice");
        _register(bob, "bob");
        _register(carol, "carol");
        _register(biz, "biz");
    }

    function _register(address who, string memory handle) internal {
        vm.prank(who);
        registry.register(keccak256(bytes(handle)));
    }

    function _photo() internal returns (bytes32) {
        return keccak256(abi.encode("photo", ++photoSeed));
    }

    function _plant(address who, int32 lat, int32 lon) internal returns (uint256 id) {
        vm.prank(who);
        id = nft.plant(lat, lon, _photo(), "ipfs://bafy-test-metadata");
    }

    function _verify(address who, uint256 id, bool alive) internal {
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(who);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "ipfs://bafy-evidence", alive);
    }

    function _stake(address who, uint256 id) internal {
        vm.prank(who);
        nft.safeTransferFrom(who, address(staking), id);
    }

    function _warpToCheck(uint256 id) internal {
        vm.warp(nft.nextCheckAt(id));
    }
}
