/**
 * Core invariants.
 *
 * These tests are the project's honesty check: they assert the numbers the UI
 * shows are internally consistent and behave monotonically when a single
 * parameter moves.
 */
import { describe, expect, it } from 'vitest';

import { deriveSpec, toConfigParams } from '@/core/build';
import { analyze, analyzeMonteCarlo } from '@/core/analysis';
import { toCreateConfigScript } from '@/core/codegen';
import { toLaunchReport } from '@/core/report';
import { lintSpec } from '@/core/lint';
import { monteCarlo } from '@/core/montecarlo';
import { PRESETS, getPreset } from '@/core/presets';
import { scaledScenarios, steadyDemand } from '@/core/scenarios';
import { simulate } from '@/core/simulate';
import { decodeSpec, encodeSpec } from '@/core/share';
import type { LaunchSpec } from '@/core/types';

const fairLaunch = getPreset('fair-launch')!.spec;

function withSpec(patch: Partial<LaunchSpec>): LaunchSpec {
  return { ...structuredClone(fairLaunch), ...patch };
}

describe('spec compilation', () => {
  it('raises the required raise sub-linearly with the graduation market cap', () => {
    // Measured behaviour of buildCurveWithMarketCap: a 2x graduation target
    // costs roughly 1.5x the raise, not 2x. Ambitious targets are cheaper than
    // they look, and this test pins that down so a dependency change is caught.
    const base = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const doubledSpec = withSpec({ migrationMarketCap: fairLaunch.migrationMarketCap * 2 });
    const doubled = deriveSpec(doubledSpec, toConfigParams(doubledSpec));
    const ratio = doubled.migrationQuoteThreshold / base.migrationQuoteThreshold;

    expect(ratio).toBeGreaterThan(1.4);
    expect(ratio).toBeLessThan(1.7);
  });

  it('increases the raise monotonically with the graduation market cap', () => {
    let previous = 0;
    for (const migrationMarketCap of [2_000, 8_000, 32_000, 64_000]) {
      const spec = withSpec({ migrationMarketCap });
      const derived = deriveSpec(spec, toConfigParams(spec));
      expect(derived.migrationQuoteThreshold).toBeGreaterThan(previous);
      previous = derived.migrationQuoteThreshold;
    }
  });

  it('prices the first fill at initial market cap / supply', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const expected = fairLaunch.initialMarketCap / fairLaunch.totalSupply;
    expect(derived.startPrice).toBeCloseTo(expected, 12);
  });

  it('prices graduation at migration market cap / supply', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const expected = fairLaunch.migrationMarketCap / fairLaunch.totalSupply;
    expect(derived.migrationPrice / expected).toBeGreaterThan(0.98);
    expect(derived.migrationPrice / expected).toBeLessThan(1.02);
  });

  it('compiles every preset without throwing', () => {
    for (const preset of PRESETS) {
      const config = toConfigParams(preset.spec);
      const derived = deriveSpec(preset.spec, config);
      expect(derived.migrationQuoteThreshold).toBeGreaterThan(0);
      expect(derived.startPrice).toBeGreaterThan(0);
    }
  });
});

describe('simulator', () => {
  it('graduates when demand exceeds the raise target', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const [organic] = scaledScenarios(derived.migrationQuoteThreshold);
    const result = simulate(fairLaunch, organic);

    expect(result.graduatedAtSec).not.toBeNull();
    expect(result.quoteVolume).toBeGreaterThan(derived.migrationQuoteThreshold);
  });

  it('does not graduate when demand is far below the target', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const thin = {
      name: 'thin demand',
      horizonSec: 3_600,
      events: steadyDemand({
        buyers: 20,
        avgBuy: (derived.migrationQuoteThreshold * 0.05) / 20,
        durationSec: 3_600,
      }),
    };
    const result = simulate(fairLaunch, thin);

    expect(result.graduatedAtSec).toBeNull();
    expect(result.finalMarketCap).toBeLessThan(fairLaunch.migrationMarketCap);
  });

  it('charges more in fees when the fee schedule is higher', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const [organic] = scaledScenarios(derived.migrationQuoteThreshold);

    const cheap = simulate(fairLaunch, organic);
    const expensiveSpec = withSpec({
      feeSchedule: { ...fairLaunch.feeSchedule, startingFeeBps: 500, endingFeeBps: 300 },
    });
    const expensive = simulate(expensiveSpec, organic);

    expect(expensive.tradingFees).toBeGreaterThan(cheap.tradingFees);
  });

  it('is deterministic for the same spec and scenario', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const [organic] = scaledScenarios(derived.migrationQuoteThreshold);
    const a = simulate(fairLaunch, organic);
    const b = simulate(fairLaunch, organic);

    expect(a.fills.length).toBe(b.fills.length);
    expect(a.tradingFees).toBeCloseTo(b.tradingFees, 10);
    expect(a.graduatedAtSec).toBeCloseTo(b.graduatedAtSec ?? 0, 6);
  });

  it('keeps the market cap path consistent with the fills', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const [organic] = scaledScenarios(derived.migrationQuoteThreshold);
    const result = simulate(fairLaunch, organic);

    for (const fill of result.fills.slice(0, 50)) {
      expect(fill.marketCap).toBeCloseTo(fill.price * fairLaunch.totalSupply, 6);
      expect(fill.progressPct).toBeGreaterThanOrEqual(0);
      expect(fill.progressPct).toBeLessThanOrEqual(100);
    }
  });
});

describe('monte carlo', () => {
  it('reports a probability between 0 and 1 and is reproducible for a seed', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const a = monteCarlo(fairLaunch, derived.migrationQuoteThreshold, { runs: 40, seed: 123 });
    const b = monteCarlo(fairLaunch, derived.migrationQuoteThreshold, { runs: 40, seed: 123 });

    expect(a.graduationProbability).toBeGreaterThanOrEqual(0);
    expect(a.graduationProbability).toBeLessThanOrEqual(1);
    expect(a.graduationProbability).toBeCloseTo(b.graduationProbability, 10);
    expect(a.fees.p50).toBeCloseTo(b.fees.p50, 6);
  });

  it('raises graduation odds when demand rises', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const thin = monteCarlo(fairLaunch, derived.migrationQuoteThreshold, {
      runs: 60,
      seed: 5,
      model: { buyersMean: 60, buyMean: 1, whaleProbability: 0, sniperProbability: 0 },
    });
    const fat = monteCarlo(fairLaunch, derived.migrationQuoteThreshold, {
      runs: 60,
      seed: 5,
      model: { buyersMean: 900, buyMean: 8, whaleProbability: 0, sniperProbability: 0 },
    });

    expect(fat.graduationProbability).toBeGreaterThan(thin.graduationProbability);
  });

  it('reports ordered percentiles', () => {
    const derived = deriveSpec(fairLaunch, toConfigParams(fairLaunch));
    const mc = monteCarlo(fairLaunch, derived.migrationQuoteThreshold, { runs: 60, seed: 9 });

    expect(mc.fees.p10).toBeLessThanOrEqual(mc.fees.p50);
    expect(mc.fees.p50).toBeLessThanOrEqual(mc.fees.p90);
    expect(mc.peakMarketCap.p10).toBeLessThanOrEqual(mc.peakMarketCap.p90);
  });
});

describe('share links', () => {
  it('round-trips a spec through the URL encoding', () => {
    const encoded = encodeSpec(fairLaunch);
    const decoded = decodeSpec(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.totalSupply).toBe(fairLaunch.totalSupply);
    expect(decoded!.initialMarketCap).toBe(fairLaunch.initialMarketCap);
    expect(decoded!.feeSchedule.startingFeeBps).toBe(fairLaunch.feeSchedule.startingFeeBps);
  });

  it('returns null for garbage input instead of throwing', () => {
    expect(decodeSpec('not-base64!!')).toBeNull();
    expect(decodeSpec('')).toBeNull();
  });
});

describe('launch lint', () => {
  it('passes every shipped preset', () => {
    for (const preset of PRESETS) {
      const result = lintSpec(preset.spec);
      const errors = result.items.filter((item) => item.level === 'error');
      expect(errors, `${preset.name}: ${errors.map((e) => e.title).join(', ')}`).toHaveLength(0);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects a config with no liquidity locked at day 1', () => {
    // The program requires >= 1000 bps locked at day 1; a naive 100/0 split
    // fails at createConfig, which is exactly what this lint exists to catch.
    const naive = withSpec({
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    });
    const result = lintSpec(naive);

    expect(result.ok).toBe(false);
    expect(result.items.some((item) => item.id === 'locked-liquidity' && item.level === 'error')).toBe(
      true,
    );
  });

  it('rejects LP percentages that do not sum to 100', () => {
    const broken = withSpec({
      liquidityDistribution: {
        partnerLiquidityPercentage: 50,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 50,
        creatorPermanentLockedLiquidityPercentage: 20,
      },
    });
    const result = lintSpec(broken);

    expect(result.ok).toBe(false);
    expect(result.items.some((item) => item.id === 'lp-percentages' && item.level === 'error')).toBe(
      true,
    );
  });

  it('warns when a fee decay is slower than the sniper window', () => {
    const slow = withSpec({
      feeSchedule: { ...fairLaunch.feeSchedule, totalDurationSec: 14_400 },
    });
    const result = lintSpec(slow);

    expect(result.items.some((item) => item.id === 'sniper-window')).toBe(true);
  });
});

describe('curve shapes', () => {
  it('compiles, lints and simulates every shape', () => {
    for (const shape of ['marketCap', 'flat', 'linear', 'exponential'] as const) {
      const spec = withSpec({ curveShape: shape });
      const config = toConfigParams(spec);
      const derived = deriveSpec(spec, config);
      const lint = lintSpec(spec);

      expect(derived.migrationQuoteThreshold, shape).toBeGreaterThan(0);
      expect(lint.ok, `${shape} failed lint`).toBe(true);

      const [organic] = scaledScenarios(derived.migrationQuoteThreshold);
      expect(simulate(spec, organic).fills.length).toBeGreaterThan(0);
    }
  });

  it('charges a different raise for the same market caps', () => {
    // The raise is not a function of the market caps alone: curve shape moves it
    // by roughly +/-30%, which is the whole point of shipping shape presets.
    const raise = (shape: 'marketCap' | 'flat' | 'exponential') => {
      const spec = withSpec({ curveShape: shape });
      return deriveSpec(spec, toConfigParams(spec)).migrationQuoteThreshold;
    };

    const market = raise('marketCap');
    expect(raise('flat')).toBeLessThan(market * 0.85);
    expect(raise('exponential')).toBeGreaterThan(market * 1.15);
  });

  it('builds sixteen segments for weighted shapes', () => {
    const spec = withSpec({ curveShape: 'flat' });
    const config = toConfigParams(spec) as unknown as { curve: unknown[] };
    expect(config.curve.length).toBe(16);
  });
});

describe('launch script export', () => {
  it('emits a script that actually creates and sends the config', () => {
    const script = toCreateConfigScript(fairLaunch);

    // The config account needs its own keypair, and createConfig returns a
    // transaction that must be signed and sent — the earlier version of this
    // generator got both wrong and would have thrown on the first run.
    expect(script).toContain('const configKeypair = Keypair.generate();');
    expect(script).toContain('...curveConfig,');
    expect(script).toContain('config: configKeypair.publicKey,');
    expect(script).toContain('leftoverReceiver: payer.publicKey,');
    expect(script).toContain('transaction.sign(payer, configKeypair);');
    expect(script).toContain('sendRawTransaction');
    expect(script).toContain('confirmTransaction');
    expect(script).not.toContain('const { config } =');
  });

  it('picks the SDK builder that matches the curve shape', () => {
    const market = toCreateConfigScript(fairLaunch);
    expect(market).toContain('buildCurveWithMarketCap({');
    expect(market).not.toContain('buildCurveWithLiquidityWeights');

    const flat = toCreateConfigScript(withSpec({ curveShape: 'flat' }));
    expect(flat).toContain('buildCurveWithLiquidityWeights({');
    expect(flat).toContain('liquidityWeights: [');
    // Weighted curves need the leftover buffer the builder asserts on.
    expect(flat).toMatch(/leftover: [1-9]/);
  });

  it('points at the right quote mint for the quote asset', () => {
    expect(toCreateConfigScript(fairLaunch)).toContain(
      'So11111111111111111111111111111111111111112',
    );
    const usdc = getPreset('stable-pair')!.spec;
    expect(toCreateConfigScript(usdc)).toContain(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
  });

  it('emits balanced braces for every preset', () => {
    for (const preset of PRESETS) {
      const script = toCreateConfigScript(preset.spec);
      const opens = (script.match(/\(/g) ?? []).length;
      const closes = (script.match(/\)/g) ?? []).length;
      expect(opens, `${preset.name} parens`).toBe(closes);
    }
  });
});

describe('mainnet-facing guarantees', () => {
  it('catches the 100/0 split the curve builder happily accepts', () => {
    // buildCurveWithMarketCap compiles this config without complaint. The
    // refusal only arrives later, from the SDK's validation inside
    // `client.partner.createConfig` — i.e. when a builder runs the exported
    // launch script. That gap is exactly why the studio runs its own check.
    const naive = withSpec({
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    });

    expect(() => toConfigParams(naive)).not.toThrow();
    expect(lintSpec(naive).ok).toBe(false);
    expect(
      lintSpec(naive).items.some((item) => item.id === 'locked-liquidity' && item.level === 'error'),
    ).toBe(true);
  });
});

describe('launch report', () => {
  it('renders every section with real numbers', () => {
    const analysis = analyze(fairLaunch);
    const monteCarlo = analyzeMonteCarlo(fairLaunch, { runs: 12, seed: 3 }).result;
    const report = toLaunchReport({ spec: fairLaunch, analysis, monteCarlo });

    expect(report).toContain('# Fair Launch — launch report');
    expect(report).toContain('## The launch');
    expect(report).toContain('## Pre-deploy check');
    expect(report).toContain('## How it behaves under demand');
    expect(report).toContain('## Graduation odds');
    expect(report).toContain('## Launch script');
    // The raise figure must be the compiled one, not a copy of the market cap.
    expect(report).toMatch(/Raise to graduate \| \*\*[\d.]+k? SOL\*\*/);
    expect(analysis.derived.migrationQuoteThreshold).toBeGreaterThan(0);
    expect(report).toContain('Graduation probability:');
    expect(report).not.toContain('NaN');
    expect(report).not.toContain('undefined');
  });

  it('renders for every preset and every curve shape', () => {
    for (const preset of PRESETS) {
      for (const shape of ['marketCap', 'flat', 'exponential'] as const) {
        const spec = { ...structuredClone(preset.spec), curveShape: shape };
        const report = toLaunchReport({ spec, analysis: analyze(spec), monteCarlo: null });
        expect(report.length, `${preset.name}/${shape}`).toBeGreaterThan(800);
        expect(report).not.toContain('NaN');
      }
    }
  });

  it('states the pre-deploy verdict rather than burying it', () => {
    const broken = withSpec({
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    });
    const report = toLaunchReport({ spec: broken, analysis: analyze(broken), monteCarlo: null });
    expect(report).toContain('cannot be deployed yet');
  });
});
