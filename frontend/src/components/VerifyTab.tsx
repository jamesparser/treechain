import { useCallback, useState } from 'react';
import { useAccount } from 'wagmi';
import { addr } from '../deployment';
import { verificationBountyAbi } from '../generated/abis';
import { useStats, useTrees, type TreeInfo } from '../data';
import { useNow, useTx } from '../hooks';
import { friendlyError } from '../lib/errors';
import { fmtDist, fmtDuration, shortAddr } from '../lib/format';
import { fromE6, haversineM, toE6, VERIFY_RADIUS_M } from '../lib/geo';
import { pinEvidence } from '../lib/ipfs';
import { sha256Hex, type Photo } from '../lib/media';
import { LocationPanel, type Loc } from './LocationPanel';
import { PhotoCapture } from './PhotoCapture';
import { treeStatus } from './TreesTab';
import { Badge, Card, Empty, Pips, TxStatus } from './ui';

export function VerifyTab() {
  const { address } = useAccount();
  const { lastTokenId } = useStats();
  const last = Number(lastTokenId ?? 0n);
  const ids = Array.from({ length: Math.min(last, 12) }, (_, i) => BigInt(last - i));
  const { trees, loading } = useTrees(ids);
  const [selected, setSelected] = useState<bigint>();
  const now = useNow();

  const sel = trees.find((t) => t.id === selected);

  return (
    <div className="stack">
      <Card title="Peer verification">
        <p className="muted">
          Walk up to a tree (≤ {VERIFY_RADIUS_M} m), take a fresh photo and say whether it is still alive. You earn <b>0.045 $Tree</b> per
          completed check. You can't verify your own trees, and each tree has at most 10 checks — one per period.
        </p>
      </Card>

      {sel ? (
        <VerifyPanel tree={sel} onDone={() => setSelected(undefined)} onCancel={() => setSelected(undefined)} />
      ) : (
        <>
          {loading && trees.length === 0 && <Empty>Loading trees…</Empty>}
          {!loading && trees.length === 0 && <Empty>No trees planted yet.</Empty>}
          {trees.map((t) => {
            const mine = t.planter.toLowerCase() === address?.toLowerCase();
            const due = t.deadAt === 0n && t.checks < 10 && t.nextCheckAt > 0n && BigInt(now) >= t.nextCheckAt;
            const st = treeStatus(t, now);
            return (
              <Card key={t.id.toString()} title={`🌳 Tree #${t.id}`} right={<Badge tone={st.tone}>{st.label}</Badge>} className="tree-card">
                <Pips done={t.checks} dead={t.deadAt > 0n} />
                <p className="muted small">
                  planted by <span className="mono">{shortAddr(t.planter)}</span> · {fromE6(t.latE6).toFixed(5)}, {fromE6(t.lonE6).toFixed(5)}
                </p>
                <div className="row">
                  <button className="btn btn-primary" disabled={!due || mine} onClick={() => setSelected(t.id)} data-testid={`verify-${t.id}`}>
                    {mine ? 'Your tree' : due ? 'Verify this tree' : t.deadAt > 0n ? 'Chain ended' : t.checks >= 10 ? 'Fully verified' : `Opens in ${fmtDuration(Number(t.nextCheckAt) - now)}`}
                  </button>
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}

function VerifyPanel({ tree: t, onDone, onCancel }: { tree: TreeInfo; onDone: () => void; onCancel: () => void }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [alive, setAlive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prepError, setPrepError] = useState<string>();
  const [done, setDone] = useState(false);
  const tx = useTx();
  const onLoc = useCallback((l: Loc | null) => setLoc(l), []);

  const dist = loc ? haversineM(loc.lat, loc.lon, fromE6(t.latE6), fromE6(t.lonE6)) : undefined;
  const near = dist !== undefined && dist <= VERIFY_RADIUS_M;
  const ready = !!photo && !!loc && near && !busy && !tx.busy;

  async function submit() {
    if (!photo || !loc) return;
    setBusy(true);
    setPrepError(undefined);
    try {
      const imageHash = await sha256Hex(photo.blob);
      const pin = await pinEvidence('verify', photo.blob, imageHash, {
        lat: loc.lat,
        lon: loc.lon,
        accuracyM: loc.accuracy,
        takenAt: photo.takenAt,
        treeId: Number(t.id),
        alive,
      });
      const receipt = await tx.send({
        address: addr.VerificationBounty,
        abi: verificationBountyAbi,
        functionName: 'verify',
        args: [t.id, toE6(loc.lat), toE6(loc.lon), imageHash, pin.uri, alive],
      });
      if (receipt) setDone(true);
    } catch (e) {
      setPrepError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Card title={`✅ Tree #${t.id} checked`} className="card-success">
        <p>
          Recorded on-chain. <b>+0.045 $Tree</b> is in your wallet.
        </p>
        <TxStatus tx={tx} />
        <button className="btn btn-primary" onClick={onDone}>
          Back to trees
        </button>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title={`Verifying tree #${t.id}`} right={<button className="btn btn-ghost" onClick={onCancel}>Cancel</button>}>
        <p className="muted small">
          Check {t.checks + 1} of 10 · stand within {VERIFY_RADIUS_M} m of {fromE6(t.latE6).toFixed(6)}, {fromE6(t.lonE6).toFixed(6)}
        </p>
        <PhotoCapture photo={photo} onChange={setPhoto} />
      </Card>
      <Card title="Where are you?">
        <LocationPanel onChange={onLoc} />
        {dist !== undefined && (
          <div className={`placement ${near ? 'placement-ok' : 'placement-bad'}`} data-testid="verify-distance">
            {near ? '✓' : '✗'} You are {fmtDist(Math.round(dist * 1000))} from the tree{near ? '' : ` — get within ${VERIFY_RADIUS_M} m`}.
          </div>
        )}
      </Card>
      <Card title="Verdict">
        <div className="seg" role="radiogroup">
          <button className={`seg-btn ${alive ? 'seg-on' : ''}`} onClick={() => setAlive(true)} role="radio" aria-checked={alive} data-testid="verdict-alive">
            🌳 Still alive
          </button>
          <button className={`seg-btn seg-bad ${!alive ? 'seg-on' : ''}`} onClick={() => setAlive(false)} role="radio" aria-checked={!alive} data-testid="verdict-dead">
            🥀 Dead / missing
          </button>
        </div>
        {!alive && <p className="warn small">A dead report ends this tree's check chain and stops the planter's stake stream. Only report what you see.</p>}
      </Card>
      <button className="btn btn-primary btn-xl" disabled={!ready} onClick={submit} data-testid="submit-verify">
        {busy ? 'Pinning evidence…' : tx.busy ? (tx.phase === 'wallet' ? 'Confirm in wallet…' : 'Submitting…') : 'Submit check · earn 0.045 $Tree'}
      </button>
      {prepError && <p className="error" role="alert">⚠ {prepError}</p>}
      <TxStatus tx={tx} />
    </div>
  );
}
