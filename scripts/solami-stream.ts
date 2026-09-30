/**
 * Watch the Meteora Dynamic Bonding Curve program through Solami.
 *
 * Two modes, because the Solami bounty asks for a live mainnet demo and the
 * snapshot pipeline needs a non-streaming read:
 *
 *   npm run solami:pools              enumerate live VirtualPool accounts
 *   npm run solami:stream [seconds]   follow DBC transactions on the firehose
 *
 * Both need SOLAMI_RPC_TOKEN (the SDK's own variable name; SOLAMI_API_KEY is
 * accepted as a fallback). Without it the script explains what to set and exits
 * cleanly rather than pretending the data path works.
 */
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

import { specFromPoolConfig } from '../src/core/livepools';
import { redactEndpoint } from '../src/core/providers';
import {
  accountsFromUpdate,
  discoverPoolsViaSolami,
  hasSolami,
  solamiConnection,
  solamiToken,
  streamDbcActivity,
} from '../src/core/solami-source';

const QUOTE_DECIMALS = 9;

async function enumeratePools(): Promise<void> {
  // Enumerate with the same cap the snapshot uses, then decode only the first
  // few: the point of this mode is to show how much the endpoint can see.
  const found = await discoverPoolsViaSolami({ limit: 512, includeTransferHook: true });
  console.log(
    `getProgramAccountsV2 → ${found.addresses.length} VirtualPool accounts` +
      ` (server sent ${found.scanned} rows${found.truncated ? ', capped by our limit' : ''})`,
  );

  const connection = await solamiConnection();
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');

  console.log(`decoding the first 8 of ${found.addresses.length}:`);
  let shown = 0;
  for (const address of found.addresses) {
    if (shown >= 8) break;
    try {
      const account = (await client.state.getPool(address)) as unknown as {
        poolState?: {
          quoteReserve?: { toString(): string };
          config?: { toBase58(): string };
          baseMint?: { toBase58(): string };
          isMigrated?: number | boolean;
        };
      } | null;
      const state = account?.poolState;
      if (!state?.quoteReserve) continue;

      const raised = Number(state.quoteReserve.toString()) / 10 ** QUOTE_DECIMALS;
      let threshold = 0;
      let design = 'unknown design';
      const configAddress = state.config?.toBase58();
      if (configAddress) {
        const config = (await client.state.getPoolConfig(configAddress)) as unknown as {
          migrationQuoteThreshold?: { toString(): string };
        };
        threshold = Number(config?.migrationQuoteThreshold?.toString() ?? 0) / 10 ** QUOTE_DECIMALS;
        const spec = specFromPoolConfig(config, {
          address,
          creator: 'unknown',
          progressPct: threshold ? (raised / threshold) * 100 : 0,
          liveThreshold: threshold,
        });
        if (spec) design = spec.name ?? 'derived design';
      }

      const progress = threshold ? Math.min(100, (raised / threshold) * 100) : 0;
      console.log(
        `  ${address.slice(0, 8)}…  raised ${raised.toFixed(2)} / ${threshold.toFixed(2)}` +
          `  (${progress.toFixed(1)}%)  ${state.isMigrated ? 'migrated' : 'bonding'}  ${design}`,
      );
      shown += 1;
    } catch (error) {
      console.log(`  ${address.slice(0, 8)}…  decode failed: ${(error as Error).message.slice(0, 60)}`);
    }
  }
}

async function stream(seconds: number): Promise<void> {
  console.log(`Following DBC transactions for ${seconds}s…`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), seconds * 1000);
  let count = 0;

  try {
    await streamDbcActivity({
      signal: controller.signal,
      onActivity: (activity) => {
        count += 1;
        const interesting = activity.accounts.filter((a) => a.length > 32).slice(0, 3);
        console.log(
          `  slot ${activity.slot}  ${activity.signature.slice(0, 12)}…  ` +
            `${activity.accounts.length} accounts touched${interesting.length ? ` (${interesting.map((a) => a.slice(0, 6)).join(', ')}…)` : ''}`,
        );
      },
      onError: (error) => console.error('  stream error:', error.message.slice(0, 80)),
    });
  } finally {
    clearTimeout(timer);
  }
  console.log(`\n${count} DBC transactions seen in ${seconds}s.`);
}

async function main(): Promise<void> {
  if (!hasSolami()) {
    console.error('SOLAMI_RPC_TOKEN is not set — the Solami data path is off.');
    console.error('Get a token at https://solami.dev (the Crypto World\u2019s Fair link gives 7 days of Pro).');
    process.exitCode = 1;
    return;
  }

  const token = solamiToken() as string;
  console.log(`Solami token ${token.slice(0, 4)}…${token.slice(-2)} (${redactEndpoint(`?api_key=${token}`)})`);
  const mode = process.argv[2] ?? 'pools';

  if (mode === 'stream') {
    await stream(Number(process.argv[3] ?? 60));
  } else {
    await enumeratePools();
  }
}

main().catch((error) => {
  console.error('solami script failed:', (error as Error).message);
  process.exitCode = 1;
});
