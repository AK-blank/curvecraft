/**
 * Simulate the generated createConfig transaction against mainnet state without
 * spending anything.
 *
 * The fee payer is an existing funded account and signature verification is off,
 * so the RPC executes the DBC program for real and returns its logs.
 *
 *   HTTPS_PROXY=http://127.0.0.1:7890 node --use-env-proxy --import tsx scripts/mainnet-simulate.ts
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

import { toConfigParams } from '../src/core/build';
import { getPreset } from '../src/core/presets';

const fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);

async function main() {
  const connection = new Connection('https://api.mainnet-beta.solana.com', {
    commitment: 'confirmed',
    fetch: fetchImpl,
  });
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');

  // Any funded account can act as the fee payer when signatures are not verified.
  const funded = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
  const configKeypair = Keypair.generate();
  const quoteMint = new PublicKey('So11111111111111111111111111111111111111112');

  const spec = structuredClone(getPreset(process.argv[2] ?? 'fair-launch')!.spec);
  if (process.argv.includes('--naive')) {
    // The split a designer reaches for first: nothing permanently locked.
    spec.liquidityDistribution = {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 100,
      creatorPermanentLockedLiquidityPercentage: 0,
    };
  }
  const config = toConfigParams(spec);

  const transaction = await client.partner.createConfig({
    ...config,
    config: configKeypair.publicKey,
    feeClaimer: funded,
    leftoverReceiver: funded,
    payer: funded,
    quoteMint,
  } as never);

  transaction.feePayer = funded;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.sign(configKeypair);
  void Keypair;

  console.log('programs:', [...new Set(transaction.instructions.map((ix) => ix.programId.toBase58()))].join(', '));
  // Raw JSON-RPC: web3.js rejects a transaction whose fee payer is unsigned
  // before the RPC ever sees the `sigVerify: false` flag.
  const response = await fetch('https://api.mainnet-beta.solana.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'simulateTransaction',
      params: [
        transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'),
        { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' },
      ],
    }),
  });
  const payload = (await response.json()) as {
    result?: { value: { err: unknown; logs?: string[] } };
    error?: unknown;
  };
  if (payload.error) {
    console.log('rpc error:', JSON.stringify(payload.error).slice(0, 200));
    return;
  }
  const value = payload.result!.value;
  console.log('err:', JSON.stringify(value.err));
  for (const line of (value.logs ?? []).slice(0, 20)) console.log('  ', line.slice(0, 140));
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 300));
  process.exit(1);
});
