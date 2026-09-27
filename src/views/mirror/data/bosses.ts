// 水月幻镜 · the 9 bosses as phase scripts (GDD §14). Damage is at the boss's home wave on 照影 with
// the ⚖ factors applied: wave-10 numbers are the GDD's ×0.7 values, wave-20 = listed × 2.3, wave-30 =
// listed × 5. The engine multiplies by diff.dmg (ramped), vows and enrage. Contact 7 / 37 / 120 ⚖.
// Endless bosses (双生, 镜主) reuse these scripts; see ENDLESS_BOSS below.
import type { BossId } from '../ids';
import type { BossDef } from '../types';

const W20 = 2.3;
const W30 = 5;
const r1 = (x: number) => Math.round(x * 10) / 10;

export const BOSSES: Readonly<Record<BossId, BossDef>> = {
  // ─────────────────────────────── 月湖
  carp: {
    id: 'carp', map: 'lake', wave: 10, K: 1300, contact: 7, r: 56,
    phases: [
      { from: 1, move: 'rim', speed: 120, script: [
        { pat: 'bubbleSpiral', at: 0.5, every: 6, tele: 0, dmg: 4, p: { rate: 8, spin: 60, speed: 160, dur: 6 } },
        { pat: 'tailSlap', at: 3, every: 6, tele: 0.9, dmg: 8, p: { deg: 90, r: 220 } },
      ] },
      { from: 0.6, move: 'leap', speed: 0, script: [
        { pat: 'leapSplash', at: 0.5, every: 6, tele: 1.0, dmg: 8, n: 3, p: { r: 140, gap: 40, ringSpeed: 300 } },
        { pat: 'bubbleSpiral', at: 4, every: 8, tele: 0, dmg: 4, p: { rate: 6, spin: 60, speed: 160, dur: 3 } },
      ] },
      { from: 0.25, move: 'rim', speed: 140, script: [
        { pat: 'sweepBeam', at: 1, every: 6, tele: 1.2, dmg: 10, p: { deg: 180, dur: 3, w: 36 } },
        { pat: 'bubbleSpiral', at: 0, every: 6, tele: 0, dmg: 4, p: { rate: 8, spin: 60, speed: 160, dur: 6 } },
        { pat: 'adds', at: 2, every: 8, tele: 0, dmg: 0, n: 6 },
      ] },
    ],
    p: {},
  },
  mirage: {
    id: 'mirage', map: 'lake', wave: 20, K: 1200, contact: 37, r: 60,
    phases: [
      { from: 1, move: 'drift', speed: 60, script: [
        { pat: 'pearlFan', at: 1, every: 2.5, tele: 0.8, dmg: r1(10 * W20), n: 5, p: { fan: 60, speed: 220 } },
        { pat: 'mirages', at: 4, every: 12, tele: 0.8, dmg: 0, n: 3, p: { hits: 3, attack: 0 } },
      ] },
      { from: 0.6, move: 'drift', speed: 70, script: [
        { pat: 'pearlFan', at: 1, every: 2.5, tele: 0.8, dmg: r1(10 * W20), n: 5, p: { fan: 60, speed: 220 } },
        { pat: 'mirages', at: 2, every: 10, tele: 0.8, dmg: r1(9 * W20), n: 3, p: { hits: 3, attack: 1, pct: 0.5 } },
      ] },
      { from: 0.25, move: 'anchor', speed: 0, script: [
        { pat: 'mirageWall', at: 0, every: 20, tele: 1.0, dmg: r1(8 * W20), p: { to: 300, dur: 20, tick: 0.5, gap: 60, spin: 20 } },
        { pat: 'pearlFan', at: 2, every: 3, tele: 0.8, dmg: r1(10 * W20), n: 5, p: { fan: 60, speed: 220 } },
      ] },
    ],
    p: {},
  },
  moonwater: {
    id: 'moonwater', map: 'lake', wave: 30, K: 700, contact: 120, r: 60,
    phases: [
      { from: 1, move: 'anchor', speed: 0, script: [
        { pat: 'gapRings', at: 1, every: 2, tele: 0.8, dmg: r1(14 * W30), p: { gaps: 2, gapDeg: 40, speed: 240 } },
      ] },
      { from: 0.6, move: 'drift', speed: 50, script: [
        { pat: 'reflections', at: 0.5, every: 14, tele: 0.8, dmg: r1(10 * W30), n: 4, p: { ripple: 1 } },
        { pat: 'gapRings', at: 3, every: 3, tele: 0.8, dmg: r1(14 * W30), p: { gaps: 2, gapDeg: 40, speed: 240 } },
      ] },
      { from: 0.25, move: 'anchor', speed: 0, script: [
        { pat: 'monkeyChain', at: 0.5, every: 7, tele: 1.0, dmg: r1(10 * W30), n: 8, p: { root: 1 } },
        { pat: 'homingShards', at: 2, every: 3, tele: 0.6, dmg: r1(8 * W30), n: 4, p: { speed: 200, homing: 0.8 } },
      ] },
    ],
    p: {},
  },
  // ─────────────────────────────── 墨林
  kui: {
    id: 'kui', map: 'forest', wave: 10, K: 1300, contact: 7, r: 56,
    phases: [
      { from: 1, move: 'chase', speed: 70, script: [
        { pat: 'stomp', at: 0.75, every: 1.5, tele: 0.75, dmg: 7, p: { to: 600, speed: 300, gaps: 2, gapDeg: 45, turn: 1 } },
      ] },
      { from: 0.6, move: 'chase', speed: 80, script: [
        { pat: 'stomp', at: 0.375, every: 0.75, tele: 0.375, dmg: 7, p: { to: 600, speed: 300, gaps: 1, gapDeg: 45, alternate: 1 } },
      ] },
      { from: 0.25, move: 'chase', speed: 80, script: [
        { pat: 'stomp', at: 0.375, every: 0.75, tele: 0.375, dmg: 7, p: { to: 600, speed: 300, gaps: 1, gapDeg: 45, syncopate: 1 } },
        { pat: 'lightningRing', at: 2, every: 3, tele: 1.0, dmg: 7, p: { r: 70, n: 2 } },
        { pat: 'drumCrack', at: 0, every: 12, tele: 0, dmg: 0, p: { stomps: 8, x: 2, dur: 4 } },
      ] },
    ],
    p: { bpm: 80 },
  },
  fox: {
    id: 'fox', map: 'forest', wave: 20, K: 1200, contact: 37, r: 54,
    phases: [
      { from: 1, move: 'drift', speed: 90, script: [
        { pat: 'foxfireSpiral', at: 0.5, every: 5, tele: 0.6, dmg: r1(12 * W20), p: { rate: 6, spin: 50, speed: 180, dur: 3 } },
        { pat: 'tailLash', at: 2.5, every: 5, tele: 0.9, dmg: r1(12 * W20), p: { deg: 70, r: 260 } },
        { pat: 'charmGlyph', at: 4, every: 9, tele: 1.0, dmg: 0, p: { reverse: 1.5, slow: 40, r: 90 } },
      ] },
      { from: 0.6, move: 'drift', speed: 100, script: [
        { pat: 'illusions', at: 0.5, every: 12, tele: 0.8, dmg: r1(12 * W20), n: 3, p: { attack: 1 } },
        { pat: 'foxfireSpiral', at: 3, every: 5, tele: 0.6, dmg: r1(12 * W20), p: { rate: 6, spin: 50, speed: 180, dur: 3 } },
      ] },
      { from: 0.25, move: 'rim', speed: 110, script: [
        { pat: 'tailSweep', at: 0.5, every: 2.5, tele: 1.2, dmg: r1(14 * W20), p: { w: 90, len: 1200 } },
        { pat: 'charmGlyph', at: 5, every: 10, tele: 1.0, dmg: 0, p: { reverse: 1.5, slow: 40, r: 90 } },
      ] },
    ],
    p: { tails: 9, tailPer: 0.11 },
  },
  xingtian: {
    id: 'xingtian', map: 'forest', wave: 30, K: 700, contact: 120, r: 64,
    phases: [
      { from: 1, move: 'chase', speed: 90, script: [
        { pat: 'cleave', at: 1, every: 4, tele: 1.1, dmg: r1(22 * W30), n: 3, p: { deg: 120, r: 320 } },
      ] },
      { from: 0.6, move: 'stalk', speed: 90, script: [
        { pat: 'shieldCharge', at: 0.5, every: 4, tele: 0.8, dmg: r1(18 * W30), p: { bounces: 3, speed: 600, w: 70 } },
        { pat: 'cleave', at: 2.5, every: 5, tele: 1.1, dmg: r1(22 * W30), n: 1, p: { deg: 120, r: 320 } },
      ] },
      { from: 0.25, move: 'chase', speed: 100, script: [
        { pat: 'axeDance', at: 0.5, every: 5, tele: 0.8, dmg: r1(20 * W30), p: { arcs: 3, spin: 90, ring: 1 } },
        { pat: 'verseZones', at: 1.5, every: 7, tele: 1.2, dmg: r1(20 * W30), n: 5, p: { r: 90 } },
      ] },
    ],
    p: {},
  },
  // ─────────────────────────────── 广寒
  wugang: {
    id: 'wugang', map: 'palace', wave: 10, K: 1300, contact: 7, r: 54,
    phases: [
      { from: 1, move: 'anchor', speed: 0, script: [
        { pat: 'chopTree', at: 1, every: 4, tele: 0.8, dmg: 7, n: 2, p: { heal: 0.02 } },
      ] },
      { from: 0.6, move: 'drift', speed: 60, script: [
        { pat: 'axeBarrage', at: 0.5, every: 4, tele: 0.8, dmg: 7, n: 3, p: { fly: 360 } },
        { pat: 'chopWave', at: 2.5, every: 4, tele: 0.8, dmg: 7, p: { r: 180 } },
      ] },
      { from: 0.25, move: 'drift', speed: 70, script: [
        { pat: 'twinTrees', at: 0, every: 30, tele: 0, dmg: 0, n: 2 },
        { pat: 'treeFall', at: 3, every: 5, tele: 1.5, dmg: 11, p: { w: 80, len: 1400 } },
        { pat: 'axeBarrage', at: 1.5, every: 4, tele: 0.8, dmg: 7, n: 3, p: { fly: 360 } },
      ] },
    ],
    p: { treeHp: 800, felledStun: 4 },
  },
  goldtoad: {
    id: 'goldtoad', map: 'palace', wave: 20, K: 1200, contact: 37, r: 60,
    phases: [
      { from: 1, move: 'drift', speed: 50, script: [
        { pat: 'tongueLash', at: 1, every: 3.5, tele: 0.8, dmg: r1(12 * W20), p: { len: 400, pull: 120, w: 30 } },
        { pat: 'eatMoon', at: 0, every: 1, tele: 0, dmg: 0, p: { r: 200, sizePer10: 0.02, dmgPer10: 0.01 } },
      ] },
      { from: 0.6, move: 'drift', speed: 50, script: [
        { pat: 'goldRain', at: 0.5, every: 4, tele: 0.8, dmg: r1(8 * W20), n: 16, p: { r: 60, moon: 1 } },
        { pat: 'tongueLash', at: 2.5, every: 4, tele: 0.8, dmg: r1(12 * W20), p: { len: 400, pull: 120, w: 30 } },
      ] },
      { from: 0.25, move: 'leap', speed: 0, script: [
        { pat: 'bounce', at: 0.5, every: 2.2, tele: 1.0, dmg: r1(12 * W20), p: { r: 130 } },
        { pat: 'goldRain', at: 3, every: 6, tele: 0.8, dmg: r1(8 * W20), n: 10, p: { r: 60, moon: 1 } },
      ] },
    ],
    p: { growPer10: 0.02, dmgPer10: 0.01, refund: 1.5 },
  },
  eclipse: {
    id: 'eclipse', map: 'palace', wave: 30, K: 700, contact: 120, r: 64,
    phases: [
      { from: 1, move: 'stalk', speed: 110, script: [
        { pat: 'lunge', at: 1, every: 4, tele: 0.8, dmg: r1(20 * W30), n: 3, p: { len: 420, w: 60 } },
        { pat: 'bite', at: 3, every: 4, tele: 0.8, dmg: r1(24 * W30), p: { deg: 60, r: 200 } },
      ] },
      { from: 0.6, move: 'stalk', speed: 110, script: [
        { pat: 'swallowMoon', at: 0, every: 30, tele: 1.0, dmg: 0, p: { dur: 15, light: 260 } },
        { pat: 'lunge', at: 2, every: 4, tele: 0.8, dmg: r1(20 * W30), n: 3, p: { len: 420, w: 60 } },
      ] },
      { from: 0.25, move: 'anchor', speed: 0, script: [
        { pat: 'moonCross', at: 0.5, every: 12, tele: 1.2, dmg: r1(20 * W30), n: 4, p: { spin: 30, dur: 10, w: 40 } },
        { pat: 'lunge', at: 4, every: 5, tele: 0.8, dmg: r1(20 * W30), n: 2, p: { len: 420, w: 60 } },
      ] },
    ],
    p: {},
  },
};

/** Endless bosses (GDD §14.4): 双生 at 40, 60, 70, 80, 90 …; 镜主 at 50, 100, …. */
export const ENDLESS_BOSS = {
  /** 双生: two of the map's bosses, each at 70% of 700 · HP(w)/HP₀, plus one extra 镜蚀 for the fight. */
  twins: { hpX: 0.7, K: 700, extraMutator: 1 },
  /** 镜主: 80% of the wave's boss HP; your weapons at 50%, your skill at 1.5× cd, +10% per copy every 20 s below 50%. */
  mirrorself: { hpX: 0.8, K: 700, weaponPct: 0.5, skillCdX: 1.5, copyEvery: 20, copyAt: 0.5, copyDmg: 0.1 },
  /** Boss contact in endless follows wave 30's. */
  contact: 120,
  every: 50,
} as const;
