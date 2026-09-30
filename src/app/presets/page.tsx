import type { Metadata } from 'next';
import Link from 'next/link';

import { deriveSpec, toConfigParams } from '@/core/build';
import { monteCarlo } from '@/core/montecarlo';
import { PRESETS } from '@/core/presets';
import { encodeSpec } from '@/core/share';

export const metadata: Metadata = {
  title: 'Preset marketplace — CurveCraft',
  description:
    'Battle-tested Meteora Dynamic Bonding Curve configs with measured graduation odds, sniper tax and fee efficiency. Fork one into the studio in a click.',
};

// Recomputing the odds is pure CPU, so cache the rendered page for an hour.
export const revalidate = 3600;

function compact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}k`;
  return value.toFixed(2);
}

export default function PresetsPage() {
  const entries = PRESETS.map((preset) => {
    const config = toConfigParams(preset.spec);
    const derived = deriveSpec(preset.spec, config);
    const mc = monteCarlo(preset.spec, derived.migrationQuoteThreshold, { runs: 200, seed: 7 });

    return {
      preset,
      derived,
      link: `/studio?s=${encodeSpec(preset.spec)}`,
      graduationProbability: mc.graduationProbability,
      fees: mc.fees,
      feeRateP50: mc.feeRate.p50,
      peakP50: mc.peakMarketCap.p50,
    };
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-mono text-lg font-semibold tracking-tight text-violet-400">
            curve<span className="text-slate-100">craft</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/presets" className="text-slate-300">
              Presets
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
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Preset marketplace</h1>
        <p className="mt-4 max-w-3xl text-slate-400">
          Four launch designs, each measured against 200 sampled demand paths. The odds below are not
          marketing copy: every path is priced fill-by-fill with the official Meteora DBC swap math,
          including a 70% chance of a sniper wave and a 35% chance of a whale. Fork any of them into
          the studio and change one parameter at a time.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2">
          {entries.map((entry) => (
            <article
              key={entry.preset.id}
              className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-mono text-base text-violet-300">{entry.preset.name}</h2>
                <span className="font-mono text-[11px] text-slate-500">
                  {entry.preset.spec.quoteAsset} · {entry.preset.spec.feeSchedule.startingFeeBps / 100}
                  % → {entry.preset.spec.feeSchedule.endingFeeBps / 100}%
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-400">{entry.preset.thesis}</p>

              <dl className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Graduates</dt>
                  <dd className="mt-1 font-mono text-lg text-emerald-300">
                    {(entry.graduationProbability * 100).toFixed(0)}%
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Fee rate</dt>
                  <dd className="mt-1 font-mono text-lg text-slate-200">
                    {entry.feeRateP50.toFixed(2)}%
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                    Median fees
                  </dt>
                  <dd className="mt-1 font-mono text-lg text-slate-200">
                    {compact(entry.fees.p50)}
                  </dd>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">
                    Raise target
                  </dt>
                  <dd className="mt-1 font-mono text-lg text-slate-200">
                    {compact(entry.derived.migrationQuoteThreshold)}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href={entry.link}
                  className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
                >
                  Fork in studio →
                </Link>
                <span className="font-mono text-[11px] text-slate-600">
                  {compact(entry.peakP50)} {entry.preset.spec.quoteAsset} median peak MC
                </span>
              </div>
            </article>
          ))}
        </div>

        <section className="mt-14 rounded-xl border border-slate-800 bg-slate-900/50 p-8">
          <h2 className="text-sm font-semibold text-slate-100">Publish your own</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            Every spec in the studio is encoded into the page URL — the{' '}
            <span className="font-mono text-slate-300">Copy share link</span> button gives you a
            permanent, dependency-free way to hand a design to a co-founder, a sponsor or a
            community vote. No backend, no accounts: the config <em>is</em> the link.
          </p>
        </section>
      </main>
    </div>
  );
}
