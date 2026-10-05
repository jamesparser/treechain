# Deployed contracts

| | |
|---|---|
| Network | Monad Testnet (chain id 10143) |
| Live app | https://treechain-pwa.vercel.app |
| Deployer / team | [`0x549Cd30bb83f34e3927462B317A43486CDB2CD5F`](https://testnet.monadscan.com/address/0x549Cd30bb83f34e3927462B317A43486CDB2CD5F) |
| Verification period | 300 s — **testnet demo clock** (production: 157788000 s = 5 years) |
| Deployed | 2026-10-05T07:26:06.000Z · block 68341297 |

## Contracts

| Contract | Address | Role |
|---|---|---|
| TreeToken | [`0xB334901798edC553925a1B01d71daeDAC4D7c5f8`](https://testnet.monadscan.com/address/0xB334901798edC553925a1B01d71daeDAC4D7c5f8) | $Tree (ERC-20) — the single token; mint rights frozen to the three emitters |
| VerifierRegistry | [`0x42F534D10D324EDCb079cc8e1B163BCc9aDcC376`](https://testnet.monadscan.com/address/0x42F534D10D324EDCb079cc8e1B163BCc9aDcC376) | ID gate · verifier ≠ planter · kick |
| TreeNFT | [`0x2cBA14dFeDBf683C9873Fd904AD2FE8ca949EbF1`](https://testnet.monadscan.com/address/0x2cBA14dFeDBf683C9873Fd904AD2FE8ca949EbF1) | TreeNFT (ERC-721) — geo + photo hash + date; 15 m haversine rule; health record |
| StakingRewards | [`0xc931B94Aa83889c0fEf6Ea01d3abc4A4aE71298F`](https://testnet.monadscan.com/address/0xc931B94Aa83889c0fEf6Ea01d3abc4A4aE71298F) | Stake a TreeNFT → 0.25 $Tree stream while verified-alive |
| VerificationBounty | [`0x6909E86D62aEa7C703E870E09dF3BdA3317cFBAC`](https://testnet.monadscan.com/address/0x6909E86D62aEa7C703E870E09dF3BdA3317cFBAC) | Peer checks · 0.045 $Tree each · max 10 per tree |
| BurnVault | [`0x8ECBE0B0516E8ef11273F98053952E5deF4613c3`](https://testnet.monadscan.com/address/0x8ECBE0B0516E8ef11273F98053952E5deF4613c3) | Burn $Tree → CarbonRetired receipt |

## Proof transactions

| Step | Transaction |
|---|---|
| Plant → TreeNFT mint (+0.25 $Tree) | [`0x2625324f187d5c6f34810a34b902eee70353fb39a43f6f4d9e3a8c8eecb49f66`](https://testnet.monadscan.com/tx/0x2625324f187d5c6f34810a34b902eee70353fb39a43f6f4d9e3a8c8eecb49f66) |
| Stake the TreeNFT | [`0xf9d01db754a97a594ccb68909d83b1c328631428dd1e964a01ff0308c5b02260`](https://testnet.monadscan.com/tx/0xf9d01db754a97a594ccb68909d83b1c328631428dd1e964a01ff0308c5b02260) |
| Peer verification (+0.045 $Tree) | [`0x58df4a809a4d7a8e2cefcf4ca25f99b9d50b74f85342edc940ecf8640ffed985`](https://testnet.monadscan.com/tx/0x58df4a809a4d7a8e2cefcf4ca25f99b9d50b74f85342edc940ecf8640ffed985) |
| Claim staking stream | [`0xe19968fb3c54b71828ec481efb6a1734b22876f34aea2bb01a3890827ab590c2`](https://testnet.monadscan.com/tx/0xe19968fb3c54b71828ec481efb6a1734b22876f34aea2bb01a3890827ab590c2) |
| Burn → CarbonRetired receipt | [`0xa2d5a64b230edad70268186e2fc423d19c3a822029612e4ded1328a689de7d59`](https://testnet.monadscan.com/tx/0xa2d5a64b230edad70268186e2fc423d19c3a822029612e4ded1328a689de7d59) |

## Wiring (set once at deploy)

- `TreeToken`: MINTER = TreeNFT, StakingRewards, VerificationBounty · BURNER = BurnVault · admin role **renounced** (minter set frozen)
- `TreeNFT`: CHECKER = VerificationBounty

## Explorers

[MonadScan](https://testnet.monadscan.com) · [MonadVision](https://testnet.monadvision.com) · [Monad Explorer](https://testnet.monadexplorer.com)
