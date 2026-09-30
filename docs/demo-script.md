# CurveCraft — 3 minute demo script

Target: **3:10–3:30**. Screen recording with voiceover. Everything on screen is the live app.

Setup before recording:

```bash
npm install && npm run dev     # http://localhost:3000
```

Open `/studio`, pick the **Fair Launch** preset, and let the simulation settle. Zoom the browser to
~110% so the numbers are readable at 1080p. Close other tabs — no notifications on screen.

---

## 0:00 — 0:20 · The problem

**Screen:** `/studio`, Fair Launch selected, stats row visible.

> "Every token launch on Meteora's Dynamic Bonding Curve has to pick a fee schedule, a start price
> and a graduation target. Fifteen parameters that interact. The usual way to choose them is to
> copy a launch that worked and hope.
>
> This is CurveCraft. It compiles a launch into a real DBC config, then replays realistic demand
> against it — using Meteora's own swap math, not an approximation."

## 0:20 — 0:55 · Design the curve

**Screen:** move the cursor to the graduation market cap field, change `8000` → `16000`. Stats row
and chart update.

> "Here's a launch: 1 billion supply, starting at a 500 SOL market cap, graduating at 8,000. The
> tool tells me the raise that requires — 1,600 SOL — and prices the first fill at 5×10⁻⁷ SOL.
>
> If I double the graduation target to 16,000, the raise only goes to 2,400 SOL. Not 3,200.
> The raise grows sub-linearly with the graduation market cap — a finding that surprised us enough
> that we wrote a test to pin it down."

**Screen:** drag the fee-schedule start from 2% to 20%, switch the mode to Exponential.

> "Now the fee schedule. Start at 20%, decay exponentially to 1% over 30 minutes."

## 0:55 — 1:15 · Curve shape

**Screen:** click **Flat** in the Curve shape row. The raise target drops from 1,600 to 1,172 SOL.

> "One more lever before I replay anything: the shape of the curve. Same start market cap, same
> graduation target — a flat curve keeps the price down while supply sells, so it reaches the same
> valuation with 27% less capital. Switch to exponential and it needs 33% more. Nobody can see that
> from the two numbers a launch announcement quotes."

## 1:15 — 2:00 · Replay the launch

**Screen:** click through the three scenario tabs — Organic grind, Sniper wave then organic, Whale
buys then dumps. Hover the chart at a couple of points.

> "Three demand scenarios run automatically, scaled to this launch's own graduation target.
>
> Organic demand: 400 buys over two hours. The curve graduates at 1.5 hours.
>
> Now a sniper wave — 60 bots inside the first ten seconds — followed by the same organic demand.
>
> And a whale that takes a position, then dumps into the curve."

**Screen:** point at the Scenario scoreboard; highlight the fee column and the `+21.7%` delta.

> "Here's the number that matters. The scoreboard reports the effective fee rate — fees divided by
> volume — for each scenario, and the delta against organic demand. Organic pays 2.48%. The sniper
> wave pays 3.02%. That's a **21.7% sniper premium**.
>
> With the default two-percent schedule, the same sniper wave pays a 1% premium. Basically nothing.
> A two-hour fee decay is a fee increase with extra steps."

## 2:00 — 2:40 · From three scenarios to a distribution

**Screen:** scroll to the Monte-Carlo panel. Let it settle at 200 runs. Point at the big percentage,
then the percentiles, then the histogram.

> "Three scenarios still aren't a plan. So CurveCraft samples the demand instead: buyer count and
> buy size are lognormal, there's a 70% chance of a sniper wave and a 35% chance of a whale, and a
> coin flip on whether the whale dumps.
>
> Two hundred paths, each one priced fill-by-fill with the SDK. Result: a **43% graduation
> probability**. Median fees of 17.6 SOL — but the 10th percentile is 6.3 and the 90th is 21.4.
>
> The number a founder actually needs is not the base case. It's that 57% of the time, this curve
> does not graduate."

**Screen:** click `500 runs` to show it re-samples.

## 2:40 — 3:05 · Ship it

**Screen:** click **Show launch script**, scroll the generated TypeScript briefly, then click
**Copy share link** and paste the URL into the address bar to show the design reloading from the URL.

> "When the design is right, CurveCraft exports the launch script — a real `buildCurveWithMarketCap`
> call that creates the config keypair, signs and sends the transaction. We simulate that exact
> transaction against mainnet: the program logs `Instruction: CreateConfig`, no error.
>
> And every design lives in its own URL. No backend, no accounts — paste the link and your
> co-founder opens the exact same config."

## 3:05 — 3:25 · Close

**Screen:** `/presets` marketplace page, showing measured graduation odds per preset.

> "The preset marketplace ships with four designs and their measured odds, so you can fork a
> starting point instead of a blank page.
>
> CurveCraft: design, simulate, and ship token launches on Meteora's Dynamic Bonding Curve.
>
> Everything is open source — the link is in the description."

---

## Recording notes

- Record at 1080p or higher; keep the terminal off-screen.
- If a number differs from this script by a rounding step, say the number on screen — never the
  script's. The app is deterministic for a given preset and seed, but presets get tuned.
- The 21.7% sniper premium and 43% graduation probability come from the Meme Speedrun and Fair
  Launch presets respectively; if you change presets mid-recording, re-read the panel.
- Total narration is ~430 words. At a normal pace that lands just under three minutes; if you run
  long, cut the whale scenario (0:55–1:40) rather than the Monte-Carlo section.
