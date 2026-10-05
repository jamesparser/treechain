import { useCallback, useState } from 'react';
import { useReadContract } from 'wagmi';
import { parseEventLogs, type Hash } from 'viem';
import { addr, isDeployed } from '../deployment';
import { treeNftAbi } from '../generated/abis';
import { useTx } from '../hooks';
import { friendlyError } from '../lib/errors';
import { explorerToken, explorerTx, fmtDist, ipfsUrl } from '../lib/format';
import { MAX_ABS_LAT, MIN_TREE_DISTANCE_M, toE6 } from '../lib/geo';
import { pinEvidence } from '../lib/ipfs';
import { sha256Hex, type Photo } from '../lib/media';
import { LocationPanel, type Loc } from './LocationPanel';
import { PhotoCapture } from './PhotoCapture';
import { Badge, Card, Ext, TxStatus } from './ui';

type Step = 'idle' | 'hashing' | 'pinning' | 'tx';

interface Result {
  id: bigint;
  hash: Hash;
  uri: string;
  pinned: boolean;
  imageHash: string;
}

export function PlantTab({ goTrees }: { goTrees: () => void }) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [prepError, setPrepError] = useState<string>();
  const [result, setResult] = useState<Result>();
  const tx = useTx();
  const onLoc = useCallback((l: Loc | null) => setLoc(l), []);

  const inRange = !!loc && Math.abs(loc.lat) <= MAX_ABS_LAT && Math.abs(loc.lon) <= 180;
  // free read: would the contract accept a tree here? (15 m rule against every nearby tree)
  const preview = useReadContract({
    address: addr.TreeNFT,
    abi: treeNftAbi,
    functionName: 'previewPlacement',
    args: loc && inRange ? [toE6(loc.lat), toE6(loc.lon)] : undefined,
    query: { enabled: isDeployed && !!loc && inRange, refetchInterval: 8_000 },
  });
  const [ok, nearestId, distMm] = (preview.data as readonly [boolean, bigint, bigint] | undefined) ?? [];
  const blocked = ok === false;

  const working = step !== 'idle' || tx.busy;
  const ready = !!photo && !!loc && inRange && confirm && !blocked && !working;

  async function plant() {
    if (!photo || !loc) return;
    setPrepError(undefined);
    setResult(undefined);
    tx.reset();
    try {
      setStep('hashing');
      const imageHash = await sha256Hex(photo.blob);
      setStep('pinning');
      const pin = await pinEvidence('plant', photo.blob, imageHash, {
        lat: loc.lat,
        lon: loc.lon,
        accuracyM: loc.accuracy,
        takenAt: photo.takenAt,
      });
      setStep('tx');
      const receipt = await tx.send({
        address: addr.TreeNFT,
        abi: treeNftAbi,
        functionName: 'plant',
        args: [toE6(loc.lat), toE6(loc.lon), imageHash, pin.uri],
      });
      if (receipt) {
        const logs = parseEventLogs({ abi: treeNftAbi, logs: receipt.logs, eventName: 'Planted' });
        const id = logs[0]?.args.tokenId;
        if (id !== undefined) setResult({ id, hash: receipt.transactionHash, uri: pin.uri, pinned: pin.pinned, imageHash });
      }
    } catch (e) {
      setPrepError(friendlyError(e));
    } finally {
      setStep('idle');
    }
  }

  function again() {
    setPhoto(null);
    setConfirm(false);
    setResult(undefined);
    tx.reset();
  }

  if (result) {
    return (
      <Card title={`🌳 Tree #${result.id.toString()} planted`} className="card-success">
        <p>
          Your TreeNFT is minted on Monad. <b>+0.25 $Tree</b> landed in your wallet, <b>+0.05</b> went to the team, and the other
          0.70 of this tree's 1.00 $Tree will be earned over 50 years — 0.25 by you (stake it), 0.45 by the verifiers who check it.
        </p>
        <ul className="links">
          <li>
            <Ext href={explorerTx(result.hash)}>Mint transaction</Ext>
          </li>
          <li>
            <Ext href={explorerToken(addr.TreeNFT, result.id)}>TreeNFT #{result.id.toString()} on the explorer</Ext>
          </li>
          <li>
            {result.pinned ? <Ext href={ipfsUrl(result.uri)}>Metadata on IPFS</Ext> : <span className="muted">Metadata stored on-chain (IPFS pinning not configured)</span>}
          </li>
        </ul>
        <p className="mono small muted">photo sha-256 {result.imageHash}</p>
        <div className="row">
          <button className="btn btn-primary" onClick={goTrees} data-testid="go-stake">
            Stake it → start the 0.25 stream
          </button>
          <button className="btn" onClick={again}>
            Plant another
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="stack">
      <Card title="1 · Photo">
        <PhotoCapture photo={photo} onChange={setPhoto} />
      </Card>

      <Card title="2 · Location">
        <LocationPanel onChange={onLoc} />
        {loc && inRange && preview.data && (
          <div className={`placement ${blocked ? 'placement-bad' : 'placement-ok'}`} data-testid="placement">
            {blocked ? (
              <>
                <b>Too close to tree #{nearestId?.toString()}</b> — {distMm !== undefined && fmtDist(distMm)} away. Move at least{' '}
                {MIN_TREE_DISTANCE_M} m from every existing tree.
              </>
            ) : (
              <>
                ✓ Spot is free{distMm !== undefined && distMm < 1_000_000n ? ` (nearest tree ${fmtDist(distMm)} away)` : ' (no trees nearby)'}.
              </>
            )}
          </div>
        )}
      </Card>

      <Card title="3 · Placement">
        <label className="check">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="confirm-placement" />
          <span>
            This tree is on <b>public land</b> or in a <b>home front yard</b> — somewhere it can plausibly stand for 50 years.
          </span>
        </label>
        <p className="muted small">Trees in pots, on construction sites, or on land that is about to be cleared get kicked by verifiers.</p>
      </Card>

      <button className="btn btn-primary btn-xl" disabled={!ready} onClick={plant} data-testid="plant">
        {step === 'hashing' && 'Hashing photo…'}
        {step === 'pinning' && 'Pinning to IPFS…'}
        {step === 'tx' && (tx.phase === 'wallet' ? 'Confirm in wallet…' : 'Minting…')}
        {step === 'idle' && '🌱 Plant tree & mint TreeNFT'}
      </button>
      {!ready && !working && (
        <p className="muted small center">
          {!photo ? 'Add a photo' : !loc ? 'Waiting for location' : !confirm ? 'Confirm the placement' : blocked ? 'Pick a spot ≥ 15 m from other trees' : ''}
        </p>
      )}
      {prepError && <p className="error" role="alert">⚠ {prepError}</p>}
      <TxStatus tx={tx} />
      <p className="muted small center">
        <Badge tone="info">How it works</Badge> photo + GPS + date → IPFS · hash + coordinates → contract · 15 m rule enforced on-chain
      </p>
    </div>
  );
}
