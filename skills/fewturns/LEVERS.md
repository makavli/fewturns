# The levers

Each lever names what leaves every request, what the user gives up, and the edit. *Safe* levers cost almost nothing and go to the user as one group. *Your call* levers change how Claude Code behaves and go one by one.

Checked against Claude Code 2.1.322. Settings change between versions, and a key the installed version does not know is ignored without a word, so `/fewturns check` in a fresh session is the proof, not the file. When the installed version is newer and a lever fails that check, look the key up in the settings documentation before trying again.

**Where to edit.** `~/.claude/settings.json` for every project, `.claude/settings.local.json` for this project on this machine. Later files win: user, then project (`.claude/settings.json`), then local. A plugin that a project's settings enable is turned off in `.claude/settings.local.json`; the user file cannot override the project.

## Load carried by every request

| Lever | Edit | Leaves each request | Gives up |
| --- | --- | --- | --- |
| **Plugins not needed every session** (*your call*) | `"enabledPlugins": {"<plugin>@<marketplace>": false}` | Every skill and agent description the plugin lists, its hooks, its MCP servers. Usually the largest item in the audit. | The plugin, until `claude plugin enable <plugin>@<marketplace>` or `true`. To keep its main skill starting by itself, leave a stub: [STUB.md](STUB.md). |
| **Skills that cannot work here** (*your call*) | The `/skills` panel, or `"skillOverrides": {"<skill>": "user-invocable-only"}` | The skill's line in the listing. `"name-only"` keeps the name and drops the description; `"off"` also blocks `/name`. | Claude no longer starts the skill by itself; `/name` still works. |
| **Description cap** (*safe*) | `"skillListingMaxDescChars": 400` | The tail of every description past 400 characters (the default cap is 1536). | Trigger phrases written at the end of a long description. Read the listing in the next session and raise the cap if a skill stopped starting. |
| **claude.ai connectors** (*your call*) | `"disableClaudeAiConnectors": true` | The tools of every cloud connector attached to the claude.ai account. | Those connectors inside Claude Code. True in any settings file wins. |
| **MCP servers** (*your call*) | The `/mcp` panel | The tool definitions of each server switched off. | That server's tools in this project. |
| **Hooks on every call** (*your call*) | Remove the hook from `"hooks"`, or disable the plugin that brings it | A process started on every prompt or tool call, and whatever text it adds to the context. | What the hook did: a format, a guard, a log. Keep the guards the user relies on. |
| **Instruction files** (*safe*) | Shorten `CLAUDE.md`; exclude others' files with `"claudeMdExcludes": ["<glob>"]` | Lines that restate what the code or its config already says. | Nothing, when the lines were restatements. |
| **Memory index** (*safe*) | One short line per memory in `MEMORY.md` | Status reports and history that grew inside the index. Only its first 200 lines load, so a long index also hides its own tail. | Nothing: the detail stays in the memory file the line points to. |

`skillOverrides` reaches personal, project and synced skills. A plugin's skills follow the plugin, so the lever for those is the plugin itself.

Leave `skillListingBudgetFraction` alone. It is the share of the context window the whole listing may take (1% by default), and lowering it shortens every description at once, which makes skills start less reliably. When the audit reports the listing over its budget, remove sources instead.

## Requests nobody asked for

| Lever | Edit | Saves | Gives up |
| --- | --- | --- | --- |
| **Prompt suggestions** (*safe*) | `"promptSuggestionEnabled": false` | A model call after each turn to guess the next prompt. | The grey suggestion in the input box. |
| **Precomputed compaction** (*safe*) | `"precomputeCompactionEnabled": false` | A background call that prepares a compaction summary before one is needed. | Compaction takes a moment when it does happen. |
| **Session recap** (*safe*) | `"awaySummaryEnabled": false` | A call that writes a recap when the user comes back after five minutes. | The recap. The key is internal and may be renamed; `/fewturns check` will tell. |
| **Idle compaction** (*your call*) | `"idleCompaction": false` | A compaction started while the session sits idle. | A long conversation is compacted when it reaches its window instead of during a pause. |

## Cost of each request

| Lever | Edit | Saves | Gives up |
| --- | --- | --- | --- |
| **Effort** (*your call*) | `"effortLevel": "medium"`, or per model: `"modelSettings": {"<model>": {"effortLevel": "medium"}}` | Thinking tokens on every turn. | Depth on hard problems. Raise it for one session with `/effort high`. |
| **Helper model** (*your call*) | `"env": {"CLAUDE_CODE_SUBAGENT_MODEL": "sonnet"}` | Helpers with no model of their own run on the cheaper model. The built-in Explore and Plan say `inherit`, so they keep the session's model whatever this says. | Strength on subtle helper jobs. A model named on the call or in a helper's file still wins, so a hard job can ask for the larger one. |
| **Lean helpers** (*your call*) | Four files in `~/.claude/agents/`: [HELPERS.md](HELPERS.md) | Each turn a helper takes resends its tools and instructions. These name a small model and only the tools their job needs, so each of their turns resends less, at a lower price. | Their four descriptions in the agent listing of every request. Like settings, they arrive in the next session. |
| **Compaction window** (*your call*) | `"autoCompactWindow": 300000` (100000 to 1000000) | Each request resends the conversation so far; a lower window caps how large late requests grow. | Earlier compaction: detail from the start of a long session is summarised sooner. |

## What Fewturns leaves alone

Permissions, the model itself, and anything an organisation's managed settings control. Fewer permission prompts are a matter of flow, not of load: Claude Code's own `/fewer-permission-prompts` handles them.
