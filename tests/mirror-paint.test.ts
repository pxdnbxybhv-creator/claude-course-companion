// 水月幻镜 · the painter and the mirror's audio, in node: every atlas id has a painter whose strokes
// stay inside its box, the bake plans cover what a run needs, numbers abbreviate like the HUD, the
// two music themes pass the music invariants in every map colour, and every sound effect renders.
import { describe, expect, it } from 'vitest';
import { allAtlasIds, createPainter, specOf, abbrev } from '../src/views/mirror/paint';
import { B } from '../src/views/mirror/paint/kit';
import { BOSS_REG, DROP_REG, ELITE_REG, FX_REG, ITEM_REG, MONSTER_REG, PROJ_REG, SUMMON_REG, TREASURE_REG, WEAPON_REG, COMPANION_REG } from '../src/views/mirror/ids';
import type { AtlasId, RunSave } from '../src/views/mirror/types';
import { THEMES, arrange, phraseSeconds, setMirrorColour, type MirrorColour } from '../src/audio/music-themes';
import { Composer, gongPc } from '../src/audio/music-theory';
import { makeRng } from '../src/core/rng';
import { renderVoice, renderPickup, SFX_NAMES, SFX_MIX, gongHz } from '../src/views/mirror/audio/voices';

describe('atlas coverage', () => {
  const ids = allAtlasIds();
  it('lists every entity the arena draws', () => {
    const n = COMPANION_REG.length + MONSTER_REG.length + TREASURE_REG.length + ELITE_REG.length + BOSS_REG.length * 3 + 3
      + WEAPON_REG.length + ITEM_REG.length + SUMMON_REG.length + PROJ_REG.length + DROP_REG.length + FX_REG.length;
    expect(ids.length).toBe(n);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every id has a painter, and its strokes stay inside the box', () => {
    const out: string[] = [];
    for (const id of ids) {
      const sp = specOf(id, 'guan');
      expect(sp, id).toBeTruthy();
      const { spec } = sp!;
      const [x0, y0, x1, y1] = spec.box;
      const tolX = (x1 - x0) * 0.08 + 2, tolY = (y1 - y0) * 0.08 + 2;
      for (let v = 0; v < (spec.n ?? 1); v++) {
        const b = new B(1);
        spec.paint(b, v);
        expect(b.ops.length, id).toBeGreaterThan(0);
        let ex = 0;
        for (const op of b.ops) {
          if (op.k !== 'stroke') continue;
          for (const p of op.s.pts) {
            expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w), id).toBe(true);
            const r = op.s.kind === 'dot' ? p.w / 2 : 0;
            ex = Math.max(ex, x0 - tolX - (p.x - r), p.x + r - (x1 + tolX), y0 - tolY - (p.y - r), p.y + r - (y1 + tolY));
          }
        }
        if (ex > 0) out.push(`${id} v${v} +${ex.toFixed(1)}`);
      }
    }
    expect(out).toEqual([]);
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
  it('endless: every roster and 镜主', () => {
    const p = createPainter('palace', 'low', 3);
    const ids = new Set(p.plan(run({ map: 'palace', wave: 30 }), 'endless'));
    expect(ids.has('mon:tadpole')).toBe(true);
    expect(ids.has('mon:rat')).toBe(true);
    expect(ids.has('boss:mirrorself:1')).toBe(true);
    expect(p.dpr).toBe(1.5);
  });
});

describe('numbers', () => {
  it('abbreviates like the HUD', () => {
    expect(abbrev(999, 'zh')).toBe('999');
    expect(abbrev(9999, 'en')).toBe('9999');
    expect(abbrev(12345, 'zh')).toBe('1.2万');
    expect(abbrev(123456, 'zh')).toBe('12万');
    expect(abbrev(12345, 'en')).toBe('12.3k');
    expect(abbrev(123456, 'en')).toBe('123k');
    expect(abbrev(1.23e8, 'zh')).toBe('1.2亿');
    expect(abbrev(2.5e6, 'en')).toBe('2.5M');
    expect(abbrev(20000, 'zh')).toBe('2万');
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
    expect(lake.bpm).toEqual([84, 104]);
    expect(palace.bpm).toEqual([100, 124]);
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
  });
  it('pickups climb the F pentatonic', () => {
    expect(gongHz(0)).toBeCloseTo(349.23, 1);
    expect(gongHz(5)).toBeCloseTo(698.46, 1);
    expect(gongHz(1) / gongHz(0)).toBeCloseTo(Math.pow(2, 2 / 12), 4);
    for (let d = 0; d < 10; d++) expect(renderPickup(sr, d).length).toBeGreaterThan(100);
  });
});
