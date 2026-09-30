/**
 * Live DBC pool reader (server-only).
 *
 * Free RPC endpoints refuse `getProgramAccounts` on the DBC program, so instead
 * of indexing the whole program we walk the program's *recent transactions*,
 * collect the accounts they touched, and keep the ones that decode as virtual
 * pools. That gives a fresh view of launches happening right now with a handful
 * of ordinary RPC calls.
 */
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DYNAMIC_BONDING_CURVE_PROGRAM_ID,
  DynamicBondingCurveClient,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

export interface LivePool {
  address: string;
  baseMint: string;
  creator: string;
  quoteReserve: number;
  migrationQuoteThreshold: number;
  progressPct: number;
  graduated: boolean;
  /** Total trading fees collected by the pool, in quote units. */
  totalTradingQuoteFee: number | null;
  createdAtSlot: number | null;
}

export interface LivePoolsResult {
  pools: LivePool[];
  scannedTransactions: number;
  endpoint: string;
  fetchedAt: string;
  error?: string;
}

/** web3.js v1 bundles node-fetch, which ignores HTTP(S)_PROXY; use Node's fetch. */
function fetchImpl(): typeof fetch {
  return (...args) => globalThis.fetch(...args);
}

export function rpcEndpoint(): string {
  return (
    process.env.SOLANA_RPC_URL ??
    process.env.RPC_URL ??
    'https://solana-rpc.publicnode.com'
  );
}

function createConnection(): Connection {
  return new Connection(rpcEndpoint(), { commitment: 'confirmed', fetch: fetchImpl() });
}

interface RawPoolAccount {
  baseMint?: { toBase58(): string };
  creator?: { toBase58(): string };
  quoteReserve?: { toString(): string };
  migrationQuoteThreshold?: { toString(): string };
  sqrtStartPrice?: { toString(): string };
  config?: { toBase58(): string };
}

const QUOTE_DECIMALS = 9; // SOL-quoted launches dominate DBC today.

/**
 * Read the most recently touched pools on the DBC program.
 *
 * @param limit how many pools to return
 * @param txWindow how many recent program transactions to inspect
 */
let cache: { at: number; promise: Promise<LivePoolsResult> } | null = null;
const CACHE_TTL_MS = 60_000;

export async function readLivePools(limit = 8, txWindow = 6): Promise<LivePoolsResult> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
  const promise = readLivePoolsUncached(limit, txWindow);
  cache = { at: Date.now(), promise };
  return promise;
}

async function readLivePoolsUncached(limit = 8, txWindow = 6): Promise<LivePoolsResult> {
  const connection = createConnection();
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const programId = new PublicKey(DYNAMIC_BONDING_CURVE_PROGRAM_ID);

  const signatures = await connection.getSignaturesForAddress(programId, { limit: txWindow });
  const candidates = new Set<string>();

  for (const { signature } of signatures) {
    await new Promise((resolve) => setTimeout(resolve, 120));
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
    for (const key of tx?.transaction.message.accountKeys ?? []) {
      const pubkey = typeof key === 'string' ? key : key.pubkey.toBase58();
      if (pubkey !== programId.toBase58()) candidates.add(pubkey);
    }
  }

  const IGNORED = new Set([
    '11111111111111111111111111111111',
    'ComputeBudget111111111111111111111111111111',
    'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
    'So11111111111111111111111111111111111111112',
    'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
    'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM',
    programId.toBase58(),
  ]);
  const keys = [...candidates].filter((key) => !IGNORED.has(key));

  // Public RPCs cap batch sizes; keep chunks small and tolerate failures.
  const poolAddresses: string[] = [];
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20);
    try {
      const infos = await connection.getMultipleAccountsInfo(
        chunk.map((k) => new PublicKey(k)),
      );
      infos.forEach((info, index) => {
        // Configs and pools share the program; pools are the larger accounts.
        if (info && info.owner.equals(programId) && info.data.length >= 900) {
          poolAddresses.push(chunk[index]);
        }
      });
    } catch {
      /* skip chunks the RPC refuses */
    }
  }

  const pools: LivePool[] = [];
  for (const address of poolAddresses.slice(0, limit)) {
    // Some accounts touched by the program are not virtual pools at all.
    let account: RawPoolAccount | null = null;
    try {
      account = (await client.state.getPool(address)) as unknown as RawPoolAccount | null;
    } catch {
      continue;
    }
    if (!account?.quoteReserve) continue;

    const quoteReserve = Number(account.quoteReserve.toString()) / 10 ** QUOTE_DECIMALS;
    const threshold = Number(account.migrationQuoteThreshold?.toString() ?? 0) / 10 ** QUOTE_DECIMALS;

    let totalTradingQuoteFee: number | null = null;
    try {
      const fees = await client.state.getPoolFeeMetrics(address);
      const total = (fees as unknown as { total?: { totalTradingQuoteFee?: { toString(): string } } })
        ?.total?.totalTradingQuoteFee;
      if (total) totalTradingQuoteFee = Number(total.toString()) / 10 ** QUOTE_DECIMALS;
    } catch {
      /* fee metrics are best-effort */
    }

    pools.push({
      address,
      baseMint: account.baseMint?.toBase58?.() ?? 'unknown',
      creator: account.creator?.toBase58?.() ?? 'unknown',
      quoteReserve,
      migrationQuoteThreshold: threshold,
      progressPct: threshold > 0 ? Math.min(100, (quoteReserve / threshold) * 100) : 0,
      graduated: threshold > 0 && quoteReserve >= threshold,
      totalTradingQuoteFee,
      createdAtSlot: null,
    });
  }

  return {
    pools,
    scannedTransactions: signatures.length,
    endpoint: rpcEndpoint(),
    fetchedAt: new Date().toISOString(),
  };
}
