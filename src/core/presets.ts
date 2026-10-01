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
        creatorLiquidityPercentage: 90,
        creatorPermanentLockedLiquidityPercentage: 10,
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
        creatorLiquidityPercentage: 85,
        creatorPermanentLockedLiquidityPercentage: 15,
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
        creatorLiquidityPercentage: 90,
        creatorPermanentLockedLiquidityPercentage: 10,
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
        creatorLiquidityPercentage: 80,
        creatorPermanentLockedLiquidityPercentage: 20,
      },
    },
  },
  {
    id: 'equity-pair',
    name: 'Tokenized Equity Pair',
    thesis:
      'A tokenized stock is the quote asset, so the launch prices discovery against a real-world name instead of SOL. A flat curve holds the price steady while supply sells, which is what a thinly traded equity pair needs — the same primitive serving an asset class that is not a meme.',
    spec: {
      name: 'Tokenized Equity Pair',
      description:
        'Equity-quoted launch: the quote mint is a tokenized stock (8 decimals). Deep early liquidity keeps the first minutes boring, which is the point when the underlying is a real-world name.',
      quoteAsset: 'xStock',
      quoteDecimals: 8,
      totalSupply: 100_000_000,
      initialMarketCap: 250_000,
      migrationMarketCap: 2_000_000,
      percentageSupplyOnMigration: 25,
      curveShape: 'flat',
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 100,
        endingFeeBps: 50,
        numberOfPeriods: 24,
        totalDurationSec: 21_600,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 10,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 80,
        creatorPermanentLockedLiquidityPercentage: 20,
      },
    },
  },
  {
    id: 'rwa-yield',
    name: 'RWA Yield Pair',
    thesis:
      'A treasury-style pair: low fees, most of the supply locked at migration, and a slow curve. Nobody should be day-trading a claim on short-term credit, so the config is built to make churn expensive and holding cheap.',
    spec: {
      name: 'RWA Yield Pair',
      description:
        'RWA-flavoured launch: USDC quote, 30% of migrated liquidity permanently locked, 24-hour linear fee decay from 1% to 0.4%.',
      quoteAsset: 'USDC',
      totalSupply: 500_000_000,
      initialMarketCap: 500_000,
      migrationMarketCap: 5_000_000,
      percentageSupplyOnMigration: 35,
      curveShape: 'flat',
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 100,
        endingFeeBps: 40,
        numberOfPeriods: 24,
        totalDurationSec: 86_400,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 200,
      creatorTradingFeePercentage: 10,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 70,
        creatorPermanentLockedLiquidityPercentage: 30,
      },
    },
  },
  {
    id: 'agent-token',
    name: 'AI Agent Token',
    thesis:
      'An agent token has no product to price, only attention, so the launch should discover a price fast and then stop being the story. An exponential curve moves early and flattens into graduation.',
    spec: {
      name: 'AI Agent Token',
      description:
        'Agent-token launch: exponential curve for fast early discovery, a steep 60-minute fee decay, and 15% locked at migration so the agent has runway.',
      quoteAsset: 'SOL',
      totalSupply: 1_000_000_000,
      initialMarketCap: 300,
      migrationMarketCap: 6_000,
      percentageSupplyOnMigration: 18,
      curveShape: 'exponential',
      feeMode: 'exponential',
      feeSchedule: {
        startingFeeBps: 1_000,
        endingFeeBps: 100,
        numberOfPeriods: 12,
        totalDurationSec: 3_600,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 30,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 85,
        creatorPermanentLockedLiquidityPercentage: 15,
      },
    },
  },
  {
    id: 'icm-pair',
    name: 'ICM Pair',
    thesis:
      'The quote asset is another community or creator token, so a sub-community prices discovery inside an economy it already belongs to instead of against SOL. Fees are collected in that same token, which means the parent treasury accumulates rather than drains, and a linear curve keeps pricing legible for holders who are not traders.',
    spec: {
      name: 'ICM Pair',
      description:
        'Community-quoted launch: the quote mint is a parent ICM or creator token (6 decimals — replace the placeholder mint in the exported script). A linear curve and a 15% permanently locked share keep the sub-community aligned with the parent.',
      // Any SPL mint works as a quote asset; the exported script carries a
      // TODO where the real ICM token address goes.
      quoteAsset: 'ICM',
      quoteDecimals: 6,
      totalSupply: 1_000_000_000,
      initialMarketCap: 150_000,
      migrationMarketCap: 1_200_000,
      percentageSupplyOnMigration: 30,
      curveShape: 'linear',
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 150,
        endingFeeBps: 75,
        numberOfPeriods: 12,
        totalDurationSec: 21_600,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'quote',
      migrationTarget: 'dammV2',
      migrationFeePreset: 100,
      creatorTradingFeePercentage: 15,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 85,
        creatorPermanentLockedLiquidityPercentage: 15,
      },
    },
  },
  {
    id: 'market-mode',
    name: 'Market Mode',
    thesis:
      'The config the market actually ships, measured across 200 live DBC launches: a 600 bps migration fee, half of trading fees to the creator, no permanent lock. One change is forced by the rules rather than by taste — a vesting cliff holds 12% through day 1, because half the configs on mainnet skip that and the program still requires it.',
    spec: {
      name: 'Market Mode',
      description:
        'The measured modal launch: SOL-quoted, dammV2 migration, 600 bps migration fee, 50% creator trading fee, 25 bps base fee, nothing permanently locked. A one-day vesting cliff satisfies the day-1 lock rule that most live configs fail.',
      quoteAsset: 'SOL',
      totalSupply: 1_000_000_000,
      initialMarketCap: 50,
      migrationMarketCap: 500,
      percentageSupplyOnMigration: 20,
      feeMode: 'linear',
      feeSchedule: {
        startingFeeBps: 25,
        endingFeeBps: 25,
        numberOfPeriods: 0,
        totalDurationSec: 0,
      },
      dynamicFee: { enabled: false },
      collectFeeMode: 'output',
      migrationTarget: 'dammV2',
      migrationFeePreset: 600,
      creatorTradingFeePercentage: 50,
      liquidityDistribution: {
        partnerLiquidityPercentage: 0,
        partnerPermanentLockedLiquidityPercentage: 0,
        creatorLiquidityPercentage: 100,
        creatorPermanentLockedLiquidityPercentage: 0,
        // Nothing unlocks for a day, so the whole 12% counts as locked at day 1
        // (1200 bps against a 1000 bps floor), then it vests out over ten days.
        creatorLiquidityVesting: {
          vestingPercentage: 12,
          bpsPerPeriod: 1000,
          numberOfPeriods: 10,
          cliffDurationFromMigrationTime: 86_400,
          totalDuration: 864_000,
        },
      },
    },
  },
];

export function getPreset(id: string): Preset | undefined {
  return PRESETS.find((preset) => preset.id === id);
}
