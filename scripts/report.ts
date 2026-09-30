/**
 * Print a launch report for a preset.
 *
 *   npx tsx scripts/report.ts fair-launch
 */
import { analyze, analyzeMonteCarlo } from '../src/core/analysis';
import { getPreset, PRESETS } from '../src/core/presets';
import { toLaunchReport } from '../src/core/report';

async function main() {
  const id = process.argv[2] ?? 'fair-launch';
  const preset = getPreset(id);
  if (!preset) {
    console.log('unknown preset. available:', PRESETS.map((p) => p.id).join(', '));
    process.exit(1);
  }
  const analysis = analyze(preset.spec);
  const monteCarlo = analyzeMonteCarlo(preset.spec, { runs: 200, seed: 42 }).result;
  const report = toLaunchReport({ spec: preset.spec, analysis, monteCarlo });
  console.log(process.argv.includes('--script-only') ? '' : report.split('## Launch script')[0]);
}

void main();
