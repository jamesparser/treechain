// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TreeToken} from "./TreeToken.sol";

/// @title BurnVault
/// @notice Businesses retire $Tree here. The tokens are burned permanently and a public receipt is recorded:
///         1 $Tree burned = 1 tonne of CO2 retired. Burning is one transaction (no approval step) because
///         BurnVault is the only holder of TreeToken's BURNER_ROLE and only ever burns `msg.sender`'s balance.
contract BurnVault {
    struct Receipt {
        address buyer;
        uint64 retiredAt;
        uint256 amount;
        string beneficiary;
    }

    TreeToken public immutable token;

    uint256 public totalRetired;
    uint256 public receiptCount;
    mapping(address => uint256) public retiredBy;
    mapping(uint256 => Receipt) private _receipts;

    event CarbonRetired(address indexed buyer, uint256 amount, uint256 indexed receiptId, string beneficiary);

    error ZeroAmount();
    error BeneficiaryTooLong();

    constructor(TreeToken token_) {
        token = token_;
    }

    /// @param amount $Tree to burn (1e18 = 1 tCO2)
    /// @param beneficiary free text: who the offset is claimed for (company, event, product…)
    function retire(uint256 amount, string calldata beneficiary) external returns (uint256 receiptId) {
        if (amount == 0) revert ZeroAmount();
        if (bytes(beneficiary).length > 128) revert BeneficiaryTooLong();

        token.retire(msg.sender, amount);

        receiptId = ++receiptCount;
        totalRetired += amount;
        retiredBy[msg.sender] += amount;
        _receipts[receiptId] = Receipt(msg.sender, uint64(block.timestamp), amount, beneficiary);

        emit CarbonRetired(msg.sender, amount, receiptId, beneficiary);
    }

    function receipt(uint256 receiptId) external view returns (Receipt memory) {
        return _receipts[receiptId];
    }
}
