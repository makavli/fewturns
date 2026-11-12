#!/usr/bin/env node
// Sets a new version everywhere it is written and opens its changelog entry.
// Every merge into main is a release, so every pull request starts with this.
//
//   node tools/bump.mjs 1.2.3
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const next = process.argv[2] ?? '';
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error('usage: node tools/bump.mjs <major.minor.patch>');
  process.exit(1);
}
const old = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version;

// Each file, and the exact text that carries the version in it.
const places = {
  'package.json': [`"version": "${old}"`],
  '.claude-plugin/plugin.json': [`"version": "${old}"`],
  'README.md': [`badge/release-v${old}-`, `alt="Release v${old}"`, `makavli/fewturns@v${old}`],
};
for (const [file, texts] of Object.entries(places)) {
  let body = readFileSync(resolve(root, file), 'utf8');
  for (const text of texts) {
    if (!body.includes(text)) throw new Error(`${file} does not contain ${text}`);
    body = body.replace(text, text.replace(old, next));
  }
  writeFileSync(resolve(root, file), body);
}
const changelog = resolve(root, 'CHANGELOG.md');
const today = new Date().toISOString().slice(0, 10);
writeFileSync(changelog, readFileSync(changelog, 'utf8').replace(/^# Changelog\r?\n\r?\n/, `# Changelog\n\n## ${next} (${today})\n\n- \n\n`));
console.log(`${old} -> ${next}. Now write the entry in CHANGELOG.md.`);
