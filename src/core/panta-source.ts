/**
 * Panta prediction-market data path.
 *
 * Panta runs USDC prediction markets on Solana and exposes the whole flow as an
 * API: quote, build an *unsigned* transaction, let the wallet sign, then confirm.
 * The API never holds keys, so the read side — catalog, spot prices, positions —
 * is available to a backend with nothing but an API key.
 *
 * That read side is what this module covers. It is deliberately server-only:
 * the key is read from the environment and never reaches a browser bundle, so
 * the site ships a snapshot built by `npm run panta:snapshot` the same way the
 * pool view does.
 *
 *   PANTA_API_KEY=pk_test_…      # https://docs.panta.market/quickstart
 *
 * Attribution is a condition of the API terms: wherever these numbers surface
 * the UI must say "Powered by Panta".
 */
import { redactEndpoint } from './providers';

export const PANTA_API_BASE = 'https://live-api.panta.market/api/v1';

/** A row from `GET /markets/` — the USDC catalog, not a live chain scan. */
export interface PantaMarket {
  marketId: string;
  category?: string | null;
  title?: string;
  description?: string;
  images?: string[];
  phase?: 'primary' | 'secondary' | 'resolved' | 'cancelled' | string;
  marketType?: string;
  startTime?: number;
  endTime?: number;
  /** Filled by `GET /markets/{id}/` when RPC is available; list rows often leave these null. */
  yesPrice?: number | null;
  noPrice?: number | null;
  volume?: number | null;
  liquidity?: number | null;
  createdByPartner?: boolean;
}

export interface PantaPosition {
  marketId: string;
  category?: string | null;
  side: 'yes' | 'no';
  shares: string;
  phase: string;
  claimable: boolean;
  claimed: boolean;
  outcome: string | null;
}

export interface PantaMarketPage {
  items: PantaMarket[];
  nextCursor: string | null;
}

export interface PantaClientOptions {
  apiKey?: string;
  base?: string;
  fetchImpl?: typeof fetch;
  /** Hard stop so a misbehaving endpoint cannot page us forever. */
  maxPages?: number;
}

/** The configured key, or undefined when the deployment has none. */
export function pantaKey(): string | undefined {
  const key = process.env.PANTA_API_KEY ?? process.env.PANTA_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export function hasPanta(): boolean {
  return pantaKey() !== undefined;
}

/** Never log the credential: show enough to identify it, nothing more. */
export function redactKey(key: string | undefined): string {
  if (!key) return 'none';
  return key.length <= 12 ? `${key.slice(0, 4)}…` : `${key.slice(0, 7)}…${key.slice(-4)}`;
}

export class PantaError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'PantaError';
  }
}

async function pantaFetch<T>(
  path: string,
  options: PantaClientOptions,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const key = options.apiKey ?? pantaKey();
  if (!key) {
    throw new PantaError('PANTA_API_KEY is not set', 401, 'NO_KEY');
  }
  const base = options.base ?? PANTA_API_BASE;
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(`${base}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      'X-Api-Key': key,
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    signal: init?.signal,
  });

  const text = await response.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    /* a non-JSON body is reported through the status below */
  }

  if (!response.ok) {
    const envelope = parsed as { code?: string; message?: string } | undefined;
    throw new PantaError(
      envelope?.message ?? `Panta request failed (${response.status})`,
      response.status,
      envelope?.code,
    );
  }
  return parsed as T;
}

/**
 * Page through the public catalog.
 *
 * `status: 'primary'` is what a launch page cares about: markets that are still
 * trading and therefore still carry a live implied probability.
 */
export async function listPantaMarkets(
  options: PantaClientOptions & {
    category?: string;
    status?: 'primary' | 'secondary' | 'resolved' | 'cancelled';
    limit?: number;
    max?: number;
  } = {},
): Promise<PantaMarket[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 50);
  const max = options.max ?? 200;
  const collected: PantaMarket[] = [];
  let cursor: string | null = null;
  const maxPages = options.maxPages ?? 8;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (options.category) params.set('category', options.category);
    if (options.status) params.set('status', options.status);
    if (cursor) params.set('cursor', cursor);

    const body = await pantaFetch<PantaMarketPage>(`/markets/?${params.toString()}`, options);
    const items = body?.items ?? [];
    collected.push(...items);
    cursor = body?.nextCursor ?? null;
    if (!cursor || collected.length >= max) break;
  }
  return collected.slice(0, max);
}

/** One market with spot prices, when RPC is available to Panta. */
export async function getPantaMarket(
  marketId: string,
  options: PantaClientOptions = {},
): Promise<PantaMarket> {
  return pantaFetch<PantaMarket>(`/markets/${encodeURIComponent(marketId)}/`, options);
}

/** Holdings for a wallet. Each side of the same market is a separate row. */
export async function listPantaPositions(
  wallet: string,
  options: PantaClientOptions = {},
): Promise<PantaPosition[]> {
  const body = await pantaFetch<{ positions?: PantaPosition[] }>(
    `/positions/?wallet=${encodeURIComponent(wallet)}`,
    options,
  );
  return body?.positions ?? [];
}

/**
 * What the market thinks, as a probability.
 *
 * `yesPrice` on a USDC market is already the implied probability of YES, so the
 * only real work is refusing to invent a number when Panta has no spot price —
 * a list row leaves these null on purpose.
 */
export function impliedProbability(market: PantaMarket): number | undefined {
  const yes = market.yesPrice;
  if (typeof yes !== 'number' || !Number.isFinite(yes) || yes <= 0 || yes >= 1) return undefined;
  return yes;
}

/**
 * Value a holding the way the API documents it: spot price while the market is
 * open, settlement value once it is not.
 */
export function positionValue(position: PantaPosition, market?: PantaMarket): number | undefined {
  const shares = Number(position.shares);
  if (!Number.isFinite(shares)) return undefined;
  if (position.outcome) {
    return position.side === position.outcome ? shares * 1 : 0;
  }
  const price = position.side === 'yes' ? market?.yesPrice : market?.noPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) return undefined;
  return shares * price;
}

/** Endpoint summary for provenance lines in the UI. */
export function pantaEndpointLabel(): string {
  return redactEndpoint(PANTA_API_BASE);
}
