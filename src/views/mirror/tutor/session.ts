// 水月幻镜 · the tutorial's session (d-tutorial §1.1): a RunSession over a run that lives only in
// memory. It never calls the real session: no fee, no ticket, no free run used, no purse, counters,
// codex, tallies, deeds, mastery, records or meta.active; a won wave's sleeve is dropped; every exit
// settles nothing. The only thing the tutorial writes is its own flags (ui/Tutorial.tsx → setTutor).
import type { RunSave, WaveResult } from '../types';
import type { RunSession } from '../logic/session';
import { endWave, shopView } from '../logic';
import { tutorRun, tutorSetup, tutorShop1, tutorUnlocks } from './run';

export interface TutorSession extends RunSession {
  /** The practice run as it is now (null after it ended). */
  run(): RunSave;
  /**
   * H2's safety net: if the second 青锋剑 (wherever it sits in the shop) can't be afforded, add exactly
   * the moonlight that is missing (in memory), once. Returns what was added (0 when nothing was needed).
   */
  grant(): number;
}

/** The shop slot holding the 青锋剑 H2 asks for (−1 when it is gone). */
export function swordSlot(run: RunSave): number {
  return (run.shop?.slots ?? []).findIndex((x) => !!x && x.kind === 'weapon' && x.id === 'qingfeng');
}
/** What H2 is short of: the sword's price minus the moonlight held (0 when affordable or gone). */
export function shortfall(run: RunSave): number {
  const i = swordSlot(run);
  if (i < 0) return 0;
  const price = shopView(run).slots[i]?.price ?? 0;
  return Math.max(0, Math.ceil(price - run.moon));
}
/**
 * Can the first shop still teach the merge? Yes while two identical weapons are held, or (before the
 * sword is bought) while a 青锋剑 matching one in hand is still for sale.
 */
export function mergeLeft(run: RunSave, bought: boolean): boolean {
  const ws = run.weapons;
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (ws[i].id === ws[j].id && ws[i].t === ws[j].t && ws[i].t < 4) return true;
  if (bought) return false;
  const k = swordSlot(run);
  if (k < 0) return false;
  const x = run.shop!.slots[k]!;
  return x.kind === 'weapon' && ws.some((w) => w.id === x.id && w.t === x.t);
}

export function createTutorSession(first: RunSave = tutorRun()): TutorSession {
  let cur: RunSave = first;
  let granted = false;
  return {
    practice: true,
    run: () => cur,
    commit(next) { cur = next; },
    startWave(run) {
      const r: RunSave = { ...run, inWave: run.wave + 1 };
      cur = r;
      return { run: r, setup: tutorSetup(r) };
    },
    waveWon(res: WaveResult) {
      if (cur.inWave === null || cur.inWave !== res.wave) return cur;
      // nothing earned here is carried anywhere: the sleeve (never planned: coins = []) is dropped too
      let next = endWave(cur, { ...res, sleeve: [] });
      if (res.wave === 1) next = tutorShop1(next);
      cur = next;
      return cur;
    },
    died: () => null,
    leaveMidWave: () => ({ interruptions: 0, report: null }),
    abandon: () => null,
    engineFailed: () => null,
    markSeen: () => {},
    unlocks: tutorUnlocks,
    grant() {
      if (granted) return 0;
      const n = shortfall(cur);
      if (n <= 0) return 0;
      granted = true;
      cur = { ...cur, moon: cur.moon + n };
      return n;
    },
  };
}
