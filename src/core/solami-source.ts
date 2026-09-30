/**
 * Solami data path for the live-pool reader.
 *
 * Why this file exists: a public RPC endpoint refuses `getProgramAccounts` on
 * the Dynamic Bonding Curve program, so the original reader had to walk recent
 * *transactions*, collect the accounts they touched and keep whichever ones
 * carried a pool discriminator. That works, but it is a workaround — you only
 * ever see pools that happened to trade inside your window.
 *
 * Solami exposes `getProgramAccountsV2`, which is a filtered server-side
 * enumeration: ask for the DBC program's 424-byte VirtualPool accounts and you
 * get the pools themselves, not a sample of whoever traded last. The same
 * client also carries the Yellowstone gRPC firehose, so the second half of this
 * module can watch the program in real time instead of polling.
 *
 * Both entry points are opt-in: without SOLAMI_RPC_TOKEN the reader falls back
 * to the transaction walk and the stream is simply unavailable. Nothing here is
 * imported by the browser bundle — `livepools.ts` is only ever pulled in by
 * scripts, and the `solami` SDK itself is dynamically imported so a static
 * export never has to resolve it.
 */
import { PublicKey } from '@solana/web3.js';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';

import type { Env } from './providers';

/** VirtualPool discriminator (first eight bytes of the account data). */
export const POOL_DISCRIMINATOR_HEX = 'd5e005d16245775c';
/** TransferHookPool discriminator — same shape, different account type. */
export const TRANSFER_HOOK_POOL_DISCRIMINATOR_HEX = 'eddbb8172abda923';
/** VirtualPool is exactly this many bytes; PoolConfig is 1048. */
export const VIRTUAL_POOL_SIZE = 424;

/** Tokens Solami accepts; the SDK reads SOLAMI_RPC_TOKEN. */
export function solamiToken(env: Env = process.env): string | undefined {
  return env.SOLAMI_RPC_TOKEN ?? env.SOLAMI_API_KEY ?? undefined;
}

export function hasSolami(env: Env = process.env): boolean {
  return Boolean(solamiToken(env));
}

/** Hex discriminator → the base64 bytes a memcmp filter wants. */
export function discriminatorToBase64(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) {
    throw new Error(`discriminator must be hex, got ${JSON.stringify(hex)}`);
  }
  return Buffer.from(clean, 'hex').toString('base64');
}

export interface DiscoveredPools {
  addresses: string[];
  /** How many account rows the server sent back. */
  scanned: number;
  /** True when the enumeration was truncated by our own limit. */
  truncated: boolean;
}

/**
 * Enumerate VirtualPool accounts server-side.
 *
 * The discriminator is filtered with memcmp and the size with dataSize, so the
 * endpoint does the selection work and we transfer pool addresses rather than a
 * slice of chain history.
 */
export async function discoverPoolsViaSolami(
  options: { limit?: number; includeTransferHook?: boolean; env?: Env } = {},
): Promise<DiscoveredPools> {
  const token = solamiToken(options.env ?? process.env);
  if (!token) throw new Error('SOLAMI_RPC_TOKEN is not set');

  const limit = options.limit ?? 64;
  const discriminators = options.includeTransferHook
    ? [POOL_DISCRIMINATOR_HEX, TRANSFER_HOOK_POOL_DISCRIMINATOR_HEX]
    : [POOL_DISCRIMINATOR_HEX];

  const { builder } = await import('solami');
  const client = await builder().withRpc(token).build();

  const addresses: string[] = [];
  let scanned = 0;
  let truncated = false;

  for (const discriminator of discriminators) {
    const rows = client.rpc().getProgramAccountsV2(dbcProgramId(), {
      filters: [
        { memcmp: { offset: 0, bytes: discriminatorToBase64(discriminator), encoding: 'base64' } },
        { dataSize: VIRTUAL_POOL_SIZE },
      ],
      encoding: 'base64',
      commitment: 'confirmed',
      limit,
    });

    for await (const row of rows) {
      scanned += 1;
      if (addresses.length >= limit) {
        truncated = true;
        break;
      }
      addresses.push(row.pubkey);
    }
    if (truncated) break;
  }

  return { addresses, scanned, truncated };
}

/** A web3.js Connection whose reads go through Solami. */
export async function solamiConnection(env: Env = process.env) {
  const token = solamiToken(env);
  if (!token) throw new Error('SOLAMI_RPC_TOKEN is not set');
  const { builder } = await import('solami');
  const client = await builder().withRpc(token).build();
  const connection = client.rpc().connection;
  const { Connection } = await import('@solana/web3.js');
  return connection instanceof Connection ? connection : new Connection(client.rpc().url, 'confirmed');
}

export interface DbcActivity {
  slot: number;
  signature: string;
  /** Account keys touched by the transaction, base58. */
  accounts: string[];
}

/**
 * Pull the account keys out of a Yellowstone transaction update.
 *
 * Kept pure and exported so the shape handling is testable without a live
 * stream: the gRPC update nests the keys under
 * `transaction.transaction.message.accountKeys`, and the message may be a
 * versioned (v0) transaction whose keys are `Uint8Array`s rather than strings.
 */
export function accountsFromUpdate(update: unknown): DbcActivity | null {
  const slotRaw = (update as { slot?: string | number } | null)?.slot;
  const info = (update as { transaction?: { transaction?: unknown; signature?: Uint8Array } } | null)
    ?.transaction;
  if (slotRaw === undefined || !info) return null;

  const message = (info.transaction as { message?: { accountKeys?: unknown[] } } | null)?.message;
  const keys = message?.accountKeys ?? [];
  const accounts = keys
    .map((key) => {
      if (typeof key === 'string') return key;
      if (key instanceof Uint8Array) return base58(key);
      const maybe = key as { pubkey?: { toBase58(): string }; toBase58?: () => string };
      if (maybe?.pubkey?.toBase58) return maybe.pubkey.toBase58();
      if (typeof maybe?.toBase58 === 'function') return maybe.toBase58();
      return null;
    })
    .filter((key): key is string => Boolean(key));

  return {
    slot: Number(slotRaw),
    signature: info.signature ? base58(info.signature) : '',
    accounts,
  };
}

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Minimal base58 encoder — avoids pulling bs58 into the bundle for one call. */
export function base58(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) out += B58_ALPHABET[digits[i]];
  return out;
}

export interface StreamOptions {
  env?: Env;
  /** Called for every DBC transaction the firehose delivers. */
  onActivity: (activity: DbcActivity) => void;
  /** Called on transport errors; the caller decides whether to keep waiting. */
  onError?: (error: Error) => void;
  /** Stop after this many updates (used by the snapshot script). */
  maxUpdates?: number;
  /** Resolve once this many DBC transactions have arrived. */
  stopAfter?: number;
  signal?: AbortSignal;
}

/**
 * Watch the DBC program through Solami's Yellowstone gRPC stream.
 *
 * `subscribeTransactions` filters server-side by program id, so the client only
 * receives transactions that actually touched the bonding curve — the firehose
 * does the parsing work, not us.
 */
export async function streamDbcActivity(options: StreamOptions): Promise<number> {
  const token = solamiToken(options.env ?? process.env);
  if (!token) throw new Error('SOLAMI_RPC_TOKEN is not set');

  const { builder, CommitmentLevel } = await import('solami');
  const client = await builder().withGrpc(token).build();
  const stream = await client
    .grpc()
    .subscribeTransactions('curvecraft-dbc', [dbcProgramId().toBase58()], CommitmentLevel.PROCESSED);

  let seen = 0;
  const stopAt = options.stopAfter ?? options.maxUpdates ?? 0;

  return await new Promise<number>((resolve, reject) => {
    const finish = () => {
      try {
        stream.destroy();
      } catch {
        /* the stream may already be closed */
      }
      resolve(seen);
    };

    options.signal?.addEventListener('abort', finish, { once: true });

    stream.on('data', (update: unknown) => {
      const activity = accountsFromUpdate(update);
      if (!activity) return;
      seen += 1;
      options.onActivity(activity);
      if (stopAt > 0 && seen >= stopAt) finish();
    });

    stream.on('error', (error: Error) => {
      options.onError?.(error);
      if (stopAt > 0) reject(error);
    });

    stream.on('end', finish);
  });
}

/** Program id as a PublicKey, for callers that need it. */
export function dbcProgramId(): PublicKey {
  const id = DYNAMIC_BONDING_CURVE_PROGRAM_ID as unknown;
  return id instanceof PublicKey ? id : new PublicKey(String(id));
}
