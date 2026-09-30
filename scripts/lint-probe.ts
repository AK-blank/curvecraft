/** Run the launch lint over every preset. */
import { lintSpec } from '../src/core/lint';
import { PRESETS } from '../src/core/presets';

async function main() {
  for (const preset of PRESETS) {
    const result = lintSpec(preset.spec);
    const errors = result.items.filter((i) => i.level === 'error');
    const warnings = result.items.filter((i) => i.level === 'warning');
    console.log(`${preset.name.padEnd(16)} ok=${result.ok} errors=${errors.length} warnings=${warnings.length}`);
    for (const item of [...errors, ...warnings]) {
      console.log(`   [${item.level}] ${item.title} — ${item.detail.slice(0, 120)}`);
    }
  }
}

void main();
