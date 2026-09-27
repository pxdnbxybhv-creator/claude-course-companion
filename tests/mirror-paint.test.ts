// 水月幻镜 · the painter and the mirror's audio, in node: every atlas id has a painter whose canvas
// covers every mark it makes, the bake plans cover what a run needs (倒悬's 4th phase too), numbers
// abbreviate exactly like the HUD (fmtBig), the two music themes pass the music invariants in every
// map colour, every sound effect renders, and the limiter never starves a cue under hit spam.
// (The pixel check — no ink on a sprite canvas's border — runs in the lab: scene=mirror-atlas&clip=1.)
import { describe, expect, it } from 'vitest';
import { allAtlasIds, createPainter, specOf, abbrev } from '../src/views/mirror/paint';
import { B, extentOf } from '../src/views/mirror/paint/kit';
import { fmtBig } from '../src/views/mirror/logic/formulas';
import { Limiter } from '../src/views/mirror/audio/limiter';
import { BOSS_REG, DROP_REG, ELITE_REG, FX_REG, ITEM_REG, MONSTER_REG, PROJ_REG, SUMMON_REG, TREASURE_REG, WEAPON_REG, COMPANION_REG } from '../src/views/mirror/ids';
import type { AtlasId, RunSave } from '../src/views/mirror/types';
import { THEMES, arrange, phraseSeconds, setMirrorColour, type MirrorColour } from '../src/audio/music-themes';
import { Composer, gongPc } from '../src/audio/music-theory';
import { makeRng } from '../src/core/rng';
import { renderVoice, renderPickup, SFX_NAMES, SFX_MIX, gongHz } from '../src/views/mirror/audio/voices';

describe('atlas coverage', () => {
  const ids = allAtlasIds();
  it('lists every entity the arena draws', () => {
    const n = COMPANION_REG.length + MONSTER_REG.length + TREASURE_REG.length + ELITE_REG.length + BOSS_REG.length * 4 + 4
      + WEAPON_REG.length + ITEM_REG.length + SUMMON_REG.length + PROJ_REG.length + DROP_REG.length + FX_REG.length
      + 8; // 水中月's reflections: boss:moonwater:1:m0 … m7
    expect(ids.length).toBe(n);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id has a painter, and its canvas covers every mark (stroke ± w/2, dots, known flat marks)', () => {
    const out: string[] = [];
    const TOL = 1;
    for (const id of ids) {
      const sp = specOf(id, 'guan');
      expect(sp, id).toBeTruthy();
      const { spec } = sp!;
      for (let v = 0; v < (spec.n ?? 1); v++) {
        const b = new B(7);
        spec.paint(b, v);
        expect(b.ops.length, id).toBeGreaterThan(0);
        const [x0, y0, x1, y1] = extentOf(spec, v, 7);
        expect([x0, y0, x1, y1].every(Number.isFinite), id).toBe(true);
        let ex = 0;
        const over = (ax: number, ay: number, bx: number, by: number) => { ex = Math.max(ex, x0 - TOL - ax, bx - (x1 + TOL), y0 - TOL - ay, by - (y1 + TOL)); };
        for (const op of b.ops) {
          if (op.k === 'fn') { if (op.bb) over(...op.bb); continue; }
          const closed = op.s.kind === 'fill' || op.s.kind === 'wash';
          for (const p of op.s.pts) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w), id).toBe(true);
            const r = closed ? 0 : p.w / 2;
            over(p.x - r, p.y - r, p.x + r, p.y + r);
          }
        }
        if (ex > 0) out.push(`${id} v${v} +${ex.toFixed(1)}`);
        // the canvas grows for marks near the edge, not for a box that is wrong: at most 2× per side
        const [bx0, by0, bx1, by1] = spec.box;
        const bw = bx1 - bx0, bh = by1 - by0;
        if (x1 - x0 > bw * 2 + 8 || y1 - y0 > bh * 2 + 8) out.push(`${id} v${v} extent ${(x1 - x0).toFixed(0)}×${(y1 - y0).toFixed(0)} vs box ${bw}×${bh}`);
      }
    }
    expect(out).toEqual([]);
  });

  it('a square fill reaches past its corners by the brush smoothing (Catmull-Rom bulge ≈ side / 8)', () => {
    const spec = { box: [-20, -20, 20, 20] as const, paint: (b: B) => { b.fill('#000', [[-20, -20], [20, -20], [20, 20], [-20, 20]], 0.9, 0.2); } };
    const [x0, , x1] = extentOf(spec, 0);
    expect(x1).toBeGreaterThanOrEqual(20 + 40 / 8);
    expect(x0).toBeLessThanOrEqual(-20 - 40 / 8);
  });

  it('frames: companions 4, monsters 3, the coin spins in 4', () => {
    expect(specOf('char:cat')!.spec.n).toBe(4);
    expect(specOf('mon:blot')!.spec.n).toBe(3);
    expect(specOf('elite:tiger')!.spec.n).toBe(3);
    expect(specOf('drop:cashCoin')!.spec.n).toBe(4);
    expect(specOf('boss:mirrorself:2', 'cat')!.ghost).toBe(true);
    expect(specOf('mon:nope')).toBeNull();
  });
});

describe('bake plans', () => {
  const run = (o: Partial<RunSave>) => ({ char: 'poet', map: 'lake', wave: 0, weapons: [], ...o }) as unknown as RunSave;
  it('start: the companion, the map roster, gear, drops and effects — not the other maps', () => {
    const p = createPainter('lake', 'mid', 2);
    const ids = new Set(p.plan(run({}), 'start'));
    expect(ids.has('char:poet')).toBe(true);
    for (const m of MONSTER_REG) expect(ids.has(`mon:${m.id}` as AtlasId), m.id).toBe(m.map === 'all' || m.map === 'lake');
    expect(ids.has('elite:turtle')).toBe(true);
    expect(ids.has('elite:tiger')).toBe(false);
    expect(ids.has('mon:pixiu')).toBe(true);
    for (const d of DROP_REG) expect(ids.has(`drop:${d.id}` as AtlasId)).toBe(true);
    for (const f of FX_REG) expect(ids.has(`fx:${f.id}` as AtlasId)).toBe(true);
    expect([...ids].some((i) => i.startsWith('boss:'))).toBe(false);
  });
  it('boss: the next boss in the wave-9/19/29 shop; a resume near a boss bakes it too', () => {
    const p = createPainter('forest', 'mid', 2);
    expect(p.plan(run({ map: 'forest', wave: 9 }), 'boss')).toEqual(['boss:kui:0', 'boss:kui:1', 'boss:kui:2']);
    expect(p.plan(run({ map: 'forest', wave: 19 }), 'boss')).toEqual(['boss:fox:0', 'boss:fox:1', 'boss:fox:2']);
    expect(p.plan(run({ map: 'forest', wave: 29 }), 'start')).toContain('boss:xingtian:2');
    expect(p.plan(run({ map: 'forest', wave: 49 }), 'boss')).toContain('boss:mirrorself:0');
  });
  it('倒悬: bosses gain a 4th phase sprite; without the vow phase 3 is not baked', () => {
    const p = createPainter('lake', 'mid', 2);
    expect(p.plan(run({ map: 'lake', wave: 9, vows: { daoxuan: 1 } } as Partial<RunSave>), 'boss')).toEqual(['boss:carp:0', 'boss:carp:1', 'boss:carp:2', 'boss:carp:3']);
    expect(p.plan(run({ map: 'lake', wave: 9, vows: {} } as Partial<RunSave>), 'boss')).not.toContain('boss:carp:3');
    expect(p.plan(run({ map: 'lake', wave: 49, vows: { daoxuan: 1 } } as Partial<RunSave>), 'boss')).toContain('boss:mirrorself:3');
    expect(p.plan(run({ map: 'lake', wave: 30, vows: { daoxuan: 2 } } as Partial<RunSave>), 'endless')).toContain('boss:moonwater:3');
    // every phase-3 id has a painter
    for (const b of BOSS_REG) expect(specOf(`boss:${b.id}:3`), b.id).toBeTruthy();
    // 水中月's reflections wear their own moon phase; a variant falls back to its phase look
    for (let m = 0; m < 8; m++) expect(specOf(`boss:moonwater:1:m${m}`)).toBeTruthy();
    expect(specOf('boss:carp:1:m2')).toBeNull();
    expect(p.plan(run({ map: 'lake', wave: 29 }), 'boss')).toContain('boss:moonwater:1:m4');
    // unbaked, sprite() of phase 3 falls back to phase 2 (both null here: nothing is baked in node)
    expect(p.has('boss:carp:3' as AtlasId)).toBe(p.has('boss:carp:2' as AtlasId));
  });
  it('endless: every roster and 镜主', () => {
    const p = createPainter('palace', 'low', 3);
    const ids = new Set(p.plan(run({ map: 'palace', wave: 30 }), 'endless'));
    expect(ids.has('mon:tadpole')).toBe(true);
    expect(ids.has('mon:rat')).toBe(true);
    expect(ids.has('boss:mirrorself:1')).toBe(true);
    // every quality draws at the screen's resolution (up to 3): the old low cap of 1.5 stretched a DPR-3 phone 2×
    expect(p.dpr).toBe(3);
  });
});

describe('numbers', () => {
  it('abbreviates exactly like the HUD and the shop (fmtBig)', () => {
    const r = makeRng(5);
    const vals = [0, 1, 999, 9999, 10000, 15500, 19999, 20000, 99999, 123456, 999999, 1e6, 2.5e6, 1.26e8, 3.456e9, -12345];
    for (let i = 0; i < 400; i++) vals.push(Math.round(Math.pow(10, r() * 11)));
    for (const v of vals) for (const lang of ['zh', 'en'] as const) expect(abbrev(v, lang), `${v} ${lang}`).toBe(fmtBig(v, lang));
    expect(abbrev(15500, 'zh')).toBe('1.6万');
    expect(abbrev(2.5e6, 'en')).toBe('2.5m');
  });
  it('the damage-number strip has every glyph fmtBig can produce', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('../src/views/mirror/paint/numbers.ts', import.meta.url), 'utf8');
    const glyphs = /const GLYPHS = '([^']+)'/.exec(src)![1];
    const r = makeRng(9);
    for (let i = 0; i < 400; i++) for (const lang of ['zh', 'en'] as const) {
      const t = '+' + fmtBig(Math.round(Math.pow(10, r() * 12)), lang);
      for (const ch of t) expect(glyphs.includes(ch), `${t}: ${ch}`).toBe(true);
    }
  });
});

describe('the mirror music', () => {
  for (const colour of ['lake', 'forest', 'palace'] as MirrorColour[]) {
    it(`${colour}: both themes arrange bounded layers with a melody, 宫 on F`, () => {
      setMirrorColour(colour);
      for (const id of ['mirror', 'mirror-boss'] as const) {
        const spec = THEMES[id];
        for (const m of spec.style.modes) expect(gongPc(m)).toBe(5);
        const c = new Composer(spec.style, 31);
        const r = makeRng(9);
        let insts = new Set<string>();
        for (let i = 0; i < 8; i++) {
          const p = c.next();
          const evs = arrange(id, p, r, 7 + i);
          expect(evs.some((e) => e.prio === 0), `${colour} ${id}`).toBe(true);
          for (const e of evs) {
            expect(e.t).toBeGreaterThanOrEqual(0);
            expect(e.t).toBeLessThan(phraseSeconds(p) + 1);
            expect(e.gain).toBeGreaterThan(0);
            expect(e.gain).toBeLessThanOrEqual(1);
            insts.add(e.inst);
          }
        }
        if (id === 'mirror-boss') expect(insts.has('drum')).toBe(true);
        insts = new Set();
      }
      expect(THEMES['mirror-boss'].style.bpm[0]).toBeGreaterThanOrEqual(THEMES.mirror.style.bpm[0]);
    });
  }
  it('each map has its own colour', () => {
    setMirrorColour('lake'); const lake = THEMES.mirror.style;
    setMirrorColour('palace'); const palace = THEMES.mirror.style;
    setMirrorColour('lake');
    expect(lake).not.toBe(palace);
    expect(lake.bpm).toEqual([118, 126]);
    expect(palace.bpm).toEqual([126, 132]);
  });
});

describe('the mirror sound effects', () => {
  const sr = 16000;
  it('every voice renders cleanly and briefly', () => {
    for (const name of SFX_NAMES) {
      const chans = renderVoice(name, sr);
      expect(chans.length, name).toBeGreaterThanOrEqual(1);
      for (const x of chans) {
        let peak = 0;
        for (const v of x) { expect(Number.isFinite(v)).toBe(true); peak = Math.max(peak, Math.abs(v)); }
        expect(peak, name).toBeGreaterThan(0.01);
        expect(peak, name).toBeLessThan(0.95);
        expect(x.length / sr, name).toBeLessThan(name === 'bell' || name === 'phaseBreak' ? 10 : 3.5);
      }
      expect(SFX_MIX[name].cap).toBeGreaterThanOrEqual(1);
    }
  }, 20000); // ≈ 3.3 s alone; several times that when the suite runs in parallel
  it('the limiter: 200 frames of hit spam never starve a cue; hits stay within 4 per 50 ms', () => {
    const lim = new Limiter();
    const cues = SFX_NAMES.filter((n) => !SFX_MIX[n].spam);
    expect(cues).toEqual(expect.arrayContaining(['coin', 'levelUp', 'hurt', 'gong', 'bossDrum', 'phaseBreak', 'shatter', 'beatTick', 'crate', 'dodge']));
    const spam = SFX_NAMES.filter((n) => SFX_MIX[n].spam);
    expect(spam).toEqual(expect.arrayContaining(['hitMelee', 'hitShot', 'kill']));
    const starts: number[] = [];
    let asked = 0, played = 0, kills = 0;
    for (let f = 0; f < 200; f++) {
      const now = f * 0.016;
      const cueFirst = f % 20 === 5, cueLast = f % 20 === 15;
      const cue = cues[Math.floor(f / 10) % cues.length];
      const tryCue = () => { asked++; if (lim.allow(cue, SFX_MIX[cue].cap, false, now)) played++; };
      if (cueFirst) tryCue();
      for (let i = 0; i < 6; i++) if (lim.allow('hitMelee', SFX_MIX.hitMelee.cap, true, now)) starts.push(now);
      for (let i = 0; i < 3; i++) if (lim.allow('hitShot', SFX_MIX.hitShot.cap, true, now)) starts.push(now);
      if (lim.allow('kill', SFX_MIX.kill.cap, true, now)) { starts.push(now); kills++; }
      if (cueLast) tryCue();
      // the 2 Hz beat of 琴师 / 夔
      if (f % 31 === 0) { asked++; if (lim.allow('beatTick', 1, false, now)) played++; }
    }
    expect(played).toBe(asked);
    // fairness: the kill after 9 hits in a frame still sounds
    expect(kills).toBeGreaterThanOrEqual(40); // one per 50 ms window, i.e. every burst
    for (let i = 4; i < starts.length; i++) expect(starts[i] - starts[i - 4]).toBeGreaterThanOrEqual(0.05 - 1e-9);
    expect(starts.length).toBeGreaterThan(100);
    // a kind's own cap still holds for cues
    const l2 = new Limiter();
    expect(l2.allow('coin', 2, false, 1)).toBe(true);
    expect(l2.allow('coin', 2, false, 1.01)).toBe(true);
    expect(l2.allow('coin', 2, false, 1.02)).toBe(false);
    expect(l2.allow('coin', 2, false, 1.06)).toBe(true);
  });
  it('pitched voices keep near their pitch (jitter well under a semitone); unpitched ones vary', async () => {
    const { JITTER, PITCHED_JITTER } = await import('../src/views/mirror/audio/voices');
    expect(PITCHED_JITTER).toBeLessThanOrEqual(0.01);
    expect(JITTER).toBeGreaterThan(0.03);
    for (const n of ['coin', 'coinTen', 'levelUp', 'bell', 'crate', 'merge', 'ritualGlint', 'pickup', 'crit'] as const) expect(SFX_MIX[n].pitched, n).toBe(true);
    for (const n of ['hitMelee', 'hitShot', 'kill', 'dodge', 'hurt', 'beatTick', 'uiTap'] as const) expect(SFX_MIX[n].pitched, n).toBeFalsy();
  });
  it('pickups climb the F pentatonic', () => {
    expect(gongHz(0)).toBeCloseTo(349.23, 1);
    expect(gongHz(5)).toBeCloseTo(698.46, 1);
    expect(gongHz(1) / gongHz(0)).toBeCloseTo(Math.pow(2, 2 / 12), 4);
    for (let d = 0; d < 10; d++) expect(renderPickup(sr, d).length).toBeGreaterThan(100);
  });
});
