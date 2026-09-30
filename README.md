# CurveCraft

**Design, simulate and ship token launches on Meteora's Dynamic Bonding Curve.**

Most token launches pick a curve by vibes and find out what they picked once the money is on
chain. CurveCraft compiles a launch into a real DBC config, replays realistic demand against it
with the official Meteora swap math, and hands you a runnable launch script.

Built for the [Colosseum Crypto World's Fair](https://www.colosseum.com/worldsfair) hackathon —
Meteora DBC sidetrack.

---

## Why this exists

A DBC launch has ~15 parameters that interact: start price, graduation market cap, fee schedule
shape, dynamic fees, migration split, liquidity distribution. Two launches with the same market
caps but different fee schedules behave nothing alike — one taxes snipers, the other subsidises
them, and you cannot tell which from the config screen.

CurveCraft answers the question a founder actually asks: **"under realistic demand, who pays what,
and when does this thing graduate?"**

## What it does

1. **Design** — edit the launch spec: quote asset, supply, start/graduation market cap, fee mode
   (linear / exponential / rate limiter), fee schedule, dynamic fee, migration fee, creator fee.
2. **Simulate** — three demand scenarios scaled to *your* graduation target are replayed fill by
   fill:
   - *Organic grind* — 400 buys spread over two hours.
   - *Sniper wave then organic* — 60 bots in the first ten seconds, then real demand.
   - *Whale buys, then dumps* — a large buyer takes profit into the curve.
3. **Compare** — the scoreboard reports peak market cap, effective fee rate and graduation time per
   scenario, plus the fee delta versus organic demand. That delta is the number that tells you
   whether your "anti-sniper" schedule actually taxes snipers.
   Toggle up to three other presets into **head-to-head** mode to replay the same demand against
   every design at once, and see each one's raise target, fee rate, sniper premium and graduation
   time side by side.
4. **Ship** — export a TypeScript script that creates the config on chain via
   `@meteora-ag/dynamic-bonding-curve-sdk`. Every design is also encoded into its own URL, so a
   config can be handed to a co-founder or put to a community vote without a backend.

## The numbers are not a toy model

CurveCraft does **not** re-implement bonding curve math. Every fill is quoted by the official SDK
(`client.pool.swapQuote2`), and the simulator walks the curve by feeding each quote's
`nextSqrtPrice` back in as the starting state. The fee scheduler reads the scenario clock, so a
time-decaying fee behaves exactly as it does on chain. If the SDK says a trade pays 2.5%, the
simulation reports 2.5%.

```
spec ──buildCurveWithMarketCap──► ConfigParameters ──normalizeQuoteConfig──► quote-ready config
                                                                                    │
scenario ──► for each trade ──► swapQuote2(virtualPool, config, amountIn) ──► price, fee, nextSqrtPrice
                     ▲                                                                    │
                     └──────────────────────── pool.poolState.sqrtPrice ◄──────────────────┘
```

## Findings the tool already produced

| Preset | Effective fee (organic) | Effective fee (sniper wave) | Sniper tax |
|---|---|---|---|
| Fair Launch (2% → 1% linear, 20 periods, 2h) | 1.323% | 1.336% | +1.0% |
| Meme Speedrun (20% → 1% exponential, 12 periods, 30m) | 2.481% | 3.019% | **+21.7%** |
| Deep Migration (2.5% → 1.2% linear, 16 periods, 4h) | 1.839% | 1.847% | +0.4% |
| Stablecoin Pair (1.5% → 0.8% linear, 24 periods, 24h) | 1.192% | 1.193% | +0.0% |

A slow linear decay barely changes what snipers pay. A short, steep exponential decay does — at the
cost of charging organic buyers 2.5× more than the flat schedule. That trade-off is the design
decision, and now it is visible before deployment.

## Second finding: ambitious graduation targets are cheap

`buildCurveWithMarketCap` does not scale the raise linearly with the graduation
market cap. Measured with a fixed 500 SOL start and 20% of supply on the curve:

| Graduation MC | Raise to graduate | vs previous row |
|---|---|---|
| 2,000 SOL | 666.7 SOL | — |
| 4,000 SOL | 1,044.8 SOL | ×1.57 |
| 8,000 SOL | 1,600.0 SOL | ×1.53 |
| 16,000 SOL | 2,403.5 SOL | ×1.50 |
| 32,000 SOL | 3,555.6 SOL | ×1.48 |
| 64,000 SOL | 5,197.5 SOL | ×1.46 |

Every doubling of the graduation target costs about **1.5×** the raise, not 2×. A
founder who wants a 64,000 SOL graduation instead of 8,000 SOL needs 3.2× the
raise for 8× the headline valuation. `tests/core.test.ts` pins this behaviour so a
dependency upgrade cannot silently change it.

## Tests

```bash
npm test        # 15 invariants: pricing, monotonicity, determinism, share links
```

The suite asserts the things a judge (or a founder) would otherwise have to take
on faith: that the first fill is priced at `initialMarketCap / supply`, that
demand above the target graduates and demand below it does not, that a higher fee
schedule earns more, that the same input produces the same output, and that a
spec survives a round trip through a share link.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000/studio
```

Simulate from the command line:

```bash
npx tsx scripts/sim.ts --all              # every preset × every scenario
npx tsx scripts/sim.ts fair-launch        # one preset
npx tsx scripts/sim.ts --spec ./my.json   # your own launch spec
```

## Project layout

```
src/core/types.ts       LaunchSpec, Scenario, SimulationResult
src/core/build.ts       LaunchSpec -> real DBC ConfigParameters (+ derived numbers)
src/core/simulate.ts    the fill-by-fill simulator
src/core/scenarios.ts   demand generators, scaled to the graduation target
src/core/presets.ts     curated launch presets
src/core/codegen.ts     LaunchSpec -> runnable on-chain launch script
src/app/api/simulate    POST endpoint that runs the simulator
src/app/studio          the studio UI
scripts/sim.ts          CLI
```

## Roadmap

- Preset marketplace: publish and vote on community configs (URL sharing and head-to-head
  comparison already ship).
- Live view: read real DBC pools from mainnet and show their curve progress next to a design.
- Monte-Carlo mode: distribution over thousands of randomized demand paths instead of three runs.
- Multi-segment curve designer (two segments, mid-price curves, custom sqrt price ladders).

## License

MIT
