# Verification: the exported config is accepted by the DBC program

A launch tool that prints a config nobody can deploy is a drawing. This is how
CurveCraft checks that its output is real, and what the checks have caught.

## 1. The exported transaction executes against the live program

`scripts/mainnet-simulate.ts` compiles a spec, builds the *exact* transaction the
generated launch script builds, and simulates it against mainnet state through a
raw `simulateTransaction` call (`sigVerify: false`, funded fee payer, no funds
spent). The DBC program runs for real and returns its logs.

```bash
npm run verify:mainnet              # fair-launch
npm run verify:mainnet -- meme-speedrun
```

Result for `Approve`-free, unmodified presets:

```
programs: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
err: null
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN invoke [1]
   Program log: Instruction: CreateConfig
   Program 11111111111111111111111111111111 invoke [2]
   Program 11111111111111111111111111111111 success
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN invoke [2]
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN consumed 643 of 170389 compute units
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN success
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN invoke [2]
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN consumed 643 of 164515 compute units
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN success
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN consumed 36566 of 200000 compute units
   Program dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN success
```

`err: null` means the program accepted the config: create-config ran, the config
account was initialised, and every inner instruction succeeded.

## 2. The split everyone tries first does not deploy

A designer's first instinct is to keep all migrated liquidity liquid:
`creatorLiquidityPercentage: 100`, `creatorPermanentLockedLiquidityPercentage: 0`.
The program requires at least 1000 bps (10%) locked at day 1.

The trap is *where* that surfaces. `buildCurveWithMarketCap` compiles the naive
config without complaint — the curve looks fine — and the refusal only arrives
when a builder runs the exported script, inside `client.partner.createConfig`:

```bash
npm run verify:mainnet -- fair-launch --naive
# Invalid migration locked liquidity. At least 1000 BPS (10%) must be locked at
# day 1. Current locked liquidity at day 1: 0 BPS.
```

That is the worst possible moment to learn it. Four of CurveCraft's own presets
shipped that split before the launch check existed; they are fixed (10–20%
permanently locked) and `tests/core.test.ts` asserts every preset passes, so the
marketplace cannot regress into a config that dies at deploy.

## 3. The generated launch script type-checks

`scripts/emit-launch.ts` writes the generated script into the project and it is
compiled by `tsc` as part of the repo:

```bash
npx tsx scripts/emit-launch.ts fair-launch scripts/generated/launch.ts
npx tsc --noEmit
```

That check is what caught the generator's original bug: it destructured
`const { config } = await client.partner.createConfig(...)`, but `createConfig`
returns a `Transaction`. The script would have thrown on its first line of real
work. The generated file now creates the config keypair, signs with both parties,
sends and confirms — and `tests/codegen.test.ts` locks those steps in.

## What is not claimed

- No configuration has been created on mainnet with real funds; the evidence is
  simulation against mainnet state plus the program's own logs.
- The simulator reproduces SDK pricing exactly, but it does not model MEV,
  priority fees, or liquidity that arrives from outside the curve.
