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
| GitHub | <https://github.com/AK-blank/curvecraft> |
| Live demo | <https://ak-blank.github.io/curvecraft/studio/> |
| Preset marketplace | <https://ak-blank.github.io/curvecraft/presets/> |
| Live mainnet pools | <https://ak-blank.github.io/curvecraft/pools/> |
| Demo video | <https://youtu.be/Qj71JKh-Kak> (YouTube, unlisted — Colosseum only accepts YouTube/Loom/Vimeo links) |
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

## Every track CurveCraft is eligible for

All 35 sidetracks were checked for the residency badge on their listing page. Global tracks
accept a builder anywhere; the rest are gated to a country or region (Germany, Netherlands,
Ireland, Georgia, Nepal, Spain, Singapore, Japan, Canada, Malaysia, Thailand, Kazakhstan, Brazil,
Turkey, Australia, the Balkans, Poland, Nigeria, India, Ukraine, Argentina, UAE, the UK).

| Track | Prize pool | Submissions | What it needs |
|---|---|---|---|
| **Best use of Meteora's DBC** | **$20,000 USDC** | 14 | The core submission |
| **SolanaCZE Track** | **$10,000 USDG** | **0** | Any Colosseum project — same submission |
| **Superteam Vietnam Track** | **$10,000 USDG** | 16 | Any Colosseum project — same submission |
| Panta API Sidetrack | $5,000 USDG | 10 | Uses the Panta API |
| Build something live on Solana data | $3,000 USDG | 13 | Uses real-time/on-chain Solana data (the `/pools` view is close) |
| RPC Fast Infrastructure | $10,474 (credits) | 5 | Runs on RPC Fast endpoints + follow/post requirements |
| Adevar Labs pre-audit credits | $4,000 USDC | 7 | Project submitted for pre-audit |
| CertiK Security Audit Credits | $100,000 (credits) | **0** | The launch check is a config-safety story |

That is **$40,000 of cash prize pools reachable with one project**, plus credits. Submitting the
same project to several tracks is explicitly how Colosseum sidetracks work — each is judged
separately — but the *Colosseum submission itself is a prerequisite for all of them*, so it has to
happen before any track form is worth filling in.

## Hooks we could add cheaply to qualify for two more tracks

- **Panta API** ($5,000): their API serves on-chain/Solana data; using it for the live pool feed
  instead of raw RPC would qualify.
- **Solana data track** ($3,000): "build something live on Solana data" — the `/pools` snapshot
  already reads real program accounts; making it more prominent may be enough.

## The actual submission form (read off the live Meteora track)

Clicking **Submit Now** on `superteam.fun/earn/listing/meteora-dbc` opens this form. Every field is
pre-filled below except the three Colosseum ones, which is why the Colosseum registration blocks
every track.

| Field | Value to paste |
|---|---|
| Project Name | `CurveCraft` |
| Project Description | the long description at the top of this file |
| Project Github Link | `https://github.com/AK-blank/curvecraft` |
| Project Website | `https://ak-blank.github.io/curvecraft/studio/` |
| Project X Link | the account used for the bounty posts |
| Link to your pitch deck or Loom/video presentation | `https://ak-blank.github.io/curvecraft/demo/` |
| Did you submit this project to the official Crypto World's Fair Hackathon on Colosseum? | **Yes** |
| Link to Colosseum project | `<needs the Colosseum submission>` |
| Link to your project's Colosseum profile | `<needs the Colosseum profile>` |
| Anything Else? | the findings summary, plus the live pool pages |
| Confirmation checkbox | tick it |

The form also carries a warning that submitting something which does not meet the track scope can
restrict future submissions, so each track gets the same project but a track-specific description
(the table below says which angle to lead with).

### Per-track angle

| Track | Lead with |
|---|---|
| Meteora DBC | the simulator's SDK-accurate replay, the curve-shape findings, the preset marketplace |
| SolanaCZE | the whole project: open source, live demo, no wallet required |
| Superteam Vietnam | the whole project, plus the launch check that caught a real deploy-time bug |
| RPC Fast | the live-data layer running on RPC Fast endpoints (`docs/providers.md`) |
| Build something live on Solana data | the pool reader: real program accounts turned into per-pool progress |
| Panta | only if the prediction-market idea is built |

## Video

**A cut is already published:** <https://ak-blank.github.io/curvecraft/demo/> (2:57, 1080p, narrated,
captions burned in). It is generated from real screenshots of the deployed app by
`scripts/capture-demo-frames.py` + `scripts/make-demo-video.py`, so it can be regenerated after any
UI change. `docs/demo-script.md` is
the shot-by-shot script if you would rather record it in your own voice.
