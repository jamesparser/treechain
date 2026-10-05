#!/usr/bin/env node
// Browser test of the /deploy page: the whole system is deployed + wired from a (mock) wallet's popups — no key export —
// then the app is reloaded and must pick the new addresses up from the browser. Run via `e2e/run.sh deploy`.
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const APP = process.env.APP_URL ?? 'http://127.0.0.1:4173';
const RPC = 'http://127.0.0.1:8545';
const SHOTS = process.env.SHOTS_DIR ?? new URL('./screenshots/', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? '/opt/pw-browsers/chromium';
mkdirSync(SHOTS, { recursive: true });
const DEPLOYER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // anvil #0
const cast = (...a) => execFileSync(process.env.CAST ?? 'cast', a, { encoding: 'utf8' }).trim();
const call = (to, sig, ...args) => cast('call', to, sig, ...args, '--rpc-url', RPC).split(' ')[0];

let failures = 0;
const ok = (c, m) => { console.log(`${c ? '  ✓' : '  ✗ FAIL:'} ${m}`); if (!c) failures++; };

const mockWallet = ({ account, rpc }) => {
  let rpcId = 0, authorized = false;
  const listeners = {};
  const call = async (method, params = []) => {
    const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; throw e; }
    return j.result;
  };
  const provider = {
    request: async ({ method, params }) => {
      switch (method) {
        case 'eth_requestAccounts': authorized = true; return [account];
        case 'eth_accounts': return authorized ? [account] : [];
        case 'eth_chainId': return '0x7a69';
        case 'wallet_switchEthereumChain': case 'wallet_addEthereumChain': return null;
        case 'wallet_getPermissions': case 'wallet_requestPermissions': return [{ parentCapability: 'eth_accounts' }];
        case 'eth_sendTransaction': return call('eth_sendTransaction', [{ ...params[0], from: account }]);
        default: return call(method, params);
      }
    },
    on: (e, f) => { (listeners[e] ||= []).push(f); },
    removeListener: () => {},
  };
  const info = { uuid: 'e2e-trust-wallet', name: 'Trust Wallet', icon: 'data:image/svg+xml;base64,PHN2Zy8+', rdns: 'com.trustwallet.app' };
  const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail: Object.freeze({ info, provider }) }));
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
await ctx.addInitScript(mockWallet, { account: DEPLOYER, rpc: RPC });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

try {
  console.log('\n▶ open /#/deploy, connect, deploy everything from the wallet');
  await page.goto(`${APP}/#/deploy`);
  await page.getByTestId('connect-Trust Wallet').click();
  await page.getByTestId('account').waitFor();
  await page.getByTestId('deploy-period').fill('60');
  await page.screenshot({ path: `${SHOTS}/d1-deploy-form.png`, fullPage: true });
  const t0 = Date.now();
  await page.getByTestId('deploy-all').click();
  await page.getByText('🎉 Deployed').waitFor({ timeout: 180_000 });
  ok(true, `deployed + wired in ${((Date.now() - t0) / 1000).toFixed(0)} s (12 wallet txs)`);
  await page.screenshot({ path: `${SHOTS}/d2-deployed.png`, fullPage: true });

  const dep = JSON.parse(await page.getByTestId('deployment-json').inputValue());
  const C = dep.contracts;
  ok(dep.chainId === 31337 && dep.periodSeconds === 60 && dep.deployer.toLowerCase() === DEPLOYER.toLowerCase(), 'deployment JSON has chain, period, deployer');

  console.log('\n▶ on-chain wiring');
  const role = (name) => call(C.TreeToken, `${name}()(bytes32)`);
  const has = (token, r, who) => call(token, 'hasRole(bytes32,address)(bool)', r, who) === 'true';
  ok(has(C.TreeToken, role('MINTER_ROLE'), C.TreeNFT), 'TreeNFT can mint $Tree');
  ok(has(C.TreeToken, role('MINTER_ROLE'), C.StakingRewards), 'StakingRewards can mint $Tree');
  ok(has(C.TreeToken, role('MINTER_ROLE'), C.VerificationBounty), 'VerificationBounty can mint $Tree');
  ok(has(C.TreeToken, role('BURNER_ROLE'), C.BurnVault), 'BurnVault can burn $Tree');
  ok(!has(C.TreeToken, role('MINTER_ROLE'), DEPLOYER), 'deployer has NO mint right');
  ok(!has(C.TreeToken, call(C.TreeToken, 'DEFAULT_ADMIN_ROLE()(bytes32)'), DEPLOYER), 'deployer renounced $Tree admin → minter set frozen');
  ok(has(C.TreeNFT, call(C.TreeNFT, 'CHECKER_ROLE()(bytes32)'), C.VerificationBounty), 'VerificationBounty can record checks');
  ok(call(C.TreeNFT, 'period()(uint256)') === '60', 'TreeNFT period = 60 s');
  ok(call(C.TreeNFT, 'team()(address)').toLowerCase() === DEPLOYER.toLowerCase(), 'team defaults to the connected wallet');

  console.log('\n▶ reload → app uses the browser-saved deployment');
  await page.evaluate(() => { location.hash = '/plant'; });
  await page.reload();
  await page.getByTestId('demo-clock').waitFor({ timeout: 20_000 });
  ok(true, 'app is live on the new contracts (demo clock read from chain)');
  await page.getByTestId('connect-Trust Wallet').click();
  await page.getByTestId('id-handle').waitFor({ timeout: 20_000 });
  ok(true, 'plant tab asks the new deployer to register an ID');
  await page.screenshot({ path: `${SHOTS}/d3-live.png`, fullPage: true });
  ok(errors.length === 0, `no console/page errors${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
} catch (e) {
  failures++;
  console.error('\n✗ aborted:', e.message);
  await page.screenshot({ path: `${SHOTS}/d-failure.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\n✅ DEPLOY E2E PASSED' : `\n❌ DEPLOY E2E FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
