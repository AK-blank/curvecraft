# What 200 simulated launches taught us about Meteora's bonding curves

*CurveCraft findings — measured with the official `@meteora-ag/dynamic-bonding-curve-sdk` swap math.*

Every DBC launch makes the same three promises: a fair start, a graduation, and a fee schedule that
"discourages snipers". Only the first two are checkable before launch. The third is usually a vibe.

We built [CurveCraft](../README.md) to make it checkable, then ran a few thousand simulated demand
paths through it. These are the results that surprised us.

---

## 1. A slow fee decay does not tax snipers

The standard anti-sniper advice is "start high, decay to a normal fee". That is only true if the
decay is fast relative to the sniper window.

Measuring effective fee rate — total fees divided by quote volume — for the same demand, with only
the scheduler changed:

| Preset | Effective fee (organic demand) | Effective fee (60 bots in the first 10s) | Sniper premium |
|---|---|---|---|
| 2% → 1% linear over 2 hours | 1.323% | 1.336% | **+1.0%** |
| 2.5% → 1.2% linear over 4 hours | 1.839% | 1.847% | +0.4% |
| 20% → 1% exponential over 30 minutes | 2.481% | 3.019% | **+21.7%** |
| 1.5% → 0.8% linear over 24 hours | 1.192% | 1.193% | +0.0% |

A two-hour linear decay from 2% to 1% collects **1% more** from a sniper wave than from organic
demand. The sniper pays a rounding error for the privilege of being first.

The exponential schedule that decays over 30 minutes collects **21.7% more**. It also charges
organic buyers 2.48% versus 1.32% — nearly double. That is the trade: you cannot tax the bots
without taxing everyone who arrives in the same window.

**Takeaway:** if the goal is sniper resistance, the schedule must decay inside the sniper window
(seconds to minutes). A multi-hour decay is a fee increase with extra steps.

## 2. Doubling the graduation target costs 1.5×, not 2×

`buildCurveWithMarketCap` derives the curve from two market caps. We expected the raise to scale
linearly with the graduation target. It does not.

Held constant: 500 SOL start, 1B supply, 20% of supply on the curve.

| Graduation MC | Raise to graduate | Step |
|---|---|---|
| 2,000 SOL | 666.7 SOL | — |
| 4,000 SOL | 1,044.8 SOL | ×1.57 |
| 8,000 SOL | 1,600.0 SOL | ×1.53 |
| 16,000 SOL | 2,403.5 SOL | ×1.50 |
| 32,000 SOL | 3,555.6 SOL | ×1.48 |
| 64,000 SOL | 5,197.5 SOL | ×1.46 |

Each doubling costs about **1.5×** the raise. Wanting an 8× higher graduation valuation costs 3.2×
the capital, not 8×.

**Takeaway:** founders systematically under-ask on graduation market cap because they assume it
scales linearly. It is the cheapest ambition in the config.

## 3. Three scenarios are not a distribution

We started with three hand-written scenarios: organic grind, sniper wave, whale-and-dump. They are
good for storytelling and terrible for planning, because a launch does not experience three
futures — it experiences one draw from a distribution.

So we sample: buyer count lognormal around 320 (σ=0.6), buy size lognormal around 4 SOL (σ=0.9),
demand front-loaded, a 70% chance of a sniper wave, a 35% chance of a whale, and a coin flip on
whether that whale dumps. Then we run the launch against each path with the SDK's swap math.

For the Fair Launch preset (1,600 SOL raise target), 200 paths give:

- **43% graduation probability**
- Median fees: 17.6 SOL — but the 10th percentile is 6.3 SOL and the 90th is 21.4 SOL
- Median peak market cap 6.8k SOL against an 8k graduation target

The headline number a founder needs is not "peak market cap under my base case". It is "**57% of
the time this curve does not graduate**".

---

## Why the numbers hold up

The simulator does not re-implement curve math. Each fill is quoted by
`client.pool.swapQuote2`, and the simulator advances the pool by feeding the returned
`nextSqrtPrice` back in as the next starting state — the same way the on-chain program walks the
curve. The fee scheduler reads the simulated clock, so a time-decaying fee behaves as it does on
chain. When the SDK says a trade pays 2.5%, CurveCraft reports 2.5%.

15 invariants in `tests/core.test.ts` pin down the behaviour that matters: first-fill pricing equals
`initialMarketCap / supply`, demand above the target graduates and demand below it does not, a
higher fee schedule earns more, identical inputs produce identical outputs, and the sub-linear
raise relationship in finding #2 fails loudly if a dependency changes it.

## Reproduce it

```bash
git clone <repo> && npm install
npm test                 # 15 invariants
npm run sim -- --all     # every preset × every scenario
npm run dev              # studio at /studio, distributions at /presets
```

Change one parameter, watch the sniper premium move. That is the whole product.
