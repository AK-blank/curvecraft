# CurveCraft — pitch deck outline

Ten slides. Each one is a single idea with one visual. Numbers marked *(measured)* come from the
repo's own simulator and are reproducible with `npm run sim -- --all` and `npm test`.

---

## 1 · Title

**CurveCraft**
Design, simulate and ship token launches on Meteora's Dynamic Bonding Curve.

`github.com/<user>/curvecraft` · demo video · Colosseum Crypto World's Fair, Meteora DBC sidetrack.

*Visual:* the studio screenshot, chart front and centre.

## 2 · The problem

Launching on a bonding curve means choosing ~15 interacting parameters — start price, graduation
market cap, fee schedule shape, dynamic fee, migration split — and the only feedback loop is the
launch itself.

Founders copy the last launch that worked. Nobody knows what their fee schedule does to a sniper
until the snipers arrive.

*Visual:* the parameter panel with a red question mark over the fee schedule.

## 3 · What CurveCraft is

A design studio for DBC launches: **compile → simulate → compare → ship.**

- Compiles a launch spec into real `ConfigParameters` (`buildCurveWithMarketCap`).
- Replays demand fill-by-fill with the official SDK swap math (`swapQuote2`).
- Reports effective fee rate, sniper premium, graduation time and graduation **probability**.
- Exports a runnable launch script, and encodes every design into a shareable URL.

*Visual:* the four-step loop.

## 4 · Why this is not a toy model

We do not re-implement curve math. The simulator walks the curve by feeding each quote's
`nextSqrtPrice` back in as the next starting state — the same thing the on-chain program does. The
fee scheduler reads the simulated clock, so a decaying fee behaves as it does on chain.

15 invariants in the test suite pin the behaviour: first-fill pricing, monotonic fee revenue,
graduation above/below target, determinism, share-link round trips.

*Visual:* the pipeline diagram from the README plus a green `15 passed`.

## 5 · Finding one: the sniper premium

Same demand, same curve, only the fee schedule changes *(measured)*:

| Schedule | Organic fee rate | Sniper-wave fee rate | Premium |
|---|---|---|---|
| 2% → 1% linear, 2h | 1.323% | 1.336% | +1.0% |
| 20% → 1% exponential, 30m | 2.481% | 3.019% | **+21.7%** |

A multi-hour decay is a fee increase with extra steps. Sniper resistance requires a decay inside
the sniper window.

*Visual:* two bars per row, organic vs sniper.

## 6 · Finding two: ambition is cheap

Doubling the graduation market cap costs **~1.5×** the raise, not 2× *(measured across six targets
from 2,000 to 64,000 SOL)*. An 8× higher graduation valuation costs 3.2× the capital.

Founders under-ask because they assume linearity.

*Visual:* the raise-vs-target table as a curve.

## 7 · Finding three: three scenarios are not a plan

Sampling 200 demand paths (lognormal buyers and sizes, 70% sniper probability, 35% whale
probability) against the Fair Launch preset:

- **43% graduation probability** *(measured)*
- Fees: 6.3 SOL at p10, 17.6 at p50, 21.4 at p90
- Median peak market cap 6.8k SOL against an 8k target

The honest headline is "57% of the time this does not graduate", not "peak market cap 6.8k".

*Visual:* histogram with the graduation target marked.

## 8 · Product surface

- **Studio** — live editing, chart, scenario scoreboard with deltas, Monte-Carlo distribution.
- **Preset marketplace** — four designs with measured odds; fork any of them by URL.
- **Share links** — the config *is* the link; no backend, no accounts.
- **CLI** — `npm run sim -- --all` for CI and for people who live in a terminal.
- **Launch script export** — copy, paste, create the config on chain.

*Visual:* four small screenshots.

## 9 · Depth of Meteora integration

Built entirely on the official SDK: `buildCurveWithMarketCap`, `buildCurveWithTwoSegments`,
`normalizeQuoteConfig`, `swapQuote2` (ExactIn and PartialFill), fee schedulers (linear,
exponential, rate limiter), dynamic fees, migration options and fee presets, plus
`getPoolQuoteTokenCurveProgress` and `getPoolFeeMetrics` for reading live pools.

CurveCraft does not invent a curve model — it makes the real one legible before deployment.

*Visual:* the SDK call surface as a list of chips.

## 10 · What's next

- Preset marketplace v2: community-published configs, votes, fork counts.
- Monte-Carlo on-chain replay: seed the distribution from a real pool's trade history.
- Multi-segment and mid-price curve design (the SDK supports it; the UI does not yet).
- Safety lint: flag configs that fail `assertConfigAllowsNewPool` or that concentrate liquidity
  beyond a policy threshold.

**Ask:** feedback from launchpads already building on DBC — which two parameters do you argue about
most? Those become the next presets.

---

## Appendix — numbers on slides

| Claim | Where it comes from |
|---|---|
| Sniper premium +21.7% | `npm run sim -- --all`, Meme Speedrun × Sniper wave |
| Organic fee 2.481% vs sniper 3.019% | same run |
| Raise 666.7 → 5,197.5 SOL for 2k → 64k MC | `npx tsx scripts/curve-table.ts` |
| 43% graduation probability, 200 paths | `/presets` (seed 7) |
| 15 invariants | `npm test` |
