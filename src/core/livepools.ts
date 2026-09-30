/**
 * Live DBC pool reader (server-only, used to build a snapshot).
 *
 * Free RPC endpoints refuse `getProgramAccounts` on the DBC program, so instead
 * of indexing the whole program we walk its *recent transactions*, collect the
 * accounts they touched, and keep the ones whose Anchor discriminator says they
 * are virtual pools. That is a handful of ordinary RPC calls and it shows what
 * is launching right now.
 *
 * Two details that cost real debugging time:
 *  - a VirtualPool account is 424 bytes and a PoolConfig is 1048, so size is a
 *    trap; discriminate on the first eight bytes instead;
 *  - `getPool()` returns `{ poolState: { … } }`, not the state fields directly,
 *    and the migration threshold lives on the *config* account, not the pool.
 *
 * Browsers cannot call these endpoints reliably (public ones block indexed
 * requests and several refuse browser origins), so the site ships a snapshot
 * built by `npm run pools:snapshot` instead of querying the chain per visitor.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const QUOTE_DECIMALS = 9; // SOL-quoted launches dominate DBC today.

const POOL_DISCRIMINATORS = new Set([
  'd5e005d16245775c', // VirtualPool
  'eddbb8172abda923', // TransferHookPool
]);

/** Program-owned accounts that are definitely not pools. */
const IGNORED_ACCOUNTS = new Set([
  '11111111111111111111111111111111',
  'ComputeBudget111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'So11111111111111111111111111111111111111112',
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
  'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM',
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
]);

export interface LivePool {
  address: string;
  baseMint: string;
  creator: string;
  config: string;
  /** Quote tokens raised so far, in whole quote units. */
  quoteReserve: number;
  /** Quote tokens needed to graduate, in whole quote units. */
  migrationQuoteThreshold: number;
  progressPct: number;
  isMigrated: boolean;
  /** Virtual base reserve at the current price. */
  baseReserve: number;
  quoteVault: string;
  activationPoint: number | null;
}

export interface LivePoolsSnapshot {
  pools: LivePool[];
  scannedTransactions: number;
  endpoint: string;
  fetchedAt: string;
  /** Populated when the RPC refused part of the walk. */
  warning?: string;
}

function fetchImpl(): typeof fetch {
  return (...args) => globalThis.fetch(...args);
}

export function rpcEndpoint(): string {
  return (
    process.env.SOLANA_RPC_URL ?? process.env.RPC_URL ?? 'https://api.mainnet-beta.solana.com'
  );
}

interface PoolState {
  baseMint?: { toBase58(): string };
  creator?: { toBase58(): string };
  config?: { toBase58(): string };
  quoteVault?: { toBase58(): string };
  quoteReserve?: { toString(): string };
  baseReserve?: { toString(): string };
  isMigrated?: number | boolean;
  activationPoint?: { toString(): string } | number;
}

interface ConfigState {
  migrationQuoteThreshold?: { toString(): string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Read the most recently touched pools on the DBC program.
 *
 * @param limit how many pools to return
 * @param txWindow how many recent program transactions to inspect
 */
export async function readLivePools(limit = 8, txWindow = 12): Promise<LivePoolsSnapshot> {
  const connection = new Connection(rpcEndpoint(), { commitment: 'confirmed', fetch: fetchImpl() });
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const programId = new PublicKey(DYNAMIC_BONDING_CURVE_PROGRAM_ID);
  const warnings: string[] = [];

  const signatures = await connection.getSignaturesForAddress(programId, { limit: txWindow });
  const candidates = new Set<string>();

  for (const { signature } of signatures) {
    await sleep(120);
    let tx = null;
    for (const version of [0, 1] as const) {
      try {
        tx = await connection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: version,
        });
        break;
      } catch {
        /* try the next transaction version */
      }
    }
    if (!tx) warnings.push(`unreadable transaction ${signature.slice(0, 10)}`);
    for (const key of tx?.transaction.message.accountKeys ?? []) {
      const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();
      if (!IGNORED_ACCOUNTS.has(pubkey)) candidates.add(pubkey);
    }
  }

  const keys = [...candidates];
  const poolAddresses: string[] = [];
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20);
    try {
      const infos = await connection.getMultipleAccountsInfo(chunk.map((k) => new PublicKey(k)));
      infos.forEach((info, index) => {
        if (!info || !info.owner.equals(programId)) return;
        const discriminator = Buffer.from(info.data.subarray(0, 8)).toString('hex');
        if (POOL_DISCRIMINATORS.has(discriminator)) poolAddresses.push(chunk[index]);
      });
    } catch (error) {
      warnings.push(`account batch failed: ${(error as Error).message.slice(0, 60)}`);
    }
  }

  const pools: LivePool[] = [];
  for (const address of poolAddresses) {
    if (pools.length >= limit) break;

    let poolState: PoolState | undefined;
    try {
      const account = (await client.state.getPool(address)) as unknown as {
        poolState?: PoolState;
      } | null;
      poolState = account?.poolState;
    } catch (error) {
      warnings.push(
        `decode failed for ${address.slice(0, 8)}: ${(error as Error).message.slice(0, 50)}`,
      );
      continue;
    }
    if (!poolState?.quoteReserve) continue;

    let threshold = 0;
    try {
      const configAddress = poolState.config?.toBase58();
      if (configAddress) {
        const config = (await client.state.getPoolConfig(configAddress)) as unknown as ConfigState;
        threshold =
          Number(config?.migrationQuoteThreshold?.toString() ?? 0) / 10 ** QUOTE_DECIMALS;
      }
    } catch {
      /* the threshold is a nicety; progress falls back to zero */
    }

    const quoteReserve = Number(poolState.quoteReserve.toString()) / 10 ** QUOTE_DECIMALS;
    const activationPoint = poolState.activationPoint
      ? Number(poolState.activationPoint.toString())
      : null;

    pools.push({
      address,
      baseMint: poolState.baseMint?.toBase58() ?? 'unknown',
      creator: poolState.creator?.toBase58() ?? 'unknown',
      config: poolState.config?.toBase58() ?? 'unknown',
      quoteReserve,
      migrationQuoteThreshold: threshold,
      progressPct: threshold > 0 ? Math.min(100, (quoteReserve / threshold) * 100) : 0,
      isMigrated: Boolean(poolState.isMigrated),
      baseReserve: Number(poolState.baseReserve?.toString() ?? 0) / 1e6,
      quoteVault: poolState.quoteVault?.toBase58() ?? 'unknown',
      activationPoint,
    });
  }

  return {
    pools,
    scannedTransactions: signatures.length,
    endpoint: rpcEndpoint(),
    fetchedAt: new Date().toISOString(),
    warning: warnings.length ? warnings.slice(0, 3).join(' · ') : undefined,
  };
}
