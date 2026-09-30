/**
 * Build the launch transaction for a spec and simulate it against devnet.
 *
 * No SOL required: simulation reports the program logs, which is enough to prove
 * the generated call is well-formed and reaches the DBC program.
 *
 *   HTTPS_PROXY=http://127.0.0.1:7890 node --use-env-proxy --import tsx scripts/devnet-simulate.ts
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';

import { toConfigParams } from '../src/core/build';
import { getPreset } from '../src/core/presets';

const fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);

async function main() {
  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com',
    { commitment: 'confirmed', fetch: fetchImpl },
  );
  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const payer = Keypair.generate();
  const configKeypair = Keypair.generate();
  const quoteMint = new PublicKey('So11111111111111111111111111111111111111112');

  const spec = getPreset(process.argv[2] ?? 'fair-launch')!.spec;
  const config = toConfigParams(spec);

  const transaction = await client.partner.createConfig({
    ...config,
    config: configKeypair.publicKey,
    feeClaimer: payer.publicKey,
    leftoverReceiver: payer.publicKey,
    payer: payer.publicKey,
    quoteMint,
  } as never);

  transaction.feePayer = payer.publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.sign(payer, configKeypair);

  console.log('instructions:', transaction.instructions.length);
  console.log('programs:', [
    ...new Set(transaction.instructions.map((ix) => ix.programId.toBase58())),
  ].join(', '));

  const simulation = await connection.simulateTransaction(transaction);
  console.log('err:', JSON.stringify(simulation.value.err));
  const logs = simulation.value.logs ?? [];
  console.log('logs:', logs.length);
  for (const line of logs.slice(0, 14)) console.log('  ', line.slice(0, 130));
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 300));
  process.exit(1);
});
