// 水月幻镜 · English text never falls back to Chinese stat or class names (an English player must be
// able to read every item, weapon and skill). Deliberate exceptions go in ALLOW with a reason.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as DATA from '../src/views/mirror/data';
import * as IDS from '../src/views/mirror/ids';

const CJK = /[㐀-鿿]/;
/** English strings allowed to keep hanzi (none today). */
const ALLOW: readonly string[] = [];

function walk(o: unknown, path: string, out: string[], depth = 0): void {
  if (!o || typeof o !== 'object' || depth > 7) return;
  const r = o as Record<string, unknown>;
  if (typeof r.en === 'string' && CJK.test(r.en) && !ALLOW.includes(r.en)) out.push(`${path}.en = ${r.en}`);
  for (const [k, v] of Object.entries(r)) {
    if (k === 'zh' || k === 'look') continue; // `look` is an art note for builders, never shown
    if (typeof v === 'string' && /En$/.test(k) && CJK.test(v) && !ALLOW.includes(v)) out.push(`${path}.${k} = ${v}`);
    else if (v && typeof v === 'object') walk(v, `${path}.${k}`, out, depth + 1);
  }
}

describe('mirror English text', () => {
  it('data/* and ids.ts carry no hanzi in their English strings', () => {
    const out: string[] = [];
    for (const [k, v] of Object.entries(DATA)) walk(v, `data.${k}`, out);
    for (const [k, v] of Object.entries(IDS)) walk(v, `ids.${k}`, out);
    expect(out).toEqual([]);
  });

  it("no t('中', 'en') / b('中', 'en') pair in the mirror's source has hanzi in its English half", () => {
    const root = join(__dirname, '../src/views/mirror');
    const pair = /\b(?:b|t)\(\s*'((?:[^'\\\n]|\\.)*)',\s*'((?:[^'\\\n]|\\.)*)'/g;
    const out: string[] = [];
    const scan = (dir: string): void => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) scan(p);
        else if (/\.tsx?$/.test(f)) {
          readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            for (const m of line.matchAll(pair)) {
              if (CJK.test(m[1]) && CJK.test(m[2]) && !ALLOW.includes(m[2])) out.push(`${p.slice(root.length + 1)}:${i + 1} ${m[2]}`);
            }
          });
        }
      }
    };
    scan(root);
    expect(out).toEqual([]);
  });
});
