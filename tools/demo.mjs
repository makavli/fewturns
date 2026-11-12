#!/usr/bin/env node
// Runs the audit on the made-up home of tests/fixture.mjs, before and after Fewturns, and prints both.
// The README's example and the numbers in assets/ come from this output (tests/repo.test.mjs checks them).
//
//   node tools/demo.mjs [--json]
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audit, report } from '../skills/fewturns/scripts/audit.mjs';
import { makeHome } from '../tests/fixture.mjs';

export function demo() {
  const dir = mkdtempSync(join(tmpdir(), 'fewturns-demo-'));
  try {
    const run = (trimmed) => audit(makeHome(join(dir, trimmed ? 'after' : 'before'), { trimmed }));
    return { before: run(false), after: run(true) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { before, after } = demo();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ before, after }, null, 2));
  } else {
    const tidy = (text) => text.replace(/\nSettings read:.*$/, ''); // a temp folder, different on every run
    console.log(`=== BEFORE ===\n${tidy(report(before))}\n\n=== AFTER /fewturns trim ===\n${tidy(report(after))}`);
    console.log(`\n${before.tokens.toLocaleString('en-US')} -> ${after.tokens.toLocaleString('en-US')} tokens on every request (estimate, chars / 4)`);
  }
}
