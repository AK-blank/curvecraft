/** How does the raise-to-graduate scale with the graduation market cap? */
import { deriveSpec, toConfigParams } from '../src/core/build';
import { getPreset } from '../src/core/presets';

async function main() {
  const base = getPreset('fair-launch')!.spec;
  console.log('start MC | graduation MC | raise (SOL) | migration price | base on curve');
  for (const migrationMarketCap of [2_000, 4_000, 8_000, 16_000, 32_000, 64_000]) {
    const spec = { ...structuredClone(base), migrationMarketCap };
    const derived = deriveSpec(spec, toConfigParams(spec));
    console.log(
      `${String(base.initialMarketCap).padStart(8)} | ${String(migrationMarketCap).padStart(13)} | ${derived.migrationQuoteThreshold.toFixed(1).padStart(11)} | ${derived.migrationPrice.toExponential(3)} | ${(derived.migrationSupply / 1e6).toFixed(1)}M`,
    );
  }
}

void main();
