// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {VerifierRegistry} from "../src/VerifierRegistry.sol";

contract RegistryTest is Test {
    VerifierRegistry r;
    address admin = makeAddr("admin");
    address a = makeAddr("a");
    address b = makeAddr("b");

    function setUp() public {
        r = new VerifierRegistry(admin);
    }

    function test_registerBindsIdToAccount() public {
        bytes32 id = keccak256("a-id");
        vm.prank(a);
        r.register(id);
        assertTrue(r.isActive(a));
        assertEq(r.idOf(a), id);
        assertEq(r.holderOfId(id), a);
        assertFalse(r.isActive(b));
    }

    function test_oneIdPerAccountAndOneAccountPerId() public {
        bytes32 id = keccak256("a-id");
        vm.prank(a);
        r.register(id);
        vm.prank(a);
        vm.expectRevert(VerifierRegistry.AlreadyRegistered.selector);
        r.register(keccak256("other"));
        vm.prank(b);
        vm.expectRevert(VerifierRegistry.IdTaken.selector);
        r.register(id);
        vm.prank(b);
        vm.expectRevert(VerifierRegistry.EmptyId.selector);
        r.register(bytes32(0));
    }

    function test_sameIdentity() public {
        vm.prank(a);
        r.register(keccak256("a-id"));
        vm.prank(b);
        r.register(keccak256("b-id"));
        assertTrue(r.sameIdentity(a, a));
        assertFalse(r.sameIdentity(a, b));
        assertFalse(r.sameIdentity(a, makeAddr("unregistered")));
        assertFalse(r.sameIdentity(makeAddr("u1"), makeAddr("u2")));
    }

    function test_kickAndReinstate() public {
        vm.prank(a);
        r.register(keccak256("a-id"));
        vm.prank(admin);
        r.kick(a, "fake photos");
        assertFalse(r.isActive(a));
        assertEq(r.idOf(a), keccak256("a-id"), "ID stays bound so the cheater can't re-register it");
        vm.prank(admin);
        r.reinstate(a);
        assertTrue(r.isActive(a));
    }

    function test_onlyKickerCanKick() public {
        vm.prank(a);
        r.register(keccak256("a-id"));
        vm.prank(b);
        vm.expectRevert();
        r.kick(a, "nope");
    }

    function test_cannotKickAnUnregisteredAccount() public {
        vm.prank(admin);
        vm.expectRevert(VerifierRegistry.NotRegistered.selector);
        r.kick(a, "x");
    }
}
