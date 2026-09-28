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
   * H2's safety net: if the first slot (the second 青锋剑) can't be afforded, add exactly the moonlight
   * that is missing (in memory), once. Returns what was added (0 when nothing was needed).
   */
  grant(): number;
}

/** What H2 is short of: the first slot's price minus the moonlight held (0 when affordable or gone). */
export function shortfall(run: RunSave): number {
  const s = run.shop?.slots[0];
  if (!s || s.kind !== 'weapon' || s.id !== 'qingfeng') return 0;
  const price = shopView(run).slots[0]?.price ?? 0;
  return Math.max(0, Math.ceil(price - run.moon));
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
