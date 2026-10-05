// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TreeToken ($Tree)
/// @notice The single TreeChain token. 1 $Tree = 1 tonne CO2 over a tree's 50-year life.
///         There is no pre-mine and no admin mint: supply is only created by the emission
///         contracts (TreeNFT, StakingRewards, VerificationBounty — each hard-capped per tree)
///         and is destroyed only by BurnVault when a business retires carbon.
contract TreeToken is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");

    constructor(address admin) ERC20("Tree", "TREE") {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @dev Only BurnVault holds BURNER_ROLE, and it only ever burns `msg.sender`'s own balance.
    function retire(address from, uint256 amount) external onlyRole(BURNER_ROLE) {
        _burn(from, amount);
    }
}
