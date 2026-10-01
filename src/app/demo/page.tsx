import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'CurveCraft — three minute demo',
  description:
    'A three minute walkthrough: compile a launch into a Meteora DBC config, replay demand against it, read the graduation odds, and export a verified launch script.',
};

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const BEATS: Array<[string, string]> = [
  ['0:00', 'What CurveCraft compiles, and why the numbers are the SDK’s.'],
  ['0:11', 'Doubling the graduation market cap costs 1.5× the raise, not 2×.'],
  ['0:24', 'A flat curve reaches the same valuation with 27% less capital.'],
  ['0:37', 'Meme Speedrun: a 20% fee decaying to 1% in thirty minutes.'],
  ['0:45', 'Replaying a sniper wave, then a whale that dumps.'],
  ['1:10', 'The sniper premium: +21.7% from a fast decay, +1% from a slow one.'],
  ['1:30', 'Two hundred sampled demand paths → a graduation probability.'],
  ['1:49', 'Head to head: the same demand against every design.'],
  ['2:01', 'The pre-deploy check, and the bug it caught in our own presets.'],
  ['2:15', 'The exported launch script, verified by mainnet simulation.'],
  ['2:26', 'The preset marketplace and the live mainnet pool view.'],
  ['2:46', 'Where to find it.'],
];

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
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
            <Link href="/markets" className="text-slate-400 transition hover:text-slate-200">
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

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Three minute demo</h1>
        <p className="mt-3 max-w-3xl text-slate-400">
          Compile a launch into a real Meteora DBC config, replay realistic demand against it, read
          the graduation odds, and export a launch script that has been verified against mainnet.
        </p>

        <video
          controls
          preload="metadata"
          className="mt-8 w-full rounded-xl border border-slate-800 bg-black"
          src={`${BASE}/demo.mp4`}
        >
          Your browser does not support the video tag.
        </video>

        <section className="mt-10 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-sm font-semibold text-slate-100">What happens when</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {BEATS.map(([time, text]) => (
              <li key={time} className="flex gap-4">
                <span className="w-12 shrink-0 font-mono text-xs text-violet-300">{time}</span>
                <span className="text-slate-400">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-8 text-sm text-slate-500">
          Source:{' '}
          <Link href="https://github.com/AK-blank/curvecraft" className="text-violet-300 underline">
            github.com/AK-blank/curvecraft
          </Link>
          {' · '}
          Studio:{' '}
          <Link href="/studio" className="text-violet-300 underline">
            the live app
          </Link>
        </p>
      </main>
    </div>
  );
}
