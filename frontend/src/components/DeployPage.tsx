import { useState } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { isAddress, type Abi, type Address, type Hash, type Hex } from 'viem';
import {
  activeChain,
  CONTRACT_NAMES,
  clearBrowserDeployment,
  deployment,
  isDeployed,
  STORAGE_KEY,
  type ContractName,
  type Deployment,
} from '../deployment';
import { explorerAddress, explorerTx } from '../lib/format';
import { friendlyError } from '../lib/errors';
import { Card, Ext } from './ui';

interface LogLine {
  label: string;
  status: 'wallet' | 'mining' | 'done' | 'error';
  hash?: Hash;
  address?: Address;
}

/**
 * Deploys + wires all six contracts straight from the connected wallet — every transaction is a normal wallet
 * popup, so no private key ever leaves Trust Wallet. Equivalent to `forge script script/Deploy.s.sol`.
 */
export function DeployPage() {
  const { address, isConnected, chainId } = useAccount();
  const { data: wallet } = useWalletClient();
  const publicClient = usePublicClient();
  const [period, setPeriod] = useState(String(deployment.periodSeconds || 300));
  const [team, setTeam] = useState('');
  const [keepAdmin, setKeepAdmin] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<Deployment>();
  const [copied, setCopied] = useState(false);

  const teamAddr = (team.trim() || address) as Address | undefined;
  const periodN = Number(period);
  const inputsOk = Number.isInteger(periodN) && periodN >= 1 && !!teamAddr && isAddress(teamAddr);
  const wrongChain = isConnected && chainId !== activeChain.id;

  const push = (l: LogLine) => setLog((x) => [...x, l]);
  const patch = (patchLine: Partial<LogLine>) =>
    setLog((x) => x.map((l, i) => (i === x.length - 1 ? { ...l, ...patchLine } : l)));

  async function run() {
    if (!wallet || !publicClient || !address || !teamAddr) return;
    setRunning(true);
    setError(undefined);
    setResult(undefined);
    setLog([]);
    try {
      const abis = await import('../generated/abis');
      const bytecode = (await import('../generated/bytecode.json')).default as Record<ContractName, Hex>;

      async function deploy(name: ContractName, abi: Abi, args: unknown[]): Promise<{ address: Address; block: bigint }> {
        push({ label: `Deploy ${name}`, status: 'wallet' });
        const hash = await wallet!.deployContract({ abi, bytecode: bytecode[name], args, account: address } as never);
        patch({ status: 'mining', hash });
        const r = await publicClient!.waitForTransactionReceipt({ hash });
        if (r.status !== 'success' || !r.contractAddress) throw new Error(`${name} deployment failed`);
        patch({ status: 'done', address: r.contractAddress });
        return { address: r.contractAddress, block: r.blockNumber };
      }
      async function call(label: string, to: Address, abi: Abi, functionName: string, args: unknown[]) {
        push({ label, status: 'wallet' });
        const hash = await wallet!.writeContract({ address: to, abi, functionName, args, account: address } as never);
        patch({ status: 'mining', hash });
        const r = await publicClient!.waitForTransactionReceipt({ hash });
        if (r.status !== 'success') throw new Error(`${label} reverted`);
        patch({ status: 'done' });
      }

      const token = await deploy('TreeToken', abis.treeTokenAbi as Abi, [address]);
      const registry = await deploy('VerifierRegistry', abis.verifierRegistryAbi as Abi, [address]);
      const nft = await deploy('TreeNFT', abis.treeNftAbi as Abi, [token.address, registry.address, teamAddr, BigInt(periodN), address]);
      const staking = await deploy('StakingRewards', abis.stakingRewardsAbi as Abi, [nft.address, token.address, registry.address]);
      const bounty = await deploy('VerificationBounty', abis.verificationBountyAbi as Abi, [nft.address, registry.address, token.address]);
      const vault = await deploy('BurnVault', abis.burnVaultAbi as Abi, [token.address]);

      const tokenAbi = abis.treeTokenAbi as Abi;
      const MINTER = (await publicClient.readContract({ address: token.address, abi: tokenAbi, functionName: 'MINTER_ROLE' })) as Hex;
      const BURNER = (await publicClient.readContract({ address: token.address, abi: tokenAbi, functionName: 'BURNER_ROLE' })) as Hex;
      const CHECKER = (await publicClient.readContract({ address: nft.address, abi: abis.treeNftAbi as Abi, functionName: 'CHECKER_ROLE' })) as Hex;

      await call('Grant $Tree minting to TreeNFT', token.address, tokenAbi, 'grantRole', [MINTER, nft.address]);
      await call('Grant $Tree minting to StakingRewards', token.address, tokenAbi, 'grantRole', [MINTER, staking.address]);
      await call('Grant $Tree minting to VerificationBounty', token.address, tokenAbi, 'grantRole', [MINTER, bounty.address]);
      await call('Grant $Tree burning to BurnVault', token.address, tokenAbi, 'grantRole', [BURNER, vault.address]);
      await call('Let VerificationBounty record checks on TreeNFT', nft.address, abis.treeNftAbi as Abi, 'grantRole', [CHECKER, bounty.address]);
      if (!keepAdmin) {
        const ADMIN = (await publicClient.readContract({ address: token.address, abi: tokenAbi, functionName: 'DEFAULT_ADMIN_ROLE' })) as Hex;
        await call('Freeze $Tree minter set (renounce admin)', token.address, tokenAbi, 'renounceRole', [ADMIN, address]);
      }

      const dep: Deployment = {
        chainId: activeChain.id,
        periodSeconds: periodN,
        deployer: address,
        team: teamAddr,
        deployBlock: Number(token.block),
        deployedAt: Math.floor(Date.now() / 1000),
        contracts: {
          TreeToken: token.address,
          VerifierRegistry: registry.address,
          TreeNFT: nft.address,
          StakingRewards: staking.address,
          VerificationBounty: bounty.address,
          BurnVault: vault.address,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dep));
      } catch {
        /* storage blocked — the JSON below is still the source of truth */
      }
      setResult(dep);
    } catch (e) {
      patch({ status: 'error' });
      setError(friendlyError(e));
    } finally {
      setRunning(false);
    }
  }

  const json = result ? JSON.stringify(result, null, 2) : '';

  return (
    <div className="stack">
      <Card title="Deploy TreeChain from your wallet">
        <p className="muted">
          12 wallet confirmations: six contracts, then the wiring (who may mint / burn / record checks). Nothing but normal
          transaction popups — no private key is ever exported. Same result as <span className="mono">forge script script/Deploy.s.sol</span>.
        </p>
        {isDeployed && (
          <p className="warn small">
            This app already points at a deployment ({deployment.contracts.TreeNFT.slice(0, 10)}…). Deploying again creates a fresh instance that only this
            browser will use, until you commit its JSON.
            <button className="btn btn-ghost" onClick={() => { clearBrowserDeployment(); location.reload(); }}>Reset this browser to the committed deployment</button>
          </p>
        )}
        <div className="grid2">
          <label>
            Verification period (seconds)
            <input value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" data-testid="deploy-period" />
            <span className="muted small">Testnet demo clock: 300 = 5 min. Production: 157788000 (5 years).</span>
          </label>
          <label>
            Team address (gets 0.05 $Tree per tree)
            <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder={address ?? '0x…'} data-testid="deploy-team" />
          </label>
        </div>
        <label className="check small">
          <input type="checkbox" checked={keepAdmin} onChange={(e) => setKeepAdmin(e.target.checked)} />
          Keep admin rights on $Tree (default off: renouncing freezes the minter set so nobody can ever mint outside the emission rules)
        </label>
        {!isConnected && <p className="warn">Connect your wallet first.</p>}
        {wrongChain && <p className="warn">Switch your wallet to {activeChain.name}.</p>}
        <button className="btn btn-primary btn-xl" disabled={!isConnected || wrongChain || !inputsOk || running || !wallet} onClick={run} data-testid="deploy-all">
          {running ? 'Deploying… confirm each popup' : 'Deploy all contracts'}
        </button>
        {error && <p className="error" role="alert">⚠ {error}</p>}
      </Card>

      {log.length > 0 && (
        <Card title="Progress">
          <ol className="deploy-log">
            {log.map((l, i) => (
              <li key={i} className={`dl-${l.status}`}>
                <span>
                  {l.status === 'done' ? '✓' : l.status === 'error' ? '✗' : <span className="spinner" aria-hidden />} {l.label}
                </span>
                <span className="row small">
                  {l.address && <Ext href={explorerAddress(l.address)}>{l.address.slice(0, 8)}…</Ext>}
                  {l.hash && <Ext href={explorerTx(l.hash)}>tx</Ext>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {result && (
        <Card title="🎉 Deployed" className="card-success">
          <p>
            Saved in this browser — <b>reload and the app uses it immediately</b>. To make it live for everyone, either commit this JSON to{' '}
            <span className="mono">frontend/src/generated/deployment.json</span>, or paste it (one line) into the Vercel env var{' '}
            <span className="mono">VITE_DEPLOYMENT_JSON</span> and redeploy.
          </p>
          <textarea readOnly rows={14} value={json} className="mono small" data-testid="deployment-json" onFocus={(e) => e.currentTarget.select()} />
          <div className="row">
            <button
              className="btn"
              onClick={async () => {
                await navigator.clipboard.writeText(json);
                setCopied(true);
              }}
            >
              {copied ? 'Copied ✓' : 'Copy JSON'}
            </button>
            <button className="btn" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(result)); setCopied(true); }}>
              Copy one-line (for Vercel env)
            </button>
            <button className="btn btn-primary" onClick={() => { location.hash = '/plant'; location.reload(); }}>
              Open the app
            </button>
          </div>
          <ul className="links">
            {CONTRACT_NAMES.map((n) => (
              <li key={n}>
                {n}: <Ext href={explorerAddress(result.contracts[n])}>{result.contracts[n]}</Ext>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
