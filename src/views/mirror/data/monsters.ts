// 水月幻镜 · 36 monsters, 6 named elites, 2 treasures (GDD §13; wave-1 照影 values, scaled by logic).
// `p` holds the role timings and sizes the engine's behaviours read (seconds, u, u/s, fractions).
import type { EliteId, MonsterId, TreasureId } from '../ids';
import type { EliteDef, MonsterDef, TreasureDef } from '../types';

export const MONSTERS: Readonly<Record<MonsterId, MonsterDef>> = {
  // shared
  blot: { id: 'blot', map: 'all', role: 'chaser', ai: 'chase', hp: 6, dmg: 2, speed: 140, armor: 0, cost: 1, from: 1, pack: 3, weight: 10, tags: [], resist: 0, p: { wobble: 0.3 } },
  paperman: { id: 'paperman', map: 'all', role: 'lunger', ai: 'dash', hp: 10, dmg: 3, speed: 110, armor: 0, cost: 1, from: 2, pack: 2, weight: 6, tags: ['paper'], resist: 0, p: { every: 3, tell: 0.6, lunge: 120, dashSpeed: 480 } },
  shard: { id: 'shard', map: 'all', role: 'splitter', ai: 'chase', hp: 14, dmg: 3, speed: 120, armor: 0, cost: 2, from: 4, pack: 1, weight: 4, tags: [], resist: 0, child: { n: 2, hp: 4, dmg: 3, speed: 180 }, p: {} },
  lantern: { id: 'lantern', map: 'all', role: 'shooter', ai: 'keep', hp: 8, dmg: 3, speed: 120, armor: 0, cost: 2, from: 3, pack: 1, weight: 4, tags: ['ghost'], resist: 0, shot: 'eFireball', p: { keep: 320, every: 2.5, tell: 0.8, shotSpeed: 220 } },
  // 月湖
  tadpole: { id: 'tadpole', map: 'lake', role: 'swarm', ai: 'formation', hp: 3, dmg: 1, speed: 190, armor: 0, cost: 0.5, from: 1, pack: 6, weight: 8, tags: [], resist: 0, r: 9, p: { zigzag: 0.6, amp: 40 } },
  shrimp: { id: 'shrimp', map: 'lake', role: 'charger', ai: 'dash', hp: 8, dmg: 4, speed: 130, armor: 0, cost: 1, from: 2, pack: 2, weight: 6, tags: [], resist: 0, p: { tell: 0.8, dashSpeed: 520, dash: 0.5, every: 3 } },
  frog: { id: 'frog', map: 'lake', role: 'leaper', ai: 'hop', hp: 10, dmg: 3, speed: 100, armor: 0, cost: 1, from: 3, pack: 2, weight: 6, tags: ['hopper'], resist: 0, p: { hop: 160, every: 1.6, tell: 0.5, ring: 50 } },
  crab: { id: 'crab', map: 'lake', role: 'tank', ai: 'chase', hp: 30, dmg: 4, speed: 90, armor: 2, cost: 3, from: 5, pack: 1, weight: 4, tags: ['front'], resist: 0.5, r: 20, p: { frontDeg: 120, frontX: 0.4, sideways: 1 } },
  lotuspod: { id: 'lotuspod', map: 'lake', role: 'turret', ai: 'still', hp: 20, dmg: 3, speed: 0, armor: 0, cost: 2, from: 6, pack: 1, weight: 3, tags: [], resist: 1, shot: 'eSeed', p: { every: 3, tell: 0.7, n: 3, fan: 30, shotSpeed: 200 } },
  jelly: { id: 'jelly', map: 'lake', role: 'exploder', ai: 'chase', hp: 6, dmg: 6, speed: 130, armor: 0, cost: 1, from: 7, pack: 2, weight: 4, tags: [], resist: 0, p: { fuse: 0.8, r: 90 } },
  clam: { id: 'clam', map: 'lake', role: 'spawner', ai: 'chase', hp: 25, dmg: 0, speed: 40, armor: 1, cost: 3, from: 8, pack: 1, weight: 2, tags: [], resist: 0.5, r: 18, p: { every: 5, shut: 1, n: 3 } },
  // ⚖3: egret 6 → 5 (the harness's top killer in waves 11–19 on 月湖: a lane across the whole arena, every ~5 s each)
  egret: { id: 'egret', map: 'lake', role: 'diver', ai: 'content', hp: 12, dmg: 5, speed: 900, armor: 0, cost: 2, from: 11, pack: 1, weight: 3, tags: [], resist: 0, p: { tell: 0.8, diveSpeed: 900, rest: 2 } },
  weed: { id: 'weed', map: 'lake', role: 'ambusher', ai: 'still', hp: 8, dmg: 2, speed: 0, armor: 0, cost: 1, from: 12, pack: 1, weight: 3, tags: [], resist: 1, p: { tell: 0.9, root: 0.8, life: 6, r: 40 } },
  drowned: { id: 'drowned', map: 'lake', role: 'blinker', ai: 'burrow', hp: 16, dmg: 4, speed: 120, armor: 0, cost: 2, from: 14, pack: 1, weight: 4, tags: ['ghost'], resist: 0, p: { under: 1.2, tell: 0.5, near: 150, every: 4 } },
  // 墨林
  rat: { id: 'rat', map: 'forest', role: 'swarm', ai: 'burrow', hp: 4, dmg: 2, speed: 240, armor: 0, cost: 0.5, from: 1, pack: 5, weight: 8, tags: [], resist: 0, r: 10, p: { surface: 200 } },
  foxfire: { id: 'foxfire', map: 'forest', role: 'circler', ai: 'orbit', hp: 8, dmg: 2, speed: 200, armor: 0, cost: 1, from: 2, pack: 2, weight: 6, tags: ['ghost'], resist: 0, p: { orbitR: 220, circle: 2, tell: 0.5, dashSpeed: 460, burn: 1, burnDur: 3 } },
  imp: { id: 'imp', map: 'forest', role: 'thrower', ai: 'keep', hp: 18, dmg: 3, speed: 130, armor: 0, cost: 2, from: 4, pack: 1, weight: 5, tags: [], resist: 0, shot: 'eStone', p: { keep: 300, every: 3, tell: 1, ring: 50, lead: 1 } },
  umbrella: { id: 'umbrella', map: 'forest', role: 'deflector', ai: 'hop', hp: 20, dmg: 4, speed: 110, armor: 0, cost: 3, from: 6, pack: 1, weight: 3, tags: ['paper', 'deflect'], resist: 0, r: 18, p: { frontDeg: 90, hop: 60, every: 0.8 } },
  wolf: { id: 'wolf', map: 'forest', role: 'pack', ai: 'orbit', hp: 10, dmg: 4, speed: 230, armor: 0, cost: 1, from: 7, pack: 4, weight: 4, tags: [], resist: 0, p: { orbitR: 240, circle: 2, howl: 0.8, pounceGap: 0.3, pounceSpeed: 520 } },
  ghostlamp: { id: 'ghostlamp', map: 'forest', role: 'healer', ai: 'keep', hp: 15, dmg: 0, speed: 110, armor: 0, cost: 3, from: 8, pack: 1, weight: 2, tags: ['ghost'], resist: 0, p: { keep: 360, healR: 180, healPct: 0.04 } },
  spider: { id: 'spider', map: 'forest', role: 'webber', ai: 'keep', hp: 12, dmg: 3, speed: 170, armor: 0, cost: 2, from: 9, pack: 1, weight: 4, tags: [], resist: 0, p: { keep: 260, every: 4, tell: 0.8, webR: 70, webLife: 5, slow: 0.4 } },
  panda: { id: 'panda', map: 'forest', role: 'roller', ai: 'dash', hp: 60, dmg: 6, speed: 100, armor: 2, cost: 5, from: 12, pack: 1, weight: 2, tags: [], resist: 0.7, r: 24, p: { tell: 0.8, rollSpeed: 420, roll: 1.5, every: 5 } },
  stick: { id: 'stick', map: 'forest', role: 'ambusher', ai: 'still', hp: 16, dmg: 5, speed: 150, armor: 0, cost: 2, from: 13, pack: 1, weight: 4, tags: [], resist: 0, p: { near: 200, tell: 0.5, burstSpeed: 380, hide: 1 } },
  toadstool: { id: 'toadstool', map: 'forest', role: 'spore', ai: 'chase', hp: 14, dmg: 2, speed: 70, armor: 0, cost: 1, from: 15, pack: 2, weight: 3, tags: [], resist: 0, p: { cloudR: 80, cloudLife: 4, cloudDps: 2 } },
  woodghost: { id: 'woodghost', map: 'forest', role: 'thrower', ai: 'keep', hp: 24, dmg: 5, speed: 120, armor: 1, cost: 3, from: 16, pack: 1, weight: 3, tags: ['ghost'], resist: 0, shot: 'eAxe', p: { keep: 280, every: 3.5, tell: 0.6, fly: 360, boomerang: 1 } },
  // 广寒
  shadowhare: { id: 'shadowhare', map: 'palace', role: 'leaper', ai: 'hop', hp: 12, dmg: 4, speed: 120, armor: 0, cost: 1, from: 1, pack: 2, weight: 8, tags: ['hopper'], resist: 0, p: { hop: 180, every: 1.2, tell: 0.4, ring: 50 } },
  crow: { id: 'crow', map: 'palace', role: 'hunter', ai: 'orbit', hp: 6, dmg: 3, speed: 300, armor: 0, cost: 1, from: 3, pack: 4, weight: 5, tags: ['hunter'], resist: 0, r: 10, p: { orbitR: 200, circle: 1.5, tell: 0.6, diveSpeed: 520 } },
  soldier: { id: 'soldier', map: 'palace', role: 'formation', ai: 'formation', hp: 25, dmg: 5, speed: 120, armor: 3, cost: 3, from: 5, pack: 4, weight: 3, tags: ['shieldline'], resist: 0.5, p: { gap: 34, shieldX: 0.2 } },
  frost: { id: 'frost', map: 'palace', role: 'orbiter', ai: 'orbit', hp: 18, dmg: 3, speed: 180, armor: 0, cost: 2, from: 6, pack: 1, weight: 4, tags: [], resist: 0, shot: 'eFrost', p: { orbitR: 260, every: 2, tell: 0.5, slow: 0.3, slowDur: 1.5, shotSpeed: 240 } },
  guihua: { id: 'guihua', map: 'palace', role: 'splitter', ai: 'chase', hp: 12, dmg: 3, speed: 150, armor: 0, cost: 2, from: 7, pack: 2, weight: 5, tags: [], resist: 0, child: { n: 4, hp: 3, dmg: 3, speed: 120 }, p: { homing: 0.6 } },
  toad: { id: 'toad', map: 'palace', role: 'thief', ai: 'chase', hp: 30, dmg: 4, speed: 90, armor: 1, cost: 3, from: 9, pack: 1, weight: 3, tags: [], resist: 0.5, r: 20, p: { eatR: 150, tell: 0.7, tongue: 300, pull: 120, every: 4, refund: 1.2 } },
  star: { id: 'star', map: 'palace', role: 'laser', ai: 'keep', hp: 14, dmg: 6, speed: 100, armor: 0, cost: 2, from: 11, pack: 2, weight: 3, tags: [], resist: 0, p: { keep: 260, tell: 1.2, beam: 0.6, every: 5, apart: 300 } },
  clerk: { id: 'clerk', map: 'palace', role: 'artillery', ai: 'keep', hp: 14, dmg: 7, speed: 110, armor: 0, cost: 2, from: 13, pack: 1, weight: 3, tags: [], resist: 0, p: { keep: 320, every: 3.5, tell: 1.2, ring: 70 } },
  dancer: { id: 'dancer', map: 'palace', role: 'reflector', ai: 'chase', hp: 30, dmg: 4, speed: 140, armor: 0, cost: 3, from: 15, pack: 1, weight: 3, tags: ['reflect'], resist: 0, p: { every: 5, spin: 2, reflectPct: 0.5, near: 140, tell: 0.6, cone: 90, coneR: 160 } },
  axeshade: { id: 'axeshade', map: 'palace', role: 'spinner', ai: 'chase', hp: 36, dmg: 6, speed: 100, armor: 2, cost: 4, from: 17, pack: 1, weight: 3, tags: ['ghost'], resist: 0.5, r: 18, p: { axes: 3, orbitR: 70, rev: 0.8 } },
  skypup: { id: 'skypup', map: 'palace', role: 'hunter', ai: 'dash', hp: 11, dmg: 4, speed: 150, armor: 0, cost: 1, from: 19, pack: 2, weight: 4, tags: ['hunter'], resist: 0, p: { tell: 0.5, chargeSpeed: 480, dimR: 220, every: 3 } },
};

/** Named elites (GDD §13.1): drop 12 月华 and a 镜奁, knockback resist 0.7, gold seal and a drum on entry. */
export const ELITES: Readonly<Record<EliteId, EliteDef>> = {
  turtle: { id: 'turtle', map: 'lake', hp: 160, dmg: 6, speed: 80, armor: 3, tags: [], r: 30, p: { shellSpeed: 500, bounces: 3, tell: 0.8, exposed: 2, exposedX: 2, every: 7 } },
  whitesnake: { id: 'whitesnake', map: 'lake', hp: 130, dmg: 5, speed: 150, armor: 0, tags: [], r: 22, p: { every: 5, lines: 3, tell: 1.0, gap: 90, curve: 0.8 } },
  tiger: { id: 'tiger', map: 'forest', hp: 150, dmg: 7, speed: 160, armor: 1, tags: [], r: 28, p: { roar: 0.8, roarR: 300, slow: 0.3, leaps: 3, tell: 0.7, every: 7 } },
  painted: { id: 'painted', map: 'forest', hp: 120, dmg: 6, speed: 110, armor: 0, tags: ['ghost', 'paper'], r: 20, p: { reveal: 0.8, near: 150, fast: 300, slashes: 3, tell: 0.5 } },
  general: { id: 'general', map: 'palace', hp: 180, dmg: 8, speed: 110, armor: 4, tags: ['shieldline'], r: 28, p: { shieldX: 0.2, thrust: 350, tell: 1.0, callEvery: 10, call: 2 } },
  hound: { id: 'hound', map: 'palace', hp: 140, dmg: 7, speed: 200, armor: 1, tags: ['hunter'], r: 24, p: { dashes: 3, tell: 0.5, dashSpeed: 600, howlEvery: 9, call: 3 } },
};

/** Treasure beasts (GDD §13.2). `chance` is per wave before 福缘. */
export const TREASURES: Readonly<Record<TreasureId, TreasureDef>> = {
  pixiu: { id: 'pixiu', from: 3, chance: 1 / 6, hp: 30, life: 20, p: { fleeX: 1.1, moon: 20, crate: 1, cash: 0.12 } },
  mirrorflower: { id: 'mirrorflower', from: 5, chance: 0.003, hp: 1, life: 8, p: { drift: 60, heart: 1 } },
};
