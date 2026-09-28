// 水月幻镜 · the tutorial's step machine (d-tutorial §1.5, mirror3 CONTRACTS §5.4): a pure reducer
// from what happened (screens, the scripts' cues, committed actions, taps on [data-tut] targets, UI
// seconds) to what the coach shows. Between waves the steps of a phase run in order; in a wave each
// step starts on its script cue. A goal met early marks its step done (it is skipped later), every
// in-wave step and every optional shop step has a skip time, so nobody can get stuck.
import type { LineId } from './lines';
import type { MachineEvent } from './events';

export type StepId =
  | 'R1' | 'W1' | 'W2' | 'W3' | 'W6' | 'C1'
  | 'H1' | 'H2' | 'H3a' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H7b' | 'H8'
  | 'D1' | 'D2' | 'D3' | 'H9' | 'B1' | 'B2' | 'K1';
export type Phase = 'pre' | 'ready' | 'w1' | 'cards' | 'crate' | 'shop1' | 'w2' | 'shop2' | 'w3' | 'between' | 'end';
export type Mode = 'bubble' | 'hold';
export type Btn = 'ok' | 'got' | 'go';

export interface StepDef {
  id: StepId;
  line: LineId;
  mode: Mode;
  /** [data-tut] targets: the ring goes round each one that is on screen. */
  target: readonly string[];
  btn?: Btn;
  nudge?: LineId;
  nudgeAt?: number;
  /** Seconds (UI time, not held) after which the step hides by itself. */
  skipAt?: number;
  /** The boss-card look (B1). */
  foe?: boolean;
  /** The 「在这」 tag instead of a stroke (a far target such as the skill button). */
  tag?: boolean;
}
const D = (d: StepDef) => d;
export const STEPS: Readonly<Record<StepId, StepDef>> = {
  R1: D({ id: 'R1', line: 'R1', mode: 'bubble', target: ['go'] }),
  W1: D({ id: 'W1', line: 'W1', mode: 'bubble', target: [], nudge: 'W1n', nudgeAt: 6, skipAt: 20 }),
  W2: D({ id: 'W2', line: 'W2', mode: 'bubble', target: [], nudge: 'W2n', nudgeAt: 8, skipAt: 30 }),
  W3: D({ id: 'W3', line: 'W3', mode: 'bubble', target: ['moon'], nudge: 'W3n', nudgeAt: 8, skipAt: 20 }),
  W6: D({ id: 'W6', line: 'W6', mode: 'bubble', target: ['timer'], skipAt: 12 }),
  C1: D({ id: 'C1', line: 'C1', mode: 'bubble', target: ['cards'], nudge: 'C1n', nudgeAt: 12 }),
  H1: D({ id: 'H1', line: 'H1', mode: 'hold', target: ['slots'], btn: 'ok' }),
  H2: D({ id: 'H2', line: 'H2', mode: 'bubble', target: ['slot:0'], skipAt: 60 }),
  H3a: D({ id: 'H3a', line: 'H3a', mode: 'bubble', target: ['tab:wpn'], skipAt: 30 }),
  H3: D({ id: 'H3', line: 'H3', mode: 'bubble', target: ['wslot:0', 'merge'], skipAt: 60 }),
  H4: D({ id: 'H4', line: 'H4', mode: 'hold', target: ['wslot:0', 'sell'], btn: 'ok' }),
  H5: D({ id: 'H5', line: 'H5', mode: 'bubble', target: ['lock:2'], skipAt: 45 }),
  H6: D({ id: 'H6', line: 'H6', mode: 'bubble', target: ['reroll'], skipAt: 45 }),
  H7: D({ id: 'H7', line: 'H7', mode: 'bubble', target: ['who'], skipAt: 45 }),
  H7b: D({ id: 'H7b', line: 'H7b', mode: 'hold', target: ['panelTiles'], btn: 'ok' }),
  H8: D({ id: 'H8', line: 'H8', mode: 'bubble', target: ['next'] }),
  D1: D({ id: 'D1', line: 'D1', mode: 'hold', target: [], btn: 'got' }),
  D2: D({ id: 'D2', line: 'D2', mode: 'bubble', target: [], nudge: 'D2n', nudgeAt: 10, skipAt: 35 }),
  D3: D({ id: 'D3', line: 'D3', mode: 'bubble', target: ['skill'], nudge: 'D3n', nudgeAt: 6, skipAt: 25, tag: true }),
  H9: D({ id: 'H9', line: 'H9', mode: 'hold', target: ['next'], btn: 'ok' }),
  B1: D({ id: 'B1', line: 'B1', mode: 'hold', target: [], btn: 'go', foe: true }),
  B2: D({ id: 'B2', line: 'B2', mode: 'hold', target: [], btn: 'got' }),
  K1: D({ id: 'K1', line: 'K1', mode: 'bubble', target: ['crateKeep', 'crateMelt'] }),
};
/** Between-wave phases and their steps, in order. */
export const PHASE_STEPS: Readonly<Partial<Record<Phase, readonly StepId[]>>> = {
  ready: ['R1'],
  cards: ['C1'],
  crate: ['K1'],
  shop1: ['H1', 'H2', 'H3a', 'H3', 'H4', 'H5', 'H6', 'H7', 'H7b', 'H8'],
  shop2: ['H9'],
};
/** In-wave steps and the cue that starts each. */
export const CUE_STEPS: Readonly<Record<string, StepId>> = {
  move: 'W1', moved: 'W2', kills3: 'W3', clock: 'W6', tele1: 'D1', dodged2: 'D2', crowd: 'D3', foe: 'B1',
};
/** The steps a cue shows as a hold (the engine waits for the button). */
const HOLD_CUES = new Set(['tele1', 'foe']);

export interface Whisper {
  line: LineId;
  target?: string;
  /** A second target that takes over after `thenAt` seconds (W4: moonlight, then the XP line). */
  then?: string;
  thenAt?: number;
  /** Seconds on screen. */
  dur: number;
}
export interface Show { id: StepId; line: LineId; mode: Mode; target: readonly string[]; btn?: Btn; foe: boolean; tag: boolean; nudged: boolean }

export interface TutState {
  phase: Phase;
  waves: number; shops: number; cardsSeen: number; cratesSeen: number;
  step: StepId | null;
  /** Seconds the step has shown (not held). */
  t: number;
  nudged: boolean;
  done: readonly StepId[];
  granted: boolean;
  locked: boolean;
  leveled: boolean;
  lowHp: boolean;
  castSeen: boolean;
  /** Wave 3: the big one is up; seconds since B2 was answered (−1 = not yet); B3 said. */
  foeUp: boolean;
  sinceB2: number;
  b3: boolean;
  skillReady: boolean;
  /** The big one's health for the mini scroll (0..1), or null. */
  foeHp: number | null;
  ended: boolean;
}
export function initTut(): TutState {
  return {
    phase: 'pre', waves: 0, shops: 0, cardsSeen: 0, cratesSeen: 0, step: null, t: 0, nudged: false, done: [], granted: false, locked: false,
    leveled: false, lowHp: false, castSeen: false, foeUp: false, sinceB2: -1, b3: false, skillReady: false, foeHp: null, ended: false,
  };
}

export interface Out {
  state: TutState;
  whispers: Whisper[];
  /** H2 wants the first slot affordable: the session tops the moonlight up (once). */
  grant: boolean;
  /** The engine should hold for this cue's line. */
  hold: boolean;
}

const W = (line: LineId, dur = 4.5, target?: string, then?: string, thenAt?: number): Whisper => ({ line, dur, ...(target ? { target } : {}), ...(then ? { then, thenAt } : {}) });
const isWave = (p: Phase) => p === 'w1' || p === 'w2' || p === 'w3';

/** What the coach shows for this state (null: nothing but whispers). */
export function view(s: TutState): Show | null {
  if (!s.step || s.ended) return null;
  const d = STEPS[s.step];
  return {
    id: d.id, line: s.nudged && d.nudge ? d.nudge : d.line, mode: d.mode, target: d.target, btn: d.btn, foe: !!d.foe, tag: !!d.tag, nudged: s.nudged,
  };
}

function markDone(s: TutState, id: StepId): TutState {
  return s.done.includes(id) ? s : { ...s, done: [...s.done, id] };
}
/** The first step of the phase not yet done (null when the phase has none left). */
function nextIn(s: TutState): StepId | null {
  const list = PHASE_STEPS[s.phase];
  if (!list) return null;
  for (const id of list) if (!s.done.includes(id)) return id;
  return null;
}
function setStep(s: TutState, id: StepId | null): TutState {
  return { ...s, step: id, t: 0, nudged: false };
}
/** Finish the current step and go on to the next of the phase. */
function finish(s: TutState, id: StepId): TutState {
  const d = markDone(s, id);
  if (d.step !== id) return d;
  return setStep(d, isWave(d.phase) ? null : nextIn(d));
}

/** Enter a phase from a screen change. */
function enter(s0: TutState, phase: Phase): TutState {
  // leaving: the step on screen is over (a wave's last line, R1, H8 …)
  let s = s0.step ? markDone(s0, s0.step) : s0;
  s = { ...s, phase };
  return setStep(s, isWave(phase) ? null : nextIn(s));
}

function screen(s: TutState, sc: string): TutState {
  if (s.ended) return s;
  switch (sc) {
    case 'ready': return s.phase === 'ready' ? s : enter(s, 'ready');
    case 'wave': {
      const waves = s.waves + 1;
      return enter({ ...s, waves, lowHp: false }, waves === 1 ? 'w1' : waves === 2 ? 'w2' : 'w3');
    }
    case 'cards': {
      if (s.phase === 'cards') return s;
      const n = s.cardsSeen + 1;
      const t = { ...s, cardsSeen: n };
      return n === 1 ? enter(t, 'cards') : enter(t, 'between');
    }
    case 'crate': {
      if (s.phase === 'crate') return s;
      const n = s.cratesSeen + 1;
      const t = { ...s, cratesSeen: n };
      return n === 1 ? enter(t, 'crate') : enter(t, 'between');
    }
    case 'shop': {
      if (s.phase === 'shop1' || s.phase === 'shop2') return s;
      const n = s.shops + 1;
      const t = { ...s, shops: n };
      return enter(t, n === 1 ? 'shop1' : n === 2 ? 'shop2' : 'between');
    }
    case 'tutorEnd': {
      const t = enter(s, 'end');
      return { ...t, step: null, ended: true };
    }
    default: return s;
  }
}

/** Mark a later step of this phase done ahead of time (its goal was met early). */
function early(s: TutState, id: StepId, out: Whisper[]): TutState {
  if (s.done.includes(id)) return s;
  if (s.step === id) return finish(s, id);
  const list = PHASE_STEPS[s.phase];
  if (!list || !list.includes(id)) return s;
  out.push(W('nice', 2));
  return markDone(s, id);
}

export function reduce(s0: TutState, ev: MachineEvent): Out {
  const whispers: Whisper[] = [];
  let grant = false, hold = false;
  let s = s0;
  if (s.ended) return { state: s, whispers, grant, hold };
  switch (ev.k) {
    case 'screen': {
      const before = s.step;
      s = screen(s, ev.s);
      if (s.step === 'H2' && before !== 'H2' && !s.granted) { grant = true; s = { ...s, granted: true }; }
      if (s.step === 'H3a' && before !== 'H3a') { /* the coach checks the tab and may answer at once */ }
      break;
    }
    case 'tick': {
      const dt = Math.max(0, ev.dt);
      if (s.phase === 'w3' && s.sinceB2 >= 0) s = { ...s, sinceB2: s.sinceB2 + dt };
      const id = s.step;
      if (!id) break;
      const d = STEPS[id];
      if (d.mode === 'hold') break;
      const t = s.t + dt;
      s = { ...s, t };
      if (d.nudgeAt !== undefined && !s.nudged && t >= d.nudgeAt) s = { ...s, nudged: true };
      if (d.skipAt !== undefined && t >= d.skipAt) {
        s = finish(s, id);
        if (s.step === 'H2' && !s.granted) { grant = true; s = { ...s, granted: true }; }
      }
      break;
    }
    case 'ok': {
      if (!s.step) break;
      const d = STEPS[s.step];
      if (d.mode !== 'hold') break;
      const id = s.step;
      s = finish(s, id);
      if (id === 'B2') s = { ...s, sinceB2: 0 };
      if (s.step === 'H2' && !s.granted) { grant = true; s = { ...s, granted: true }; }
      break;
    }
    case 'cue': {
      const key = ev.key;
      if (!isWave(s.phase)) break;
      const start = CUE_STEPS[key];
      // the goal of the step on screen
      if (s.step === 'W1' && key === 'moved') s = finish(s, 'W1');
      else if (s.step === 'W2' && key === 'kills3') s = finish(s, 'W2');
      else if (s.step === 'W3' && key === 'pickups3') s = finish(s, 'W3');
      else if (s.step === 'D2' && key === 'lanterns') s = finish(s, 'D2');
      else if (s.step === 'D3' && key === 'cast') s = finish(s, 'D3');
      if (key === 'pickups3') whispers.push(W('W4', 7, 'moon', 'xp', 2.5));
      else if (key === 'pause') whispers.push(W('P1', 4.5, 'pause'));
      else if (key === 'teleDodged') whispers.push(W((ev.v ?? 1) >= 2 ? 'D1b' : 'D1a', 3));
      else if (key === 'teleHit') whispers.push(W('D1c', 4.5));
      else if (key === 'cast' && !s.castSeen) { s = { ...s, castSeen: true }; whispers.push(W('D3b', 4.5, 'skill'), W('D3c', 4.5, 'skill')); }
      else if (key === 'saved') whispers.push(W('B4b', 4.5));
      else if (key === 'foeDown') { s = { ...s, foeUp: false, foeHp: null }; whispers.push(W('B5', 4.5, 'crates')); }
      else if (key === 'foeHp') s = { ...s, foeHp: Math.max(0, Math.min(1, ev.v ?? 0)) };
      if (key === 'tele' && s.phase === 'w3' && s.foeUp && !s.done.includes('B2')) {
        if (s.step) s = markDone(s, s.step);
        s = setStep(s, 'B2');
        hold = true;
      }
      if (start && !s.done.includes(start)) {
        if (s.step && s.step !== start) s = markDone(s, s.step);
        s = setStep(s, start);
        if (HOLD_CUES.has(key)) hold = true;
        if (key === 'foe') s = { ...s, foeUp: true, foeHp: 1 };
      }
      break;
    }
    case 'act': {
      const a = ev.a;
      if (a === 'card' && s.step === 'C1') s = finish(s, 'C1');
      else if (a === 'crate' && s.step === 'K1') s = finish(s, 'K1');
      if (s.phase === 'shop1') {
        if (a === 'buy' && ev.slot === 0) s = early(s, 'H2', whispers);
        else if (a === 'buy' && s.step === 'H2') whispers.push(W('H2a', 4.5));
        else if (a === 'merge') { const was = s.step === 'H3'; s = early(s, 'H3', whispers); if (!s.done.includes('H3a')) s = markDone(s, 'H3a'); if (was) whispers.push(W('H3done', 4.5, 'wslot:0')); }
        else if (a === 'lock') { s = { ...s, locked: true }; s = early(s, 'H5', whispers); }
        else if (a === 'reroll') { const was = s.step === 'H6'; s = early(s, 'H6', whispers); if (was && s.locked) whispers.push(W('H6done', 4.5)); }
        if (s.step === 'H3a' && s.done.includes('H3')) s = finish(s, 'H3a');
      }
      break;
    }
    case 'ui': {
      const tut = ev.tut;
      if (s.step === 'H3a' && (tut === 'tab:wpn' || tut.startsWith('wslot:'))) s = finish(s, 'H3a');
      else if (s.step === 'H7' && (tut === 'who' || tut === 'tab:who' || tut === 'cardWho')) s = finish(s, 'H7');
      else if (s.phase === 'shop1' && (tut === 'who' || tut === 'tab:who') && !s.done.includes('H7') && s.step !== 'H7') s = early(s, 'H7', whispers);
      break;
    }
    case 'who': {
      if (ev.open && s.step === 'H7') s = finish(s, 'H7');
      break;
    }
    case 'levelUp': {
      if (!s.leveled && isWave(s.phase)) { s = { ...s, leveled: true }; whispers.push(W('W5', 4.5, 'lvl')); }
      break;
    }
    case 'hud': {
      const h = ev.s;
      if (!isWave(s.phase)) break;
      if (h.lowHp && !s.lowHp) whispers.push(W('B4', 4.5, 'hp'));
      const ready = h.skillCd <= 0 && !h.skillActive;
      s = { ...s, lowHp: h.lowHp, skillReady: ready };
      if (s.phase === 'w3' && s.foeUp && !s.b3 && ready && s.sinceB2 >= 4 && !s.step) { s = { ...s, b3: true }; whispers.push(W('B3', 4.5, 'skill')); }
      break;
    }
    default: break;
  }
  return { state: s, whispers, grant, hold };
}
