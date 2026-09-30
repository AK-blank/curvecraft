# Submission pack

Everything needed to submit CurveCraft, so the actual submission takes minutes.

## One-liner

> **CurveCraft** — design, simulate and ship token launches on Meteora's Dynamic Bonding Curve.

## Short description (≤ 300 chars)

> CurveCraft compiles a token launch into a real Meteora DBC config, replays realistic demand
> against it with the SDK's own swap math, reports graduation odds and sniper premium, checks the
> config against the program's rules, and exports a runnable launch script.

## Long description

> Every DBC launch picks ~15 interacting parameters — start price, graduation market cap, curve
> shape, fee schedule, dynamic fee, migration split — and the only feedback loop is the launch
> itself. CurveCraft closes that loop before deployment.
>
> **Design.** Edit the spec: quote asset, supply, market caps, curve shape (market-cap, flat,
> long-linear or exponential, built from sixteen weighted segments), fee scheduler, dynamic fee,
> migration fee, creator fee.
>
> **Simulate.** Three demand scenarios scaled to the launch's own graduation target are replayed
> fill by fill. Every fill is quoted by `client.pool.swapQuote2`, and the simulator advances the
> pool by feeding each quote's `nextSqrtPrice` back in — the same walk the on-chain program does.
> The fee scheduler reads the simulated clock, so decaying fees behave as they do on chain.
>
> **Get the odds.** 200 sampled demand paths (lognormal buyer count and size, 70% chance of a
> sniper wave, 35% chance of a whale) produce a graduation probability and p10/p50/p90 spreads for
> fees and peak market cap.
>
> **Compare.** Up to three designs replay the same demand side by side: raise target, effective fee
> rate, sniper premium, graduation time.
>
> **Check.** Every design runs through the program's own validators before export — LP percentages,
> minimum locked liquidity at day 1, curve monotonicity, fee schedule, migration fee, pool-creation
> eligibility. This caught a real bug: all four of our shipped presets used a 100%-liquid split
> that would have thrown inside `createConfig` at deploy time.
>
> **Ship.** Export a TypeScript launch script that creates the config account, signs and sends the
> transaction. We simulate that exact transaction against mainnet: the program logs
> `Instruction: CreateConfig` with `err: null`.
>
> The whole app runs the SDK in the browser, so it deploys as static files — no server, no keys.
>
> **Findings it produced:** a two-hour linear fee decay taxes a sniper wave +1.0% while a
> thirty-minute exponential decay taxes it +21.7%; doubling the graduation market cap costs only
> 1.5× the raise; and the curve shape alone moves the required raise by −27% (flat) to +33%
> (exponential) for identical market caps.

## Links

| Field | Value |
|---|---|
| GitHub | `https://github.com/<user>/curvecraft` |
| Live demo | `https://<user>.github.io/curvecraft/` |
| Demo video | `<Loom / YouTube link>` |
| X post | `<optional>` |

## Track: Best use of Meteora's Dynamic Bonding Curve (DBC) — $20,000

Against the published criteria:

- **Depth of Meteora integration.** Built on `buildCurveWithMarketCap`,
  `buildCurveWithLiquidityWeights`, `normalizeQuoteConfig`, `swapQuote2` (ExactIn + PartialFill),
  fee schedulers (linear, exponential, rate limiter), dynamic fees, migration options and fee
  presets, plus `validateCurve`, `validatePoolFees`, `assertConfigAllowsNewPool`,
  `validateMinimumLockedLiquidity` and `validateMigrationFee`. No curve math is re-implemented.
- **Technical execution.** 27 invariants under `npm test`, a static-export build that runs the SDK
  in the browser, `tsc`-checked generated launch scripts, and a mainnet simulation harness.
- **Originality and taste.** The unit of work is a *decision* (which fee schedule, which shape),
  not a launchpad. It is the tool a launchpad team uses before writing their own UI.
- **Impact potential.** Any team shipping on DBC can fork a preset, change one parameter and see
  the consequence — including the ones that decide whether the launch graduates at all.
- **Traction.** The demo is public and needs no wallet.

They also list "DBC Config Preset Marketplace" among the ideas they want: CurveCraft ships a preset
marketplace with measured graduation odds per preset and one-click forking into the studio.

## Other tracks worth submitting the same project to

All are Global and free to submit (hackathon tracks do not consume credits):

| Track | Prize | Why it fits |
|---|---|---|
| Superteam Vietnam | $10,000 | Same project, Vietnam track |
| SolanaCZE | $10,000 | Same project |
| Superteam Australia / Argentina / Türkiye / Ukraine / Thailand / Georgia | $10,000 each | Same project where the track is not residency-gated |
| RPC Fast Infrastructure | $10,474 | Only if we add an RPC-Fast-backed live pool view |
| CertiK Security Audit Credits | $100,000 (credits) | The launch check is a config-safety tool |

Check each track's page for residency requirements before submitting — several Superteam tracks are
region-gated (the two biggest Colosseum *bounties*, Germany and Netherlands, are).

## Colosseum submission fields (typical)

- **Project name:** CurveCraft
- **One-liner:** see above
- **Description:** the long description above
- **GitHub:** repo link
- **Website:** the GitHub Pages demo
- **Video:** the 3-minute demo
- **Colosseum profile:** the user's profile link (required by the sidetrack forms)

## Video

`docs/demo-script.md` is the shot-by-shot script (3:10–3:30, recorded at 1080p with voiceover).
