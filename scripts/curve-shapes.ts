/** Compare the four curve shapes on the same market caps. */
import { deriveSpec, toConfigParams } from '../src/core/build';
import { getPreset } from '../src/core/presets';
import { scaledScenarios } from '../src/core/scenarios';
import { simulate } from '../src/core/simulate';
import { lintSpec } from '../src/core/lint';
import type { CurveShape } from '../src/core/types';

async function main() {
  const base = getPreset('fair-launch')!.spec;
  console.log('shape        | raise      | start px  | grad px   | lint | organic fees | fills');
  for (const shape of ['marketCap', 'flat', 'linear', 'exponential'] as CurveShape[]) {
    const spec = { ...structuredClone(base), curveShape: shape };
    const config = toConfigParams(spec);
    const derived = deriveSpec(spec, config);
    const lint = lintSpec(spec);
    const [organic] = scaledScenarios(derived.migrationQuoteThreshold);
    const result = simulate(spec, organic);
    console.log(
      `${shape.padEnd(12)} | ${derived.migrationQuoteThreshold.toFixed(1).padStart(9)} | ${derived.startPrice.toExponential(2)} | ${derived.migrationPrice.toExponential(2)} | ${lint.ok ? ' ok ' : 'FAIL'} | ${result.tradingFees.toFixed(2).padStart(12)} | ${String(result.fills.length).padStart(5)}`,
    );
  }
}

void main();
