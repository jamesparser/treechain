import { useState } from 'react';
import { keccak256, toBytes } from 'viem';
import { useAccount } from 'wagmi';
import { addr, activeChain } from '../deployment';
import { verifierRegistryAbi } from '../generated/abis';
import { useTx } from '../hooks';
import { Card, TxStatus } from './ui';

/** One-time ID registration. The registry binds one ID hash to one wallet, so planter ≠ verifier holds by account AND by ID. */
export function RegisterCard() {
  const { address } = useAccount();
  const [handle, setHandle] = useState('');
  const tx = useTx();
  const clean = handle.trim().toLowerCase();
  // chain id mixed in so the same handle is a different hash on mainnet vs testnet
  const idHash = clean ? keccak256(toBytes(`treechain:${activeChain.id}:${clean}`)) : undefined;

  return (
    <Card title="Register your TreeChain ID">
      <p className="muted">
        Planters and verifiers need an ID. Only its hash goes on-chain, and one ID can be bound to one wallet — that's how the
        contracts guarantee a verifier is never the planter. (On testnet the ID is self-asserted; mainnet swaps in
        proof-of-personhood.)
      </p>
      <label>
        ID handle
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="e.g. casey-planter" maxLength={64} data-testid="id-handle" />
      </label>
      {idHash && <p className="mono small muted">hash {idHash.slice(0, 18)}…</p>}
      <button
        className="btn btn-primary"
        disabled={!idHash || tx.busy || !address}
        data-testid="register"
        onClick={() => idHash && tx.send({ address: addr.VerifierRegistry, abi: verifierRegistryAbi, functionName: 'register', args: [idHash] })}
      >
        Register ID
      </button>
      <TxStatus tx={tx} />
    </Card>
  );
}
