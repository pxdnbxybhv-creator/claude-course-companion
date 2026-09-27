// 水月幻镜 · 镜衡 in vitest: a bot that plays whole runs through the real logic (newRun, cards, crates,
// 镜心, the shop, endWave, the coin plan) with a *simplified* combat step in place of the engine.
// The step ports the reference sim's shape (scratchpad sim/model.js): per-weapon hit models × crit ×
// 攻速 × targets per hit, crowd pressure against armour / dodge / regen, bosses by single-target DPS.
// It is a smoke and determinism harness for logic, not the tuning model: numbers from it are rough.
import type { ArchetypeId, ItemId, MapId, WeaponId } from '../ids';
import type { CharacterId, CoinDrop, DiffIndex, MirrorMeta, RunSave, Stats, StatId, Unlocks, WaveResult, WeaponDef } from '../types';
import { ARCHETYPES, COMPANIONS, ELITES, F, ITEMS, MONSTERS, WEAPONS } from '../data';
import {
  allUnlocked, armorMult, beginWave, buy, cardsView, computeStats, cooldown, crateItem, dodgeCapOf, dodgeChance, endWave,
  heartOffer, luckMult, merge, meltValue, openShop, perTier, pickCard, pickHeart, pickStart, planHp, planMoon, procCoef,
  regenPerSec, rerollCost, reroll, resolveCrate, rngFor, screenOf, shopView, tierCd, waveLen, wavePlan, weaponHit, coinPlan,
  bankSleeve, isBossWave, xpNext,
} from '../logic';
import { newRun } from '../logic/run';

export interface BotOpts {
  seed: number;
  char: CharacterId;
  arch?: ArchetypeId;
  map?: MapId;
  diff?: DiffIndex;
  maxWave?: number;
  beginner?: boolean;
  unlocks?: Unlocks;
}
export interface BotWave { w: number; dps: number; need: number; q: number; hurt: number; hp: number; moon: number; lvl: number }
export interface BotRun { W: number; dead: boolean; run: RunSave; log: BotWave[]; coins: number; meta: MirrorMeta }

// ───────────────────────────────────────────── the build as numbers
/** Targets a weapon's hit reaches in a crowd of density d (0..1). */
function targetsOf(def: WeaponDef, t: 1 | 2 | 3 | 4, s: Stats, d: number): number {
  const pierce = perTier(def.p.pierce as number | undefined, t) + s.pierce;
  const aoe = (k: number) => 1 + (k - 1) * d * (1 + s.area / 100);
  switch (def.kind) {
    case 'thrust': return 1 + pierce * 0.6 * d;
    case 'combo': return perTier(def.p.hits, t, 1) * aoe(1.4);
    case 'sweep': return aoe(3.2);
    case 'smash': case 'slam': return aoe(2.4);
    case 'punch': return aoe(1.8);
    case 'projectile': return 1 + (perTier(def.p.bounce, t) + pierce) * 0.7 * d;
    case 'burst': return perTier(def.p.bolts, t, 3);
    case 'hook': return perTier(def.p.hooks, t, 1);
    case 'launch': return (1 + s.swords * F.swordExtra) * (1 + pierce * 0.6 * d) * (1 + perTier(def.p.ret, t) * 0.6);
    case 'orbit': return (perTier(def.p.blades, t, 2) + s.swords) * aoe(1.6) * 0.8;
    case 'homing': return 1 + s.swords * F.swordExtra * (def.classes.includes('flying') ? 1 : 0);
    case 'rain': return (perTier(def.p.n, t, 3) + s.swords) * aoe(1.5) * 0.7;
    case 'chain': { const j = perTier(def.p.jumps, t, 2); let tot = 1, f = 1; for (let i = 0; i < j; i++) { f *= 0.85; tot += f * d; } return tot; }
    case 'lob': return aoe(2.6);
    case 'pulse': return aoe(3.4);
    case 'beam': return aoe(2.6) * perTier(def.p.fork, t, 1);
    case 'boomerang': return aoe(2.8) * perTier(def.p.discs, t, 1);
    // summons: creatures alive (≤ cap) × their attacks per painting cooldown
    case 'paint': return Math.min(Math.max(1, s.summonCap), perTier(def.p.life, t, 10) / def.cd) * (def.cd / perTier(def.p.atk, t, 0.8)) * aoe(1.3);
    case 'turret': return Math.min(Math.max(1, s.summonCap), perTier(def.p.life, t, 8) / def.cd) * (def.cd / perTier(def.p.atk, t, 0.8)) * perTier(def.p.blobs, t, 1);
    case 'familiar': return 1;
    case 'mine': return aoe(2.8);
  }
}
/** Area and single-target DPS of the run against a crowd of density d with average armour `armor`. */
export function buildDps(run: RunSave, s: Stats, d: number, armor: number): { area: number; single: number } {
  let area = 0, single = 0;
  for (const wp of run.weapons) {
    const def = WEAPONS[wp.id];
    const h = weaponHit(run, s, wp.id, wp.t);
    const hit = Math.max(1, h.raw * h.mult - armor) * (1 + h.crit * (h.critM - 1));
    const half = def.kind === 'paint' || def.kind === 'turret' || def.kind === 'mine';
    const cd = cooldown(tierCd(def, wp.t), s.aspd, half);
    const n = targetsOf(def, wp.t, s, d);
    area += (hit * n) / cd;
    single += (hit * Math.min(n, def.kind === 'orbit' ? 2 : 1.5)) / cd;
  }
  // skills and the rest of the kit, roughly a fifth on top
  return { area: area * 1.2, single: single * 1.15 };
}

// ───────────────────────────────────────────── the policy
function prefers(arch: ArchetypeId) {
  const a = ARCHETYPES[arch];
  return { weapons: new Set<WeaponId>(a.weapons), keys: new Set<ItemId>([...a.keys, ...(a.capstone ? [a.capstone] : [])]), scales: new Set<StatId>(a.scales) };
}
/** One number for how good a run is at the next wave: offence against the need, and survival. */
function value(run: RunSave): number {
  const s = computeStats(run);
  const w = run.wave + 1;
  const plan = wavePlan(run, Math.min(w, 60));
  const dps = buildDps(run, s, 0.6, 1).area;
  const need = planHp(plan) / (plan.len ?? 60);
  const ehp = Math.max(1, s.hp) / armorMult(s.armor) / (1 - dodgeChance(s.dodge, dodgeCapOf(run))) + regenPerSec(s) * 20;
  return Math.log(1 + dps / Math.max(1, need)) * 3 + Math.log(ehp) + 0.002 * s.harvest + 0.001 * s.luck;
}

function doCards(run: RunSave, rng: () => number, beginner: boolean, arch: ArchetypeId): RunSave {
  const pref = prefers(arch);
  while (run.pending.cards > 0) {
    const v = cardsView(run)!;
    let best = 0;
    if (beginner) best = Math.floor(rng() * v.cards.length);
    else {
      let bv = -Infinity;
      v.cards.forEach((c, i) => {
        const trial = pickCard(run, i);
        const x = value(trial) + (pref.scales.has(c.stat) ? 0.05 * c.tier : 0);
        if (x > bv) { bv = x; best = i; }
      });
    }
    run = pickCard(run, best);
  }
  return run;
}
function doCrates(run: RunSave, u: Unlocks, beginner: boolean): RunSave {
  while (run.pending.crates > 0) {
    const id = crateItem(run, u);
    const keep = beginner || value(resolveCrate(run, true, u)) >= value({ ...run, moon: run.moon + meltValue(run, id) }) - 0.01;
    run = resolveCrate(run, keep, u);
  }
  return run;
}
function doHearts(run: RunSave, u: Unlocks, beginner: boolean): RunSave {
  while (run.pending.hearts.length) {
    const opts = heartOffer(run, u);
    if (!opts.length) { run = { ...run, pending: { ...run.pending, hearts: run.pending.hearts.slice(1) } }; continue; }
    let best = 0, bv = -Infinity;
    if (!beginner) opts.forEach((_, i) => { const x = value(pickHeart(run, i, u)); if (x > bv) { bv = x; best = i; } });
    run = pickHeart(run, best, u);
  }
  return run;
}
function doShop(run: RunSave, u: Unlocks, rng: () => number, beginner: boolean, arch: ArchetypeId): RunSave {
  run = openShop(run, u);
  const pref = prefers(arch);
  const w = Math.max(1, run.wave);
  for (let round = 0; round < (beginner ? 1 : 4); round++) {
    for (let pass = 0; pass < 6; pass++) {
      const v = shopView(run);
      const base = value(run);
      let best = -1, bv = 0;
      v.slots.forEach((sv, i) => {
        if (!sv.slot || !sv.afford) return;
        if (beginner) { if (rng() < 0.6 && best < 0) best = i; return; }
        const after = buy(run, i);
        if (!after) return;
        let gain = value(after) - base;
        if (sv.slot.kind === 'weapon' && pref.weapons.has(sv.slot.id)) gain += 0.08;
        if (sv.slot.kind === 'item' && pref.keys.has(sv.slot.id)) gain += 0.08;
        const per = gain / Math.max(1, sv.price);
        if (per > bv) { bv = per; best = i; }
      });
      if (best < 0) break;
      run = buy(run, best) ?? run;
    }
    // merge pairs that help
    if (!beginner) for (let i = 0; i < run.weapons.length; i++) for (let j = i + 1; j < run.weapons.length; j++) {
      const m = merge(run, i, j);
      if (m && value(m) > value(run)) { run = m; i = run.weapons.length; break; }
    }
    const v = shopView(run);
    const typical = Math.round(30 * (1 + F.priceSlope * (w - 1)));
    if (!v.canReroll || run.moon - v.rerollCost < 2 * typical) break;
    run = reroll(run, u) ?? run;
  }
  void rerollCost;
  return run;
}

// ───────────────────────────────────────────── the simplified wave
function fight(run: RunSave, w: number, rng: () => number, beginner: boolean): { res: WaveResult; dead: boolean; row: BotWave } {
  const s = computeStats(run);
  const plan = wavePlan(run, w);
  const boss = isBossWave(w);
  const L = waveLen(w, run) ?? 60;
  const avgArmor = plan.groups.length ? plan.groups.reduce((a, g) => a + MONSTERS[g.id].armor * g.n, 0) / Math.max(1, plan.kills) : 0;
  const dps = buildDps(run, s, Math.min(1, 0.25 + w / 40), avgArmor);
  const pool = planHp(plan) - (plan.boss ? plan.boss.hp * plan.boss.ids.length : 0);
  const need = pool / Math.max(1, L - 3.5);
  const q = dps.area / Math.max(1, need);
  // the boss: time to kill with single-target damage (enrage from 90 s)
  let bossT = 0;
  if (plan.boss) bossT = (plan.boss.hp * plan.boss.ids.length) / Math.max(1, dps.single + 0.25 * dps.area);
  const secs = boss ? Math.min(240, 20 + bossT) : L;
  // incoming: the crowd that piles up when q < 1, dodge, armour, i-frames, regen, lifesteal
  const avgDmg = plan.groups.length ? plan.groups.reduce((a, g) => a + MONSTERS[g.id].dmg * g.n, 0) / Math.max(1, plan.kills) : 3;
  // The crowd alive (the reference model's pressure): spawns arrive at λ/s and live ~2 s of approach plus
  // their share of the kill queue, N = 2λ / (1 − 1/q); below q = 1 the arena fills. Contact hits then follow
  // hitMax · N^γ / (N^γ + P0^γ) (BOT.P0 60, γ 2.2), with i-frames capping hitMax at 1/0.35.
  const lambda = plan.kills / Math.max(1, L - 3.5);
  const skill = beginner ? 1.8 : 1;
  const N = Math.min(F.alive.mid, lambda * L, 2 * lambda * (1 + 1 / Math.max(0.25, q - 0.75)) + (lambda * Math.max(0, 1 - q) * L) / 2) * skill;
  const hitMax = 1 / F.iframes;
  const contact = (hitMax * Math.pow(N, 2.2)) / (Math.pow(N, 2.2) + Math.pow(60, 2.2));
  const hitsPerSec = contact + (plan.elites.length ? 0.04 * skill : 0) + (boss ? 0.12 * skill * (bossT > 90 ? 1.5 : 1) : 0);
  const dodge = dodgeChance(s.dodge, dodgeCapOf(run));
  const perHit = Math.max(1, (boss ? 3.5 : avgDmg) * plan.dmgX * armorMult(s.armor));
  const steal = (Math.min(100, s.steal) / 100) * 0.6 * Math.min(4, run.weapons.length) * 0.5;
  const heal = regenPerSec(s) + Math.min(F.stealPerSec, steal);
  const hpMax = Math.max(1, Math.round(s.hp));
  let hp = hpMax, dead = false, lives = run.lives;
  for (let t = 0; t < secs; t += 1) {
    const hits = hitsPerSec * (1 - dodge);
    const n = hits > 1 ? hits : rng() < hits ? 1 : 0;
    hp = Math.min(hpMax, hp - n * perHit + heal);
    if (hp <= 0) {
      if (lives > 0) { lives--; hp = 1; continue; }
      if (run.items.penglai && !run.once.includes('penglai')) { hp = hpMax / 2; run = { ...run, once: [...run.once, 'penglai'] }; continue; }
      dead = true;
      break;
    }
  }
  const cleared = Math.min(1, q);
  const moonAll = planMoon(plan) * (1 + (run.items.delusion ? 0.1 : 0)) * (1 + F.curseMoon * s.curse);
  const picked = Math.round(moonAll * cleared * 0.88);
  const kills = Math.round(plan.kills * cleared) + plan.elites.length;
  let crates = plan.elites.length + plan.treasures.filter((x) => x.id === 'pixiu').length;
  for (let i = 0; i < kills; i++) if (rng() < (F.crateChance * luckMult(s.luck)) / (1 + crates)) crates++;
  const killsBy: Record<string, number> = {};
  for (const g of plan.groups) killsBy[g.id] = (killsBy[g.id] ?? 0) + Math.round(g.n * cleared);
  for (const e of plan.elites) killsBy[ELITES[e.id].id] = (killsBy[e.id] ?? 0) + 1;
  const res: WaveResult = {
    wave: w, moon: picked, xp: Math.round(picked * (run.char === 'scholar' ? 1.1 : 1)), field: Math.round(moonAll * cleared * 0.12),
    storeLeft: 0, levels: 0, crates, hearts: boss ? ['boss'] : plan.treasures.some((x) => x.id === 'mirrorflower') ? ['flower'] : [], sleeve: [],
    lives, once: run.once, drunk: 0,
    stats: { kills, elites: plan.elites.length, bosses: boss ? plan.boss!.ids.length : 0, moonCollected: picked, hitsTaken: Math.round(hitsPerSec * secs * (1 - dodge)), dmgDealt: Math.round(dps.area * secs) },
    killsBy, byWeapon: {}, bosses: [], ms: secs * 1000,
  };
  return { res, dead, row: { w, dps: Math.round(dps.area), need: Math.round(need), q: Math.round(q * 100) / 100, hurt: Math.round(hpMax - hp), hp: hpMax, moon: run.moon, lvl: run.lvl } };
}

/** Play one run to death (or maxWave) through the real between-wave logic. Deterministic per options. */
export function simulateRun(o: BotOpts, meta0?: MirrorMeta): BotRun {
  const u = o.unlocks ?? allUnlocked();
  const arch = o.arch ?? COMPANIONS[o.char].leans[0];
  const rng = rngFor(o.seed, 0, 'bot');
  let meta: MirrorMeta = meta0 ?? ({
    v: 1, ticketsUsed: 0, active: null, deeds: {}, codex: {}, tally: {}, bests: {}, seals: {}, diffMax: 5, mapsOpen: 3, firsts: {}, dust: 0,
    heart: { ranks: {}, pick: {}, plain: false }, mastery: {}, daily: { day: '2026-09-27', best: 0, bonus: false, weekDays: [], weekPaid: null },
    slips: {}, payDay: { day: '2026-09-27', runs: 1, free: true, paid: 0, drops: 0, refunded: false }, coinsPaid: 0, owed: 0, firstsHeld: 0,
    lastDay: '2026-09-27', lobby: { char: o.char, map: o.map ?? 'lake', diff: o.diff ?? 1, vows: {} },
    settings: { aim: 'auto', nums: 1, shake: false, left: false, quality: 'auto' }, records: {}, titles: [], title: null, rims: [], rim: null,
  } as MirrorMeta);
  let run = newRun({
    seed: o.seed, char: o.char, map: o.map ?? 'lake', diff: o.diff ?? 1, vows: {}, daily: false, plain: false, heart: {}, ticket: 1, free: false,
    runIndex: 2, rate: 1, startedDay: '2026-09-27', term: null, mutator: null, boon: null, unlocks: u, mastery: 0,
  });
  const log: BotWave[] = [];
  const maxWave = o.maxWave ?? 40;
  let dead = false;
  if (run.pending.start) {
    const opts = run.pending.start;
    const pref = prefers(arch);
    let best = opts.find((id) => pref.weapons.has(id)) ?? opts[0], bv = -Infinity;
    if (!pref.weapons.has(best)) for (const id of opts) { const v = value(pickStart(run, id)); if (v > bv) { bv = v; best = id; } }
    run = pickStart(run, best);
  }
  for (let w = 1; w <= maxWave; w++) {
    run = beginWave(run);
    const luck = computeStats(run).luck;
    const coins: CoinDrop[] = coinPlan(run, w, luck, meta, '2026-09-27');
    const f = fight(run, w, rng, !!o.beginner);
    log.push(f.row);
    if (f.dead) { dead = true; run = { ...run, inWave: null }; break; }
    run = endWave(run, { ...f.res, sleeve: coins });
    const b = bankSleeve(meta, run, coins, '2026-09-27');
    meta = { ...b.meta, owed: 0, coinsPaid: b.meta.coinsPaid + b.meta.owed };
    run = b.run;
    // between waves, in screenOf order
    let guard = 0;
    while (screenOf(run) !== 'shop' && guard++ < 50) {
      const sc = screenOf(run);
      if (sc === 'cards') run = doCards(run, rng, !!o.beginner, arch);
      else if (sc === 'crate') run = doCrates(run, u, !!o.beginner);
      else if (sc === 'heart') run = doHearts(run, u, !!o.beginner);
      else break;
    }
    run = doShop(run, u, rng, !!o.beginner, arch);
    void xpNext; void procCoef; void ITEMS;
  }
  return { W: run.wave, dead, run, log, coins: run.coins, meta };
}
