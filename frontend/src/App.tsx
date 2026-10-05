import { useEffect, useState, type ReactNode } from 'react';
import { useAccount } from 'wagmi';
import { addr, activeChain, CONTRACT_NAMES, deploymentSource, EXPLORERS, isDeployed } from './deployment';
import { useIdentity, useStats } from './data';
import { fmtDuration, fmtTree, explorerAddress } from './lib/format';
import { BurnTab } from './components/BurnTab';
import { DeployPage } from './components/DeployPage';
import { PlantTab } from './components/PlantTab';
import { RegisterCard } from './components/RegisterCard';
import { TreesTab } from './components/TreesTab';
import { VerifyTab } from './components/VerifyTab';
import { WalletBar } from './components/WalletBar';
import { Card, Ext } from './components/ui';

type Route = 'plant' | 'trees' | 'verify' | 'burn' | 'deploy';

const TABS: { id: Exclude<Route, 'deploy'>; label: string; icon: string; needsId: boolean }[] = [
  { id: 'plant', label: 'Plant', icon: '🌱', needsId: true },
  { id: 'trees', label: 'My trees', icon: '🌳', needsId: false },
  { id: 'verify', label: 'Verify', icon: '🔍', needsId: true },
  { id: 'burn', label: 'Offset', icon: '♻️', needsId: false },
];

function useRoute(): [Route, (r: Route) => void] {
  const read = (): Route => {
    const h = location.hash.replace(/^#\/?/, '');
    return (['plant', 'trees', 'verify', 'burn', 'deploy'] as const).find((r) => r === h) ?? 'plant';
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const f = () => setRoute(read());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return [route, (r) => (location.hash = `/${r}`)];
}

function Gate({ needsId, children }: { needsId: boolean; children: ReactNode }) {
  const { isConnected, chainId } = useAccount();
  const id = useIdentity();

  if (!isDeployed) {
    return (
      <Card title="Contracts not deployed yet">
        <p className="muted">
          This build has no contract addresses. Deploy to {activeChain.name} first — from the wallet at <a href="#/deploy">/deploy</a> (no key
          export) or with <span className="mono">forge script</span>.
        </p>
      </Card>
    );
  }
  if (!isConnected) {
    return (
      <Card title="Connect a wallet">
        <p className="muted">Connect Trust Wallet (or any EVM wallet) to {activeChain.name} to plant, verify and offset.</p>
      </Card>
    );
  }
  if (chainId !== activeChain.id) {
    return (
      <Card title={`Switch to ${activeChain.name}`}>
        <p className="muted">Your wallet is on a different network. Use the button in the top bar.</p>
      </Card>
    );
  }
  if (needsId && !id.loading && !id.registered) return <RegisterCard />;
  if (needsId && id.kicked) {
    return (
      <Card title="ID suspended">
        <p className="error">Your ID was kicked by the registry (fake trees or collusion). You can no longer plant or verify.</p>
      </Card>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const [route, setRoute] = useRoute();
  const { trees, supply, retired, period } = useStats();

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/plant" aria-label="TreeChain home">
          <img src="/logo.svg" alt="" width="36" height="36" />
          <div>
            <b>TreeChain</b>
            <span className="muted small">{activeChain.name}</span>
          </div>
        </a>
        <WalletBar />
      </header>

      {period !== undefined && period < 86_400n && (
        <div className="banner" data-testid="demo-clock">
          ⏱ Testnet demo clock: one verification period = <b>{fmtDuration(Number(period))}</b> (production: 5 years), so the 50-year chain can be demoed in minutes.
        </div>
      )}

      <div className="statbar">
        <div><b data-testid="stat-trees">{trees?.toString() ?? '–'}</b><span>trees planted</span></div>
        <div><b>{fmtTree(supply, 2)}</b><span>$Tree circulating</span></div>
        <div><b>{fmtTree(retired, 2)}</b><span>tCO₂ retired</span></div>
      </div>

      {route === 'deploy' ? (
        <main>
          <DeployPage />
        </main>
      ) : (
        <>
          <nav className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={route === t.id} className={`tab ${route === t.id ? 'tab-on' : ''}`} onClick={() => setRoute(t.id)} data-testid={`tab-${t.id}`}>
                <span aria-hidden>{t.icon}</span> {t.label}
              </button>
            ))}
          </nav>
          <main>
            {TABS.filter((t) => t.id === route).map((t) => (
              <Gate key={t.id} needsId={t.needsId}>
                {t.id === 'plant' && <PlantTab goTrees={() => setRoute('trees')} />}
                {t.id === 'trees' && <TreesTab />}
                {t.id === 'verify' && <VerifyTab />}
                {t.id === 'burn' && <BurnTab />}
              </Gate>
            ))}
          </main>
        </>
      )}

      <footer>
        <p>
          <b>TreeChain</b> — a verification chain, not a blockchain — built on Monad.
        </p>
        {isDeployed && (
          <details>
            <summary>Contracts · {activeChain.name}{deploymentSource !== 'file' ? ` (${deploymentSource})` : ''}</summary>
            <ul className="links">
              {CONTRACT_NAMES.map((n) => (
                <li key={n}>
                  {n} <Ext href={explorerAddress(addr[n])}>{addr[n]}</Ext>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="muted small">
          Explorers: {EXPLORERS.map((e, i) => (
            <span key={e.name}>
              {i > 0 && ' · '}
              <Ext href={e.url}>{e.name}</Ext>
            </span>
          ))}
          {' · '}
          <a href="#/deploy">deploy</a>
        </p>
      </footer>
    </div>
  );
}
