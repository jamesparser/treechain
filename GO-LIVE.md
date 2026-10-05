# Go-live runbook (≈ 45 minutes of your time)

Everything below is ordered. Steps marked **🔑 you** need your wallet, your accounts or your face on camera — nothing else does.

Deadline: portal closes **14 Oct 2026 10:59 GMT+7**. Aim to be *submitted* a day early.

## 0 · What you need open
- Trust Wallet extension with **Monad Testnet** (chain 10143) and the 5 MON burner (`0x549C…CD5F`)
- A **second Trust Wallet account** (the "verifier"): create it in the wallet, send it ~0.5 MON from the burner or the [faucet](https://faucet.monad.xyz). Verification must come from a different wallet than the planter — that's the point of the product.
- Phone with the Trust Wallet browser *or* a laptop (camera + location permission)
- Optional but recommended: a free [Pinata](https://pinata.cloud) account → API key limited to *pinFileToIPFS* + *pinJSONToIPFS* → copy the JWT

## 1 · Put the code on GitHub 🔑
The repo is ready to push as-is (public, MIT, contracts + tests + PWA). If it isn't already on GitHub:

```bash
cd treechain
git remote add origin https://github.com/<you>/treechain.git
git push -u origin main
```
Public repo, or share with `metropolis@hackathon.monad.xyz`.

## 2 · Deploy the app to Vercel 🔑 (5 min)
1. vercel.com → **Add New → Project** → import the repo.
2. **Root Directory: `frontend`** (framework preset: Vite — `vercel.json` already configures it).
3. Environment variables → add `PINATA_JWT` (server-side; never `VITE_`-prefixed). Optional: `VITE_WC_PROJECT_ID`.
4. Deploy. You'll get `https://<name>.vercel.app`. Open it — it shows *"Contracts not deployed yet"*. That's expected.

## 3 · Deploy the contracts from your wallet 🔑 (10 min, 12 popups)
1. Open `https://<name>.vercel.app/#/deploy`.
2. Connect **Trust Wallet** → switch to Monad Testnet when prompted.
3. Leave *Verification period* at **300** (5 minutes = one "5-year" check; a tree's whole 50-year chain = 50 min). Leave the team address blank (= your burner) and *Keep admin* **unchecked**.
4. **Deploy all contracts** → confirm the 12 popups (6 deployments, then wiring). Total is roughly 9M gas — keep ≥ 1 MON in the wallet.
5. When it says **🎉 Deployed**, press **Copy one-line (for Vercel env)**.
6. Vercel → Project → Settings → Environment Variables → add `VITE_DEPLOYMENT_JSON` = *(paste)* → **Redeploy**.
   - Or: paste the pretty JSON into `frontend/src/generated/deployment.json`, commit, push (Vercel redeploys). Either works; the env var needs no commit.
7. Reload the site: the banner now reads *"Testnet demo clock: one verification period = 5 min"*.

Then record the addresses for the repo:
```bash
# if you committed deployment.json
node scripts/write-deployed.mjs --app-url https://<name>.vercel.app
```
(or just paste the addresses into `DEPLOYED.md` by hand — the page lists them in the footer too).

## 4 · Smoke test (5 min) 🔑
On your phone or laptop:
1. **Plant** tab → Register ID (`casey-planter`) → photo → location → confirm placement → **Plant**. You should see *Tree #1 planted*, `0.25 $Tree` in the wallet chip, and a working explorer link.
2. Try planting again at the same spot → the red *"Too close to tree #1"* message appears (that's the 15 m rule — good demo moment).
3. **My trees** → **Stake**.
4. Switch the wallet to the **verifier account** → **Verify** tab → Register ID (`casey-verifier`). After 5 minutes the tree's button turns on → photo + location → **Submit** → `+0.045 $Tree`.
5. Switch back to the planter → **My trees** → **Claim**. **Offset** tab → burn 0.1 → receipt.

Save the transaction hashes from the explorer (plant, stake, verify, claim, burn) and add them to `DEPLOYED.md`:
```bash
node scripts/write-deployed.mjs --app-url https://<name>.vercel.app \
  --plant-tx 0x… --stake-tx 0x… --verify-tx 0x… --claim-tx 0x… --burn-tx 0x…
```

## 5 · Record the two videos 🔑
Scripts, timings and a prep checklist are in [`SUBMISSION.md`](SUBMISSION.md). Technical demo ≤ 3:00 (working product, not slides), pitch ≤ 2:00. Upload to YouTube/Loom/Vimeo (unlisted is fine).

**Prep trick:** plant a tree ~6 minutes *before* you hit record so its first verification is already open on camera.

## 6 · Portal 🔑
`hackathon.monad.xyz/project` → Submission tab: logo (`docs/brand/logo-1024.png`), GitHub URL, live URL, both video links, track, then **Submit**. Also: join the Discord (Monad Developers + Metropolis role) and finish `/profile`. Full checklist in `SUBMISSION.md`.

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| Wallet not listed under *Connect* | Install/enable the Trust Wallet extension, reload. On a phone, open the site inside Trust Wallet's built-in browser. |
| "Switch to Monad Testnet" does nothing | Add the network manually in Trust Wallet (chain id 10143, RPC `https://testnet-rpc.monad.xyz`, symbol MON). |
| Plant says *"Register your ID first"* | One-time ID registration on the Plant tab. Each wallet needs its own handle. |
| Plant says *"Too close to tree #N"* | Working as intended — move ≥ 15 m, or use *manual coordinates* on a laptop. |
| Verify button says *"Opens in …"* | The verification period hasn't elapsed yet (5 min on the demo clock). |
| Camera won't open | Needs https (Vercel is) and camera permission; *Take / choose photo* is the fallback. |
| Metadata says "IPFS pinning not configured" | `PINATA_JWT` isn't set on Vercel. Everything still works; add the key + redeploy for real IPFS pinning. |
| Deploy popup fails on a step | The page lists the step that failed. Re-running *Deploy all* creates a fresh instance (old one is just unused). |
