// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {BurnVault} from "../src/BurnVault.sol";
import {TreeToken} from "../src/TreeToken.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";

contract BurnTest is Base {
    event CarbonRetired(address indexed buyer, uint256 amount, uint256 indexed receiptId, string beneficiary);

    function setUp() public override {
        super.setUp();
        // a business ends up holding $Tree (bought OTC / on a DEX in production; transferred in here)
        _plant(alice, LAT, LON);
        vm.prank(alice);
        token.transfer(biz, 0.25e18);
    }

    function test_retireBurnsAndRecordsReceipt() public {
        uint256 supplyBefore = token.totalSupply();
        vm.expectEmit(true, true, false, true);
        emit CarbonRetired(biz, 0.1e18, 1, "Acme Coffee Co.");
        vm.prank(biz);
        uint256 rid = vault.retire(0.1e18, "Acme Coffee Co.");

        assertEq(rid, 1);
        assertEq(token.balanceOf(biz), 0.15e18);
        assertEq(token.totalSupply(), supplyBefore - 0.1e18, "burned, not transferred");
        assertEq(vault.totalRetired(), 0.1e18);
        assertEq(vault.retiredBy(biz), 0.1e18);
        BurnVault.Receipt memory r = vault.receipt(1);
        assertEq(r.buyer, biz);
        assertEq(r.amount, 0.1e18);
        assertEq(r.beneficiary, "Acme Coffee Co.");
        assertEq(r.retiredAt, block.timestamp);
    }

    function test_receiptsAccumulate() public {
        vm.startPrank(biz);
        vault.retire(0.05e18, "a");
        vault.retire(0.05e18, "b");
        vm.stopPrank();
        assertEq(vault.receiptCount(), 2);
        assertEq(vault.retiredBy(biz), 0.1e18);
        assertEq(vault.receipt(2).beneficiary, "b");
    }

    function test_cannotRetireMoreThanYouHold() public {
        vm.prank(biz);
        vm.expectRevert(abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, biz, 0.25e18, 1e18));
        vault.retire(1e18, "too much");
    }

    function test_zeroAmountAndLongBeneficiaryRevert() public {
        vm.startPrank(biz);
        vm.expectRevert(BurnVault.ZeroAmount.selector);
        vault.retire(0, "x");
        vm.expectRevert(BurnVault.BeneficiaryTooLong.selector);
        vault.retire(1, string(new bytes(129)));
        vm.stopPrank();
    }

    function test_vaultCanOnlyBurnTheCallersOwnBalance() public {
        // alice never approved anything and cannot be burned by biz
        uint256 aliceBefore = token.balanceOf(alice);
        vm.prank(biz);
        vault.retire(0.1e18, "x");
        assertEq(token.balanceOf(alice), aliceBefore);
    }

    function test_nobodyElseCanBurnOrMint() public {
        vm.startPrank(bob);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, bob, token.BURNER_ROLE()
            )
        );
        token.retire(biz, 1);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, bob, token.MINTER_ROLE()
            )
        );
        token.mint(bob, 1e18);
        vm.stopPrank();
    }

    function test_adminDoesNotHoldMintOrBurnRoles() public view {
        assertFalse(token.hasRole(token.MINTER_ROLE(), admin));
        assertFalse(token.hasRole(token.BURNER_ROLE(), admin));
    }
}
