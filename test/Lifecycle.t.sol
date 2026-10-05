// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Params} from "../src/Params.sol";

/// @dev The headline property: following one tree through its whole 50-year life mints exactly 1.00 $Tree,
///      split 0.25 / 0.25 / 0.05 / 0.45, and a business can burn it for a carbon receipt.
contract LifecycleTest is Base {
    function test_fiftyYearLifeMintsExactlyOneTree() public {
        // year 0: plant + stake
        uint256 id = _plant(alice, LAT, LON);
        assertEq(token.totalSupply(), 0.30e18, "0.25 planter + 0.05 team at plant");
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(staking), id);

        // years 5..50: ten peer checks by two alternating verifiers; planter claims after each
        for (uint256 i = 0; i < 10; i++) {
            _warpToCheck(id);
            _verify(i % 2 == 0 ? bob : carol, id, true);
            vm.prank(alice);
            staking.claim(id);
        }
        // after the 50-year mark the last bit of the stream has accrued
        vm.warp(nft.lifeEnd(id) + 1);
        vm.prank(alice);
        staking.claim(id);

        uint256 planterTotal = token.balanceOf(alice);
        uint256 verifierTotal = token.balanceOf(bob) + token.balanceOf(carol);
        uint256 teamTotal = token.balanceOf(team);

        assertEq(verifierTotal, 0.45e18, "verifiers: 10 x 0.045");
        assertEq(teamTotal, 0.05e18, "team");
        assertApproxEqAbs(planterTotal, 0.50e18, 2e9, "planter: 0.25 upfront + 0.25 stream (floor dust < 2 gwei)");
        assertLe(planterTotal, 0.50e18, "never over-mints");

        // the whole tree: exactly 1.00 $Tree (to within sub-gwei integer-division dust)
        assertLe(token.totalSupply(), 1e18);
        assertApproxEqAbs(token.totalSupply(), 1e18, 2e9);

        // year 50+: a business holds $Tree and retires 1.0 tCO2
        vm.prank(alice);
        token.transfer(biz, 0.4e18);
        vm.prank(bob);
        token.transfer(biz, 0.225e18);
        vm.prank(carol);
        token.transfer(biz, 0.225e18);
        vm.prank(biz);
        vault.retire(0.85e18, "Net-zero 2076");
        assertEq(token.balanceOf(biz), 0);
        assertEq(vault.totalRetired(), 0.85e18);
        assertApproxEqAbs(token.totalSupply(), 0.15e18, 2e9);
    }

    function test_nothingMintsForATreeThatNeverGetsVerified() public {
        uint256 id = _plant(alice, LAT, LON);
        vm.prank(alice);
        nft.safeTransferFrom(alice, address(staking), id);
        vm.warp(block.timestamp + 100 * PERIOD);
        vm.prank(alice);
        staking.claim(id);
        // unverified tree: planter keeps 0.25 + one optimistic period of stream (0.025), team 0.05, verifiers 0
        assertApproxEqAbs(token.totalSupply(), 0.25e18 + 0.025e18 + 0.05e18, 1e9);
    }
}
