// 水月幻镜 · 打击感, the feel layer (GDD §20): what makes a hit land. Every player-side strike and
// kill reports here; the feel layer answers with
//   · a hit reaction on the body (1–2 frame white flash, a squash that recovers, a recoil nudge);
//   · directional spatter by weapon class (sword streaks, heavy rings and blots, feathers, talisman
//     sparks, wine drops, 墨宝 ink, jade chips, go stones, notes, moon glints) and an impact flare;
//   · a death burst (a wet crown, flung droplets, a stain stamped into the paper, a pop);
//   · micro-hitstop (crits, heavy blows, elite kills, big area hits, the 镜技's impact) spent from a
//     token bucket so hitstop never takes more than ~14% of any second (5% sustained);
//   · a trauma camera (amplitude ∝ trauma², smooth noise, real-time decay), directional kicks and
//     zoom punches. The offset never exceeds 6 px (GDD §20.3); ordinary hits spend trauma and kicks
//     from a per-second budget (small bumps), the big jolts are elite kills, 镜技, bosses and blows
//     you take. Shake and kicks obey the shake setting (zoom punches halve without it), everything
//     obeys reduced motion;
//   · a sound bus: the step's hits become ≤ 4 voices (class colour, kill pop, crit crack, thump),
//     started on the step the hit lands so the sound meets the flash on the same frame;
//   · navigator.vibrate ticks (an 8 ms tick when you are hurt; elite kills and the 镜技 at most once a
//     second; boss blows), silent where unsupported.
// Everything is pooled (typed arrays, a cosmetic RNG that never touches the simulation's streams)
// and thinned by load and by the frame-time guard. The renderer draws the sparks; world.ts calls in.
import type { WeaponId } from '../ids';
import type { SfxName, WClass } from '../types';
import type { FeelVoice } from '../audio/voices';
import { FeelSprites, SH, TN, WARM } from '../paint/feel';
import { EKind, Pool } from './pools';
import { SRCI } from './consts';
import type { World } from './world';

/** Feel classes: how a hit from this source looks and sounds. */
export const FC = {
  slash: 0, heavy: 1, claw: 2, fist: 3, arrow: 4, dart: 5, talisman: 6, wine: 7, ink: 8, flying: 9, go: 10, music: 11, moon: 12,
  skill: 13, generic: 14,
} as const;
const NFC = 15;

interface ClassFx {
  shape: number; tint: number; tint2: number; n: number; v0: number; v1: number; life: number; spread: number; s0: number; s1: number;
  drag: number; stretch: boolean; spin: number;
  /** Hit weight 0..1: squash, recoil, flash length and how much of the bus it takes. */
  weight: number;
  voice: FeelVoice; fb: SfxName | null;
  /** Impact ring tint (−1 none) and radius (u). */
  ring: number; ringR: number;
  /** A second shape thrown with the first (−1 none). */
  shape2: number; tint3: number;
  /** Swipe tint for melee swings. */
  swipe: number;
}
const D = (o: Partial<ClassFx>): ClassFx => ({
  shape: SH.dot, tint: TN.ink, tint2: TN.ink, n: 2, v0: 140, v1: 280, life: 0.24, spread: 1.2, s0: 1, s1: 0.5, drag: 6, stretch: false, spin: 0,
  weight: 0.4, voice: 'blot', fb: null, ring: -1, ringR: 22, shape2: -1, tint3: TN.ink, swipe: TN.ink, ...o,
});
const FXD: readonly ClassFx[] = [
  /* slash */ D({ shape: SH.streak, tint: TN.azure, tint2: TN.ink, n: 2, v0: 300, v1: 480, life: 0.16, spread: 0.8, s0: 0.75, s1: 0.35, drag: 9, stretch: true, weight: 0.55, voice: 'slash', fb: 'hitMelee', shape2: SH.drop, tint3: TN.ink, swipe: TN.azure }),
  /* heavy */ D({ shape: SH.blot, tint: TN.ink, tint2: TN.grey, n: 3, v0: 150, v1: 320, life: 0.28, spread: 1.7, s0: 0.95, s1: 0.45, drag: 7, weight: 1, voice: 'smash', fb: 'hitMelee', ring: TN.ink, ringR: 30, shape2: SH.drop, tint3: TN.ink, swipe: TN.ink }),
  /* claw */ D({ shape: SH.drop, tint: TN.ink, tint2: TN.wine, n: 2, v0: 180, v1: 320, life: 0.2, spread: 1.1, s0: 0.7, s1: 0.35, drag: 8, stretch: true, weight: 0.5, voice: 'clawHit', fb: 'hitMelee', shape2: SH.claw, tint3: TN.ink, swipe: TN.ink }),
  /* fist */ D({ shape: SH.drop, tint: TN.wine, tint2: TN.ink, n: 3, v0: 170, v1: 330, life: 0.24, spread: 1.4, s0: 0.8, s1: 0.4, drag: 7, stretch: true, weight: 0.75, voice: 'smash', fb: 'hitMelee', ring: TN.ink, ringR: 18, swipe: TN.wine }),
  /* arrow */ D({ shape: SH.feather, tint: TN.paper, tint2: TN.grey, n: 2, v0: 110, v1: 240, life: 0.38, spread: 2.2, s0: 0.9, s1: 0.7, drag: 5, spin: 14, weight: 0.45, voice: 'arrow', fb: 'hitShot', shape2: SH.dot, tint3: TN.ink }),
  /* dart */ D({ shape: SH.spark, tint: TN.white, tint2: TN.gold, n: 3, v0: 240, v1: 430, life: 0.13, spread: 1.4, s0: 0.55, s1: 0.2, drag: 10, stretch: true, weight: 0.35, voice: 'dartHit', fb: 'hitShot' }),
  /* talisman */ D({ shape: SH.spark, tint: TN.gamboge, tint2: TN.gold, n: 3, v0: 170, v1: 380, life: 0.22, spread: 2.8, s0: 0.75, s1: 0.25, drag: 7, spin: 10, weight: 0.4, voice: 'spark', fb: 'hitTalisman' }),
  /* wine */ D({ shape: SH.drop, tint: TN.wine, tint2: TN.wine, n: 3, v0: 150, v1: 300, life: 0.3, spread: 1.9, s0: 0.85, s1: 0.45, drag: 6, stretch: true, weight: 0.5, voice: 'splash', fb: 'hitMelee', shape2: SH.dot, tint3: TN.wine }),
  /* ink */ D({ shape: SH.blot, tint: TN.indigo, tint2: TN.ink, n: 2, v0: 120, v1: 260, life: 0.3, spread: 1.8, s0: 0.75, s1: 0.4, drag: 6, weight: 0.5, voice: 'blot', fb: 'hitMelee', shape2: SH.drop, tint3: TN.indigo }),
  /* flying */ D({ shape: SH.chip, tint: TN.jade, tint2: TN.jade, n: 2, v0: 200, v1: 380, life: 0.22, spread: 1.3, s0: 0.95, s1: 0.5, drag: 7, spin: 18, weight: 0.5, voice: 'jade', fb: 'hitShot', shape2: SH.streak, tint3: TN.jade, swipe: TN.azure }),
  /* go */ D({ shape: SH.stone, tint: TN.black, tint2: TN.white, n: 2, v0: 150, v1: 280, life: 0.32, spread: 2, s0: 0.9, s1: 0.7, drag: 6, weight: 0.6, voice: 'clack', fb: 'hitMelee', ring: TN.ink, ringR: 16 }),
  /* music */ D({ shape: SH.note, tint: TN.green, tint2: TN.green, n: 1, v0: 60, v1: 130, life: 0.4, spread: 1.4, s0: 1, s1: 0.8, drag: 3, weight: 0.35, voice: 'pluckHit', fb: 'hitTalisman', ring: TN.green, ringR: 14 }),
  /* moon */ D({ shape: SH.glint, tint: TN.moon, tint2: TN.moon, n: 2, v0: 80, v1: 200, life: 0.26, spread: 1.8, s0: 0.9, s1: 0.4, drag: 5, spin: 6, weight: 0.4, voice: 'moonHit', fb: 'hitShot' }),
  /* skill */ D({ shape: SH.blot, tint: TN.ink, tint2: TN.gold, n: 3, v0: 180, v1: 360, life: 0.3, spread: 2.2, s0: 1, s1: 0.5, drag: 6, weight: 0.9, voice: 'smash', fb: 'hitMelee', shape2: SH.spark, tint3: TN.gold }),
  /* generic */ D({ shape: SH.dot, tint: TN.ink, tint2: TN.grey, n: 1, v0: 120, v1: 240, life: 0.2, spread: 1.4, s0: 0.8, s1: 0.4, drag: 7, weight: 0.3, voice: 'blot', fb: null }),
];

/** Voices the bus can fall back to on an audio without the impact layer. */
const FALLBACK: Partial<Record<FeelVoice, SfxName>> = {
  pop: 'kill', popBig: 'kill', crack: 'crit', skillHit: 'hitMelee', smash: 'hitMelee', slash: 'hitMelee',
};

/** Which feel class a weapon hits with. */
export function fcOfWeapon(id: WeaponId, cls: readonly WClass[]): number {
  if (id === 'claw') return FC.claw;
  if (id === 'drunkfist') return FC.fist;
  if (id === 'gourd') return FC.wine;
  if (id === 'rod') return FC.arrow;
  if (cls.includes('flying')) return FC.flying;
  if (cls.includes('heavy')) return FC.heavy;
  if (cls.includes('ink')) return FC.ink;
  if (cls.includes('go')) return FC.go;
  if (cls.includes('talisman')) return FC.talisman;
  if (cls.includes('music')) return FC.music;
  if (cls.includes('moon')) return FC.moon;
  if (cls.includes('bow')) return FC.arrow;
  if (cls.includes('hidden') || cls.includes('fortune')) return FC.dart;
  if (cls.includes('wine')) return FC.wine;
  if (cls.includes('fist')) return FC.fist;
  return FC.slash;
}
/** The swipe tint of a melee class. */
export const swipeTint = (fc: number): number => (FXD[fc] ?? FXD[FC.slash]).swipe;

/** Spark flags. */
export const PF = { stretch: 1, stamp: 2, ease: 4, swipe: 8, flip: 16, pop: 32 } as const;

/** The feel particles: a pooled structure of arrays (drawn by the renderer from baked sprites). */
export class Sparks extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly life: Float32Array; readonly life0: Float32Array; readonly s0: Float32Array; readonly s1: Float32Array;
  readonly rot: Float32Array; readonly vr: Float32Array; readonly drag: Float32Array; readonly a0: Float32Array;
  readonly shape: Uint8Array; readonly tint: Uint8Array; readonly flags: Uint8Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.life0 = F(); this.s0 = F(); this.s1 = F();
    this.rot = F(); this.vr = F(); this.drag = F(); this.a0 = F();
    this.shape = new Uint8Array(cap); this.tint = new Uint8Array(cap); this.flags = new Uint8Array(cap);
  }
}

/** Live sparks by quality: phones (mid, low) raster every one at DPR 2–3, so they keep fewer. */
const SPARK_CAP = { low: 140, mid: 220, high: 360 } as const;
const Q_BASE = { low: 0.55, mid: 0.8, high: 1 } as const;
/** Largest shake (CSS px) at trauma 1; a shake(px) request maps to trauma √(px / MAX). GDD §20.3: 6 px. */
const MAX_SHAKE = 6;
/** The camera's whole offset (shake + kick) never exceeds this (CSS px). */
const MAX_OFFSET = 6;
/** Kicks: what the hits of one step may add, and the total (CSS px). */
const KICK_STEP = 3.5;
const KICK_MAX = 4;
/** Hit trauma (crits, heavy blows) comes from its own bucket — capacity and refill per real second — and
 *  never lifts trauma past HIT_CEIL (≈ 2.6 px): a crit build gets small bumps, not a held 6 px shake. */
const HIT_TRAUMA_CAP = 0.6;
const HIT_TRAUMA_REFILL = 0.9;
const HIT_CEIL = 0.66;
/** Ranged weapons whose single blows are heavy by nature (the 射日弓, the flying swords, the first
 *  strike of 雷符): they land with a flare, a ring and a short stop even without a crit. */
const WEIGHTY: ReadonlySet<string> = new Set(['sunbow', 'qingping', 'casket', 'thunder']);
/** Hitstop token bucket: capacity and refill (ms of freeze per s of real time): ≤ 140 ms in any second. */
const STOP_CAP = 90;
const STOP_REFILL = 50;

export interface FeelStats {
  sparks: number; emitted: number; hits: number; kills: number; voices: number; stopReqMs: number; stopMs: number; stopDenied: number;
  frozenMs: number; realMs: number; maxShare: number; lastShare: number; stamps: number; q: number;
}

export class Feel {
  readonly sp: Sparks;
  readonly sprites: FeelSprites;
  /** Emission quality 0..1 (quality × load × the frame guard), recomputed each step. */
  q = 1;
  private stepEmit = 0;
  /** Trauma the step's ordinary hits have added (capped, so a crowd of crits is one jolt, not seven). */
  private stepTrauma = 0;
  /** Kick the step's hits have added (CSS px). */
  private stepKick = 0;
  /** The hit-trauma bucket (see HIT_TRAUMA_CAP). */
  private hitBank = HIT_TRAUMA_CAP;
  private lastHitKick = -9;
  private lastWeighty = -9;
  private stepBudget = 24;
  private stampsStep = 0;
  private seed = 0x2545f491;
  // camera (CSS px; real time)
  trauma = 0;
  kickX = 0; kickY = 0;
  zoom = 0;
  offX = 0; offY = 0;
  private shakeT = 0;
  // hitstop budget
  private bank = STOP_CAP;
  private lastCritStop = -9;
  private lastHeavyStop = -9;
  private lastSkill = -9;
  private secReal = 0; private secFrozen = 0;
  // player
  /** Seconds (real) since you were last hurt; the heartbeat phase at low HP. */
  hurtAge = 9;
  hurtK = 0;
  /** The direction the last blow pushed you (a sprite offset only: the simulation never drifts). */
  hurtUx = 0; hurtUy = 0;
  beat = 0;
  private beatN = 0;
  // sound bus (per step)
  private busW = new Float32Array(NFC);
  private busN = new Uint16Array(NFC);
  private busCrit = 0; private busHeavy = 0; private busKill = 0; private busBig = 0; private busSkill = 0; private busWeighty = 0;
  /** A blow you took (its grunt gain, 0 none) and a level-up this step: they go out with the bus. */
  private busHurt = 0; private busLevel = 0;
  private lastCrack = -9; private lastThump = -9; private lastZip = -9;
  private lastVib = -9;
  /** Per-slot visual state for the held weapons (anticipation, follow-through, recoil). */
  slotT = new Float32Array(8).fill(9);
  slotDir = new Float32Array(8);
  slotMelee = new Uint8Array(8);
  /** The swipe direction alternates per slot (a combo swings back and forth). */
  private slotFlip = new Uint8Array(8);
  /** A running mean of hit numbers (numbers size by damage against it). */
  numRef = 10;
  readonly st: FeelStats = { sparks: 0, emitted: 0, hits: 0, kills: 0, voices: 0, stopReqMs: 0, stopMs: 0, stopDenied: 0, frozenMs: 0, realMs: 0, maxShare: 0, lastShare: 0, stamps: 0, q: 1 };

  constructor(private W: World) {
    this.sp = new Sparks(SPARK_CAP[W.quality] ?? SPARK_CAP.mid);
    // baked at the canvas's real DPR (min(dprCap, devicePixelRatio)), not the cap
    const dev = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.sprites = new FeelSprites(Math.max(1, Math.min(W.settings.dprCap || 2, dev)), W.quality === 'low' ? 0.85 : 1);
  }

  get motion(): boolean { return !this.W.settings.reduceMotion; }
  get shakeOn(): boolean { return !!this.W.settings.shake && !this.W.settings.reduceMotion; }

  /** A cosmetic random in [0, 1) (xorshift; never the simulation's streams). */
  rnd(): number {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  begin(): void {
    this.sp.clear();
    this.trauma = 0; this.kickX = this.kickY = 0; this.zoom = 0; this.offX = this.offY = 0;
    this.bank = STOP_CAP; this.hitBank = HIT_TRAUMA_CAP; this.hurtAge = 9; this.hurtK = 0;
    this.slotT.fill(9);
    // the world clock restarts at 0 every wave, so every rate gate starts fresh too
    this.lastHitKick = this.lastWeighty = this.lastCritStop = this.lastHeavyStop = this.lastSkill = -9;
    this.lastCrack = this.lastThump = this.lastZip = this.lastVib = -9;
    this.busReset();
    try { this.sprites.warm(WARM); } catch { /* no canvas */ }
  }

  // ─────────────────────────────────────────────────────────── particles

  /** May an effect of this priority emit now? 0 an ordinary hit, 1 a crit or a kill, 2 elites, bosses, skills. */
  room(prio: number): boolean {
    const P = this.sp;
    if (P.count >= P.cap - 1) return false;
    if (prio >= 2) return true;
    const fill = P.count / P.cap;
    if (prio === 0) return fill < 0.7 && this.stepEmit < this.stepBudget * 0.6;
    return fill < 0.9 && this.stepEmit < this.stepBudget;
  }
  /** Emit one spark (no budget check: call room() first). Returns its slot or −1. */
  emit(shape: number, tint: number, x: number, y: number, vx: number, vy: number, life: number, s0: number, s1: number, rot: number, vr: number, drag: number, flags: number, a0 = 1): number {
    const P = this.sp;
    const i = P.take();
    if (i < 0) return -1;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = P.life0[i] = life; P.s0[i] = s0; P.s1[i] = s1;
    P.rot[i] = rot; P.vr[i] = vr; P.drag[i] = drag; P.a0[i] = a0; P.shape[i] = shape; P.tint[i] = tint; P.flags[i] = flags;
    this.stepEmit++;
    this.st.emitted++;
    return i;
  }
  /** n (fractional: the rest by chance) scaled by the emission quality. */
  private count(n: number): number {
    const k = n * this.q;
    const whole = Math.floor(k);
    return whole + (this.rnd() < k - whole ? 1 : 0);
  }
  /** A spray of `n` pieces from (x, y) around direction `ang`. */
  private spray(def: ClassFx, n: number, x: number, y: number, ang: number, prio: number, sizeX: number, stamp: number): void {
    for (let k = 0; k < n; k++) {
      if (!this.room(prio)) return;
      const second = def.shape2 >= 0 && k === n - 1 && n > 1;
      const shape = second ? def.shape2 : def.shape;
      const tint = second ? def.tint3 : (k & 1 ? def.tint2 : def.tint);
      const a = ang + (this.rnd() - 0.5) * def.spread;
      const v = def.v0 + (def.v1 - def.v0) * this.rnd();
      const stretch = def.stretch || shape === SH.streak || shape === SH.drop;
      const flags = (stretch ? PF.stretch : 0) | (k < stamp ? PF.stamp : 0);
      const life = def.life * (0.75 + 0.5 * this.rnd());
      this.emit(shape, tint, x, y, Math.cos(a) * v, Math.sin(a) * v, life, def.s0 * sizeX, def.s1 * sizeX, a, (this.rnd() - 0.5) * 2 * def.spin, def.drag, flags, 0.92);
    }
  }

  /** One simulation step: move the sparks, stamp what lands, flush the sound bus. */
  step(dt: number): void {
    const W = this.W;
    // emission quality: the quality setting, the frame guard, and the crowd on screen
    let q = Q_BASE[W.quality] ?? 0.8;
    if (W.degrade) q *= 0.45;
    const load = W.E.count + W.PS.count * 0.25;
    if (load > 110) q *= Math.max(0.3, 110 / load);
    this.q = q;
    this.st.q = q;
    this.stepBudget = Math.max(6, (this.sp.cap / 16) * q);
    this.stepEmit = 0;
    this.stepTrauma = 0;
    this.stepKick = 0;
    this.stampsStep = 0;
    const P = this.sp;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        if ((P.flags[i] & PF.stamp) && this.stampsStep < 3 && W.painter) {
          this.stampsStep++;
          this.st.stamps++;
          try { W.painter.stamp('splat', P.x[i], P.y[i], 2.5 + P.s0[i] * 2.5, (i * 2654435761 + W.kills) >>> 0); } catch { /* optional */ }
        }
        P.release(i);
        continue;
      }
      const k = Math.exp(-P.drag[i] * dt);
      P.vx[i] *= k; P.vy[i] *= k;
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
      P.rot[i] += P.vr[i] * dt;
    }
    P.trim();
    this.st.sparks = P.count;
    for (let k = 0; k < 8; k++) if (this.slotT[k] < 9) this.slotT[k] += dt;
    this.flush();
  }

  // ─────────────────────────────────────────────────────────── hits and kills

  /**
   * A player-side strike landed on body i (called from World.strike before a possible death).
   * (fx, fy) is where the blow came from; fc the feel class; d the damage dealt.
   */
  hit(i: number, fx: number, fy: number, d: number, crit: boolean, fc: number, dot: boolean, src: number, slot = -1): void {
    const W = this.W, E = W.E;
    this.st.hits++;
    if (dot) return; // burns and bleeds tick quietly: their marks already show
    const def = FXD[fc] ?? FXD[FC.generic];
    const x = E.x[i], y = E.y[i], r = E.r[i];
    let dx = x - fx, dy = y - fy;
    let L = Math.hypot(dx, dy);
    if (L < 1) { const a = this.rnd() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); L = 1; }
    const ux = dx / L, uy = dy / L, ang = Math.atan2(uy, ux);
    const kind = E.kind[i];
    const big = kind === EKind.Elite || kind === EKind.Boss || kind === EKind.Demon;
    const heavy = def.weight >= 0.75;
    const t = W.t;
    // a weighty single blow (a quarter of the body at once, or a weapon heavy by nature): not a crit,
    // not a heavy melee class, not the 镜技 — those have their own jolts
    const wid = slot >= 0 && slot < W.slots.length ? W.slots[slot].id : '';
    const weighty = !crit && !heavy && src !== SRCI.skill && (d >= E.hpMax[i] * 0.25 || WEIGHTY.has(wid));
    // the body: a white flash of 3 frames (4 on a crit, a heavy or a weighty blow), squash and recoil
    E.flash[i] = crit || heavy || weighty ? 0.066 : 0.05;
    const w = Math.min(1, (weighty ? Math.max(0.75, def.weight * 1.4) : def.weight) * (crit ? 1.35 : 1) * (kind === EKind.Boss ? 0.35 : big ? 0.7 : 1));
    const now = E.hitAge[i] < 9 ? E.hitV[i] * Math.exp(-E.hitAge[i] / 0.09) : 0;
    if (w >= now * 0.8) { E.hitV[i] = w; E.hitA[i] = ang; E.hitAge[i] = 0; }
    // spatter from the side the blow came in, flung on through the body
    const prio = crit || big ? 1 : 0;
    const cx = x - ux * r * 0.55, cy = y - uy * r * 0.55;
    if (this.room(prio)) this.emit(SH.flare, crit ? TN.gold : TN.white, cx, cy, 0, 0, crit ? 0.09 : 0.06, crit ? 0.75 : 0.45, crit ? 1.05 : 0.6, 0, 0, 0, PF.ease, crit ? 0.95 : 0.8);
    const n = this.count(def.n * (crit ? 1.8 : 1) * (big ? 1.4 : 1));
    this.spray(def, n, x + ux * r * 0.3, y + uy * r * 0.3, ang, prio, 1 + (crit ? 0.25 : 0), 0);
    if (fc === FC.claw && this.room(prio)) this.emit(SH.claw, TN.ink, x, y, ux * 30, uy * 30, 0.16, 0.9, 1, ang + Math.PI / 2, 0, 8, 0, 0.9);
    if (def.ring >= 0 && (heavy || crit || fc !== FC.go || this.rnd() < 0.5) && this.room(prio)) {
      this.emit(SH.ring, def.ring, x, y, 0, 0, 0.16, (def.ringR / 32) * 0.35, (def.ringR / 32) * (crit ? 1.3 : 1), this.rnd() * 6.28, 0, 0, PF.ease, 0.8);
    }
    if (weighty && t - this.lastWeighty >= 0.1 && this.room(1)) {
      // the weighty blow's impact: a white flare and an ink ring
      this.emit(SH.flare, TN.white, x, y, 0, 0, 0.09, 0.6, 1.25, 0, 0, 0, PF.ease, 0.9);
      if (this.room(1)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.18, 0.2, 0.75, this.rnd() * 6.28, 0, 0, PF.ease, 0.75);
    }
    if (crit && this.room(1)) {
      // the crit's gold star-burst
      this.emit(SH.spark, TN.gold, x, y - r * 0.2, 0, 0, 0.14, 0.6, 1.5, this.rnd() * 6.28, 9, 0, PF.ease, 1);
      if (this.room(1)) { const a = ang + (this.rnd() - 0.5) * 1.2; this.emit(SH.streak, TN.gold, x, y, Math.cos(a) * 440, Math.sin(a) * 440, 0.12, 0.65, 0.2, a, 0, 10, PF.stretch, 0.9); }
    }
    // the bus: the class colour, a crack and a thump
    this.busW[fc] = Math.max(this.busW[fc], def.weight * (crit ? 1.3 : weighty ? 1.5 : 1));
    this.busN[fc]++;
    if (crit) this.busCrit++;
    if (heavy) this.busHeavy++;
    else if (weighty) this.busWeighty++;
    // hitstop and the camera: small bumps from the hit budget; the big jolts live elsewhere
    if (src === SRCI.skill) this.skillImpact(x, y);
    else if (crit) {
      if (t - this.lastCritStop >= 0.14) { this.lastCritStop = t; this.stop(heavy ? 45 : 24); }
      this.hitTrauma(heavy ? 0.34 : 0.24);
      this.hitKick(ux, uy, heavy ? 3.5 : 2.5);
    } else if (heavy && t - this.lastHeavyStop >= 0.22) {
      this.lastHeavyStop = t;
      this.stop(20);
      this.hitTrauma(0.24);
      this.hitKick(ux, uy, 3);
    } else if (weighty && t - this.lastWeighty >= 0.1) {
      this.lastWeighty = t;
      this.stop(18);
      this.hitTrauma(0.18);
      this.hitKick(ux, uy, 2.5);
    }
  }

  /** A body died at (x, y) (radius r, kind k); ang is the direction of the killing blow. */
  kill(x: number, y: number, r: number, k: number, crit: boolean, ang: number, fc: number): void {
    this.st.kills++;
    const elite = k === EKind.Elite || k === EKind.Demon;
    const boss = k === EKind.Boss;
    const prio = elite || boss ? 2 : 1;
    const sz = r / 22;
    // the crown: a wet ring breaking outward
    if (this.room(prio)) this.emit(SH.crown, TN.ink, x, y, 0, 0, boss ? 0.5 : elite ? 0.34 : 0.24, sz * 0.45, sz * (boss ? 2.2 : elite ? 1.6 : 1.15), this.rnd() * 6.28, 0, 0, PF.ease, 0.85);
    // droplets flung along the blow (one lands and stains the paper)
    const n = boss ? 18 : elite ? 9 : this.count(3 + (crit ? 2 : 0));
    const def = FXD[fc] ?? FXD[FC.generic];
    for (let j = 0; j < n; j++) {
      if (!this.room(prio)) break;
      const a = ang + (this.rnd() - 0.5) * (j < 2 ? 1.2 : 3.4);
      const v = (180 + 260 * this.rnd()) * (boss ? 1.6 : elite ? 1.3 : 1);
      const shape = j & 1 ? SH.dot : SH.drop;
      const tint = j === 2 && fc !== FC.generic && fc !== FC.heavy && fc !== FC.skill ? def.tint : TN.ink;
      this.emit(shape, tint, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.22 + 0.16 * this.rnd(), (0.8 + 0.6 * this.rnd()) * Math.max(0.8, sz), 0.4, a, 0, 5.5, (shape === SH.drop ? PF.stretch : 0) | (j === 0 ? PF.stamp : 0), 0.95);
    }
    this.busKill++;
    if (elite || boss) {
      this.busBig++;
      if (this.room(2)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.3, sz * 0.4, sz * 2, this.rnd() * 6.28, 0, 0, PF.ease, 0.9);
      if (this.room(2)) this.emit(SH.flare, TN.white, x, y, 0, 0, 0.1, sz * 1.2, sz * 2.4, 0, 0, 0, PF.ease, 0.9);
      if (elite) {
        this.stop(60);
        this.addTrauma(0.7);
        this.punch(0.03);
        this.vib(15, 1);
      }
    }
  }

  /** The 镜技 landed (the first hit of a cast, rate-limited): a boom, a ring, a zoom punch. */
  skillImpact(x: number, y: number): void {
    const W = this.W;
    if (W.t - this.lastSkill < 0.35) return;
    this.lastSkill = W.t;
    this.stop(55);
    this.addTrauma(0.75);
    this.punch(0.05);
    this.vib(14, 1);
    if (this.room(2)) this.emit(SH.ring, TN.gold, x, y, 0, 0, 0.32, 0.5, 2.6, this.rnd() * 6.28, 0, 0, PF.ease, 0.9);
    if (this.room(2)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.26, 0.3, 1.8, this.rnd() * 6.28, 0, 0, PF.ease, 0.8);
    // the boom goes out with the step's bus, counted in its 4 voices
    this.busSkill++;
  }

  /** A boss changed phase (the core's 120 ms stop already runs). */
  phase(x: number, y: number): void {
    this.addTrauma(0.85);
    this.punch(0.08);
    this.vib(40, 0);
    for (let k = 0; k < 2; k++) if (this.room(2)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.4 + k * 0.15, 0.6, 3.5 + k, this.rnd() * 6.28, 0, 0, PF.ease, 0.9);
  }
  /** A boss died (the core stops 160 ms and shakes). */
  bossDown(x: number, y: number): void {
    this.addTrauma(1);
    this.punch(0.1);
    this.vib(80, 0);
    if (this.room(2)) this.emit(SH.crown, TN.ink, x, y, 0, 0, 0.6, 1, 4, 0, 0, 0, PF.ease, 0.9);
  }

  /** You were hurt from (fx, fy) (NaN: unknown). */
  hurt(fx: number, fy: number, boss: boolean): void {
    const W = this.W;
    this.hurtAge = 0;
    this.hurtK = boss ? 1 : 0.8;
    let ux = 0, uy = 0;
    if (Number.isFinite(fx)) { const dx = W.px - fx, dy = W.py - fy, L = Math.hypot(dx, dy) || 1; ux = dx / L; uy = dy / L; }
    this.hurtUx = ux; this.hurtUy = uy;
    this.addTrauma(boss ? 1 : 0.8);
    this.kick(ux, uy, boss ? KICK_MAX : 3);
    // GDD §20.2: an 8 ms haptic tick (a boss's blow a little longer)
    this.vib(boss ? 20 : 8, 0.3);
    // ink knocked off you
    for (let k = 0; k < 4 && this.room(2); k++) {
      const a = Math.atan2(uy, ux) + (this.rnd() - 0.5) * 2.4;
      const v = 150 + 180 * this.rnd();
      this.emit(SH.drop, TN.ink, W.px, W.py, Math.cos(a) * v, Math.sin(a) * v, 0.25, 0.9, 0.4, a, 0, 6, PF.stretch, 0.9);
    }
    // the stop: always felt (at least 30 ms), paid from the same bucket
    if (this.motion) {
      const g = Math.max(30, Math.min(60, this.bank));
      this.bank = Math.max(-60, this.bank - g);
      W.hitstopMs = Math.max(W.hitstopMs, g);
      this.st.stopMs += g; this.st.stopReqMs += 60;
    }
    // GDD §20.2: the heartbeat drum (lub-dub) is the body of the sound; the clenched grunt sits on it
    try { W.sfx('hurt'); } catch { /* audio optional */ }
    this.busHurt = Math.max(this.busHurt, boss ? 0.7 : 0.55);
  }

  /** A melee swing: the brush-stroke swipe (reveal, then a dry follow-through) and a whoosh. */
  swing(slot: number, x: number, y: number, dir: number, r: number, deg: number, fc: number): void {
    if (slot >= 0 && slot < 8) { this.slotT[slot] = 0; this.slotDir[slot] = dir; this.slotMelee[slot] = 1; this.slotFlip[slot] ^= 1; }
    const flip = slot >= 0 && slot < 8 && this.slotFlip[slot] ? PF.flip : 0;
    const tint = swipeTint(fc);
    // the stroke runs through the middle of the reach, where the bodies it hits stand
    const size = (r * 0.72) / 100;
    const arcs = deg >= 300 ? 3 : deg >= 170 ? 2 : 1;
    for (let k = 0; k < arcs; k++) {
      if (!this.room(2)) break;
      const off = arcs === 1 ? 0 : (k - (arcs - 1) / 2) * (deg * Math.PI / 180) / arcs;
      const wide = arcs === 1 ? Math.max(0.6, Math.min(1.5, deg / 120)) : 1;
      this.emit(SH.swipe, tint, x, y, 0, 0, 0.2, size, wide, dir + off, 0, 0, PF.swipe | flip, 0.62);
    }
    this.voice('whoosh', 0.8, 0.9 + 0.2 * this.rnd());
  }
  /** A ranged shot left: the held weapon recoils and a puff blooms at its tip (silent: a pulse, whose
   *  ring already shows and whose hits already sound — no puff, no release). */
  fire(slot: number, x: number, y: number, dir: number, silent = false): void {
    if (slot >= 0 && slot < 8) { this.slotT[slot] = 0; this.slotDir[slot] = dir; this.slotMelee[slot] = 0; }
    if (silent) return;
    if (this.room(0)) this.emit(SH.puff, TN.paper, x + Math.cos(dir) * 26, y + Math.sin(dir) * 26, Math.cos(dir) * 60, Math.sin(dir) * 60, 0.12, 0.5, 1.1, 0, 0, 6, PF.ease, 0.7);
    this.voice('release', 0.8, 0.9 + 0.2 * this.rnd());
  }

  /** A mid-wave level-up: a gold burst, a thump, a zoom punch. */
  level(x: number, y: number): void {
    for (let k = 0; k < 12 && this.room(2); k++) {
      const a = (k / 12) * Math.PI * 2 + this.rnd() * 0.3, v = 260 + 120 * this.rnd();
      this.emit(k & 1 ? SH.glint : SH.streak, TN.gold, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.4, 1, 0.4, a, 0, 4, k & 1 ? 0 : PF.stretch, 0.95);
    }
    if (this.room(2)) this.emit(SH.flare, TN.gold, x, y, 0, 0, 0.18, 1.2, 3, 0, 0, 0, PF.ease, 0.8);
    this.punch(0.05);
    this.addTrauma(0.3);
    this.busLevel++;
  }
  /** 月华 (or a coin) reached you: a glint. */
  pickup(x: number, y: number, gold: boolean): void {
    if (!this.room(0)) return;
    const a = this.rnd() * 6.28;
    this.emit(SH.glint, gold ? TN.gold : TN.moon, x + Math.cos(a) * 8, y + Math.sin(a) * 8, Math.cos(a) * 40, Math.sin(a) * 40 - 30, 0.28, gold ? 1.1 : 0.8, 0.2, this.rnd() * 6.28, 6, 3, 0, 1);
  }
  /** Drops began streaming to you: a zip (rate-limited). */
  zip(): void {
    const t = this.W.t;
    if (t - this.lastZip < 0.25) return;
    this.lastZip = t;
    this.voice('zip', 0.9, 0.95 + 0.1 * this.rnd());
  }

  // ─────────────────────────────────────────────────────────── time, camera, hitstop

  /**
   * Real time passed (the loop calls this every frame, before drawing): the camera's trauma, kicks
   * and zoom decay, the hitstop bucket refills, and the frozen share of each second is tallied.
   */
  frame(realMs: number, frozenMs: number): void {
    const dt = Math.min(0.05, Math.max(0, realMs / 1000));
    this.bank = Math.min(STOP_CAP, this.bank + STOP_REFILL * dt);
    this.hitBank = Math.min(HIT_TRAUMA_CAP, this.hitBank + HIT_TRAUMA_REFILL * dt);
    this.st.frozenMs += frozenMs; this.st.realMs += realMs;
    this.secReal += realMs; this.secFrozen += frozenMs;
    if (this.secReal >= 1000) {
      const s = this.secFrozen / this.secReal;
      this.st.lastShare = s; this.st.maxShare = Math.max(this.st.maxShare, s);
      this.secReal = 0; this.secFrozen = 0;
    }
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    this.shakeT += dt;
    const amp = this.shakeOn ? MAX_SHAKE * this.trauma * this.trauma : 0;
    const t = this.shakeT;
    const kd = Math.exp(-dt * 20);
    this.kickX *= kd; this.kickY *= kd;
    if (!this.shakeOn) { this.kickX = 0; this.kickY = 0; }
    let ox = amp * (Math.sin(t * 47.3 + 1.1) * 0.6 + Math.sin(t * 23.9 + 4.2) * 0.4) + this.kickX;
    let oy = amp * (Math.sin(t * 41.7 + 2.3) * 0.6 + Math.sin(t * 29.1 + 0.7) * 0.4) + this.kickY;
    // the whole offset stays inside the GDD's 6 px, whatever piled up
    const L = Math.hypot(ox, oy);
    if (L > MAX_OFFSET) { ox *= MAX_OFFSET / L; oy *= MAX_OFFSET / L; }
    this.offX = ox; this.offY = oy;
    this.zoom *= Math.exp(-dt * 9);
    if (!this.motion) this.zoom = 0;
    this.hurtAge += dt;
    // the low-HP heartbeat: 72 → 110 bpm as the last quarter drains
    const W = this.W;
    const frac = W.hpMax > 0 ? W.hp / W.hpMax : 1;
    if (frac < 0.3 && W.phase === 'wave' && W.hp > 0) {
      const bpm = 72 + (1 - frac / 0.3) * 38;
      this.beat += dt * bpm / 60;
      const n = Math.floor(this.beat);
      if (n !== this.beatN) { this.beatN = n; if (frac < 0.25) this.voice('heart', 0.6 + (1 - frac / 0.25) * 0.4, 1); }
    }
    W.shakePx = amp;
  }

  /** Ask for a stop of `ms`, paid from the bucket (a stop already running only costs its extension). */
  stop(ms: number): void {
    const W = this.W;
    if (!this.motion || ms <= 0) return;
    this.st.stopReqMs += ms;
    const pend = Math.max(0, W.hitstopMs);
    const add = Math.max(0, ms - pend);
    if (add <= 0) return;
    const g = Math.min(add, this.bank);
    if (g < 8) { this.st.stopDenied++; return; }
    this.bank -= g;
    this.st.stopMs += g;
    W.hitstopMs = pend + g;
  }
  /** A stop that must happen whole (boss phases and deaths; 镜碎). */
  stopHard(ms: number): void {
    const W = this.W;
    if (!this.motion) return;
    this.st.stopReqMs += ms; this.st.stopMs += Math.max(0, ms - Math.max(0, W.hitstopMs));
    W.hitstopMs = Math.max(W.hitstopMs, ms);
  }
  /** Trauma from an ordinary hit: ≤ 0.3 a step, paid from the hit bucket, never past HIT_CEIL. */
  private hitTrauma(a: number): void {
    if (!this.shakeOn) return;
    const g = Math.min(a, Math.max(0, 0.3 - this.stepTrauma), this.hitBank, Math.max(0, HIT_CEIL - this.trauma));
    if (g <= 0) return;
    this.stepTrauma += g;
    this.hitBank -= g;
    this.addTrauma(g);
  }
  /** A kick from an ordinary hit: at most one per 0.08 s, ≤ KICK_STEP a step. */
  private hitKick(ux: number, uy: number, px: number): void {
    const t = this.W.t;
    if (t - this.lastHitKick < 0.08 || this.stepKick >= KICK_STEP) return;
    this.lastHitKick = t;
    const k = Math.min(px, KICK_STEP - this.stepKick);
    this.stepKick += k;
    this.kick(ux, uy, k);
  }
  addTrauma(a: number): void {
    if (!this.shakeOn) return;
    this.trauma = Math.min(1, this.trauma + a);
  }
  /** The contract's shake(px): trauma that alone gives about px of shake. */
  shake(px: number): void {
    this.addTrauma(Math.sqrt(Math.min(1, Math.max(0, px) / MAX_SHAKE)));
  }
  /** A directional kick of the camera (CSS px; the total stays within KICK_MAX). */
  kick(ux: number, uy: number, px: number): void {
    if (!this.shakeOn) return;
    this.kickX += ux * px; this.kickY += uy * px;
    const L = Math.hypot(this.kickX, this.kickY);
    if (L > KICK_MAX) { this.kickX *= KICK_MAX / L; this.kickY *= KICK_MAX / L; }
  }
  /** A zoom punch: off under reduced motion, halved with the shake setting off. */
  punch(z: number): void {
    if (!this.motion) return;
    this.zoom = Math.max(this.zoom, this.shakeOn ? z : z * 0.5);
  }
  /** A haptic tick (setting on, supported, not within `gap` s of the last). */
  vib(ms: number, gap: number): void {
    if (!FEEL_PREFS.vibrate) return;
    const t = this.W.t;
    if (t - this.lastVib < gap) return;
    this.lastVib = t;
    try { (globalThis.navigator as Navigator | undefined)?.vibrate?.(ms); } catch { /* not allowed */ }
  }

  // ─────────────────────────────────────────────────────────── sound

  /** Play an impact voice now (the audio's impact layer, or the contract's nearest sound). */
  voice(name: FeelVoice, gain: number, rate: number): void {
    const a = this.W.audio as unknown as { feel?: (n: FeelVoice, g?: number, r?: number) => void } | null;
    this.st.voices++;
    try {
      if (a?.feel) a.feel(name, gain, rate);
      else { const fb = FALLBACK[name]; if (fb) this.W.sfx(fb); }
    } catch { /* audio optional */ }
  }
  private busReset(): void {
    this.busW.fill(0); this.busN.fill(0);
    this.busCrit = 0; this.busHeavy = 0; this.busKill = 0; this.busBig = 0; this.busSkill = 0; this.busWeighty = 0; this.busHurt = 0; this.busLevel = 0;
  }
  /** The step's hits → at most 4 voices: the class colour, the pop, the crack, the thump. */
  private flush(): void {
    const t = this.W.t;
    let best = -1, bs = 0, total = 0;
    for (let c = 0; c < NFC; c++) {
      const n = this.busN[c];
      if (!n) continue;
      total += n;
      const s = this.busW[c] * (1 + 0.2 * Math.min(8, n));
      if (s > bs) { bs = s; best = c; }
    }
    let v = 0;
    // first what happened to you, then the 镜技's boom (it stands in for the skill class's colour),
    // then a level-up's thump (it stands in for the hits' thump)
    // (the heartbeat already sounded outside the bus in hurt(), so a hurt step counts two voices)
    if (this.busHurt > 0) { this.voice('grunt', this.busHurt, 1); v += 2; }
    if (this.busSkill) { this.voice('skillHit', 1, 1); v++; if (best === FC.skill) best = -1; }
    if (this.busLevel) { this.voice('thump', 0.8, 1); v++; this.lastThump = t; }
    if (best >= 0 && v < 4) {
      const def = FXD[best];
      const g = 0.6 + 0.4 * Math.min(1, total / 6);
      const a = this.W.audio as unknown as { feel?: unknown } | null;
      if (a && !a.feel && def.fb) { this.W.sfx(def.fb); this.st.voices++; } else this.voice(def.voice, g, 0.94 + 0.12 * this.rnd());
      v++;
    }
    if (this.busKill && v < 4) { this.voice(this.busBig ? 'popBig' : 'pop', 0.7 + 0.3 * Math.min(1, this.busKill / 4), this.busBig ? 1 : 0.92 + 0.16 * this.rnd()); v++; }
    if (this.busCrit && t - this.lastCrack >= 0.06 && v < 4) { this.lastCrack = t; this.voice('crack', 0.85, 0.95 + 0.1 * this.rnd()); v++; }
    if ((this.busCrit || this.busHeavy || this.busWeighty) && t - this.lastThump >= 0.07 && v < 4) { this.lastThump = t; this.voice('thump', this.busHeavy ? 1 : this.busWeighty ? 0.85 : 0.7, 0.95 + 0.1 * this.rnd()); v++; }
    // a big area blow (a heavy weapon or a blast into a crowd) stops the world a beat
    if (this.busHeavy >= 6) { this.stop(30); this.hitTrauma(0.2); }
    this.busReset();
  }

  stats(): FeelStats { return { ...this.st, sparks: this.sp.count }; }
}

/** Device-level feel preferences the UI sets (the pause sheet's 震动 switch: blows you take, elite
 *  kills, the 镜技 and bosses — never ordinary crits). */
export const FEEL_PREFS = { vibrate: true };
export function setVibrate(on: boolean): void { FEEL_PREFS.vibrate = on; }
