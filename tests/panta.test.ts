import { describe, expect, it } from 'vitest';

import {
  PANTA_API_BASE,
  PantaError,
  buildCreateTransaction,
  quoteMarket,
  startTimeProblem,
  timelineProblem,
  usdc,
  impliedProbability,
  listPantaMarkets,
  listPantaPositions,
  pantaKey,
  positionValue,
  redactKey,
  type PantaMarket,
  type PantaPosition,
} from '../src/core/panta-source';

/** A fetch stand-in that records calls and replays canned responses. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  let index = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url: String(url), headers });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const market = (over: Partial<PantaMarket> = {}): PantaMarket => ({
  marketId: 'Event111111111111111111111111111111111111',
  category: 'crypto',
  title: 'SOL above 300 by December?',
  phase: 'primary',
  ...over,
});

describe('panta source', () => {
  it('sends the API key as a header, never in the URL', async () => {
    const { impl, calls } = fakeFetch([{ body: { items: [market()], nextCursor: null } }]);
    await listPantaMarkets({ apiKey: 'pk_test_secret_value', fetchImpl: impl });

    expect(calls[0].url.startsWith(PANTA_API_BASE)).toBe(true);
    expect(calls[0].url).not.toContain('pk_test_secret_value');
    expect(calls[0].headers['X-Api-Key']).toBe('pk_test_secret_value');
  });

  it('pages the catalog with the cursor until it runs out', async () => {
    const { impl, calls } = fakeFetch([
      { body: { items: [market({ marketId: 'A' })], nextCursor: 'cur-1' } },
      { body: { items: [market({ marketId: 'B' })], nextCursor: null } },
    ]);
    const items = await listPantaMarkets({ apiKey: 'k', fetchImpl: impl, limit: 2 });

    expect(items.map((m) => m.marketId)).toEqual(['A', 'B']);
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('cursor=cur-1');
  });

  it('maps an error envelope onto a typed error', async () => {
    const { impl } = fakeFetch([{ status: 401, body: { code: 'UNAUTHORIZED', message: 'authentication required or invalid' } }]);
    await expect(listPantaMarkets({ apiKey: 'bad', fetchImpl: impl })).rejects.toBeInstanceOf(PantaError);
    await expect(listPantaMarkets({ apiKey: 'bad', fetchImpl: impl })).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('refuses to call the API without a key rather than sending an empty header', async () => {
    const previous = process.env.PANTA_API_KEY;
    delete process.env.PANTA_API_KEY;
    delete process.env.PANTA_KEY;
    try {
      expect(pantaKey()).toBeUndefined();
      await expect(listPantaMarkets({ fetchImpl: fakeFetch([{ body: {} }]).impl })).rejects.toMatchObject({
        code: 'NO_KEY',
      });
    } finally {
      if (previous !== undefined) process.env.PANTA_API_KEY = previous;
    }
  });

  it('reads a yes price as an implied probability, and refuses to invent one', () => {
    expect(impliedProbability(market({ yesPrice: 0.62 }))).toBeCloseTo(0.62);
    // List rows leave prices null on purpose; a missing number is not a 0 or a 1.
    expect(impliedProbability(market({ yesPrice: null }))).toBeUndefined();
    expect(impliedProbability(market({}))).toBeUndefined();
    expect(impliedProbability(market({ yesPrice: 1 }))).toBeUndefined();
    expect(impliedProbability(market({ yesPrice: 0 }))).toBeUndefined();
  });

  it('values a position at spot while open and at settlement once resolved', () => {
    const open: PantaPosition = {
      marketId: 'A',
      side: 'yes',
      shares: '38.40',
      phase: 'primary',
      claimable: false,
      claimed: false,
      outcome: null,
    };
    expect(positionValue(open, market({ yesPrice: 0.25 }))).toBeCloseTo(9.6);

    // A resolved winner is worth a dollar a share, not the last spot price.
    const won: PantaPosition = { ...open, claimable: true, outcome: 'yes', phase: 'resolved' };
    expect(positionValue(won, market({ yesPrice: 0.03 }))).toBeCloseTo(38.4);

    const lost: PantaPosition = { ...open, side: 'no', outcome: 'yes', phase: 'resolved' };
    expect(positionValue(lost, market({ yesPrice: 1 }))).toBeCloseTo(0);

    // No spot price and no outcome: say so instead of reporting zero.
    expect(positionValue(open, market({ yesPrice: null }))).toBeUndefined();
  });

  it('returns positions for a wallet', async () => {
    const { impl, calls } = fakeFetch([
      { body: { wallet: 'W', positions: [{ marketId: 'A', side: 'yes', shares: '1' }] } },
    ]);
    const positions = await listPantaPositions('W', { apiKey: 'k', fetchImpl: impl });
    expect(positions).toHaveLength(1);
    expect(calls[0].url).toContain('wallet=W');
  });

  it('redacts the key everywhere it could be printed', () => {
    expect(redactKey('pk_test_abcdefghijklmnop')).toBe('pk_test…mnop');
    expect(redactKey(undefined)).toBe('none');
  });

  it('prices a create quote in USDC, not raw base units', async () => {
    const { impl, calls } = fakeFetch([
      {
        body: {
          createId: 'cr_abc',
          expectedEventPda: 'Event111111111111111111111111111111111111',
          paymentUsdc: '50000000',
          liquidityInjectionUsdc: '10000000',
          platformRevenueUsdc: '40000000',
        },
      },
    ]);
    const quote = await quoteMarket(
      {
        wallet: 'Creator1111111111111111111111111111111111',
        question: 'Will this curve graduate before 1 December?',
        resolutionRule: 'Resolves YES if the pool migrates to DAMM v2 by the end time.',
        sourcesOfTruth: ['https://example.com/pool'],
        category: 'crypto',
        startTime: 1_800_000_000,
        endTime: 1_800_600_000,
        resolutionTime: 1_800_700_000,
        imageUrl: 'https://example.com/market.png',
      },
      { apiKey: 'k', fetchImpl: impl },
    );

    expect(calls[0].url).toContain('/markets/create/quote/');
    expect(quote.createId).toBe('cr_abc');
    // The API speaks base units; the UI must not print 50000000 as dollars.
    expect(usdc(quote.paymentUsdc)).toBe(50);
    expect(usdc(quote.liquidityInjectionUsdc)).toBe(10);
    expect(usdc(undefined)).toBeUndefined();
  });

  it('builds an unsigned transaction and never sends a signature', async () => {
    const { impl } = fakeFetch([
      { body: { createId: 'cr_abc', transaction: 'AQAAA…', recentBlockhash: 'BH1', buildFingerprint: 'fp' } },
    ]);
    const built = await buildCreateTransaction('cr_abc', 'Creator1111111111111111111111111111111111', {
      apiKey: 'k',
      fetchImpl: impl,
    });
    expect(built.transaction).toBe('AQAAA…');
    // Panta builds and verifies; it must never be handed a key or a signature here.
    expect(built).not.toHaveProperty('signature');
  });

  it('catches an impossible timeline before spending a request on it', () => {
    const now = 1_800_000_000_000; // ms
    expect(startTimeProblem(1_800_000_000, now)).toBe('Start time is in the past.');
    expect(startTimeProblem(1_800_000_600, now)).toMatch(/at least 60 minutes/);
    expect(startTimeProblem(1_800_007_200, now)).toBeUndefined();

    expect(timelineProblem(100, 50, 200)).toMatch(/close after it opens/);
    expect(timelineProblem(100, 200, 150)).toMatch(/Resolution cannot happen before/);
    expect(timelineProblem(100, 200, 300)).toBeUndefined();
  });
});
