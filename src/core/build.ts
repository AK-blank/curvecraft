/**
 * Compile a human-facing `LaunchSpec` into real Meteora DBC `ConfigParameters`.
 *
 * Everything here is pure: no network access, no connection required. The
 * resulting config object is byte-for-byte what you would pass to
 * `client.partner.createConfig()` on chain.
 */
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
  buildCurveWithTwoSegments,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

import type { CurvePointView, LaunchSpec, SpecDerivedLike } from './types';

/** Quote token decimals: SOL has 9, USDC has 6. */
export function quoteDecimals(spec: LaunchSpec): number {
  return spec.quoteAsset === 'USDC' ? 6 : 9;
}

const MIGRATION_FEE_OPTION: Record<number, MigrationFeeOption> = {
  25: MigrationFeeOption.FixedBps25,
  30: MigrationFeeOption.FixedBps30,
  100: MigrationFeeOption.FixedBps100,
  200: MigrationFeeOption.FixedBps200,
  400: MigrationFeeOption.FixedBps400,
  600: MigrationFeeOption.FixedBps600,
};

function baseFeeParams(spec: LaunchSpec) {
  if (spec.feeMode === 'rateLimiter') {
    const rl = spec.rateLimiter ?? {
      baseFeeBps: spec.feeSchedule.startingFeeBps,
      feeIncrementBps: 100,
      referenceAmount: 1,
      maxLimiterDurationSec: 3600,
    };
    return {
      baseFeeMode: BaseFeeMode.RateLimiter,
      rateLimiterParam: {
        baseFeeBps: rl.baseFeeBps,
        feeIncrementBps: rl.feeIncrementBps,
        referenceAmount: rl.referenceAmount,
        maxLimiterDuration: rl.maxLimiterDurationSec,
      },
    } as const;
  }

  return {
    baseFeeMode:
      spec.feeMode === 'exponential'
        ? BaseFeeMode.FeeSchedulerExponential
        : BaseFeeMode.FeeSchedulerLinear,
    feeSchedulerParam: {
      startingFeeBps: spec.feeSchedule.startingFeeBps,
      endingFeeBps: spec.feeSchedule.endingFeeBps,
      numberOfPeriod: spec.feeSchedule.numberOfPeriods,
      totalDuration: spec.feeSchedule.totalDurationSec,
    },
  } as const;
}

export interface BuildOptions {
  /**
   * `marketCap` (default): one constant-product segment derived from initial and
   * migration market caps.
   * `twoSegments`: two segments with an explicit share of supply migrating.
   */
  curve?: 'marketCap' | 'twoSegments';
}

/** Build the DBC config parameters for a launch spec. */
export function toConfigParams(
  spec: LaunchSpec,
  options: BuildOptions = {},
): ConfigParameters {
  const liquidity = spec.liquidityDistribution ?? {
    partnerPermanentLockedLiquidityPercentage: 0,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 100,
  };

  const lockedVesting = spec.lockedVesting ?? {
    totalLockedVestingAmount: 0,
    numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0,
    totalVestingDuration: 0,
    cliffDurationFromMigrationTime: 0,
  };

  const common = {
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quoteDecimals(spec),
      tokenAuthorityOption: TokenAuthorityOption.CreatorUpdateAuthority,
      totalTokenSupply: spec.totalSupply,
      leftover: 0,
    },
    fee: {
      baseFeeParams: baseFeeParams(spec),
      dynamicFeeEnabled: spec.dynamicFee.enabled,
      collectFeeMode:
        spec.collectFeeMode === 'output'
          ? CollectFeeMode.OutputToken
          : CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: spec.creatorTradingFeePercentage,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption:
        spec.migrationTarget === 'dammV1'
          ? MigrationOption.MET_DAMM
          : MigrationOption.MET_DAMM_V2,
      migrationFeeOption:
        MIGRATION_FEE_OPTION[spec.migrationFeePreset] ??
        MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage:
        liquidity.partnerPermanentLockedLiquidityPercentage,
      partnerLiquidityPercentage: liquidity.partnerLiquidityPercentage,
      creatorPermanentLockedLiquidityPercentage:
        liquidity.creatorPermanentLockedLiquidityPercentage,
      creatorLiquidityPercentage: liquidity.creatorLiquidityPercentage,
    },
    lockedVesting,
    // Timestamp activation keeps fee-schedule durations in seconds, which is
    // what a launch designer actually reasons about (and what the simulator replays).
    activationType: ActivationType.Timestamp,
    initialMarketCap: spec.initialMarketCap,
    migrationMarketCap: spec.migrationMarketCap,
  };

  if (options.curve === 'twoSegments') {
    return buildCurveWithTwoSegments({
      ...common,
      percentageSupplyOnMigration: spec.percentageSupplyOnMigration,
    } as never);
  }

  return buildCurveWithMarketCap(common as never);
}

/** Readable view of the compiled curve checkpoints. */
export function toCurvePoints(config: ConfigParameters): CurvePointView[] {
  const curve = (config as unknown as { curve?: Array<{ sqrtPrice: unknown; liquidity: unknown }> })
    .curve ?? [];

  return curve.map((point, index) => {
    const sqrtPriceStr = point.sqrtPrice?.toString?.() ?? String(point.sqrtPrice);
    return {
      index,
      sqrtPrice: sqrtPriceStr,
      // sqrtPrice is a Q64.64 fixed point number.
      price: Number(BigInt(sqrtPriceStr)) / 2 ** 64 === 0
        ? 0
        : (Number(BigInt(sqrtPriceStr)) / 2 ** 64) ** 2,
      liquidity: point.liquidity?.toString?.() ?? String(point.liquidity),
    };
  });
}

export type SpecDerived = SpecDerivedLike;

/** Numbers the UI shows next to a spec, derived from the compiled config. */
export function deriveSpec(spec: LaunchSpec, config: ConfigParameters): SpecDerived {
  const raw = config as unknown as {
    migrationQuoteThreshold: { toString(): string };
    sqrtStartPrice: { toString(): string };
    migrationSqrtPrice?: { toString(): string };
  };

  const decimals = quoteDecimals(spec);
  const threshold = Number(BigInt(raw.migrationQuoteThreshold.toString())) / 10 ** decimals;
  const sqrtStart = Number(BigInt(raw.sqrtStartPrice.toString())) / 2 ** 64;
  const migrationSqrt = raw.migrationSqrtPrice
    ? Number(BigInt(raw.migrationSqrtPrice.toString())) / 2 ** 64
    : Math.sqrt(
        (spec.migrationMarketCap / spec.totalSupply) *
          10 ** decimals /
          10 ** 6,
      );

  // sqrtPrice is Q64.64 over raw units -> quote units per whole base token.
  const startPrice = sqrtStart ** 2 / 10 ** (decimals - 6);
  const migrationPrice = migrationSqrt ** 2 / 10 ** (decimals - 6);

  return {
    migrationQuoteThreshold: threshold,
    startPrice,
    migrationPrice,
    migrationSupply: (spec.totalSupply * spec.percentageSupplyOnMigration) / 100,
    quoteDecimals: decimals,
  };
}
