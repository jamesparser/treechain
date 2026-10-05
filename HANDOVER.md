# HANDOVER — TreeChain ($Tree) for the Monad Metropolis Hackathon

**To:** Mimo (continuing agent) **From:** Claude (session ended with the owner's subscription) **Date:** 2026-10-05
**Owner:** Casey (solo builder; brief names him "Casey Blanche / @casey-blanche")
**Hard deadline:** portal closes **14 Oct 2026 10:59 GMT+7** (= 04:59 UTC). Aim to be *submitted* a day early.
**Repo state:** two commits on `main` (the project, then this handover), working tree clean. The code is finished and tested **locally**. Nothing has touched Monad Testnet, Vercel, GitHub or the hackathon portal yet.

Read this file first, then `GO-LIVE.md` (ordered runbook), then `SUBMISSION.md` (portal text, video scripts, checklist). `README.md` is the public-facing description and already says everything a judge needs.

---

## 1. TL;DR — what is left

The vertical slice (plant → TreeNFT → $Tree → stake → verify → burn) is built and passes every local test. What remains is **deployment and submission**, and most of it is gated on things only the owner can do (his wallet, his accounts, his face on camera). Your job is to prepare everything so each owner step is a single action, and to do the parts that need no wallet.

| # | Step | Who | Status |
|---|---|---|---|
| 1 | Put repo on GitHub (public, `treechain`, MIT) | owner's account (see §6 decision A) | **todo** |
| 2 | Vercel project: Root Directory `frontend`, env `PINATA_JWT` | owner | **todo** |
| 3 | Deploy 6 contracts to Monad Testnet via `/#/deploy` (12 wallet popups) | **owner signs** | **todo** |
| 4 | Set `VITE_DEPLOYMENT_JSON` (or commit `deployment.json`) → redeploy | you can prepare, owner/Vercel applies | **todo** |
| 5 | Smoke test: plant, same-spot block, stake, verify from 2nd wallet, claim, burn | owner (needs 2 wallets) | **todo** |
| 6 | Capture tx hashes → `node scripts/write-deployed.mjs --…` → commit `DEPLOYED.md` | you | **todo** |
| 7 | Record tech demo (≤3:00) and pitch (≤2:00) videos | **owner on camera**; you supply scripts | **todo** (scripts done) |
| 8 | Portal: logo, GitHub URL, live URL, videos, track, **Submit**; Discord Metropolis role + `/profile` | owner | **todo** |

Everything in `src/`, `test/`, `frontend/`, `script/`, `docs/brand/` and the three guides is done. Do not rebuild; verify and ship.

---

## 2. Hard rules from the owner (preserve verbatim)

- "Monad Testnet (chain 10143) for all submission proof."
- "MIT or Apache 2.0 in repo root. Public repo."
- "Never commit secrets. No seeds/keys in chat or git."
- "No second token."
- "TreeChain is a verification chain on Monad — not a new L1."
- "No IEEE / no dual submission."
- "After deploy, fill DEPLOYED.md with addresses + explorer txs."
- "Do not: IEEE · other hackathons · invent an L1 · add a second token · MetaMask."
- "Wallet type: Trust Wallet Extension (owner refuses MetaMask). Never type seeds. Owner signs tx popups in the wallet; agent prepares deploy scripts."
- Tagline to keep: **"TreeChain: a verification chain, not a blockchain — built on Monad."**
- Accounts (Discord, hackathon portal, etc.) are "already done — do not recreate."
- Burner wallet (public address, 5 MON funded): `0x549Cd30bb83f34e3927462B317A43486CDB2CD5F`.
- Success = **a working vertical slice over a pretty incomplete product**. Don't add features; make the live demo reliable.

Never ask for, type, store or paste a private key or seed phrase. If you use the Foundry deploy path, the owner imports the key into an encrypted keystore on his own machine (`cast wallet import … --interactive`); you only ever reference the keystore *name*.

---

## 3. Product and economics (locked — do not change)

Plant a tree → PWA camera + geolocation + client-side SHA-256 → photo + metadata pinned to IPFS → mint **TreeNFT** (ERC-721) on Monad Testnet → **exactly 1.00 $Tree per tree**:

| Slice | $Tree | When |
|---|---|---|
| Planter upfront | 0.25 | on plant |
| Planter staking | 0.25 | streamed over 50 years **while the staked NFT is verified-alive** |
| Team | 0.05 | on plant |
| Verifiers | 0.45 | 0.045 × 10 checks, one every 5 years |

Businesses burn $Tree in `BurnVault` for a public `CarbonRetired` receipt. One token only. Mint rights are frozen at deploy (token admin renounced).

---

## 4. What exists and how to re-verify it (≈ 5 minutes)

Toolchain: Foundry 1.5.1 (binaries at `~/.foundry/bin` — add to `PATH`), Solidity 0.8.30 (cancun), OpenZeppelin v5.4.0 and forge-std v1.17.0 as git submodules, Node 22+.

```bash
git clone treechain.bundle treechain && cd treechain      # the bundle Casey was given
git submodule update --init --recursive
export PATH="$HOME/.foundry/bin:$PATH"

forge test                                  # expect: 81 tests passed, 0 failed (~13 s)
cd frontend && npm install
npx tsc --noEmit && npm run build           # build ~665 KB JS (~198 KB gzip)
npm run test:api                            # /api/pin unit tests, stubbed Pinata, "7 groups passed"
```

Browser end-to-end (local anvil + headless Chromium + mocked wallet; needs `playwright-core` and `sharp` resolvable via `NODE_PATH`, and a Chromium binary — the scripts default to `/opt/pw-browsers/chromium`; set `CHROME_PATH=/path/to/chrome` if yours differs):

```bash
./e2e/run.sh            # full journey, ~2 min (waits out a 60 s demo period)
./e2e/run.sh deploy     # tests the in-browser /deploy page: 12 txs, role wiring, admin renounced
```

Last results (this session): 81/81 Foundry tests, `tsc` clean, build OK, API tests 7/7, E2E flow **PASSED** (register, plant, "Too close" block, stake, second-wallet verify, self-verify blocked in UI and contract, claim, burn + receipt, no console errors), E2E deploy **PASSED**.

**Important:** both e2e scripts overwrite `frontend/src/generated/deployment.json` with local-chain addresses; `run.sh` restores the placeholder on exit. **The committed file must stay the all-zero placeholder until the real deployment exists** — check with `git diff frontend/src/generated/deployment.json` before every commit.

The private key in `e2e/run.sh` (`0xac09…ff80`) is the publicly known Anvil account #0 test key. It controls nothing real; it is not a leak.

---

## 5. Architecture cheat sheet

**Contracts (`src/`)**

| Contract | Role | Key API |
|---|---|---|
| `TreeToken` | the single ERC-20 `$Tree` | `mint` (MINTER_ROLE: TreeNFT, StakingRewards, VerificationBounty), `retire(from, amount)` (BURNER_ROLE: BurnVault). Admin renounced at deploy unless `KEEP_TOKEN_ADMIN=1`. |
| `VerifierRegistry` | ID gate | `register(bytes32 idHash)`, `isActive`, `sameIdentity`, `kick/reinstate` (KICKER_ROLE) |
| `TreeNFT` | ERC-721 + tree record + health model | `plant(int32 latE6, int32 lonE6, bytes32 imageHash, string metadataURI)`, `previewPlacement(lat, lon)`, `recordCheck(...)` (CHECKER_ROLE = VerificationBounty), `getTree`, `isAlive`, `nextCheckAt`, `coveredUntil`, `reinstate` (admin) |
| `StakingRewards` | stream the planter's 0.25 | stake by `safeTransferFrom(owner, StakingRewards, tokenId)` (one tx), `pending`, `claim`, `unstake`, `stakedTokensOf` |
| `VerificationBounty` | peer checks, 0.045 each | `verify(tokenId, latE6, lonE6, photoHash, evidenceURI, stillAlive)` |
| `BurnVault` | offset receipts | `retire(amount, beneficiary)` → `CarbonRetired(buyer, amount, receiptId, beneficiary)`, `totalRetired`, `retiredBy` |
| `GeoLib` / `Params` | fixed-point haversine; constants | coordinates are `int32` degrees × 1e6, distances in millimetres |

Custom errors the UI decodes: `TooClose(nearestId, distMm)`, `DuplicatePhoto`, `NotRegistered`, `CheckNotDue(dueAt)`, `SelfVerification`, `SameVerifierTwice`, `TooFarFromTree(distMm)`, `AllChecksDone`, `TreeNotAlive`.

**Health model:** check *n* opens at `plantedAt + n × period`. `coveredUntil = plantedAt + min(10, checks+1) × period` for living trees. The staking stream pauses without verification and unlocks retroactively on a late check. A "dead" report freezes the stream (max exposure one period = 0.025 $Tree) and still pays the verifier. Verifier must be within 50 m, photo hashes are globally unique, the same verifier can't check twice in a row, admin can `reinstate`.

**Demo clock:** `CHECK_PERIOD_SECONDS` is the verification period. Production = 157,788,000 s (5 years). Testnet deploy uses **300 s** so a whole lifecycle can be shown live; the app shows a banner whenever the period is under a day.

**Frontend (`frontend/`)**: React 19 + Vite 6 + TS, wagmi 2 + viem 2, EIP-6963 wallet discovery (Trust Wallet shows as "Trust Wallet"), optional WalletConnect via `VITE_WC_PROJECT_ID`, vite-plugin-pwa, hash-router tabs (Plant · My trees · Verify · Offset), `#/deploy` page for in-browser deployment. Reads batch through Multicall3. Every write is simulate-then-send with custom-error decoding (`src/hooks.ts`).

**Which deployment file wins at runtime:** `localStorage` (written by `/#/deploy`) > `VITE_DEPLOYMENT_JSON` env var > committed `src/generated/deployment.json`. Placeholder (zero addresses) shows "Contracts not deployed yet".

**IPFS:** `frontend/api/pin.ts` (Vercel function) pins photo + ERC-721 metadata to Pinata with `PINATA_JWT` (server-side only, never `VITE_`). It re-hashes the photo and rejects mismatches. If the function is missing (501/404) the client falls back to an on-chain `data:application/json;base64` URI — still a working mint, photo hash only, no photo.

**Regenerating ABIs/bytecode** after any contract change: `forge build && node scripts/export-abi.mjs` (writes `frontend/src/generated/abis.ts` + `bytecode.json`). Don't change contracts unless a real bug appears; if you do, rerun everything in §4 **and** redeploy.

---

## 6. Decisions and inputs the owner still has to supply

Ask Casey (one message, all at once) for:

- **A. GitHub account.** The session's GitHub login was `node0datasystems-lgtm`; the brief says the repo goes under `@casey-blanche`. Which account should be public-facing? (Repo name `treechain`, public, MIT already in `LICENSE`. Alternatively keep it private and share with `metropolis@hackathon.monad.xyz`.)
- **B. Primary track.** The portal currently shows *Onchain Finance & Trading*. The portal's track list was not in the brief; the story is real-world-asset / climate carbon infrastructure, so a closer track may fit better. His call.
- **C. Pinata JWT.** Optional, recommended: free Pinata account → API key limited to `pinFileToIPFS` + `pinJSONToIPFS` → set as `PINATA_JWT` in Vercel. Without it, everything works but photos are not on IPFS.
- **D. Second wallet.** A second Trust Wallet account ("verifier") with ~0.5 MON. Verification must come from a different wallet than the planter; that is the product's point.
- **E. Pitch intro.** The pitch script has a placeholder line, *"[one line of your background]"*. He supplies it.
- **F. Team address.** Blank in the deploy page = the deployer (his burner). Confirm that's what he wants for the 0.05 team slice.

---

## 7. UNVERIFIED — check these first once you have network access

The previous session's sandbox could **not** reach `testnet-rpc.monad.xyz`, Vercel, or the portal. Everything below was assumed from the owner's brief or from documentation recalled from memory, and was only tested against a local anvil chain. Verify before you rely on it:

1. **RPC endpoints** in `frontend/src/wagmi.ts`: `https://testnet-rpc.monad.xyz`, `https://rpc-testnet.monadinfra.com`, `https://rpc.ankr.com/monad_testnet`. Confirm each answers `eth_chainId` = `0x279f` (10143). Drop any that don't.
2. **Multicall3 on Monad Testnet** at the canonical `0xcA11bde05977b3631167028862bE2a173976CA11`: run `cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://testnet-rpc.monad.xyz`. If empty, the app's batched reads (`useReadContracts`) will fail; fix by setting `batch.multicall: false` or deploying Multicall3.
3. **Block-explorer base URL.** The app and `scripts/write-deployed.mjs` use `https://testnet.monadscan.com` (`/tx/…`, `/address/…`, `/nft/<contract>/<id>`). Confirm those URL shapes resolve, or switch to whichever explorer the Monad docs list. `DEPLOYED.md` links are generated from this.
4. **Monad gas semantics.** Monad charges by *gas limit*, not gas used. The app simulates then sends with the node's estimate; the in-browser deployer sends 12 txs. Watch for "insufficient funds" or over-charging on the first real deploy (≈ 9M gas total; keep ≥ 1 MON in the wallet).
5. **Trust Wallet in a real browser.** Wallet discovery, "Switch to Monad Testnet" (`wallet_addEthereumChain`/`wallet_switchEthereumChain`), and the popups were tested only against a mocked EIP-6963 wallet. Expect to debug here first.
6. **Real phone camera and GPS.** E2E used Chromium's fake video device and mocked geolocation. Test `getUserMedia` + `watchPosition` on an actual phone over https (Vercel gives https). Manual-coordinates override exists for laptops.
7. **Pinata path.** Tested against a stubbed Pinata only. First real pin may expose limits (file size cap in the function is 1.5 MB; client downscales photos).
8. **PWA install / service worker** on Vercel and `vercel.json` (SPA rewrite, `Permissions-Policy: camera, geolocation`, `api/pin` maxDuration 30). Built, never deployed.
9. **Marketing numbers** in the README/SUBMISSION GTM text (ARR $15–45, blue carbon $30–75, REDD+ $4–15, ICVCM $15–30, EU ETS ~$80–100+) come straight from the owner's brief and were **not independently verified**. They are labelled indicative. Check or soften before quoting them in a video.

If any of 1–3 turns out wrong, it is a one-line fix in `frontend/src/deployment.ts`, `frontend/src/wagmi.ts` or `scripts/write-deployed.mjs`.

---

## 8. Deviations from the brief (all deliberate; mention if a judge asks)

- **Verifier ID registry is a mapping** (`VerifierRegistry`), not a soulbound NFT. Same enforcement (one ID per wallet, kickable), less surface area.
- **Extra anti-fraud rule:** verifier must be within **50 m** of the tree (same haversine).
- **Check *n* opens at `n × period`** after planting (check 1 after one period, not at plant time).
- **Testnet demo clock** (300 s period) — disclosed in the app banner, README, DEPLOYED.md and the video scripts.
- **A dead report still pays the verifier** (they did the work); it freezes the planter's stream.
- **Token admin renounced** at deploy so the minter set is frozen. Use `KEEP_TOKEN_ADMIN=1` only if the owner wants admin keys for the demo.
- **Spatial grid** limits the 15 m rule to |lat| ≤ 66°; fine for the target regions, listed under README "Known limitations".

---

## 9. Recommended order of operations for you

1. Re-verify §4 on whatever machine you run on. Fix environment issues, not code.
2. Resolve §7 items 1–3 with three `cast` calls; patch if needed; rerun `npm run build`; commit.
3. Send Casey the §6 questions in one message.
4. Get the repo public (GO-LIVE §1). Confirm `git ls-files | grep -E "\.env$|node_modules|dist/"` is empty.
5. Vercel import (Root Directory `frontend`). Confirm the page loads and says "Contracts not deployed yet".
6. Walk Casey through `/#/deploy` (GO-LIVE §3). He signs; you watch the page's step list. When it says "Deployed", set `VITE_DEPLOYMENT_JSON` and redeploy, or commit `deployment.json`.
7. Smoke test with him (GO-LIVE §4), collecting five tx hashes. Then:
   `node scripts/write-deployed.mjs --app-url https://<name>.vercel.app --plant-tx 0x… --stake-tx 0x… --verify-tx 0x… --claim-tx 0x… --burn-tx 0x…`
   Commit `DEPLOYED.md`. (Requirement: addresses + explorer txs.)
8. Coach the recordings from `SUBMISSION.md` (plant a tree ~6 min before recording so check #1 is already open). Upload as unlisted YouTube/Loom/Vimeo.
9. Fill the portal with the owner (logo `docs/brand/logo-1024.png`, 1024 px / 74 KB, ≥500 px ≤2 MB ✔; description text and GTM are pre-written in `SUBMISSION.md`, ~441 words, inside the 300–500 requirement). Choose track. **Click Submit** a day early. Discord: Monad Developers + Metropolis role, `/profile` complete.

Submit-gate reminder from the brief: logo ✔ (done), name/one-liner/description/GTM ✔ (drafted), GitHub URL, live URL, tech demo video ≤3 min, pitch video ≤2 min, primary track, Submit.

---

## 10. Gotchas learned the hard way

- `forge` isn't on `PATH` in fresh shells: `export PATH="$HOME/.foundry/bin:$PATH"`.
- Never `pkill -f "<pattern>"` inside the same command line that contains the pattern; it kills your own shell. Use PIDs or `pgrep -x`.
- `forge test` invariant depth/runs are tuned low (`foundry.toml`: runs 48, depth 120) to keep CI fast; deeper soak: `FOUNDRY_INVARIANT_RUNS=256 FOUNDRY_INVARIANT_DEPTH=500 forge test`.
- The e2e uses integer JSON-RPC ids and etches `Multicall3Lite` into anvil because the app batches reads; both are in `e2e/run.sh`.
- After editing `frontend/src/styles.css`/UI text, rerun `./e2e/run.sh` — selectors use `data-testid`s.
- `.env`, `.env.*` are gitignored (except `.env.example`). Keep it that way; no secrets in git or chat.
- Don't use ImageMagick `convert` for the SVG logo (no rsvg); `docs/brand/logo-*.png` are already rendered.
- Monad docs/explorer details may have changed since this was written; trust live responses over this file.

---

## 11. File map

```
HANDOVER.md        this file
README.md          public description, architecture, tests, quick start
GO-LIVE.md         ordered deploy-and-submit runbook (marks owner-only steps)
SUBMISSION.md      checklist, portal text, GTM, demo-video script, pitch script, judge notes
DEPLOYED.md        placeholder now; regenerate with scripts/write-deployed.mjs after deploy
LICENSE            MIT
src/ test/ script/ Solidity, 81 Foundry tests, Deploy.s.sol
frontend/          PWA + api/pin.ts + vercel.json + .env.example
e2e/               Playwright-core browser tests against local anvil
scripts/           export-abi.mjs, write-deployed.mjs
docs/brand/        logo.svg, logo-512.png, logo-1024.png
```

Original brief (the owner's, on his Mac): `/Users/terminal/XiaomiMiMoProjects/.mimo-sessions/2026/10/02/new-hackathon-placeholder-monad-metropolis-hackathon/` — `HANDOVER_PROMPT.md`, `monad-metropolis-hackathon-brief.md`, `pre-submission-checklist.md`, `DEPLOYED.md`. If anything here conflicts with those files, the owner's brief wins; tell him about the conflict.

Commit that this handover describes: `a2a053f` ("TreeChain ($Tree): verification chain for trees, built on Monad").
