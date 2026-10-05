// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {Params} from "../src/Params.sol";
import {TreeToken} from "../src/TreeToken.sol";
import {VerifierRegistry} from "../src/VerifierRegistry.sol";
import {TreeNFT} from "../src/TreeNFT.sol";
import {StakingRewards} from "../src/StakingRewards.sol";
import {VerificationBounty} from "../src/VerificationBounty.sol";
import {BurnVault} from "../src/BurnVault.sol";

/// @notice Deploys + wires all six TreeChain contracts and writes frontend/src/generated/deployment.json.
///
///   cast wallet import treechain-burner --interactive          # key stays in an encrypted keystore
///   CHECK_PERIOD_SECONDS=300 forge script script/Deploy.s.sol \
///       --rpc-url monad_testnet --account treechain-burner --broadcast
///
/// Env:
///   CHECK_PERIOD_SECONDS  one verification period (default 157788000 = 5 years; testnet demo: 300)
///   TEAM_ADDRESS          receives the 0.05 $Tree/tree team share (default: deployer)
///   KEEP_TOKEN_ADMIN      set to 1 to keep DEFAULT_ADMIN on $Tree (default: renounced, so the minter set is frozen)
contract Deploy is Script {
    struct Addrs {
        TreeToken token;
        VerifierRegistry registry;
        TreeNFT nft;
        StakingRewards staking;
        VerificationBounty bounty;
        BurnVault vault;
    }

    function run() external {
        uint256 period = vm.envOr("CHECK_PERIOD_SECONDS", Params.PRODUCTION_PERIOD);
        address teamEnv = vm.envOr("TEAM_ADDRESS", address(0));
        bool keepAdmin = vm.envOr("KEEP_TOKEN_ADMIN", uint256(0)) == 1;

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address team = teamEnv == address(0) ? deployer : teamEnv;
        Addrs memory a = _deploy(deployer, team, period, keepAdmin);
        vm.stopBroadcast();

        console.log("TreeToken          ", address(a.token));
        console.log("VerifierRegistry   ", address(a.registry));
        console.log("TreeNFT            ", address(a.nft));
        console.log("StakingRewards     ", address(a.staking));
        console.log("VerificationBounty ", address(a.bounty));
        console.log("BurnVault          ", address(a.vault));
        console.log("period (s)         ", period);

        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _write(a, deployer, team, period);
    }

    function _deploy(address deployer, address team, uint256 period, bool keepAdmin)
        internal
        returns (Addrs memory a)
    {
        a.token = new TreeToken(deployer);
        a.registry = new VerifierRegistry(deployer);
        a.nft = new TreeNFT(a.token, a.registry, team, period, deployer);
        a.staking = new StakingRewards(a.nft, a.token, a.registry);
        a.bounty = new VerificationBounty(a.nft, a.registry, a.token);
        a.vault = new BurnVault(a.token);

        a.token.grantRole(a.token.MINTER_ROLE(), address(a.nft));
        a.token.grantRole(a.token.MINTER_ROLE(), address(a.staking));
        a.token.grantRole(a.token.MINTER_ROLE(), address(a.bounty));
        a.token.grantRole(a.token.BURNER_ROLE(), address(a.vault));
        a.nft.grantRole(a.nft.CHECKER_ROLE(), address(a.bounty));
        if (!keepAdmin) a.token.renounceRole(a.token.DEFAULT_ADMIN_ROLE(), deployer);
    }

    function _write(Addrs memory a, address deployer, address team, uint256 period) internal {
        string memory c = "contracts";
        vm.serializeAddress(c, "TreeToken", address(a.token));
        vm.serializeAddress(c, "VerifierRegistry", address(a.registry));
        vm.serializeAddress(c, "TreeNFT", address(a.nft));
        vm.serializeAddress(c, "StakingRewards", address(a.staking));
        vm.serializeAddress(c, "VerificationBounty", address(a.bounty));
        string memory contractsJson = vm.serializeAddress(c, "BurnVault", address(a.vault));

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "periodSeconds", period);
        vm.serializeAddress(o, "deployer", deployer);
        vm.serializeAddress(o, "team", team);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeString(o, "contracts", contractsJson);
        string memory json = vm.serializeUint(o, "deployedAt", block.timestamp);
        vm.writeJson(json, "./frontend/src/generated/deployment.json");
    }
}
