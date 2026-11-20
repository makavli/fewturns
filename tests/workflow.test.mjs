// The workflows' shell scripts, run with bash against a stand-in for `gh` that logs its calls: every path of the issue
// a red pull request opens, of the job that closes it with the pull request, and of the release.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TEST = '.github/workflows/test.yml';
const CLOSE = '.github/workflows/close-issue.yml';

// The `run: |` block of a job's step (its first step with one when no step name is given), as the runner gets it.
function script(file, job, step) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  const start = lines.indexOf(`  ${job}:`);
  assert.ok(start >= 0, `${file} has no job ${job}`);
  let end = lines.findIndex((l, k) => k > start && /^ {0,2}\S/.test(l));
  if (end < 0) end = lines.length;
  let i = start;
  if (step) {
    i = lines.findIndex((l, k) => k > start && k < end && l.trim() === `- name: ${step}`);
    assert.ok(i >= 0, `${job} in ${file} has no step "${step}"`);
  }
  while (i < end && !/^\s+run: \|$/.test(lines[i])) i++;
  assert.ok(i < end, `${job} in ${file} has no run block`);
  const indent = lines[i].search(/\S/);
  const body = [];
  for (i++; i < end && (!lines[i].trim() || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
  const pad = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  return body.map((l) => l.slice(pad)).join('\n').trimEnd();
}

// Each call is logged as its arguments followed by an ASCII record separator. `api .../commits/main` answers with
// HEAD_SHA, any other `api` with OPEN_ISSUE, `pr view` with PR_STATE, and `release view` with DRAFT (none if empty).
const STUB = `gh() {
  printf '%s\\036' "$*" >> "$GH_LOG"
  case "$1 $2" in
    "api "*/commits/main) printf '%s\\n' "$HEAD_SHA" ;;
    "api "*) printf '%s\\n' "$OPEN_ISSUE" ;;
    "pr view") printf '%s\\n' "$PR_STATE" ;;
    "issue create") echo "https://github.com/owner/repo/issues/7" ;;
    "release view") if [ -n "$DRAFT" ]; then printf '%s\\n' "$DRAFT"; else return 1; fi ;;
  esac
}
`;

// The WSL launcher on Windows drops the environment: skip where bash cannot take it.
const probe = spawnSync('bash', ['-c', 'printf %s "$FEWTURNS_PROBE"'], { encoding: 'utf8', env: { ...process.env, FEWTURNS_PROBE: 'ok' }, windowsHide: true });
const skip = probe.stdout === 'ok' ? false : 'needs a bash that takes environment variables';

// Only what bash and node need to start: no token or setting of this machine reaches the scripts.
const BASE = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|LANG)$/i.test(k)));

function run(file, job, vars = {}, step = undefined) {
  const dir = mkdtempSync(join(tmpdir(), 'fewturns-workflow-')).split('\\').join('/');
  const env = {
    ...BASE, GH_LOG: `${dir}/gh.log`, RUNNER_TEMP: dir, GH_REPO: 'owner/repo', PR: '12', RUN: 'https://example.invalid/run',
    SHA: 'abcdef1234567', GITHUB_SHA: 'abcdef1234567', HEAD_SHA: 'abcdef1234567', OPEN_ISSUE: '', PR_STATE: 'OPEN', DRAFT: '', ...vars,
  };
  const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', STUB + script(file, job, step)], { cwd: root, encoding: 'utf8', env, windowsHide: true });
  const calls = existsSync(env.GH_LOG) ? readFileSync(env.GH_LOG, 'utf8').split('\x1e').filter(Boolean) : [];
  return { status: r.status, stderr: r.stderr, calls, dir };
}
// The gh calls of a run that must succeed; its folder is removed.
function calls(file, job, vars) {
  const r = run(file, job, vars);
  rmSync(r.dir, { recursive: true, force: true });
  assert.equal(r.status, 0, r.stderr);
  return r.calls;
}
const kinds = (list) => list.map((c) => (c.startsWith('api ') ? 'api' : c.split(' ').slice(0, 2).join(' ')));

test('a red run opens an issue and says so on the pull request', { skip }, () => {
  const c = calls(TEST, 'issue', { RESULT: 'failure' });
  assert.deepEqual(kinds(c), ['api', 'pr view', 'label create', 'issue create', 'pr comment']);
  assert.match(c[0], /^api repos\/owner\/repo\/issues\?state=open&labels=ci-failure&/);
  assert.match(c[0], /\.title == "Checks failed on pull request #12"/);
  assert.match(c[1], /^pr view 12 --json state/);
  assert.match(c[3], /--title Checks failed on pull request #12 --label ci-failure --body The checks of #12 failed on abcdef1: /);
  assert.match(c[4], /^pr comment 12 --body Blocked by #7: /);
});

test('a red run that ends after its pull request was closed opens no issue', { skip }, () => {
  assert.deepEqual(kinds(calls(TEST, 'issue', { RESULT: 'failure', PR_STATE: 'CLOSED' })), ['api', 'pr view']);
});

test('red again comments on the open issue instead of opening another', { skip }, () => {
  const c = calls(TEST, 'issue', { RESULT: 'failure', OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(c), ['api', 'issue comment']);
  assert.match(c[1], /^issue comment 5 --body Still red on abcdef1: /);
});

test('a green run closes the open issue, and does nothing more when there is none', { skip }, () => {
  const c = calls(TEST, 'issue', { RESULT: 'success', OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(c), ['api', 'issue close']);
  assert.match(c[1], /^issue close 5 --comment Fixed: the checks on abcdef1 are green\. /);
  assert.deepEqual(kinds(calls(TEST, 'issue', { RESULT: 'success' })), ['api']);
});

test('a red main opens its own issue, says nothing on a pull request, and the next green run closes it', { skip }, () => {
  const c = calls(TEST, 'issue', { RESULT: 'failure', PR: '' });
  assert.deepEqual(kinds(c), ['api', 'label create', 'issue create']);
  assert.match(c[0], /\.title == "Checks failed on main"/);
  assert.match(c[2], /--title Checks failed on main --label ci-failure --body The checks on main failed on abcdef1: /);
  const green = calls(TEST, 'issue', { RESULT: 'success', PR: '', OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(green), ['api', 'api', 'issue close']);
  assert.match(green[1], /^api repos\/owner\/repo\/commits\/main /);
});

test('on main, a green run of an older commit leaves the head\'s issue open', { skip }, () => {
  assert.deepEqual(kinds(calls(TEST, 'issue', { RESULT: 'success', PR: '', OPEN_ISSUE: '5', HEAD_SHA: '9999999999999' })), ['api', 'api']);
});

test('closing a pull request closes its open issue, and does nothing more when there is none', { skip }, () => {
  const c = calls(CLOSE, 'close', { OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(c), ['api', 'issue close']);
  assert.match(c[0], /\.title == "Checks failed on pull request #12"/);
  assert.match(c[1], /^issue close 5 --comment #12 is closed/);
  assert.deepEqual(kinds(calls(CLOSE, 'close', {})), ['api']);
});

test('a merge releases its version once, replaces a draft left behind, and only the head becomes Latest', { skip }, () => {
  const create = (c) => c.find((x) => x.startsWith('release create'));
  const fresh = calls(TEST, 'release', {});
  assert.deepEqual(kinds(fresh), ['release view', 'api', 'release create']);
  assert.match(create(fresh), /^release create v\d+\.\d+\.\d+ --target abcdef1234567 .* --latest=true$/);
  assert.match(create(calls(TEST, 'release', { HEAD_SHA: '9999999999999' })), / --latest=false$/);
  assert.deepEqual(kinds(calls(TEST, 'release', { DRAFT: 'true' })), ['release view', 'release delete', 'api', 'release create']);
  assert.deepEqual(kinds(calls(TEST, 'release', { DRAFT: 'false' })), ['release view']);
});

test('the scripts read their inputs from env, never from an expression', () => {
  for (const [file, job] of [[TEST, 'issue'], [TEST, 'release'], [CLOSE, 'close']]) {
    assert.ok(!script(file, job).includes('${{'), `${file}, job ${job}`);
  }
});

test('a run on main is never dropped for a newer one', () => {
  const yml = readFileSync(join(root, TEST), 'utf8').replace(/\r\n/g, '\n');
  const group = /^concurrency:\n {2}group: (.+)$/m.exec(yml)?.[1] ?? '';
  assert.match(group, /github\.event_name == 'push' && github\.sha/, 'each commit on main has its own group');
  assert.match(yml, /^concurrency:\n {2}group: .+\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m, 'only a pull request cancels its older run');
});

test('every job waits only for jobs that exist, never for itself', () => {
  const lines = readFileSync(join(root, TEST), 'utf8').split(/\r?\n/);
  const jobs = lines.map((l) => /^  ([\w-]+):$/.exec(l)?.[1]).filter(Boolean);
  let job;
  for (let k = 0; k < lines.length; k++) {
    job = /^  ([\w-]+):$/.exec(lines[k])?.[1] ?? job;
    const m = /^    needs:(.*)$/.exec(lines[k]);
    if (!m) continue;
    const needs = m[1].trim() ? m[1].replace(/[[\]]/g, '').split(',') : [];
    for (let j = k + 1; !m[1].trim() && /^      - /.test(lines[j]); j++) needs.push(lines[j].slice(8)); // the list form
    assert.ok(needs.length, `${job} has an empty needs`);
    for (const need of needs.map((n) => n.trim())) {
      assert.notEqual(need, job, `${job} waits for itself`);
      assert.ok(jobs.includes(need), `${job} waits for ${need}, which is not a job`);
    }
  }
});
