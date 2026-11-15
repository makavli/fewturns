# The trust check

The audit's TRUST section names what deserves a second look in the plugins in use and your settings files: hooks and the scripts they name, MCP servers, and settings. A disabled plugin runs nothing, so it is not read. A line is a reason to read, not a verdict. An empty section is not a guarantee either: the check reads patterns, and code can hide. Nothing is run to find out.

## What each line means

| Line | What it means | What to do |
| --- | --- | --- |
| downloads code from the internet and runs it | Each run fetches whatever that address serves at that moment and executes it. Whoever controls the address controls what runs on this machine. | Remove the hook or disable the plugin, unless its author explains why and you trust them. |
| decodes hidden text, usually to run it | The code hides what it does. A hook rarely has a reason to. | Read what it decodes to. If you cannot tell, remove it. |
| mentions your keys or passwords | It names SSH keys, cloud or git credentials, or your Claude key. A guard that keeps the agent away from them matches too. | Read which it is: a guard refuses access, a thief reads and sends. |
| sets something to run at login or on a schedule | It outlives the session: a shell startup file, a scheduled task, a login item. | Remove the hook, and the entry it added. |
| can delete your home folder or more | A recursive delete aimed at your home folder or the root of the disk. | Remove it. |
| too long, or too large, to check by pattern | A hook or server command over 10,000 characters or a script over 2 MB is not matched at all. Few hand-written hooks come near that size; a bundled one can. | Look at who ships it and read what you can. If you cannot tell what it does, remove it. |
| has a hooks file the check cannot read | The plugin's hooks file is not plain JSON or is too large to read, so the check sees none of its commands. | Read what the plugin ships before you rely on it, or disable the plugin. |
| has an MCP server file the check cannot read | The plugin names its servers in a bundle, an address or a file that is not plain JSON, so the check sees none of their commands. | Read what the plugin ships before you rely on it, or disable the plugin. |
| has an MCP server list the check cannot read | `mcpServers` in `~/.claude.json` or `.mcp.json` is not a map of names to servers, so the check sees none of their commands. | Read the file before you rely on it. |
| runs the newest version of a package at every start | An MCP server started with `npx -y`, `uvx`, `npm exec`, `yarn dlx`, `bun x`, `deno run <address>` or the like, directly or through a shell, without a version: its publisher can change what runs here, any day. | Pin it: `package@1.2.3` (or `package==1.2.3`) in its `args`. |
| connects to a host: what you send it leaves this machine | A remote MCP server. It receives what the agent passes to it, code included. | Keep it if you chose that service; otherwise switch it off in `/mcp`. |
| sends your requests to a host, not to Anthropic | `ANTHROPIC_BASE_URL` is set: every request, with your code and your key, passes through that server first. Offers of "free" or "cheap" Claude often work this way. | Delete it from `env` unless you set it up for a gateway you run or trust. |
| runs a command to hand over your API key | `apiKeyHelper` is set. | Delete it unless you set it up. |
| lets Claude run every command without asking | `permissions.defaultMode` is `bypassPermissions`. | Delete it, and allow the few commands you need instead. |
| lets Claude run any command without asking | A project's settings allow every shell command. A project you cloned should not grant itself that. | Delete the rule from the project's settings. |
| lets Claude run a tool with any arguments without asking: enough to run or send anything | A project's settings allow a shell, an interpreter, a downloader or a package runner with any arguments (`Bash(curl:*)`, `Bash(python *)`): every command or upload can pass through it. | Delete the rule from the project's settings, and allow the exact commands you need instead. |
| runs commands on your machine as hooks | A project's settings carry hooks: they run when Claude Code works in that folder. | Read them before you trust the folder. Delete them if you did not write them. |
| runs a command on your machine to draw the status line, sign in to AWS, export AWS credentials or make telemetry headers | A project's settings set `statusLine`, `awsAuthRefresh`, `awsCredentialExport` or `otelHeadersHelper`: each runs a command when Claude Code works in that folder. The same keys in your own settings are checked by pattern only. | Read it before you trust the folder. Delete the key if you did not write it. |
| adds the plugin marketplace … and turns on its plugins | A project's settings add a marketplace (`extraKnownMarketplaces`) and may turn its plugins on (`enabledPlugins`): Claude Code then offers to install them, and a plugin's hooks and servers run on your machine. | Install nothing from it until you have read the plugin: `/fewturns audit owner/repo` for one on GitHub. |
| starts every MCP server a project lists, without asking | `enableAllProjectMcpServers` is on. | Set it to `false`, and approve a project's servers one by one. |

## How to remove

- **A plugin's hook or server:** disable the plugin (`"enabledPlugins": {"<plugin>@<marketplace>": false}`) or uninstall it (`claude plugin uninstall <plugin>@<marketplace>`). An edit to the plugin's own files does not last: its next update brings them back.
- **A setting:** delete the key from the file the line names, after the backup of **trim** step 3, and prove the file still parses.
- **What a hook already set up:** a line in a shell startup file, a scheduled task (`crontab -l`, Task Scheduler, `launchctl list`): remove it by hand, with the user.

## Before you install anything

- Install from a public repository whose code you can read. `/fewturns audit owner/repo` reads it for you first: who owns it, what it would run, what it would cost each request. The last line of TRUST says where each plugin in use updates from: whoever controls that repository can change what runs on your machine at the next update. On your yes, `/fewturns trust` looks each GitHub repository up: who owns it, how old it is, and what its last changes were. A new account, a repository that moved or is gone, or a large change by someone new deserves a read before the next update.
- Skills are text. One that asks for your Claude login, your Anthropic API key or a payment before it works deserves suspicion.
- Fewer is better. Each plugin adds its listing to every request and each hook runs on your machine: install for a need, then weigh it with `/fewturns`.
