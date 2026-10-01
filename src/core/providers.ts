/**
 * RPC provider resolution for the live-data layer.
 *
 * The pool reader works against any Solana JSON-RPC endpoint, which means the
 * same code runs on the public endpoint, on a hackathon RPC plan, or on a
 * dedicated provider — the only difference is configuration. That matters for
 * two of the Crypto World's Fair sidetracks (RPC Fast, Solami), whose whole
 * requirement is "your data path runs through us".
 *
 * Resolution order, first match wins:
 *
 *   1. SOLAMI_RPC_URL            — full endpoint, e.g. from the Solami dashboard
 *   2. SOLAMI_RPC_TOKEN          — the Solami SDK's own variable name
 *   3. SOLAMI_API_KEY            — expanded through SOLAMI_RPC_TEMPLATE
 *   4. RPC_FAST_URL              — full endpoint from the RPC Fast dashboard
 *   5. RPC_FAST_API_KEY          — expanded through RPC_FAST_RPC_TEMPLATE
 *   6. SOLANA_RPC_URL / RPC_URL  — any custom endpoint
 *   7. public mainnet            — the default, rate-limited but keyless
 *
 * `RPC_PROVIDER` overrides the order: with both a Solami and an RPC Fast key
 * configured you still want to be able to say "build this snapshot through RPC
 * Fast", and `RPC_PROVIDER=public` is how the fallback path gets exercised
 * without unsetting anything.
 */
export type ProviderId = 'solami' | 'rpcfast' | 'custom' | 'public';

export interface RpcProvider {
  id: ProviderId;
  label: string;
  url: string;
  /** True when the endpoint needs no credentials (safe to run anywhere). */
  keyless: boolean;
  /** What this provider buys you, shown in the UI and in snapshots. */
  note: string;
}

// Solami's JSON-RPC base is /sol on rpc.solami.dev; /ws/sol for subscriptions.
const DEFAULT_SOLAMI_TEMPLATE = 'https://rpc.solami.dev/sol?api_key={key}';
const DEFAULT_RPC_FAST_TEMPLATE = 'https://solana-rpc.rpcfast.com/?api_key={key}';
const PUBLIC_ENDPOINT = 'https://api.mainnet-beta.solana.com';

export type Env = Record<string, string | undefined>;

function expand(template: string, key: string): string {
  return template.includes('{key}')
    ? template.replace('{key}', encodeURIComponent(key))
    : `${template}${template.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(key)}`;
}

function namedProvider(id: string, env: Env): RpcProvider | null {
  const solamiUrl = env.SOLAMI_RPC_URL;
  const solamiKey = env.SOLAMI_API_KEY ?? env.SOLAMI_RPC_TOKEN;
  const rpcFastUrl = env.RPC_FAST_URL;
  const rpcFastKey = env.RPC_FAST_API_KEY;
  const custom = env.SOLANA_RPC_URL ?? env.RPC_URL;

  switch (id) {
    case 'solami':
      if (solamiUrl || solamiKey) {
        return {
          id: 'solami',
          label: 'Solami',
          url: solamiUrl ?? expand(env.SOLAMI_RPC_TEMPLATE ?? DEFAULT_SOLAMI_TEMPLATE, solamiKey as string),
          keyless: false,
          note: 'Private RPC plus the Yellowstone firehose and decoded market data.',
        };
      }
      return null;
    case 'rpcfast':
      if (rpcFastUrl || rpcFastKey) {
        return {
          id: 'rpcfast',
          label: 'RPC Fast',
          url: rpcFastUrl ?? expand(env.RPC_FAST_RPC_TEMPLATE ?? DEFAULT_RPC_FAST_TEMPLATE, rpcFastKey as string),
          keyless: false,
          note: 'High-performance mainnet RPC and streaming infrastructure.',
        };
      }
      return null;
    case 'custom':
      return custom
        ? { id: 'custom', label: 'Custom endpoint', url: custom, keyless: false, note: 'Configured through SOLANA_RPC_URL.' }
        : null;
    case 'public':
      return {
        id: 'public',
        label: 'Public mainnet',
        url: PUBLIC_ENDPOINT,
        keyless: true,
        note: 'Keyless and rate-limited; free endpoints refuse indexed requests, which is why the pool reader walks transactions instead.',
      };
    default:
      return null;
  }
}

/** Pick the RPC endpoint for the live-data layer. */
export function resolveRpcProvider(env: Env = process.env): RpcProvider {
  if (env.RPC_PROVIDER) {
    const forced = namedProvider(env.RPC_PROVIDER.toLowerCase(), env);
    if (forced) return forced;
  }
  if (env.SOLAMI_RPC_URL) {
    return {
      id: 'solami',
      label: 'Solami',
      url: env.SOLAMI_RPC_URL,
      keyless: false,
      note: 'Private RPC plus the Yellowstone firehose and decoded market data.',
    };
  }
  const solamiKey = env.SOLAMI_API_KEY ?? env.SOLAMI_RPC_TOKEN;
  if (solamiKey) {
    return {
      id: 'solami',
      label: 'Solami',
      url: expand(env.SOLAMI_RPC_TEMPLATE ?? DEFAULT_SOLAMI_TEMPLATE, solamiKey),
      keyless: false,
      note: 'Private RPC plus the Yellowstone firehose and decoded market data.',
    };
  }
  if (env.RPC_FAST_URL) {
    return {
      id: 'rpcfast',
      label: 'RPC Fast',
      url: env.RPC_FAST_URL,
      keyless: false,
      note: 'High-performance mainnet RPC and streaming infrastructure.',
    };
  }
  if (env.RPC_FAST_API_KEY) {
    return {
      id: 'rpcfast',
      label: 'RPC Fast',
      url: expand(env.RPC_FAST_RPC_TEMPLATE ?? DEFAULT_RPC_FAST_TEMPLATE, env.RPC_FAST_API_KEY),
      keyless: false,
      note: 'High-performance mainnet RPC and streaming infrastructure.',
    };
  }
  const custom = env.SOLANA_RPC_URL ?? env.RPC_URL;
  if (custom) {
    return {
      id: 'custom',
      label: 'Custom endpoint',
      url: custom,
      keyless: false,
      note: 'Configured through SOLANA_RPC_URL.',
    };
  }
  return {
    id: 'public',
    label: 'Public mainnet',
    url: PUBLIC_ENDPOINT,
    keyless: true,
    note: 'Keyless and rate-limited; free endpoints refuse indexed requests, which is why the pool reader walks transactions instead.',
  };
}

/** Redact an API key before printing an endpoint in logs, snapshots or the UI. */
export function redactEndpoint(url: string): string {
  return url.replace(/(api[_-]?key=)[^&]+/i, '$1***').replace(/\/\/[^@/]+@/, '//***@');
}
