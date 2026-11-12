# Contributing to Fewturns

Thank you for helping. Fewturns is small on purpose, so the bar for adding to it is that the addition saves more than it costs.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

You need Node.js 20 or later and nothing else: no install step, no dependencies.

```bash
git clone https://github.com/makavli/fewturns.git
cd fewturns
npm run check
```

To try your working copy as the skill, link it into your personal skills folder (move an installed copy out of the way first):

```bash
ln -s "$PWD/skills/fewturns" ~/.claude/skills/fewturns
```

## What is welcome

- **A new lever.** A setting or habit that lowers what a request carries or the requests a task takes. Add a row to [`skills/fewturns/LEVERS.md`](skills/fewturns/LEVERS.md) with the exact edit, what leaves each request, what the user gives up, and the Claude Code version you saw it work in. If the audit can read its state, add it to `LEVERS` in `audit.mjs`; a test keeps the two lists in step.
- **A correction.** Settings change between versions. If a lever stopped working or changed its meaning, say which version and how you saw it.
- **A better audit.** Something loaded into every request that the script does not count yet.
- **A trust pattern.** A shape of hook, server or setting that deserves a second look and that the audit misses. Add it to `RISKS` in `audit.mjs` (or to the checks beside it) with a test that finds it and a test that ordinary commands pass, and give it a row in [`skills/fewturns/TRUST.md`](skills/fewturns/TRUST.md): what it means and what to do. A pattern that flags ordinary work does harm, because people learn to skip the section.
- **A sharper rule.** The rules block is loaded in every session of everyone who installs it. A change there should make it shorter or clearer, rarely longer.

## The rules of the house

- **The skill stays one skill with no hooks.** Each extra description and each hook is load on every request, which is the thing Fewturns removes.
- **The shipped script only reads.** No network, no writes, no child processes, no environment variables. `tests/audit.test.mjs` enforces it; please do not loosen that test.
- **No collection, ever.** No telemetry, no usage ledger, no opt-in upload.
- **No numbers without a source.** A figure in the README or a picture comes from `tools/demo.mjs`, and a test checks it. After changing the fixture or the audit, run `npm run figures` and update the README's figures.
- **No dependencies.** Node's built-in modules are enough.
- **Text only.** The repository holds Markdown, JavaScript, JSON, YAML and SVG.

## Sending a change

1. Branch from `main`.
2. Give the change its version: `npm run bump <major.minor.patch>`, then write its entry in `CHANGELOG.md`. Not sure which number? Take the next patch number; the maintainer will adjust it.
3. Run `npm run check`.
4. Open a pull request against `main` that says what changes and why, and how you checked it.

**Every merge into `main` is a release.** That is why each pull request carries a version: the test run refuses one whose version is already released, and on merge the workflow tags the commit and publishes the changelog entry as the GitHub release. `main` and the latest release are always the same thing, so nobody installs unfinished work.

The same check runs on every pull request, on Linux, Windows and macOS, and has to pass before a merge. The run of a first-time contributor waits for the maintainer to approve it.

When the checks of a pull request from a branch of this repository fail, the workflow opens an issue labelled `ci-failure` that links to the pull request, and says so on the pull request; the next green run, or closing the pull request, closes the issue. `tests/workflow.test.mjs` runs the scripts of both jobs against a stand-in for `gh`. A pull request from a fork gets no issue, because its token cannot write one, but the same checks still have to pass.
