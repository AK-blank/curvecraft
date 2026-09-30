/**
 * Write a snapshot of the most recently active DBC pools to
 * `src/data/pools-snapshot.json`, which the /pools page imports at build time.
 *
 *   npm run pools:snapshot
 *   SOLANA_RPC_URL=... npm run pools:snapshot
 *
 * RPC caveat: this needs an endpoint that allows `getSignaturesForAddress` +
 * `getMultipleAccountsInfo` (the public mainnet endpoint does; some free
 * providers block both). Nothing here is needed at runtime.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readLivePools } from '../src/core/livepools';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const limit = Number(process.argv[2] ?? 12);
  const started = Date.now();
  const snapshot = await readLivePools(limit, 16);
  const outfile = join(root, 'src/data/pools-snapshot.json');
  mkdirSync(dirname(outfile), { recursive: true });
  writeFileSync(outfile, JSON.stringify(snapshot, null, 2));
  console.log(
    `wrote ${outfile}: ${snapshot.pools.length} pools from ${snapshot.scannedTransactions} txs in ${Date.now() - started}ms`,
  );
  for (const pool of snapshot.pools) {
    console.log(
      `  ${pool.address.slice(0, 8)}… ${pool.progressPct.toFixed(1)}%  ${pool.quoteReserve.toFixed(2)} / ${pool.migrationQuoteThreshold.toFixed(2)}  mint ${pool.baseMint.slice(0, 8)}…`,
    );
  }
  if (snapshot.warning) console.log('warning:', snapshot.warning);
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 200));
  process.exit(1);
});
