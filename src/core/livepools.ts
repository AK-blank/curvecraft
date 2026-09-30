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

import { redactEndpoint, resolveRpcProvider } from './providers';
import type { LaunchSpec } from './types';

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

const WRAPPED_SOL = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Reverse of the preset -> enum map in `build.ts`. */
const MIGRATION_FEE_PRESETS: Record<number, LaunchSpec['migrationFeePreset']> = {
  0: 25,
  1: 30,
  2: 100, // the on-chain enum has a 50 bps option the studio presets do not offer
  3: 100,
  4: 200,
  5: 400,
  6: 600,
};

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
  /** A launch spec reconstructed from this pool's on-chain config. */
  design?: LaunchSpec;
}

export interface LivePoolsSnapshot {
  pools: LivePool[];
  scannedTransactions: number;
  /** Redacted endpoint the snapshot was read through. */
  endpoint: string;
  /** Which provider served it: public, rpcfast, solami or custom. */
  provider: string;
  fetchedAt: string;
  /** Populated when the RPC refused part of the walk. */
  warning?: string;
}

function fetchImpl(): typeof fetch {
  return (...args) => globalThis.fetch(...args);
}

export function rpcEndpoint(): string {
  return resolveRpcProvider().url;
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
  migrationSqrtPrice?: { toString(): string };
  sqrtStartPrice?: { toString(): string };
  preMigrationTokenSupply?: { toString(): string };
  migrationBaseThreshold?: { toString(): string };
  tokenDecimal?: number;
  quoteMint?: { toBase58(): string };
  collectFeeMode?: number;
  migrationOption?: number;
  migrationFeeOption?: number;
  creatorTradingFeePercentage?: number;
  creatorLiquidityPercentage?: number;
  creatorPermanentLockedLiquidityPercentage?: number;
  partnerLiquidityPercentage?: number;
  partnerPermanentLockedLiquidityPercentage?: number;
  poolFees?: { baseFee?: { cliffFeeNumerator?: { toString(): string } } };
}

const Q64 = 2 ** 64;

function num(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toString' in (value as object)) {
    return Number((value as { toString(): string }).toString());
  }
  return Number(value);
}

/**
 * Rebuild a studio design from a live pool's config account.
 *
 * Market caps, supply and the liquidity split are exact — they are read straight
 * off the config. The fee schedule is the one approximation: the program packs a
 * decaying schedule into `cliffFeeNumerator`/`secondFactor`/`thirdFactor`, so we
 * take the *current* base fee and model it as flat. The returned spec says so in
 * its description, which travels with the design into the studio and the report.
 */
export function specFromPoolConfig(
  config: ConfigState,
  pool: { address: string; creator: string; progressPct: number },
): LaunchSpec | null {
  const quoteMint = config.quoteMint?.toBase58?.() ?? WRAPPED_SOL;
  const quoteAsset = quoteMint === USDC_MINT ? 'USDC' : 'SOL';
  const quoteDecimals = quoteAsset === 'USDC' ? 6 : 9;
  const baseDecimals = config.tokenDecimal ?? 6;

  const rawSupply = num(config.preMigrationTokenSupply);
  if (!rawSupply) return null;
  const totalSupply = rawSupply / 10 ** baseDecimals;

  const sqrtStart = num(config.sqrtStartPrice) / Q64;
  const sqrtMigration = num(config.migrationSqrtPrice) / Q64;
  if (!sqrtStart || !sqrtMigration) return null;

  const startPrice = sqrtStart ** 2 / 10 ** (quoteDecimals - 6);
  const migrationPrice = sqrtMigration ** 2 / 10 ** (quoteDecimals - 6);

  const migrationBase = num(config.migrationBaseThreshold) || totalSupply * 0.2;
  const percentageSupplyOnMigration = Math.min(
    95,
    Math.max(1, Math.round((migrationBase / rawSupply) * 100)),
  );

  const feeBps = Math.max(
    1,
    Math.round(num(config.poolFees?.baseFee?.cliffFeeNumerator) / 1e5) || 100,
  );

  const spec: LaunchSpec = {
    name: `Live pool ${pool.address.slice(0, 6)}…${pool.address.slice(-4)}`,
    description: `Reconstructed from the on-chain config of pool ${pool.address} (creator ${pool.creator.slice(0, 8)}…, ${pool.progressPct.toFixed(0)}% of its raise at snapshot time). Start and graduation market cap, supply and the current on-chain base fee are exact; the fee schedule is modelled as a flat ${(feeBps / 100).toFixed(2)}% because the program packs a decaying schedule into the config account, and rebuilding the curve through those two prices will not reproduce the original segment layout byte for byte.`,
    quoteAsset,
    totalSupply,
    initialMarketCap: startPrice * totalSupply,
    migrationMarketCap: migrationPrice * totalSupply,
    percentageSupplyOnMigration,
    feeMode: 'linear',
    feeSchedule: {
      startingFeeBps: feeBps,
      endingFeeBps: feeBps,
      numberOfPeriods: 0,
      totalDurationSec: 0,
    },
    dynamicFee: { enabled: false },
    collectFeeMode: config.collectFeeMode === 0 ? 'output' : 'quote',
    migrationTarget: config.migrationOption === 1 ? 'dammV2' : 'dammV1',
    migrationFeePreset: MIGRATION_FEE_PRESETS[config.migrationFeeOption ?? 3] ?? 100,
    creatorTradingFeePercentage: config.creatorTradingFeePercentage ?? 0,
    liquidityDistribution: {
      partnerLiquidityPercentage: config.partnerLiquidityPercentage ?? 0,
      partnerPermanentLockedLiquidityPercentage:
        config.partnerPermanentLockedLiquidityPercentage ?? 0,
      creatorLiquidityPercentage: config.creatorLiquidityPercentage ?? 100,
      creatorPermanentLockedLiquidityPercentage:
        config.creatorPermanentLockedLiquidityPercentage ?? 0,
    },
  };

  return spec;
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
    let design: LaunchSpec | undefined;
    try {
      const configAddress = poolState.config?.toBase58();
      if (configAddress) {
        const config = (await client.state.getPoolConfig(configAddress)) as unknown as ConfigState;
        threshold =
          Number(config?.migrationQuoteThreshold?.toString() ?? 0) / 10 ** QUOTE_DECIMALS;
        const progressPct = threshold > 0 ? (Number(poolState.quoteReserve.toString()) / 10 ** QUOTE_DECIMALS / threshold) * 100 : 0;
        design =
          specFromPoolConfig(config, {
            address,
            creator: poolState.creator?.toBase58() ?? 'unknown',
            progressPct,
          }) ?? undefined;
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
      design,
    });
  }

  const provider = resolveRpcProvider();
  return {
    pools,
    scannedTransactions: signatures.length,
    endpoint: redactEndpoint(provider.url),
    provider: provider.label,
    fetchedAt: new Date().toISOString(),
    warning: warnings.length ? warnings.slice(0, 3).join(' · ') : undefined,
  };
}
