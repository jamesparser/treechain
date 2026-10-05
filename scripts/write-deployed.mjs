#!/usr/bin/env node
// Regenerates DEPLOYED.md from frontend/src/generated/deployment.json.
//   node scripts/write-deployed.mjs [--app-url https://…] [--plant-tx 0x…] [--stake-tx 0x…] [--verify-tx 0x…] [--claim-tx 0x…] [--burn-tx 0x…]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dep = JSON.parse(readFileSync(join(root, 'frontend/src/generated/deployment.json'), 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);

const ZERO = '0x0000000000000000000000000000000000000000';
const NAMES = {
  TreeToken: '$Tree (ERC-20) — the single token; mint rights frozen to the three emitters',
  VerifierRegistry: 'ID gate · verifier ≠ planter · kick',
  TreeNFT: 'TreeNFT (ERC-721) — geo + photo hash + date; 15 m haversine rule; health record',
  StakingRewards: 'Stake a TreeNFT → 0.25 $Tree stream while verified-alive',
  VerificationBounty: 'Peer checks · 0.045 $Tree each · max 10 per tree',
  BurnVault: 'Burn $Tree → CarbonRetired receipt',
};
const explorer = dep.chainId === 10143 ? 'https://testnet.monadscan.com' : '';
const live = dep.contracts.TreeNFT !== ZERO;
const link = (kind, v) => (explorer ? `[\`${v}\`](${explorer}/${kind}/${v})` : `\`${v}\``);

let md = `# Deployed contracts\n\n`;
if (!live) {
  md += `> **Not deployed yet.** Deploy from the app's \`/#/deploy\` page (wallet popups, no key export) or with \`forge script script/Deploy.s.sol\`, then run \`node scripts/write-deployed.mjs\`.\n\n`;
}
md += `| | |\n|---|---|\n`;
md += `| Network | Monad Testnet (chain id ${dep.chainId}) |\n`;
if (args['app-url']) md += `| Live app | ${args['app-url']} |\n`;
md += `| Deployer / team | ${live ? link('address', dep.deployer) : '_pending_'} |\n`;
md += `| Verification period | ${dep.periodSeconds} s${dep.periodSeconds < 86400 ? ' — **testnet demo clock** (production: 157788000 s = 5 years)' : ''} |\n`;
if (live) md += `| Deployed | ${new Date(dep.deployedAt * 1000).toISOString()} · block ${dep.deployBlock} |\n`;
md += `\n## Contracts\n\n| Contract | Address | Role |\n|---|---|---|\n`;
for (const [name, role] of Object.entries(NAMES)) {
  const a = dep.contracts[name];
  md += `| ${name} | ${a === ZERO ? '_pending_' : link('address', a)} | ${role} |\n`;
}

const txs = [
  ['Plant → TreeNFT mint (+0.25 $Tree)', args['plant-tx']],
  ['Stake the TreeNFT', args['stake-tx']],
  ['Peer verification (+0.045 $Tree)', args['verify-tx']],
  ['Claim staking stream', args['claim-tx']],
  ['Burn → CarbonRetired receipt', args['burn-tx']],
];
md += `\n## Proof transactions\n\n| Step | Transaction |\n|---|---|\n`;
for (const [label, tx] of txs) md += `| ${label} | ${tx ? link('tx', tx) : '_add with --' + label.split(' ')[0].toLowerCase() + '-tx_'} |\n`;

md += `\n## Wiring (set once at deploy)\n\n- \`TreeToken\`: MINTER = TreeNFT, StakingRewards, VerificationBounty · BURNER = BurnVault · admin role **renounced** (minter set frozen)\n- \`TreeNFT\`: CHECKER = VerificationBounty\n\n## Explorers\n\n[MonadScan](https://testnet.monadscan.com) · [MonadVision](https://testnet.monadvision.com) · [Monad Explorer](https://testnet.monadexplorer.com)\n`;

writeFileSync(join(root, 'DEPLOYED.md'), md);
console.log(`wrote DEPLOYED.md (${live ? 'live deployment' : 'placeholder'})`);
