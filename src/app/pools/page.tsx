import type { Metadata } from 'next';
import Link from 'next/link';

import snapshot from '@/data/pools-snapshot.json';
import type { LivePoolsSnapshot } from '@/core/livepools';

export const metadata: Metadata = {
  title: 'Live DBC launches — CurveCraft',
  description:
    'A snapshot of the most recently active Meteora Dynamic Bonding Curve pools, read from mainnet, next to the designs they resemble.',
};

const data = snapshot as LivePoolsSnapshot;

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
            </div>
          ))}
        </div>

        <section className="mt-12 rounded-xl border border-slate-800 bg-slate-900/50 p-8">
          <h2 className="text-sm font-semibold text-slate-100">How this snapshot is built</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            Free RPC endpoints refuse <span className="font-mono text-slate-300">getProgramAccounts</span>{' '}
            on the DBC program, so instead of indexing it we walk its recent transactions, collect
            the accounts they touched, and keep the ones whose Anchor discriminator identifies them
            as virtual pools. The migration threshold lives on the pool&apos;s config account, so
            that is fetched too. Snapshots are taken at build time —{' '}
            <span className="font-mono text-slate-300">npm run pools:snapshot</span> — because public
            endpoints block indexed requests from browsers.
          </p>
          <p className="mt-3 font-mono text-[11px] text-slate-500">
            snapshot: {data.fetchedAt} ({timeAgo(data.fetchedAt)}) · endpoint {data.endpoint}
            {data.warning ? ` · ${data.warning}` : ''}
          </p>
        </section>
      </main>
    </div>
  );
}
