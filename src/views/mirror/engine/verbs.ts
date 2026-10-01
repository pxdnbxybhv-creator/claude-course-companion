// 水月幻镜 · m8 · the 技 button's verbs (hidden.md §2.5; HIDDEN H1): press, release, recast, guard.
// World.press / World.release forward here, and engine/index.ts skillPress / skillRelease call those.
//   'tap'    (the 13): a press is today's auto-target cast; a release does nothing. Unchanged.
//   'guard'  (越女): the press opens the guard at once (its time is the event's own, for 精). While 剑意 is full
//            the press is 夺 instead, and it waits for the release, so a drag can aim it.
//   'hold'   (后羿): the press starts the draw; the release looses it after `held` s (SkillRun.release).
//   'recast' (山鬼): the bind and the snap act on the release, so a drag can aim the cone; a press while the
//            vines live goes to SkillRun.recast (World.castSkill routes it).
// A release's `dir`: null = cancelled (dragged back to the button, Esc); a zero vector = auto (no drag);
// anything else = aimed that way.
// Imports types only from the World (world.ts imports this module).
import type { Vec } from '../types';
import { F } from '../data';
import type { World } from './world';

/** What a release does: nothing, a 'hold' run's release, or the cast itself. */
export const VM = { none: 0, hold: 1, onRelease: 2 } as const;

const nowSec = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
/** The world time of an event at `at` s on the event clock: this step's time, less the event's lag (≤ lagMax). */
export function worldAt(w: World, at: number): number {
  const lag = Number.isFinite(at) ? Math.min(F.hidden.lagMax, Math.max(0, nowSec() - at)) : 0;
  return w.t - lag;
}
/** The input verb of this wave's 镜技 ('tap' for the 13). */
export function inputOf(w: World): 'tap' | 'hold' | 'recast' | 'guard' {
  return w.skillDef?.input ?? 'tap';
}
const aimed = (d: Vec | null): d is Vec => d !== null && d.x * d.x + d.y * d.y > 1e-6;

/** The 技 button went down at `at` s (the event clock, performance.now() / 1000). */
export function pressSkill(w: World, at: number): void {
  const input = inputOf(w);
  if (input === 'tap') { w.castSkill(null, null); return; }
  if (w.verbDown && w.verbMode === VM.hold && w.skillRun) return; // a second pointer / key while drawing: ignored
  const t = worldAt(w, at);
  w.verbDown = true; w.verbT0 = t; w.verbMode = VM.none;
  if (input === 'hold') {
    w.verbPress = true;
    try { if (w.castSkill(null, null, t) && w.skillRun?.release) w.verbMode = VM.hold; } finally { w.verbPress = false; }
    return;
  }
  if (input === 'guard') {
    const full = w.skillDef?.p.blades ?? Infinity;
    if (w.hidBlades >= full) { w.verbMode = VM.onRelease; return; }
    w.castSkill(null, null, t);
    return;
  }
  // 'recast'
  w.verbMode = VM.onRelease;
}

/** The 技 button came up at `at` s; `dir` null = cancelled, zero = auto, else aimed (see the header). */
export function releaseSkill(w: World, dir: Vec | null, at: number): void {
  if (!w.verbDown) return;
  const mode = w.verbMode;
  w.verbDown = false; w.verbMode = VM.none;
  const t = worldAt(w, at);
  if (mode === VM.hold) {
    const run = w.skillRun;
    if (run?.release) run.release(w, Math.max(0, t - w.verbT0), dir);
    return;
  }
  if (mode !== VM.onRelease || dir === null) return;
  if (aimed(dir)) {
    const d = Math.hypot(dir.x, dir.y), reach = w.skillDef?.reach ?? 200;
    const ux = dir.x / d, uy = dir.y / d;
    w.castSkill({ x: w.px + ux * reach, y: w.py + uy * reach }, { x: ux, y: uy }, t);
  } else w.castSkill(null, null, t);
}
