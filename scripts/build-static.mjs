#!/usr/bin/env node
/**
 * Build the static bundle for GitHub Pages.
 *
 * `output: 'export'` cannot contain route handlers, so the API routes are moved
 * aside for the build and restored afterwards (even on failure). The exported
 * site keeps every feature: the studio runs the Meteora SDK in the browser.
 *
 *   node scripts/build-static.mjs                 # basePath = ""
 *   BASE_PATH=/curvecraft node scripts/build-static.mjs
 */
import { execSync } from 'node:child_process';
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'src/app/api');
const parked = join(root, 'src/app/_api-parked');

if (existsSync(parked)) {
  console.error('Found a leftover src/app/_api-parked — restore it before building.');
  process.exit(1);
}

let moved = false;
try {
  if (existsSync(api)) {
    renameSync(api, parked);
    moved = true;
  }
  // GitHub Pages runs Jekyll by default, which drops directories starting with "_".
  writeFileSync(join(root, 'public/.nojekyll'), '');
  execSync('npx next build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, STATIC_EXPORT: '1' },
  });
  console.log('\nStatic bundle written to ./out');
} finally {
  if (moved) renameSync(parked, api);
}
