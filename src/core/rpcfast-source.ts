/**
 * RPC Fast data path for pool discovery.
 *
 * RPC Fast serves the ordinary Solana method set, with one extension that
 * matters here: `getProgramAccountsPaginated`. The plain
 * `getProgramAccounts` call is refused once a result set grows past their
 * safety limit —
 *
 *   {"code":-32074,"message":"response exceeds an unpaginated safety limit;
 *    use getProgramAccountsPaginated"}
 *
 * — which is the same wall a public endpoint hits, just with a documented way
 * over it. Each page costs one request, and asking for a zero-length
 * `dataSlice` means we transfer pool addresses rather than pool state.
 *
 * So the reader has two ways to ask for the pools themselves (this and
 * Solami's `getProgramAccountsV2`) and one way to make do without either (the
 * transaction walk). All three produce the same snapshot shape.
 */
import { PublicKey } from '@solana/web3.js';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from '@meteora-ag/dynamic-bonding-curve-sdk';

import { POOL_DISCRIMINATOR_HEX, TRANSFER_HOOK_POOL_DISCRIMINATOR_HEX, VIRTUAL_POOL_SIZE, discriminatorToBase64 } from './solami-source';
import type { DiscoveredPools } from './solami-source';
import { resolveRpcProvider } from './providers';

interface PaginatedAccount {
  pubkey: string;
  account: { lamports: number; owner: string; data: unknown; executable: boolean; rentEpoch: number; space?: number };
}

interface PaginatedResult {
  context?: { slot: number };
  value?: { accounts?: PaginatedAccount[]; paginationKey?: string | null };
}

export interface RpcFastOptions {
  limit?: number;
  includeTransferHook?: boolean;
  endpoint?: string;
  /** Hard stop on pages so a misbehaving endpoint cannot loop us forever. */
  maxPages?: number;
  fetchImpl?: typeof fetch;
}

/** One page of the paginated enumeration. Exported for the tests. */
export async function fetchPoolPage(
  endpoint: string,
  discriminator: string,
  paginationKey: string | null,
  pageSize: number,
  fetchImpl: typeof fetch = fetch,
): Promise<{ accounts: PaginatedAccount[]; paginationKey: string | null }> {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getProgramAccountsPaginated',
    params: [
      new PublicKey(DYNAMIC_BONDING_CURVE_PROGRAM_ID).toBase58(),
      {
        commitment: 'confirmed',
        encoding: 'base64',
        filters: [
          { memcmp: { offset: 0, bytes: discriminatorToBase64(discriminator), encoding: 'base64' } },
          { dataSize: VIRTUAL_POOL_SIZE },
        ],
        // Keys only: we decode the pool state through the SDK afterwards.
        dataSlice: { offset: 0, length: 0 },
        limit: pageSize,
        paginationKey,
      },
    ],
  };

  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: { result?: PaginatedResult; error?: { code: number; message: string } };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`getProgramAccountsPaginated returned non-JSON: ${text.slice(0, 80)}`);
  }
  if (parsed.error) throw new Error(`${parsed.error.code}: ${parsed.error.message.slice(0, 120)}`);
  return {
    accounts: parsed.result?.value?.accounts ?? [],
    paginationKey: parsed.result?.value?.paginationKey ?? null,
  };
}

/** Walk every page and return the pool addresses. */
export async function discoverPoolsViaRpcFast(options: RpcFastOptions = {}): Promise<DiscoveredPools> {
  const endpoint = options.endpoint ?? resolveRpcProvider().url;
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 1024;
  const maxPages = options.maxPages ?? 8;
  const discriminators = options.includeTransferHook
    ? [POOL_DISCRIMINATOR_HEX, TRANSFER_HOOK_POOL_DISCRIMINATOR_HEX]
    : [POOL_DISCRIMINATOR_HEX];

  const addresses: string[] = [];
  let scanned = 0;
  let truncated = false;

  for (const discriminator of discriminators) {
    let key: string | null = null;
    for (let page = 0; page < maxPages; page += 1) {
      const chunk = await fetchPoolPage(endpoint, discriminator, key, Math.min(1000, Math.max(1, limit - addresses.length)), fetchImpl);
      scanned += chunk.accounts.length;
      for (const account of chunk.accounts) {
        if (addresses.length >= limit) {
          truncated = true;
          break;
        }
        addresses.push(account.pubkey);
      }
      key = chunk.paginationKey;
      if (!key || truncated) break;
    }
    if (truncated) break;
  }

  return { addresses, scanned, truncated };
}
