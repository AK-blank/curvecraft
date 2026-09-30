/**
 * Read live DBC pools with the shared live-pools reader.
 *
 *   HTTPS_PROXY=http://127.0.0.1:7890 node --use-env-proxy --import tsx scripts/live-pools.ts
 */
import { readLivePools } from '../src/core/livepools';

async function main() {
  const started = Date.now();
  const result = await readLivePools(8, 8);
  console.log('endpoint:', result.endpoint);
  console.log('scanned', result.scannedTransactions, 'txs in', Date.now() - started, 'ms');
  console.log('pools found:', result.pools.length);
  for (const pool of result.pools) {
    console.log(
      `  ${pool.address.slice(0, 8)}… progress ${pool.progressPct.toFixed(2)}%  raised ${pool.quoteReserve.toFixed(2)} / ${pool.migrationQuoteThreshold.toFixed(2)} SOL  fees ${pool.totalTradingQuoteFee?.toFixed(3) ?? '—'}  mint ${pool.baseMint.slice(0, 8)}…`,
    );
  }
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 300));
  process.exit(1);
});
