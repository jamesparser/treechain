import { formatUnits } from 'viem';
import { explorerBase } from '../deployment';

/** $Tree amounts: up to `digits` decimals, trailing zeros trimmed, but always at least 2 decimals. */
export function fmtTree(wei: bigint | undefined, digits = 4): string {
  if (wei === undefined) return '—';
  let s = Number(formatUnits(wei, 18)).toFixed(digits).replace(/0+$/, '');
  if (s.endsWith('.')) s += '00';
  else {
    const decimals = s.split('.')[1]?.length ?? 0;
    if (decimals < 2) s += '0'.repeat(2 - decimals);
  }
  return s;
}

export function shortAddr(a?: string): string {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
}

export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  if (s < 90) return `${s}s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  if (s < 48 * 3600) return `${(s / 3600).toFixed(1)} h`;
  if (s < 90 * 86400) return `${Math.round(s / 86400)} days`;
  return `${(s / (365.25 * 86400)).toFixed(1)} years`;
}

export function fmtDate(unixSeconds: number | bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const explorerTx = (hash: string) => `${explorerBase}/tx/${hash}`;
export const explorerAddress = (a: string) => `${explorerBase}/address/${a}`;
export const explorerToken = (contract: string, id: bigint | number) => `${explorerBase}/nft/${contract}/${id}`;

const GATEWAY = ((import.meta.env.VITE_IPFS_GATEWAY as string | undefined) || 'https://gateway.pinata.cloud/ipfs/').replace(/\/?$/, '/');

/** ipfs://CID/path → https gateway URL; passes http(s)/data URIs through. */
export function ipfsUrl(uri: string): string {
  if (uri.startsWith('ipfs://')) return GATEWAY + uri.slice('ipfs://'.length);
  return uri;
}

export function fmtDist(mm: bigint | number): string {
  const m = Number(mm) / 1000;
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m.toFixed(1)} m`;
}
