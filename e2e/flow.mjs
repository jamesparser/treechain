#!/usr/bin/env node
// Full-stack browser test: real Chromium (fake camera + mocked GPS) drives the real PWA against a local anvil
// deployment through an EIP-6963 "Trust Wallet" mock that signs with anvil's dev accounts.
//   Journey: register → plant → 15 m rejection → stake → peer-verify with a 2nd wallet → claim → self-verify blocked → burn.
// Run via e2e/run.sh (it boots anvil, deploys, builds and serves the app).
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core'); // CJS require honours NODE_PATH

const APP = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const RPC = 'http://127.0.0.1:8545';
const SHOTS = process.env.SHOTS_DIR ?? new URL('./screenshots/', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
mkdirSync(SHOTS, { recursive: true });

const ALICE = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'; // anvil #1 — planter
const BOB = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'; // anvil #2 — verifier
const dep = JSON.parse(readFileSync(new URL('../frontend/src/generated/deployment.json', import.meta.url)));
const C = dep.contracts;

const cast = (...a) => execFileSync(process.env.CAST ?? 'cast', a, { encoding: 'utf8' }).trim();
const chainRaw = (to, sig, ...args) => cast('call', to, sig, ...args, '--rpc-url', RPC);
const chainCall = (to, sig, ...args) => chainRaw(to, sig, ...args).split(' ')[0];

let sharp;
try { sharp = require('sharp'); } catch { sharp = null; }
let photoN = 0;
async function jpeg() {
  // unique bytes every time (the contract rejects a photo hash used twice)
  const n = ++photoN;
  const r = (n * 53) % 255, g = (n * 97) % 255, b = (n * 193) % 255;
  if (!sharp) throw new Error('sharp is required to synthesize test photos (npm i sharp)');
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r, g, b } } }).jpeg().toBuffer();
}

const mockWallet = ({ account, rpc }) => {
  let current = account;
  let rpcId = 0;
  let authorized = false; // like a real wallet: no accounts until the site is approved
  const listeners = {};
  const call = async (method, params = []) => {
    const res = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
    const j = await res.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
    return j.result;
  };
  const provider = {
    isTrust: true,
    request: async ({ method, params }) => {
      try { return await handle({ method, params }); } catch (e) { console.log(`[wallet] ${method} FAILED: ${e.message}`); throw e; }
    },
    on: (e, f) => { (listeners[e] ||= []).push(f); },
    removeListener: (e, f) => { listeners[e] = (listeners[e] || []).filter((x) => x !== f); },
  };
  const handle = async ({ method, params }) => {
      console.log(`[wallet] ${method}`);
      switch (method) {
        case 'eth_requestAccounts': authorized = true; return [current];
        case 'eth_accounts': return authorized ? [current] : [];
        case 'eth_chainId': return '0x7a69';
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain': return null;
        case 'wallet_getPermissions':
        case 'wallet_requestPermissions': return [{ parentCapability: 'eth_accounts' }];
        case 'eth_sendTransaction': return call('eth_sendTransaction', [{ ...params[0], from: current }]);
        default: return call(method, params);
      }
  };
  window.__setAccount = (a) => { current = a; (listeners.accountsChanged || []).forEach((f) => f([a])); };
  const info = { uuid: 'e2e-trust-wallet', name: 'Trust Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', rdns: 'com.trustwallet.app' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
};

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✓' : '  ✗ FAIL:'} ${msg}`); if (!cond) failures++; };
const step = (s) => console.log(`\n▶ ${s}`);

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--no-sandbox'],
});
const ctx = await browser.newContext({
  viewport: { width: 430, height: 900 },
  geolocation: { latitude: 11.5622, longitude: 104.916, accuracy: 8 },
  permissions: ['geolocation', 'camera'],
});
await ctx.addInitScript(mockWallet, { account: ALICE, rpc: RPC });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (process.env.DEBUG && m.text().startsWith('[wallet]')) console.log('   ', m.text()); if (m.type() === 'error' && !/favicon|Failed to load resource.*(404|api\/pin)/.test(m.text())) consoleErrors.push(m.text()); });
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const txt = (testid) => page.getByTestId(testid).innerText();

try {
  step('load app, connect "Trust Wallet" (EIP-6963)');
  await page.goto(APP);
  await page.getByTestId('demo-clock').waitFor({ timeout: 20_000 });
  ok(true, 'demo-clock banner shown (period < 1 day)');
  await page.getByTestId('connect-Trust Wallet').click();
  await page.getByTestId('account').waitFor();
  ok((await txt('account')).toLowerCase().startsWith('0x7099'), 'connected as alice');
  await shot('01-connected-needs-id');

  step('register ID (planter)');
  await page.getByTestId('id-handle').fill('alice-planter');
  await page.getByTestId('register').click();
  await page.getByTestId('plant').waitFor({ timeout: 30_000 });
  ok(true, 'ID registered → plant screen unlocked');

  step('plant: photo + GPS + placement');
  await page.getByTestId('photo-input').setInputFiles({ name: 'tree.jpg', mimeType: 'image/jpeg', buffer: await jpeg() });
  await page.locator('.photo img').waitFor();
  await page.getByTestId('gps-coords').waitFor({ timeout: 15_000 });
  ok((await txt('gps-coords')).includes('11.562200, 104.916000'), 'GPS fix shown');
  await page.getByTestId('placement').waitFor();
  ok((await txt('placement')).includes('Spot is free'), 'live pre-check: spot is free');
  await page.getByTestId('confirm-placement').check();
  await shot('02-plant-ready');
  await page.getByTestId('plant').click();
  await page.getByText('Tree #1 planted').waitFor({ timeout: 40_000 });
  ok(true, 'TreeNFT #1 minted');
  await shot('03-planted');
  ok(chainCall(C.TreeNFT, 'ownerOf(uint256)(address)', '1').toLowerCase() === ALICE.toLowerCase(), 'on-chain: alice owns tree #1');
  ok(chainCall(C.TreeToken, 'balanceOf(address)(uint256)', ALICE).startsWith('250000000000000000'), 'on-chain: alice holds 0.25 $Tree');
  ok(chainCall(C.TreeToken, 'balanceOf(address)(uint256)', dep.team).startsWith('50000000000000000'), 'on-chain: team holds 0.05 $Tree');
  ok(chainCall(C.TreeNFT, 'tokenURI(uint256)(string)', '1').includes('data:application/json;base64'), 'metadata fallback used (no /api/pin in preview)');

  step('15 m rule: planting again at the same spot is blocked in the UI');
  await page.getByText('Plant another').click();
  await page.getByTestId('photo-input').setInputFiles({ name: 'tree2.jpg', mimeType: 'image/jpeg', buffer: await jpeg() });
  await page.getByTestId('placement').waitFor();
  const placement = await txt('placement');
  ok(placement.includes('Too close to tree #1'), `placement error shown: "${placement.slice(0, 60)}…"`);
  await page.getByTestId('confirm-placement').check();
  ok(await page.getByTestId('plant').isDisabled(), 'plant button disabled while too close');
  await shot('04-too-close');

  step('stake the tree (one tx: safeTransferFrom → StakingRewards)');
  await page.getByTestId('tab-trees').click();
  await page.getByTestId('stake-1').click();
  await page.getByTestId('claim-1').waitFor({ timeout: 40_000 });
  ok(chainCall(C.TreeNFT, 'ownerOf(uint256)(address)', '1').toLowerCase() === C.StakingRewards.toLowerCase(), 'NFT now escrowed in StakingRewards');
  await shot('05-staked');

  step('wallet switch → bob registers and waits for check #1 to open');
  await page.evaluate((a) => window.__setAccount(a), BOB);
  await page.waitForFunction(() => document.querySelector('[data-testid=account]')?.textContent?.toLowerCase().startsWith('0x3c44'));
  await page.getByTestId('tab-verify').click();
  await page.getByTestId('id-handle').fill('bob-verifier');
  await page.getByTestId('register').click();
  await page.getByTestId('verify-1').waitFor({ timeout: 30_000 });
  ok(await page.getByTestId('verify-1').isDisabled(), 'verify disabled until the period elapses');
  ok((await txt('verify-1')).includes('Opens in'), `button says: "${await txt('verify-1')}"`);
  await shot('06-verify-waiting');
  console.log('  … waiting for the 60 s demo period to elapse');
  await page.waitForFunction(() => !document.querySelector('[data-testid=verify-1]')?.hasAttribute('disabled'), null, { timeout: 120_000, polling: 1000 });
  ok(true, 'check #1 opened');

  step('bob verifies with the live camera (fake device) + GPS');
  await page.getByTestId('verify-1').click();
  await page.getByTestId('open-camera').click();
  await page.getByTestId('camera-video').waitFor();
  await page.waitForFunction(() => (document.querySelector('[data-testid=camera-video]')?.videoWidth ?? 0) > 0, null, { timeout: 15_000 });
  await page.getByTestId('snap').click();
  await page.locator('.photo img').waitFor();
  await page.getByTestId('verify-distance').waitFor({ timeout: 15_000 });
  ok((await txt('verify-distance')).includes('✓'), `distance check: ${(await txt('verify-distance')).trim()}`);
  await shot('07-verify-ready');
  await page.getByTestId('submit-verify').click();
  await page.getByText('Tree #1 checked').waitFor({ timeout: 40_000 });
  ok(chainCall(C.TreeToken, 'balanceOf(address)(uint256)', BOB).startsWith('45000000000000000'), 'on-chain: bob earned 0.045 $Tree');
  ok(chainRaw(C.TreeNFT, 'getTree(uint256)((address,int32,int32,uint8,uint64,uint64,bytes32))', '1').slice(1, -1).split(', ')[3] === '1', 'on-chain: tree #1 has exactly 1 check');
  await shot('08-verified');

  step('alice cannot verify her own tree');
  await page.evaluate((a) => window.__setAccount(a), ALICE);
  await page.waitForFunction(() => document.querySelector('[data-testid=account]')?.textContent?.toLowerCase().startsWith('0x7099'));
  await page.getByText('Back to trees').click().catch(() => {});
  await page.getByTestId('tab-verify').click();
  await page.getByTestId('verify-1').waitFor();
  ok((await txt('verify-1')).includes('Your tree') && (await page.getByTestId('verify-1').isDisabled()), 'UI blocks self-verification');
  // …and the contract does too (bypass the UI)
  let reverted = false;
  try {
    cast('send', C.VerificationBounty, 'verify(uint256,int32,int32,bytes32,string,bool)', '1', '11562200', '104916000', '0x' + 'ab'.repeat(32), 'x', 'true', '--from', ALICE, '--unlocked', '--rpc-url', RPC);
  } catch (e) { reverted = /SelfVerification|revert/i.test(String(e.stderr ?? e.message)); }
  ok(reverted, 'contract rejects verifier == planter even when called directly');

  step('claim the staking stream');
  await page.getByTestId('tab-trees').click();
  await page.getByTestId('claim-1').waitFor();
  const before = chainCall(C.TreeToken, 'balanceOf(address)(uint256)', ALICE).split(' ')[0];
  await page.getByTestId('claim-1').click();
  await page.getByText('Confirmed on-chain').first().waitFor({ timeout: 30_000 });
  const after = chainCall(C.TreeToken, 'balanceOf(address)(uint256)', ALICE).split(' ')[0];
  ok(BigInt(after) > BigInt(before), `claim minted ${(BigInt(after) - BigInt(before)).toString()} wei of stream`);
  await shot('09-claimed');

  step('business burns $Tree for a carbon receipt');
  await page.getByTestId('tab-burn').click();
  await page.getByTestId('burn-amount').fill('0.1');
  await page.getByTestId('burn-beneficiary').fill('Acme Coffee Co.');
  const supplyBefore = BigInt(chainCall(C.TreeToken, 'totalSupply()(uint256)').split(' ')[0]);
  await page.getByTestId('retire').click();
  await page.getByTestId('receipt').waitFor({ timeout: 40_000 });
  ok((await txt('receipt')).includes('0.1 tCO₂') && (await txt('receipt')).includes('Acme Coffee Co.'), 'receipt shows 0.1 tCO₂ for Acme Coffee Co.');
  const supplyAfter = BigInt(chainCall(C.TreeToken, 'totalSupply()(uint256)').split(' ')[0]);
  ok(supplyBefore - supplyAfter === 100000000000000000n, 'on-chain: exactly 0.1 $Tree burned from supply');
  ok(chainCall(C.BurnVault, 'totalRetired()(uint256)').startsWith('100000000000000000'), 'on-chain: BurnVault.totalRetired = 0.1');
  await shot('10-retired');

  step('browser health');
  ok(consoleErrors.length === 0, `no console/page errors${consoleErrors.length ? ': ' + consoleErrors.slice(0, 3).join(' | ') : ''}`);
} catch (e) {
  failures++;
  console.error('\n✗ E2E aborted:', e.message);
  await shot('zz-failure').catch(() => {});
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\n✅ E2E PASSED' : `\n❌ E2E FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
