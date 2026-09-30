# Launch posts (ready to publish)

Two posts: one for the project, one about the findings. Both are written to stand alone — the
findings one works even for someone who never opens the app, which is what makes it worth posting.

## Thread: the findings (post this first — it earns attention on its own)

**1/**
We simulated 200 token launches on Meteora's Dynamic Bonding Curve and found something
uncomfortable:

A "2% decaying to 1% over two hours" fee schedule taxes a sniper wave **1% more** than organic
demand.

A 20% → 1% decay over 30 minutes taxes it **21.7% more**.

**2/**
Here's the mechanism. Snipers buy in the first ~10 seconds. If your fee is still near its starting
value at second 10, they pay it; if it has already decayed, they don't.

A two-hour decay is still at ~99% of its starting fee ten seconds in. It's a fee increase with
extra steps.

**3/**
Second finding: doubling the graduation market cap costs **1.5×** the raise, not 2×.

Founders under-ask on graduation because they assume linearity. Measured:

2,000 SOL MC → 666.7 SOL raise
8,000 → 1,600.0
64,000 → 5,197.5

**4/**
Third: the curve *shape* moves the raise by ±30% at identical market caps.

Flat curve (16 weighted segments, deep early liquidity): **27% less capital**.
Exponential curve: **33% more**.

Same start price, same graduation price. Only the layout between them changed.

**5/**
And a live one. We rebuilt a real pool's design from its on-chain config:

That launch needs **10.98 SOL** to graduate.
Rebuilding the same two prices with the default market-cap curve needs **219.60 SOL**.

20×. The curve layout, not the market caps, decides the raise.

**6/**
So we built CurveCraft: design a launch, replay demand against it with Meteora's own swap math,
get the graduation odds, and export a launch script.

It also checks your config against the program's rules — which is how we found that **all four of
our own presets would have failed at createConfig**.

**7/**
Live demo (no wallet, runs the SDK in your browser):
https://ak-blank.github.io/curvecraft/studio/

3-minute demo: https://ak-blank.github.io/curvecraft/demo/

Source: https://github.com/AK-blank/curvecraft

Built for @Colosseum's Crypto World's Fair, @MeteoraAG DBC track. 27 invariants under `npm test`.

## Single post (short version)

> Every launch announcement quotes two numbers: start market cap and graduation market cap. Neither
> decides how much you have to raise.
>
> We simulated 200 DBC launches. A slow fee decay taxes snipers +1%. A fast one taxes them +21.7%.
> Doubling the graduation target costs 1.5× the raise. And curve shape alone moves the raise ±30%.
>
> CurveCraft — design, simulate and ship token launches on Meteora DBC:
> https://ak-blank.github.io/curvecraft/

## Notes

- Post the thread from the account already used for the bounty submissions.
- The `/studio`, `/demo` and `/pools` pages all work without a wallet, so the links convert.
- Tag `@MeteoraAG` and `@Colosseum` in the last post of the thread, not the first, so the hook lands
  before the mentions.
