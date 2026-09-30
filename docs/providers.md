# Data providers: how to qualify for the infrastructure tracks

Three Crypto World's Fair sidetracks pay for one thing: **your data path runs through their
infrastructure**. CurveCraft's live-data layer reads real DBC pools from Solana, so switching the
provider is a two-minute configuration change, not a rewrite.

| Track | Prize pool | What it asks for | What we need from you |
|---|---|---|---|
| [RPC Fast Infrastructure](https://superteam.fun/earn/listing/colosseum-crypto-worlds-fair-hackathon-rpc-fast-infrastructure-sidetrack) | $10,474 (credits) | Runs on RPC Fast endpoints, plus follow/post requirements | Sign up for the free Start/Focus plan, copy the endpoint |
| [Build something live on Solana data (Solami)](https://superteam.fun/earn/listing/build-something-live-on-solana-data) | $3,000 | At least one Solami product doing real work (RPC, Yellowstone gRPC, Mirage, Blur, Data API, webhooks or Beam) | Create a Solami API key |
| [Panta API Sidetrack](https://superteam.fun/earn/listing/panta-api-side-track) | $5,000 | Builds on the Panta prediction-market API | Panta API key (needs a product idea, not just a data swap) |

## How the switch works

`src/core/providers.ts` resolves the endpoint from the environment, first match wins:

| Variable | Effect |
|---|---|
| `SOLAMI_RPC_URL` | Use this endpoint, label the snapshot **Solami** |
| `SOLAMI_API_KEY` | Expand `SOLAMI_RPC_TEMPLATE` (default `https://api.solami.dev/rpc?api_key={key}`) |
| `RPC_FAST_URL` | Use this endpoint, label the snapshot **RPC Fast** |
| `RPC_FAST_API_KEY` | Expand `RPC_FAST_RPC_TEMPLATE` (default `https://solana-rpc.rpcfast.com/?api_key={key}`) |
| `SOLANA_RPC_URL` / `RPC_URL` | Any custom endpoint, labelled **Custom endpoint** |
| *(nothing set)* | Public mainnet, keyless and rate-limited |

Then rebuild the live snapshot:

```bash
RPC_FAST_API_KEY=... npm run pools:snapshot     # or SOLAMI_API_KEY=...
npm run build && npx serve out                  # /pools now shows the provider
```

The provider name is recorded **inside the snapshot** (`provider`, `endpoint`) and rendered on
`/pools`, so a judge can see which infrastructure served the data — and `redactEndpoint()` strips
the key before it is ever written to disk or displayed.

## Why the code had to change anyway

Free endpoints refuse `getProgramAccounts` on the DBC program, so the reader never indexes the
program: it walks the program's recent transactions, keeps the accounts whose Anchor discriminator
identifies a virtual pool, and fetches each pool's config for the migration threshold. That path
works on a public endpoint (slowly, with retries) and gets meaningfully faster on a paid one —
which is exactly the pitch both infrastructure sponsors are making.

## What still needs a human

Both tracks need an account and a key, so they cannot be finished autonomously:

- **RPC Fast:** sign up at <https://rpcfast.com/> (free Start plan, email only), then send the
  endpoint URL. The hackathon also offers a Focus plan for participants.
- **Solami:** create an API key in their dashboard, then send it (or set it yourself and run
  `npm run pools:snapshot`).
- **Panta:** a bigger job — it is a prediction-market API, so qualifying means building a product
  on it (for example, a market on whether a given launch graduates). Worth doing only if the
  Meteora submission is already locked in.

Each key is one environment variable away from turning into a track submission, so send whichever
you can get and the submission follows immediately.
