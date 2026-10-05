import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { addr, isDeployed } from '../deployment';
import { stakingRewardsAbi, treeNftAbi } from '../generated/abis';
import { POLL, useStats, useTrees, type TreeInfo } from '../data';
import { useNow, useTx } from '../hooks';
import { explorerToken, fmtDate, fmtDuration, fmtTree, ipfsUrl } from '../lib/format';
import { fromE6 } from '../lib/geo';
import { Badge, Card, Empty, Ext, Pips, TxStatus } from './ui';

export function TreesTab() {
  const { address } = useAccount();
  const balance = useReadContract({
    address: addr.TreeNFT,
    abi: treeNftAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isDeployed, refetchInterval: POLL },
  });
  const staked = useReadContract({
    address: addr.StakingRewards,
    abi: stakingRewardsAbi,
    functionName: 'stakedTokensOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isDeployed, refetchInterval: POLL },
  });
  const n = Number((balance.data as bigint | undefined) ?? 0n);
  const ownedIds = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: n }, (_, i) => ({
      address: addr.TreeNFT,
      abi: treeNftAbi,
      functionName: 'tokenOfOwnerByIndex',
      args: [address!, BigInt(i)],
    })) as never,
    query: { enabled: !!address && n > 0, refetchInterval: POLL },
  });

  const owned = ((ownedIds.data ?? []) as { result?: bigint }[]).map((r) => r.result).filter((x): x is bigint => x !== undefined);
  const stakedIds = [...((staked.data as readonly bigint[] | undefined) ?? [])];
  const ids = [...stakedIds, ...owned].sort((a, b) => (a < b ? -1 : 1));
  const { trees, loading } = useTrees(ids, true);
  const { period } = useStats();

  const loadingAny = balance.isLoading || staked.isLoading || loading;
  return (
    <div className="stack">
      {loadingAny && ids.length === 0 && <Empty>Loading your trees…</Empty>}
      {!loadingAny && ids.length === 0 && <Empty>No trees yet — plant your first one 🌱</Empty>}
      {trees.map((t) => (
        <TreeCard key={t.id.toString()} tree={t} mine period={period} />
      ))}
    </div>
  );
}

export function treeStatus(t: TreeInfo, now: number) {
  if (t.deadAt > 0n) return { tone: 'bad' as const, label: 'Reported dead' };
  if (t.checks >= 10) return { tone: 'ok' as const, label: 'Fully verified · 50 years' };
  if (t.nextCheckAt > 0n && BigInt(now) >= t.nextCheckAt) return { tone: 'warn' as const, label: 'Check due — needs a verifier' };
  return { tone: 'ok' as const, label: `Alive · next check in ${fmtDuration(Number(t.nextCheckAt) - now)}` };
}

function TreeCard({ tree: t, period }: { tree: TreeInfo; mine?: boolean; period?: bigint }) {
  const { address } = useAccount();
  const now = useNow();
  const tx = useTx();
  const status = treeStatus(t, now);
  const isStaked = !!t.staker;
  const iOwn = t.owner?.toLowerCase() === address?.toLowerCase();
  const iStaked = t.staker?.toLowerCase() === address?.toLowerCase();
  const streaming = isStaked && t.deadAt === 0n && BigInt(now) < t.coveredUntil;
  const paused = isStaked && t.deadAt === 0n && !streaming && t.checks < 10;
  const lifeEnds = t.plantedAt + (period ?? 0n) * 10n;

  return (
    <Card
      title={`🌳 Tree #${t.id.toString()}`}
      right={<Badge tone={status.tone}>{status.label}</Badge>}
      className="tree-card"
    >
      <Pips done={t.checks} dead={t.deadAt > 0n} />
      <dl className="facts">
        <div>
          <dt>Planted</dt>
          <dd>{fmtDate(t.plantedAt)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd className="mono">
            {fromE6(t.latE6).toFixed(6)}, {fromE6(t.lonE6).toFixed(6)}
          </dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd>{t.checks} / 10</dd>
        </div>
        {period !== undefined && period > 0n && (
          <div>
            <dt>50-year mark</dt>
            <dd>{fmtDate(lifeEnds)}</dd>
          </div>
        )}
      </dl>

      {isStaked ? (
        <div className="stake-box">
          <div>
            <span className="muted small">Staking stream</span>
            <div className="big" data-testid={`pending-${t.id}`}>{fmtTree(t.pending, 5)} $Tree</div>
            <span className="muted small">
              {streaming ? 'streaming now' : paused ? 'paused — waiting for the next verification' : t.deadAt > 0n ? 'stopped — tree reported dead' : 'complete'}
            </span>
          </div>
          {iStaked && (
            <div className="row">
              <button className="btn btn-primary" disabled={tx.busy || !t.pending} data-testid={`claim-${t.id}`} onClick={() => tx.send({ address: addr.StakingRewards, abi: stakingRewardsAbi, functionName: 'claim', args: [t.id] })}>
                Claim
              </button>
              <button className="btn" disabled={tx.busy} data-testid={`unstake-${t.id}`} onClick={() => tx.send({ address: addr.StakingRewards, abi: stakingRewardsAbi, functionName: 'unstake', args: [t.id] })}>
                Unstake
              </button>
            </div>
          )}
        </div>
      ) : (
        iOwn &&
        t.deadAt === 0n && (
          <div className="stake-box">
            <div className="muted small">Stake this TreeNFT to stream your 0.25 $Tree over 50 years — it pays while the tree stays verified alive.</div>
            <button
              className="btn btn-primary"
              disabled={tx.busy}
              data-testid={`stake-${t.id}`}
              onClick={() =>
                tx.send({ address: addr.TreeNFT, abi: treeNftAbi, functionName: 'safeTransferFrom', args: [address!, addr.StakingRewards, t.id] })
              }
            >
              Stake
            </button>
          </div>
        )
      )}
      <TxStatus tx={tx} />
      <div className="row links">
        <Ext href={explorerToken(addr.TreeNFT, t.id)}>Explorer</Ext>
        {t.uri && !t.uri.startsWith('data:') && <Ext href={ipfsUrl(t.uri)}>Metadata</Ext>}
      </div>
    </Card>
  );
}
