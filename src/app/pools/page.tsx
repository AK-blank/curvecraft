import type { Metadata } from 'next';
import Link from 'next/link';

import snapshot from '@/data/pools-snapshot.json';
import launchStats from '@/data/launch-stats.json';
import type { LivePoolsSnapshot } from '@/core/livepools';
import { specLink } from '@/core/share';

export const metadata: Metadata = {
  title: 'Live DBC launches — CurveCraft',
  description:
    'A snapshot of the most recently active Meteora Dynamic Bonding Curve pools, read from mainnet, next to the designs they resemble.',
};

const data = snapshot as LivePoolsSnapshot;
const stats = launchStats as LaunchStats;

interface LaunchStats {
  sampled: number;
  fetchedAt: string;
  provider: string;
  discovery: string;
  migrated: { count: number; pct: number };
  stalledUnder10: { count: number; pct: number };
  midBand: { count: number; pct: number };
  lock: { belowRule: number; of: number; pct: number; medianBps: number };
  quoteAssets: Array<{ label: string; count: number; pct: number }>;
  migrationFeePresets: Array<{ label: string; count: number; pct: number }>;
  medians: { creatorTradingFeePct: number; baseFeeBps: number; startingMarketCap: number };
}

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return value.toFixed(2);
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1_000);
  if (seconds < 90) return 'just now';
  if (seconds < 5_400) return `${Math.round(seconds / 60)} minutes ago`;
  if (seconds < 129_600) return `${Math.round(seconds / 3_600)} hours ago`;
  return `${Math.round(seconds / 86_400)} days ago`;
}

export default function PoolsPage() {
  const graduated = data.pools.filter((pool) => pool.progressPct >= 100).length;
  const raising = data.pools.filter((pool) => pool.progressPct < 100);
  const averageProgress = raising.length
    ? raising.reduce((sum, pool) => sum + pool.progressPct, 0) / raising.length
    : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-violet-400">
            curve<span className="text-slate-100">craft</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/presets" className="text-slate-400 hover:text-slate-200">
              Presets
            </Link>
            <Link href="/pools" className="text-slate-200">
              Live pools
            </Link>
            <Link
              href="/studio"
              className="rounded-lg bg-violet-500 px-4 py-2 font-medium text-white transition hover:bg-violet-400"
            >
              Open the studio
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What is actually launching
        </h1>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg font-medium">
              What {stats.sampled} sampled launches chose
            </h2>
            <span className="text-xs text-slate-500">
              decoded from mainnet configs · {stats.fetchedAt.slice(0, 10)}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            The twelve pools below are the recent picture. This is the wider one: a sample of{' '}
            {stats.sampled} live launches, taken in account-address order so it is not skewed toward
            whoever traded last, with each launch&apos;s config decoded and measured. Reproduce it
            with <code className="text-slate-300">npm run pools:analyze 200 --save</code>.
          </p>

          <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Graduated</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">
                {stats.migrated.pct.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Stalled under 10%</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-amber-400">
                {stats.stalledUnder10.pct.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Between 10% and 99%</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-300">
                {stats.midBand.pct.toFixed(0)}%
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">
                Below the day-1 lock rule
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-rose-400">
                {stats.lock.pct.toFixed(0)}%
              </dd>
            </div>
          </dl>

          <div className="mt-6 grid gap-4 border-t border-slate-800 pt-5 text-sm sm:grid-cols-3">
            <p className="text-slate-400">
              <span className="text-slate-200">The distribution is bimodal.</span>{' '}
              {stats.migrated.pct.toFixed(0)}% graduate and {stats.stalledUnder10.pct.toFixed(0)}%
              never clear a tenth of their raise; {stats.midBand.pct.toFixed(0)}% sit between. A curve
              nobody is buying does not drift sideways, it stops.
            </p>
            <p className="text-slate-400">
              <span className="text-slate-200">
                {stats.lock.belowRule} of {stats.lock.of} decoded configs
              </span>{' '}
              hold less liquidity at day 1 than the program requires (median{' '}
              {stats.lock.medianBps.toFixed(0)} bps against a 1000 bps floor), which is why the launch
              check runs the program&apos;s validator instead of trusting precedent.
            </p>
            <p className="text-slate-400">
              <span className="text-slate-200">
                {stats.quoteAssets.map((a) => `${a.label} ${a.pct.toFixed(0)}%`).join(' · ')}
              </span>{' '}
              — no sampled launch quotes another token, so the stock, ICM and RWA pairs the{' '}
              <Link className="text-violet-400 hover:underline" href="/presets">
                preset marketplace
              </Link>{' '}
              covers are unoccupied rather than crowded.
            </p>
          </div>
        </section>
        <p className="mt-4 max-w-3xl text-slate-400">
          The studio designs launches; this is the other half of the loop. These are the most
          recently active Meteora Dynamic Bonding Curve pools on mainnet, read straight from the
          program&apos;s accounts — raise so far against the threshold that graduates them.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Pools sampled</div>
            <div className="mt-1 font-mono text-2xl text-slate-100">{data.pools.length}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              from {data.scannedTransactions} recent program transactions
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">
              Average progress
            </div>
            <div className="mt-1 font-mono text-2xl text-violet-300">
              {averageProgress.toFixed(1)}%
            </div>
            <div className="mt-1 text-[11px] text-slate-500">across pools still raising</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Graduated</div>
            <div className="mt-1 font-mono text-2xl text-emerald-300">{graduated}</div>
            <div className="mt-1 text-[11px] text-slate-500">hit their migration threshold</div>
          </div>
        </div>

        <div className="mt-10 space-y-3">
          {data.pools.map((pool) => (
            <div
              key={pool.address}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <a
                  href={`https://solscan.io/account/${pool.address}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-violet-300 hover:text-violet-200"
                >
                  {pool.address.slice(0, 20)}…
                </a>
                <span className="font-mono text-xs text-slate-500">
                  mint {pool.baseMint.slice(0, 10)}…
                </span>
              </div>

              <div className="mt-4 flex items-center gap-4">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${
                      pool.progressPct >= 100 ? 'bg-emerald-400' : 'bg-violet-500'
                    }`}
                    style={{ width: `${Math.min(100, pool.progressPct)}%` }}
                  />
                </div>
                <span className="w-16 text-right font-mono text-sm text-slate-300">
                  {pool.progressPct.toFixed(1)}%
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-[11px] text-slate-500">
                <span>
                  raised{' '}
                  <span className="text-slate-300">{compact(pool.quoteReserve)}</span> /{' '}
                  {compact(pool.migrationQuoteThreshold)} SOL
                </span>
                <span>
                  base reserve <span className="text-slate-300">{compact(pool.baseReserve)}</span>
                </span>
                <span>
                  creator <span className="text-slate-300">{pool.creator.slice(0, 10)}…</span>
                </span>
                {pool.isMigrated && <span className="text-emerald-400">migrated</span>}
              </div>

              {pool.design && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
                  <Link
                    href={specLink(pool.design, '/studio')}
                    className="rounded-lg border border-violet-500/60 px-3 py-1.5 text-xs font-medium text-violet-200 transition hover:bg-violet-500/10"
                  >
                    Fork this design in the studio →
                  </Link>
                  <span className="font-mono text-[11px] text-slate-500">
                    {compact(pool.design.initialMarketCap)} → {compact(pool.design.migrationMarketCap)}{' '}
                    SOL market cap · {(pool.design.totalSupply / 1e6).toFixed(0)}M supply
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/50 p-8">
          <h2 className="text-sm font-semibold text-slate-100">How this snapshot is built</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            {data.discovery?.startsWith('Solami') ? (
              <>
                This snapshot asks the endpoint for the pools themselves: a{' '}
                <span className="font-mono text-slate-300">getProgramAccountsV2</span> call filtered
                on the VirtualPool discriminator and its 424-byte account size, served by{' '}
                <span className="font-mono text-slate-300">Solami</span>. A public endpoint refuses
                that request outright, which is why the fallback walks recent transactions instead
                and only ever sees whichever pools traded last. The migration threshold lives on the
                pool&apos;s config account, so that is fetched too.
              </>
            ) : (
              <>
                Free RPC endpoints refuse <span className="font-mono text-slate-300">getProgramAccounts</span>{' '}
                on the DBC program, so instead of indexing it we walk its recent transactions, collect
                the accounts they touched, and keep the ones whose Anchor discriminator identifies them
                as virtual pools. The migration threshold lives on the pool&apos;s config account, so
                that is fetched too.
              </>
            )}{' '}
            Snapshots are taken at build time —{' '}
            <span className="font-mono text-slate-300">npm run pools:snapshot</span> — because public
            endpoints block indexed requests from browsers.
          </p>
          <p className="mt-3 font-mono text-[11px] text-slate-500">
            snapshot: {data.fetchedAt} ({timeAgo(data.fetchedAt)}) · provider{' '}
            {data.provider ?? 'Public mainnet'} · {data.discovery ?? 'transaction walk'} · endpoint{' '}
            {data.endpoint}
            {data.warning ? ` · ${data.warning}` : ''}
          </p>
        </section>
      </main>
    </div>
  );
}
