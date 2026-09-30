/**
 * Prove the exported launch script works: create a real DBC config on devnet.
 *
 *   HTTPS_PROXY=http://127.0.0.1:7890 node --use-env-proxy --import tsx scripts/devnet-launch.ts
 *
 * Uses a throwaway keypair in /tmp; no user wallet is involved.
 */
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DynamicBondingCurveClient, TokenType, TokenDecimal, TokenAuthorityOption } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

import { toConfigParams } from '../src/core/build';
import { getPreset } from '../src/core/presets';

const KEY_PATH = '/tmp/curvecraft-devnet-key.json';
const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com';
const fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args);

async function main() {
  const connection = new Connection(RPC, { commitment: 'confirmed', fetch: fetchImpl });
  const payer = existsSync(KEY_PATH)
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(KEY_PATH, 'utf8'))))
    : Keypair.generate();
  writeFileSync(KEY_PATH, JSON.stringify([...payer.secretKey]));
  console.log('payer:', payer.publicKey.toBase58());

  let balance = await connection.getBalance(payer.publicKey);
  console.log('balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  if (balance < 0.5 * LAMPORTS_PER_SOL) {
    console.log('requesting airdrop…');
    try {
      const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, 'confirmed');
    } catch (error) {
      console.log('airdrop failed:', (error as Error).message.slice(0, 140));
    }
    balance = await connection.getBalance(payer.publicKey);
    console.log('balance after airdrop:', balance / LAMPORTS_PER_SOL, 'SOL');
  }

  const spec = getPreset('fair-launch')!.spec;
  const config = toConfigParams(spec);
  console.log('compiled config: raise', config.migrationQuoteThreshold.toString());

  const client = DynamicBondingCurveClient.create(connection, 'confirmed');
  const { PublicKey } = await import('@solana/web3.js');
  const quoteMint = new PublicKey('So11111111111111111111111111111111111111112');

  const configKeypair = Keypair.generate();
  const transaction = await client.partner.createConfig({
    ...config,
    config: configKeypair.publicKey,
    feeClaimer: payer.publicKey,
    leftoverReceiver: payer.publicKey,
    quoteMint,
    payer: payer.publicKey,
  } as never);

  console.log('config address:', configKeypair.publicKey.toBase58());
  transaction.feePayer = payer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.sign(payer, configKeypair);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
  });
  await connection.confirmTransaction(signature, 'confirmed');
  console.log('SIGNATURE:', signature);
  console.log('explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
  void PublicKey; void TokenType; void TokenDecimal; void TokenAuthorityOption;
}

void main().catch((error) => {
  console.error('FAILED:', (error as Error).message.slice(0, 400));
  process.exit(1);
});
