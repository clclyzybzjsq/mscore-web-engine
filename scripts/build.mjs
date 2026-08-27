// Assemble the distributable engine directory.
//
// Copies the source tree (engine/, src/, examples/, scripts/, docs/) into
// dist/mscore-web-engine/ with only the files needed to run and embed the
// engine, ready to drop on any static file server or CDN.
//
// Usage: node scripts/build.mjs
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = join(root, 'dist');
const pkg = join(dist, 'mscore-web-engine');

rmSync(pkg, { recursive: true, force: true });
mkdirSync(pkg, { recursive: true });

const dirs = ['engine', 'src', 'examples', 'scripts', 'docs'];
for (const d of dirs) {
  const src = join(root, d);
  if (existsSync(src)) cpSync(src, join(pkg, d), { recursive: true });
}

for (const f of ['package.json', 'README.md', 'LICENSE', 'NOTICE']) {
  cpSync(join(root, f), join(pkg, f));
}

console.log(`assembled ${pkg}`);
