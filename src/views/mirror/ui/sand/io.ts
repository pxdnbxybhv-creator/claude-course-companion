// 水月幻镜 · m8 · the 模拟场's tuning file (sandbox.md §7): export only what differs, import it back (checked
// path by path), and the browser's ways to hand a file over (hostSave → download → the copy sheet). SANDBOX
// owns it. The file goes back into the code with scripts/mirror-tuning.mjs (print · check · apply).
import { hostSave } from '../../../../app/hostSave';
import { RUN_VER, type RunSave } from '../../types';
import { beginTuning, changes, dataHash, defaultOf, isStatMapKey, leafOf, parsePath, setValue, valueOf } from '../../logic';
import { leafLabel } from './labels';
import type { SandMeasure, SandSession, SandWave } from './session';
import COMPUTED from './computed.json';

export const TUNING_KIND = 'banmu-mirror-tuning';
export const TUNING_V = 1;
const COMPUTED_SET = new Set<string>((COMPUTED as { path: string }[]).map((x) => x.path));
/** Is this leaf a formula in the source (r1(10 * W20), 1 / 6, Infinity)? Its edit is applied by hand. */
export const isComputed = (path: string) => COMPUTED_SET.has(path);

export interface FileChange {
  path: string;
  file: string;
  /** null: a key the sandbox added to a StatMods map. */
  default: number | boolean | null;
  value: number | boolean | null;
  zh: string;
  en: string;
  aliases: string[];
  source: 'literal' | 'computed';
}
export interface TuningFile {
  kind: typeof TUNING_KIND;
  v: number;
  exportedAt: string;
  build: { run: number; data: string; rest: string };
  lang: 'zh' | 'en';
  note: string;
  changes: FileChange[];
  sheet?: { note: string; char: string; stats: { id: string; mode: 'add' | 'set'; v: number }[] };
  session?: Record<string, unknown>;
  log?: readonly SandWave[];
  /** 测 DPS windows (context). */
  measure?: readonly SandMeasure[];
}

/** A plain label for a path: the table, the entity's name, then the rest of the path (S5's labels refine it). */
export function labelOf(path: string): { zh: string; en: string } {
  const s = parsePath(path) ?? [path];
  const wave = (row: number) => { const v = valueOf(`${String(s[0])}.${String(s[1])}[${row}][0]`); return typeof v === 'number' ? v : undefined; };
  return { zh: leafLabel(s, (zh) => zh, wave), en: leafLabel(s, (_zh, en) => en, wave) };
}

const pad = (n: number) => String(n).padStart(2, '0');
/** mirror-tuning-YYYYMMDD-HHMM.json (local time). */
export function fileName(now = new Date()): string {
  return `mirror-tuning-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.json`;
}
/** The local time with its offset: 2026-09-30T21:05:00+08:00. */
export function localIso(now = new Date()): string {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** The export: only the values that differ from their defaults (tuning must be on), plus the run's context. */
export function buildExport(o: { note?: string; lang: 'zh' | 'en'; sess?: SandSession | null; now?: Date }): TuningFile {
  const ch = changes();
  const out: FileChange[] = ch.map((c) => {
    const l = labelOf(c.path);
    return { path: c.path, file: c.file, default: c.default, value: c.value, zh: l.zh, en: l.en, aliases: c.aliases, source: isComputed(c.path) ? 'computed' : 'literal' };
  });
  const f: TuningFile = {
    kind: TUNING_KIND, v: TUNING_V, exportedAt: localIso(o.now), build: { run: RUN_VER, data: dataHash(), rest: dataHash({ except: ch.map((c) => c.path) }) },
    lang: o.lang, note: o.note ?? '', changes: out,
  };
  const s = o.sess;
  if (s) {
    const run: RunSave = s.run();
    f.sheet = { note: '本局临时加减，不是数值表', char: run.char, stats: s.sheet().map((r) => ({ id: r.id, mode: r.mode, v: r.v })) };
    const st = s.setup;
    f.session = {
      char: st.char, map: st.map, diff: st.diff, vows: st.vows, wave: st.wave, seed: st.seed, heart: st.heart, mastery: st.mastery, pool: st.pool,
      build: st.build, arch: st.arch, enemy: s.enemy(), tools: s.tools(),
      now: { wave: run.wave, weapons: run.weapons.map((w) => `${w.id}${w.t}`), items: run.items, moon: Math.round(run.moon), lvl: run.lvl },
    };
    f.log = s.log();
    if (s.measures().length) f.measure = s.measures();
  }
  return f;
}
export const exportJson = (f: TuningFile) => JSON.stringify(f, null, 1);

export type ImportCheck =
  | { ok: true; file: TuningFile; usable: FileChange[]; missing: FileChange[]; stale: FileChange[]; /** read-only paths (不能改) */ ro: FileChange[]; /** a value of the wrong type */ bad: FileChange[] }
  | { ok: false; reason: 'json' | 'kind' | 'version' };
const same = (a: unknown, b: unknown) => Object.is(a, b) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-12);
/**
 * Read a tuning file (a file's text or a paste) and sort its changes: usable (the path exists and its default
 * still matches the tables), missing (no such path) and stale (the default has changed since the export).
 */
export function checkImport(text: string): ImportCheck {
  let j: TuningFile;
  try { j = JSON.parse(text) as TuningFile; } catch { return { ok: false, reason: 'json' }; }
  if (!j || typeof j !== 'object' || j.kind !== TUNING_KIND || !Array.isArray(j.changes)) return { ok: false, reason: 'kind' };
  if (!(typeof j.v === 'number' && j.v <= TUNING_V)) return { ok: false, reason: 'version' };
  const usable: FileChange[] = [], missing: FileChange[] = [], stale: FileChange[] = [], ro: FileChange[] = [], bad: FileChange[] = [];
  for (const c of j.changes) {
    if (!c || typeof c.path !== 'string' || !parsePath(c.path)) { missing.push(c); continue; }
    const leaf = leafOf(c.path);
    const statKey = !leaf && isStatMapKey(c.path);
    if (!leaf && !statKey) { missing.push(c); continue; }
    if (leaf?.ro) { ro.push(c); continue; }
    const v = c.value;
    // null means 「absent」: only a stat in a StatMods map can be absent; anything else of the wrong type is a bad value
    const typeOk = v === null ? isStatMapKey(c.path)
      : leaf ? (leaf.kind === 'boolean' ? typeof v === 'boolean' : typeof v === 'number' && Number.isFinite(v))
      : typeof v === 'number' && Number.isFinite(v);
    if (!typeOk) { bad.push(c); continue; }
    const d = defaultOf(c.path);
    if (!same(d ?? null, c.default ?? null)) { stale.push(c); continue; }
    usable.push(c);
  }
  return { ok: true, file: j, usable, missing, stale, ro, bad };
}
/** Apply the usable changes (inside tuning only). Returns how many took. */
export function applyImport(usable: readonly FileChange[]): number {
  let n = 0;
  for (const c of usable) if (setValue(c.path, c.value) === 'ok') n++;
  return n;
}
/** The value a path has now (for the import sheet's lists). */
export const nowOf = (path: string) => valueOf(path);

/**
 * TUNING= for a sweep (tests/mirror-realbal.test.ts): enter tuning and apply a file's usable changes. The caller
 * restores with endTuning() after playing. Throws on a file that isn't a tuning file.
 */
export function applyTuningText(text: string): { applied: number; missing: string[]; stale: string[] } {
  const r = checkImport(text);
  if (!r.ok) throw new Error(`TUNING: not a 模拟场 tuning file (${r.reason})`);
  beginTuning();
  return { applied: applyImport(r.usable), missing: r.missing.map((c) => String(c?.path)), stale: r.stale.map((c) => String(c?.path)) };
}

/**
 * The verify step after `apply --write` (tests/mirror-tuning-verify.test.ts, sandbox.md §7.3): every change of the
 * file holds in the tables as they are now, and everything the file does not name hashes as it did at export
 * (`build.rest`, the export's hash without those paths). Computed leaves are edited by hand and are checked too.
 */
export function verifyTuning(text: string): { ok: boolean; held: number; wrong: { path: string; want: unknown; now: unknown }[]; rest: { want: string; now: string } } {
  const j = JSON.parse(text) as TuningFile;
  if (!j || j.kind !== TUNING_KIND || !Array.isArray(j.changes)) throw new Error('TUNING: not a 模拟场 tuning file');
  const wrong: { path: string; want: unknown; now: unknown }[] = [];
  let held = 0;
  for (const c of j.changes) {
    const now = valueOf(c.path);
    const want = c.value === null ? undefined : c.value;
    if (same(now, want)) held++; else wrong.push({ path: c.path, want, now });
  }
  const now = dataHash({ except: j.changes.map((c) => c.path), live: true });
  const want = j.build?.rest ?? '';
  return { ok: wrong.length === 0 && now === want, held, wrong, rest: { want, now } };
}

// ───────────────────────────────────────────── handing the file over (Settings' order, sandbox.md §7.2)
/** Inside a host page (an iframe): scripted downloads are blocked there, or dropped without a word. */
export function isEmbedded(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}
/** May this page write to the clipboard? A host page's permissions policy can forbid it. */
export function clipboardAllowed(): boolean {
  type Policy = { allowsFeature(feature: string): boolean };
  const d = document as Document & { permissionsPolicy?: Policy; featurePolicy?: Policy };
  try { const p = d.permissionsPolicy ?? d.featurePolicy; return !p || p.allowsFeature('clipboard-write'); } catch { return true; }
}
function download(blob: Blob, name: string): void {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch { /* embedded or blocked */ }
}
/**
 * Save the file: the host's downloads first ('saved' / 'declined'); embedded without it, the copy sheet
 * ('copy'); on a phone the share sheet when it takes files ('shared'); else a scripted download ('download').
 */
export async function saveTuning(name: string, json: string): Promise<'saved' | 'declined' | 'copy' | 'shared' | 'download'> {
  const r = await hostSave(name, json);
  if (r === 'saved' || r === 'declined') return r;
  if (isEmbedded()) return 'copy';
  try {
    const coarse = matchMedia('(pointer: coarse)').matches;
    const file = new File([json], name, { type: 'application/json' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (coarse && nav.share && nav.canShare?.({ files: [file] })) { await nav.share({ files: [file] }); return 'shared'; }
  } catch { /* fall through to a download */ }
  download(new Blob([json], { type: 'application/json' }), name);
  return 'download';
}
/** Copy the text; false when the clipboard is not allowed (open the copy sheet instead). */
export async function copyTuning(json: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText || !clipboardAllowed()) return false;
    await navigator.clipboard.writeText(json);
    return true;
  } catch { return false; }
}

// ───────────────────────────────────────────── the per-device draft (sandbox.md §5.2: a viewer convenience)
/** The one storage key the sandbox writes: the table edits and the note, never part of a backup. */
export const DRAFT_KEY = 'banmu.mirror.sand.v1';
export interface SandDraft { v: 1; changes: { path: string; value: number | boolean | null }[]; note: string }
/** Keep the current table edits for the next visit (try/catch: private windows, blocked storage). */
export function saveDraft(note = ''): void {
  try {
    const d: SandDraft = { v: 1, changes: changes().map((c) => ({ path: c.path, value: c.value })), note };
    if (!d.changes.length && !note) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch { /* no storage */ }
}
export function loadDraft(): SandDraft | null {
  try {
    const j = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as SandDraft | null;
    return j && j.v === 1 && Array.isArray(j.changes) ? j : null;
  } catch { return null; }
}
export function clearDraft(): void { try { localStorage.removeItem(DRAFT_KEY); } catch { /* no storage */ } }
/** Re-apply a draft (inside tuning only): the paths that still exist take their values. */
export function applyDraft(d: SandDraft): number {
  let n = 0;
  for (const c of d.changes) if (typeof c.path === 'string' && setValue(c.path, c.value) === 'ok') n++;
  return n;
}
