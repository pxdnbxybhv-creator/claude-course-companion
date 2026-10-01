// 水月幻镜 · m8 · the verify step after a returned tuning file was applied to the source (sandbox.md §7.3; acceptance
// A-S5). Only with TUNING=<file.json>:
//   node scripts/mirror-tuning.mjs apply file.json --write
//   TUNING=file.json npx vitest run tests/mirror-tuning-verify.test.ts
// Each change of the file holds in the tables, and every number the file does not name hashes exactly as it did at
// export (the file's build.rest), so the apply touched only what the owner asked for. Skipped without TUNING.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { verifyTuning } from '../src/views/mirror/ui/sand/io';

const env = (typeof process !== 'undefined' ? process.env : {}) as Record<string, string | undefined>;

describe.runIf(!!env.TUNING)('the applied tuning file (TUNING=)', () => {
  it('every change holds, and nothing else changed', () => {
    const r = verifyTuning(readFileSync(env.TUNING!, 'utf8'));
    for (const w of r.wrong) console.log(`NOT APPLIED ${w.path}: want ${String(w.want)}, now ${String(w.now)}`);
    if (r.rest.now !== r.rest.want) console.log(`OTHER NUMBERS MOVED: rest hash ${r.rest.now}, the file's ${r.rest.want}`);
    expect(r.wrong).toEqual([]);
    expect(r.rest.now).toBe(r.rest.want);
    expect(r.ok).toBe(true);
  });
});
