import type { ReactNode } from 'react';
import type { useTx } from '../hooks';
import { explorerTx } from '../lib/format';

export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-head">
          {title && <h2>{title}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'ok' | 'warn' | 'bad' | 'neutral' | 'info'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="ext">
      {children}
      <span aria-hidden> ↗</span>
    </a>
  );
}

const PHASE_LABEL: Record<string, string> = {
  simulating: 'Checking the transaction…',
  wallet: 'Confirm in your wallet…',
  mining: 'Waiting for Monad to confirm…',
  done: 'Confirmed on-chain',
};

/** Shared transaction status line: phase, explorer link, friendly error. */
export function TxStatus({ tx }: { tx: ReturnType<typeof useTx> }) {
  if (tx.phase === 'idle') return null;
  return (
    <div className={`tx ${tx.phase === 'error' ? 'tx-error' : tx.phase === 'done' ? 'tx-done' : ''}`} role="status" aria-live="polite">
      {tx.phase === 'error' ? (
        <span>⚠ {tx.error}</span>
      ) : (
        <span>
          {tx.busy && <span className="spinner" aria-hidden />} {PHASE_LABEL[tx.phase]}
        </span>
      )}
      {tx.hash && (
        <Ext href={explorerTx(tx.hash)}>{tx.hash.slice(0, 10)}…{tx.hash.slice(-6)}</Ext>
      )}
    </div>
  );
}

export function Pips({ done, total = 10, dead = false }: { done: number; total?: number; dead?: boolean }) {
  return (
    <div className="pips" aria-label={`${done} of ${total} checks done`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`pip ${i < done ? (dead && i === done - 1 ? 'pip-dead' : 'pip-on') : ''}`} />
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
