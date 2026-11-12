// The workflows' shell scripts, run with bash against a stand-in for `gh` that logs its calls: every path of the issue
// a red pull request opens, and of the job that closes it with the pull request.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const TEST = '.github/workflows/test.yml';
const CLOSE = '.github/workflows/close-issue.yml';

// The `run: |` block of the job's step, as the runner gets it.
function script(file, job) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  let i = lines.indexOf(`  ${job}:`);
  assert.ok(i >= 0, `${file} has no job ${job}`);
  while (i < lines.length && !/^\s+run: \|$/.test(lines[i])) i++;
  assert.ok(i < lines.length, `${job} in ${file} has no run block`);
  const indent = lines[i].search(/\S/);
  const body = [];
  for (i++; i < lines.length && (!lines[i].trim() || lines[i].search(/\S/) > indent); i++) body.push(lines[i]);
  const pad = Math.min(...body.filter((l) => l.trim()).map((l) => l.search(/\S/)));
  return body.map((l) => l.slice(pad)).join('\n').trimEnd();
}

// Each call is logged as its arguments followed by an ASCII record separator; `api` answers with OPEN_ISSUE and
// `pr view` with PR_STATE.
const STUB = `gh() {
  printf '%s\\036' "$*" >> "$GH_LOG"
  case "$1 $2" in
    "api "*) printf '%s\\n' "$OPEN_ISSUE" ;;
    "pr view") printf '%s\\n' "$PR_STATE" ;;
    "issue create") echo "https://github.com/owner/repo/issues/7" ;;
  esac
}
`;

// The WSL launcher on Windows drops the environment: skip where bash cannot take it.
const probe = spawnSync('bash', ['-c', 'printf %s "$FEWTURNS_PROBE"'], { encoding: 'utf8', env: { ...process.env, FEWTURNS_PROBE: 'ok' }, windowsHide: true });
const skip = probe.stdout === 'ok' ? false : 'needs a bash that takes environment variables';

function run(file, job, vars) {
  const dir = mkdtempSync(join(tmpdir(), 'fewturns-workflow-'));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/TOKEN/i.test(key)) delete env[key];
  Object.assign(env, { GH_LOG: join(dir, 'gh.log').split('\\').join('/'), GH_REPO: 'owner/repo', PR: '12', RUN: 'https://example.invalid/run', SHA: 'abcdef1234567', OPEN_ISSUE: '', PR_STATE: 'OPEN' }, vars);
  try {
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', STUB + script(file, job)], { encoding: 'utf8', env, windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    return readFileSync(env.GH_LOG, 'utf8').split('\x1e').filter(Boolean);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
const kinds = (calls) => calls.map((c) => (c.startsWith('api ') ? 'api' : c.split(' ').slice(0, 2).join(' ')));

test('a red run opens an issue and says so on the pull request', { skip }, () => {
  const calls = run(TEST, 'issue', { RESULT: 'failure' });
  assert.deepEqual(kinds(calls), ['api', 'pr view', 'label create', 'issue create', 'pr comment']);
  assert.match(calls[0], /^api repos\/owner\/repo\/issues\?state=open&labels=ci-failure&/);
  assert.match(calls[0], /\.title == "Checks failed on pull request #12"/);
  assert.match(calls[1], /^pr view 12 --json state/);
  assert.match(calls[3], /--title Checks failed on pull request #12 --label ci-failure --body The checks of #12 failed on abcdef1: /);
  assert.match(calls[4], /^pr comment 12 --body Blocked by #7: /);
});

test('a red run that ends after its pull request was closed opens no issue', { skip }, () => {
  assert.deepEqual(kinds(run(TEST, 'issue', { RESULT: 'failure', PR_STATE: 'CLOSED' })), ['api', 'pr view']);
});

test('red again comments on the open issue instead of opening another', { skip }, () => {
  const calls = run(TEST, 'issue', { RESULT: 'failure', OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(calls), ['api', 'issue comment']);
  assert.match(calls[1], /^issue comment 5 --body Still red on abcdef1: /);
});

test('a green run closes the open issue, and does nothing more when there is none', { skip }, () => {
  const calls = run(TEST, 'issue', { RESULT: 'success', OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(calls), ['api', 'issue close']);
  assert.match(calls[1], /^issue close 5 --comment Fixed: the checks on abcdef1 are green\. /);
  assert.deepEqual(kinds(run(TEST, 'issue', { RESULT: 'success' })), ['api']);
});

test('a red main opens its own issue, says nothing on a pull request, and the next green run closes it', { skip }, () => {
  const calls = run(TEST, 'issue', { RESULT: 'failure', PR: '' });
  assert.deepEqual(kinds(calls), ['api', 'label create', 'issue create']);
  assert.match(calls[0], /\.title == "Checks failed on main"/);
  assert.match(calls[2], /--title Checks failed on main --label ci-failure --body The checks on main failed on abcdef1: /);
  assert.deepEqual(kinds(run(TEST, 'issue', { RESULT: 'success', PR: '', OPEN_ISSUE: '5' })), ['api', 'issue close']);
});

test('closing a pull request closes its open issue, and does nothing more when there is none', { skip }, () => {
  const calls = run(CLOSE, 'close', { OPEN_ISSUE: '5' });
  assert.deepEqual(kinds(calls), ['api', 'issue close']);
  assert.match(calls[0], /\.title == "Checks failed on pull request #12"/);
  assert.match(calls[1], /^issue close 5 --comment #12 is closed/);
  assert.deepEqual(kinds(run(CLOSE, 'close', {})), ['api']);
});

test('the scripts read their inputs from env, never from an expression', () => {
  for (const [file, job] of [[TEST, 'issue'], [CLOSE, 'close']]) assert.ok(!script(file, job).includes('${{'), `${file}, job ${job}`);
});
