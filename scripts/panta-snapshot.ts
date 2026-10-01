/**
 * Write a snapshot of live Panta markets to `src/data/panta-markets.json`.
 *
 * The API key stays server-side: the site imports this file at build time
 * instead of calling Panta from a browser, so nothing ships a credential.
 *
 *   PANTA_API_KEY=pk_test_… npm run panta:snapshot
 *   PANTA_API_KEY=… npm run panta:snapshot -- 60
 *
 * Attribution is a condition of the Panta API terms — wherever these numbers
 * are shown, the UI must say "Powered by Panta".
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getPantaMarket, listPantaMarkets, pantaKey, redactKey, type PantaMarket } from '../src/core/panta-source';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const key = pantaKey();
  if (!key) {
    console.error('PANTA_API_KEY is not set. Get one at https://docs.panta.market/quickstart');
    process.exit(1);
  }
  const limit = Number(process.argv[2] ?? 40);
  const started = Date.now();

  const markets = await listPantaMarkets({ limit: 50, max: limit, status: 'primary' });

  // List rows carry no spot price on purpose; fetch detail only for the ones we
  // will actually show, so the implied probabilities are real numbers.
  const withPrices: PantaMarket[] = [];
  for (const market of markets.slice(0, limit)) {
    try {
      withPrices.push(await getPantaMarket(market.marketId));
    } catch (error) {
      withPrices.push(market);
      console.warn(`  price lookup failed for ${market.marketId.slice(0, 8)}…: ${(error as Error).message.slice(0, 60)}`);
    }
  }

  const priced = withPrices.filter((m) => typeof m.yesPrice === 'number').length;
  const snapshot = {
    markets: withPrices,
    fetchedAt: new Date().toISOString(),
    endpoint: 'live-api.panta.market',
    keyLabel: redactKey(key),
    priced,
  };

  const outfile = join(root, 'src/data/panta-markets.json');
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, JSON.stringify(snapshot, null, 2));

  console.log(`wrote ${outfile}: ${withPrices.length} markets (${priced} with a spot price) in ${Date.now() - started}ms`);
  for (const m of withPrices.slice(0, 12)) {
    const implied = typeof m.yesPrice === 'number' ? `${(m.yesPrice * 100).toFixed(0)}%` : '—';
    console.log(`  ${String(m.phase).padEnd(9)} ${implied.padStart(4)}  ${String(m.title ?? m.marketId).slice(0, 58)}`);
  }
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 240));
  process.exit(1);
});
