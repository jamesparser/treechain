// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title GeoLib
/// @notice Integer-only haversine for short distances.
///         Coordinates are degrees * 1e6 (int32, ~11 cm resolution). Distances are returned in millimetres.
///         The haversine is evaluated exactly (fixed-point, 1e18) using Taylor series for sin / cos / asin.
///         The series are only accurate for nearby points, so points outside a ~2 km bounding box are
///         short-circuited to `FAR` — which is all the protocol needs (15 m and 50 m thresholds).
library GeoLib {
    uint256 internal constant FAR = type(uint256).max;

    int256 private constant WAD = 1e18;
    int256 private constant PI_WAD = 3_141592653589793238;
    uint256 private constant EARTH_RADIUS_MM = 6_371_008_800; // mean radius 6,371,008.8 m
    int256 private constant BBOX_E6 = 20_000; // 0.02 degrees ~ 2.2 km

    /// @return distance in millimetres, or `FAR` if the points are more than ~2 km apart.
    function distanceMm(int32 lat1E6, int32 lon1E6, int32 lat2E6, int32 lon2E6) internal pure returns (uint256) {
        int256 dLat = int256(lat2E6) - int256(lat1E6);
        int256 dLon = int256(lon2E6) - int256(lon1E6);
        // shortest way around the antimeridian
        if (dLon > 180_000_000) dLon -= 360_000_000;
        else if (dLon < -180_000_000) dLon += 360_000_000;
        if (dLat > BBOX_E6 || dLat < -BBOX_E6 || dLon > BBOX_E6 || dLon < -BBOX_E6) return FAR;

        int256 sinHalfLat = _sin(_rad(dLat) / 2);
        int256 sinHalfLon = _sin(_rad(dLon) / 2);
        int256 cosProduct = (_cos(_rad(int256(lat1E6))) * _cos(_rad(int256(lat2E6)))) / WAD;

        // a = sin^2(dLat/2) + cos(lat1) cos(lat2) sin^2(dLon/2)
        int256 a = (sinHalfLat * sinHalfLat) / WAD + (cosProduct * ((sinHalfLon * sinHalfLon) / WAD)) / WAD;
        if (a < 0) a = 0;

        uint256 root = Math.sqrt(uint256(a) * uint256(WAD)); // sqrt(a), 1e18-scaled
        // d = 2 R asin(sqrt(a))
        return (2 * EARTH_RADIUS_MM * _asin(root)) / uint256(WAD);
    }

    /// degrees*1e6 -> radians*1e18
    function _rad(int256 degE6) private pure returns (int256) {
        return (degE6 * PI_WAD) / 180_000_000;
    }

    /// sin(x), x in radians*1e18, |x| <= ~1.6 (series to x^11)
    function _sin(int256 x) private pure returns (int256 sum) {
        int256 x2 = (x * x) / WAD;
        int256 term = x;
        sum = x;
        for (uint256 n = 0; n < 5; n++) {
            term = (-term * x2) / (WAD * int256((2 * n + 2) * (2 * n + 3)));
            sum += term;
        }
    }

    /// cos(x), x in radians*1e18, |x| <= ~1.3 (series to x^14)
    function _cos(int256 x) private pure returns (int256 sum) {
        int256 x2 = (x * x) / WAD;
        int256 term = WAD;
        sum = WAD;
        for (uint256 n = 0; n < 7; n++) {
            term = (-term * x2) / (WAD * int256((2 * n + 1) * (2 * n + 2)));
            sum += term;
        }
    }

    /// asin(x), x in [0, ~0.01]*1e18 (series to x^9)
    function _asin(uint256 x) private pure returns (uint256 sum) {
        uint256 x2 = (x * x) / uint256(WAD);
        uint256 term = x;
        sum = x;
        for (uint256 n = 0; n < 4; n++) {
            term = (term * x2 * ((2 * n + 1) * (2 * n + 1))) / (uint256(WAD) * ((2 * n + 2) * (2 * n + 3)));
            sum += term;
        }
    }
}
