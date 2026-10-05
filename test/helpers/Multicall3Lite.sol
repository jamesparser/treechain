// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal Multicall3 (aggregate3 only) so the local anvil chain used by e2e/ behaves like Monad, where the real
///      Multicall3 lives at 0xcA11bde05977b3631167028862bE2a173976CA11. The PWA batches its reads through it.
contract Multicall3Lite {
    struct Call3 {
        address target;
        bool allowFailure;
        bytes callData;
    }

    struct Result {
        bool success;
        bytes returnData;
    }

    function aggregate3(Call3[] calldata calls) external payable returns (Result[] memory returnData) {
        uint256 length = calls.length;
        returnData = new Result[](length);
        for (uint256 i = 0; i < length; i++) {
            Result memory r = returnData[i];
            (r.success, r.returnData) = calls[i].target.call(calls[i].callData);
            if (!calls[i].allowFailure && !r.success) {
                assembly {
                    revert(add(mload(add(r, 0x20)), 0x20), mload(mload(add(r, 0x20))))
                }
            }
        }
    }

    function getEthBalance(address addr) external view returns (uint256) {
        return addr.balance;
    }
}
