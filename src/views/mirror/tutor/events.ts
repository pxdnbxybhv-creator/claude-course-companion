// 水月幻镜 · what a run on screen reports (mirror3 CONTRACTS §5.3). RunView emits these to the coach
// (the tutorial's step machine), to the first-time tips and to an optional `onEvent`; nothing else
// subscribes. Pure types.
import type { BossEvent, HudState } from '../types';

export type RunScreen = 'ritual' | 'bake' | 'start' | 'cards' | 'crate' | 'heart' | 'ready' | 'shop' | 'wave' | 'dying' | 'tutorEnd';
export type RunAct = 'buy' | 'merge' | 'sell' | 'lock' | 'reroll' | 'card' | 'crate' | 'start' | 'heart';

export type RunEvent =
  | { k: 'screen'; s: RunScreen }
  /** ≈ 8 Hz; the object is the engine's, reused: read it at once. */
  | { k: 'hud'; s: HudState }
  | { k: 'levelUp'; level: number }
  | { k: 'crate'; total: number }
  | { k: 'boss'; ev: BossEvent }
  /** engine/tutor.ts: the tutorial scripts' cues and the tip watcher's 'elite'. */
  | { k: 'cue'; key: string; v?: number }
  /** A committed between-wave action (tutor/classify.ts over the run before and after). */
  | { k: 'act'; a: RunAct; slot?: number; id?: string }
  /** A click on a [data-tut] element (capture phase), with its ARIA state read on the next frame. */
  | { k: 'ui'; tut: string; selected?: boolean; pressed?: boolean; expanded?: boolean }
  | { k: 'pause'; open: boolean }
  | { k: 'who'; open: boolean };

/** Events only the step machine sees: UI seconds while its line shows, and a hold's button. */
export type MachineEvent = RunEvent | { k: 'tick'; dt: number } | { k: 'ok' }
  /** The coach saw that no merge can happen in the first shop any more (tutor/run.ts mergeLeft). */
  | { k: 'noMerge' };
