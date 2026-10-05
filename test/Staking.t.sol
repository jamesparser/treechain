// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Params} from "../src/Params.sol";
import {StakingRewards} from "../src/StakingRewards.sol";
import {TreeNFT} from "../src/TreeNFT.sol";

contract StakingTest is Base {
    uint256 internal id;
    uint256 internal rate;

    function setUp() public override {
        super.setUp();
        id = _plant(alice, LAT, LON);
        rate = staking.ratePerSecond();
    }

    function test_rateStreamsExactlyQuarterOverFiftyYears() public view {
        // 0.25 $Tree over 10 periods; integer floor loses < 1 wei per second of life
        uint256 life = 10 * PERIOD;
        assertLe(rate * life, 0.25e18);
        assertGt(rate * life, 0.25e18 - life);
    }

    function test_stakeIsOneTransactionViaSafeTransfer() public {
        _stake(alice, id);
        assertEq(nft.ownerOf(id), address(staking));
        (address staker, uint64 last,) = staking.stakes(id);
        assertEq(staker, alice);
        assertEq(last, block.timestamp);
        uint256[] memory ids = staking.stakedTokensOf(alice);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
    }

    function test_streamAccruesLinearlyWithinTheFirstPeriod() public {
        _stake(alice, id);
        vm.warp(block.timestamp + PERIOD / 2);
        assertEq(staking.pending(id), rate * (PERIOD / 2));
    }

    function test_streamPausesAtEndOfPeriodWithoutVerification() public {
        _stake(alice, id);
        vm.warp(block.timestamp + 3 * PERIOD); // nobody verified
        // only the first (optimistic) period is covered
        assertEq(staking.pending(id), rate * PERIOD);
        assertApproxEqAbs(staking.pending(id), 0.025e18, 0.001e18);
    }

    function test_verificationUnlocksTheNextPeriodRetroactively() public {
        _stake(alice, id);
        vm.warp(block.timestamp + 3 * PERIOD);
        assertEq(staking.pending(id), rate * PERIOD);

        _verify(bob, id, true); // late check 1 -> coverage through period 2
        assertEq(staking.pending(id), rate * 2 * PERIOD);
    }

    function test_claimMintsAndAdvancesCheckpoint() public {
        _stake(alice, id);
        vm.warp(block.timestamp + PERIOD / 4);
        uint256 expected = rate * (PERIOD / 4);
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        staking.claim(id);
        assertEq(token.balanceOf(alice) - before, expected);
        assertEq(staking.pending(id), 0);
        vm.warp(block.timestamp + 100);
        assertEq(staking.pending(id), rate * 100);
    }

    function test_onlyStakerCanClaimOrUnstake() public {
        _stake(alice, id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(StakingRewards.NotStaker.selector);
        staking.claim(id);
        vm.prank(bob);
        vm.expectRevert(StakingRewards.NotStaker.selector);
        staking.unstake(id);
    }

    function test_unstakeClaimsAndReturnsTheNft() public {
        _stake(alice, id);
        vm.warp(block.timestamp + PERIOD / 2);
        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        staking.unstake(id);
        assertEq(nft.ownerOf(id), alice);
        assertEq(token.balanceOf(alice) - before, rate * (PERIOD / 2));
        assertEq(staking.stakedTokensOf(alice).length, 0);
        assertEq(staking.pending(id), 0);
    }

    function test_deadReportFreezesTheStream() public {
        _stake(alice, id);
        _warpToCheck(id);
        _verify(bob, id, true); // check 1 passes (at 1 period)
        _warpToCheck(id);
        _verify(carol, id, false); // check 2 fails (at 2 periods)

        // covered only through the last PASSED check = 1 period
        assertEq(staking.pending(id), rate * PERIOD);
        vm.warp(block.timestamp + 40 * PERIOD);
        assertEq(staking.pending(id), rate * PERIOD, "stream stopped for good");

        vm.prank(alice);
        staking.claim(id);
        assertEq(staking.pending(id), 0);
    }

    function test_cannotStakeADeadTree() public {
        _warpToCheck(id);
        _verify(bob, id, false);
        vm.prank(alice);
        vm.expectRevert(StakingRewards.TreeNotAlive.selector);
        nft.safeTransferFrom(alice, address(staking), id);
    }

    function test_unregisteredCannotStake() public {
        address stranger = makeAddr("stranger");
        vm.prank(alice);
        nft.transferFrom(alice, stranger, id);
        vm.prank(stranger);
        vm.expectRevert(StakingRewards.NotActive.selector);
        nft.safeTransferFrom(stranger, address(staking), id);
    }

    function test_onlyTheNftContractCanCallTheReceiverHook() public {
        vm.expectRevert(StakingRewards.NotNFT.selector);
        staking.onERC721Received(alice, alice, id, "");
    }

    function test_kickedStakerForfeitsPendingButGetsNftBack() public {
        _stake(alice, id);
        vm.warp(block.timestamp + PERIOD / 2);
        vm.prank(admin);
        registry.kick(alice, "cheated");

        vm.prank(alice);
        vm.expectRevert(StakingRewards.NotActive.selector);
        staking.claim(id);

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        staking.unstake(id);
        assertEq(token.balanceOf(alice), before, "no payout for a kicked staker");
        assertEq(nft.ownerOf(id), alice);
    }

    function test_restakingStartsAFreshCheckpoint() public {
        _stake(alice, id);
        vm.warp(block.timestamp + PERIOD / 4);
        vm.prank(alice);
        staking.unstake(id);
        vm.warp(block.timestamp + PERIOD / 4); // unstaked: earns nothing
        _stake(alice, id);
        vm.warp(block.timestamp + 10);
        assertEq(staking.pending(id), rate * 10);
    }

    function test_streamNeverExceedsQuarterEvenIfClaimedInPieces() public {
        _stake(alice, id);
        uint256 claimedTotal;
        for (uint256 i = 0; i < 10; i++) {
            _warpToCheck(id);
            _verify(i % 2 == 0 ? bob : carol, id, true);
            vm.prank(alice);
            staking.claim(id);
        }
        vm.warp(nft.lifeEnd(id) + 100 * PERIOD);
        vm.prank(alice);
        staking.claim(id);
        claimedTotal = token.balanceOf(alice) - Params.PLANTER_UPFRONT;
        assertLe(claimedTotal, Params.PLANTER_STAKING);
        assertApproxEqAbs(claimedTotal, Params.PLANTER_STAKING, 10 * PERIOD); // floor-division dust only
        assertEq(staking.pending(id), 0);
    }
}
