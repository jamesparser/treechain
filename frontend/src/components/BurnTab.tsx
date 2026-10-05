import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatUnits, parseEventLogs, parseUnits, type Hash } from 'viem';
import { addr, isDeployed } from '../deployment';
import { burnVaultAbi } from '../generated/abis';
import { POLL, useStats, useTreeBalance } from '../data';
import { useTx } from '../hooks';
import { explorerTx, fmtTree } from '../lib/format';
import { Card, Ext, TxStatus } from './ui';

interface Receipt {
  id: bigint;
  amount: bigint;
  beneficiary: string;
  hash: Hash;
}

export function BurnTab() {
  const { address } = useAccount();
  const balance = useTreeBalance();
  const { retired, supply } = useStats();
  const mine = useReadContract({
    address: addr.BurnVault,
    abi: burnVaultAbi,
    functionName: 'retiredBy',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isDeployed, refetchInterval: POLL },
  });
  const [amount, setAmount] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [receipt, setReceipt] = useState<Receipt>();
  const tx = useTx();

  let wei: bigint | undefined;
  try {
    wei = amount ? parseUnits(amount, 18) : undefined;
  } catch {
    wei = undefined;
  }
  const insufficient = wei !== undefined && balance !== undefined && wei > balance;
  const ready = !!wei && wei > 0n && !insufficient && !tx.busy;

  async function retire() {
    if (!wei) return;
    const r = await tx.send({ address: addr.BurnVault, abi: burnVaultAbi, functionName: 'retire', args: [wei, beneficiary.trim()] });
    if (r) {
      const logs = parseEventLogs({ abi: burnVaultAbi, logs: r.logs, eventName: 'CarbonRetired' });
      const ev = logs[0]?.args;
      if (ev) setReceipt({ id: ev.receiptId, amount: ev.amount, beneficiary: ev.beneficiary, hash: r.transactionHash });
    }
  }

  if (receipt) {
    return (
      <Card title="♻️ Carbon retired" className="card-success">
        <div className="receipt" data-testid="receipt">
          <div className="big">{formatUnits(receipt.amount, 18)} tCO₂</div>
          <p>
            <b>{fmtTree(receipt.amount, 6)} $Tree</b> burned forever
            {receipt.beneficiary ? <> — retired on behalf of <b>{receipt.beneficiary}</b></> : null}
          </p>
          <p className="muted small">
            Receipt #{receipt.id.toString()} · <Ext href={explorerTx(receipt.hash)}>CarbonRetired event</Ext>
          </p>
        </div>
        <button className="btn" onClick={() => { setReceipt(undefined); setAmount(''); tx.reset(); }}>
          Retire more
        </button>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title="Offset with $Tree">
        <p className="muted">
          1 $Tree = 1 tonne of CO₂, backed by one tree verified over 50 years. Burning is permanent and public: the vault records a
          receipt and emits <span className="mono">CarbonRetired(buyer, amount)</span>. Businesses buy $Tree on the open market; on
          testnet, send it to a "business" wallet or burn your own.
        </p>
        <div className="stats">
          <div><span className="muted small">Your balance</span><div className="big">{fmtTree(balance)}</div></div>
          <div><span className="muted small">You've retired</span><div className="big">{fmtTree(mine.data as bigint | undefined)}</div></div>
          <div><span className="muted small">All retired</span><div className="big">{fmtTree(retired)}</div></div>
          <div><span className="muted small">Circulating</span><div className="big">{fmtTree(supply)}</div></div>
        </div>
        <label>
          Amount ($Tree)
          <div className="row">
            <input inputMode="decimal" placeholder="0.25" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="burn-amount" />
            <button className="btn btn-ghost" onClick={() => balance !== undefined && setAmount(formatUnits(balance, 18))}>Max</button>
          </div>
        </label>
        <label>
          Retire on behalf of (optional)
          <input value={beneficiary} onChange={(e) => setBeneficiary(e.target.value)} maxLength={128} placeholder="Company, event or product" data-testid="burn-beneficiary" />
        </label>
        {insufficient && <p className="error small">More than your balance.</p>}
        <button className="btn btn-primary btn-xl" disabled={!ready} onClick={retire} data-testid="retire">
          🔥 Burn & retire carbon
        </button>
        <TxStatus tx={tx} />
      </Card>
    </div>
  );
}
