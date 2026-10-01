/**
 * Measure what founders actually choose on Meteora's Dynamic Bonding Curve.
 *
 * Every preset in the studio is a design *opinion*. This is the evidence behind
 * those opinions: it enumerates live VirtualPool accounts on mainnet, rebuilds
 * each launch's config, and reports the distribution of the choices that real
 * launches shipped — quote asset, migration target, fee, raise size, and how far
 * along the curve they actually got.
 *
 *   npm run pools:analyze          # 80 pools
 *   npm run pools:analyze 200      # deeper sample
 *
 * Needs the same endpoint as `pools:snapshot`: one that allows a filtered
 * server-side enumeration (Solami `getProgramAccountsV2` or RPC Fast's
 * paginated `getProgramAccounts`). Nothing here runs at runtime.
 */
import { readLivePools, type LivePool } from '../src/core/livepools';
import type { LaunchSpec } from '../src/core/types';

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))];
}

function tally<T extends string | number>(values: T[]): Array<[T, number, number]> {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, n]) => [k, n, (n / values.length) * 100] as [T, number, number])
    .sort((a, b) => b[1] - a[1]);
}

function money(value: number): string {
  if (!Number.isFinite(value)) return 'n/a';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${value.toFixed(0)}`;
}

function table(title: string, rows: Array<[string, number, number]>): void {
  console.log(`\n${title}`);
  for (const [label, count, pct] of rows) {
    const bar = '█'.repeat(Math.max(1, Math.round(pct / 4)));
    console.log(`  ${String(label).padEnd(18)} ${String(count).padStart(4)}  ${pct.toFixed(1).padStart(5)}%  ${bar}`);
  }
}

function report(pools: LivePool[], discovery: string, provider: string, fetchedAt: string): void {
  const designed = pools.filter((p) => p.design) as Array<LivePool & { design: LaunchSpec }>;
  console.log(`\nSampled ${pools.length} live DBC pools (${designed.length} with a decodable config)`);
  console.log(`discovery: ${discovery}`);
  console.log(`provider:  ${provider}`);
  console.log(`fetched:   ${fetchedAt}`);

  if (!designed.length) return;

  // ── What they shipped ────────────────────────────────────────────────────
  table(
    'Quote asset (what the launch is priced against)',
    tally(designed.map((p) => p.design.quoteAsset as string)),
  );
  table(
    'Migration target',
    tally(designed.map((p) => p.design.migrationTarget as string)),
  );
  table(
    'Fees collected in',
    tally(designed.map((p) => p.design.collectFeeMode as string)),
  );
  table(
    'Migration fee preset (bps)',
    tally(designed.map((p) => String(p.design.migrationFeePreset))),
  );

  const baseFees = designed.map((p) => p.design.feeSchedule?.startingFeeBps ?? 0).filter((v) => v > 0);
  const creatorShares = designed.map((p) => p.design.creatorTradingFeePercentage ?? 0);
  // The permanent-locked percentages are not the rule: the program checks the
  // share still locked one day after migration, and vesting counts. Reported
  // separately so the difference is visible rather than assumed.
  const creatorPermanentLocked = designed.map(
    (p) => p.design.liquidityDistribution?.creatorPermanentLockedLiquidityPercentage ?? 0,
  );
  const dayOneLocked = designed
    .map((p) => p.dayOneLockedBps)
    .filter((v): v is number => typeof v === 'number');
  const belowRule = dayOneLocked.filter((bps) => bps < 1000).length;

  const startCaps = designed.map((p) => p.design.initialMarketCap).filter((v) => v > 0);
  const migCaps = designed.map((p) => p.design.migrationMarketCap).filter((v) => v > 0);
  const supplyOnMig = designed.map((p) => p.design.percentageSupplyOnMigration).filter((v) => v > 0);

  console.log('\nParameters across the sample (median / p25 / p75)');
  const line = (label: string, values: number[], fmt: (v: number) => string) => {
    if (!values.length) return;
    console.log(
      `  ${label.padEnd(30)} ${fmt(median(values)).padStart(9)}  ${fmt(quantile(values, 0.25)).padStart(9)}  ${fmt(quantile(values, 0.75)).padStart(9)}`,
    );
  };
  console.log(`  ${'parameter'.padEnd(30)} ${'median'.padStart(9)}  ${'p25'.padStart(9)}  ${'p75'.padStart(9)}`);
  line('Base swap fee (bps)', baseFees, (v) => v.toFixed(0));
  line('Creator trading fee (%)', creatorShares, (v) => `${v.toFixed(0)}%`);
  line('Creator permanently locked', creatorPermanentLocked, (v) => `${v.toFixed(0)}%`);
  line('Locked at day 1 (bps)', dayOneLocked, (v) => v.toFixed(0));
  line('Supply sold before migration', supplyOnMig, (v) => `${v.toFixed(0)}%`);
  line('Starting market cap', startCaps, money);
  line('Market cap at migration', migCaps, money);
  line(
    'Raise to graduate (quote)',
    designed.map((p) => p.migrationQuoteThreshold).filter((v) => v > 0),
    (v) => v.toFixed(1),
  );

  // ── How far they actually got ────────────────────────────────────────────
  const buckets: Array<[string, (p: LivePool) => boolean]> = [
    ['migrated', (p) => p.isMigrated],
    ['80-99% of raise', (p) => !p.isMigrated && p.progressPct >= 80],
    ['40-79%', (p) => !p.isMigrated && p.progressPct >= 40 && p.progressPct < 80],
    ['10-39%', (p) => !p.isMigrated && p.progressPct >= 10 && p.progressPct < 40],
    ['under 10% (stalled)', (p) => !p.isMigrated && p.progressPct < 10],
  ];
  table(
    'Where the curve actually stands',
    buckets.map(([label, test]) => {
      const n = pools.filter(test).length;
      return [label, n, (n / pools.length) * 100] as [string, number, number];
    }),
  );

  const stalled = pools.filter((p) => !p.isMigrated && p.progressPct < 10);
  const live = pools.filter((p) => !p.isMigrated);
  if (dayOneLocked.length) {
    console.log(
      `\nLock rule: ${belowRule} of ${dayOneLocked.length} decodable configs ` +
        `(${((belowRule / dayOneLocked.length) * 100).toFixed(0)}%) hold less than the 1000 bps the program requires ` +
        `one day after migration; the median is ${median(dayOneLocked).toFixed(0)} bps.`,
    );
  }
  console.log(
    `\nHeadline: ${stalled.length} of ${pools.length} sampled launches (${((stalled.length / pools.length) * 100).toFixed(0)}%) ` +
      `have raised under 10% of their target. Median progress across the ${live.length} unmigrated pools is ` +
      `${median(live.map((p) => p.progressPct)).toFixed(1)}%.`,
  );
}

async function main() {
  const limit = Number(process.argv[2] ?? 80);
  const snapshot = await readLivePools(limit, 16);
  report(snapshot.pools, snapshot.discovery ?? 'transaction walk', snapshot.provider, snapshot.fetchedAt);
  if (snapshot.warning) console.log('\nwarning:', snapshot.warning);
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 240));
  process.exit(1);
});
