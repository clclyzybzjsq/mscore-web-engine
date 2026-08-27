// Asset sanity check for the shipped engine directory.
// Verifies every file the runtime needs exists and has the expected size
// class, so a corrupted copy or a partial checkout fails loudly before
// anyone debugs a blank iframe.
//
// Usage: node scripts/check-assets.mjs
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const engine = join(root, 'engine');

const REQUIRED = [
  ['MuseScoreStudio.wasm', 60 * 1024 * 1024], // ~82 MB
  ['MuseScoreStudio.js', 100 * 1024],
  ['MuseAudio.js', 1 * 1024 * 1024],
  ['viewer.html', 1000],
  ['qtloader.js', 1000],
  ['distr/muapi.js', 100],
  ['distr/muimpl.js', 1000],
  ['distr/qtloader.js', 1000],
  ['distr/audiodriver.js', 100],
  ['distr/audioworker.js', 100],
  ['distr/audio_worklet_processor.js', 100],
  ['distr/config.js', 50],
  ['sound/MS Basic.sf3', 40 * 1024 * 1024], // ~51 MB
];

let failed = false;
for (const [rel, minSize] of REQUIRED) {
  const p = join(engine, rel);
  if (!existsSync(p)) {
    console.error(`MISSING  ${rel}`);
    failed = true;
    continue;
  }
  const size = statSync(p).size;
  const ok = size >= minSize;
  if (!ok) console.error(`TOO SMALL ${rel} (${size} bytes < ${minSize})`);
  else console.log(`ok       ${rel} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  failed = failed || !ok;
}

if (failed) {
  console.error('\nengine assets incomplete — re-run copy or rebuild');
  process.exit(1);
}
console.log('\nall engine assets present');
