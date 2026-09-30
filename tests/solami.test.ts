/**
 * Solami data-path invariants.
 *
 * The stream and the enumeration cannot be exercised without a token, so these
 * tests pin down the parts that decide whether a live run would work at all:
 * the discriminator encoding the server filters on, the account-key extraction
 * the stream depends on, and the fallback logic that keeps the public endpoint
 * usable.
 */
import { describe, expect, it } from 'vitest';

import {
  POOL_DISCRIMINATOR_HEX,
  VIRTUAL_POOL_SIZE,
  accountsFromUpdate,
  base58,
  dbcProgramId,
  discriminatorToBase64,
  hasSolami,
  solamiToken,
} from '@/core/solami-source';

describe('solami provider detection', () => {
  it('is off when no token is configured, so the public path stays default', () => {
    expect(hasSolami({})).toBe(false);
    expect(hasSolami({ SOLAMI_RPC_URL: 'https://example.invalid' })).toBe(false);
    expect(solamiToken({})).toBeUndefined();
  });

  it('accepts either the SDK token name or the generic api key', () => {
    expect(hasSolami({ SOLAMI_RPC_TOKEN: 'tok' })).toBe(true);
    expect(solamiToken({ SOLAMI_RPC_TOKEN: 'tok' })).toBe('tok');
    expect(solamiToken({ SOLAMI_API_KEY: 'key' })).toBe('key');
    expect(solamiToken({ SOLAMI_RPC_TOKEN: 'tok', SOLAMI_API_KEY: 'key' })).toBe('tok');
  });
});

describe('discriminator filter', () => {
  it('encodes the VirtualPool discriminator the way a memcmp filter needs it', () => {
    // d5 e0 05 d1 62 45 77 5c → 1eAF0WJFd1w=
    expect(discriminatorToBase64(POOL_DISCRIMINATOR_HEX)).toBe('1eAF0WJFd1w=');
  });

  it('tolerates a 0x prefix and rejects malformed input', () => {
    expect(discriminatorToBase64(`0x${POOL_DISCRIMINATOR_HEX}`)).toBe('1eAF0WJFd1w=');
    expect(() => discriminatorToBase64('xyz')).toThrow();
    expect(() => discriminatorToBase64('abc')).toThrow();
  });

  it('remembers the real account size, because size alone is a trap', () => {
    // PoolConfig is 1048 bytes; filtering on size would mix the two up.
    expect(VIRTUAL_POOL_SIZE).toBe(424);
  });
});

describe('base58', () => {
  it('matches known vectors', () => {
    expect(base58(new Uint8Array([]))).toBe('');
    expect(base58(new Uint8Array([0]))).toBe('1');
    expect(base58(new Uint8Array([0, 0, 0]))).toBe('111');
    expect(base58(new Uint8Array([1, 2, 3]))).toBe('Ldp');
  });

  it('round-trips a 32-byte public key through the program id', () => {
    expect(base58(dbcProgramId().toBytes())).toBe(dbcProgramId().toBase58());
  });
});

describe('accountsFromUpdate', () => {
  const signature = new Uint8Array(64).fill(7);

  it('reads base58 keys out of a firehose transaction update', () => {
    const update = {
      slot: '341200000',
      transaction: {
        signature,
        transaction: { message: { accountKeys: ['KeyOne', 'KeyTwo'] } },
      },
    };
    const activity = accountsFromUpdate(update);
    expect(activity).not.toBeNull();
    expect(activity?.slot).toBe(341200000);
    expect(activity?.accounts).toEqual(['KeyOne', 'KeyTwo']);
    expect(activity?.signature).toBe(base58(signature));
  });

  it('decodes byte-array keys, which is what a versioned transaction carries', () => {
    const update = {
      slot: 42,
      transaction: {
        signature,
        transaction: { message: { accountKeys: [dbcProgramId().toBytes(), 'Plain'] } },
      },
    };
    expect(accountsFromUpdate(update)?.accounts).toEqual([dbcProgramId().toBase58(), 'Plain']);
  });

  it('ignores updates that carry no transaction, so a slot ping cannot crash the stream', () => {
    expect(accountsFromUpdate({ slot: '1' })).toBeNull();
    expect(accountsFromUpdate({})).toBeNull();
    expect(accountsFromUpdate(null)).toBeNull();
  });

  it('keeps an update with an empty account list rather than inventing keys', () => {
    const update = { slot: 9, transaction: { signature, transaction: { message: {} } } };
    expect(accountsFromUpdate(update)?.accounts).toEqual([]);
  });
});
