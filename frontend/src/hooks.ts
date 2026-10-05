import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import type { Abi, Address, Hash, TransactionReceipt } from 'viem';
import { friendlyError } from './lib/errors';

/** Re-renders every `ms` so countdowns stay live. Returns unix seconds. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export type TxPhase = 'idle' | 'simulating' | 'wallet' | 'mining' | 'done' | 'error';

export interface TxRequest {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}

/**
 * simulate (eth_call, so reverts decode into readable messages) → wallet popup → wait for receipt.
 * Invalidates every query on success so balances, trees and stats refresh.
 */
export function useTx() {
  const { address: account } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<TxPhase>('idle');
  const [hash, setHash] = useState<Hash>();
  const [error, setError] = useState<string>();

  const reset = useCallback(() => {
    setPhase('idle');
    setHash(undefined);
    setError(undefined);
  }, []);

  const send = useCallback(
    async (req: TxRequest): Promise<TransactionReceipt | undefined> => {
      setError(undefined);
      setHash(undefined);
      try {
        if (!publicClient || !account) throw new Error('Connect your wallet first.');
        setPhase('simulating');
        await publicClient.simulateContract({ ...(req as unknown as Record<string, unknown>), account } as never);
        setPhase('wallet');
        const h = await writeContractAsync(req as never);
        setHash(h);
        setPhase('mining');
        const receipt = await publicClient.waitForTransactionReceipt({ hash: h });
        if (receipt.status !== 'success') throw new Error('Transaction reverted on-chain.');
        setPhase('done');
        void qc.invalidateQueries();
        return receipt;
      } catch (e) {
        setError(friendlyError(e));
        setPhase('error');
        return undefined;
      }
    },
    [account, publicClient, writeContractAsync, qc],
  );

  const busy = phase === 'simulating' || phase === 'wallet' || phase === 'mining';
  return { send, phase, hash, error, busy, reset };
}

export interface GeoFix {
  lat: number;
  lon: number;
  accuracy: number; // metres
}

export type GeoStatus = 'idle' | 'locating' | 'ok' | 'denied' | 'unavailable';

/** Live high-accuracy GPS fix. */
export function useGeo(enabled: boolean) {
  const [fix, setFix] = useState<GeoFix>();
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [message, setMessage] = useState<string>();
  const watchId = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      setMessage('This browser has no geolocation.');
      return;
    }
    setStatus('locating');
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setFix({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy });
        setStatus('ok');
        setMessage(undefined);
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        setMessage(err.message);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    return () => {
      if (watchId.current !== undefined) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [enabled]);

  return { fix, status, message };
}
