// 水月幻镜 · m8 · the 模拟场's start run (sandbox.md §3). SANDBOX owns it. Pure and node-tested: one RunSave
// at the end of wave N − 1, built four ways — the bot's build (sim/bot.ts simulateRun, immortal, deterministic
// per seed), bare hands, a copy of the paused real run (never written back), or the last sandbox build. It
// reads meta (heart, mastery, deeds, the paused run) and writes nothing.
import type { ArchetypeId, HeartFaceId, MapId } from '../ids';
import type { CharacterId, DateKey, DiffIndex, MirrorMeta, RunSave, Unlocks, VowRanks } from '../types';
import { COMPANIONS, F } from '../data';
import { activeHeart, allUnlocked, heartFor, masteryLevel, MASTERY_MAX, newRun, pickStart, unlocksOf } from '../logic';
import { simulateRun } from './bot';

/** The start wave's range (the setup's stepper): 1–70, default 30 (the owner's 「直接从30重开始」). */
export const SAND_WAVE = { min: 1, max: 70, def: 30 } as const;
/** A bare build's level at wave N: 1 + round(this × (N − 1)), about what a real run has by then (editable after). */
export const BARE_LVL_PER_WAVE = 0.9;

export type SandHeart = 'full' | 'own' | 'plain';
export type SandMastery = 'full' | 'own';
export type SandPool = 'all' | 'mine';
export type SandBuild = 'bot' | 'bare' | 'copy' | 'last';

export interface SandStartOpts {
  char: CharacterId;
  map: MapId;
  diff: DiffIndex;
  vows: VowRanks;
  /** The wave the sandbox starts at (1–70): the run is built to the end of wave − 1. */
  wave: number;
  seed: number;
  /** 心镜: 满阶 (lent, never 回魂) · 自有 (earned ranks) · 素镜 (off). */
  heart: SandHeart;
  /** 心得: 满 (10) · 自有. */
  mastery: SandMastery;
  /** The weapon and item pool: every one (the default), or this account's unlocks. */
  pool: SandPool;
  build: SandBuild;
  /** The bot's 流派 (default the companion's first lean). */
  arch?: ArchetypeId;
  /** 月华 held at the start (default: the bot's leftover, or F.startMoon bare). */
  moon?: number;
  /** The date the run is stamped with (startedDay). */
  today: DateKey;
  /** For 'last': the last sandbox build (from the per-device draft). */
  last?: RunSave | null;
}

export const clampWave = (n: number) => Math.max(SAND_WAVE.min, Math.min(SAND_WAVE.max, Math.round(Number.isFinite(n) ? n : SAND_WAVE.def)));

/** The pool a sandbox run draws its shop, crates and 镜心 from. */
export function sandUnlocks(meta: Pick<MirrorMeta, 'deeds'>, pool: SandPool): Unlocks {
  return pool === 'all' ? allUnlocked() : unlocksOf(meta);
}
/** The 心镜 faces a sandbox run takes: 满阶 lends every picked face (never 回魂), 自有 the earned ranks (even when the
 *  lobby is on 素镜: 素镜 is its own choice here), 素镜 none. */
export function sandHeart(meta: Pick<MirrorMeta, 'heart'>, h: SandHeart): Partial<Record<HeartFaceId, number>> {
  if (h === 'plain') return {};
  const m = { heart: { ...meta.heart, plain: false } };
  return h === 'full' ? heartFor(m, true) : activeHeart(m);
}

/** A run from elsewhere (the paused real run, the last sandbox build) made safe to play in memory. */
function detach(src: RunSave): RunSave {
  const r: RunSave = structuredClone(src);
  delete r.downAt;
  delete r.revived;
  delete r.tutorial;
  delete r.sand;
  return { ...r, ticket: 0, coins: 0, runIndex: 0, rate: 0, free: false, inWave: null };
}

/**
 * The start run: `wave = N − 1`, `inWave = null`, no shop open yet (the session opens one on 「先到 · 商店」),
 * `ticket` / `coins` 0, `sand = { sheet: [], curse: 0 }`. 'copy' needs a paused run and 'last' a saved one; without
 * them a bare build is made instead.
 */
export function sandStart(meta: MirrorMeta, o: SandStartOpts): RunSave {
  const N = clampWave(o.wave);
  const unlocks = sandUnlocks(meta, o.pool);
  const heart = sandHeart(meta, o.heart);
  const plain = o.heart === 'plain';
  const mastery = o.mastery === 'full' ? MASTERY_MAX : masteryLevel(meta.mastery[o.char] ?? 0);
  let run: RunSave;
  const src = o.build === 'copy' ? meta.active : o.build === 'last' ? o.last ?? null : null;
  if (src) {
    run = { ...detach(src), wave: N - 1 };
  } else if (o.build === 'bot') {
    const bot = simulateRun({ seed: o.seed >>> 0, char: o.char, map: o.map, diff: o.diff, maxWave: N - 1, arch: o.arch ?? COMPANIONS[o.char].leans[0], unlocks, immortal: true });
    run = {
      ...bot.run, seed: o.seed >>> 0, vows: { ...o.vows }, plain, heart, startedDay: o.today, ticket: 0, coins: 0, runIndex: 0, rate: 0, free: false,
      runStats: {}, byWeapon: {}, inWave: null, shop: null, wave: N - 1,
    };
    if (o.moon !== undefined) run = { ...run, moon: Math.max(0, o.moon) };
  } else {
    run = newRun({
      seed: o.seed >>> 0, char: o.char, map: o.map, diff: o.diff, vows: o.vows, daily: false, plain, heart, ticket: 0, free: false,
      runIndex: 0, rate: 0, startedDay: o.today, term: null, mutator: null, boon: null, unlocks, mastery,
    });
    if (run.pending.start) run = pickStart(run, run.pending.start[0]);
    const lvl = 1 + Math.round(BARE_LVL_PER_WAVE * (N - 1));
    run = { ...run, wave: N - 1, lvl, xp: 0, stats: { ...run.stats, hp: (run.stats.hp ?? 0) + (lvl - 1) }, moon: Math.max(0, o.moon ?? F.startMoon) };
  }
  if (src && o.moon !== undefined) run = { ...run, moon: Math.max(0, o.moon) };
  return { ...run, sand: { sheet: [], curse: 0 } };
}
