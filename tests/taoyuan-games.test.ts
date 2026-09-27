// 桃源 · 二期: the six valley games' rules (spec §8, G): 踩曲, 摸鱼, 采桑喂蚕, 纸鸢, 捉萤, 流觞, and what
// every game shares (the 土产 grant, 文 caps, seals, the daily picks). Plus the games' lines: the style
// lint, and no hanzi in the English.
import { describe, expect, it } from 'vitest';
import {
  CALL_BONUS, CAN, COIN_CAP, FISH_POINTS, GAME_PARTS, MO, SHANG, SONG_BPM, YING, YUAN,
  ashuTally, birdHit, brake, callBonus, capture, catchAt, chart, cocoons, coinsFor, comboMul, cupScore, doubleScore, feed, flyLit,
  goodsFor, gradeOf, gradeQu, guiAllowed, judge, kingNextLit, leadPoint, litAt, makeCup, makeFish, makeKite, makeTrays, netBonus,
  noise, openAt, poke, quAccuracy, quSealFeat, ringHit, ripple, rippleSpeed, sealEarned, shangSealFeat, shrimpPoint, slipKept,
  snapLimit, stepCup, stepKite, stepTrays, sweep, syncPhase, tangle, tangles, trayState, sleepAt, yingSealFeat, yuanSealFeat,
  type Fish,
} from '../src/views/walk/features/taoyuan/life/games/logic';
import { GAME_IDS, PAID_ROUNDS, SONG_IDS } from '../src/views/walk/features/taoyuan/life/keys';
import { yueFor, songOfDay, waterOfDay, draughtOfDay, kingOfDay, flowOfDay, leavesOfDay, lingOfDay, seatsOfDay } from '../src/views/walk/features/taoyuan/life/daily';
import * as TEXT from '../src/views/walk/features/taoyuan/life/games/games-text';
import { makeRng } from '../src/core/rng';
import { hanziIn, lint, linesIn, speakerOf } from './helpers/style-lint';
import { CHARACTERS } from '../src/data/characters';

const rng = makeRng(7);
const fishAt = (kind: Fish['kind'], x: number, y: number, alert = 0): Fish => ({ ...makeFish(0, kind, rng, { x, y }), dx: 1, dy: 0, alert });

// ═════════════════════════════ 踩曲

describe('踩曲 · qu', () => {
  it('judges ±70 正 and ±140 好, ×1.5 in gentle mode, +10 ms under 定', () => {
    for (const s of [1, -1]) {
      expect(judge(69 * s, false, false)).toBe('正');
      expect(judge(71 * s, false, false)).toBe('好');
      expect(judge(139 * s, false, false)).toBe('好');
      expect(judge(141 * s, false, false)).toBe('miss');
      expect(judge(104 * s, true, false)).toBe('正');
      expect(judge(106 * s, true, false)).toBe('好');
      expect(judge(209 * s, true, false)).toBe('好');
      expect(judge(211 * s, true, false)).toBe('miss');
      expect(judge(79 * s, false, true)).toBe('正');
      expect(judge(149 * s, false, true)).toBe('好');
      expect(judge(151 * s, false, true)).toBe('miss');
    }
  });
  it('caps the combo multiplier at ×1.5', () => {
    expect(comboMul(0)).toBe(1);
    expect(comboMul(9)).toBe(1);
    expect(comboMul(10)).toBeCloseTo(1.1);
    expect(comboMul(49)).toBeCloseTo(1.4);
    expect(comboMul(50)).toBeCloseTo(1.5);
    expect(comboMul(500)).toBe(1.5);
  });
  it('pays the 喊号 +20 only for a perfect bar', () => {
    expect(callBonus(['正', '正', '正', '正'])).toBe(CALL_BONUS);
    expect(CALL_BONUS).toBe(20);
    expect(callBonus(['正', '好', '正'])).toBe(0);
    expect(callBonus(['正', 'miss'])).toBe(0);
    expect(callBonus([])).toBe(0);
  });
  it('charts every 号子 as 3 × 32 beats at its bpm, with a 喊号 in blocks 2 and 3', () => {
    const bpm = { qizao: 72, caiqu: 84, gane: 92, shoushu: 100, huazhao: 108 };
    for (const s of SONG_IDS) {
      const c = chart(s);
      expect(c.bpm).toBe(bpm[s]);
      expect(SONG_BPM[s]).toBe(bpm[s]);
      expect(c.blocks).toBe(3);
      expect(c.blockBeats).toBe(32);
      expect(c.countIn).toBe(4);
      expect(c.notes.length).toBeGreaterThan(40);
      for (const n of c.notes) { expect(n.beat).toBeGreaterThanOrEqual(0); expect(n.beat + (n.hold ?? 0)).toBeLessThanOrEqual(96); }
      expect(c.calls.map((x) => Math.floor(x.call / 32))).toEqual([1, 2]);
      for (const x of c.calls) {
        // no notes for you in 杜二's bar; the echo bar is blank blots
        expect(c.notes.some((n) => n.beat >= x.call && n.beat < x.call + 4)).toBe(false);
        const echo = c.notes.filter((n) => n.beat >= x.echo && n.beat < x.echo + 4);
        expect(echo.length).toBe(x.pattern.length);
        expect(echo.every((n) => n.echo)).toBe(true);
      }
    }
    // 赶鹅 has 碾, 花朝 has triplets in block 3
    expect(chart('gane').notes.some((n) => n.hold)).toBe(true);
    expect(chart('huazhao').notes.some((n) => n.beat >= 64 && Math.abs(n.beat * 3 - Math.round(n.beat * 3)) < 1e-9 && Math.abs(n.beat * 2 - Math.round(n.beat * 2)) > 1e-9)).toBe(true);
  });
  it('grades accuracy at 60% and 85%; the seal needs 精 at 92 bpm or faster', () => {
    expect(quAccuracy(10, 0, 10)).toBe(1);
    expect(quAccuracy(0, 3, 1)).toBe(1);
    expect(gradeQu(0.59)).toBe('初');
    expect(gradeQu(0.6)).toBe('熟');
    expect(gradeQu(0.849)).toBe('熟');
    expect(gradeQu(0.85)).toBe('精');
    expect(quSealFeat('gane', '精')).toBe(true);
    expect(quSealFeat('caiqu', '精')).toBe(false);
    expect(quSealFeat('huazhao', '熟')).toBe(false);
  });
});

// ═════════════════════════════ 摸鱼

describe('摸鱼 · mo', () => {
  it('ripples past 0.5 m/s (0.75 gentle, +15% under 暖) and alerts fish within 1.2 m', () => {
    expect(rippleSpeed(false, null)).toBe(0.5);
    expect(rippleSpeed(true, null)).toBeCloseTo(0.75);
    expect(rippleSpeed(false, '暖')).toBeCloseTo(0.575);
    const fish = [fishAt('ji', 1, 1), fishAt('ji', 2.5, 1)];
    expect(ripple(fish, 1, 1, 0.49, 0.5)).toBe(false);
    expect(fish[0].alert).toBe(0);
    expect(ripple(fish, 1, 1, 0.6, 0.5)).toBe(true);
    expect(fish[0].alert).toBeCloseTo(0.5);
    expect(fish[1].alert).toBe(0);
    ripple(fish, 1, 1, 0.6, 0.5, true);
    expect(fish[0].alert).toBeCloseTo(0.8);
  });
  it('catches within 0.18 m (0.24 gentle), only with alert under 0.6', () => {
    const a = fishAt('ji', 1.17, 1), b = fishAt('ji', 1, 1.2), c = fishAt('ji', 1, 1, 0.6);
    expect(catchAt([a, b, c], 1, 1, false)).toEqual([a]);
    expect(catchAt([a, b, c], 1, 1, true)).toEqual([a, b]);
    expect(catchAt([fishAt('ji', 1, 1, 0.59)], 1, 1, false).length).toBe(1);
  });
  it('lets a 泥鳅 slip without 3 taps in 0.8 s (2 in 1.0 s gentle)', () => {
    expect(slipKept([10.1, 10.3, 10.7], 10, false)).toBe(true);
    expect(slipKept([10.1, 10.3, 10.9], 10, false)).toBe(false);
    expect(slipKept([10.1, 10.3], 10, false)).toBe(false);
    expect(slipKept([10.4, 10.95], 10, true)).toBe(true);
    expect(slipKept([10.4, 11.1], 10, true)).toBe(false);
  });
  it('puts the 虾 catch point behind its tail', () => {
    const f = { x: 1, y: 1, dx: 1, dy: 0 };
    const p = shrimpPoint(f);
    expect(p.x).toBeLessThan(1 - 0.1);
    expect(p.y).toBe(1);
    // you close behind it: hands a little ahead of its head miss it (they would take a 鲫 there)
    const s = fishAt('xia', 1, 1);
    expect(catchAt([s], p.x, p.y, false)).toEqual([s]);
    expect(catchAt([s], 1.08, 1, false)).toEqual([]);
    expect(catchAt([fishAt('ji', 1, 1)], 1.08, 1, false).length).toBe(1);
  });
  it('lets the 鳜 come only after 60 s, after 4 s still, in the upstream third', () => {
    expect(guiAllowed(60, 4, 0.5)).toBe(true);
    expect(guiAllowed(59.9, 4, 0.5)).toBe(false);
    expect(guiAllowed(70, 3.9, 0.5)).toBe(false);
    expect(guiAllowed(70, 5, 1.01)).toBe(false);
    expect(FISH_POINTS.gui).toBe(8);
    expect(MO.guiChance).toBe(0.4);
  });
  it('keeps 阿黍 within ±1 of you, and at least 2', () => {
    for (const mine of [0, 1, 2, 5, 9]) for (const r of [-1, -0.4, 0, 0.6, 1, 3]) {
      const a = ashuTally(mine, r);
      expect(a).toBeGreaterThanOrEqual(2);
      if (mine >= 3) expect(Math.abs(a - mine)).toBeLessThanOrEqual(1);
    }
  });
});

// ═════════════════════════════ 采桑喂蚕

describe('采桑 · can', () => {
  it('scores a feed +2 at ≥80%, +1 at 40–80%, 0 under 40%', () => {
    const trays = makeTrays();
    trays[0].hunger = 0.8;
    expect(feed(trays, 0, 'nen', 1, { first: 3 })).toEqual({ score: 2, word: 'right' });
    expect(trays[0].hunger).toBeCloseTo(0.2);
    trays[1].hunger = 0.4;
    expect(feed(trays, 1, 'nen', 1, { first: 3 }).score).toBe(1);
    trays[1].hunger = 0.39;
    expect(feed(trays, 1, 'nen', 1, { first: 3 })).toEqual({ score: 0, word: 'full' });
    // the wrong leaf is wasted
    trays[2].on = true; trays[2].hunger = 0.9;
    expect(feed(trays, 2, 'nen', 1, { first: 3 })).toEqual({ score: 0, word: 'wrong' });
    expect(feed(trays, 2, 'lao', 1, { first: 3 }).score).toBe(2);
  });
  it('costs −2 and a 4 s pause for a wet leaf; −3 for a sleeping tray; −1 for a spotted one', () => {
    const trays = makeTrays();
    trays[0].hunger = 0.9;
    expect(feed(trays, 0, 'shi', 10, { first: 3 })).toEqual({ score: -2, word: 'wet' });
    expect(trays[0].pausedTo).toBe(14);
    expect(feed(trays, 0, 'nen', 12, { first: 3 })).toEqual({ score: 0, word: 'paused' });
    expect(feed(trays, 0, 'nen', 14, { first: 3 }).score).toBe(2);
    expect(feed(trays, 1, 'huang', 5, { first: 3 }).score).toBe(-1);
    const s = sleepAt(2, 2);
    expect(s.warn).toBe(45);
    expect(s.from).toBe(48);
    expect(s.to).toBe(56);
    expect(trayState(2, 2, 46)).toBe('warn');
    expect(trayState(2, 2, 50)).toBe('asleep');
    trays[2].on = true;
    expect(feed(trays, 2, 'lao', 50, { first: 2 })).toEqual({ score: -3, word: 'asleep' });
  });
  it('freezes hunger while asleep, and charges a point every 4 s after 4 s at 100%', () => {
    const trays = makeTrays();
    trays[0].hunger = 1;
    let lost = 0;
    for (let i = 0; i < 100; i++) lost += stepTrays(trays, 0.1, 10 + i * 0.1, { gentle: false, first: 3 });
    expect(lost).toBe(1); // 10 s at 100%: charged at 8 s
    const t2 = makeTrays();
    t2[1].hunger = 0.5;
    stepTrays(t2, 1, 50, { gentle: false, first: 1 }); // tray 1 sleeps 48–56
    expect(t2[1].hunger).toBe(0.5);
  });
  it('raises the noise meter at more than 3 drops within 1 s', () => {
    const three = noise(0, [1, 1.2, 1.4], 1.5, 0, -1);
    expect(three.level).toBe(0);
    const four = noise(0, [1, 1.2, 1.4, 1.5], 1.5, 0, -1);
    expect(four.level).toBeCloseTo(CAN.noiseStep);
    // a meter at 0.8 and a burst: it reaches 1 and hushes the trays
    const hush = noise(0.8, [2, 2.1, 2.2, 2.3], 2.3, 0, -1);
    expect(hush.hush).toBe(true);
    // it decays 0.8 a second
    expect(noise(0.4, [], 5, 0.25, -1).level).toBeCloseTo(0.2);
  });
  it('spins a cocoon for each tray that never reached 100% in the last 20 s', () => {
    const trays = makeTrays().map((t) => ({ ...t, on: true }));
    trays[0].fullAt = 75;
    trays[1].fullAt = 60;
    expect(cocoons(trays, 90)).toBe(3);
  });
});

// ═════════════════════════════ 纸鸢

describe('纸鸢 · yuan', () => {
  const step = (s: ReturnType<typeof makeKite>, o: Partial<Parameters<typeof stepKite>[2]> = {}) =>
    stepKite(s, 0.1, { t: 10, holding: false, steer: 0, strength: 0, band: 0, inhale: false, ...o });
  it('snaps at T > 1.0 (1.3 gentle; 定 +0.05)', () => {
    expect(snapLimit(false, null)).toBe(1.0);
    expect(snapLimit(true, null)).toBe(1.3);
    expect(snapLimit(false, '定')).toBeCloseTo(1.05);
    const a = makeKite(); a.T = 0.99;
    expect(step(a, { holding: true, strength: 1 })).toBe('snap');
    const b = makeKite(); b.T = 0.99;
    expect(step(b, { holding: true, strength: 1, gentle: true })).toBe(null);
    const c = makeKite(); c.T = 0.94;
    expect(step(c, { holding: true, strength: 1 })).toBe(null);
  });
  it('stalls on a slack line with no breath', () => {
    const s = makeKite(); s.h = 100; s.T = 0.1;
    step(s);
    expect(s.h).toBeCloseTo(100 - YUAN.stallFall * 0.1);
    const u = makeKite(); u.h = 100; u.T = 0.5;
    step(u);
    expect(u.h).toBeCloseTo(100 - 4 * 0.1);
  });
  it('climbs in a breath while held, more in the band', () => {
    const s = makeKite(); s.h = 50; s.T = 0.3;
    step(s, { holding: true, strength: 1, band: 0 });
    expect(s.h).toBeCloseTo(50 + 9 * YUAN.climb * 0.1);
    const off = makeKite(); off.h = 50; off.T = 0.3; off.x = 0.6;
    step(off, { holding: true, strength: 1, band: 0 });
    expect(off.h).toBeLessThan(s.h);
  });
  it('passes rings within ±15 尺 and 0.15; the bird within ±10 and 0.1', () => {
    expect(ringHit({ h: 115, x: 0.1 }, { h: 100, x: 0 })).toBe(true);
    expect(ringHit({ h: 116, x: 0 }, { h: 100, x: 0 })).toBe(false);
    expect(ringHit({ h: 100, x: 0.16 }, { h: 100, x: 0 })).toBe(false);
    expect(birdHit({ h: 110, x: 0.09 }, { h: 100, x: 0 })).toBe(true);
    expect(birdHit({ h: 111, x: 0 }, { h: 100, x: 0 })).toBe(false);
    expect(birdHit({ h: 100, x: 0.11 }, { h: 100, x: 0 })).toBe(false);
  });
  it('tangles on a crossing (not under 甜): −20 尺 and 3 s tumbling', () => {
    expect(tangles({ h: 100, x: 0 }, { h: 111, x: 0.07 }, null)).toBe(true);
    expect(tangles({ h: 100, x: 0 }, { h: 112, x: 0 }, null)).toBe(false);
    expect(tangles({ h: 100, x: 0 }, { h: 100, x: 0.08 }, null)).toBe(false);
    expect(tangles({ h: 100, x: 0 }, { h: 100, x: 0 }, '甜')).toBe(false);
    const s = makeKite(); s.h = 100;
    tangle(s, 40);
    expect(s.h).toBe(80);
    expect(s.tumbleTo).toBe(43);
  });
  it('falls 6 a second on the inhale unless held', () => {
    const s = makeKite(); s.h = 100; s.T = 0.5;
    step(s, { inhale: true });
    expect(s.h).toBeCloseTo(100 - 6 * 0.1);
    const h2 = makeKite(); h2.h = 100; h2.T = 0.5;
    step(h2, { inhale: true, holding: true });
    expect(h2.h).toBe(100);
  });
  it('seals at 300 尺 of height alone', () => {
    expect(yuanSealFeat(299.9)).toBe(false);
    expect(yuanSealFeat(300)).toBe(true);
  });
});

// ═════════════════════════════ 捉萤

describe('捉萤 · ying', () => {
  it('never catches a dark firefly (it scatters)', () => {
    const out = sweep({ ax: 0, ay: 0, bx: 100, by: 0 }, [
      { sx: 50, sy: 10, lit: true, on: true },
      { sx: 60, sy: 5, lit: false, on: true },
      { sx: 70, sy: 29, lit: true, on: true },
      { sx: 80, sy: 20, lit: true, on: false },
    ], YING.hitPx);
    expect(out.caught).toEqual([0]);
    expect(out.scattered).toEqual([1]);
    expect(sweep({ ax: 0, ay: 0, bx: 100, by: 0 }, [{ sx: 70, sy: 39, lit: true, on: true }], YING.hitPxGentle).caught).toEqual([0]);
  });
  it('flashes each code', () => {
    expect(litAt('dan', 0.1)).toBe(true);
    expect(litAt('dan', 0.5)).toBe(false);
    expect(litAt('dan', 2.1)).toBe(true);
    expect(litAt('shuang', 0.3)).toBe(false);
    expect(litAt('shuang', 0.6)).toBe(true);
    expect(litAt('chang', 1.4)).toBe(true);
    expect(litAt('chang', 2)).toBe(false);
    expect(litAt('you', 0.7)).toBe(true);
    expect(litAt('you', 0.9)).toBe(false);
  });
  it('makes 一网 at 3', () => {
    expect(netBonus(2)).toBe(0);
    expect(netBonus(3)).toBe(3);
    expect(netBonus(5)).toBe(3);
  });
  it('flashes everyone together from 55 s (0.4 s lit every 1.2 s)', () => {
    expect(syncPhase(54)).toBe(false);
    expect(syncPhase(55.1)).toBe(true);
    expect(syncPhase(55.5)).toBe(false);
    expect(syncPhase(56.3)).toBe(true);
    // a 长明 that would be lit follows the beat instead
    expect(flyLit('chang', 55.5, 0)).toBe(false);
    expect(flyLit('dan', 57.7, 0)).toBe(true);
  });
  it('leads the 萤王 along its dark path to where it lights next', () => {
    for (let code = 0; code < 4; code++) {
      for (const u of [0.05, 1.3, 2.15, 3.7]) {
        const p = { x: 1, y: 1, z: 2 }, v = { x: 0.7, y: 0, z: -0.1 };
        const lp = leadPoint(p, v, u, code);
        const dt = kingNextLit(u, code);
        expect(dt).toBeGreaterThanOrEqual(0);
        expect(lp.x).toBeCloseTo(p.x + v.x * dt);
        expect(lp.z).toBeCloseTo(p.z + v.z * dt);
        // collinear with its heading (on its path), and lit when it gets there
        expect((lp.x - p.x) * v.z - (lp.z - p.z) * v.x).toBeCloseTo(0);
        expect(litAt('wang', u + dt + 1e-6, code)).toBe(true);
      }
    }
  });
  it('seals with the 萤王 caught and 40 or more', () => {
    expect(yingSealFeat(true, 40)).toBe(true);
    expect(yingSealFeat(true, 39)).toBe(false);
    expect(yingSealFeat(false, 60)).toBe(false);
  });
});

// ═════════════════════════════ 流觞

describe('流觞 · shang', () => {
  const bays = [{ s: 3, u: 0.18 }];
  it('captures under 0.25 m/s within 0.12 m', () => {
    const c = makeCup(3, 0.1); c.speed = 0.24;
    expect(capture(c, bays[0])).toBe(true);
    c.speed = 0.26;
    expect(capture(c, bays[0])).toBe(false);
    const d = makeCup(3, 0.05); d.speed = 0.1;
    expect(capture(d, bays[0])).toBe(false);
  });
  it('spills on the second bump', () => {
    const c = makeCup(1, 0.29);
    c.v = 0.4;
    expect(stepCup(c, 0.1, { base: 0.35, bend: 0, len: 10, bays: [] })).toBe('bump');
    c.v = 0.4;
    expect(stepCup(c, 0.1, { base: 0.35, bend: 0, len: 10, bays: [] })).toBe('spill');
    expect(c.spilled).toBe(true);
  });
  it('pokes with a falloff over 0.6 m (a key: a fixed 0.18)', () => {
    const a = makeCup(); poke(a, 0, 1);
    expect(a.v).toBeCloseTo(-0.25);
    const b = makeCup(); poke(b, 0.3, -1);
    expect(b.v).toBeCloseTo(0.125);
    const c = makeCup(); poke(c, 0.6, 1);
    expect(c.v).toBeCloseTo(0);
    const k = makeCup(); poke(k, 0, -1, { key: true });
    expect(k.v).toBeCloseTo(SHANG.pokeKey);
    expect(k.pokes).toBe(1);
  });
  it('brakes ×0.6 out of a 2 s budget per cup', () => {
    const c = makeCup(1, 0);
    let t = 0;
    while (brake(c, true, 0.1)) t += 0.1;
    expect(t).toBeCloseTo(2, 5);
    expect(c.brake).toBe(0);
    const d = makeCup(1, 0);
    brake(d, true, 0.1);
    stepCup(d, 1, { base: 0.35, bend: 0, len: 10, bays: [] });
    expect(d.speed).toBeCloseTo(0.35 * SHANG.brake);
  });
  it('scores 双觞 as two cups, each 10 + centring + few pokes', () => {
    const all = [{ s: 3, u: 0.18 }, { s: 6, u: -0.18 }];
    const a = makeCup(3, 0.18); a.bay = 0;
    const b = makeCup(6, -0.12); b.bay = 1; b.pokes = 3;
    expect(cupScore(a, 0, all)).toBe(18);
    expect(cupScore(b, 1, all)).toBe(10 + Math.round(5 * (1 - 0.06 / 0.12)));
    expect(cupScore(a, 1, all)).toBe(0);
    expect(doubleScore(a, 0, b, 1, all)).toBe(18 + cupScore(b, 1, all));
    expect(shangSealFeat(5, 5)).toBe(true);
    expect(shangSealFeat(4, 5)).toBe(false);
  });
});

// ═════════════════════════════ all games

describe('all six', () => {
  it('grant 1 土产, or 2 at 精, only on the first 3 rounds of the day', () => {
    expect(PAID_ROUNDS).toBe(3);
    for (let n = 0; n < 3; n++) {
      expect(goodsFor('初', n)).toBe(1);
      expect(goodsFor('熟', n)).toBe(1);
      expect(goodsFor('精', n)).toBe(2);
      expect(goodsFor('初', n, true)).toBe(2);
    }
    expect(goodsFor('精', 3)).toBe(0);
    expect(goodsFor('初', 4, true)).toBe(0);
  });
  it('cap every 文 formula', () => {
    const caps = { qu: 30, mo: 35, can: 30, yuan: 30, ying: 25, shang: 35 };
    for (const g of GAME_IDS) {
      expect(COIN_CAP[g]).toBe(caps[g]);
      expect(coinsFor(g, 1e6, { beatAshu: true })).toBe(caps[g]);
      expect(coinsFor(g, -5)).toBe(0);
      expect(coinsFor(g, NaN)).toBe(0);
    }
    expect(coinsFor('qu', 159)).toBe(15);
    expect(coinsFor('mo', 7)).toBe(14);
    expect(coinsFor('mo', 7, { beatAshu: true })).toBe(24);
    expect(coinsFor('can', 41)).toBe(20);
    expect(coinsFor('ying', 31)).toBe(15);
    expect(coinsFor('shang', 50)).toBe(16);
  });
  it('never grant a seal in gentle mode', () => {
    expect(sealEarned(true, true)).toBe(false);
    expect(sealEarned(false, true)).toBe(true);
    expect(sealEarned(false, false)).toBe(false);
  });
  it('grade by the spec thresholds', () => {
    const at = { mo: [7, 14], can: [35, 60], yuan: [180, 300], ying: [22, 40], shang: [45, 75] } as const;
    for (const [g, [a, b]] of Object.entries(at) as [keyof typeof at, readonly [number, number]][]) {
      expect(gradeOf(g, a - 1)).toBe('初');
      expect(gradeOf(g, a)).toBe('熟');
      expect(gradeOf(g, b)).toBe('精');
    }
  });
  it('play in their hours', () => {
    expect(openAt('qu', 'dawn')).toBe(true);
    expect(openAt('can', 'dawn')).toBe(true);
    expect(openAt('mo', 'dawn')).toBe(false);
    expect(openAt('shang', 'dusk')).toBe(true);
    expect(openAt('ying', 'night')).toBe(true);
    expect(openAt('ying', 'dusk')).toBe(false);
    for (const g of GAME_IDS) expect(GAME_PARTS[g].length).toBeGreaterThan(0);
  });
  it('pick the day’s twists deterministically', () => {
    for (const day of ['2026-09-27', '2026-10-01', '2027-02-14']) {
      expect(songOfDay(day)).toBe(songOfDay(day));
      expect(waterOfDay(day)).toBe(waterOfDay(day));
      expect(leavesOfDay(day)).toBe(leavesOfDay(day));
      expect(draughtOfDay(day)).toBe(draughtOfDay(day));
      expect(kingOfDay(day)).toBe(kingOfDay(day));
      expect(flowOfDay(day)).toBe(flowOfDay(day));
      expect(lingOfDay(day)).toBe(lingOfDay(day));
      expect(seatsOfDay(day)).toEqual(seatsOfDay(day));
      expect(yueFor(day)).toEqual(yueFor(day));
      expect(GAME_IDS).toContain(yueFor(day).game);
    }
  });
});

// ═════════════════════════════ the games' lines

describe('the games’ lines', () => {
  const WHO = [...['qin', 'xiaoman', 'guiniang', 'sang', 'taoye', 'ruan', 'duer', 'ashu', 'liupo', 'shigu', 'lusan', 'gegu', 'yaoyao'], ...CHARACTERS.map((c) => c.id)];
  const lines = linesIn(TEXT);
  it('pass the style lint', () => {
    expect(lines.length).toBeGreaterThan(100);
    for (const l of lines) expect(lint(l.zh, speakerOf(l.path, l.zh, WHO)), `${l.path}: ${l.zh}`).toEqual([]);
    for (const q of Object.values(TEXT.QUOTES)) expect(lint(q.poem, 'quote')).toEqual([]);
  });
  it('have no hanzi in the English', () => {
    for (const l of lines) expect(hanziIn(l.en), `${l.path}: ${l.en}`).toBe(false);
    for (const q of Object.values(TEXT.QUOTES)) { expect(hanziIn(q.en)).toBe(false); expect(hanziIn(q.enBy)).toBe(false); }
  });
  it('keep the spec’s pinned lines', () => {
    expect(TEXT.QU.duer.barks.map((b) => b.zh)).toEqual(['好！', '阿黍，你看看人家！', '我杜二踩了三十年，也就这样！']);
    expect(TEXT.CAN.sang.asleep.zh).toBe('客人，眠了。');
    expect(TEXT.YUAN.xiaoman.tangle.zh).toBe('缠上了！然后……然后我的也掉了！');
    expect(TEXT.LUSAN.lusan.mo.zh).toBe('鱼篓。新编的。');
    expect(TEXT.SHANG.gegu.tally.zh).toBe('五觞，停对四觞。杜二那觞不算，他什么都喝。');
    expect(TEXT.QUOTES.shang.poem).toBe('引以为流觞曲水，列坐其次。');
    for (const g of GAME_IDS) { expect(TEXT.STAND[g].label.zh.length).toBeGreaterThan(0); expect(TEXT.GAME_NAME[g].zh.length).toBeGreaterThan(0); }
  });
});

// (FLY_POINTS, YUAN, etc. are read above; the unused imports keep the table honest)
void FISH_POINTS; void trayState;
