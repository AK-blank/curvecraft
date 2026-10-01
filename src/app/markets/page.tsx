import type { Metadata } from 'next';
import Link from 'next/link';

import snapshot from '@/data/panta-markets.json';
import { impliedProbability, type PantaMarket, type PantaSnapshot } from '@/core/panta-source';

export const metadata: Metadata = {
  title: 'Launch markets — CurveCraft',
  description:
    'Live Panta prediction markets, read as implied probabilities, next to what the simulator says a launch design would do.',
};

const data = snapshot as PantaSnapshot;

function endLabel(market: PantaMarket): string {
  if (!market.endTime) return 'no close time';
  const date = new Date(market.endTime * 1000);
  return Number.isNaN(date.getTime()) ? 'no close time' : `closes ${date.toISOString().slice(0, 10)}`;
}

export default function MarketsPage() {
  const priced = data.markets.filter((m) => impliedProbability(m) !== undefined);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-violet-400">
            curve<span className="text-slate-100">craft</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/presets" className="text-slate-400 transition hover:text-slate-200">
              Presets
            </Link>
            <Link href="/pools" className="text-slate-400 transition hover:text-slate-200">
              Live pools
            </Link>
            <Link href="/markets" className="text-slate-200">
              Markets
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

      <main className="mx-auto max-w-5xl px-6 py-14">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Prediction markets
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          What the market thinks, next to what the curve says
        </h1>
        <p className="mt-4 max-w-3xl text-slate-400">
          A launch design is a bet on demand. CurveCraft prices that bet by sampling demand paths;
          Panta prices the same kind of bet with real money, on Solana, in USDC. This page reads
          Panta&apos;s public catalog and turns each market&apos;s spot price into the probability it
          implies, so a designer can see the market&apos;s view beside the simulator&apos;s.
        </p>
      </header>

      {data.markets.length === 0 ? (
        <section className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
          <h2 className="text-lg font-medium">No snapshot in this build</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            The Panta catalog is read at build time so that an API key never reaches a browser
            bundle. Build with one and this page fills in:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950 p-4 text-xs text-slate-300">
            PANTA_API_KEY=pk_test_… npm run panta:snapshot
          </pre>
          <p className="mt-4 text-sm text-slate-400">
            Nothing here is invented. A market whose price Panta has not published yet is shown as
            unpriceable rather than as 0% or 100%.
          </p>
          <p className="mt-4 text-xs uppercase tracking-widest text-slate-500">Powered by Panta</p>
        </section>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
            <span>
              {data.markets.length} live markets · {priced.length} with a spot price
            </span>
            {data.fetchedAt ? <span>read {data.fetchedAt.slice(0, 16).replace('T', ' ')}Z</span> : null}
            <span>key {data.keyLabel}</span>
            <span className="text-slate-400">Powered by Panta</span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {data.markets.map((market) => {
              const implied = impliedProbability(market);
              return (
                <article
                  key={market.marketId}
                  className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-xs uppercase tracking-wider text-slate-500">
                      {market.category ?? 'uncategorised'}
                    </span>
                    <span className="text-xs text-slate-500">{market.phase ?? 'unknown'}</span>
                  </div>

                  <h2 className="mt-2 text-base font-medium leading-snug">
                    {market.title ?? market.marketId.slice(0, 16)}
                  </h2>

                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-3xl font-semibold tabular-nums text-emerald-400">
                      {implied === undefined ? '—' : `${(implied * 100).toFixed(0)}%`}
                    </span>
                    <span className="pb-1 text-xs text-slate-500">
                      {implied === undefined ? 'no published price' : 'implied YES'}
                    </span>
                  </div>

                  <p className="mt-3 text-xs text-slate-500">{endLabel(market)}</p>
                </article>
              );
            })}
          </div>
        </>
      )}

      <section className="mt-12 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
        <h2 className="text-lg font-medium">Where this is going</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          The useful direction is the launch&apos;s own question — <em>will this curve graduate
          before the date it promised?</em> — asked before the token exists. The simulator answers
          it from sampled demand; a Panta market would answer it with a price, and the gap between
          the two is the interesting number. Creating that market needs a wallet signature: Panta
          builds the unsigned transaction, the founder signs it, and CurveCraft never holds a key.
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Attribution is a condition of Panta&apos;s API terms, so anything powered by their data
          says so. Read the read path in{' '}
          <Link className="text-emerald-400 hover:underline" href="/docs">
            the docs
          </Link>
          .
        </p>
      </section>
      </main>
    </div>
  );
}
