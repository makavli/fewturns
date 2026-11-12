#!/usr/bin/env node
// Draws the README's pictures as SVG, light and dark, from the demo's numbers, so a picture never quotes a guess.
//
//   node tools/figures.mjs           write assets/*.svg
//   node tools/figures.mjs --check   fail if a committed picture differs from what this would write
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFTEN } from '../skills/fewturns/scripts/audit.mjs';
import { demo } from './demo.mjs';

const THEMES = {
  light: { surface: '#fcfcfb', border: 'rgba(11,11,11,0.10)', ink: '#0b0b0b', ink2: '#52514e', muted: '#898781', grid: '#e1e0d9', neutral: '#f0efec', series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'], onSeries: ['#ffffff', '#ffffff', '#ffffff', '#0b0b0b'] },
  dark: { surface: '#1a1a19', border: 'rgba(255,255,255,0.10)', ink: '#f0efec', ink2: '#c3c2b7', muted: '#898781', grid: '#2c2c2a', neutral: '#383835', series: ['#3987e5', '#d95926', '#199e70', '#c98500'], onSeries: ['#ffffff', '#ffffff', '#ffffff', '#ffffff'] },
};
// The four parts of the fixed load the audit counts keep one colour each in every picture.
const PARTS = [['skills', 'Skill listing'], ['agents', 'Agent listing'], ['instructions', 'Instruction files'], ['memory', 'Memory index']];
const W = 880;
const n = (v) => v.toLocaleString('en-US');
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;');

function svg(t, height, title, desc, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" role="img" aria-labelledby="t d" font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<rect x="0.5" y="0.5" width="${W - 1}" height="${height - 1}" rx="16" fill="${t.surface}" stroke="${t.border}"/>
${body.trim()}
</svg>
`;
}
const text = (x, y, s, { size = 15, fill, weight = 400, anchor = 'start' } = {}) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

function hero(t) {
  const bars = [44, 30, 18].map((w, i) => `<rect x="82" y="${83 + i * 16}" width="${w}" height="8" rx="4" fill="#ffffff"/>`).join('\n');
  return svg(t, 232, 'Fewturns', 'Fewturns. Waiting is free. Requests are not. A Claude Code skill that trims what every request carries and the number of requests a task takes. It collects nothing.', `
<rect x="64" y="64" width="80" height="80" rx="18" fill="${t.series[0]}"/>
${bars}
${text(172, 112, 'Fewturns', { size: 60, weight: 650, fill: t.ink })}
${text(174, 146, 'Waiting is free. Requests are not.', { size: 24, fill: t.ink2 })}
${text(64, 184, 'A Claude Code skill that trims what every request carries, and the requests a task takes.', { size: 16, fill: t.ink2 })}
${text(64, 208, 'One skill. No hooks. Nothing collected, nothing sent.', { size: 16, fill: t.muted })}`);
}

function request(t) {
  const x = 64, w = 380;
  const blocks = [
    { label: "Claude Code's own prompt and tools", h: 40, fill: t.neutral, ink: t.ink2 },
    { label: 'Skill listing', h: 40, fill: t.series[0], ink: t.onSeries[0] },
    { label: 'Agent listing', h: 40, fill: t.series[1], ink: t.onSeries[1] },
    { label: 'Instruction files (CLAUDE.md)', h: 40, fill: t.series[2], ink: t.onSeries[2] },
    { label: 'Memory index', h: 40, fill: t.series[3], ink: t.onSeries[3] },
    { label: 'MCP tool definitions, hook output', h: 40, fill: t.neutral, ink: t.ink2 },
    { label: 'The conversation so far', h: 72, fill: t.neutral, ink: t.ink2 },
    { label: 'Your new message', h: 32, fill: 'none', ink: t.ink, stroke: t.ink2 },
  ];
  let y = 92;
  const drawn = blocks.map((b) => {
    const out = `<rect x="${x}" y="${y}" width="${w}" height="${b.h}" rx="6" fill="${b.fill}"${b.stroke ? ` stroke="${b.stroke}"` : ''}/>\n${text(x + 16, y + b.h / 2 + 5, b.label, { fill: b.ink, weight: 500 })}`;
    b.y = y;
    y += b.h + 6;
    return out;
  }).join('\n');
  const bracket = (from, to, lines) => {
    const top = blocks[from].y, bottom = blocks[to].y + blocks[to].h, bx = x + w + 20, mid = (top + bottom) / 2;
    const path = `<path d="M${bx} ${top + 2} h10 V${bottom - 2} h-10 M${bx + 10} ${mid} h14" fill="none" stroke="${t.muted}" stroke-width="1"/>`;
    return path + lines.map((l, i) => text(bx + 34, mid - (lines.length - 1) * 11 + i * 22 + 5, l.s, { fill: l.strong ? t.ink : t.ink2, weight: l.strong ? 600 : 400 })).join('\n');
  };
  return svg(t, y + 44, 'What every request carries', 'A request, top to bottom: Claude Code\'s own prompt and tools; then the fixed load, resent with every request, which Fewturns trims in settings: the skill listing, the agent listing, instruction files, the memory index, MCP tool definitions and hook output; then the conversation so far, which grows with every step and which the working rules keep short; and last, your new message. Not to scale.', `
${text(64, 52, 'What every request carries', { size: 22, weight: 650, fill: t.ink })}
${text(64, 74, 'Your message is the small part. The rest is sent again each time.', { fill: t.ink2 })}
${drawn}
${bracket(0, 0, [{ s: 'Not yours to trim' }])}
${bracket(1, 5, [{ s: 'The fixed load', strong: true }, { s: 'Resent with every request.' }, { s: '/fewturns trim cuts it in settings.' }])}
${bracket(6, 6, [{ s: 'Grows with every step', strong: true }, { s: 'The working rules keep the steps few.' }])}
${text(64, y + 16, 'Not to scale.', { size: 13, fill: t.muted })}`);
}

function beforeAfter(t, { before, after }) {
  const x = 64, max = 620, scale = max / before.chars;
  const often = (a) => Object.entries(a.hooks).filter(([e]) => OFTEN.has(e)).reduce((sum, [, h]) => sum + h.count, 0);
  const bar = (a, y) => {
    let bx = x;
    return PARTS.map(([key], i) => {
      const chars = a.load[key].chars;
      if (!chars) return '';
      const w = chars * scale - 2;
      const label = n(Math.round(chars / 4));
      const out = `<rect x="${bx.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="28" rx="4" fill="${t.series[i]}"/>` + (w > label.length * 8 + 20 ? text((bx + 10).toFixed(1), y + 19, label, { size: 13, weight: 600, fill: t.onSeries[i] }) : '');
      bx += w + 2;
      return out;
    }).join('\n');
  };
  const row = (a, y, name) => `${text(x, y - 10, name, { fill: t.ink2 })}\n${bar(a, y)}\n${text(x + a.chars * scale + 14, y + 20, `${n(a.tokens)} tokens`, { size: 17, weight: 650, fill: t.ink })}`;
  let lx = x;
  const legend = PARTS.map(([, name], i) => {
    const out = `<rect x="${lx}" y="232" width="12" height="12" rx="3" fill="${t.series[i]}"/>${text(lx + 18, 243, name, { size: 13, fill: t.ink2 })}`;
    lx += 18 + name.length * 7.2 + 24;
    return out;
  }).join('\n');
  const tile = (tx, label, from, to) => `${text(tx, 300, label, { size: 13, fill: t.ink2 })}\n${text(tx, 330, `${from}  →  ${to}`, { size: 22, weight: 650, fill: t.ink })}`;
  const cut = (a) => (a.load.skills.raw > a.budget ? 'Yes' : 'No');
  return svg(t, 396, 'The fixed load before and after /fewturns trim', `Fixed load on every request for a made-up setup with three plugins. Before: about ${n(before.tokens)} tokens. After /fewturns trim: about ${n(after.tokens)} tokens. Hooks on every prompt or tool call: ${often(before)} before, ${often(after)} after. MCP servers: ${before.mcpServers} before, ${after.mcpServers} after. Skill descriptions cut short to fit the budget: ${cut(before)} before, ${cut(after)} after.`, `
${text(64, 52, 'The fixed load, before and after', { size: 22, weight: 650, fill: t.ink })}
${text(64, 74, 'A made-up setup with three plugins. Tokens resent with every request.', { fill: t.ink2 })}
${row(before, 118, 'Before')}
${row(after, 180, 'After /fewturns trim')}
${legend}
<line x1="64" y1="268" x2="${W - 64}" y2="268" stroke="${t.grid}"/>
${tile(64, 'Hooks on every prompt or tool call', often(before), often(after))}
${tile(340, 'MCP servers', before.mcpServers, after.mcpServers)}
${tile(520, 'Skill descriptions cut short to fit', cut(before), cut(after))}
${text(64, 372, 'An estimate (characters / 4) of the test fixture, not a benchmark. Reproduce it: node tools/demo.mjs', { size: 13, fill: t.muted })}`);
}

function waiting(t) {
  const x0 = 240, per = 78, minutes = 6;
  const px = (m) => x0 + m * per;
  const grid = [0, 2, 4, 6].map((m) => `<line x1="${px(m)}" y1="104" x2="${px(m)}" y2="222" stroke="${t.grid}"/>${text(px(m), 244, m === 0 ? 'start' : `${m} min`, { size: 13, fill: t.muted, anchor: 'middle' })}`).join('\n');
  const dot = (m, y) => `<circle cx="${px(m)}" cy="${y}" r="6" fill="${t.series[0]}" stroke="${t.surface}" stroke-width="2"/>`;
  const row = (y, name, sub, at, count) => `${text(64, y - 2, name, { weight: 600, fill: t.ink })}\n${text(64, y + 18, sub, { size: 13, fill: t.ink2 })}
<line x1="${px(0)}" y1="${y}" x2="${px(minutes)}" y2="${y}" stroke="${t.grid}" stroke-width="2" stroke-linecap="round"/>
${at.map((m) => dot(m, y)).join('')}
${text(px(minutes) + 28, y + 6, count, { size: 17, weight: 650, fill: t.ink })}`;
  const polls = Array.from({ length: 12 }, (_, i) => (i + 1) / 2);
  return svg(t, 300, 'Waiting is free, requests are not', 'A six-minute build, two ways to wait. Checking every 30 seconds takes 12 requests. Running the build in the foreground and waiting takes 1 request, when it returns. Every request carries the whole context again.', `
${text(64, 52, 'Waiting is free. Requests are not.', { size: 22, weight: 650, fill: t.ink })}
${text(64, 74, 'A six-minute build, two ways to wait. Each dot is a request that carries the whole context again.', { fill: t.ink2 })}
${grid}
${row(134, 'Polling', 'a check every 30 seconds', polls, '12 requests')}
${row(194, 'One wait', 'foreground, long timeout', [minutes], '1 request')}
${text(64, 278, 'The wait itself costs nothing: no tokens are spent while a command runs.', { size: 13, fill: t.muted })}`);
}

export function figures() {
  const data = demo();
  const out = {};
  for (const [mode, t] of Object.entries(THEMES)) {
    out[`hero-${mode}.svg`] = hero(t);
    out[`request-${mode}.svg`] = request(t);
    out[`before-after-${mode}.svg`] = beforeAfter(t, data);
    out[`waiting-${mode}.svg`] = waiting(t);
  }
  return out;
}

const assets = fileURLToPath(new URL('../assets/', import.meta.url));
if (process.argv.includes('--check')) {
  const stale = Object.entries(figures()).filter(([name, body]) => { try { return readFileSync(join(assets, name), 'utf8') !== body; } catch { return true; } }).map(([name]) => name);
  if (stale.length) { console.error(`stale pictures: ${stale.join(', ')} (run: node tools/figures.mjs)`); process.exit(1); }
  console.log('pictures are up to date');
} else if (process.argv[1]?.endsWith('figures.mjs')) {
  mkdirSync(assets, { recursive: true });
  for (const [name, body] of Object.entries(figures())) writeFileSync(join(assets, name), body);
  console.log(`wrote ${Object.keys(THEMES).length * 4} pictures to assets/`);
}
