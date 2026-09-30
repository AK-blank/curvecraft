/**
 * The CurveCraft simulator.
 *
 * It replays a `Scenario` of trades against a *virtual* DBC pool using the
 * official SDK's swap math, so the numbers it prints (price, market cap, fees,
 * graduation) are the same numbers the on-chain program would produce for the
 * same sequence of trades.
 *
 * The trick: `client.pool.swapQuote2` is a pure function of the pool's
 * `sqrtPrice`, so we can walk the curve ourselves by feeding each fill's
 * `nextSqrtPrice` back in as the starting state.
 */
import BN from 'bn.js';
import { Connection } from '@solana/web3.js';
import {
  DynamicBondingCurveClient,
  SwapMode,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

import { deriveSpec, quoteDecimals, toConfigParams } from './build';
import type {
  LaunchSpec,
  Scenario,
  SimulatedFill,
  SimulationResult,
} from './types';

const Q64 = new BN(1).ushln(64);
const BASE_DECIMALS = 6;

/** A placeholder connection: quoting never touches the network. */
const OFFLINE_ENDPOINT = 'http://127.0.0.1:8899';

let cachedClient: DynamicBondingCurveClient | null = null;

function getClient(): DynamicBondingCurveClient {
  if (!cachedClient) {
    cachedClient = DynamicBondingCurveClient.create(
      new Connection(OFFLINE_ENDPOINT, 'confirmed'),
      'confirmed',
    );
  }
  return cachedClient;
}

interface VirtualPoolState {
  poolState: {
    sqrtPrice: BN;
    baseReserve: BN;
    quoteReserve: BN;
    activationPoint: BN;
    volatilityTracker: {
      lastUpdateTimestamp: BN;
      sqrtPriceReference: BN;
      volatilityAccumulator: BN;
      volatilityReference: BN;
      padding: number[];
    };
  };
}

function createVirtualPool(sqrtStartPrice: BN): VirtualPoolState {
  return {
    poolState: {
      sqrtPrice: new BN(sqrtStartPrice.toString()),
      baseReserve: new BN(0),
      quoteReserve: new BN(0),
      activationPoint: new BN(0),
      volatilityTracker: {
        lastUpdateTimestamp: new BN(0),
        sqrtPriceReference: new BN(0),
        volatilityAccumulator: new BN(0),
        volatilityReference: new BN(0),
        padding: [],
      },
    },
  };
}

/** Q64.64 sqrt price -> human price in quote units per base token. */
function sqrtPriceToPrice(sqrtPrice: BN, quoteDec: number): number {
  const sqrt = Number(sqrtPrice.toString()) / 2 ** 64;
  // sqrtPrice is Q64.64 over *raw* units; convert to quote units per whole base token.
  const raw = sqrt * sqrt;
  return raw / 10 ** (quoteDec - BASE_DECIMALS);
}

function curvePointFor(sqrtPrice: BN, points: BN[]): number {
  let index = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (sqrtPrice.gte(points[i])) index = i;
  }
  return index;
}

export interface SimulateOptions {
  /** Stop recording fills after this many events (safety valve). */
  maxFills?: number;
}

/**
 * Replay a scenario and return everything the UI needs to explain the launch.
 */
export function simulate(
  spec: LaunchSpec,
  scenario: Scenario,
  options: SimulateOptions = {},
): SimulationResult {
  const maxFills = options.maxFills ?? 5000;
  const config = toConfigParams(spec);
  const derived = deriveSpec(spec, config);
  const quoteDec = quoteDecimals(spec);
  const client = getClient();

  const raw = config as unknown as {
    sqrtStartPrice: { toString(): string };
    migrationQuoteThreshold: { toString(): string };
    curve: Array<{ sqrtPrice: { toString(): string } }>;
  };

  // `swapQuote2` expects a quote-ready config: the SDK ships a helper that
  // reconciles a `buildCurve*` output with the on-chain `PoolConfig` shape.
  // `normalizeQuoteConfig` is marked private in the SDK types but is the
  // supported way to make a `buildCurve*` output quote-ready; the SDK's own
  // `getQuoteFromInputAmount` calls it internally.
  const poolService = client.pool as unknown as {
    normalizeQuoteConfig: (config: unknown) => unknown;
  };
  const quoteConfig = poolService.normalizeQuoteConfig(config) as ConfigParameters;

  const migrationThreshold = new BN(raw.migrationQuoteThreshold.toString());
  const curveSqrtPrices = (raw.curve ?? []).map((p) => new BN(p.sqrtPrice.toString()));

  const pool = createVirtualPool(new BN(raw.sqrtStartPrice.toString()));

  const fills: SimulatedFill[] = [];
  const pricePath: Array<[number, number]> = [[0, derived.startPrice]];
  const warnings: string[] = [];

  let quoteVolume = 0;
  let tradingFees = 0;
  let protocolFees = 0;
  let peakMarketCap = derived.startPrice * spec.totalSupply;
  let graduatedAtSec: number | null = null;
  let remainingBase = spec.totalSupply;

  const events = [...scenario.events].sort((a, b) => a.t - b.t);

  for (const event of events) {
    if (graduatedAtSec !== null) break;
    if (fills.length >= maxFills) {
      warnings.push(`Stopped after ${maxFills} fills (safety limit).`);
      break;
    }

    const isBuy = event.side === 'buy';
    const amountIn = isBuy
      ? new BN(Math.round(event.amount * 10 ** quoteDec))
      : new BN(Math.round(event.amount * 10 ** BASE_DECIMALS));

    if (amountIn.isZero()) continue;

    // `currentPoint` in the quote math is the *clock* (slots or unix seconds),
    // not the curve segment: the fee scheduler reads it as `now`.
    const nowPoint = new BN(Math.max(0, Math.floor(event.t)));
    pool.poolState.volatilityTracker.lastUpdateTimestamp = new BN(
      Math.max(0, Math.floor(event.t)),
    );
    const curvePoint = curvePointFor(pool.poolState.sqrtPrice, curveSqrtPrices);

    let quote;
    try {
      quote = client.pool.swapQuote2({
        virtualPool: pool as never,
        config: quoteConfig,
        swapBaseForQuote: !isBuy,
        swapMode: SwapMode.PartialFill,
        amountIn,
        slippageBps: 0,
        hasReferral: false,
        currentPoint: nowPoint,
        eligibleForFirstSwapWithMinFee: false,
      } as never) as unknown as {
        includedFeeInputAmount: BN;
        excludedFeeInputAmount: BN;
        outputAmount: BN;
        nextSqrtPrice: BN;
        tradingFee: BN;
        protocolFee: BN;
        amountLeft: BN;
      };
    } catch (error) {
      warnings.push(
        `Trade at t=${event.t}s was rejected by the curve: ${
          (error as Error).message
        }`,
      );
      continue;
    }

    // A buy is quote-in / base-out; a sell is base-in / quote-out. The SDK
    // always reports `includedFeeInputAmount` in the *input* token.
    const inputRaw = Number(quote.includedFeeInputAmount.toString());
    const outputRaw = Number(quote.outputAmount.toString());
    const quoteIn = isBuy ? inputRaw / 10 ** quoteDec : 0;
    const baseOut = isBuy ? outputRaw / 10 ** BASE_DECIMALS : 0;
    const baseIn = isBuy ? 0 : inputRaw / 10 ** BASE_DECIMALS;
    const quoteOut = isBuy ? 0 : outputRaw / 10 ** quoteDec;
    const tradingFee = Number(quote.tradingFee.toString()) / 10 ** quoteDec;
    const protocolFee = Number(quote.protocolFee.toString()) / 10 ** quoteDec;

    // Advance the virtual pool.
    pool.poolState.sqrtPrice = new BN(quote.nextSqrtPrice.toString());
    if (isBuy) {
      pool.poolState.quoteReserve = pool.poolState.quoteReserve.add(quote.includedFeeInputAmount);
      pool.poolState.baseReserve = pool.poolState.baseReserve.sub(quote.outputAmount);
      remainingBase -= baseOut;
    } else {
      pool.poolState.quoteReserve = pool.poolState.quoteReserve.sub(quote.outputAmount);
      pool.poolState.baseReserve = pool.poolState.baseReserve.add(quote.includedFeeInputAmount);
      remainingBase += baseIn;
    }

    quoteVolume += isBuy ? quoteIn : quoteOut;
    tradingFees += tradingFee;
    protocolFees += protocolFee;

    const price = sqrtPriceToPrice(pool.poolState.sqrtPrice, quoteDec);
    const marketCap = price * spec.totalSupply;
    peakMarketCap = Math.max(peakMarketCap, marketCap);

    const progressPct = Math.min(
      100,
      (Number(pool.poolState.quoteReserve.toString()) /
        Number(migrationThreshold.toString())) *
        100,
    );

    fills.push({
      t: event.t,
      side: event.side,
      quoteAmount: isBuy ? quoteIn : quoteOut,
      baseAmount: isBuy ? baseOut : baseIn,
      price,
      marketCap,
      progressPct,
      tradingFee,
      protocolFee,
      curvePoint,
      label: event.label,
    });
    pricePath.push([event.t, price]);

    if (pool.poolState.quoteReserve.gte(migrationThreshold)) {
      graduatedAtSec = event.t;
    }
  }

  const finalMarketCap = fills.length
    ? fills[fills.length - 1].marketCap
    : derived.startPrice * spec.totalSupply;

  return {
    specName: spec.name,
    scenarioName: scenario.name,
    migrationQuoteThreshold: derived.migrationQuoteThreshold,
    startPrice: derived.startPrice,
    migrationPrice: derived.migrationPrice,
    fills,
    graduatedAtSec,
    quoteVolume,
    tradingFees,
    protocolFees,
    peakMarketCap,
    finalMarketCap,
    remainingBase,
    pricePath,
    warnings,
  };
}

export { Q64, BASE_DECIMALS, sqrtPriceToPrice };
