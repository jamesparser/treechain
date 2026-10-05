import { BaseError, decodeErrorResult, type Abi, type Hex } from 'viem';
import {
  treeNftAbi,
  verificationBountyAbi,
  stakingRewardsAbi,
  verifierRegistryAbi,
  burnVaultAbi,
  treeTokenAbi,
} from '../generated/abis';
import { fmtDate, fmtDist } from './format';

/** Every custom error any TreeChain contract can raise (errors from nested calls bubble up undecoded otherwise). */
const ERROR_ABI = [
  ...treeNftAbi,
  ...verificationBountyAbi,
  ...stakingRewardsAbi,
  ...verifierRegistryAbi,
  ...burnVaultAbi,
  ...treeTokenAbi,
].filter((x) => x.type === 'error') as unknown as Abi;

function revertData(e: BaseError): Hex | undefined {
  let found: Hex | undefined;
  e.walk((x) => {
    const c = x as { raw?: unknown; data?: unknown };
    for (const v of [c.raw, c.data]) {
      if (!found && typeof v === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(v)) found = v as Hex;
    }
    return false;
  });
  return found;
}

function explain(name: string, args: readonly unknown[]): string | undefined {
  switch (name) {
    case 'NotRegistered':
    case 'NotActive':
      return 'Your ID is not active — register it first (one time), and make sure it has not been kicked.';
    case 'AlreadyRegistered':
      return 'This wallet already has an ID.';
    case 'IdTaken':
      return 'That ID is already bound to another wallet. Pick a different handle.';
    case 'EmptyId':
      return 'Enter an ID handle.';
    case 'BadCoordinates':
      return 'Coordinates out of range. TreeChain supports latitudes within ±66°.';
    case 'BadURI':
      return 'Metadata URI is empty or too long.';
    case 'DuplicatePhoto':
      return 'That exact photo was already used by another tree or check. Take a fresh photo.';
    case 'TooClose':
      return `Too close to tree #${args[0]} — only ${fmtDist(args[1] as bigint)} away. Trees must be at least 15 m apart (stops double-counting and GPS noise).`;
    case 'NoSuchTree':
      return 'That tree does not exist.';
    case 'TreeNotAlive':
      return 'This tree was reported dead — its check chain and stake stream have stopped.';
    case 'AllChecksDone':
      return 'All 10 checks for this tree are done.';
    case 'CheckNotDue':
      return `Not due yet — the next check opens ${fmtDate(args[0] as bigint)}.`;
    case 'SelfVerification':
      return 'You planted this tree. A different verifier (different wallet and ID) has to check it.';
    case 'SameVerifierTwice':
      return 'You already did the previous check on this tree. Another verifier has to do this one.';
    case 'TooFarFromTree':
      return `You are ${fmtDist(args[0] as bigint)} from the tree. Get within 50 m to verify it.`;
    case 'NotStaker':
      return 'Only the wallet that staked this tree can do that.';
    case 'NotNFT':
      return 'Only TreeNFTs can be staked here.';
    case 'ZeroAmount':
      return 'Enter an amount greater than zero.';
    case 'BeneficiaryTooLong':
      return 'Beneficiary text is limited to 128 characters.';
    case 'ERC20InsufficientBalance':
      return 'Not enough $Tree in this wallet.';
    default:
      return undefined;
  }
}

export function friendlyError(e: unknown): string {
  if (e instanceof BaseError) {
    const rejected = e.walk((x) => (x as { code?: number }).code === 4001 || (x as Error).name === 'UserRejectedRequestError');
    if (rejected) return 'You rejected the request in your wallet.';

    const data = revertData(e);
    if (data) {
      try {
        const d = decodeErrorResult({ abi: ERROR_ABI, data });
        const msg = explain(d.errorName, (d.args ?? []) as readonly unknown[]);
        if (msg) return msg;
        return `Contract reverted: ${d.errorName}`;
      } catch {
        /* unknown selector — fall through */
      }
    }
    return e.shortMessage || e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
