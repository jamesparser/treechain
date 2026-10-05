// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GeoLib} from "../src/GeoLib.sol";

contract GeoHarness {
    function d(int32 a, int32 b, int32 c, int32 e) external pure returns (uint256) {
        return GeoLib.distanceMm(a, b, c, e);
    }
}

/// @dev Reference values below were computed off-chain with a float64 haversine (R = 6,371,008.8 m).
contract GeoLibTest is Test {
    GeoHarness h = new GeoHarness();

    function _check(int32 la1, int32 lo1, int32 la2, int32 lo2, uint256 expectedMm) internal view {
        // fixed-point series vs float64 reference: sub-millimetre agreement expected; allow 2 mm
        assertApproxEqAbs(h.d(la1, lo1, la2, lo2), expectedMm, 2);
    }

    function test_samePointIsZero() public view {
        assertEq(h.d(11_562_200, 104_916_000, 11_562_200, 104_916_000), 0);
    }

    function test_latStepAtEquator() public view {
        _check(0, 0, 100, 0, 11_120); // 0.0001 deg lat = 11.1195 m
    }

    function test_lonStepAtPhnomPenh() public view {
        _check(11_562_200, 104_916_000, 11_562_200, 104_916_100, 10_894); // shrinks by cos(lat)
    }

    function test_justUnder15m() public view {
        _check(11_562_200, 104_916_000, 11_562_334, 104_916_000, 14_900);
    }

    function test_justOver15m() public view {
        _check(11_562_200, 104_916_000, 11_562_336, 104_916_000, 15_123);
    }

    function test_diagonalPhnomPenh() public view {
        _check(11_562_200, 104_916_000, 11_562_500, 104_916_400, 54_878);
    }

    function test_highLatitude() public view {
        _check(60_000_000, 10_000_000, 60_000_000, 10_001_000, 55_598);
    }

    function test_southernHemisphere() public view {
        _check(-33_868_800, 151_209_300, -33_868_000, 151_210_000, 109_955);
    }

    function test_acrossAntimeridian() public view {
        _check(0, 179_999_990, 0, -179_999_990, 2_224);
    }

    function test_farPointsShortCircuit() public view {
        assertEq(h.d(0, 0, 1_000_000, 0), type(uint256).max); // ~111 km
        assertEq(h.d(11_562_200, 104_916_000, 11_562_200, 105_916_000), type(uint256).max);
    }

    function testFuzz_symmetricAndNonNegative(int32 lat, int32 lon, int16 dLat, int16 dLon) public view {
        lat = int32(bound(lat, -66_000_000, 66_000_000));
        lon = int32(bound(lon, -179_000_000, 179_000_000));
        int32 lat2 = lat + int32(dLat);
        int32 lon2 = lon + int32(dLon);
        uint256 ab = h.d(lat, lon, lat2, lon2);
        uint256 ba = h.d(lat2, lon2, lat, lon);
        assertApproxEqAbs(ab, ba, 1);
    }

    function testFuzz_monotonicInLatitude(int32 lat, uint16 step) public view {
        lat = int32(bound(lat, -60_000_000, 60_000_000));
        step = uint16(bound(step, 1, 9_000));
        uint256 near = h.d(lat, 0, lat + int32(uint32(step)), 0);
        uint256 far = h.d(lat, 0, lat + int32(uint32(step)) + 100, 0);
        assertGt(far, near);
        // 1 micro-degree of latitude is ~0.1112 m everywhere
        assertApproxEqRel(near, uint256(step) * 111_195 / 1000, 0.001e18);
    }
}
