/**
 * Feasibility spike: build a DBC curve config and quote against a virtual (pre-launch) pool.
 * Run: npx tsx scripts/spike.ts
 */
import BN from 'bn.js';
import { Connection } from '@solana/web3.js';
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DynamicBondingCurveClient,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const enums = {
  ActivationType,
  MigrationOption,
  MigrationFeeOption,
  TokenType,
  TokenDecimal,
  TokenAuthorityOption,
  CollectFeeMode,
  BaseFeeMode,
};
for (const [k, v] of Object.entries(enums)) {
  console.log(k, JSON.stringify(v));
}

const config = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.NINE,
    tokenAuthorityOption: TokenAuthorityOption.PartnerUpdateAuthority,
    totalTokenSupply: 1_000_000_000,
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
      feeSchedulerParam: {
        startingFeeBps: 200,
        endingFeeBps: 100,
        numberOfPeriod: 10,
        totalDuration: 3600,
      },
    },
    dynamicFeeEnabled: false,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: 0,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: false,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.FixedBps100,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
  },
  liquidityDistribution: {
    partnerPermanentLockedLiquidityPercentage: 0,
    partnerLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
    creatorLiquidityPercentage: 100,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0,
    numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0,
    totalVestingDuration: 0,
    cliffDurationFromMigrationTime: 0,
  },
  activationType: ActivationType.Slot,
  initialMarketCap: 500,
  migrationMarketCap: 5000,
} as any);

console.log('--- config keys ---');
console.log(Object.keys(config as any).join(', '));
console.log('--- curve ---');
console.log(JSON.stringify((config as any).curve, null, 1).slice(0, 1200));
console.log('migrationQuoteThreshold:', (config as any).migrationQuoteThreshold?.toString?.());

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const client = DynamicBondingCurveClient.create(connection, 'confirmed');

try {
  const quote = client.pool.getQuoteFromInputAmount({
    config: config as any,
    swapBaseForQuote: false,
    amountIn: new BN(1_000_000_000), // 1 SOL in
  } as any);
  console.log('--- quote result ---');
  console.log(JSON.stringify(quote, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1).slice(0, 2000));
} catch (err: any) {
  console.error('quote failed:', err?.message ?? err);
}
