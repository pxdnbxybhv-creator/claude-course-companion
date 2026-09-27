// 水月幻镜 · the wave's deterministic spawn list (GDD §5.1, §13, §14). Stream 'spawn' of (seed, w).
import { AFFIX_REG, MAP_REG, type AffixId, type BossId, type EliteId, type MonsterId } from '../ids';
import type { RunSave, SpawnGroup, SpawnPlan } from '../types';
import { DIFFS, ELITES, ENDLESS_BOSS, F, MAPS, MONSTERS, TREASURES } from '../data';
import {
  affixCount, bossHp, budget, computeStats, dmgX, eliteCount, hpX, isBossWave, isHordeWave, luckMult, mutatorValue, spdX, termP, waveLen,
} from './formulas';
import { pickDistinct, rngFor, weighted } from './rng';

/** Monsters that may spawn at wave w: the map's roster (every roster from wave 31), `from ≤ w`. */
export function rosterAt(run: Pick<RunSave, 'map'>, w: number): MonsterId[] {
  const ids = w > 30 ? [...new Set(MAP_REG.flatMap((m) => MAPS[m.id].roster))] : MAPS[run.map].roster.slice();
  return ids.filter((id) => MONSTERS[id].from <= w);
}
/** Group interval g (s): 2.5 to wave 10, 2.0 to 20, 1.6 after. */
export function groupEvery(w: number): number {
  for (const [to, g] of F.groupEvery) if (w <= to) return g;
  return 1.6;
}
/** The map's elites (endless: every map's). */
function elitePool(run: RunSave, w: number): EliteId[] {
  return w > 30 ? MAP_REG.flatMap((m) => [...MAPS[m.id].elites]) : [...MAPS[run.map].elites];
}
/** 双生 pairs cycle through the map's three bosses. */
const PAIRS: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [0, 2]];
/** The boss (or bosses) of a boss wave. */
export function bossesAt(run: RunSave, w: number): { ids: (BossId | 'mirrorself')[]; hp: number; twins: boolean } | null {
  if (!isBossWave(w)) return null;
  const map = MAPS[run.map];
  if (w <= 30) {
    const id = map.bosses[w / 10 - 1];
    const tw = w === 20 ? DIFFS[run.diff].twins20 : undefined;
    const hp = bossHp(w, run);
    return tw ? { ids: [id, id], hp: hp * tw, twins: true } : { ids: [id], hp, twins: false };
  }
  const base = ENDLESS_BOSS.twins.K * hpX(w, run) * (1 + termP(run, 'bossHp') / 100);
  if (w % ENDLESS_BOSS.every === 0) return { ids: ['mirrorself'], hp: base * ENDLESS_BOSS.mirrorself.hpX, twins: false };
  let k = 0;
  for (let x = 40; x <= w; x += 10) if (x % ENDLESS_BOSS.every !== 0) k++;
  const [a, c] = PAIRS[(k - 1) % PAIRS.length];
  return { ids: [map.bosses[a], map.bosses[c]], hp: base * ENDLESS_BOSS.twins.hpX, twins: true };
}

/** The wave's spawn plan: groups, elites (with 镜印), treasures, the boss, scaling and planned kills. */
export function wavePlan(run: RunSave, w: number): SpawnPlan {
  const rng = rngFor(run.seed, w, 'spawn');
  const boss = isBossWave(w);
  const L = waveLen(w, run);
  const horde = !boss && isHordeWave(w);
  const stats = computeStats(run);
  // groups
  const roster = rosterAt(run, w);
  const weights = roster.map((id) => MONSTERS[id].weight);
  let B = budget(w, run);
  if (boss) B *= F.bossAddsFrac * (1 + termP(run, 'adds') / 100);
  const burst = Math.max(1, termP(run, 'burst'));
  const g = groupEvery(w) * burst;
  const end = boss ? F.bossAddsWindow : (L ?? 60) - F.waveLen.quiet;
  const window = boss ? F.bossAddsWindow : (L ?? 60) - F.groupWindowPad;
  const perGroup = (B * g) / window;
  const groups: SpawnGroup[] = [];
  let carry = 0;
  let kills = 0;
  for (let t = F.firstGroup; t <= end + 1e-9; t += g) {
    const inHorde = horde && L !== null && t >= F.hordeBoost[0] * L && t <= F.hordeBoost[1] * L;
    carry += perGroup * (inHorde ? F.hordeBoost[2] : 1);
    const i = weighted(rng, weights);
    if (i < 0) continue;
    const m = MONSTERS[roster[i]];
    // a group is packs of one type: as many as the carried budget buys (at most 3 packs), the rest carries on
    const n = Math.min(3 * m.pack * burst, Math.floor(carry / m.cost + 1e-9));
    if (n < 1) continue;
    groups.push({ t: Math.round(t * 100) / 100, id: m.id, n });
    carry -= n * m.cost;
    kills += n;
  }
  // elites
  const pairs = Math.max(1, Math.round(mutatorValue(run, 'shuangjing', w)));
  const nElite = boss ? 0 : eliteCount(w, run.diff) * (pairs > 1 ? pairs : 1);
  const nAffix = affixCount(w, run.diff);
  const pool = elitePool(run, w);
  const elites: { t: number; id: EliteId; affixes: AffixId[] }[] = [];
  for (let i = 0; i < nElite; i++) {
    const id = pool[Math.floor(rng() * pool.length)];
    const affixes = nAffix ? pickDistinct(rng, AFFIX_REG.map((a) => a.id), nAffix) : [];
    elites.push({ t: Math.round((F.eliteAt * (L ?? 60) + 2 * i) * 100) / 100, id: ELITES[id].id, affixes });
  }
  // treasures (per wave, luck-scaled)
  const treasures: { t: number; id: 'pixiu' | 'mirrorflower' }[] = [];
  if (!boss) {
    const lm = luckMult(stats.luck);
    const span = L ?? 60;
    const u1 = rng(), t1 = rng(), u2 = rng(), t2 = rng();
    if (w >= TREASURES.pixiu.from && u1 < TREASURES.pixiu.chance * lm) treasures.push({ t: Math.round((0.15 + 0.55 * t1) * span * 100) / 100, id: 'pixiu' });
    if (w >= TREASURES.mirrorflower.from && u2 < TREASURES.mirrorflower.chance * lm) treasures.push({ t: Math.round((0.2 + 0.5 * t2) * span * 100) / 100, id: 'mirrorflower' });
  }
  const kind: SpawnPlan['kind'] = boss ? 'boss' : horde ? 'horde' : elites.length ? 'elite' : 'normal';
  return {
    wave: w, len: L, kind, hpX: hpX(w, run), dmgX: dmgX(w, run), spdX: spdX(w, run),
    groups, elites, treasures, boss: bossesAt(run, w), kills,
  };
}

/** Total 月华 a plan offers (threat points + elite/boss drops), for sims and previews. */
export function planMoon(plan: SpawnPlan): number {
  let m = 0;
  for (const gr of plan.groups) m += gr.n * MONSTERS[gr.id].cost;
  m += plan.elites.length * F.eliteMoon;
  if (plan.boss) m += F.bossMoon * plan.boss.ids.length;
  for (const t of plan.treasures) m += TREASURES[t.id].p.moon ?? 0;
  return m;
}
/** Total enemy HP a plan throws at you (horde members at 60%), for sims and the shop's DPS readout. */
export function planHp(plan: SpawnPlan): number {
  let h = 0;
  const hm = plan.kind === 'horde' ? F.hordeHp : 1;
  for (const gr of plan.groups) {
    const m = MONSTERS[gr.id];
    h += gr.n * m.hp * plan.hpX * hm * (m.child ? 1 + (m.child.n * m.child.hp) / m.hp : 1);
  }
  for (const e of plan.elites) h += ELITES[e.id].hp * plan.hpX;
  if (plan.boss) h += plan.boss.hp * plan.boss.ids.length;
  return h;
}
