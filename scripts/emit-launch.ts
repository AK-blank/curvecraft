/**
 * Emit a generated launch script to a file so it can be type-checked.
 *
 *   npx tsx scripts/emit-launch.ts [preset] [outfile]
 */
import { writeFileSync } from 'node:fs';

import { toCreateConfigScript } from '../src/core/codegen';
import { PRESETS, getPreset } from '../src/core/presets';

async function main() {
  const presetId = process.argv[2] ?? 'fair-launch';
  const outfile = process.argv[3] ?? '/tmp/launch.ts';
  const preset = getPreset(presetId);
  if (!preset) {
    console.log('unknown preset. available:', PRESETS.map((p) => p.id).join(', '));
    process.exit(1);
  }
  writeFileSync(outfile, toCreateConfigScript(preset.spec));
  console.log('wrote', outfile, 'for preset', preset.name);
}

void main();
