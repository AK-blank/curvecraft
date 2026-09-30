/**
 * CLI: simulate a preset (or a JSON spec) against one or more scenarios.
 *
 * Usage:
 *   npx tsx scripts/sim.ts fair-launch
 *   npx tsx scripts/sim.ts --all
 *   npx tsx scripts/sim.ts --spec ./my-launch.json --scenario ./my-demand.json
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { deriveSpec, toConfigParams, toCurvePoints } from '../src/core/build';
import { PRESETS, getPreset } from '../src/core/presets';
import { standardScenarios } from '../src/core/scenarios';
import { simulate } from '../src/core/simulate';
import type { LaunchSpec, Scenario } from '../src/core/types';

function fmt(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function report(spec: LaunchSpec, scenario: Scenario) {
  const config = toConfigParams(spec);
  const derived = deriveSpec(spec, config);
  const result = simulate(spec, scenario);

  console.log(`\n  scenario: ${scenario.name}`);
  console.log(
    `    graduation target : ${fmt(derived.migrationQuoteThreshold)} ${spec.quoteAsset}`,
  );
  console.log(`    start price       : ${fmt(derived.startPrice, 8)} ${spec.quoteAsset}`);
  console.log(`    fills             : ${result.fills.length}`);
  console.log(
    `    graduated         : ${
      result.graduatedAtSec === null
        ? 'no'
        : `yes, at t=${fmt(result.graduatedAtSec, 0)}s`
    }`,
  );
  console.log(`    peak mc           : ${fmt(result.peakMarketCap)} ${spec.quoteAsset}`);
  console.log(`    final mc          : ${fmt(result.finalMarketCap)} ${spec.quoteAsset}`);
  console.log(`    quote volume      : ${fmt(result.quoteVolume)} ${spec.quoteAsset}`);
  console.log(`    trading fees      : ${fmt(result.tradingFees, 4)} ${spec.quoteAsset}`);
  for (const warning of result.warnings.slice(0, 3)) {
    console.log(`    ! ${warning}`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--spec') {
    const spec = JSON.parse(readFileSync(resolve(args[1]), 'utf8')) as LaunchSpec;
    const scenarioArg = args.indexOf('--scenario');
    const scenarios: Scenario[] =
      scenarioArg >= 0
        ? [JSON.parse(readFileSync(resolve(args[scenarioArg + 1]), 'utf8')) as Scenario]
        : standardScenarios();
    console.log(`\n=== ${spec.name} ===`);
    const config = toConfigParams(spec);
    console.log('  curve points:', toCurvePoints(config).length);
    for (const scenario of scenarios) report(spec, scenario);
    return;
  }

  if (args[0] === '--all' || args.length === 0) {
    for (const preset of PRESETS) {
      console.log(`\n=== ${preset.name} (${preset.id}) ===`);
      console.log(`  ${preset.thesis}`);
      for (const scenario of standardScenarios()) report(preset.spec, scenario);
    }
    return;
  }

  const preset = getPreset(args[0]);
  if (!preset) {
    console.error(`Unknown preset "${args[0]}". Known: ${PRESETS.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n=== ${preset.name} ===`);
  console.log(`  ${preset.thesis}`);
  for (const scenario of standardScenarios()) report(preset.spec, scenario);
}

main();
