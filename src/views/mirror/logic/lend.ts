// 水月幻镜 · m8 · what the test code lends a run (chars.md §4.3, sandbox.md §8, PLAN D18). Owned by SANDBOX.
// Pure: whether the code is on (and the 「按满阶 / 按自有」 toggle) is decided in logic/session.ts, the one module
// that reads codeActive; these helpers only take `lent: boolean`.
// Standing rules: 回魂 is never lent (it would be a free revive); meta.heart / meta.mastery are never written;
// lent 福泽 never reaches the 铜钱 plan (logic/run.ts waveSetup subtracts lentLuck).
import { HEART_REG, type HeartFaceId } from '../ids';
import type { CharacterId, MirrorMeta, RunSave } from '../types';
import { HEART, MASTERY } from '../data';
import { activeHeart, masteryLevel } from './meta';

/** 心得 levels at the top of the curve (10). */
export const MASTERY_MAX = MASTERY.length;

/** The one 心镜 face the code never lends: 回魂 would be a free revive (standing rule). */
export const NEVER_LENT: readonly HeartFaceId[] = ['heartRevive'];

/** Every 心镜 face at its last rank. */
export function fullRanks(): Partial<Record<HeartFaceId, number>> {
  const out: Partial<Record<HeartFaceId, number>> = {};
  for (const f of HEART_REG) out[f.id] = HEART[f.id].costs.length;
  return out;
}

/**
 * The faces in force for a run: the picked side of each pair, at the earned rank, or at the last rank when
 * `lent` (回魂 keeps its earned rank). Empty under 素镜. Without `lent` this is exactly activeHeart.
 */
export function heartFor(meta: Pick<MirrorMeta, 'heart'>, lent: boolean): Partial<Record<HeartFaceId, number>> {
  if (!lent) return activeHeart(meta);
  const out: Partial<Record<HeartFaceId, number>> = {};
  if (meta.heart.plain) return out;
  for (const f of HEART_REG) {
    if ((meta.heart.pick[f.pair] ?? 'A') !== f.side) continue;
    const r = NEVER_LENT.includes(f.id) ? (meta.heart.ranks[f.id] ?? 0) : HEART[f.id].costs.length;
    if (r > 0) out[f.id] = r;
  }
  return out;
}

/** The 心得 level a run of `char` gets: the earned one, or the top when lent. */
export function masteryFor(meta: Pick<MirrorMeta, 'mastery'>, char: CharacterId, lent: boolean): number {
  return lent ? MASTERY_MAX : masteryLevel(meta.mastery[char] ?? 0);
}

/**
 * What the code lends a run above the earned values (RunSave.lent): the 心镜 ranks per face and the 心得
 * levels. `plain` (素镜) lends no face. Only faces with something lent are listed.
 */
export function lentOf(meta: Pick<MirrorMeta, 'heart' | 'mastery'>, char: CharacterId, plain: boolean): NonNullable<RunSave['lent']> {
  const heart: Partial<Record<HeartFaceId, number>> = {};
  if (!plain) {
    const own = activeHeart(meta);
    const full = heartFor(meta, true);
    for (const id in full) {
      const d = (full[id as HeartFaceId] ?? 0) - (own[id as HeartFaceId] ?? 0);
      if (d > 0) heart[id as HeartFaceId] = d;
    }
  }
  return { heart, mastery: Math.max(0, MASTERY_MAX - masteryLevel(meta.mastery[char] ?? 0)) };
}

/**
 * The run as it would be without the code's lent 心镜 ranks (the earned heart). The 铜钱 plan is rolled on it:
 * 福缘 also scales how often 貔貅 comes (logic/spawn.ts), and a 貔貅 carries a string of 铜钱. The lent run's own
 * plan only ever has more 貔貅 (the same draws, a higher chance), so every planned coin still has its carrier.
 */
export function unlentRun<R extends Pick<RunSave, 'heart' | 'lent'>>(run: R): R {
  const h = run.lent?.heart;
  if (!h) return run;
  const heart: Partial<Record<HeartFaceId, number>> = { ...run.heart };
  for (const id in h) {
    const r = (heart[id as HeartFaceId] ?? 0) - (h[id as HeartFaceId] ?? 0);
    if (r > 0) heart[id as HeartFaceId] = r; else delete heart[id as HeartFaceId];
  }
  return { ...run, heart };
}

/** 福缘 the code lent this run (the lent ranks × each face's 福缘 a rank), subtracted from the 铜钱 plan's luck. */
export function lentLuck(run: Pick<RunSave, 'lent'>): number {
  const h = run.lent?.heart;
  if (!h) return 0;
  let luck = 0;
  for (const id in h) {
    const r = h[id as HeartFaceId] ?? 0;
    if (r > 0) luck += r * (HEART[id as HeartFaceId]?.per.luck ?? 0);
  }
  return luck;
}
