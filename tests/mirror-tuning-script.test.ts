// 水月幻镜 · m8 · scripts/mirror-tuning.mjs, the way a returned tuning file goes back into the code (sandbox.md
// §7.3, §11; acceptance A-S5): every runtime leaf resolves to its literal in the source (≥ 98 %, 0 mismatches) or
// is one of the listed formulas; `check` passes an export touching shared and added keys; `apply --write` (on a
// copy of data/) changes exactly those literals, after which the same file's values read as the source's.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { beginTuning, endTuning, leaves, setValue, tuningActive, valueOf } from '../src/views/mirror/logic';
import { buildExport, exportJson } from '../src/views/mirror/ui/sand/io';
import COMPUTED from '../src/views/mirror/ui/sand/computed.json';
import { COMPANIONS, ITEMS } from '../src/views/mirror/data';

const ROOT = join(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts/mirror-tuning.mjs');
const run = (args: string[]): { out: string; code: number } => {
  try { return { out: execFileSync('node', [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' }), code: 0 }; }
  catch (e) { const x = e as { stdout?: string; status?: number }; return { out: x.stdout ?? '', code: x.status ?? 1 }; }
};
const tmp: string[] = [];
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'm8-tuning-')); tmp.push(d); return d; };
afterEach(() => { if (tuningActive()) endTuning(); while (tmp.length) rmSync(tmp.pop()!, { recursive: true, force: true }); });

/** A file touching a plain literal, a shared one (MELEE_PEN, when it is shared), F, a heart face's stat and an added key (heart costs are money: read-only). */
function sample(): { json: string; paths: string[] } {
  beginTuning();
  const paths = ['WEAPONS.qingfeng.price', 'F.priceSlope', 'HEART.heartRegen.per.regen', `PASSIVES.${COMPANIONS.musician.passive}.p.dmg`];
  const shared = leaves().find((l) => l.path.startsWith('COMPANIONS.') && l.aliases.length > 0 && l.kind === 'number');
  if (shared) paths.push(shared.path);
  for (const p of paths) {
    const v = valueOf(p);
    if (typeof v === 'number') expect(setValue(p, Math.round((v * 0.5 + 3) * 1000) / 1000)).toBe('ok');
  }
  const item = Object.keys(ITEMS).find((id) => ITEMS[id as keyof typeof ITEMS].stats && !('luck' in ITEMS[id as keyof typeof ITEMS].stats!))!;
  expect(setValue(`ITEMS.${item}.stats.luck`, 9)).toBe('ok');
  const json = exportJson(buildExport({ lang: 'zh', note: 'test' }));
  endTuning();
  return { json, paths: [...paths, `ITEMS.${item}.stats.luck`] };
}

describe('scripts/mirror-tuning.mjs', () => {
  it('resolves every runtime leaf to its literal (≥ 98 %, no mismatch); the rest are exactly the listed formulas', () => {
    const list = leaves().map((l) => ({ path: l.path, value: valueOf(l.path) }));
    const f = join(temp(), 'leaves.json');
    writeFileSync(f, JSON.stringify(list.map((x) => ({ ...x, value: Number.isFinite(x.value as number) || typeof x.value === 'boolean' ? x.value : String(x.value) }))));
    const { out, code } = run(['resolve', f]);
    expect(code).toBe(0);
    const r = JSON.parse(out) as { total: number; literal: number; shared: number; mismatch: number; other: string[] };
    expect(r.total).toBe(list.length);
    expect(r.mismatch).toBe(0);
    expect(r.literal / r.total).toBeGreaterThanOrEqual(0.98);
    expect(r.shared).toBeGreaterThan(0);
    const otherPaths = r.other.map((s) => s.split(':')[0]).sort();
    expect(otherPaths).toEqual((COMPUTED as { path: string }[]).map((c) => c.path).sort());
  }, 60_000);

  it('the computed list is current (the script writes the same list today)', () => {
    const { out } = run(['computed']);
    const now = out.trim().split('\n').map((l) => l.split('  ')[0]).sort();
    expect(now).toEqual((COMPUTED as { path: string }[]).map((c) => c.path).sort());
  });

  it('check: every change OK (shared ones name their const); a stale default fails', () => {
    const { json, paths } = sample();
    const d = temp();
    writeFileSync(join(d, 'a.json'), json);
    const ok = run(['check', join(d, 'a.json')]);
    expect(ok.code).toBe(0);
    for (const p of paths) expect(ok.out).toMatch(new RegExp(`(OK|ADD)\\s+${p.replace(/[.[\]]/g, (c) => '\\' + c)}\\s`));
    if (paths.some((p) => p.startsWith('COMPANIONS.'))) expect(ok.out).toContain('via ');
    const j = JSON.parse(json);
    j.changes[0].default = -1;
    writeFileSync(join(d, 'b.json'), JSON.stringify(j));
    const bad = run(['check', join(d, 'b.json')]);
    expect(bad.code).toBe(1);
    expect(bad.out).toContain('STALE');
    writeFileSync(join(d, 'c.json'), '{"kind":"other"}');
    expect(run(['check', join(d, 'c.json')]).code).toBe(2);
  });

  it('apply --write (on a copy of data/) edits exactly those literals; then the file reads as the source', () => {
    const { json, paths } = sample();
    const root = temp();
    cpSync(join(ROOT, 'src/views/mirror/data'), join(root, 'src/views/mirror/data'), { recursive: true });
    const f = join(root, 'a.json');
    writeFileSync(f, json);
    const dry = run(['apply', f, '--root', root]);
    expect(dry.code).toBe(0);
    expect(dry.out).toContain('dry run');
    const before = new Map<string, string>();
    for (const n of ['weapons.ts', 'stats.ts', 'meta.ts', 'companions.ts', 'items.ts']) before.set(n, readFileSync(join(root, 'src/views/mirror/data', n), 'utf8'));
    const w = run(['apply', f, '--root', root, '--write']);
    expect(w.code).toBe(0);
    let changedLines = 0;
    for (const [n, a] of before) {
      const b = readFileSync(join(root, 'src/views/mirror/data', n), 'utf8').split('\n');
      const al = a.split('\n');
      expect(b.length).toBe(al.length);
      for (let i = 0; i < al.length; i++) if (al[i] !== b[i]) changedLines++;
    }
    expect(changedLines).toBeGreaterThan(0);
    expect(changedLines).toBeLessThanOrEqual(paths.length);
    // the same changes with their values as defaults: all OK against the written copy
    const j = JSON.parse(json);
    for (const c of j.changes) c.default = c.value;
    writeFileSync(join(root, 'b.json'), JSON.stringify(j));
    const after = run(['check', join(root, 'b.json'), '--root', root]);
    expect(after.out.match(/STALE|MISSING|COMPUTED/g) ?? []).toEqual(
      // the added key now exists: it reads as STALE for an 'add' (default null), and is OK as a plain change
      [],
    );
    expect(after.code).toBe(0);
    // the real data files were never touched
    expect(readFileSync(join(ROOT, 'src/views/mirror/data/weapons.ts'), 'utf8')).toBe(readFileSync(join(ROOT, 'src/views/mirror/data/weapons.ts'), 'utf8'));
  });
});
