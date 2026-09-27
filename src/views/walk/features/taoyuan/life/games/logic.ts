// 桃源 · 二期: the six valley games' rules (spec §5), pure — no DOM, no three.js: tests/taoyuan-games.test.ts
// imports all of it. The frame's rules (grades, the 土产 grant, 文, seals) first, then one section per
// game: 踩曲 qu, 摸鱼 mo, 采桑喂蚕 can, 纸鸢 yuan, 捉萤 ying, 流觞 shang.
//
// Owner: G.
import type { GameGrade, GameId, Mood, Part, SongId } from '../types';
import { PAID_ROUNDS } from '../keys';
import { makeRng, type Rng } from '../../../../../../core/rng';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// ═════════════════════════════ the frame (spec §5.0)

/** The parts of the day each game is played at. */
export const GAME_PARTS: Record<GameId, readonly Part[]> = {
  qu: ['dawn', 'day'],
  can: ['dawn', 'day'],
  mo: ['day'],
  yuan: ['day'],
  shang: ['dusk'],
  ying: ['night'],
};
export const openAt = (g: GameId, p: Part): boolean => GAME_PARTS[g].includes(p);

/** The two thresholds (熟, 精) of each game, in its own measure (踩曲: accuracy 0…1). */
export const GRADE_AT: Record<GameId, readonly [number, number]> = {
  qu: [0.6, 0.85],
  mo: [7, 14],
  can: [35, 60],
  yuan: [180, 300],
  ying: [22, 40],
  shang: [45, 75],
};

export function gradeOf(g: GameId, v: number): GameGrade {
  const [shu, jing] = GRADE_AT[g];
  return v >= jing ? '精' : v >= shu ? '熟' : '初';
}

/**
 * The 土产 a finished round grants: 1, or 2 at 精 (or with a bonus: 摸鱼's 鳜), and only on the game's
 * first PAID_ROUNDS (3) rounds of the day (`paidToday`: the rounds that already paid today).
 */
export function goodsFor(grade: GameGrade, paidToday: number, bonus = false): number {
  if (paidToday >= PAID_ROUNDS) return 0;
  return grade === '精' || bonus ? 2 : 1;
}

/** The 文 caps per round (spec §5.1–§5.6). */
export const COIN_CAP: Record<GameId, number> = { qu: 30, mo: 35, can: 30, yuan: 30, ying: 25, shang: 35 };

/** A round's 文 (before the purse's daily rate): each game's formula, capped. 摸鱼: +10 for beating 阿黍. */
export function coinsFor(g: GameId, score: number, o: { beatAshu?: boolean } = {}): number {
  const s = Math.max(0, Number.isFinite(score) ? score : 0);
  let c: number;
  switch (g) {
    case 'qu': c = Math.floor(s / 10); break;
    case 'mo': c = 2 * Math.floor(s) + (o.beatAshu ? 10 : 0); break;
    case 'can': c = Math.floor(s / 2); break;
    case 'yuan': c = Math.floor(s / 10); break;
    case 'ying': c = Math.floor(s / 2); break;
    case 'shang': c = Math.floor(s / 3); break;
  }
  return clamp(c, 0, COIN_CAP[g]);
}

/** A seal is earned only in normal mode (never with 「慢些」). */
export const sealEarned = (gentle: boolean, feat: boolean): boolean => !gentle && feat;

/** 「慢些」: windows and radii ×1.5, the rules' speeds ×0.7. */
export const GENTLE_WIDE = 1.5;
export const GENTLE_SLOW = 0.7;

// ═════════════════════════════ 踩曲 · qu (spec §5.1)

export type Judge = '正' | '好' | 'miss';
export type Lane = 'L' | 'R' | 'B';

/** Judge a press `dtMs` off its beat: ±70 正 / ±140 好 (gentle ×1.5; 定 widens both by 10 ms). */
export function judge(dtMs: number, gentle: boolean, calm: boolean): Judge {
  const d = Math.abs(dtMs);
  const w = gentle ? GENTLE_WIDE : 1;
  const plus = calm ? 10 : 0;
  if (d <= 70 * w + plus) return '正';
  if (d <= 140 * w + plus) return '好';
  return 'miss';
}
export const JUDGE_POINTS: Record<Judge, number> = { 正: 3, 好: 1, miss: 0 };
/** The 碾 release window (ms) around the hold's end. */
export const GRIND_WINDOW = 140;
/** 碾: points per beat held, when released in the window. */
export const GRIND_PER_BEAT = 2;
/** A perfect 喊号 bar. */
export const CALL_BONUS = 20;

/** ×(1 + 0.1·⌊combo/10⌋), at most ×1.5. */
export const comboMul = (combo: number): number => Math.min(1.5, 1 + 0.1 * Math.floor(Math.max(0, combo) / 10));

export interface QuNote {
  /** Beat index from the end of the count-in (0 … 95). */
  beat: number;
  lane: Lane;
  /** 碾: held this many beats (0.5 … 1.5). */
  hold?: number;
  /** In a 喊号 echo bar: shown as a blank blot. */
  echo?: boolean;
}
export interface QuChart {
  song: SongId;
  bpm: number;
  /** Count-in beats (4). */
  countIn: number;
  /** Beats per block (32) × blocks (3). */
  blockBeats: number;
  blocks: number;
  notes: QuNote[];
  /** 喊号: 杜二 calls at bar `call` (beat of its start), you answer at `echo` (the next bar). */
  calls: { call: number; echo: number; pattern: QuNote[] }[];
}

export const SONG_BPM: Record<SongId, number> = { qizao: 72, caiqu: 84, gane: 92, shoushu: 100, huazhao: 108 };

/** One bar (4 beats, from beat 0) of a song's pattern, in block b (0…2), bar i. */
function barOf(song: SongId, b: number, i: number): QuNote[] {
  const n = (beat: number, lane: Lane, hold?: number): QuNote => (hold ? { beat, lane, hold } : { beat, lane });
  const alt = (i % 2 === 0) as boolean;
  const A: Lane = alt ? 'L' : 'R', Z: Lane = alt ? 'R' : 'L';
  switch (song) {
    case 'qizao':
      // quarters, alternating; 跺 at the bar's end
      return [n(0, A), n(1, Z), n(2, A), n(3, 'B')];
    case 'caiqu':
      // eighths in pairs
      return [n(0, A), n(0.5, A), n(1, Z), n(1.5, Z), n(2, A), n(2.5, A), n(3, 'B')];
    case 'gane':
      // syncopated, with 碾
      return i % 4 === 3
        ? [n(0, A), n(1, Z, 1), n(2.5, A), n(3, 'B')]
        : [n(0, A), n(1.5, Z), n(2, A, 0.5), n(3.5, Z)];
    case 'shoushu':
      // mixed
      return i % 2 === 0
        ? [n(0, A), n(0.5, Z), n(1, A), n(2, Z, 1), n(3.5, 'B')]
        : [n(0, 'B'), n(1, A), n(1.5, A), n(2, Z), n(2.5, Z), n(3, A)];
    case 'huazhao':
      // everything; triplets in block 3
      if (b === 2 && i % 2 === 1) return [n(0, A), n(1 / 3, Z), n(2 / 3, A), n(1, 'B'), n(2, Z), n(2 + 1 / 3, A), n(2 + 2 / 3, Z), n(3, 'B')];
      return i % 3 === 2
        ? [n(0, A, 1.5), n(2, Z), n(2.5, Z), n(3, 'B')]
        : [n(0, A), n(0.5, Z), n(1.5, A), n(2, 'B'), n(3, Z), n(3.5, A)];
  }
}

/** The 喊号 pattern 杜二 calls in block b (a one-bar call, echoed the next bar). */
export function callBar(song: SongId, b: number): QuNote[] {
  const base = barOf(song, b, 1);
  // 杜二's call is the song's own bar, stamped with a 跺 where it had none (so it is heard as his)
  return base.map((x) => ({ beat: x.beat, lane: x.lane, ...(x.hold ? { hold: x.hold } : {}) }));
}

/** The fixed chart of a 号子: a 4-beat count-in, then 3 blocks of 32 beats; one 喊号 in blocks 2 and 3. */
export function chart(song: SongId): QuChart {
  const blockBeats = 32, blocks = 3;
  const notes: QuNote[] = [];
  const calls: QuChart['calls'] = [];
  for (let b = 0; b < blocks; b++) {
    for (let i = 0; i < blockBeats / 4; i++) {
      const start = b * blockBeats + i * 4;
      // blocks 2 and 3: bar 4 is 杜二's call (no notes for you), bar 5 is your echo (blank blots)
      if (b > 0 && i === 4) {
        const pattern = callBar(song, b).map((x) => ({ ...x, beat: x.beat + start }));
        calls.push({ call: start, echo: start + 4, pattern });
        continue;
      }
      if (b > 0 && i === 5) {
        for (const x of callBar(song, b)) notes.push({ ...x, beat: x.beat + start, echo: true });
        continue;
      }
      for (const x of barOf(song, b, i)) notes.push({ ...x, beat: x.beat + start });
    }
  }
  notes.sort((a, c) => a.beat - c.beat);
  return { song, bpm: SONG_BPM[song], countIn: 4, blockBeats, blocks, notes, calls };
}

/** +20 for a 喊号 echo bar only when every note of it was 正. */
export function callBonus(judges: readonly Judge[]): number {
  return judges.length > 0 && judges.every((j) => j === '正') ? CALL_BONUS : 0;
}

/** Accuracy = (3·正 + 好) / (3 · notes). */
export function quAccuracy(zheng: number, hao: number, notes: number): number {
  return notes > 0 ? (3 * zheng + hao) / (3 * notes) : 0;
}
/** 熟 ≥60%, 精 ≥85%. */
export const gradeQu = (acc: number): GameGrade => gradeOf('qu', acc);
/** Seal 曲: 精 on a 号子 at 92 bpm or faster. */
export const quSealFeat = (song: SongId, grade: GameGrade): boolean => grade === '精' && SONG_BPM[song] >= 92;
/** The 号子 open now: 《起早》, today's, and any reached 熟 on. */
export function songsOpen(today: SongId, reached: (s: SongId) => boolean, all: readonly SongId[]): SongId[] {
  return all.filter((s) => s === 'qizao' || s === today || reached(s));
}
/** The calibration's offset: the median of (tap − clap), seconds; 0 with no taps. */
export function median(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

// ═════════════════════════════ 摸鱼 · mo (spec §5.2)

export type FishKind = 'ji' | 'li' | 'qiu' | 'xia' | 'gui';
export const FISH_POINTS: Record<FishKind, number> = { ji: 1, li: 3, qiu: 2, xia: 1, gui: 8 };
/** Cruising speeds (m/s). */
export const FISH_SPEED: Record<FishKind, number> = { ji: 0.6, li: 0.3, qiu: 0.45, xia: 0.35, gui: 0.4 };
/** The patch: 3 × 2 m (x along the stream, 0 upstream at the bridge-stones; y across). */
export const PATCH = { w: 3, h: 2 };
export const MO = {
  round: 90,
  sink: 0.4, sinkGentle: 0.3,
  rippleSpeed: 0.5, rippleR: 1.2, rippleAlert: 0.5,
  alertDecay: 0.4,
  fleeAt: 1, fleeSpeed: 1.5, fleeFor: 1.2,
  stillSpeed: 0.1, curiousAfter: 1.5, curiousAfterLi: 1.0, curiousR: 1.5, curiousSpeed: 0.15,
  catchR: 0.18, catchAlert: 0.6,
  nearR: 0.5, nearAlert: 1, nearSpread: 1.5,
  mud: 1.5, mudR: 0.3,
  slipTaps: 3, slipWindow: 0.8, slipTapsGentle: 2, slipWindowGentle: 1.0,
  shrimpFlickAt: 0.5, shrimpFlick: 0.4, shrimpBehind: 0.1,
  guiAfter: 60, guiStill: 4, guiChance: 0.4,
  splashEvery: 8, splashR: 1, splashAlert: 0.5,
  murkAlert: 0.6, murkSee: 0.6, brushR: 0.25,
  max: 10,
};

export interface Fish {
  id: number;
  kind: FishKind;
  x: number; y: number;
  /** Heading (unit). */
  dx: number; dy: number;
  alert: number;
  /** Seconds of dash left. */
  flee: number;
  /** 虾: seconds until it may flick again. */
  flick: number;
  /** A wander phase. */
  ph: number;
  gone?: boolean;
}

/** The ripple threshold (m/s): 0.5, gentle 0.75, 暖 +15%. */
export function rippleSpeed(gentle: boolean, mood: Mood | null): number {
  return MO.rippleSpeed * (gentle ? GENTLE_WIDE : 1) * (mood === '暖' ? 1.15 : 1);
}

/** Hands moving at `speed`: past the threshold, every fish within 1.2 m gets alert +0.5 (×0.6 murky). True if it rippled. */
export function ripple(fish: Fish[], hx: number, hy: number, speed: number, threshold: number, murky = false): boolean {
  if (speed <= threshold) return false;
  alertAround(fish, hx, hy, MO.rippleR, MO.rippleAlert * (murky ? MO.murkAlert : 1));
  return true;
}

/** Alert +k to every fish within r. */
export function alertAround(fish: Fish[], x: number, y: number, r: number, k: number): void {
  for (const f of fish) if (!f.gone && Math.hypot(f.x - x, f.y - y) <= r) f.alert += k;
}

/** Where a fish is caught: its centre; a 虾's point sits 0.1 m behind its tail (close behind it). */
export function shrimpPoint(f: Pick<Fish, 'x' | 'y' | 'dx' | 'dy'>): { x: number; y: number } {
  const tail = 0.05;
  return { x: f.x - f.dx * (tail + MO.shrimpBehind), y: f.y - f.dy * (tail + MO.shrimpBehind) };
}
export const catchPoint = (f: Fish) => (f.kind === 'xia' ? shrimpPoint(f) : { x: f.x, y: f.y });

/** The catch radius: 0.18 m (gentle 0.24). */
export const catchR = (gentle: boolean) => (gentle ? 0.24 : MO.catchR);

/** A lift at (hx, hy): every fish within the radius with alert under 0.6. */
export function catchAt(fish: readonly Fish[], hx: number, hy: number, gentle: boolean): Fish[] {
  const r = catchR(gentle);
  return fish.filter((f) => {
    if (f.gone || f.alert >= MO.catchAlert) return false;
    const p = catchPoint(f);
    return Math.hypot(p.x - hx, p.y - hy) <= r;
  });
}

/** A lift that caught nothing while a fish was within 0.5 m: alert +1 to every fish within 1.5 m. True if it was a near miss. */
export function nearMiss(fish: Fish[], hx: number, hy: number): boolean {
  if (!fish.some((f) => !f.gone && Math.hypot(f.x - hx, f.y - hy) <= MO.nearR)) return false;
  alertAround(fish, hx, hy, MO.nearSpread, MO.nearAlert);
  return true;
}

/** A 泥鳅 is kept if tapped 3 times within 0.8 s of the catch (gentle: 2 within 1.0 s). */
export function slipKept(taps: readonly number[], t0: number, gentle: boolean): boolean {
  const need = gentle ? MO.slipTapsGentle : MO.slipTaps;
  const win = gentle ? MO.slipWindowGentle : MO.slipWindow;
  return taps.filter((t) => t >= t0 && t - t0 <= win).length >= need;
}

/** The 鳜 may come: in the last 30 s, after 4 s still, with the hands in the upstream (bridge-stone) third. */
export function guiAllowed(t: number, stillFor: number, hx: number): boolean {
  return t >= MO.guiAfter && stillFor >= MO.guiStill && hx < PATCH.w / 3;
}

/** 阿黍's creel: within ±1 of yours (r in −1…1), and at least 2. */
export function ashuTally(mine: number, r: number): number {
  const d = clamp(Math.round(r), -1, 1);
  return Math.max(2, mine + d);
}

export interface MoEnv {
  /** Hands down (sunk) and where. */
  hands: { down: boolean; x: number; y: number; stillFor: number };
  gentle: boolean;
}

/** One step of the fish (2D boids in patch coordinates). Pure but for `rng`. */
export function stepFish(fish: Fish[], dt: number, env: MoEnv, rng: Rng): void {
  const slow = env.gentle ? GENTLE_SLOW : 1;
  const H = env.hands;
  for (const f of fish) {
    if (f.gone) continue;
    f.alert = Math.max(0, f.alert - MO.alertDecay * dt);
    f.flick = Math.max(0, f.flick - dt);
    // 虾: a flick backward at alert ≥ 0.5
    if (f.kind === 'xia' && f.alert >= MO.shrimpFlickAt && f.flick <= 0) {
      f.x -= f.dx * MO.shrimpFlick; f.y -= f.dy * MO.shrimpFlick;
      f.flick = 1.5;
    }
    if (f.alert >= MO.fleeAt && f.flee <= 0) {
      f.flee = MO.fleeFor;
      // away from the hands (or on along its heading)
      const ax = f.x - H.x, ay = f.y - H.y, l = Math.hypot(ax, ay);
      if (H.down && l > 1e-3) { f.dx = ax / l; f.dy = ay / l; }
    }
    let sp: number;
    if (f.flee > 0) {
      f.flee -= dt;
      sp = MO.fleeSpeed * slow;
    } else {
      const d = Math.hypot(H.x - f.x, H.y - f.y);
      const wait = f.kind === 'li' ? MO.curiousAfterLi : MO.curiousAfter;
      if (H.down && H.stillFor >= wait && d <= MO.curiousR && d > 0.04 && f.kind !== 'xia') {
        // curious: toward the still hands
        f.dx = (H.x - f.x) / d; f.dy = (H.y - f.y) / d;
        sp = MO.curiousSpeed;
      } else {
        // wander: a slow turn, a cruise at a third of its speed
        f.ph += dt * (0.6 + rng() * 0.8);
        const turn = Math.sin(f.ph) * 1.2 * dt;
        const c = Math.cos(turn), s = Math.sin(turn);
        const nx = f.dx * c - f.dy * s, ny = f.dx * s + f.dy * c;
        f.dx = nx; f.dy = ny;
        sp = FISH_SPEED[f.kind] * 0.35 * slow;
      }
    }
    f.x += f.dx * sp * dt; f.y += f.dy * sp * dt;
    // the patch's edges turn them back
    const m = 0.08;
    if (f.x < m) { f.x = m; f.dx = Math.abs(f.dx); }
    if (f.x > PATCH.w - m) { f.x = PATCH.w - m; f.dx = -Math.abs(f.dx); }
    if (f.y < m) { f.y = m; f.dy = Math.abs(f.dy); }
    if (f.y > PATCH.h - m) { f.y = PATCH.h - m; f.dy = -Math.abs(f.dy); }
  }
}

/** A fish, somewhere in the patch. */
export function makeFish(id: number, kind: FishKind, rng: Rng, at?: { x: number; y: number }): Fish {
  const a = rng() * Math.PI * 2;
  return {
    id, kind,
    x: at?.x ?? 0.3 + rng() * (PATCH.w - 0.6), y: at?.y ?? 0.3 + rng() * (PATCH.h - 0.6),
    dx: Math.cos(a), dy: Math.sin(a), alert: 0, flee: 0, flick: 0, ph: rng() * 6,
  };
}

/** How many fish should swim at time t (the curve): 4, then 6–8, capped at 10. */
export function fishWanted(t: number, rng: Rng): number {
  if (t < 30) return 4;
  return Math.min(MO.max, 6 + Math.floor(rng() * 3));
}
/** A kind for a new fish at time t (虾 and 泥鳅 from 30 s). */
export function fishKindAt(t: number, rng: Rng): FishKind {
  const r = rng();
  if (t < 30) return r < 0.8 ? 'ji' : 'li';
  return r < 0.4 ? 'ji' : r < 0.55 ? 'li' : r < 0.78 ? 'xia' : 'qiu';
}

// ═════════════════════════════ 采桑喂蚕 · can (spec §5.3)

export type Leaf = 'nen' | 'lao' | 'shi' | 'huang' | 'shen';
/** 蚁蚕 · 二眠 · 三眠 · 大蚕. */
export const TRAY_RATE = [0.05, 0.06, 0.07, 0.08];
export const CAN = {
  round: 90,
  feedOff: 0.6,
  full: 1,
  hungryPenaltyAfter: 4, hungryPenaltyEvery: 4,
  wetPause: 4, noisePause: 2,
  sleepFrom: 45, warn: 3, sleep: 8, sleepGap: 5.5,
  noiseDrops: 3, noiseWindow: 1, noiseStep: 0.4, noiseDecay: 0.8,
  regrow: 1.2, slots: 5, rack: 3, dry: 5, dryGentle: 3,
  spinFrom: 70, spinWindow: 20, cocoon: 5, berry: 2,
};

export interface Tray {
  hunger: number;
  /** Stops eating until this time (a wet leaf, the noise). */
  pausedTo: number;
  /** Time it last reached 100% (−Infinity: never). */
  fullAt: number;
  /** Seconds held at 100% (reset when fed). */
  fullFor: number;
  /** Penalties charged for this spell at 100%. */
  charged: number;
  /** In play (the first 20 s, only 蚁蚕 and 二眠). */
  on: boolean;
}

export const makeTrays = (): Tray[] => [0, 1, 2, 3].map((i) => ({ hunger: 0.3 + i * 0.05, pausedTo: 0, fullAt: -Infinity, fullFor: 0, charged: 0, on: i < 2 }));

/** The 眠 schedule: tray `first` warns at 45 s, then the others in turn, 5.5 s apart; each sleeps 8 s after a 3 s warning. */
export function sleepAt(tray: number, first: number): { warn: number; from: number; to: number } {
  const order = (tray - first + 4) % 4;
  const warn = CAN.sleepFrom + order * CAN.sleepGap;
  return { warn, from: warn + CAN.warn, to: warn + CAN.warn + CAN.sleep };
}
export type TrayState = 'awake' | 'warn' | 'asleep';
export function trayState(tray: number, first: number, t: number, sleepOn = true): TrayState {
  if (!sleepOn) return 'awake';
  const s = sleepAt(tray, first);
  return t >= s.from && t < s.to ? 'asleep' : t >= s.warn && t < s.from ? 'warn' : 'awake';
}

/**
 * Hunger rises (by size; ×0.7 gentle), frozen while asleep. A tray held at 100% more than 4 s loses a
 * point every 4 s. Returns the points lost this step.
 */
export function stepTrays(trays: Tray[], dt: number, t: number, o: { gentle: boolean; first: number; sleepOn?: boolean }): number {
  let lost = 0;
  trays.forEach((tr, i) => {
    if (!tr.on) return;
    if (trayState(i, o.first, t, o.sleepOn ?? true) === 'asleep') return;
    tr.hunger = Math.min(CAN.full, tr.hunger + TRAY_RATE[i] * (o.gentle ? GENTLE_SLOW : 1) * dt);
    if (tr.hunger >= CAN.full) {
      tr.fullAt = t;
      tr.fullFor += dt;
      // (4 s at 100% are free; then a point every 4 s)
      const due = Math.max(0, Math.floor(tr.fullFor / CAN.hungryPenaltyEvery) - Math.floor(CAN.hungryPenaltyAfter / CAN.hungryPenaltyEvery));
      lost += due - tr.charged;
      tr.charged = due;
    } else {
      tr.fullFor = 0;
      tr.charged = 0;
    }
  });
  return lost;
}

/** Which trays a leaf suits: 嫩 → 蚁蚕, 二眠; 老 → 三眠, 大蚕. */
export const suits = (leaf: 'nen' | 'lao', tray: number) => (leaf === 'nen' ? tray < 2 : tray >= 2);

export type FeedWord = 'right' | 'ok' | 'full' | 'wet' | 'asleep' | 'spotted' | 'wrong' | 'paused';
/** Feed a leaf to a tray at time t: the score and the word over the tray. */
export function feed(trays: Tray[], i: number, leaf: Leaf, t: number, o: { first: number; sleepOn?: boolean }): { score: number; word: FeedWord } {
  const tr = trays[i];
  if (trayState(i, o.first, t, o.sleepOn ?? true) === 'asleep') return { score: -3, word: 'asleep' };
  if (leaf === 'shi') { tr.pausedTo = Math.max(tr.pausedTo, t + CAN.wetPause); return { score: -2, word: 'wet' }; }
  if (leaf === 'huang') return { score: -1, word: 'spotted' };
  if (leaf === 'shen') return { score: 0, word: 'wrong' };
  if (!suits(leaf, i)) return { score: 0, word: 'wrong' };
  if (t < tr.pausedTo) return { score: 0, word: 'paused' };
  const h = tr.hunger;
  tr.hunger = Math.max(0, h - CAN.feedOff);
  if (h >= 0.8) return { score: 2, word: 'right' };
  if (h >= 0.4) return { score: 1, word: 'ok' };
  return { score: 0, word: 'full' };
}

/**
 * The noise meter: more than 3 drops within 1 s raise it by 0.4 (once per burst); it decays 0.8 a
 * second. Returns the new level; `hush` is true when it reached 1 (every tray stops eating 2 s).
 */
export function noise(level: number, drops: readonly number[], t: number, dt: number, lastBurst: number): { level: number; hush: boolean; burst: number } {
  let l = Math.max(0, level - CAN.noiseDecay * dt);
  let burst = lastBurst;
  const recent = drops.filter((d) => t - d <= CAN.noiseWindow && d > lastBurst);
  if (recent.length > CAN.noiseDrops) { l += CAN.noiseStep; burst = t; }
  return { level: l >= 1 ? 0 : l, hush: l >= 1, burst };
}

/** At the end: +5 for each tray that never reached 100% in the last 20 s. */
export function cocoons(trays: readonly Tray[], end: number): number {
  return trays.filter((tr) => tr.on && tr.fullAt < end - CAN.spinWindow).length;
}

/** A new leaf for the branch at time t, by the day's mix (嫩多 · 老多 · 雨后: 湿 ×2). */
export function leafAt(t: number, mix: 'nen' | 'lao' | 'yu', rng: Rng): Leaf {
  const r = rng();
  if (r < 0.06) return 'shen';
  if (t < 20) return 'nen';
  const wet = t >= 20 ? (mix === 'yu' ? 0.3 : 0.15) : 0;
  const spot = t >= 45 ? 0.12 : 0;
  const q = rng();
  if (q < wet) return 'shi';
  if (q < wet + spot) return 'huang';
  const nen = mix === 'nen' ? 0.62 : mix === 'lao' ? 0.38 : 0.5;
  return rng() < nen ? 'nen' : 'lao';
}

// ═════════════════════════════ 纸鸢 · yuan (spec §5.4)

export type KiteKind = 'yan' | 'die' | 'ying';
export type DraughtKind = 'huan' | 'ji' | 'zhen';
export const YUAN = {
  round: 90,
  /**
   * The spec's climbing rates (9·lift, 3·lift a second) ×3; the falls and the tension as written. With
   * every rate as written the breaths are too short against the gaps between them: a flawless flight
   * tops out near 70 尺, and 熟 180 / 精 300 / the 300 尺 seal could never be reached.
   */
  climb: 3,
  snap: 1.0, snapGentle: 1.3, snapCalm: 0.05,
  stallT: 0.15, stallFall: 8,
  tMax: 1.2,
  inhaleFrom: 70, inhaleFall: 6,
  crashLoss: 10, restartH: 30,
  whistleBand: 0.15,
  ringH: 15, ringX: 0.15, ringPts: 5,
  birdH: 10, birdX: 0.1, birdPts: 10, birdStay: 5,
  tangleX: 0.08, tangleH: 12, tangleDrop: 20, tangleFor: 3,
  tell: 0.7, tellGentle: 1.2,
  steer: 0.7,
};

export interface Breath { at: number; dur: number; strength: number }

/** The round's breaths (every 4–9 s, lasting 2–4 s): regular to 30 s, irregular after; by the day's draught. */
export function breaths(kind: DraughtKind, seed: number): Breath[] {
  const rng = makeRng(seed);
  const out: Breath[] = [];
  let t = 1.2;
  while (t < YUAN.inhaleFrom) {
    const irregular = t >= 30;
    let dur: number, strength: number, gap: number;
    if (kind === 'huan') { dur = 3.2 + rng() * 0.8; strength = 0.55 + rng() * 0.15; gap = 5 + rng() * 2; }
    else if (kind === 'ji') { dur = 2 + rng() * 0.6; strength = 0.85 + rng() * 0.15; gap = 4 + rng() * 1.5; }
    else { dur = 2 + rng() * 2; strength = 0.4 + rng() * 0.6; gap = 4 + rng() * 5; }
    if (!irregular) { gap = kind === 'zhen' ? 6 : gap * 0.5 + 3; }
    else { gap = Math.max(4 - dur * 0, gap + (rng() - 0.5) * 2); }
    out.push({ at: t, dur, strength: clamp(strength, 0.3, 1) });
    t += dur + clamp(gap, 1.2, 9);
  }
  return out;
}
/** The breath blowing at t, or null. */
export function breathAt(bs: readonly Breath[], t: number): Breath | null {
  for (const b of bs) if (t >= b.at && t < b.at + b.dur) return b;
  return null;
}
/** A breath comes within `lead` seconds (the petals' tell). */
export function tellAt(bs: readonly Breath[], t: number, lead: number): boolean {
  return bs.some((b) => t >= b.at - lead && t < b.at + b.dur);
}
/** The band's centre wanders (−0.6…0.6). */
export const bandAt = (t: number, seed = 0): number => 0.45 * Math.sin(t * 0.21 + seed) + 0.15 * Math.sin(t * 0.53 + seed * 2);

/** Lift = strength × max(0, 1 − 2·|x − band|); the 鹰 ×1.5 in a strong breath (>0.7), ×0.6 in a weak one. */
export function liftOf(strength: number, x: number, band: number, kite: KiteKind = 'yan'): number {
  let l = strength * Math.max(0, 1 - 2 * Math.abs(x - band));
  if (kite === 'ying') l *= strength > 0.7 ? 1.5 : 0.6;
  return l;
}

/** The snap limit: 1.0 (gentle 1.3; 定 +0.05). */
export const snapLimit = (gentle: boolean, mood: Mood | null) => (gentle ? YUAN.snapGentle : YUAN.snap) + (mood === '定' ? YUAN.snapCalm : 0);

export interface KiteState {
  h: number;
  x: number;
  T: number;
  maxH: number;
  snapped: boolean;
  /** Crashed in a peach: no flight until this time. */
  downTo: number;
  /** Tangled: tumbling until this time. */
  tumbleTo: number;
}
export const makeKite = (): KiteState => ({ h: YUAN.restartH, x: 0, T: 0.4, maxH: YUAN.restartH, snapped: false, downTo: -1, tumbleTo: -1 });

/**
 * One step of the kite. `breath`: the strength blowing now (0: none); `inhale`: the cave breathes in
 * (70–90 s). Returns what happened: 'snap', 'crash' or null.
 */
export function stepKite(s: KiteState, dt: number, o: {
  t: number; holding: boolean; steer: number; strength: number; band: number; inhale: boolean;
  kite?: KiteKind; gentle?: boolean; mood?: Mood | null;
}): 'snap' | 'crash' | null {
  if (s.snapped || o.t < s.downTo) return null;
  const kite = o.kite ?? 'yan';
  const up = YUAN.climb * (kite === 'die' ? 1.25 : 1);
  const spike = kite === 'die' ? 1.3 : 1;
  const tumbling = o.t < s.tumbleTo;
  const hold = o.holding && !tumbling;
  if (!tumbling) s.x = clamp(s.x + o.steer * YUAN.steer * dt, -1, 1);
  let dh = 0, dT = 0;
  if (o.inhale) {
    dh = hold ? 0 : -YUAN.inhaleFall;
    dT = hold ? 0.3 * spike : -0.5;
  } else if (o.strength > 0) {
    const lift = liftOf(o.strength, s.x, o.band, kite);
    if (hold) { dh = 9 * lift; dT = 0.5 * spike; } else { dh = 3 * lift; dT = -0.4; }
  } else {
    if (hold) { dh = -2; dT = 0.3 * spike; } else { dh = -4; dT = -0.5; }
  }
  s.T = clamp(s.T + dT * dt, 0, YUAN.tMax);
  // a slack line with no breath: the kite stalls
  if (s.T < YUAN.stallT && o.strength <= 0 && !o.inhale) dh = -YUAN.stallFall;
  s.h += (dh > 0 ? dh * up : dh) * dt;
  if (s.T > snapLimit(!!o.gentle, o.mood ?? null)) { s.snapped = true; return 'snap'; }
  if (s.h > s.maxH) s.maxH = s.h;
  if (s.h <= 0) {
    s.h = YUAN.restartH;
    s.T = 0.4;
    s.downTo = o.t + YUAN.crashLoss;
    return 'crash';
  }
  return null;
}

/** 鹞琴: the kite sings in a breath while it sits within 0.15 of the band's centre. */
export const sings = (x: number, band: number, strength: number) => strength > 0 && Math.abs(x - band) < YUAN.whistleBand;

/** A petal ring is passed (h within ±15, x within 0.15). */
export const ringHit = (s: { h: number; x: number }, ring: { h: number; x: number }) => Math.abs(s.h - ring.h) <= YUAN.ringH && Math.abs(s.x - ring.x) <= YUAN.ringX;
/** The bluebird is brushed (h within ±10, x within 0.1): it perches. */
export const birdHit = (s: { h: number; x: number }, bird: { h: number; x: number }) => Math.abs(s.h - bird.h) <= YUAN.birdH && Math.abs(s.x - bird.x) <= YUAN.birdX;
/** The two kites cross (|Δx| < 0.08, |Δh| < 12) — never under 甜. */
export const tangles = (a: { h: number; x: number }, b: { h: number; x: number }, mood: Mood | null) =>
  mood !== '甜' && Math.abs(a.x - b.x) < YUAN.tangleX && Math.abs(a.h - b.h) < YUAN.tangleH;
/** A tangle: −20 尺 and 3 s of tumbling. */
export function tangle(s: KiteState, t: number): void {
  s.h = Math.max(1, s.h - YUAN.tangleDrop);
  s.tumbleTo = t + YUAN.tangleFor;
}

/** The rings (3–5 of them at set heights, 30–70 s). */
export function ringsFor(seed: number): { h: number; x: number; from: number; to: number }[] {
  const rng = makeRng(seed ^ 0x51f);
  const n = 3 + Math.floor(rng() * 3);
  return Array.from({ length: n }, (_, i) => ({ h: 60 + i * 45 + rng() * 20, x: -0.6 + rng() * 1.2, from: 30 + i * (40 / n), to: 30 + (i + 1) * (40 / n) }));
}
/** The bluebird's crossing: it flies across x from −1 to 1 over 8 s from about 48 s, at a height. */
export function birdAt(t: number, seed: number): { h: number; x: number } | null {
  const t0 = 46 + (seed % 5), h = 110 + (seed % 60);
  if (t < t0 || t > t0 + 8) return null;
  return { h, x: -1 + ((t - t0) / 8) * 2 };
}
/** Score = the max height (尺) + rings + bird + seconds sung. */
export const yuanScore = (maxH: number, rings: number, bird: boolean, sung: number) => Math.floor(maxH) + rings * YUAN.ringPts + (bird ? YUAN.birdPts : 0) + Math.floor(sung);
/** Seal 鸢: a max height of 300 尺. */
export const yuanSealFeat = (maxH: number) => maxH >= 300;

// ═════════════════════════════ 捉萤 · ying (spec §5.5)

export type FlyKind = 'dan' | 'shuang' | 'chang' | 'you' | 'wang';
export const FLY_POINTS: Record<FlyKind, number> = { dan: 1, shuang: 1, chang: 1, you: 2, wang: 10 };
export const YING = {
  round: 75,
  hitPx: 28, hitPxGentle: 40,
  scatter: 0.6, darkFor: 3,
  strokeMax: 0.4, cooldown: 0.35,
  net: 3, netPts: 3,
  syncFrom: 55, syncEvery: 1.2, syncLit: 0.4,
  denseFrom: 25, kingAt: 40,
  youSpeed: 0.8, kingSpeed: 0.7,
};

/** The 萤王's four codes (daily.ts KING_CODES, in order): L long, S short. */
export const KING_PATTERNS: readonly string[] = ['LLLS', 'SSL', 'LLS', 'SSSL'];
const KING_LONG = 0.8, KING_SHORT = 0.3, KING_GAP = 0.4, KING_REST = 1.6;
/** The 萤王's code as lit spans within one period, and the period. */
export function kingSpans(code: number): { spans: [number, number][]; period: number } {
  const p = KING_PATTERNS[code % KING_PATTERNS.length];
  const spans: [number, number][] = [];
  let t = 0;
  for (const c of p) {
    const d = c === 'L' ? KING_LONG : KING_SHORT;
    spans.push([t, t + d]);
    t += d + KING_GAP;
  }
  return { spans, period: t - KING_GAP + KING_REST };
}

/** Is a firefly lit at its own time `u` (seconds since its phase began)? */
export function litAt(kind: FlyKind, u: number, code = 0): boolean {
  const m = (v: number, p: number) => ((v % p) + p) % p;
  switch (kind) {
    case 'dan': return m(u, 2.0) < 0.4;
    case 'shuang': { const x = m(u, 2.4); return x < 0.25 || (x >= 0.55 && x < 0.8); }
    case 'chang': return m(u, 4.5) < 1.5;
    case 'you': return m(u, 2.5) < 0.8;
    case 'wang': { const k = kingSpans(code); const x = m(u, k.period); return k.spans.some(([a, b]) => x >= a && x < b); }
  }
}
/** 同步 (55–75 s): everyone flashes together, 0.4 s lit every 1.2 s. */
export const syncPhase = (t: number): boolean => t >= YING.syncFrom && ((t - YING.syncFrom) % YING.syncEvery) < YING.syncLit;
/** A firefly's light at round time t (its own phase, or the 同步 beat). */
export function flyLit(kind: FlyKind, t: number, phase: number, code = 0): boolean {
  if (t >= YING.syncFrom && kind !== 'wang') return syncPhase(t);
  return litAt(kind, t + phase, code);
}

/** Seconds until the 萤王 is next lit (0 if it is lit now), from its own time u. */
export function kingNextLit(u: number, code: number): number {
  const k = kingSpans(code);
  const x = ((u % k.period) + k.period) % k.period;
  for (const [a, b] of k.spans) { if (x >= a && x < b) return 0; if (x < a) return a - x; }
  return k.period - x + k.spans[0][0];
}
/** Where the 萤王 will light next: it flies straight while dark, so lead it along its path. */
export function leadPoint(p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number }, u: number, code: number): { x: number; y: number; z: number } {
  const dt = kingNextLit(u, code);
  return { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
}

/** Distance from a point to a segment (screen px). */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const sx = bx - ax, sy = by - ay, l2 = sx * sx + sy * sy || 1;
  const k = clamp(((px - ax) * sx + (py - ay) * sy) / l2, 0, 1);
  return Math.hypot(px - ax - sx * k, py - ay - sy * k);
}

/**
 * A stroke sample (the segment a→b in screen px) over the fireflies' screen positions: the lit ones
 * within the radius are caught, the dark ones scattered.
 */
export function sweep(seg: { ax: number; ay: number; bx: number; by: number }, flies: readonly { sx: number; sy: number; lit: boolean; on: boolean }[], r: number): { caught: number[]; scattered: number[] } {
  const caught: number[] = [], scattered: number[] = [];
  flies.forEach((f, i) => {
    if (!f.on) return;
    if (segDist(f.sx, f.sy, seg.ax, seg.ay, seg.bx, seg.by) > r) return;
    (f.lit ? caught : scattered).push(i);
  });
  return { caught, scattered };
}
/** 一网: three or more in one stroke, +3. */
export const netBonus = (n: number): number => (n >= YING.net ? YING.netPts : 0);
/** How many fireflies are about at t (15, then 30). */
export const fliesWanted = (t: number): number => (t < YING.denseFrom ? 15 : 30);
/** Seal 萤: the 萤王 caught and 40 or more. */
export const yingSealFeat = (king: boolean, score: number) => king && score >= 40;

// ═════════════════════════════ 流觞 · shang (spec §5.6)

export const SHANG = {
  flow: { slow: 0.28, normal: 0.35, fast: 0.45 } as const,
  bend: 0.3,
  half: 0.3,
  captureU: 0.12, captureV: 0.25, eddyLen: 0.2,
  bumpsToSpill: 2,
  poke: 0.25, pokeR: 0.6, pokeKey: 0.18, pokeWobble: 0.15,
  brake: 0.6, brakeFor: 2, brakeAhead: 0.5,
  drag: 1.6,
  right: 10, centred: 5, fewPokes: 3, fewPokesMax: 2, own: 5,
  bays: [0.2, 0.35, 0.5, 0.7, 0.85],
};

export interface Cup {
  /** Along the channel (m). */
  s: number;
  /** Across (m, −0.3…0.3). */
  u: number;
  /** Lateral speed (m/s). */
  v: number;
  bumps: number;
  pokes: number;
  /** Brake seconds left. */
  brake: number;
  /** Braking now. */
  braking: boolean;
  /** Stopped at a bay (index), or spilled, or past the end. */
  bay: number | null;
  spilled: boolean;
  end: boolean;
  /** The cup's speed now (m/s). */
  speed: number;
}
export const makeCup = (s = 0.2, u = 0): Cup => ({ s, u, v: 0, bumps: 0, pokes: 0, brake: SHANG.brakeFor, braking: false, bay: null, spilled: false, end: false, speed: 0 });

export interface Bay { s: number; u: number }
/**
 * The flow along the channel at (s, u): the day's speed, +30% on the outside of a bend (`bend` is the
 * channel's turn there: + to the left).
 */
export function flowAt(base: number, u: number, bend: number): number {
  const outside = bend === 0 ? 0 : clamp((-Math.sign(bend) * u) / SHANG.half, 0, 1) * Math.min(1, Math.abs(bend) * 2);
  return base * (1 + SHANG.bend * outside);
}

/** A poke (拨) at distance d (m) from the cup, from the side `side` (−1: the tap is left of the cup): Δv away from it. */
export function poke(cup: Cup, d: number, side: -1 | 1, o: { key?: boolean; wobble?: number } = {}): number {
  const dv = o.key ? SHANG.pokeKey : SHANG.poke * Math.max(0, 1 - d / SHANG.pokeR);
  const k = dv * (1 + (o.wobble ?? 0));
  cup.v += -side * k;
  cup.pokes++;
  return k;
}

/** Brake (拦): ×0.6 while held, out of a 2 s budget per cup. Returns whether it holds. */
export function brake(cup: Cup, on: boolean, dt: number): boolean {
  cup.braking = on && cup.brake > 0;
  if (cup.braking) cup.brake = Math.max(0, cup.brake - dt);
  return cup.braking;
}

/** Captured by a bay's eddy: |u − u_bay| < 0.12 and speed under 0.25 m/s, within the eddy. */
export function capture(cup: Cup, bay: Bay): boolean {
  return Math.abs(cup.s - bay.s) < SHANG.eddyLen && Math.abs(cup.u - bay.u) < SHANG.captureU && cup.speed < SHANG.captureV;
}

/**
 * One step of a cup (`base`: the day's flow; `bend`: the channel's turn at s; `len`: its length).
 * Returns 'bump', 'spill', 'bay', 'end' or null.
 */
export function stepCup(cup: Cup, dt: number, o: { base: number; bend: number; len: number; bays: readonly Bay[]; slow?: number }): 'bump' | 'spill' | 'bay' | 'end' | null {
  if (cup.bay !== null || cup.spilled || cup.end) return null;
  const along = flowAt(o.base, cup.u, o.bend) * (cup.braking ? SHANG.brake : 1) * (o.slow ?? 1);
  cup.v *= Math.exp(-SHANG.drag * dt);
  cup.s += along * dt;
  cup.u += cup.v * dt;
  cup.speed = Math.hypot(along, cup.v);
  let ev: 'bump' | 'spill' | 'bay' | 'end' | null = null;
  if (Math.abs(cup.u) >= SHANG.half) {
    cup.u = Math.sign(cup.u) * (SHANG.half - 0.01);
    cup.v = -cup.v * 0.5;
    cup.bumps++;
    ev = 'bump';
    if (cup.bumps >= SHANG.bumpsToSpill) { cup.spilled = true; return 'spill'; }
  }
  for (let i = 0; i < o.bays.length; i++) {
    if (capture(cup, o.bays[i])) { cup.bay = i; return 'bay'; }
  }
  if (cup.s >= o.len) { cup.end = true; return 'end'; }
  return ev;
}

/** A cup's score: the right bay 10 + up to 5 for centring + 3 for two pokes or fewer; else 0. */
export function cupScore(cup: Cup, want: number, bays: readonly Bay[]): number {
  if (cup.bay === null || cup.bay !== want) return 0;
  const off = Math.abs(cup.u - bays[want].u);
  return SHANG.right + Math.round(SHANG.centred * Math.max(0, 1 - off / SHANG.captureU)) + (cup.pokes <= SHANG.fewPokesMax ? SHANG.fewPokes : 0);
}
/** 双觞 (the fifth): two cups to two bays, each scored as a cup. */
export const doubleScore = (a: Cup, wa: number, b: Cup, wb: number, bays: readonly Bay[]) => cupScore(a, wa, bays) + cupScore(b, wb, bays);
/** Seal 觞: every cup (both of the 双觞) stopped at its bay. */
export const shangSealFeat = (right: number, cups: number) => cups > 0 && right === cups;
