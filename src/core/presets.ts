/**
 * Curated launch presets.
 *
 * These are opinions, not gospel: each one encodes a different thesis about how
 * a token should price discovery. They exist so a builder can start from a
 * working config instead of a blank page, and so the community has something
 * concrete to fork and argue about.
 */
import type { LaunchSpec } from './types';

export interface Preset {
  id: string;
  name: string;
  thesis: string;
  spec: LaunchSpec;
}

export const PRESETS: Preset[] = [
  {
    id: 'fair-launch',
    name: 'Fair Launch',
    thesis:
      'Low float, low starting fee. Price discovery is cheap and the curve is deep enough to absorb organic demand without spiking.',
    spec: {
      name: 'Fair Launch',
      description: 'Balanced defaults for a community token with no insider allocation.',
      quoteAsset: 'SOL',
      totalSupply: 1_000_000_000,
      initialMarketCap: 500,
      migrationMarketCap: 8_000,
      percentageSupplyOnMigration: 20,
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 200,
        endingFeeBps: 100,
        numberOfPeriods: 20,
        totalDurationSec: 7_200,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 20,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    },
  },
  {
    id: 'meme-speedrun',
    name: 'Meme Speedrun',
    thesis:
      'Punishing early fee that decays to nothing. Sniper bots pay for the privilege of being first; later buyers get a cheap curve.',
    spec: {
      name: 'Meme Speedrun',
      description: 'High cliff fee decaying exponentially — anti-sniper by construction.',
      quoteAsset: 'SOL',
      totalSupply: 1_000_000_000,
      initialMarketCap: 200,
      migrationMarketCap: 4_000,
      percentageSupplyOnMigration: 25,
      feeMode: 'exponential',
      feeSchedule: {
        startingFeeBps: 2_000,
        endingFeeBps: 100,
        numberOfPeriods: 12,
        totalDurationSec: 1_800,
      },
      dynamicFee: { enabled: true, volatilityAccumulator: 200, maxFeeBps: 500 },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 50,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    },
  },
  {
    id: 'stable-pair',
    name: 'Stablecoin Pair',
    thesis:
      'Quoted in USDC so the launch is legible to people who do not think in SOL. Higher migration target, tighter fee band.',
    spec: {
      name: 'Stablecoin Pair',
      description: 'USDC-quoted launch for real-world asset and consumer apps.',
      quoteAsset: 'USDC',
      totalSupply: 100_000_000,
      initialMarketCap: 100_000,
      migrationMarketCap: 1_500_000,
      percentageSupplyOnMigration: 15,
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 150,
        endingFeeBps: 80,
        numberOfPeriods: 24,
        totalDurationSec: 86_400,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 25,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    },
  },
  {
    id: 'deep-liquidity',
    name: 'Deep Migration',
    thesis:
      'A quarter of supply graduates. More liquidity on the AMM on day one, at the cost of a larger raise on the curve.',
    spec: {
      name: 'Deep Migration',
      description: 'Migration-heavy config for tokens that need AMM depth immediately.',
      quoteAsset: 'SOL',
      totalSupply: 1_000_000_000,
      initialMarketCap: 750,
      migrationMarketCap: 12_000,
      percentageSupplyOnMigration: 40,
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 250,
        endingFeeBps: 120,
        numberOfPeriods: 16,
        totalDurationSec: 14_400,
      },
      dynamicFee: { enabled: true, volatilityAccumulator: 400, maxFeeBps: 400 },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 200,
      creatorTradingFeePercentage: 30,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
      },
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
