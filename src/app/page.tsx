import Link from 'next/link';

import { PRESETS } from '@/core/presets';

const FEATURES = [
  {
    title: 'Design the curve',
    body: 'Start and graduation market cap, fee schedule, dynamic fees, migration split. Every field maps 1:1 onto a real DBC config parameter — no hidden defaults.',
  },
  {
    title: 'Replay the launch',
    body: 'Three demand scenarios run against the curve: organic grind, a sniper wave, and a whale that dumps. You see the market cap path, the fees collected, and whether it graduates.',
  },
  {
    title: 'Ship the config',
    body: 'Export a runnable TypeScript script that creates the config on chain with the official Meteora SDK. Copy, paste, deploy.',
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-mono text-lg font-semibold tracking-tight text-violet-400">
            curve<span className="text-slate-100">craft</span>
          </span>
          <Link
            href="/studio"
            className="rounded-lg bg-violet-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-400"
          >
            Open the studio
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-violet-400">
            Meteora · Dynamic Bonding Curve
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            A launch is a market design problem.
            <span className="block text-slate-500">CurveCraft lets you test it first.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-400">
            Most token launches pick a curve by vibes. CurveCraft compiles your launch into a real
            DBC config, then replays realistic demand against it using the official swap math — so
            you can see who pays what, and when the curve graduates, before a single lamport is at
            risk.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/studio"
              className="rounded-lg bg-violet-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-violet-400"
            >
              Design a launch →
            </Link>
            <a
              href="https://docs.meteora.ag/developer-guides/dbc"
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-slate-700 px-6 py-3 text-sm text-slate-300 transition hover:border-slate-500"
            >
              Meteora DBC docs
            </a>
          </div>
        </section>

        <section className="grid gap-4 pb-20 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
            >
              <h2 className="text-sm font-semibold text-slate-100">{feature.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{feature.body}</p>
            </div>
          ))}
        </section>

        <section className="pb-20">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
            Ships with presets, not blank pages
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-6"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="font-mono text-sm text-violet-300">{preset.name}</h3>
                  <span className="font-mono text-[11px] text-slate-500">
                    {preset.spec.quoteAsset} · {preset.spec.feeSchedule.startingFeeBps / 100}% →{' '}
                    {preset.spec.feeSchedule.endingFeeBps / 100}%
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{preset.thesis}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-24">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
            <h2 className="text-sm font-semibold text-slate-100">
              Why the numbers can be trusted
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
              CurveCraft does not re-implement bonding curve math. It calls{' '}
              <span className="font-mono text-slate-300">
                @meteora-ag/dynamic-bonding-curve-sdk
              </span>{' '}
              for every fill and walks the curve by feeding each quote&rsquo;s{' '}
              <span className="font-mono text-slate-300">nextSqrtPrice</span> back in as the starting
              state. The fee scheduler reads the scenario clock, so a decaying fee schedule behaves
              exactly as it does on chain — which is how you can tell whether your
              &ldquo;anti-sniper&rdquo; preset actually taxes snipers more than organic buyers.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 py-8">
        <div className="mx-auto max-w-6xl px-6 text-xs text-slate-600">
          Built for the Colosseum Crypto World&rsquo;s Fair hackathon · Meteora DBC sidetrack.
        </div>
      </footer>
    </div>
  );
}
