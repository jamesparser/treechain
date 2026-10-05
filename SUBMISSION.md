# Submission kit — Monad Metropolis Hackathon

Portal: <https://hackathon.monad.xyz/project> → **Submission** tab · closes **14 Oct 2026 10:59 GMT+7**

## Required checklist

| ✔ | Item | Where / value |
|---|---|---|
| ☐ | **Logo** PNG ≥ 500 px, ≤ 2 MB | `docs/brand/logo-1024.png` (1024 px, 74 KB) · also `logo-512.png` |
| ☑ | Name · one-liner · description · GTM | already filled — optional refresh text below |
| ☐ | **GitHub URL** (public, or shared with `metropolis@hackathon.monad.xyz`) | repo contains contracts (`src/`) + tests (`test/`) + PWA (`frontend/`) + **MIT** `LICENSE` ✔ |
| ☐ | **Live product URL** (runs on Monad Testnet) | your Vercel URL after [GO-LIVE.md](GO-LIVE.md) step 3 |
| ☐ | **Technical demo video** ≤ 3 min | script below |
| ☐ | **Pitch video** ≤ 2 min | script below |
| ☐ | **Primary track** | currently *Onchain Finance & Trading* (changeable) — see note below |
| ☐ | **Click Submit** | before the deadline |
| ☐ | Discord: Monad Developers + Metropolis role · `/profile` complete | dashboard |

> **Track note.** Your call — the portal's track list isn't in the brief. The story is real-world-asset / climate carbon-credit infrastructure; if there is a track closer to that than *Onchain Finance & Trading*, it fits better. The burn-for-offset market is the finance angle if you keep the current one.

---

## One-liner (refresh)

> Plant a tree, mint a TreeNFT, earn $Tree — businesses burn it for an on-chain carbon offset, backed by a 50-year peer-verification chain on Monad.

## Description / write-up (portal text, ~430 words)

**TreeChain ($Tree): a verification chain for trees — built on Monad.**

**The problem.** Tree-planting carbon credits have a trust problem. The same forest gets sold twice, photos get recycled, and nobody checks whether a tree is still alive in year five. Buyers can't audit what they're buying.

**What we built.** Every tree planted through the TreeChain app becomes a TreeNFT (ERC-721). The PWA takes a live photo, reads GPS, hashes the photo with SHA-256 in the browser, and pins the photo plus (lat, long, timestamp, image hash) to IPFS. The contract stores the coordinates and image hash on-chain and enforces the anti-fraud rules itself: an on-chain haversine rejects any tree within 15 m of another (no double-counting, no GPS-noise duplicates), every photo hash can be used only once, and planters and verifiers must hold an ID, with a verifier never allowed to be the planter (checked by wallet and by ID).

**The 50-year verification chain.** A tree isn't worth a credit the day it's planted. Ten peer checks, one every five years, keep it alive on-chain. Verifiers photograph the tree on location (the contract checks they're within 50 m) and report alive or dead. A failed check ends the chain and freezes the planter's rewards.

**One token, exactly 1.00 $Tree per tree.** 0.25 to the planter when they plant, 0.25 streamed to the planter while the staked TreeNFT stays verified-alive, 0.05 to the team, and 0.45 to verifiers (10 × 0.045). There is no pre-mine: supply only exists when trees do, and the mint rights are frozen at deploy. 1 $Tree = 1 tCO₂ over the tree's 50 years. Businesses buy $Tree and burn it in BurnVault, which records a public CarbonRetired receipt, an offset you can audit back to a photo, a coordinate and ten verifications.

**Why Monad.** Planting and verifying happen in the field, on phones, often by people who have never used a chain. Sub-second finality means the "Tree planted" screen confirms before they put the phone away, and low gas keeps a 0.045 $Tree verification reward worth claiming. EVM equivalence meant standard Solidity, Foundry and wagmi/viem, and Trust Wallet works out of the box.

**What's live.** Six contracts on Monad Testnet (TreeToken, TreeNFT, VerifierRegistry, StakingRewards, VerificationBounty, BurnVault); 81 Foundry tests including stateful invariants and a full 50-year lifecycle that mints exactly 1.00 $Tree; and a PWA covering plant → stake → verify → burn, tested end to end in a real browser. *Testnet note: the verification period is compressed from five years to minutes so judges can watch the whole chain run; mainnet uses five years.*

TreeChain: a verification chain, not a blockchain — built on Monad.

## GTM (refresh, if you want it)

Start where trust is scarcest and trees are cheapest: reforestation and urban-greening programs in Southeast Asia (NGOs, municipalities, schools) who already photograph and geotag plantings but sell into opaque registries. They plant with the PWA; local verifiers earn $Tree for peer checks. Demand side: SMEs and event organisers who want a small, auditable, per-tonne offset they can show customers — `CarbonRetired` receipts are public and link back to every photo. Land with free planting + verification, monetise via the 0.05 team slice per tree and (later) a fee on offset retirements and enterprise reporting. Unit context: 1 tree = 1 tCO₂ over 50 years = 1 $Tree, positioned against ARR credits ($15–45), blue carbon ($30–75), REDD+ ($4–15), ICVCM-labelled ($15–30) and EU ETS (~$80–100+) — indicative ranges from the brief; verify before quoting.

---

## Technical demo video — ≤ 3:00 (working product, not slides)

**Prep (≈ 10 min before recording)** — see GO-LIVE.md step 4 for the smoke test.
- Two Trust Wallet accounts open: **Planter** and **Verifier**, both with IDs registered and some MON.
- **Plant "Tree #1" ~6 minutes before you hit record** so its first verification (5 min on the demo clock) is already open. Stake it.
- Phone mirrored/recorded or browser window at ~430 px wide; location + camera allowed; notifications off.
- Have the explorer open in a second tab on the TreeNFT contract.

| Time | On screen | Say |
|---|---|---|
| 0:00–0:30 | Landing: header strip (trees planted · $Tree · tCO₂ retired), demo-clock banner | "Carbon offsets from tree planting have a fraud problem: double-sold forests, recycled photos, and nobody checking if the tree is still alive in year five. TreeChain makes every tree an on-chain record with a 50-year verification chain — built on Monad. This is the live testnet app." |
| 0:30–1:10 | **Plant** tab: take photo → GPS fix + green "spot is free" → tick placement → **Plant** → wallet confirm → *Tree #1 planted* card, **0.25 $Tree** chip updates | "I photograph the tree. The browser hashes the photo, pins it with the GPS and date to IPFS, and mints a TreeNFT. Finality is sub-second — that's already confirmed, and 0.25 $Tree is in my wallet." |
| 1:10–1:25 | Plant again at the same spot → red **Too close to tree #1** | "The contract rejects any tree within 15 metres of another — no double counting." |
| 1:25–1:45 | **My trees** → **Stake** → pending ticks up → **Claim** | "Staking the NFT streams the planter's other 0.25 $Tree over 50 years — but only while the tree stays verified alive." |
| 1:45–2:00 | Switch to **Verifier** wallet → **Verify** tab → camera → submit | "A different person — different wallet, different ID — has to stand within 50 metres, take a fresh photo, and confirm it's alive. They earn 0.045 $Tree. Ten checks, one every five years. This demo runs on a compressed clock." |
| 2:00–2:30 | **Offset** tab → burn 0.1 → receipt; then explorer: mint tx, TreeNFT contract, `CarbonRetired` event | "A business burns $Tree and gets a public CarbonRetired receipt — auditable all the way back to a photo, a coordinate and ten verifications. Here it is on the explorer: the mint, the contracts, the retirement." |
| 2:30–3:00 | Repo page: `src/`, `test/`, tests passing | "Six contracts, 81 Foundry tests including a full 50-year lifecycle that mints exactly 1.00 $Tree, and a browser test suite. TreeChain — a verification chain, not a blockchain, built on Monad." |

Tips: keep the explorer hop to ~20 s; trim wallet-popup dead time in editing; say "testnet demo clock" once so judges aren't misled.

## Pitch video — ≤ 2:00 (≈ 260 words at a natural pace)

> **[0:00]** Hi, I'm Casey Blanche — a crypto and AI builder who's been in the space since 2017. I built TreeChain because planting trees is one of the simplest ways to help the planet, and on-chain proof can finally make people trust — and get rewarded for — doing the right thing.
>
> **[0:10]** Tree-planting carbon credits have a trust problem. Forests get sold twice. Photos get recycled. And once a tree is planted, nobody checks if it's still alive five years later. So buyers can't audit what they buy, and honest planters get paid the same as fraudsters.
>
> **[0:35]** TreeChain fixes that with a verification chain. Every tree is a TreeNFT with a geotagged photo hash, minted from a phone. The contract itself rejects trees within fifteen metres of each other, rejects reused photos, and won't let a planter verify their own tree. Then ten peer checks, one every five years, keep that tree alive on-chain for fifty years. A failed check stops the rewards.
>
> **[1:00]** There's one token, $Tree, and exactly one per tree: a quarter to the planter up front, a quarter streamed while the tree stays verified, five percent to the team, and forty-five percent to the people who verify. No pre-mine. Businesses buy $Tree and burn it for a public carbon-retirement receipt. One $Tree is one tonne of CO₂.
>
> **[1:30]** Why Monad? Planting and verifying happen in the field, on phones, by people new to crypto. Sub-second finality and cheap gas make a small verification reward actually worth claiming, and full EVM compatibility meant I could ship six audited-pattern contracts, eighty-one tests, and a mobile app solo.
>
> **[1:50]** TreeChain: a verification chain, not a blockchain — built on Monad. Thanks for watching.

## Judge access notes (optional field)

- Live app: *(Vercel URL)* — Monad Testnet. Use any EVM wallet with testnet MON (faucet.monad.xyz). First action in each wallet is a one-time ID registration.
- To see a full lifecycle quickly: plant with wallet A, switch to wallet B, verify after 5 minutes (demo clock), claim as A, burn as either. Or read `e2e/` — the browser test does exactly this against a local chain.
- Contracts + proof transactions: `DEPLOYED.md`. Tests: `forge test`.
