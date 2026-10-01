#!/usr/bin/env node
// 水月幻镜 · m8 · the 模拟场's tuning file back into the code (sandbox.md §7.3). No build: the data files are
// parsed with rolldown's oxc parser (`rolldown/parseAst`) and edited with magic-string, both already in
// node_modules. A path (WEAPONS.qingfeng.dmg[2], F.bossK["10"]) is followed from the table's top-level const
// through property keys, array indexes, same-file consts (MELEE_PEN, C3) and spreads, down to a number literal.
//
//   node scripts/mirror-tuning.mjs print    file.json            a grouped table: file:line · label · path · default → value
//   node scripts/mirror-tuning.mjs check    file.json            each change: OK / STALE / COMPUTED / MISSING (exit 1 if any is not OK)
//   node scripts/mirror-tuning.mjs apply    file.json [--write]  dry run by default (the line diffs); --write edits the data files
//   node scripts/mirror-tuning.mjs computed [--write]            the leaves the source writes as a formula (r1(10 * W20), 1 / 6,
//                                                                 Infinity): printed, or written to src/views/mirror/ui/sand/computed.json
// Options: --root <dir> reads and writes the data files under <dir>/src/views/mirror/data (a copy, for tests).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
const ROOT = resolvePath(opt('--root') ?? join(HERE, '..'));
const DATA = join(ROOT, 'src/views/mirror/data');
const { parseAst } = await import('rolldown/parseAst');
const MagicString = (await import('magic-string')).default;

/** Each tunable table's source file (logic/tuning.ts TUNABLE). PAY and REVIVE are never here. */
export const FILE = {
  COMPANIONS: 'companions.ts', SKILLS: 'companions.ts', PASSIVES: 'companions.ts', WEAPONS: 'weapons.ts', SETS: 'weapons.ts', ITEMS: 'items.ts',
  MONSTERS: 'monsters.ts', ELITES: 'monsters.ts', TREASURES: 'monsters.ts', BOSSES: 'bosses.ts', ENDLESS_BOSS: 'bosses.ts', MAPS: 'maps.ts',
  HAZARDS: 'maps.ts', DIFFS: 'difficulty.ts', VOWS: 'difficulty.ts', MUTATORS: 'difficulty.ts', AFFIXES: 'difficulty.ts', HEART: 'meta.ts',
  TERM_MODS: 'meta.ts', CARD_STATS: 'stats.ts', MASTERY: 'stats.ts', F: 'stats.ts', CLAMP: 'stats.ts', BASE_STATS: 'stats.ts',
};

const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file);
  const code = readFileSync(join(DATA, file), 'utf8');
  const ast = parseAst(code, { lang: 'ts' }, file);
  const consts = new Map();
  for (const st of ast.body) {
    const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (decl?.type === 'VariableDeclaration') for (const d of decl.declarations) if (d.id.type === 'Identifier' && d.init) consts.set(d.id.name, d.init);
  }
  const lines = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') lines.push(i + 1);
  const r = { file, code, ast, consts, lines, ms: new MagicString(code) };
  cache.set(file, r);
  return r;
}
const lineOf = (f, pos) => { let lo = 0, hi = f.lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (f.lines[m] <= pos) lo = m; else hi = m - 1; } return lo + 1; };
const unwrap = (n) => {
  while (n && ['TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'ParenthesizedExpression', 'TSNonNullExpression'].includes(n.type)) n = n.expression;
  return n;
};
export function parsePath(p) {
  const segs = [];
  const re = /([A-Za-z_$][\w$]*)|\[(\d+)\]|\[("(?:[^"\\]|\\.)*")\]/g;
  let m;
  while ((m = re.exec(p))) segs.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? +m[2] : JSON.parse(m[3]));
  return segs;
}
const IDENT = /^[A-Za-z_$][\w$]*$/;
const fmtPath = (s) => s.map((x, i) => (typeof x === 'number' ? `[${x}]` : i === 0 ? x : IDENT.test(x) ? `.${x}` : `[${JSON.stringify(x)}]`)).join('');
function follow(f, n, via) {
  n = unwrap(n);
  const seen = new Set();
  while (n?.type === 'Identifier' && f.consts.has(n.name) && !seen.has(n.name)) { seen.add(n.name); via = [...via, n.name]; n = unwrap(f.consts.get(n.name)); }
  return { node: n, via };
}
function elems(f, arr, via) {
  const out = [];
  for (const e of arr.elements) {
    if (e?.type === 'SpreadElement') {
      const s = follow(f, e.argument, via);
      if (s.node?.type !== 'ArrayExpression') return null;
      const inner = elems(f, s.node, s.via);
      if (!inner) return null;
      out.push(...inner);
    } else out.push({ node: e, via });
  }
  return out;
}
const keyName = (p) => (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'Literal' ? String(p.key.value) : null);
function props(f, obj, via) {
  // later keys win, as in the object at runtime; spreads first contribute theirs
  const out = new Map();
  for (const p of obj.properties) {
    if (p.type === 'SpreadElement') {
      const s = follow(f, p.argument, via);
      if (s.node?.type === 'ObjectExpression') for (const [k, v] of props(f, s.node, s.via)) out.set(k, v);
    } else if (p.type === 'Property') { const k = keyName(p); if (k !== null) out.set(k, { node: p.value, via, prop: p }); }
  }
  return out;
}
const numLit = (n) => (n?.type === 'Literal' && (typeof n.value === 'number' || typeof n.value === 'boolean')) ? n.value
  : (n?.type === 'UnaryExpression' && n.operator === '-' && n.argument?.type === 'Literal' && typeof n.argument.value === 'number') ? -n.argument.value : undefined;

/** Where a path lives in the source: { ok, kind: 'literal' | <node type>, value, file, line, start, end, text, via } or { ok: false, why }. */
export function find(path) {
  const segs = parsePath(path);
  const file = FILE[segs[0]];
  if (!file) return { ok: false, why: 'no such table' };
  const f = load(file);
  if (!f.consts.has(segs[0])) return { ok: false, why: 'no const', file };
  let cur = follow(f, f.consts.get(segs[0]), [segs[0]]);
  let host = null; // the object a missing last key would be added to
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    const n = cur.node;
    if (n?.type === 'ObjectExpression') {
      const hit = props(f, n, cur.via).get(String(s));
      if (!hit) return { ok: false, why: `key ${s} not found`, file, host: i === segs.length - 1 ? { f, node: n } : null };
      cur = follow(f, hit.node, hit.via);
    } else if (n?.type === 'ArrayExpression') {
      const es = elems(f, n, cur.via);
      if (!es) return { ok: false, why: 'an unresolvable spread', file };
      const e = es[s];
      if (!e) return { ok: false, why: `index ${s} out of range`, file };
      cur = follow(f, e.node, e.via);
    } else return { ok: false, kind: n?.type ?? 'none', why: `a ${n?.type ?? 'nothing'} before ${s}`, file, line: n ? lineOf(f, n.start) : 0, text: n ? f.code.slice(n.start, n.end) : '' };
    void host;
  }
  const n = cur.node;
  if (!n) return { ok: false, why: 'nothing there', file };
  const value = numLit(n);
  return { ok: value !== undefined, kind: value !== undefined ? 'literal' : n.type, value, file, line: lineOf(f, n.start), start: n.start, end: n.end, text: f.code.slice(n.start, n.end), via: cur.via, f };
}

/** Every leaf the source writes as something other than a number literal (a formula, a shared name for a number). */
function computed() {
  const out = [];
  const skip = new Set(['Literal', 'TemplateLiteral', 'ArrowFunctionExpression', 'FunctionExpression', 'ObjectExpression', 'ArrayExpression']);
  const walk = (f, n, segs, via, seen) => {
    const r = follow(f, n, via);
    n = r.node;
    if (!n) return;
    if (numLit(n) !== undefined) return;
    if (n.type === 'ObjectExpression') {
      if (seen.has(n)) return;
      seen.add(n);
      for (const [k, v] of props(f, n, r.via)) walk(f, v.node, [...segs, k], v.via, seen);
      return;
    }
    if (n.type === 'ArrayExpression') {
      if (seen.has(n)) return;
      seen.add(n);
      (elems(f, n, r.via) ?? []).forEach((e, i) => walk(f, e.node, [...segs, i], e.via, seen));
      return;
    }
    if (skip.has(n.type)) return;
    if (n.type === 'Identifier' && n.name !== 'Infinity' && n.name !== 'NaN') return; // an id or an imported table, not a number
    if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === 'b') return; // a {zh, en} text
    out.push({ path: fmtPath(segs), file: f.file, line: lineOf(f, n.start), text: f.code.slice(n.start, n.end).replace(/\s+/g, ' ').slice(0, 80) });
  };
  for (const [table, file] of Object.entries(FILE)) {
    const f = load(file);
    if (f.consts.has(table)) walk(f, f.consts.get(table), [table], [table], new Set());
  }
  return out;
}

function readFileArg() {
  const p = argv.find((a, i) => i > 0 && !a.startsWith('--') && argv[i - 1] !== '--root');
  if (!p) { console.error('give the tuning file: node scripts/mirror-tuning.mjs <mode> file.json'); process.exit(2); }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  if (j.kind !== 'banmu-mirror-tuning' || !(j.v <= 1)) { console.error('not a 模拟场 tuning file (kind / v)'); process.exit(2); }
  return j;
}
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Object.is(a, b) || Math.abs(a - b) < 1e-12 : a === b);

const mode = argv[0];
if (mode === 'resolve') {
  // (tests) a JSON list of { path, value } from the runtime tables: how many resolve to the same literal
  const list = JSON.parse(readFileSync(argv[1], 'utf8'));
  let literal = 0, mismatch = 0, shared = 0;
  const other = [];
  for (const { path, value } of list) {
    const r = find(path);
    if (r.ok) { literal++; if (r.via.length > 1) shared++; if (!same(r.value, value)) { mismatch++; other.push(`MISMATCH ${path}: source ${r.text}, runtime ${value}`); } }
    else other.push(`${path}: ${r.kind ?? ''} ${r.why ?? ''} ${r.text ?? ''}`.trim());
  }
  console.log(JSON.stringify({ total: list.length, literal, shared, mismatch, other }));
} else if (mode === 'print' || mode === 'check' || mode === 'apply') {
  const j = readFileArg();
  const write = argv.includes('--write');
  if (j.note) console.log(`note: ${j.note}`);
  if (mode === 'print' && j.sheet?.stats?.length) console.log(`sheet (本局临时, not data): ${j.sheet.stats.map((s) => `${s.id} ${s.mode === 'set' ? '=' : '+'}${s.v}`).join(', ')}`);
  if (mode === 'print' && j.session) console.log(`session: ${JSON.stringify(j.session)}`);
  let bad = 0;
  const rows = [];
  for (const c of j.changes ?? []) {
    const r = find(c.path);
    const label = c.zh ?? c.path;
    if (c.default === null) {
      // a StatId key the sandbox added to a StatMods map: appended to that object literal
      const segs = parsePath(c.path);
      const key = segs.at(-1);
      const obj = find(fmtPath(segs.slice(0, -1)));
      if (r.ok) { rows.push(['STALE', c.path, `${r.file}:${r.line} the key exists already (${r.text})`]); bad++; continue; }
      if (obj.kind !== 'ObjectExpression') { rows.push(['MISSING', c.path, obj.why ?? `the map is a ${obj.kind}: add it by hand`]); bad++; continue; }
      const before = obj.text.slice(0, -1).trimEnd();
      const sep = before.endsWith('{') ? ' ' : before.endsWith(',') ? ' ' : ', ';
      const tail = before.endsWith('{') ? ' ' : '';
      rows.push(['ADD', c.path, `${obj.file}:${obj.line}  + ${key}: ${c.value}  「${label}」`]);
      if (mode === 'apply') obj.f.ms.appendLeft(obj.start + before.length, `${sep}${key}: ${c.value}${tail}`);
      continue;
    }
    if (!r.ok) {
      const k = r.kind && r.kind !== 'none' && r.text !== undefined && r.line ? 'COMPUTED' : 'MISSING';
      rows.push([k, c.path, k === 'COMPUTED' ? `${r.file}:${r.line} ${r.text} → wanted ${c.value}` : r.why]);
      bad++;
      continue;
    }
    const stale = !same(r.value, c.default);
    if (stale) bad++;
    const via = r.via.length > 1 ? `  (via ${r.via.slice(1).join(' → ')}${c.aliases?.length ? `: also ${c.aliases.join(', ')}` : ''})` : '';
    rows.push([stale ? 'STALE' : 'OK', c.path, `${r.file}:${r.line}  ${r.text} → ${c.value}${stale ? `  (the file's default was ${c.default})` : ''}${via}  「${label}」`]);
    if (mode === 'apply' && !stale) r.f.ms.overwrite(r.start, r.end, String(c.value));
  }
  for (const [k, p, d] of rows) console.log(`${k.padEnd(8)} ${p}  ${d}`);
  if (mode === 'apply') {
    for (const f of cache.values()) {
      if (!f.ms.hasChanged()) continue;
      const a = f.code.split('\n'), b = f.ms.toString().split('\n');
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) console.log(`--- ${f.file}:${i + 1}\n- ${(a[i] ?? '').trim().slice(0, 160)}\n+ ${(b[i] ?? '').trim().slice(0, 160)}`);
      if (write) writeFileSync(join(DATA, f.file), f.ms.toString());
    }
    console.log(write ? 'written.' : 'dry run: add --write to edit the files.');
  }
  console.log(`${rows.length} changes · ${rows.filter((r) => r[0] === 'OK' || r[0] === 'ADD').length} ready · ${bad} need a hand`);
  if (mode === 'check' && bad) process.exit(1);
} else if (mode === 'computed') {
  const list = computed();
  if (argv.includes('--write')) {
    const out = join(ROOT, 'src/views/mirror/ui/sand/computed.json');
    writeFileSync(out, JSON.stringify(list.map((x) => ({ path: x.path, src: `${x.file}:${x.line}`, text: x.text })), null, 1) + '\n');
    console.log(`${list.length} computed leaves → ${out}`);
  } else for (const x of list) console.log(`${x.path}  ${x.file}:${x.line}  ${x.text}`);
} else {
  console.log('modes: print | check | apply [--write] | computed [--write]  (file.json; --root <dir>)');
  process.exit(mode ? 2 : 0);
}
