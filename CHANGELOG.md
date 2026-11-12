# Changelog

## 1.2.2 (2026-11-12)

- **The version pin in the README works:** `/plugin marketplace add makavli/fewturns#v1.2.2` (a `#`, not an `@`).
- **The README says how to update**, for each of the three install routes, and that the `npx` route runs the `skills` package from npm.
- **`/fewturns undo` asks before it deletes a stub's folder**, and `/fewturns trim` shows the line it adds to `.git/info/exclude`.

## 1.2.1 (2026-11-12)

- **A red main opens an issue too.** When the checks fail after a merge, no release is made, and the workflow now opens the issue "Checks failed on main"; the next green run on main closes it. Nothing changed in the skill.

## 1.2.0 (2026-11-12)

- **Thrift is now Fewturns.** The plugin is `fewturns@fewturns`, the command `/fewturns`, the skill folder `skills/fewturns`, the repository `makavli/fewturns`, and the markers of the `CLAUDE.md` block `<!-- fewturns:start -->` and `<!-- fewturns:end -->`. Nothing else changed. `/fewturns` does not see what the old name wrote: its `undo` looks for `.bak-fewturns-*` backups and the new markers. To leave the old name, run `/thrift undo` first, then uninstall `thrift@thrift` and install `fewturns@fewturns`; or delete the old block between its `thrift:start` and `thrift:end` markers by hand, then run `/fewturns rules`.

## 1.1.0 (2026-11-12)

- **`/fewturns` is now a guided setup.** With no argument it runs the audit, says in five plain lines what it found, and asks at most three questions before it changes anything. The audit alone is `/fewturns audit`.
- **A trust check.** The audit's new TRUST section names what deserves a second look in the plugins in use and your settings: hooks, and the scripts they name, that download code and run it, decode hidden text, name your keys, set something to run at login, delete your home folder, or are too long to check by pattern; MCP servers that run the newest version of a package at every start or connect to another host; settings that route your requests away from Anthropic, hand over your key or let Claude run every command; a project that grants itself hooks or every shell command. Its last line says where each plugin in use updates from. `/fewturns trust` explains each line, hands a script too long to read to a small read-only helper, and removes nothing without your yes; `TRUST.md` says what each line means. The audit script still only reads.
- **The audit counts more of what is really loaded:** `CLAUDE.md` files in the folders above the project, and the memory index kept for one of them. Hooks that run at session start get their own section, since what they print is resent with every request.
- **`/fewturns check` says whether your rules block is this version's**, and `/fewturns rules` updates one that differs.
- **Three rules say more.** *One wait*: when the user writes while a job runs, check it once and carry on. *Helpers that pay*: name the smallest model that can do the job on every call, ask for a short report, and keep work that needs the machine to itself (a build, an editor, a render) inline. *Skills by need*: never apply a skill from memory, and name the ones used in one line. *Tails* and *Lean index* are tighter. Still ten rules: run `/fewturns rules` again to update a block you installed before.
- **Lean helpers.** `HELPERS.md` holds four helper files: one that reads local files and one that reads the web, both on a small model and never both at once, then a worker and a reviewer on a mid-size model. Each has only the tools its job needs and ends with a short report. `/fewturns trim` offers them, and `/fewturns undo` removes them. `LEVERS.md` now says that the built-in Explore and Plan helpers keep the session's model, whatever `CLAUDE_CODE_SUBAGENT_MODEL` says.
- **An honest "after" figure.** The demo's "after" side now pays for the working rules it installs, so the README quotes about 4,247 tokens, not 3,711.
- **A red pull request opens an issue.** When the checks of a pull request from a branch of this repository fail, the workflow opens an issue that links to it and comments on the pull request; the next green run, or closing the pull request, closes the issue. As before, `main` takes no merge until the checks are green.

## 1.0.3 (2026-11-12)

- **Tails** now covers pictures: tile many video frames or screenshots into one contact sheet first, and open a single one only where the sheet is not enough. The sheet is read as one picture, not one per frame.
- **Lean index** now covers a handoff page read at every start: it holds the state now, and each update rewrites it instead of appending a log.

Still ten rules. Run `/fewturns rules` again to update a block you installed before; `SKILL.md` and the audit script are unchanged.

## 1.0.2 (2026-11-12)

- Every merge into `main` is now published as a release by the test workflow, so `main` and the latest release are always the same thing.
- Pull requests go to `main` again; the `dev` branch is gone. Each one carries its own version number and changelog entry (`npm run bump <version>` sets them).

The skill and the audit script are unchanged.

## 1.0.1 (2026-11-12)

- `main` now moves only at a release, so every way of installing Fewturns gives the latest release. Work in progress lives on the `dev` branch.
- The README shows the release and how to stay on one version.

The skill and the audit script are unchanged.

## 1.0.0 (2026-11-12)

The first release.

- `/fewturns`: a read-only audit of what every request carries: the skill and agent listings, instruction files, the memory index, hooks that run on every call, MCP servers, and the state of every lever.
- `/fewturns trim`: the levers, each with its edit and its price, applied one yes at a time with a backup.
- `/fewturns rules`: the ten working rules, as a marked block in `CLAUDE.md`.
- `/fewturns check` and `/fewturns undo`.
- The on-demand stub for a disabled plugin.
- Levers checked against Claude Code 2.1.322.
- The audit prints a value taken from a file only when it is plain, so a cloned project or a plugin cannot speak through the report.
- `/fewturns undo` sets back only the settings Fewturns changes, after a yes, and leaves a backup it did not make alone.
- Tested on Linux, Windows and macOS, on every pull request.
