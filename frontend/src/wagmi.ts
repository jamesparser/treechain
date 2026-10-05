import { createConfig, fallback, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { activeChain, anvilLocal, monadTestnet } from './deployment';

const wcProjectId = import.meta.env.VITE_WC_PROJECT_ID as string | undefined;

// Only the active chain is registered at runtime, so every hook defaults to it even before a wallet connects.
// (The type is widened to both so `transports` stays exhaustive.)
const chains = [activeChain] as unknown as readonly [typeof monadTestnet, typeof anvilLocal];

export const wagmiConfig = createConfig({
  chains,
  // EIP-6963 discovery (on by default) adds one connector per installed wallet — Trust Wallet announces itself
  // as "Trust Wallet". `injected()` is the fallback for wallets that only set window.ethereum.
  connectors: [injected(), ...(wcProjectId ? [walletConnect({ projectId: wcProjectId, showQrModal: true })] : [])],
  transports: {
    // three public Monad testnet endpoints (QuickNode 50 rps · Monad Foundation · Ankr); the next one is used if one fails
    [monadTestnet.id]: fallback([
      http('https://testnet-rpc.monad.xyz'),
      http('https://rpc-testnet.monadinfra.com'),
      http('https://rpc.ankr.com/monad_testnet'),
    ]),
    [anvilLocal.id]: http('http://127.0.0.1:8545'),
  },
  multiInjectedProviderDiscovery: true,
});

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}
