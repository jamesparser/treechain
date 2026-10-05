// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Params} from "../src/Params.sol";
import {TreeNFT} from "../src/TreeNFT.sol";
import {VerifierRegistry} from "../src/VerifierRegistry.sol";

contract PlantTest is Base {
    event Planted(
        uint256 indexed tokenId,
        address indexed planter,
        int32 latE6,
        int32 lonE6,
        bytes32 imageHash,
        uint64 plantedAt,
        string metadataURI
    );

    function test_plantMintsNftAndEmitsUpfrontAndTeamShare() public {
        bytes32 photo = keccak256("my-photo");
        vm.expectEmit(true, true, false, true);
        emit Planted(1, alice, LAT, LON, photo, uint64(block.timestamp), "ipfs://bafy-meta");
        vm.prank(alice);
        uint256 id = nft.plant(LAT, LON, photo, "ipfs://bafy-meta");

        assertEq(id, 1);
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.tokenURI(1), "ipfs://bafy-meta");
        TreeNFT.Tree memory t = nft.getTree(1);
        assertEq(t.planter, alice);
        assertEq(t.latE6, LAT);
        assertEq(t.lonE6, LON);
        assertEq(t.plantedAt, block.timestamp);
        assertEq(t.imageHash, photo);
        assertEq(t.checks, 0);
        assertEq(t.deadAt, 0);

        assertEq(token.balanceOf(alice), 0.25e18, "planter upfront 0.25");
        assertEq(token.balanceOf(team), 0.05e18, "team 0.05");
        assertEq(token.totalSupply(), 0.30e18);
    }

    function test_emissionSplitSumsToExactlyOne() public pure {
        assertEq(Params.PLANTER_UPFRONT + Params.PLANTER_STAKING + Params.TEAM + Params.VERIFIER_TOTAL, 1e18);
        assertEq(Params.TOTAL_PER_TREE, 1e18);
        assertEq(Params.VERIFIER_PER_CHECK * Params.MAX_CHECKS, 0.45e18);
    }

    function test_unregisteredCannotPlant() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(TreeNFT.NotRegistered.selector);
        nft.plant(LAT, LON, _photo(), "ipfs://x");
    }

    function test_kickedPlanterCannotPlant() public {
        vm.prank(admin);
        registry.kick(alice, "fake trees");
        vm.prank(alice);
        vm.expectRevert(TreeNFT.NotRegistered.selector);
        nft.plant(LAT, LON, _photo(), "ipfs://x");
    }

    function test_duplicatePhotoReverts() public {
        bytes32 photo = _photo();
        vm.prank(alice);
        nft.plant(LAT, LON, photo, "ipfs://x");
        vm.prank(bob);
        vm.expectRevert(TreeNFT.DuplicatePhoto.selector);
        nft.plant(LAT + 5_000, LON, photo, "ipfs://x"); // far away, same photo
    }

    function test_zeroPhotoAndEmptyUriRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(TreeNFT.DuplicatePhoto.selector);
        nft.plant(LAT, LON, bytes32(0), "ipfs://x");
        vm.expectRevert(TreeNFT.BadURI.selector);
        nft.plant(LAT, LON, _photo(), "");
        vm.stopPrank();
    }

    function test_badCoordinatesRevert() public {
        vm.startPrank(alice);
        vm.expectRevert(TreeNFT.BadCoordinates.selector);
        nft.plant(67_000_000, 0, _photo(), "ipfs://x"); // beyond 66 deg
        vm.expectRevert(TreeNFT.BadCoordinates.selector);
        nft.plant(0, 181_000_000, _photo(), "ipfs://x");
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- 15 m rule

    function test_rejectsTreeWithin15m() public {
        _plant(alice, LAT, LON);
        // 134e-6 deg of latitude = 14.90 m
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(LAT + 134, LON, _photo(), "ipfs://x");
    }

    function test_tooCloseErrorNamesBlockingTreeAndDistance() public {
        _plant(alice, LAT, LON);
        (bool ok, uint256 nearest, uint256 dist) = nft.previewPlacement(LAT + 134, LON);
        assertFalse(ok);
        assertEq(nearest, 1);
        assertApproxEqAbs(dist, 14_900, 2);

        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TreeNFT.TooClose.selector, 1, dist));
        nft.plant(LAT + 134, LON, _photo(), "ipfs://x");
    }

    function test_acceptsTreeBeyond15m() public {
        _plant(alice, LAT, LON);
        // 136e-6 deg = 15.12 m
        (bool ok,, uint256 dist) = nft.previewPlacement(LAT + 136, LON);
        assertTrue(ok);
        assertApproxEqAbs(dist, 15_123, 2);
        uint256 id = _plant(bob, LAT + 136, LON);
        assertEq(id, 2);
    }

    function test_sameSpotRejected() public {
        _plant(alice, LAT, LON);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(LAT, LON, _photo(), "ipfs://x");
    }

    function test_longitudeDirectionAlsoEnforced() public {
        _plant(alice, LAT, LON);
        // 0.0001 deg lon at 11.56 deg lat = 10.9 m
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(LAT, LON + 100, _photo(), "ipfs://x");
        // 0.00015 deg = 16.3 m
        _plant(bob, LAT, LON + 150);
    }

    function test_enforcedAcrossGridCellBoundary() public {
        // lat 11_562_000 starts a 400-unit grid cell; these two points are 0.67 m apart in different cells
        _plant(alice, 11_561_999, LON);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(11_562_005, LON, _photo(), "ipfs://x");
    }

    function test_enforcedAcrossAntimeridian() public {
        _plant(alice, 0, 179_999_990);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(0, -179_999_990, _photo(), "ipfs://x"); // 2.2 m away across the date line
    }

    function test_diagonalNeighbourCellChecked() public {
        // corner of four cells: (lat 11_562_000, lon 104_916_000) both start new cells
        _plant(alice, 11_561_999, 104_915_999);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(11_562_001, 104_916_001, _photo(), "ipfs://x");
    }

    function test_manyTreesInOneCellStillChecksAll() public {
        // a 4x4 lattice with 16 m spacing inside one ~44 m cell neighbourhood
        for (int32 i = 0; i < 4; i++) {
            for (int32 j = 0; j < 4; j++) {
                _plant(alice, LAT + i * 150, LON + j * 160);
            }
        }
        assertEq(nft.totalSupply(), 16);
        vm.prank(bob);
        vm.expectPartialRevert(TreeNFT.TooClose.selector);
        nft.plant(LAT + 150 + 20, LON + 160 + 20, _photo(), "ipfs://x"); // ~3 m from a lattice point
    }

    function testFuzz_closePlantsAlwaysRejected_farPlantsAlwaysAccepted(int32 dLat, int32 dLon) public {
        dLat = int32(bound(dLat, -400, 400));
        dLon = int32(bound(dLon, -400, 400));
        _plant(alice, LAT, LON);
        (bool ok,, uint256 dist) = nft.previewPlacement(LAT + dLat, LON + dLon);
        assertEq(ok, dist >= Params.MIN_TREE_DISTANCE_MM);
        if (ok) {
            _plant(bob, LAT + dLat, LON + dLon);
        } else {
            vm.prank(bob);
            vm.expectPartialRevert(TreeNFT.TooClose.selector);
            nft.plant(LAT + dLat, LON + dLon, _photo(), "ipfs://x");
        }
    }

    function test_previewIsCleanWhenNothingNearby() public view {
        (bool ok, uint256 nearest, uint256 dist) = nft.previewPlacement(LAT, LON);
        assertTrue(ok);
        assertEq(nearest, 0);
        assertEq(dist, type(uint256).max);
    }

    function test_enumerationForTheUi() public {
        _plant(alice, LAT, LON);
        _plant(alice, LAT + 1000, LON);
        _plant(bob, LAT + 2000, LON);
        assertEq(nft.totalSupply(), 3);
        assertEq(nft.balanceOf(alice), 2);
        assertEq(nft.tokenOfOwnerByIndex(alice, 1), 2);
        assertEq(nft.tokenByIndex(2), 3);
    }
}
