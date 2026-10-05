import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import type { Address, Hex } from 'viem';
import { addr, isDeployed } from './deployment';
import { treeNftAbi, treeTokenAbi, verifierRegistryAbi, burnVaultAbi, stakingRewardsAbi } from './generated/abis';

export const POLL = 6_000;

/** global protocol stats shown in the header strip */
export function useStats() {
  const q = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'totalSupply' },
      { address: addr.TreeToken, abi: treeTokenAbi, functionName: 'totalSupply' },
      { address: addr.BurnVault, abi: burnVaultAbi, functionName: 'totalRetired' },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'period' },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'lastTokenId' },
    ],
    query: { enabled: isDeployed, refetchInterval: POLL },
  });
  const r = q.data;
  return {
    trees: r?.[0]?.result as bigint | undefined,
    supply: r?.[1]?.result as bigint | undefined,
    retired: r?.[2]?.result as bigint | undefined,
    period: r?.[3]?.result as bigint | undefined,
    lastTokenId: r?.[4]?.result as bigint | undefined,
  };
}

export function useTreeBalance() {
  const { address } = useAccount();
  const q = useReadContract({
    address: addr.TreeToken,
    abi: treeTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && isDeployed, refetchInterval: POLL },
  });
  return q.data as bigint | undefined;
}

export function useIdentity() {
  const { address } = useAccount();
  const q = useReadContracts({
    allowFailure: true,
    contracts: address
      ? [
          { address: addr.VerifierRegistry, abi: verifierRegistryAbi, functionName: 'idOf', args: [address] },
          { address: addr.VerifierRegistry, abi: verifierRegistryAbi, functionName: 'kicked', args: [address] },
        ]
      : [],
    query: { enabled: !!address && isDeployed, refetchInterval: POLL },
  });
  const idHash = q.data?.[0]?.result as Hex | undefined;
  const kicked = q.data?.[1]?.result as boolean | undefined;
  const registered = !!idHash && /[1-9a-f]/i.test(idHash.slice(2));
  return { registered, kicked: !!kicked, loading: q.isLoading, idHash };
}

export interface TreeInfo {
  id: bigint;
  planter: Address;
  latE6: number;
  lonE6: number;
  checks: number;
  plantedAt: bigint;
  deadAt: bigint;
  imageHash: Hex;
  coveredUntil: bigint;
  nextCheckAt: bigint;
  owner?: Address;
  uri?: string;
  pending?: bigint;
  staker?: Address;
}

/** Batched (multicall) details for a list of token ids. */
export function useTrees(ids: bigint[], withStake = false) {
  const per = withStake ? 7 : 5;
  const contracts = ids.flatMap((id) => {
    const base = [
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'getTree', args: [id] },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'coveredUntil', args: [id] },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'nextCheckAt', args: [id] },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'tokenURI', args: [id] },
      { address: addr.TreeNFT, abi: treeNftAbi, functionName: 'ownerOf', args: [id] },
    ];
    return withStake
      ? [
          ...base,
          { address: addr.StakingRewards, abi: stakingRewardsAbi, functionName: 'pending', args: [id] },
          { address: addr.StakingRewards, abi: stakingRewardsAbi, functionName: 'stakes', args: [id] },
        ]
      : base;
  });
  const q = useReadContracts({
    allowFailure: true,
    contracts: contracts as never,
    query: { enabled: isDeployed && ids.length > 0, refetchInterval: POLL },
  });

  const trees: TreeInfo[] = [];
  const data = (q.data ?? []) as { status: string; result?: unknown }[];
  ids.forEach((id, i) => {
    const slice = data.slice(i * per, i * per + per);
    const t = slice[0]?.result as
      | { planter: Address; latE6: number; lonE6: number; checks: number; plantedAt: bigint; deadAt: bigint; imageHash: Hex }
      | undefined;
    if (!t) return;
    const stake = slice[6]?.result as readonly [Address, bigint, bigint] | undefined;
    trees.push({
      id,
      planter: t.planter,
      latE6: Number(t.latE6),
      lonE6: Number(t.lonE6),
      checks: Number(t.checks),
      plantedAt: BigInt(t.plantedAt),
      deadAt: BigInt(t.deadAt),
      imageHash: t.imageHash,
      coveredUntil: (slice[1]?.result as bigint) ?? 0n,
      nextCheckAt: (slice[2]?.result as bigint) ?? 0n,
      uri: slice[3]?.result as string | undefined,
      owner: slice[4]?.result as Address | undefined,
      pending: withStake ? (slice[5]?.result as bigint | undefined) : undefined,
      staker: stake && stake[0] !== '0x0000000000000000000000000000000000000000' ? stake[0] : undefined,
    });
  });
  return { trees, loading: q.isLoading };
}
