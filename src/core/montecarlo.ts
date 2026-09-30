/**
 * Monte-Carlo launch analysis.
 *
 * Three hand-written scenarios answer "what happens if demand looks like X".
 * Founders ask a different question: "what are the odds this thing actually
 * graduates, and how much does it earn while trying?"
 *
 * This module samples thousands of plausible demand paths from a simple
 * generative model and reports the distribution — graduation probability,
 * percentiles for fees and peak market cap, and a histogram for the UI.
 *
 * Every path is priced by the official SDK swap math (via `simulate`), so the
 * distribution is built from real curve behaviour, not a closed-form guess.
 */
import { simulate } from './simulate';
import type { LaunchSpec, TradeEvent } from './types';

export interface DemandModel {
  /** Mean number of independent buyers over the horizon (lognormal). */
  buyersMean: number;
  /** Log-space standard deviation of buyer count; 0.6 ≈ ±80%. */
  buyersSigma: number;
  /** Mean quote units per buy (lognormal). */
  buyMean: number;
  /** Log-space standard deviation of buy size. */
  buySigma: number;
  /** Probability that a sniper wave shows up in the first seconds. */
  sniperProbability: number;
  /** Bots in a sniper wave, when one happens. */
  sniperBots: number;
  /** Quote units per bot. */
  sniperSize: number;
  /** Probability that one whale takes a position. */
  whaleProbability: number;
  /** Whale size, as a multiple of the raise-to-graduate target. */
  whaleMultiple: number;
  /** Probability the whale dumps into the curve afterwards. */
  whaleDumpProbability: number;
  /** Horizon of each path, in seconds. */
  horizonSec: number;
}

export interface MonteCarloOptions {
  runs?: number;
  seed?: number;
  model?: Partial<DemandModel>;
}

export interface Percentiles {
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  runs: number;
  seed: number;
  model: DemandModel;
  graduated: number;
  graduationProbability: number;
  graduationTimeP50: number | null;
  fees: Percentiles;
  peakMarketCap: Percentiles;
  /** Fees as a share of quote volume, percentiles. */
  feeRate: Percentiles;
  /** Histogram of peak market cap across runs. */
  histogram: Array<{ bucket: number; count: number }>;
  /** Mean number of fills per path (a proxy for gas/throughput). */
  meanFills: number;
}

/** Deterministic PRNG so a reported distribution can be reproduced. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller normal sample. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lognormal sample with a given arithmetic-ish mean and log-sigma. */
function lognormal(rand: () => number, mean: number, sigma: number): number {
  if (sigma <= 0) return mean;
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * gaussian(rand));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[index];
}

/**
 * A demand assumption for a launch, by what it is priced in.
 *
 * These are starting points a founder is expected to argue with, not forecasts:
 * a SOL-quoted community token seeing roughly 1,300 SOL of demand, a
 * stablecoin-quoted launch seeing roughly 500k, and anything else scaled off its
 * own raise target so the odds are at least in a sane range.
 */
export function demandProfileFor(quoteAsset: string, raiseTarget: number): DemandModel {
  const base = { ...DEFAULT_DEMAND_MODEL };
  if (quoteAsset === 'USDC') {
    return { ...base, buyersMean: 180, buyMean: 2_800 };
  }
  if (quoteAsset === 'SOL') {
    return base;
  }
  return { ...base, buyMean: (raiseTarget * 1.2) / Math.max(1, base.buyersMean) };
}

export const DEFAULT_DEMAND_MODEL: DemandModel = {
  buyersMean: 320,
  buyersSigma: 0.6,
  buyMean: 4,
  buySigma: 0.9,
  sniperProbability: 0.7,
  sniperBots: 60,
  sniperSize: 0.6,
  whaleProbability: 0.35,
  whaleMultiple: 0.5,
  whaleDumpProbability: 0.5,
  horizonSec: 7_200,
};

/** Sample one demand path. */
function samplePath(
  rand: () => number,
  model: DemandModel,
  raiseTarget: number,
  totalSupply: number,
): TradeEvent[] {
  const events: TradeEvent[] = [];

  if (rand() < model.sniperProbability) {
    for (let i = 0; i < model.sniperBots; i += 1) {
      events.push({
        t: rand() * 12,
        side: 'buy',
        amount: lognormal(rand, model.sniperSize, 0.5),
        label: i === 0 ? 'snipers' : undefined,
      });
    }
  }

  const buyers = Math.max(5, Math.round(lognormal(rand, model.buyersMean, model.buyersSigma)));
  // Demand tends to front-load: earlier buyers are more likely than late ones.
  for (let i = 0; i < buyers; i += 1) {
    const u = rand();
    const t = Math.pow(u, 0.65) * model.horizonSec;
    events.push({
      t,
      side: 'buy',
      amount: lognormal(rand, model.buyMean, model.buySigma),
    });
  }

  if (rand() < model.whaleProbability) {
    const whaleAt = model.horizonSec * (0.15 + rand() * 0.5);
    events.push({
      t: whaleAt,
      side: 'buy',
      amount: raiseTarget * model.whaleMultiple * (0.5 + rand()),
      label: 'whale',
    });
    if (rand() < model.whaleDumpProbability) {
      events.push({
        t: whaleAt + model.horizonSec * (0.1 + rand() * 0.3),
        side: 'sell',
        // Dump a slice of supply rather than a fixed quote size.
        amount: totalSupply * (0.002 + rand() * 0.01),
        label: 'dump',
      });
    }
  }

  return events.sort((a, b) => a.t - b.t);
}

/**
 * Run the demand model `runs` times against a launch spec.
 *
 * Each run is a full fill-by-fill simulation; keep `runs` in the low hundreds
 * for interactive use.
 */
export function monteCarlo(
  spec: LaunchSpec,
  raiseTarget: number,
  options: MonteCarloOptions = {},
): MonteCarloResult {
  const runs = Math.max(1, Math.min(options.runs ?? 200, 2_000));
  const seed = options.seed ?? 42;
  const model: DemandModel = { ...DEFAULT_DEMAND_MODEL, ...options.model };

  // Demand is exogenous: a launch does not attract more buyers because it set a
  // higher target. So the *caller* supplies the demand assumption (see
  // `demandProfileFor`), and the raise target only decides whether that demand is
  // enough. Scaling demand to the target instead would make every design graduate
  // with the same probability and the metric would say nothing.
  void raiseTarget;
  const rand = mulberry32(seed);

  const fees: number[] = [];
  const peaks: number[] = [];
  const rates: number[] = [];
  const gradTimes: number[] = [];
  let graduated = 0;
  let fillTotal = 0;

  for (let i = 0; i < runs; i += 1) {
    const events = samplePath(rand, model, raiseTarget, spec.totalSupply);
    const result = simulate(spec, {
      name: `path-${i}`,
      horizonSec: model.horizonSec,
      events,
    });

    fees.push(result.tradingFees);
    peaks.push(result.peakMarketCap);
    rates.push(result.quoteVolume > 0 ? (result.tradingFees / result.quoteVolume) * 100 : 0);
    fillTotal += result.fills.length;

    if (result.graduatedAtSec !== null) {
      graduated += 1;
      gradTimes.push(result.graduatedAtSec);
    }
  }

  const sortedFees = [...fees].sort((a, b) => a - b);
  const sortedPeaks = [...peaks].sort((a, b) => a - b);
  const sortedRates = [...rates].sort((a, b) => a - b);
  const sortedTimes = [...gradTimes].sort((a, b) => a - b);

  const maxPeak = sortedPeaks[sortedPeaks.length - 1] ?? 1;
  const bucketCount = 14;
  const histogram = Array.from({ length: bucketCount }, (_, index) => ({
    bucket: ((index + 1) / bucketCount) * maxPeak,
    count: 0,
  }));
  for (const peak of peaks) {
    const index = Math.min(bucketCount - 1, Math.floor((peak / maxPeak) * bucketCount));
    histogram[index].count += 1;
  }

  return {
    runs,
    seed,
    model,
    graduated,
    graduationProbability: graduated / runs,
    graduationTimeP50: sortedTimes.length ? percentile(sortedTimes, 50) : null,
    fees: {
      p10: percentile(sortedFees, 10),
      p50: percentile(sortedFees, 50),
      p90: percentile(sortedFees, 90),
    },
    peakMarketCap: {
      p10: percentile(sortedPeaks, 10),
      p50: percentile(sortedPeaks, 50),
      p90: percentile(sortedPeaks, 90),
    },
    feeRate: {
      p10: percentile(sortedRates, 10),
      p50: percentile(sortedRates, 50),
      p90: percentile(sortedRates, 90),
    },
    histogram,
    meanFills: fillTotal / runs,
  };
}
