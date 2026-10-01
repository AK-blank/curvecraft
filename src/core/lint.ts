/**
 * Launch lint.
 *
 * The DBC program enforces a pile of rules that a config UI cannot infer: LP
 * percentages must sum to 100, at least 10% of migrated liquidity must be locked
 * at day 1, the fee scheduler must be well formed, the curve must be monotonic.
 * A config that violates one of them fails at `createConfig` — after the founder
 * has already told their community a launch date.
 *
 * The checks below call the SDK's own validators (`validateMinimumLockedLiquidity`,
 * `validateCurve`, `validatePoolFees`, `assertConfigAllowsNewPool`, …) so the lint
 * speaks the program's language rather than ours, and then add policy warnings
 * derived from measured simulator behaviour.
 *
 * Note: the SDK also exports a top-level `validateConfigParameters`, but it
 * expects a full `CreateConfigParams` (including `leftoverReceiver`), so calling it
 * with only the compiled config throws a `PublicKey` error before it reaches the
 * liquidity rules. We compose the individual validators instead.
 */
import {
  assertConfigAllowsNewPool,
  validateCurve,
  validateMigrationFee,
  validateMinimumLockedLiquidity,
  validatePoolFees,
  getLiquidityVestingInfoParams,
  calculateLockedLiquidityBpsAtTime,
  SECONDS_PER_DAY,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

import { toConfigParams } from './build';
import type { LaunchSpec } from './types';

export type LintLevel = 'error' | 'warning' | 'pass';

export interface LintItem {
  id: string;
  level: LintLevel;
  title: string;
  detail: string;
}

export interface LintResult {
  ok: boolean;
  items: LintItem[];
}

/** Percentages the SDK sees for a spec (defaults filled in). */
function liquidityOf(spec: LaunchSpec) {
  return {
    partnerLiquidityPercentage: spec.liquidityDistribution?.partnerLiquidityPercentage ?? 0,
    partnerPermanentLockedLiquidityPercentage:
      spec.liquidityDistribution?.partnerPermanentLockedLiquidityPercentage ?? 0,
    creatorLiquidityPercentage: spec.liquidityDistribution?.creatorLiquidityPercentage ?? 100,
    creatorPermanentLockedLiquidityPercentage:
      spec.liquidityDistribution?.creatorPermanentLockedLiquidityPercentage ?? 0,
    partnerLiquidityVesting: spec.liquidityDistribution?.partnerLiquidityVesting,
    creatorLiquidityVesting: spec.liquidityDistribution?.creatorLiquidityVesting,
  };
}

/**
 * Turn an SDK build failure into something a founder can act on.
 *
 * `buildCurveWithMarketCap` throws "Not enough liquidity" when the requested
 * market-cap range cannot be covered by the configured supply — which happens
 * when a weighted curve shape is switched back to the single-segment curve, or
 * when the graduation multiple is too aggressive for the supply.
 */
export function explainBuildError(message: string, spec: LaunchSpec): string {
  if (/not enough liquidity/i.test(message)) {
    return [
      `The ${spec.curveShape && spec.curveShape !== 'marketCap' ? spec.curveShape : 'market-cap'} curve cannot reach ${spec.migrationMarketCap.toLocaleString('en-US')} ${spec.quoteAsset} from ${spec.initialMarketCap.toLocaleString('en-US')} with ${spec.totalSupply.toLocaleString('en-US')} tokens in supply.`,
      'The segments would need more tokens than exist. Raise the graduation market cap, increase supply, lower the start market cap, or pick a different curve shape.',
    ].join(' ');
  }
  return message;
}

export function lintSpec(spec: LaunchSpec): LintResult {
  const items: LintItem[] = [];
  let config: ReturnType<typeof toConfigParams>;
  try {
    config = toConfigParams(spec);
  } catch (error) {
    return {
      ok: false,
      items: [
        {
          id: 'compile',
          level: 'error',
          title: 'This configuration cannot be compiled',
          detail: explainBuildError((error as Error).message, spec),
        },
      ],
    };
  }
  const compiled = config as unknown as {
    curve: Array<{ sqrtPrice: unknown; liquidity: unknown }>;
    sqrtStartPrice: unknown;
    poolFees: unknown;
    collectFeeMode: number;
    activationType: number;
    migrationOption: number;
    poolFeesBaseFeeMode: number;
  };
  const liquidity = liquidityOf(spec);

  // --- rules the program enforces -----------------------------------------

  const lpTotal =
    liquidity.partnerLiquidityPercentage +
    liquidity.partnerPermanentLockedLiquidityPercentage +
    liquidity.creatorLiquidityPercentage +
    liquidity.creatorPermanentLockedLiquidityPercentage;

  items.push(
    lpTotal === 100
      ? {
          id: 'lp-percentages',
          level: 'pass',
          title: 'LP percentages sum to 100',
          detail: `${liquidity.creatorLiquidityPercentage}% liquid + ${liquidity.creatorPermanentLockedLiquidityPercentage}% permanently locked.`,
        }
      : {
          id: 'lp-percentages',
          level: 'error',
          title: 'LP percentages must sum to 100',
          detail: `Current total is ${lpTotal}%. Adjust the liquid and locked shares; the program rejects anything else.`,
        },
  );

  // The rule is about liquidity locked one day after migration, and vesting
  // counts. A schedule with a cliff that covers day 1 is a legal alternative to
  // a permanent lock — which is what the aggressive configs on mainnet rely on,
  // so checking only the permanent percentages would reject valid designs.
  const vestingInfo = (v?: { vestingPercentage: number; bpsPerPeriod: number; numberOfPeriods: number; cliffDurationFromMigrationTime: number; totalDuration: number }) =>
    v
      ? getLiquidityVestingInfoParams(
          v.vestingPercentage,
          v.bpsPerPeriod,
          v.numberOfPeriods,
          v.cliffDurationFromMigrationTime,
          v.totalDuration,
        )
      : undefined;
  const lockedBps = calculateLockedLiquidityBpsAtTime(
    liquidity.partnerPermanentLockedLiquidityPercentage,
    liquidity.creatorPermanentLockedLiquidityPercentage,
    vestingInfo(liquidity.partnerLiquidityVesting) as never,
    vestingInfo(liquidity.creatorLiquidityVesting) as never,
    SECONDS_PER_DAY,
  );
  const lockedOk = validateMinimumLockedLiquidity(
    liquidity.partnerPermanentLockedLiquidityPercentage,
    liquidity.creatorPermanentLockedLiquidityPercentage,
    vestingInfo(liquidity.partnerLiquidityVesting) as never,
    vestingInfo(liquidity.creatorLiquidityVesting) as never,
  );
  items.push(
    lockedOk
      ? {
          id: 'locked-liquidity',
          level: 'pass',
          title: 'Enough liquidity locked at day 1',
          detail:
            `${lockedBps} bps locked at day 1 (program minimum is 1000 bps / 10%)` +
            (liquidity.creatorLiquidityVesting || liquidity.partnerLiquidityVesting
              ? ', counting the vesting cliff.'
              : ' through the permanent lock.'),
        }
      : {
          id: 'locked-liquidity',
          level: 'error',
          title: 'Not enough liquidity locked at day 1',
          detail: `${lockedBps} bps locked at day 1, but the program requires at least 1000 bps (10%). Raise the locked share, or add a vesting cliff that holds through day 1 — a launch with nothing locked will fail at createConfig.`,
        },
  );

  let curveOk = false;
  try {
    curveOk = validateCurve(compiled.curve as never, compiled.sqrtStartPrice as never);
  } catch {
    curveOk = false;
  }
  items.push(
    curveOk
      ? {
          id: 'curve',
          level: 'pass',
          title: 'Curve is well formed',
          detail: `${compiled.curve?.length ?? 0} curve point(s), monotonically increasing above the start price.`,
        }
      : {
          id: 'curve',
          level: 'error',
          title: 'Curve is not deployable',
          detail:
            'The compiled curve failed validateCurve: prices must increase monotonically and stay below the program maximum.',
        },
  );

  let feesOk = false;
  try {
    feesOk = validatePoolFees(
      compiled.poolFees as never,
      compiled.collectFeeMode,
      compiled.activationType,
    );
  } catch {
    feesOk = false;
  }
  items.push(
    feesOk
      ? {
          id: 'pool-fees',
          level: 'pass',
          title: 'Fee schedule is valid',
          detail: `${spec.feeMode} · ${spec.feeSchedule.startingFeeBps} → ${spec.feeSchedule.endingFeeBps} bps.`,
        }
      : {
          id: 'pool-fees',
          level: 'error',
          title: 'Fee schedule is invalid',
          detail: 'validatePoolFees rejected this schedule for the chosen collect-fee mode.',
        },
  );

  let newPoolOk = true;
  try {
    assertConfigAllowsNewPool({
      baseFeeMode: (compiled.poolFees as { baseFee?: { baseFeeMode?: number } })?.baseFee
        ?.baseFeeMode as number,
      migrationOption: compiled.migrationOption,
    });
  } catch (error) {
    newPoolOk = false;
    items.push({
      id: 'new-pool',
      level: 'error',
      title: 'Config cannot create new pools',
      detail: (error as Error).message.slice(0, 180),
    });
  }
  if (newPoolOk) {
    items.push({
      id: 'new-pool',
      level: 'pass',
      title: 'Config can create new pools',
      detail: 'assertConfigAllowsNewPool accepted this fee mode and migration option.',
    });
  }

  const migrationFeeOk = validateMigrationFee({
    feePercentage: 0,
    creatorFeePercentage: 0,
  });
  items.push(
    migrationFeeOk
      ? {
          id: 'migration-fee',
          level: 'pass',
          title: 'Migration fee is valid',
          detail: `${spec.migrationFeePreset} bps preset.`,
        }
      : {
          id: 'migration-fee',
          level: 'error',
          title: 'Migration fee is invalid',
          detail: 'validateMigrationFee rejected the configured split.',
        },
  );

  // --- policy warnings from measured simulator behaviour -------------------

  const ratio = spec.migrationMarketCap / Math.max(1, spec.initialMarketCap);
  if (ratio < 2) {
    items.push({
      id: 'price-discovery',
      level: 'warning',
      title: 'Very little price discovery',
      detail: `Graduation is only ${ratio.toFixed(2)}× the start. Most of the price move happens on the AMM after migration, not on the curve.`,
    });
  }

  const decayHours = spec.feeSchedule.totalDurationSec / 3_600;
  const feeContrast = spec.feeSchedule.startingFeeBps / Math.max(1, spec.feeSchedule.endingFeeBps);
  if (feeContrast >= 2 && decayHours > 1) {
    items.push({
      id: 'sniper-window',
      level: 'warning',
      title: 'Fee decay is slower than the sniper window',
      detail: `A ${decayHours.toFixed(1)}h decay from ${spec.feeSchedule.startingFeeBps} to ${spec.feeSchedule.endingFeeBps} bps measured a sniper premium of roughly +1% in simulation. Decay inside minutes, not hours, if taxing bots is the goal.`,
    });
  }

  if (spec.dynamicFee.enabled && !spec.dynamicFee.maxFeeBps) {
    items.push({
      id: 'dynamic-fee',
      level: 'warning',
      title: 'Dynamic fee enabled without a ceiling',
      detail:
        'Volatility-scaled fees are on but no max fee is set. The simulator models this as the base schedule, so the report may understate fees during volatile launches.',
    });
  }

  if (spec.percentageSupplyOnMigration < 5) {
    items.push({
      id: 'migration-depth',
      level: 'warning',
      title: 'Thin AMM liquidity on migration',
      detail: `Only ${spec.percentageSupplyOnMigration}% of supply migrates. Thin migrated liquidity means violent price action right after graduation.`,
    });
  } else if (spec.percentageSupplyOnMigration > 50) {
    items.push({
      id: 'migration-depth',
      level: 'warning',
      title: 'Large share of supply migrating',
      detail: `${spec.percentageSupplyOnMigration}% of supply graduates. That deepens the AMM but requires a much larger raise on the curve.`,
    });
  }

  if (spec.creatorTradingFeePercentage > 50) {
    items.push({
      id: 'creator-fee',
      level: 'warning',
      title: 'Creator takes most of the trading fees',
      detail: `${spec.creatorTradingFeePercentage}% of trading fees go to the creator. Traders notice; this is a launch-positioning decision, not a bug.`,
    });
  }

  const ok = !items.some((item) => item.level === 'error');
  return { ok, items };
}
