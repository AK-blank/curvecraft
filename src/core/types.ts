/**
 * CurveCraft core types.
 *
 * A `LaunchSpec` is the human-facing description of a token launch on Meteora's
 * Dynamic Bonding Curve (DBC). It is compiled into real SDK `ConfigParameters`
 * by `build.ts`, simulated by `simulate.ts`, and turned back into runnable
 * TypeScript by `codegen.ts`.
 */

/** Quote asset a launch is denominated in. */
/**
 * What the launch is priced in. `SOL` and `USDC` are the two Meteora ships with,
 * but a DBC config takes any quote mint — tokenized equities, T-bills, another
 * project's token — which is how the same curve primitive ends up serving asset
 * classes beyond memes. Anything other than SOL/USDC carries its own decimals.
 */
export type QuoteAsset = 'SOL' | 'USDC' | (string & {});

/** How the base fee decays over the launch. */
export type FeeMode = 'linear' | 'exponential' | 'rateLimiter';

/** Where trading fees are collected. */
export type CollectFeeMode = 'quote' | 'output';

/** Migration target after the curve completes. */
export type MigrationTarget = 'dammV2' | 'dammV1';

/** Migration fee preset (basis points taken at migration). */
export type MigrationFeePreset = 25 | 30 | 100 | 200 | 400 | 600;

export interface FeeSchedule {
  /** First-swap fee, in basis points (100 = 1%). */
  startingFeeBps: number;
  /** Fee after the schedule ends, in basis points. */
  endingFeeBps: number;
  /** How many periods the decay is spread over. */
  numberOfPeriods: number;
  /** Total decay duration in seconds. */
  totalDurationSec: number;
}

export interface RateLimiterConfig {
  /** Base fee applied to a reference-sized trade, in bps. */
  baseFeeBps: number;
  /** Fee added when a trade is `referenceAmount` larger than the reference. */
  feeIncrementBps: number;
  /** Reference trade size, in quote units. */
  referenceAmount: number;
  /** Seconds it takes for the limiter to decay back to base. */
  maxLimiterDurationSec: number;
}

export interface DynamicFeeConfig {
  enabled: boolean;
  /** Volatility accumulated before the dynamic fee starts to bite. */
  volatilityAccumulator?: number;
  /** Fee ceiling applied at maximum volatility, in bps. */
  maxFeeBps?: number;
}

/**
 * How the bonding curve is shaped between the start and graduation price.
 *
 * - `marketCap`  — the SDK's single-segment curve derived from two market caps.
 * - `flat`       — 16 segments weighted towards deep liquidity early: supply sells
 *                  with little price movement, then accelerates into graduation.
 * - `linear`     — 16 evenly weighted segments (a long, uniform curve).
 * - `exponential`— 16 segments weighted towards late liquidity: price moves early,
 *                  then flattens as the curve approaches graduation.
 */
export type CurveShape = 'marketCap' | 'flat' | 'linear' | 'exponential';

export interface LaunchSpec {
  /** Display name, used in presets and exports. */
  name: string;
  /** Curve shape; defaults to the SDK's market-cap curve. */
  curveShape?: CurveShape;
  /** Short human note about what this launch is for. */
  description?: string;

  quoteAsset: QuoteAsset;
  /**
   * Quote token decimals. Defaults to 6 for USDC and 9 for everything else, so
   * a non-stablecoin quote (a tokenized stock with 8 decimals, say) must say so
   * or every price in the report will be off by a power of ten.
   */
  quoteDecimals?: number;
  /** Base token supply (whole tokens, before decimals). */
  totalSupply: number;
  /** Fully-diluted valuation at the first curve price, in quote units. */
  initialMarketCap: number;
  /** Fully-diluted valuation at graduation, in quote units. */
  migrationMarketCap: number;
  /** Share of supply that migrates to the AMM (0-100). */
  percentageSupplyOnMigration: number;

  feeMode: FeeMode;
  feeSchedule: FeeSchedule;
  rateLimiter?: RateLimiterConfig;
  dynamicFee: DynamicFeeConfig;
  collectFeeMode: CollectFeeMode;

  migrationTarget: MigrationTarget;
  migrationFeePreset: MigrationFeePreset;
  /** Share of trading fees routed to the creator (0-100). */
  creatorTradingFeePercentage: number;

  /** Partner + creator liquidity split at migration (must sum to 100). */
  liquidityDistribution?: {
    partnerLiquidityPercentage: number;
    partnerPermanentLockedLiquidityPercentage: number;
    creatorLiquidityPercentage: number;
    creatorPermanentLockedLiquidityPercentage: number;
  };

  /** Optional insider/team vesting that starts at migration. */
  lockedVesting?: {
    totalLockedVestingAmount: number;
    numberOfVestingPeriod: number;
    cliffUnlockAmount: number;
    totalVestingDuration: number;
    cliffDurationFromMigrationTime: number;
  };
}

/** One simulated trade. */
export interface TradeEvent {
  /** Seconds since launch. */
  t: number;
  side: 'buy' | 'sell';
  /**
   * For `buy`: quote units spent (e.g. SOL).
   * For `sell`: base tokens sold (whole tokens).
   */
  amount: number;
  /** Optional label so the UI can annotate interesting moments. */
  label?: string;
}

export interface Scenario {
  name: string;
  /** Wall-clock horizon of the launch run, in seconds. */
  horizonSec: number;
  events: TradeEvent[];
}

/** A single fill produced by the simulation. */
export interface SimulatedFill {
  t: number;
  side: 'buy' | 'sell';
  /** Quote units put in (buy) or taken out (sell). */
  quoteAmount: number;
  /** Base tokens taken out (buy) or put in (sell). */
  baseAmount: number;
  /** Spot price after the fill, in quote units per base token. */
  price: number;
  /** Fully-diluted valuation after the fill, in quote units. */
  marketCap: number;
  /** Progress towards graduation, 0-100. */
  progressPct: number;
  /** Trading fee paid on this fill, in quote units. */
  tradingFee: number;
  /** Protocol fee paid on this fill, in quote units. */
  protocolFee: number;
  /** Current curve point index. */
  curvePoint: number;
  label?: string;
}

export interface SimulationResult {
  specName: string;
  scenarioName: string;
  /** Quote units needed to graduate (migration threshold). */
  migrationQuoteThreshold: number;
  /** Price at the first curve point, in quote units per base token. */
  startPrice: number;
  /** Price at graduation. */
  migrationPrice: number;
  fills: SimulatedFill[];
  /** Time to graduation in seconds, or null if the curve never completed. */
  graduatedAtSec: number | null;
  /** Quote volume that went through the curve. */
  quoteVolume: number;
  /** Total trading fees generated. */
  tradingFees: number;
  /** Total protocol fees generated. */
  protocolFees: number;
  /** Peak market cap reached, in quote units. */
  peakMarketCap: number;
  /** Market cap at the end of the horizon. */
  finalMarketCap: number;
  /** Base tokens still held by the curve at the end. */
  remainingBase: number;
  /** Price path sampled for charting: [seconds, price][]. */
  pricePath: Array<[number, number]>;
  warnings: string[];
}

export interface CurvePointView {
  index: number;
  sqrtPrice: string;
  price: number;
  liquidity: string;
}

/** Plain (SDK-free) shape of the derived launch numbers, safe for client bundles. */
export interface SpecDerivedLike {
  migrationQuoteThreshold: number;
  startPrice: number;
  migrationPrice: number;
  migrationSupply: number;
  quoteDecimals: number;
}
