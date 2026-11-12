# The on-demand stub

A disabled plugin costs nothing, but its skill no longer starts by itself. A stub keeps the trigger for the price of one description: a personal skill with the plugin's own description that loads the real skill from the plugin's cached files when it fires.

Use a stub when the user wants a plugin's main skill to keep starting on its own. A plugin they only ever call by name needs none: they re-enable it when they want it.

## Write it

1. Find the plugin's files: the `installPath` of its entry in `~/.claude/plugins/installed_plugins.json`.
2. Read the frontmatter of the skill to keep (`<installPath>/skills/<skill>/SKILL.md`) and copy the words of its `name` and `description` unchanged: the description is the trigger. Write the description as one double-quoted line, so the stub's header holds `name` and `description` and nothing else, whatever the plugin's text contains.
3. Create `~/.claude/skills/<skill>/SKILL.md` from the template, filling the three `<...>` fields.

```markdown
---
name: <skill>
description: "<the plugin skill's description, unchanged, on one line>"
---

The <plugin> plugin is installed but disabled to keep its load out of every request. This stub loads it on demand.

1. Base folder: the newest version folder under `<the plugin's cache folder, without its version>`, then `skills/<skill>/`.
2. Read that folder's `SKILL.md` in full and follow it as the active skill. Resolve its relative paths against that folder.
3. The plugin's agents are not registered while it is off. Where the skill calls one, start a general-purpose subagent with: "Read `<base folder>/../../agents/<agent>.md` and act as that agent."
4. The plugin's hooks do not run. For work that depends on them, ask the user first, then enable the plugin for that session (`claude plugin enable <plugin>@<marketplace>`), ask them to reload, and disable it again afterwards.
```

Done when the stub's description matches the plugin skill's word for word, its header holds only `name` and `description`, and the base folder exists. The stub shows in the listing from the next session.

## Limits

- The stub runs whatever the plugin's cache holds, as the plugin itself would if it were enabled: it is for plugins the user already trusts.
- The stub reads the plugin's cache: a plugin that is uninstalled, not just disabled, leaves the stub pointing at nothing. `/fewturns undo` removes a stub.
- The stub copies the description as it is today. After the plugin updates, compare the two and copy the new one if it changed.
