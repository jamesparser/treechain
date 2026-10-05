// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title VerifierRegistry
/// @notice Identity gate for planters and verifiers. Each person registers one ID hash; an ID hash
///         can be bound to exactly one account, so "verifier != planter" holds by account AND by ID.
///         Cheaters can be kicked (freezes planting, verifying and staking claims).
/// @dev    On testnet the ID hash is self-asserted. Mainnet swaps `register` for a proof-of-personhood
///         attestation; every other contract only talks to `isActive` / `idOf`.
contract VerifierRegistry is AccessControl {
    bytes32 public constant KICKER_ROLE = keccak256("KICKER_ROLE");

    mapping(address => bytes32) public idOf;
    mapping(bytes32 => address) public holderOfId;
    mapping(address => bool) public kicked;

    event Registered(address indexed account, bytes32 indexed idHash);
    event Kicked(address indexed account, string reason);
    event Reinstated(address indexed account);

    error AlreadyRegistered();
    error IdTaken();
    error EmptyId();
    error NotRegistered();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(KICKER_ROLE, admin);
    }

    function register(bytes32 idHash) external {
        if (idHash == bytes32(0)) revert EmptyId();
        if (idOf[msg.sender] != bytes32(0)) revert AlreadyRegistered();
        if (holderOfId[idHash] != address(0)) revert IdTaken();
        idOf[msg.sender] = idHash;
        holderOfId[idHash] = msg.sender;
        emit Registered(msg.sender, idHash);
    }

    function isActive(address account) public view returns (bool) {
        return idOf[account] != bytes32(0) && !kicked[account];
    }

    /// @return true when both accounts are the same person (same account, or same ID hash).
    function sameIdentity(address a, address b) external view returns (bool) {
        if (a == b) return true;
        bytes32 ida = idOf[a];
        return ida != bytes32(0) && ida == idOf[b];
    }

    function kick(address account, string calldata reason) external onlyRole(KICKER_ROLE) {
        if (idOf[account] == bytes32(0)) revert NotRegistered();
        kicked[account] = true;
        emit Kicked(account, reason);
    }

    function reinstate(address account) external onlyRole(KICKER_ROLE) {
        kicked[account] = false;
        emit Reinstated(account);
    }
}
