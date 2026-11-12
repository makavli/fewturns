// Checks on the repository itself: manifests, versions, the skill's files, links, and that no machine left a trace.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LEVERS, frontmatter, report } from '../skills/fewturns/scripts/audit.mjs';
import { demo } from '../tools/demo.mjs';
import { figures } from '../tools/figures.mjs';
import { notes } from '../tools/release-notes.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const text = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(text(p));

function files(dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules'].includes(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else out.push(relative(root, path).split('\\').join('/'));
  }
  return out;
}
const all = files();

test('one version everywhere', () => {
  const { version } = json('package.json');
  assert.equal(json('.claude-plugin/plugin.json').version, version);
  assert.match(text('CHANGELOG.md'), new RegExp(`^## ${version.replaceAll('.', '\\.')} `, 'm'));
  assert.ok(text('README.md').includes(`badge/release-v${version}-`), 'the README badge names another version');
  assert.ok(text('README.md').includes(`makavli/fewturns#v${version}\n`), 'the README pin example names another version');
});

test('the plugin and its marketplace describe the same plugin', () => {
  const plugin = json('.claude-plugin/plugin.json');
  const market = json('.claude-plugin/marketplace.json');
  assert.equal(plugin.name, 'fewturns');
  assert.equal(market.plugins.length, 1);
  assert.equal(market.plugins[0].name, plugin.name);
  assert.equal(market.plugins[0].source, './');
  assert.ok(!('hooks' in plugin) && !existsSync(join(root, 'hooks')), 'Fewturns ships no hooks');
});

test('one skill, and its header practises what it asks of others', () => {
  assert.deepEqual(readdirSync(join(root, 'skills')), ['fewturns']);
  const fm = frontmatter(text('skills/fewturns/SKILL.md'));
  assert.equal(fm.name, 'fewturns');
  assert.ok(fm.description.length <= 400, `description is ${fm.description.length} characters`);
});

test('the rules block has its two markers, once each', () => {
  const rules = text('skills/fewturns/RULES.md');
  assert.equal(rules.split('<!-- fewturns:start -->').length, 2);
  assert.equal(rules.split('<!-- fewturns:end -->').length, 2);
  assert.ok(rules.indexOf('<!-- fewturns:start -->') < rules.indexOf('<!-- fewturns:end -->'));
});

test('the README quotes the rules as RULES.md has them', () => {
  const rules = text('skills/fewturns/RULES.md').split('<!-- fewturns:start -->')[1].split('<!-- fewturns:end -->')[0].split(/\r?\n/).filter((l) => l.startsWith('- '));
  assert.equal(rules.length, 10);
  const readme = text('README.md').split(/\r?\n/);
  for (const rule of rules) assert.ok(readme.includes(`> ${rule}`), `README differs on: ${rule.slice(0, 40)}`);
});

test('every lever the script reads is explained in LEVERS.md', () => {
  const levers = text('skills/fewturns/LEVERS.md');
  for (const { key } of LEVERS) assert.ok(levers.includes(`"${key.split('.').pop()}"`), `${key} is missing from LEVERS.md`);
});

test('each lean helper names its own model and never pairs web tools with local tools', () => {
  const helpers = [...text('skills/fewturns/HELPERS.md').matchAll(/^### (\S+)\.md\n\n````markdown\n([\s\S]*?)^````$/gm)];
  assert.equal(helpers.length, 4);
  for (const [, file, body] of helpers) {
    const { name, description, model, tools = '' } = frontmatter(body);
    assert.equal(name, file);
    assert.ok(description && model && model !== 'inherit', `${file}: a description and a model of its own`);
    const list = tools.split(/,\s*/);
    const web = list.some((t) => t.startsWith('Web'));
    assert.ok(!(web && list.some((t) => ['Read', 'Grep', 'Glob', 'Edit', 'Write', 'Bash'].includes(t))), `${file} has web tools and local tools`);
  }
});

test('relative links and images resolve', () => {
  for (const file of all.filter((f) => f.endsWith('.md'))) {
    const body = text(file).replace(/```[\s\S]*?```/g, '');
    const targets = [...body.matchAll(/\]\(([^)#\s]+)(#[^)]*)?\)/g), ...body.matchAll(/(?:src|srcset|href)="([^"#]+)(#[^"]*)?"/g)].map((m) => m[1]);
    for (const target of targets) {
      if (/^[a-z]+:/i.test(target)) continue;
      assert.ok(existsSync(join(root, dirname(file), target)), `${file} links to ${target}`);
    }
  }
});

test('no machine left a trace: no home folders, addresses, e-mails or keys', () => {
  const traces = /[A-Z]:[\\/]Users[\\/]|\/home\/[a-z]|\/Users\/[a-z]|AppData|[\w.+-]+@[\w-]+\.[a-z]{2,}|\b\d{1,3}(\.\d{1,3}){3}\b|gh[pos]_[A-Za-z0-9]{20,}|BEGIN [A-Z ]*PRIVATE KEY/;
  for (const file of all.filter((f) => f !== 'tests/repo.test.mjs')) { // this file holds the pattern itself
    for (const line of text(file).split('\n')) {
      assert.ok(!traces.test(line), `${file}: ${line.trim().slice(0, 120)}`);
    }
  }
});

test('only text ships: no binaries, nothing over 200 kB', () => {
  for (const file of all) {
    assert.match(file, /\.(md|mjs|json|ya?ml|svg)$|^(LICENSE|\.gitignore|\.gitattributes|\.editorconfig)$/, `unexpected file type: ${file}`);
    assert.ok(statSync(join(root, file)).size < 200_000, `${file} is too large`);
  }
});

test('the README and the pictures quote the demo, not a guess', () => {
  const { before, after } = demo();
  const n = (v) => v.toLocaleString('en-US');
  const readme = text('README.md');
  for (const value of [before.tokens, after.tokens]) {
    assert.ok(readme.includes(n(value)), `README.md should quote ${n(value)} (node tools/demo.mjs)`);
    assert.ok(text('assets/before-after-light.svg').includes(n(value)), `assets/before-after-light.svg should quote ${n(value)}`);
  }
});

test('the committed pictures are what the generator draws', () => {
  for (const [name, body] of Object.entries(figures())) assert.equal(text(`assets/${name}`), body, `${name} is stale: run node tools/figures.mjs`);
});

test("the README's example is the audit's real output", () => {
  const shown = /```text\n(FEWTURNS AUDIT[\s\S]*?)\n```/.exec(text('README.md'))[1];
  assert.equal(shown, report(demo().before).split('\n\nLEVERS')[0]);
});

test('the release text is the changelog entry of this version, and only that one', () => {
  const { version } = json('package.json');
  const out = notes();
  assert.ok(out.length > 80, out);
  assert.doesNotMatch(out, /^## /m);
  assert.equal(notes('9.9.9', '# Changelog\n\n## 9.9.9 (2030-01-01)\n\n- New.\n\n## 9.9.8 (2029-01-01)\n\n- Old.\n').split('\n')[0], '- New.');
  assert.throws(() => notes('0.0.0'), /no entry/);
  assert.ok(text('CHANGELOG.md').indexOf(`## ${version} `) < 20, 'the newest entry is not the current version');
});
