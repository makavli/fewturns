#!/usr/bin/env node
// Prints the changelog entry of the version in package.json: the text of its GitHub release.
// The release job of .github/workflows/test.yml runs it after every merge into main.
//
//   node tools/release-notes.mjs
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = (p) => readFileSync(resolve(root, p), 'utf8');

export function notes(version = JSON.parse(text('package.json')).version, changelog = text('CHANGELOG.md')) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `));
  if (start < 0) throw new Error(`CHANGELOG.md has no entry for ${version}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const entry = rest.slice(0, end < 0 ? rest.length : end).join('\n').trim();
  if (!entry) throw new Error(`The changelog entry for ${version} is empty`);
  return `${entry}\n\nInstall or update: see the [README](https://github.com/makavli/fewturns#install).`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(notes());
