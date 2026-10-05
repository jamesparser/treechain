# Deployed contracts

> **Not deployed yet.** Deploy from the app's `/#/deploy` page (wallet popups, no key export) or with `forge script script/Deploy.s.sol`, then run `node scripts/write-deployed.mjs`.

| | |
|---|---|
| Network | Monad Testnet (chain id 10143) |
| Deployer / team | _pending_ |
| Verification period | 300 s — **testnet demo clock** (production: 157788000 s = 5 years) |

## Contracts

| Contract | Address | Role |
|---|---|---|
| TreeToken | _pending_ | $Tree (ERC-20) — the single token; mint rights frozen to the three emitters |
| VerifierRegistry | _pending_ | ID gate · verifier ≠ planter · kick |
| TreeNFT | _pending_ | TreeNFT (ERC-721) — geo + photo hash + date; 15 m haversine rule; health record |
| StakingRewards | _pending_ | Stake a TreeNFT → 0.25 $Tree stream while verified-alive |
| VerificationBounty | _pending_ | Peer checks · 0.045 $Tree each · max 10 per tree |
| BurnVault | _pending_ | Burn $Tree → CarbonRetired receipt |

## Proof transactions

| Step | Transaction |
|---|---|
| Plant → TreeNFT mint (+0.25 $Tree) | _add with --plant-tx_ |
| Stake the TreeNFT | _add with --stake-tx_ |
| Peer verification (+0.045 $Tree) | _add with --peer-tx_ |
| Claim staking stream | _add with --claim-tx_ |
| Burn → CarbonRetired receipt | _add with --burn-tx_ |

## Wiring (set once at deploy)

- `TreeToken`: MINTER = TreeNFT, StakingRewards, VerificationBounty · BURNER = BurnVault · admin role **renounced** (minter set frozen)
- `TreeNFT`: CHECKER = VerificationBounty

## Explorers

[MonadScan](https://testnet.monadscan.com) · [MonadVision](https://testnet.monadvision.com) · [Monad Explorer](https://testnet.monadexplorer.com)
