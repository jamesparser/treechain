import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { activeChain } from '../deployment';
import { fmtTree, shortAddr } from '../lib/format';
import { useTreeBalance } from '../data';

export function WalletBar() {
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const mon = useBalance({ address, query: { enabled: !!address, refetchInterval: 8_000 } });
  const tree = useTreeBalance();

  if (!isConnected) {
    // hide the generic "Injected" entry when a named wallet (e.g. Trust Wallet) was discovered via EIP-6963
    const named = connectors.filter((c) => c.name !== 'Injected');
    const list = named.length > 0 ? named : connectors;
    return (
      <div className="wallet">
        {list.map((c) => (
          <button key={c.uid} className="btn btn-primary" disabled={isPending} onClick={() => connect({ connector: c, chainId: activeChain.id })} data-testid={`connect-${c.name}`}>
            {isPending ? 'Connecting…' : `Connect ${c.name}`}
          </button>
        ))}
        {list.length === 0 && <span className="muted small">No wallet found — install Trust Wallet or open this page in its browser.</span>}
        {error && <span className="error small">{error.message.split('\n')[0]}</span>}
      </div>
    );
  }

  const wrong = chainId !== activeChain.id;
  return (
    <div className="wallet">
      {wrong ? (
        <button className="btn btn-warn" disabled={switching} onClick={() => switchChain({ chainId: activeChain.id })} data-testid="switch-chain">
          Switch to {activeChain.name}
        </button>
      ) : (
        <>
          <span className="chip" title="Gas">
            {mon.data ? Number(mon.data.formatted).toFixed(3) : '…'} {activeChain.nativeCurrency.symbol}
          </span>
          <span className="chip chip-tree" title="Your $Tree balance" data-testid="tree-balance">
            {fmtTree(tree)} $Tree
          </span>
        </>
      )}
      <button className="btn btn-ghost" onClick={() => disconnect()} title="Disconnect" data-testid="account">
        {shortAddr(address)}
      </button>
    </div>
  );
}
