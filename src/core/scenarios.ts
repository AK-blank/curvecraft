/**
 * Scenario builders: the demand side of a launch simulation.
 *
 * A scenario is just a list of trades with timestamps. These helpers generate
 * the shapes people actually ask about ("what if 200 people buy 0.5 SOL each
 * over the first hour, then a whale apes 50 SOL?").
 */
import type { Scenario, TradeEvent } from './types';

export interface SteadyDemandOptions {
  /** Number of independent buyers. */
  buyers: number;
  /** Average quote units per buy. */
  avgBuy: number;
  /** Spread the buys over this many seconds. */
  durationSec: number;
  /** Start offset in seconds. */
  startSec?: number;
  /** 0 = perfectly even, 1 = heavily front-loaded. */
  frontLoad?: number;
  label?: string;
}

/** Evenly spaced buys, optionally front-loaded. */
export function steadyDemand(options: SteadyDemandOptions): TradeEvent[] {
  const {
    buyers,
    avgBuy,
    durationSec,
    startSec = 0,
    frontLoad = 0,
    label,
  } = options;
  const events: TradeEvent[] = [];
  for (let i = 0; i < buyers; i += 1) {
    const linear = buyers === 1 ? 0 : i / (buyers - 1);
    const shaped = Math.pow(linear, 1 + frontLoad * 3);
    events.push({
      t: startSec + shaped * durationSec,
      side: 'buy',
      amount: avgBuy,
      label: i === 0 ? label : undefined,
    });
  }
  return events;
}

/** One large buy, optionally followed by a partial dump. */
export function whale(
  quoteAmount: number,
  atSec: number,
  options: { sellPct?: number; sellAtSec?: number; totalSupply?: number; label?: string } = {},
): TradeEvent[] {
  const events: TradeEvent[] = [
    { t: atSec, side: 'buy', amount: quoteAmount, label: options.label ?? 'whale' },
  ];
  if (options.sellPct && options.sellAtSec !== undefined && options.totalSupply) {
    events.push({
      t: options.sellAtSec,
      side: 'sell',
      amount: (options.totalSupply * options.sellPct) / 100,
      label: 'dump',
    });
  }
  return events;
}

/** A burst of small buys right at launch — the sniper wave. */
export function sniperWave(bots: number, perBot: number, windowSec = 12): TradeEvent[] {
  const events: TradeEvent[] = [];
  for (let i = 0; i < bots; i += 1) {
    events.push({
      t: (i / Math.max(1, bots)) * windowSec,
      side: 'buy',
      amount: perBot,
      label: i === 0 ? 'sniper wave' : undefined,
    });
  }
  return events;
}

/** Sells spread across holders, used to model a post-graduation bleed. */
export function distribution(
  sellers: number,
  baseTokensEach: number,
  startSec: number,
  durationSec: number,
): TradeEvent[] {
  const events: TradeEvent[] = [];
  for (let i = 0; i < sellers; i += 1) {
    events.push({
      t: startSec + (i / Math.max(1, sellers)) * durationSec,
      side: 'sell',
      amount: baseTokensEach,
    });
  }
  return events;
}

/** The three scenarios every preset is judged against. */
export function standardScenarios(): Scenario[] {
  return [
    {
      name: 'Organic grind',
      horizonSec: 7_200,
      events: steadyDemand({ buyers: 250, avgBuy: 1.5, durationSec: 7_200 }),
    },
    {
      name: 'Sniper wave then organic',
      horizonSec: 3_600,
      events: [
        ...sniperWave(40, 0.75, 10),
        ...steadyDemand({ buyers: 150, avgBuy: 1.2, durationSec: 3_600, startSec: 30 }),
      ],
    },
    {
      name: 'Whale + dump',
      horizonSec: 3_600,
      events: [
        ...steadyDemand({ buyers: 80, avgBuy: 1, durationSec: 900 }),
        ...whale(120, 1_000, { sellPct: 0.4, sellAtSec: 2_400, totalSupply: 1_000_000_000 }),
      ],
    },
  ];
}

/**
 * Scenarios scaled to a launch's graduation target.
 *
 * A fixed scenario is meaningless across presets: 250 SOL of demand graduates a
 * 200 SOL curve and barely dents a 2,400 SOL one. These runs are expressed as
 * fractions of the raise, so the comparison between presets is apples to apples.
 */
export function scaledScenarios(thresholdQuote: number): Scenario[] {
  const t = Math.max(thresholdQuote, 1);

  return [
    {
      name: 'Organic grind',
      horizonSec: 7_200,
      events: steadyDemand({
        buyers: 400,
        avgBuy: (t * 1.35) / 400,
        durationSec: 7_200,
      }),
    },
    {
      name: 'Sniper wave then organic',
      horizonSec: 7_200,
      events: [
        ...sniperWave(60, (t * 0.05) / 60, 10),
        ...steadyDemand({
          buyers: 300,
          avgBuy: (t * 1.25) / 300,
          durationSec: 6_900,
          startSec: 60,
        }),
      ],
    },
    {
      name: 'Whale buys, then dumps',
      horizonSec: 7_200,
      events: [
        ...steadyDemand({ buyers: 200, avgBuy: (t * 0.7) / 200, durationSec: 3_600 }),
        ...whale(t * 0.6, 4_000, { sellPct: 1.2, sellAtSec: 6_000, totalSupply: 1_000_000_000 }),
      ],
    },
  ];
}
