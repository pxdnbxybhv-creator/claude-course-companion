// 桃源 · 二期: the tasting close-up 特写 (spec §4, §8 P). The shot tables' lengths in every mode, the
// skip landing inside 尝, every shot's lens and distance, the per-dish beats naming real dishes, the
// framing, the sounds staying quiet and safe with the sound off, and the one restore the 特写 ends on.
import { describe, expect, it } from 'vitest';
import { DISH_IDS } from '../src/views/walk/features/taoyuan/life/keys';
import { DISHES } from '../src/views/walk/features/taoyuan/life/food';
import { CAT_SECS, PV_BEATS, SKIP_TAIL, lengthOf, shotsFor, skipTo, startOf, type Shot, type ShotOpts } from '../src/views/walk/features/taoyuan/life/pv-shots';
import { frameDish } from '../src/views/walk/features/taoyuan/life/pv';
import { MORSELS, TOOL, VESSELS } from '../src/views/walk/features/taoyuan/life/dish';
import { makeRestorer, restoreTargetOf } from '../src/views/walk/features/taoyuan/life/restore';
import * as snd from '../src/views/walk/features/minigames/sound';
import type { DishId, PvCat } from '../src/views/walk/features/taoyuan/life/types';
import type { WorldCtx } from '../src/views/walk/types';

const EPS = 1e-9;
const len = (d: DishId, o: Partial<ShotOpts> = {}) => lengthOf(shotsFor(d, { first: true, own: false, mode: 'full', low: false, reduced: false, season: false, ...o }));
/** Every combination the table can ask for, for every dish. */
function* every(): Generator<[DishId, ShotOpts, Shot[]]> {
  for (const d of DISH_IDS) for (const mode of ['full', 'short'] as const) for (const low of [false, true]) for (const reduced of [false, true]) {
    for (const own of [false, true]) for (const season of [false, true]) for (const first of [false, true]) {
      const o: ShotOpts = { first, own, mode, low, reduced, season };
      yield [d, o, shotsFor(d, o)];
    }
  }
}

describe('the 特写 · lengths (spec §4.1–4.5)', () => {
  it('each category plays its own length on a first taste: 羹 8.4, 蒸 8.8, 炙 8.2, 饮 7.4, 凉 7.0', () => {
    const cats = new Set<PvCat>();
    for (const d of DISH_IDS) {
      const cat = DISHES[d].pv;
      cats.add(cat);
      const t = len(d);
      expect(t, d).toBeCloseTo(CAT_SECS[cat], 6);
      expect(t, d).toBeGreaterThanOrEqual(7.0 - EPS);
      expect(t, d).toBeLessThanOrEqual(8.8 + EPS);
    }
    expect([...cats].sort()).toEqual(['凉', '炙', '羹', '蒸', '饮'].sort());
    expect(len('zhou')).toBeCloseTo(8.4, 6);
  });

  it('外 and 亲 add to it, never past 9.8 s', () => {
    for (const d of DISH_IDS) {
      const base = len(d);
      expect(len(d, { season: true }), d).toBeCloseTo(base + 0.8, 6);
      expect(len(d, { own: true }), d).toBeCloseTo(base + 0.6, 6);
      expect(len(d, { season: true, own: true }), d).toBeLessThanOrEqual(9.8 + EPS);
      // (the real dish: its own season and its own good)
      expect(len(d, { season: !!DISHES[d].season, own: !!DISHES[d].own }), d).toBeLessThanOrEqual(9.8 + EPS);
    }
    const s = shotsFor('s-junge', { first: true, own: true, mode: 'full', low: false, reduced: false, season: true }).map((x) => x.k);
    expect(s).toEqual(['开', '外', '起', '亲', '落', '题', '举', '尝']);
  });

  it('a repeat is the 3.2 s cut: 题 (no slow motion), then 尝', () => {
    for (const d of DISH_IDS) {
      const s = shotsFor(d, { first: false, own: false, mode: 'short', low: false, reduced: false, season: false });
      expect(lengthOf(s), d).toBeCloseTo(3.2, 6);
      expect(s.map((x) => x.k)).toEqual(['题', '尝']);
      expect(s[0].ts).toBeUndefined();
    }
  });

  it('低 starts at 落 and stays within 6.8 s', () => {
    for (const [d, o, s] of every()) {
      if (!o.low || o.reduced || o.mode !== 'full') continue;
      expect(lengthOf(s), `${d} ${JSON.stringify(o)}`).toBeLessThanOrEqual(6.8 + EPS);
      expect(s.some((x) => x.k === '起' || x.k === '外' || x.k === '亲')).toBe(false);
      expect(s.find((x) => x.k === '题')?.ts).toBe(0.35);
    }
  });

  it('reduced motion is held frames: ≤4.6 s, no time scale, no push', () => {
    for (const [d, o, s] of every()) {
      if (!o.reduced) continue;
      expect(lengthOf(s), `${d} ${JSON.stringify(o)}`).toBeLessThanOrEqual(4.6 + EPS);
      for (const x of s) {
        expect(x.ts, `${d} ${x.k}`).toBeUndefined();
        expect(x.push, `${d} ${x.k}`).toBeUndefined();
      }
    }
    expect(lengthOf(shotsFor('zhou', { first: true, own: false, mode: 'full', low: false, reduced: true, season: false }))).toBeCloseTo(4.2, 6);
    expect(lengthOf(shotsFor('bing', { first: true, own: true, mode: 'full', low: false, reduced: true, season: false }))).toBeCloseTo(4.6, 6);
  });

  it('the full base timeline is the spec table: 开 0.4 · 起 1.6 · 落 1.6 · 题 1.8 · 举 1.2 · 尝 1.8, slow motion in 题 and 举', () => {
    const s = shotsFor('zhou', { first: true, own: false, mode: 'full', low: false, reduced: false, season: false });
    expect(s.map((x) => [x.k, x.secs])).toEqual([['开', 0.4], ['起', 1.6], ['落', 1.6], ['题', 1.8], ['举', 1.2], ['尝', 1.8]]);
    expect(s.map((x) => x.ts)).toEqual([undefined, undefined, undefined, 0.35, 0.35, 1]);
    expect(startOf(s, 3)).toBeCloseTo(3.6, 6);
  });
});

describe('the 特写 · skip, lens, distance, beats', () => {
  it('a skip lands inside 尝, in its last 1.2 s', () => {
    for (const [d, o, s] of every()) {
      const k = skipTo(s);
      const start = startOf(s, k.i);
      const end = start + s[k.i].secs;
      expect(s[k.i].k, d).toBe('尝');
      expect(k.t, `${d} ${JSON.stringify(o)}`).toBeGreaterThanOrEqual(start - EPS);
      expect(k.t).toBeLessThan(end);
      expect(end - k.t).toBeLessThanOrEqual(SKIP_TAIL + EPS);
    }
  });

  it('every shot is framed with a lens of 28–50° from 0.3–1.8 m', () => {
    for (const [d, , s] of every()) for (const x of s) {
      expect(x.fov, `${d} ${x.k}`).toBeGreaterThanOrEqual(28);
      expect(x.fov, `${d} ${x.k}`).toBeLessThanOrEqual(50);
      expect(x.dist, `${d} ${x.k}`).toBeGreaterThanOrEqual(0.3);
      expect(x.dist, `${d} ${x.k}`).toBeLessThanOrEqual(1.8);
    }
  });

  it('the per-dish beats name real dishes and real shots, and each lands in its shot', () => {
    const keys = new Set(['开', '外', '起', '亲', '落', '题', '举', '尝']);
    for (const [d, beats] of Object.entries(PV_BEATS)) {
      expect(DISH_IDS, d).toContain(d);
      for (const [k, b] of Object.entries(beats ?? {})) {
        expect(keys.has(k), `${d} ${k}`).toBe(true);
        const s = shotsFor(d as DishId, { first: true, own: false, mode: 'full', low: false, reduced: false, season: false });
        expect(s.find((x) => x.k === k)?.beat, `${d} ${k}`).toBe(b);
      }
    }
    // 鸡黍 and 菌子羹 lift the lid at the stove; 汤饼 trails its strand; 桃花茶 fills two cups
    const beat = (d: DishId, k: string) => shotsFor(d, { first: true, own: false, mode: 'full', low: false, reduced: false, season: false }).find((x) => x.k === k)?.beat;
    expect(beat('jishu', '起')).toBe('lid');
    expect(beat('s-junge', '起')).toBe('lid');
    expect(beat('tangbing', '举')).toBe('strand');
    expect(beat('taocha', '起')).toBe('twocups');
    expect(beat('s-heye', '落')).toBe('flaps');
  });

  it('the dish kit has a vessel, a tool and at most 12 morsels for every dish', () => {
    for (const d of DISH_IDS) {
      expect(VESSELS[d], d).toBeTruthy();
      expect(d in TOOL, d).toBe(true);
      expect(MORSELS[d].list.length, d).toBeLessThanOrEqual(12);
      expect(VESSELS[d].topR, d).toBeGreaterThan(0.02);
    }
    // drinks raise the cup; the soups take a spoon
    expect(TOOL.xinpei).toBeNull();
    expect(TOOL.zhou).toBe('spoon');
  });

  it('framing puts the camera `dist` away at `elev`, and never straight down on the look', () => {
    const at = { x: 100, y: 120.8, z: -50 };
    for (const s of shotsFor('jishu', { first: true, own: true, mode: 'full', low: false, reduced: false, season: false })) {
      const f = frameDish(null, at, { x: 0, z: 1 }, s);
      const d = Math.hypot(f.to.x - at.x, f.to.y - at.y, f.to.z - at.z);
      expect(d, s.k).toBeCloseTo(s.dist, 6);
      expect(Math.asin((f.to.y - at.y) / d) * (180 / Math.PI), s.k).toBeCloseTo(s.elev, 4);
      expect(Math.hypot(f.to.x - f.look.x, f.to.z - f.look.z), s.k).toBeGreaterThan(0.015);
      const pushed = Math.hypot(f.pushed.x - f.to.x, f.pushed.y - f.to.y, f.pushed.z - f.to.z);
      expect(pushed, s.k).toBeCloseTo(Math.abs(s.push ?? 0), 6);
    }
  });
});

describe('the 特写 · sounds (sound off)', () => {
  it('none throws, and now() keeps running', () => {
    const t0 = snd.now();
    expect(() => {
      snd.sizzle(1); snd.steam(1); snd.bubble(4); snd.slurp(); snd.crunch(); snd.crack(); snd.sip(true); snd.lid();
      snd.sting('zhou', true); snd.clapper(); snd.at('drum', t0 + 0.1); snd.at('pluck', t0, { note: 3 }); snd.whistle(0.5); snd.whistle(0); snd.swish(0.8);
      snd.pvTick('swish'); snd.pvTick('clink');
    }).not.toThrow();
    expect(snd.now()).toBeGreaterThanOrEqual(t0);
  });
});

describe('the 特写 · the restore it ends on', () => {
  it('puts back the time scale, the lens, the hand, the freeze, the camera and the focus — once', () => {
    const log: string[] = [];
    const fake = {
      setTimeScale: (f: number) => log.push(`ts ${f}`),
      player: { holdProp: (p: string | null) => { log.push(`hold ${p}`); return null; }, freeze: (on: boolean) => log.push(`freeze ${on}`) },
      lens: (f: number | null) => log.push(`lens ${f}`),
      endCinematic: () => log.push('endCinematic'),
      sky: {},
      camera: {},
    } as unknown as WorldCtx;
    const focus: { at: unknown } = { at: { x: 1, y: 2, z: 3 } };
    const placed: string[] = [];
    const r = makeRestorer(restoreTargetOf(fake, focus, (k) => ({ place: (at: null) => void placed.push(`${k} ${at}`) })));
    let closed = 0;
    // what a 特写 arms: the claim (armed by the table), the cook borrowed, the overlay and the music deferred
    r.arm();
    r.borrowed('guiniang');
    r.defer(() => closed++);
    r.defer(() => closed++);
    r.restore();
    for (const want of ['ts 1', 'lens null', 'hold null', 'freeze false', 'endCinematic']) expect(log).toContain(want);
    expect(focus.at).toBeNull();
    expect(placed).toEqual(['guiniang null']);
    expect(closed).toBe(2);
    const n = log.length;
    r.restore();
    expect(log.length).toBe(n);
    expect(closed).toBe(2);
    expect(placed.length).toBe(1);
  });
});
