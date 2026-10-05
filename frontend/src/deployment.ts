import { defineChain, type Address } from 'viem';
import committed from './generated/deployment.json';

export type ContractName =
  | 'TreeToken'
  | 'VerifierRegistry'
  | 'TreeNFT'
  | 'StakingRewards'
  | 'VerificationBounty'
  | 'BurnVault';

export const CONTRACT_NAMES: ContractName[] = [
  'TreeToken',
  'VerifierRegistry',
  'TreeNFT',
  'StakingRewards',
  'VerificationBounty',
  'BurnVault',
];

export interface Deployment {
  chainId: number;
  periodSeconds: number;
  deployer: Address;
  team: Address;
  deployBlock: number;
  deployedAt: number;
  contracts: Record<ContractName, Address>;
}

export const ZERO: Address = '0x0000000000000000000000000000000000000000';
export const STORAGE_KEY = 'treechain.deployment';

function valid(x: unknown): x is Deployment {
  const d = x as Deployment;
  return (
    !!d &&
    typeof d.chainId === 'number' &&
    !!d.contracts &&
    CONTRACT_NAMES.every((n) => typeof d.contracts[n] === 'string' && /^0x[0-9a-fA-F]{40}$/.test(d.contracts[n]))
  );
}

/**
 * Where the contract addresses come from, in priority order:
 *  1. localStorage — written by the in-browser /deploy page (so a fresh deploy works instantly on this device)
 *  2. VITE_DEPLOYMENT_JSON — one-line JSON in the Vercel env (go live with no git commit)
 *  3. src/generated/deployment.json — written by `forge script script/Deploy.s.sol`
 */
function load(): { deployment: Deployment; source: 'browser' | 'env' | 'file' } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (valid(d) && d.contracts.TreeNFT !== ZERO) return { deployment: d, source: 'browser' };
    }
  } catch {
    /* storage unavailable — ignore */
  }
  const env = import.meta.env.VITE_DEPLOYMENT_JSON as string | undefined;
  if (env) {
    try {
      const d = JSON.parse(env);
      if (valid(d) && d.contracts.TreeNFT !== ZERO) return { deployment: d, source: 'env' };
    } catch {
      /* fall through */
    }
  }
  return { deployment: committed as Deployment, source: 'file' };
}

const loaded = load();
export const deployment: Deployment = loaded.deployment;
export const deploymentSource = loaded.source;
export const isDeployed = deployment.contracts.TreeNFT !== ZERO;
export const addr = deployment.contracts;

export function clearBrowserDeployment() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------------- chains

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'MonadScan', url: 'https://testnet.monadscan.com' } },
  // canonical Multicall3 — the app batches its reads through it (listed in the Monad docs)
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
  testnet: true,
});

export const anvilLocal = defineChain({
  id: 31337,
  name: 'Local Anvil',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
  contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } }, // etched by e2e/run.sh
  testnet: true,
});

const wantLocal = import.meta.env.VITE_CHAIN === 'local' || deployment.chainId === 31337;
export const activeChain = wantLocal ? anvilLocal : monadTestnet;

/** Block explorers for Monad testnet (all three from the hackathon brief). */
export const EXPLORERS = [
  { name: 'MonadScan', url: 'https://testnet.monadscan.com' },
  { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
];

export const explorerBase = activeChain.blockExplorers?.default.url ?? '';
