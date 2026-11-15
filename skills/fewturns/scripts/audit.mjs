#!/usr/bin/env node
// Fewturns audit: what every Claude Code request carries on this machine, and what you installed that deserves a look.
// Read-only by design: no network, no writes, no child processes (tests/audit.test.mjs enforces it).
//
//   node audit.mjs [--json] [--window <tokens>] [--home <dir>] [--project <dir>]
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_DESC_CAP = 1536; // Claude Code's default for skillListingMaxDescChars
const CHARS_PER_TOKEN = 4; // rough; the ratio Claude Code itself uses for the listing budget
const MEMORY_INDEX_LINES = 200; // lines of MEMORY.md that are loaded
const START = '<!-- fewturns:start -->';
const END = '<!-- fewturns:end -->';
// Hook events that fire many times per session; the others fire once or twice.
export const OFTEN = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit', 'Stop', 'SubagentStop', 'PermissionRequest']);

// The settings levers of LEVERS.md (tests keep the two lists in step).
export const LEVERS = [
  { key: 'skillListingMaxDescChars', fewturns: 400 },
  { key: 'disableClaudeAiConnectors', fewturns: true },
  { key: 'promptSuggestionEnabled', fewturns: false },
  { key: 'precomputeCompactionEnabled', fewturns: false },
  { key: 'awaySummaryEnabled', fewturns: false },
  { key: 'idleCompaction', fewturns: false },
  { key: 'autoCompactWindow', fewturns: 300000 },
  { key: 'effortLevel', fewturns: 'medium' },
  { key: 'env.CLAUDE_CODE_SUBAGENT_MODEL', fewturns: 'sonnet' },
];

// What the trust check looks for in hook commands and the scripts they name (TRUST.md explains each one).
// A match is a reason to read, not a verdict. The text is a stranger's: every repeat is bounded, so no input can
// make a pattern slow.
export const RISKS = [
  ['downloads code from the internet and runs it', /\b(curl|wget|iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^\n|;&]{0,300}\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|iex|Invoke-Expression|pwsh|powershell)\b|\b(sh|bash|zsh)\s+(-c\s+)?["']?(\$\(|<\()\s*(curl|wget)\b/i],
  ['decodes hidden text, usually to run it', /\bbase64\s+(-d|--decode)\b|FromBase64String|\s-(EncodedCommand|enc)\s/i],
  ['mentions your keys or passwords', /\.ssh[\\/]|\bid_(rsa|ed25519)\b|\.aws[\\/]credentials|\.git-credentials|\.netrc\b|\.credentials\.json|\bANTHROPIC_API_KEY\b|\bCLAUDE_CODE_OAUTH_TOKEN\b|find-generic-password/i],
  ['sets something to run at login or on a schedule', />>?\s*["']?(~|\$HOME)?[\\/]?\.(bashrc|zshrc|bash_profile|profile)\b|\bcrontab\b(?!\s+-l)|\bschtasks\b|\blaunchctl\s+load\b|CurrentVersion[\\/]Run\b/i],
  ['can delete your home folder or more', /\brm\s+(?:-{1,2}[\w-]{1,20}\s+){0,4}?(?:-[a-z]{0,5}r[a-z]{0,5}|--recursive)\s+(?:-{1,2}[\w-]{1,20}\s+){0,4}["']?(?:~|\$\{?HOME\}?|\/)\/?\*?["']?(?=[\s;&|)]|$)|\bRemove-Item\b(?=[^\n;|]{0,200}\s-Recurse\b)[^\n;|]{0,200}?\s["']?(?:~|\$HOME|\$env:USERPROFILE|[a-z]:)[\\/]?\*?["']?(?=[\s;|]|$)/i],
];
const RUNNERS = ['npx', 'bunx', 'pnpx', 'uvx', 'deno']; // start the newest published version of a package unless one is named
// The same, as a subcommand. A Map: a name read from a file (`constructor`) must not reach Object's own keys.
const VIA = new Map([['npm', ['exec', 'x']], ['pnpm', ['dlx']], ['yarn', ['dlx']], ['pipx', ['run']], ['bun', ['x']], ['deno', ['run']]]);
const SHELLS = ['cmd', 'sh', 'bash', 'zsh', 'pwsh', 'powershell'];
// Settings that run a command of their own, besides hooks, and what for.
const COMMANDS = [['apiKeyHelper', 'to hand over your API key'], ['statusLine.command', 'to draw the status line'], ['awsAuthRefresh', 'to sign in to AWS'], ['awsCredentialExport', 'to export AWS credentials'], ['otelHeadersHelper', 'to make telemetry headers']];
// An allow rule for one of these, with any arguments, is as wide as allowing every command.
// A path before it, a version after it (python3.12), and flags or a runner's subcommand (bash -c, npm exec) count too.
const WIDE = /^Bash\(\s*(?:sudo\s+)?(?:[\w.~:-]{0,80}[\\/]){0,20}([\w.-]{1,40}?)(?:\.(?:exe|cmd|bat))?((?:\s+[\w-]{1,20}){0,3}?)(?::\*|\s+\*|\*)\s*\)$/i;
const OPEN = new Set(['sh', 'bash', 'zsh', 'dash', 'fish', 'cmd', 'pwsh', 'powershell', 'node', 'deno', 'bun', 'python', 'python3', 'py', 'ruby', 'perl', 'php', 'curl', 'wget', 'iwr', 'irm', 'npx', 'bunx', 'pnpx', 'uvx', 'env', 'xargs', 'exec', 'sudo']); // shortcut: the shell built-in that runs text is left out, as the read-only test bans its name; add it if that test learns strings from code
// Past these sizes a hook is named for a person to read, not matched: few hand-written hooks come near them.
const SCAN_COMMAND = 10_000;
const SCAN_SCRIPT = 2 * 1024 * 1024;

const MAX_FILE = 8 * 1024 * 1024; // larger than any file read here; a device or an endless link is not a regular file
const read = (p) => {
  try {
    const s = statSync(p);
    return s.isFile() && s.size <= MAX_FILE ? readFileSync(p, 'utf8').replace(/^\uFEFF/, '') : null;
  } catch { return null; }
};
// Values printed in the report come from files other people may have written: show only plain ones.
const plain = (v) => (v === undefined || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^[\w.[\]-]{1,40}$/.test(v)) ? v : '(unusual value)');
// The same for a name or a path in the trust section: safe characters and no spaces, or a placeholder.
const label = (v) => (typeof v === 'string' && /^[\w.@:/~-]{1,100}$/.test(v) ? v : '(unusual name)');
// MCP arguments go to a helper on a full read: a value that looks like a key or follows a key's flag is hidden.
const SECRET_FLAG = /key|token|secret|pass|auth|bearer|credential/i;
// shortcut: a short secret after an ordinary flag (`-p hunter2`) still shows; the helper is told never to copy one.
const TOKEN = /^(sk-|ghp_|gho_|ghs_|ghu_|github_pat_|xox[a-z]-|AKIA|AIza|glpat-)|^[A-Za-z0-9+_=]{32,}$|^(?!\.{0,2}\/)(?=[^\d]{0,200}\d)(?=[^A-Za-z]{0,200}[A-Za-z])[A-Za-z0-9+/_=-]{32,}$|^eyJ[\w-]{8,200}\.|:\/\/[^/\s]{0,200}@|^[^\s/:@]{1,200}:[^\s/@]{1,200}@/;
const shownArgs = (args) => args.map((a, i) => {
  const pair = /^(-{1,2}[\w.-]{1,80})=(.*)$/s.exec(a);
  if (pair) return SECRET_FLAG.test(pair[1]) || TOKEN.test(pair[2]) ? `${pair[1]}=(hidden)` : label(a);
  if (TOKEN.test(a) || (i > 0 && /^-/.test(args[i - 1]) && SECRET_FLAG.test(args[i - 1]))) return '(hidden)';
  return label(a);
});
const positive = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);
const readJson = (p) => { try { return JSON.parse(read(p)); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const dirs = (p) => { try { return readdirSync(p).filter((n) => isDir(join(p, n))); } catch { return []; } };
const mdFiles = (p) => { try { return readdirSync(p).filter((n) => n.endsWith('.md')); } catch { return []; } };
const asList = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const hostOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
const fileSize = (p) => { try { const s = statSync(p); return s.isFile() ? s.size : null; } catch { return null; } };
// A path under the home folder starts with ~, and every path is shown with forward slashes.
const tilde = (p, home) => (p === home || p.startsWith(home + sep) ? `~${p.slice(home.length)}` : p).split('\\').join('/');

// The rules block between its markers, without trailing spaces, so an installed block compares with this version's.
const rulesBlock = (text) => {
  const i = typeof text === 'string' ? text.indexOf(START) : -1;
  const j = i < 0 ? -1 : text.indexOf(END, i);
  return j < 0 ? null : text.slice(i, j + END.length).split(/\r?\n/).map((l) => l.trimEnd()).join('\n');
};
const SHIPPED_RULES = rulesBlock(read(fileURLToPath(new URL('../RULES.md', import.meta.url))));

// The few YAML shapes a skill or agent header uses: `key: value`, quotes, `>` and `|` blocks, wrapped lines.
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '');
  const out = {};
  if (!m) return out;
  let key = null, block = null;
  for (const line of m[1].split(/\r?\n/)) {
    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (top) {
      key = top[1];
      block = /^[>|][+-]?$/.test(top[2]) ? top[2][0] : null;
      out[key] = block ? '' : top[2].trim();
    } else if (key && /^\s/.test(line)) {
      const part = line.trim();
      out[key] += (out[key] && part ? (block === '|' ? '\n' : ' ') : '') + part;
    }
  }
  for (const k of Object.keys(out)) {
    const q = /^(["'])([\s\S]*)\1$/.exec(out[k]);
    if (q) out[k] = q[2].replace(/\\(["'])/g, '$1');
  }
  return out;
}

function skillAt(dir, prefix = '') {
  const fm = frontmatter(read(join(dir, 'SKILL.md')));
  const name = prefix + (fm.name || dir.split(/[\\/]/).pop());
  const description = [fm.description, fm.when_to_use].filter(Boolean).join(' - ');
  return { name, description, hidden: fm['disable-model-invocation'] === 'true' };
}

// A folder is one skill (it holds SKILL.md) or a folder of skills.
function skillsIn(dir, prefix) {
  if (existsSync(join(dir, 'SKILL.md'))) return [skillAt(dir, prefix)];
  return dirs(dir).filter((n) => existsSync(join(dir, n, 'SKILL.md'))).map((n) => skillAt(join(dir, n), prefix));
}

function describedFiles(dir, prefix = '') {
  return mdFiles(dir).map((f) => {
    const fm = frontmatter(read(join(dir, f)));
    return { name: prefix + (fm.name || f.replace(/\.md$/, '')), description: fm.description || '' };
  });
}

function countHooks(config, into) {
  const events = config?.hooks ?? config ?? {};
  for (const [event, groups] of Object.entries(events)) {
    if (!Array.isArray(groups)) continue;
    const n = groups.reduce((sum, g) => sum + (Array.isArray(g?.hooks) ? g.hooks.length : 1), 0);
    into[event] = (into[event] ?? 0) + n;
  }
  return into;
}

// Every hook's command, from a plugin's hooks file or a settings file's `hooks`.
const hookCommands = (config) => Object.values(obj(config?.hooks) ?? obj(config) ?? {}).filter(Array.isArray).flat()
  .flatMap((g) => (Array.isArray(g?.hooks) ? g.hooks : [g])).map((h) => h?.command).filter((c) => typeof c === 'string');

// Script files a hook command names: `${CLAUDE_PLUGIN_ROOT}/x.sh`, `~/hooks/y.py`, `C:\hooks\z.ps1`, or a path
// relative to the plugin (or, for a settings hook, the project).
const SCRIPT = /(?:\$\{?CLAUDE_(?:PLUGIN_ROOT|PROJECT_DIR)\}?|~|[A-Za-z]:)?[\w.\\/-]{0,260}\.(?:sh|bash|zsh|js|mjs|cjs|ts|py|ps1|psm1|bat|cmd|rb|pl)\b/g;
const scriptsIn = (command, { root, project, home }) => [...new Set(command.match(SCRIPT) ?? [])].map((p) => {
  const path = p.replace(/^\$\{?CLAUDE_PLUGIN_ROOT\}?/, () => root ?? project).replace(/^\$\{?CLAUDE_PROJECT_DIR\}?/, () => project).replace(/^~(?=[\\/])/, () => home);
  return resolve(root ?? project, path);
});

// What an MCP server definition deserves a look for, or null.
function mcpRisk(def) {
  if (typeof def?.url === 'string') {
    const host = plain(hostOf(def.url));
    return `connects to ${host === '(unusual value)' ? 'a remote host' : host}: what you send it leaves this machine`;
  }
  const tool = (v) => String(v ?? '').split(/[\\/]/).pop().replace(/\.(cmd|exe)$/i, '').toLowerCase();
  if (typeof def?.command !== 'string') return null;
  // The package a runner at words[i] starts without a version, or null.
  const fresh = (words, i) => {
    let runner = tool(words[i]);
    if (VIA.get(runner)?.includes(words[i + 1])) [runner, i] = [runner === 'deno' ? 'deno' : 'npx', i + 1];
    if (!RUNNERS.includes(runner)) return null;
    let j = i + 1;
    while (j < words.length && words[j].startsWith('-')) j++;
    const pkg = words[j];
    // deno runs what it is given; only an address or a registry name is fetched at start.
    if (!pkg || (runner === 'deno' && !/^(https?:|npm:|jsr:)/.test(pkg))) return null;
    return /^(npm:|jsr:)?(@[^/@]+\/)?[^@=]+(@|==)\d/.test(pkg) ? null : pkg;
  };
  const words = [def.command, ...asList(def.args).filter((a) => typeof a === 'string')];
  // Behind a shell any word can start one: cmd /c npx -y <package>, bash -c "npm i && npx -y <package>".
  const shell = SHELLS.includes(tool(def.command));
  const split = shell ? words.flatMap((a) => a.split(/\s+/)).filter(Boolean) : words;
  for (let i = 0; i < (shell ? split.length : 1); i++) {
    const pkg = fresh(split, i);
    if (pkg) return `runs the newest version of ${label(pkg)} at every start`;
  }
  return null;
}

// Where a marketplace's plugins update from.
function originOf(src) {
  if (src?.source === 'github' && typeof src.repo === 'string') return `github ${label(src.repo)}`;
  if (typeof src?.url === 'string') {
    const at = /^(?:[a-z+]+:\/\/)?(?:[^@/]+@)?([^/:]+)[/:](.+?)(?:\.git)?\/?$/i.exec(src.url);
    return at ? label(`${at[1]}/${at[2]}`) : 'an address of its own';
  }
  return ['directory', 'file'].includes(src?.source) ? 'a folder on this machine' : 'unknown';
}

function pluginSource(id, root) {
  const manifest = readJson(join(root, '.claude-plugin', 'plugin.json')) ?? {};
  const plugin = id.split('@')[0];
  const under = (p) => (isAbsolute(p) ? p : join(root, p));
  const declared = (field, fallback) => [fallback, ...asList(manifest[field]).filter((p) => typeof p === 'string')].map(under);
  const unique = (items) => [...new Map(items.map((i) => [i.name, i])).values()];
  const hooks = {};
  const hookRuns = [];
  // The standard file loads besides what the manifest names, so both are read; a file named twice counts once.
  const specs = (field, fallback) => [...new Map([fallback, ...asList(manifest[field])].map((s) => [typeof s === 'string' ? under(s) : s, s])).values()];
  let hooksUnread = 0;
  for (const spec of specs('hooks', 'hooks/hooks.json')) {
    const config = typeof spec === 'string' ? readJson(under(spec)) : spec;
    if (!obj(config) && (spec !== 'hooks/hooks.json' || fileSize(under(spec)) !== null)) hooksUnread++;
    countHooks(config, hooks);
    hookRuns.push(...hookCommands(config));
  }
  // `mcpServers` may be a file, an inline map, or a list of both; a bundle or an address is not read here.
  // A list of [name, definition]: two files may each define a server of the same name.
  const servers = [];
  let mcpUnread = 0;
  for (const spec of specs('mcpServers', '.mcp.json')) {
    const config = typeof spec === 'string' ? readJson(under(spec)) : spec;
    const defs = obj(config) && 'mcpServers' in config ? obj(config.mcpServers) : obj(config); // a list there is not read
    if (defs) servers.push(...Object.entries(defs));
    else if (spec !== '.mcp.json' || fileSize(under(spec)) !== null) mcpUnread++;
  }
  return {
    id,
    root,
    label: `plugin ${label(id)}`,
    kind: 'plugin',
    skills: unique(declared('skills', 'skills').flatMap((d) => skillsIn(d, `${plugin}:`))),
    commands: unique(declared('commands', 'commands').flatMap((d) => describedFiles(d, `${plugin}:`))),
    agents: unique(declared('agents', 'agents').flatMap((d) => describedFiles(d, `${plugin}:`))),
    hooks,
    hookRuns,
    servers,
    mcpUnread,
    hooksUnread,
    mcp: servers.length,
  };
}

function folderSource(label, kind, claudeDir) {
  const skills = dirs(join(claudeDir, 'skills')).filter((n) => n !== 'synced').flatMap((n) => skillsIn(join(claudeDir, 'skills', n), ''));
  return { label, kind, skills, commands: describedFiles(join(claudeDir, 'commands')), agents: describedFiles(join(claudeDir, 'agents')), hooks: {}, mcp: 0 };
}

const merge = (...layers) => {
  const out = {};
  for (const layer of layers) {
    for (const [k, v] of Object.entries(layer ?? {})) {
      const both = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object';
      out[k] = both ? { ...out[k], ...v } : v;
    }
  }
  return out;
};

export function audit({ home = homedir(), project = process.cwd(), window = 200000, top } = {}) {
  home = resolve(home);
  project = resolve(project);
  const claude = join(home, '.claude');
  // The project and each folder above it, as Claude Code reads them. The filesystem root is not read; `top` keeps a
  // test inside its fixture.
  const stop = top === undefined ? null : resolve(top);
  const folders = [project];
  while (folders.at(-1) !== stop) {
    const up = dirname(folders.at(-1));
    if (dirname(up) === up) break;
    folders.push(up);
  }
  const settingsFiles = [join(claude, 'settings.json'), join(project, '.claude', 'settings.json'), join(project, '.claude', 'settings.local.json')];
  const layers = settingsFiles.map(readJson).map(obj);
  const settings = merge(...layers);
  const cap = positive(settings.skillListingMaxDescChars, DEFAULT_DESC_CAP);
  const overrides = settings.skillOverrides ?? {};
  // Claude Code gives the skill listing this share of the context window and shortens descriptions past it.
  const budget = Math.floor(window * CHARS_PER_TOKEN * positive(settings.skillListingBudgetFraction, 0.01));

  const sources = [];
  const installed = readJson(join(claude, 'plugins', 'installed_plugins.json'))?.plugins ?? {};
  for (const [id, installs] of Object.entries(installed)) {
    const entries = asList(installs).filter((i) => typeof i?.installPath === 'string' && i.installPath);
    const install = entries.find((i) => typeof i.projectPath === 'string' && resolve(i.projectPath) === project) ?? entries[0];
    if (!install) continue;
    const root = isAbsolute(install.installPath) ? install.installPath : join(claude, 'plugins', install.installPath);
    sources.push({ ...pluginSource(id, root), enabled: settings.enabledPlugins?.[id] === true });
  }
  sources.push({ ...folderSource('personal (~/.claude)', 'personal', claude), enabled: true });
  const syncedDir = join(claude, 'skills', 'synced'); // one folder per claude.ai account, each a folder of skills
  const synced = dirs(syncedDir).flatMap((d) => skillsIn(join(syncedDir, d), ''));
  if (synced.length) sources.push({ label: 'synced from claude.ai', kind: 'synced', skills: synced, commands: [], agents: [], hooks: {}, mcp: 0, enabled: true });
  if (project !== home) sources.push({ ...folderSource('project (.claude)', 'project', join(project, '.claude')), enabled: true });

  // What the model is sent for one skill: its name, and its description up to the cap.
  const listed = (s, kind) => {
    // A plugin's skills follow the plugin, not skillOverrides; synced skills are keyed `<source>:<name>`.
    const o = kind === 'plugin' ? undefined : overrides[s.name] ?? Object.entries(overrides).find(([k]) => k.endsWith(`:${s.name}`))?.[1];
    if (s.hidden || o === 'off' || o === 'user-invocable-only') return 0;
    return `- ${s.name}: `.length + (o === 'name-only' ? 0 : Math.min(s.description.length, cap)) + 1;
  };
  for (const s of sources) {
    s.skillChars = [...s.skills, ...s.commands].reduce((sum, x) => sum + listed(x, s.kind), 0);
    s.agentChars = s.agents.reduce((sum, a) => sum + `- ${a.name}: ${a.description}\n`.length, 0);
    s.chars = s.skillChars + s.agentChars;
    s.hookCount = Object.values(s.hooks).reduce((a, b) => a + b, 0);
  }
  // Hooks add up across settings files: a later file adds its own, it does not replace the earlier ones.
  const settingsHooks = layers.reduce((into, layer) => countHooks(layer?.hooks ?? {}, into), {});
  const on = sources.filter((s) => s.enabled);
  const plugins = on.filter((s) => s.kind === 'plugin');
  const hooks = {};
  for (const [event, n] of Object.entries(settingsHooks)) hooks[event] = { count: n, from: ['settings'] };
  for (const s of on) for (const [event, n] of Object.entries(s.hooks)) {
    hooks[event] ??= { count: 0, from: [] };
    hooks[event].count += n;
    hooks[event].from.push(s.label);
  }

  const instructionFiles = [join(claude, 'CLAUDE.md'), join(project, '.claude', 'CLAUDE.md'), ...folders.flatMap((d) => [join(d, 'CLAUDE.md'), join(d, 'CLAUDE.local.md')])]
    .filter((p, i, all) => all.indexOf(p) === i)
    .map((path) => ({ path, text: read(path) }))
    .filter((f) => f.text !== null)
    .map((f) => {
      const block = rulesBlock(f.text);
      return { path: f.path, chars: f.text.length, rules: block === null ? null : block === SHIPPED_RULES ? 'current' : 'differs' };
    });

  // Claude Code keeps the memory of the folder a session starts in, and the audit may run from a folder below it.
  const projectsDir = join(claude, 'projects');
  const known = dirs(projectsDir);
  const found = folders.map((folder) => {
    const slug = folder.replace(/[^A-Za-z0-9]/g, '-');
    const name = known.find((d) => d.toLowerCase() === slug.toLowerCase()) ?? slug;
    return { folder, text: read(join(projectsDir, name, 'memory', 'MEMORY.md')) };
  }).find((m) => m.text !== null);
  const memoryLines = found ? found.text.replace(/\r?\n$/, '').split(/\r?\n/) : [];
  const memoryOver = memoryLines.length > MEMORY_INDEX_LINES;
  const memory = found ? { lines: memoryLines.length, chars: memoryOver ? memoryLines.slice(0, MEMORY_INDEX_LINES).join('\n').length : found.text.length, over: memoryOver, folder: found.folder } : null;

  const userMcp = readJson(join(home, '.claude.json'));
  // Claude Code keys a project by its path, written with forward slashes on Windows too.
  const projectEntry = userMcp?.projects?.[project] ?? userMcp?.projects?.[project.split('\\').join('/')];
  const mcpSets = [['~/.claude.json', userMcp?.mcpServers], ['~/.claude.json (this project)', projectEntry?.mcpServers], ['.mcp.json', readJson(join(project, '.mcp.json'))?.mcpServers]]
    .map(([where, defs]) => [where, obj(defs) ?? {}, defs != null && !obj(defs)]);
  const mcpServers = mcpSets.reduce((sum, [, defs]) => sum + Object.keys(defs).length, 0) + on.reduce((sum, s) => sum + s.mcp, 0);

  // What deserves a look before you rely on it: hooks and the scripts they name, MCP servers, settings.
  const trust = [];
  // Every hook script and local MCP command found, for a full read by a helper on the user's yes (`--json` only).
  const reads = [];
  const toRead = new Set();
  const list = (item, key) => { if (!toRead.has(key)) { toRead.add(key); reads.push(item); } };
  // One line per place and finding, keyed by the real path: two files that print alike still get a line each.
  const seen = new Set();
  const flag = (where, says, key = where) => { if (!seen.has(`${key}\n${says}`)) { seen.add(`${key}\n${says}`); trust.push({ where, says }); } };
  const shown = (path, root) => (root && !relative(root, path).startsWith('..') ? relative(root, path) : tilde(path, home)).split('\\').join('/');
  const scan = (where, commands, root, what = 'hook command') => {
    for (const command of commands) {
      if (command.length > SCAN_COMMAND) { flag(where, `has a ${what} too long to check by pattern: read it before you rely on it`); continue; }
      for (const [says, re] of RISKS) if (re.test(command)) flag(where, says);
      for (const path of scriptsIn(command, { root, project, home })) {
        const at = `${where}, ${label(shown(path, root ?? project))}`;
        const bytes = fileSize(path);
        if (bytes === null) continue;
        list({ where, script: tilde(path, home), bytes }, path);
        if (bytes > SCAN_SCRIPT) { flag(at, 'is too large to check by pattern: read it before you rely on it', path); continue; }
        const text = read(path);
        if (text !== null) for (const [says, re] of RISKS) if (re.test(text)) flag(at, says, path);
      }
    }
  };
  const servers = (where, entries, root) => {
    for (const [i, [name, def]] of entries.entries()) {
      const at = `${where}, MCP server ${plain(name)}`;
      const says = mcpRisk(def);
      if (says) flag(at, says);
      if (typeof def?.command !== 'string') continue;
      const args = asList(def.args).map(String);
      scan(at, [[def.command, ...args].join(' ')], root, 'server command');
      list({ where: at, command: label(def.command), args: shownArgs(args) }, `${at}\n${i}`);
    }
  };
  for (const s of plugins) {
    scan(`plugin ${label(s.id)}`, s.hookRuns, s.root);
    servers(`plugin ${label(s.id)}`, s.servers, s.root);
    if (s.mcpUnread) flag(`plugin ${label(s.id)}`, 'has an MCP server file the check cannot read: read it before you rely on it');
    if (s.hooksUnread) flag(`plugin ${label(s.id)}`, 'has a hooks file the check cannot read: read it before you rely on it');
  }
  for (const [where, defs, unread] of mcpSets) {
    servers(where, Object.entries(defs));
    if (unread) flag(where, 'has an MCP server list the check cannot read: read it before you rely on it');
  }
  const settingsNames = ['~/.claude/settings.json', '.claude/settings.json', '.claude/settings.local.json'];
  layers.forEach((layer, i) => {
    if (!layer) return;
    const where = `settings ${settingsNames[i]}`;
    const commands = hookCommands(layer.hooks);
    scan(where, commands, null);
    const own = COMMANDS.map(([key, why]) => [key, key.split('.').reduce((o, k) => o?.[k], layer), why]).filter(([, c]) => typeof c === 'string' && c.trim());
    scan(where, own.map(([, c]) => c), null, 'settings command');
    if (typeof layer.env?.ANTHROPIC_BASE_URL === 'string' && layer.env.ANTHROPIC_BASE_URL.trim()) { // empty = not set
      const host = hostOf(layer.env.ANTHROPIC_BASE_URL);
      const to = plain(host);
      if (!/(^|\.)anthropic\.com$/i.test(host)) flag(where, `sends your requests to ${to === '(unusual value)' ? 'another server' : to}, not to Anthropic`);
    }
    if (layer.apiKeyHelper !== undefined) flag(where, 'runs a command to hand over your API key');
    if (layer.permissions?.defaultMode === 'bypassPermissions') flag(where, 'lets Claude run every command without asking');
    if (layer.enableAllProjectMcpServers === true) flag(where, 'starts every MCP server a project lists, without asking');
    if (i === 0) return; // the rest is about a project's own files, which arrive with a clone
    const it = commands.length === 1 ? 'it' : 'them';
    if (commands.length) flag(where, `runs ${commands.length} command${commands.length === 1 ? '' : 's'} on your machine as hooks: read ${it} unless you wrote ${it}`);
    const allow = asList(layer.permissions?.allow).map(String);
    if (allow.some((r) => /^Bash(\((\*|\*\*|:\*)\))?$/.test(r))) flag(where, 'lets Claude run any command without asking');
    for (const r of allow) {
      const m = r.length <= 300 ? WIDE.exec(r) : null;
      if (!m) continue;
      const name = m[1].toLowerCase();
      const base = name.replace(/\d+(\.\d+)*$/, '');
      const words = m[2].split(/\s+/).filter(Boolean);
      const flags = (from) => words.slice(from).every((w) => w.startsWith('-'));
      if ((OPEN.has(base) && flags(0)) || (VIA.get(base)?.includes(words[0]) && flags(1))) flag(where, `lets Claude run ${[name, ...words].join(' ')} with any arguments without asking: enough to run or send anything`);
    }
    for (const [key, , why] of own) if (key !== 'apiKeyHelper') flag(where, `runs a command on your machine ${why}: read it unless you wrote it`); // apiKeyHelper is named above
    // A project can add a marketplace and turn its plugins on; Claude Code then offers to install them.
    const turnedOn = new Map(); // plugins turned on, per marketplace, counted once
    for (const [id, v] of Object.entries(obj(layer.enabledPlugins) ?? {})) {
      const market = id.includes('@') ? id.slice(id.lastIndexOf('@') + 1) : null;
      if (v === true && market !== null) turnedOn.set(market, (turnedOn.get(market) ?? 0) + 1);
    }
    for (const [name, entry] of Object.entries(obj(layer.extraKnownMarketplaces) ?? {})) {
      const count = turnedOn.get(name) ?? 0;
      flag(where, `adds the plugin marketplace ${label(name)} (${originOf(obj(entry)?.source)})${count ? ` and turns on ${count} of its plugins` : ''}: plugins can run code on your machine, so read them before you install`);
    }
  });
  const markets = obj(readJson(join(claude, 'plugins', 'known_marketplaces.json'))) ?? {};
  const origins = [...new Set(plugins.map((s) => s.id.split('@').pop()))]
    .map((m) => ({ market: label(m), from: originOf(Object.hasOwn(markets, m) ? markets[m]?.source : undefined) }));

  const efforts = [...new Set([settings.effortLevel, ...Object.values(settings.modelSettings ?? {}).map((m) => m?.effortLevel)].filter(Boolean))];
  const current = (key) => (key === 'effortLevel' ? (efforts.length ? efforts.map(plain).join(', ') : undefined) : key.split('.').reduce((o, k) => o?.[k], settings));
  const levers = LEVERS.map((l) => ({ ...l, now: l.key === 'effortLevel' ? current(l.key) : plain(current(l.key)), applied: current(l.key) === l.fewturns }));

  const sum = (pick) => on.reduce((total, s) => total + pick(s), 0);
  const load = {
    skills: { count: sum((s) => s.skills.length + s.commands.length), raw: sum((s) => s.skillChars), chars: Math.min(sum((s) => s.skillChars), budget) },
    agents: { count: sum((s) => s.agents.length), chars: sum((s) => s.agentChars) },
    instructions: { count: instructionFiles.length, chars: instructionFiles.reduce((t, f) => t + f.chars, 0) },
    memory: { count: memory ? 1 : 0, chars: memory?.chars ?? 0 },
  };
  const chars = Object.values(load).reduce((t, part) => t + part.chars, 0);
  return {
    home, project, window, budget, cap, load, chars, tokens: Math.round(chars / CHARS_PER_TOKEN),
    sources: sources.map(({ label, kind, enabled, skills, commands, agents, hookCount, mcp, chars: c }) => ({ label, kind, enabled, skills: skills.length + commands.length, agents: agents.length, hooks: hookCount, mcp, chars: c }))
      .filter((s) => s.skills + s.agents + s.hooks + s.mcp > 0).sort((a, b) => b.chars - a.chars),
    hooks, mcpServers, instructionFiles, memory, levers, trust, reads, origins,
    rulesInstalled: instructionFiles.filter((f) => f.rules).map((f) => ({ path: f.path, current: f.rules === 'current' })),
    settingsRead: settingsFiles.filter((p, i) => layers[i]),
    settingsSkipped: settingsFiles.filter((p, i) => !layers[i] && existsSync(p)),
  };
}

const n = (v) => v.toLocaleString('en-US');
const tok = (chars) => n(Math.round(chars / CHARS_PER_TOKEN));

export function report(a) {
  const row = (label, detail, chars) => `  ${label.padEnd(19)}${detail.padEnd(38)}${n(chars).padStart(8)}${tok(chars).padStart(10)}`;
  const memory = a.memory && `${a.memory.lines} lines${a.memory.over ? ` (only ${MEMORY_INDEX_LINES} load)` : ''}${a.memory.folder !== a.project ? ', folder above' : ''}`;
  const out = [
    'FEWTURNS AUDIT - what every request carries (read-only: nothing sent, nothing written)',
    '',
    `FIXED LOAD, resent with every request${' '.repeat(21)}chars  ~ tokens`,
    row('Skill listing', `${a.load.skills.count} skills, cap ${n(a.cap)} per description`, a.load.skills.chars),
    row('Agent listing', `${a.load.agents.count} agents`, a.load.agents.chars),
    row('Instruction files', `${a.load.instructions.count} CLAUDE.md file${a.load.instructions.count === 1 ? '' : 's'}`, a.load.instructions.chars),
    row('Memory index', memory || 'none', a.load.memory.chars),
    row('Total you can trim', '', a.chars),
    `  Not counted: Claude Code's own prompt, tools and bundled skills; MCP tool definitions (${a.mcpServers} server${a.mcpServers === 1 ? '' : 's'}); what hooks print.`,
    a.load.skills.raw > a.budget
      ? `  ! The skill listing is ${n(a.load.skills.raw)} chars, over its budget of ${n(a.budget)}: descriptions are cut short to fit.`
      : `  The skill listing fits its budget of ${n(a.budget)} chars.`,
    `  (Budget for a ${n(a.window)}-token context window; pass --window 1000000 for a 1M window.)`,
    '',
    'SOURCES, heaviest first (chars before the budget)',
  ];
  for (const s of a.sources) {
    const parts = [[s.skills, 'skill'], [s.agents, 'agent'], [s.hooks, 'hook'], [s.mcp, 'MCP server']].filter(([c]) => c).map(([c, w]) => `${c} ${w}${c === 1 ? '' : 's'}`).join(', ');
    out.push(`  ${(s.enabled ? '' : '(off) ') + s.label}: ${parts} - ${n(s.chars)} chars${s.enabled ? '' : ' not loaded'}`);
  }
  const hookList = (title, keep) => {
    const list = Object.entries(a.hooks).filter(([e]) => keep(e));
    out.push('', title);
    if (!list.length) out.push('  none');
    for (const [event, h] of list) out.push(`  ${event}: ${h.count} (${h.from.join(', ')})`);
  };
  hookList('HOOKS THAT RUN ON EVERY PROMPT OR TOOL CALL', (e) => OFTEN.has(e));
  hookList('HOOKS THAT RUN AT SESSION START (what they print is resent with every request)', (e) => e === 'SessionStart');
  out.push('', 'TRUST - worth a look before you rely on it (a reason to read, not a verdict)');
  if (!a.trust.length) out.push('  nothing found in hooks, the scripts they name, MCP servers or settings');
  for (const t of a.trust) out.push(`  ! ${t.where}: ${t.says}`);
  if (a.origins.length) out.push(`  Plugins in use update from: ${a.origins.map((o) => `${o.market} (${o.from})`).join(', ')}`);
  out.push('', `LEVERS${' '.repeat(31)}now${' '.repeat(17)}fewturns`);
  for (const l of a.levers) out.push(`  ${l.key.padEnd(35)}${String(l.now ?? 'not set').padEnd(20)}${String(l.fewturns).padEnd(9)}${l.applied ? 'applied' : ''}`);
  const r = a.rulesInstalled;
  const files = `${r.length} file${r.length === 1 ? '' : 's'}`;
  const stale = r.filter((x) => !x.current).length;
  out.push(`  ${'working rules'.padEnd(35)}${!r.length ? 'not installed' : stale ? `installed, ${stale} of ${files} differ from this version: /fewturns rules updates them` : `installed, current (${files})`}`);
  const short = (p) => tilde(p, a.home);
  out.push('', `Settings read: ${a.settingsRead.length ? a.settingsRead.map(short).join(', ') : 'none found'}`);
  if (a.settingsSkipped.length) out.push(`! Skipped, not valid JSON: ${a.settingsSkipped.map(short).join(', ')}`);
  // Names and paths come from files on disk: keep control, invisible and direction characters out of the terminal.
  return out.join('\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const usage = 'usage: node audit.mjs [--json] [--window <tokens>] [--home <dir>] [--project <dir>]';
  const args = process.argv.slice(2);
  const opts = {};
  let json = false, help = false, bad = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--json') json = true;
    else if (arg === '--help' || arg === '-h') help = true;
    else if (['--window', '--home', '--project'].includes(arg) && args[i + 1] !== undefined && !args[i + 1].startsWith('--')) opts[arg.slice(2)] = args[++i];
    else bad ??= arg;
  }
  if (opts.window !== undefined) {
    opts.window = Number(opts.window);
    if (!(Number.isFinite(opts.window) && opts.window >= 1000)) bad ??= '--window';
  }
  if (help) {
    console.log(`${usage}\nReads local Claude Code files and prints what every request carries and what deserves a look. Changes nothing.`);
  } else if (bad) {
    console.error(`audit.mjs: cannot use ${bad}\n${usage}`);
    process.exitCode = 1;
  } else {
    const result = audit(opts);
    console.log(json ? JSON.stringify(result, null, 2) : report(result));
  }
}
