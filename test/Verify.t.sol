// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Params} from "../src/Params.sol";
import {TreeNFT} from "../src/TreeNFT.sol";
import {VerificationBounty} from "../src/VerificationBounty.sol";

contract VerifyTest is Base {
    uint256 internal id;

    event TreeVerified(
        uint256 indexed tokenId,
        address indexed verifier,
        uint8 checkIndex,
        bool stillAlive,
        bytes32 photoHash,
        string evidenceURI,
        uint256 paid
    );

    function setUp() public override {
        super.setUp();
        id = _plant(alice, LAT, LON);
    }

    function test_verifierEarnsPerCheck() public {
        _warpToCheck(id);
        bytes32 photo = keccak256("proof-1");
        vm.expectEmit(true, true, false, true);
        emit TreeVerified(id, bob, 1, true, photo, "ipfs://evidence", 0.045e18);
        vm.prank(bob);
        bounty.verify(id, LAT, LON, photo, "ipfs://evidence", true);

        assertEq(token.balanceOf(bob), 0.045e18);
        assertEq(nft.getTree(id).checks, 1);
        assertTrue(nft.isAlive(id));
        assertTrue(nft.photoUsed(photo));
    }

    function test_checkNotDueBeforeOnePeriod() public {
        vm.warp(block.timestamp + PERIOD - 1);
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.CheckNotDue.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
    }

    function test_plantersOwnCheckReverts_andPaysNothing() public {
        _warpToCheck(id);
        uint256 before = token.balanceOf(alice);
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(alice);
        vm.expectRevert(VerificationBounty.SelfVerification.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
        assertEq(token.balanceOf(alice), before);
        assertEq(nft.getTree(id).checks, 0);
    }

    function test_sameIdentityCannotRegisterTwoAccounts() public {
        // alice's ID hash can't be bound to a second wallet, so "different account, same ID" is impossible
        address alice2 = makeAddr("alice2");
        vm.prank(alice2);
        vm.expectRevert();
        registry.register(keccak256(bytes("alice")));
    }

    function test_unregisteredAndKickedVerifiersRevert() public {
        _warpToCheck(id);
        TreeNFT.Tree memory t = nft.getTree(id);

        vm.prank(makeAddr("nobody"));
        vm.expectRevert(VerificationBounty.NotRegistered.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);

        vm.prank(admin);
        registry.kick(bob, "collusion");
        vm.prank(bob);
        vm.expectRevert(VerificationBounty.NotRegistered.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
    }

    function test_verifierMustBeWithin50m() public {
        _warpToCheck(id);
        // 600e-6 deg lat ~ 66.7 m
        vm.prank(bob);
        vm.expectPartialRevert(VerificationBounty.TooFarFromTree.selector);
        bounty.verify(id, LAT + 600, LON, _photo(), "x", true);
        // 400e-6 deg ~ 44.5 m is fine
        vm.prank(bob);
        bounty.verify(id, LAT + 400, LON, _photo(), "x", true);
    }

    function test_verifierFarAwayCannotSpoofCoarseBox() public {
        _warpToCheck(id);
        vm.prank(bob);
        vm.expectPartialRevert(VerificationBounty.TooFarFromTree.selector);
        bounty.verify(id, LAT + 5_000_000, LON, _photo(), "x", true); // 555 km away
    }

    function test_sameVerifierCannotCheckTwiceInARow() public {
        _warpToCheck(id);
        _verify(bob, id, true);
        _warpToCheck(id);
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(bob);
        vm.expectRevert(VerificationBounty.SameVerifierTwice.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
        _verify(carol, id, true); // someone else can
        _warpToCheck(id);
        _verify(bob, id, true); // and bob can come back after carol
    }

    function test_photoCannotBeReused() public {
        _warpToCheck(id);
        TreeNFT.Tree memory t = nft.getTree(id);
        // can't re-submit the planting photo as proof
        vm.prank(bob);
        vm.expectRevert(TreeNFT.DuplicatePhoto.selector);
        bounty.verify(id, t.latE6, t.lonE6, t.imageHash, "x", true);
        // can't reuse a previous verification photo
        bytes32 photo = keccak256("proof");
        vm.prank(bob);
        bounty.verify(id, t.latE6, t.lonE6, photo, "x", true);
        _warpToCheck(id);
        vm.prank(carol);
        vm.expectRevert(TreeNFT.DuplicatePhoto.selector);
        bounty.verify(id, t.latE6, t.lonE6, photo, "x", true);
    }

    function test_noSuchTreeReverts() public {
        vm.prank(bob);
        vm.expectRevert(TreeNFT.NoSuchTree.selector);
        bounty.verify(999, LAT, LON, _photo(), "x", true);
    }

    function test_tenCheckCapAndVerifierTotalIs045() public {
        for (uint256 i = 0; i < 10; i++) {
            _warpToCheck(id);
            _verify(i % 2 == 0 ? bob : carol, id, true);
        }
        assertEq(nft.getTree(id).checks, 10);
        assertEq(token.balanceOf(bob) + token.balanceOf(carol), 0.45e18, "verifiers earn exactly 0.45");

        // an 11th check is impossible
        vm.warp(block.timestamp + 10 * PERIOD);
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(biz);
        vm.expectRevert(TreeNFT.AllChecksDone.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
        assertEq(nft.nextCheckAt(id), 0);
    }

    function test_checkNOpensAtNPeriods() public {
        assertEq(nft.nextCheckAt(id), block.timestamp + PERIOD);
        _warpToCheck(id);
        _verify(bob, id, true);
        assertEq(nft.nextCheckAt(id), nft.getTree(id).plantedAt + 2 * PERIOD);
    }

    function test_deadReportEndsTheChainButStillPaysTheVerifier() public {
        _warpToCheck(id);
        _verify(bob, id, true);
        _warpToCheck(id);
        _verify(carol, id, false); // reported dead at check 2

        assertFalse(nft.isAlive(id));
        assertEq(token.balanceOf(carol), 0.045e18);
        assertEq(nft.nextCheckAt(id), 0);

        vm.warp(block.timestamp + PERIOD);
        TreeNFT.Tree memory t = nft.getTree(id);
        vm.prank(bob);
        vm.expectRevert(TreeNFT.TreeNotAlive.selector);
        bounty.verify(id, t.latE6, t.lonE6, _photo(), "x", true);
    }

    function test_adminCanReinstateAWronglyKilledTree() public {
        _warpToCheck(id);
        _verify(bob, id, false);
        assertFalse(nft.isAlive(id));
        vm.prank(admin);
        nft.reinstate(id);
        assertTrue(nft.isAlive(id));
    }

    function test_onlyBountyCanRecordChecks() public {
        vm.prank(bob);
        vm.expectRevert();
        nft.recordCheck(id, true, _photo(), bob);
    }
}
