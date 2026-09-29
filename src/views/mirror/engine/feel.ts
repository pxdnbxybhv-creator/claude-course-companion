// 水月幻镜 · 打击感, the feel layer (GDD §20): what makes a hit land. The struck body shows the blow;
// the world does not. Every player-side strike and kill reports here; the feel layer answers with
//   · a reaction on the body, scaled by the blow's class and damage (light · medium · heavy/crit):
//     a crisp white flash in an ink rim (2 frames) that fades into a brief ink tint, a squash along
//     the blow that springs back, a recoil that snaps away and settles, and on medium and heavy blows
//     a LOCAL freeze — the struck sprite alone holds where it was hit and jitters for 45–75 ms (a per-
//     body bank keeps it ≤ 30% of any second) while the world runs on; then it flies (knockback).
//     Elites and bosses stagger (a flash, a ring of light, a wobble) every few % of their HP. All of
//     it is drawn only: the hitbox never moves (pose());
//   · luminous marks on the body by weapon class (an impact star; a cut across it for blades, a
//     double cut and a ring for heavy arms, a pierce beam for flying swords, claw rakes), directional
//     sparks flung out of the far side, spatter and a ground splash (marks, sparks);
//   · a death burst: the body's own sprite breaks into pieces flung along the killing blow (frags),
//     a pop of light, a ring, a wet crown, droplets and a stain stamped into the paper;
//   · the camera never moves for a hit (屏幕抖动, round 5): not for your own hits, crits, kills or
//     weapons, not for a blow you take, a boss's slam, phase change or death, not for the 镜技. The big
//     moments answer with a brief edge pulse (an overlay, the picture stays still), rings, sound and
//     haptics instead; trauma, kicks and zoom punches are no-ops (offX / offY / zoom stay 0);
//   · no global hitstop in ordinary play: only a boss's phase change (120 ms) and death (160 ms) stop
//     the world (stopHard); stop() is a no-op;
//   · a sound bus: the step's hits become ≤ 4 voices (class colour, kill pop, crit crack, thump),
//     started on the step the hit lands so the sound meets the flash on the same frame;
//   · navigator.vibrate ticks (an 8 ms tick when you are hurt; elite kills and the 镜技 at most once a
//     second; boss blows), silent where unsupported.
// Everything is pooled (typed arrays, a cosmetic RNG that never touches the simulation's streams)
// and thinned by load and by the frame-time guard. The renderer draws; world.ts calls in.
import type { WeaponId } from '../ids';
import type { AtlasId, SfxName, WClass } from '../types';
import type { FeelVoice } from '../audio/voices';
import { FeelSprites, SH, TN, WARM } from '../paint/feel';
import { EKind, Pool } from './pools';
import { IF, TN_OF, VT, flavorOfWeapon, tintOfWeapon, vfxOf } from './vfx';
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
  /* claw */ D({ shape: SH.drop, tint: TN.ink, tint2: TN.wine, n: 2, v0: 180, v1: 320, life: 0.2, spread: 1.1, s0: 0.7, s1: 0.35, drag: 8, stretch: true, weight: 0.5, voice: 'clawHit', fb: 'hitMelee', shape2: SH.dot, tint3: TN.wine, swipe: TN.ink }),
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

/** What a class leaves on the body it strikes: the impact star (tint, size × 48 u), a mark across the
 *  body (shape, tint, size), a ring of light (−1 none), the ground splash's tint (−1 none), the tint of
 *  the directional sparks. Player tints only: never vermilion. */
interface MarkDef { star: number; starS: number; mark: number; markT: number; markS: number; halo: number; splat: number; spark: number }
const MD = (o: Partial<MarkDef>): MarkDef => ({ star: TN.white, starS: 0.5, mark: -1, markT: TN.white, markS: 1, halo: -1, splat: TN.ink, spark: TN.white, ...o });
const MKD: readonly MarkDef[] = [
  /* slash */ MD({ star: TN.azure, starS: 0.55, mark: SH.cut, markT: TN.azure, markS: 0.8, spark: TN.azure }),
  /* heavy */ MD({ star: TN.white, starS: 0.75, mark: SH.cut, markT: TN.azure, markS: 1.15, halo: TN.azure, spark: TN.azure }),
  /* claw */ MD({ star: TN.white, starS: 0.5, mark: SH.rake, markT: TN.moon, markS: 1.1, splat: TN.wine, spark: TN.white }),
  /* fist */ MD({ star: TN.gold, starS: 0.6, halo: TN.gold, splat: TN.wine, spark: TN.gold }),
  /* arrow */ MD({ star: TN.moon, starS: 0.45, mark: SH.beam, markT: TN.moon, markS: 0.6, spark: TN.moon }),
  /* dart */ MD({ star: TN.white, starS: 0.45, spark: TN.gold }),
  /* talisman */ MD({ star: TN.gold, starS: 0.6, splat: -1, spark: TN.gamboge }),
  /* wine */ MD({ star: TN.gold, starS: 0.5, splat: TN.wine, spark: TN.gold }),
  /* ink */ MD({ star: TN.indigo, starS: 0.5, splat: TN.indigo, spark: TN.indigo }),
  /* flying */ MD({ star: TN.jade, starS: 0.5, mark: SH.beam, markT: TN.jade, markS: 0.65, spark: TN.jade }),
  /* go */ MD({ star: TN.white, starS: 0.5, halo: TN.white, spark: TN.white }),
  /* music */ MD({ star: TN.green, starS: 0.45, halo: TN.green, splat: -1, spark: TN.green }),
  /* moon */ MD({ star: TN.moon, starS: 0.55, halo: TN.white, splat: -1, spark: TN.moon }),
  /* skill */ MD({ star: TN.gold, starS: 0.9, halo: TN.gold, spark: TN.gold }),
  /* generic */ MD({ star: TN.white, starS: 0.4, splat: -1 }),
];

/** Mark kinds: how the renderer animates one. */
export const MK = {
  /** An impact star: blooms 0.6 → 1, then fades. */
  pop: 0,
  /** A cut across the body: opens along its length and thins away. */
  cut: 1,
  /** A pierce beam: shoots along the blow and thins. */
  beam: 2,
  /** A ring of light that grows and fades. */
  ring: 3,
  /** A ground splash under the bodies: lands and dries away. */
  ground: 4,
  /** Claw rakes across the body. */
  rake: 5,
} as const;

/** Hit marks: stars, cuts, beams and rings on (and splashes under) the bodies, drawn by the renderer
 *  in the enemy layer. A mark with an owner follows the body's drawn pose (recoil, freeze). */
export class Marks extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly ox: Float32Array; readonly oy: Float32Array;
  readonly ang: Float32Array; readonly life: Float32Array; readonly life0: Float32Array;
  readonly s0: Float32Array; readonly s1: Float32Array; readonly a0: Float32Array;
  readonly owner: Int16Array; readonly gen: Uint32Array;
  readonly shape: Uint8Array; readonly tint: Uint8Array; readonly kind: Uint8Array; readonly calm: Uint8Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.ox = F(); this.oy = F(); this.ang = F(); this.life = F(); this.life0 = F();
    this.s0 = F(); this.s1 = F(); this.a0 = F();
    this.owner = new Int16Array(cap); this.gen = new Uint32Array(cap);
    this.shape = new Uint8Array(cap); this.tint = new Uint8Array(cap); this.kind = new Uint8Array(cap); this.calm = new Uint8Array(cap);
  }
}

/** Death fragments: pieces of the body's own sprite (cell q of a g × g grid), flung and spinning. */
export class Frags extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly rot: Float32Array; readonly vr: Float32Array; readonly life: Float32Array; readonly life0: Float32Array;
  readonly sc: Float32Array;
  /** The grid (g × g pieces) and which cell this piece is. */
  readonly g: Uint8Array; readonly q: Uint8Array; readonly flip: Uint8Array; readonly stamp: Uint8Array;
  /** The atlas id each piece is cut from (a reference kept in a fixed array: assigned, never allocated). */
  readonly id: (AtlasId | null)[];
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.rot = F(); this.vr = F(); this.life = F(); this.life0 = F(); this.sc = F();
    this.g = new Uint8Array(cap); this.q = new Uint8Array(cap); this.flip = new Uint8Array(cap); this.stamp = new Uint8Array(cap);
    this.id = new Array(cap).fill(null);
  }
}

/** The drawn pose of one body (pose() fills it; reused, never allocated per frame). */
export interface Pose {
  /** Where to draw it (world u; the hitbox stays at E.x/E.y). */
  x: number; y: number;
  /** The blow's axis (rad) and the squash along it (> 0 compressed), a wobble (rad). */
  ang: number; s: number; wob: number;
  /** Flash: 0 none, 1 the white twin alone, 2 the body with the twin over it at `fa`. */
  fl: number; fa: number;
  /** The ink tint that follows the flash (alpha of the ink twin over the body, 0 none). */
  ink: number;
}

/** Live sparks by quality: phones (mid, low) raster every one at DPR 2–3, so they keep fewer. */
const SPARK_CAP = { low: 140, mid: 220, high: 360 } as const;
/** Live marks and fragments by quality. */
const MARK_CAP = { low: 36, mid: 56, high: 80 } as const;
const FRAG_CAP = { low: 24, mid: 40, high: 64 } as const;
/** Marks a step may add (the busiest steps keep the heavy blows' marks). */
const MARK_STEP = { low: 5, mid: 7, high: 9 } as const;
/** Fragments per mob death (a mob breaks on a 3 × 3 grid, 2 × 2 on low). */
const FRAG_MOB = { low: 3, mid: 5, high: 6 } as const;
const Q_BASE = { low: 0.7, mid: 0.85, high: 1 } as const;
/** The paper dries as you fight: every STAIN_WASH_S of play the stain layer loses STAIN_WASH of its
 *  ink (half-life ≈ 30 s), so a long wave's fight path never turns the floor into a grey mottle that
 *  dark monsters vanish against. One sparked droplet a step lands as a stain (the kill keeps its own). */
export const STAIN_WASH_S = 1.5;
export const STAIN_WASH = 0.035;
const STAMPS_STEP = 1;
/** Largest shake (CSS px) at trauma 1 (amplitude ∝ trauma²). */
const MAX_SHAKE = 6;
/** The camera's whole offset (shake + kick) never exceeds this (CSS px): big moments only, and small. */
const MAX_OFFSET = 3;
/** Trauma decays this much per real second (short tails). */
const TRAUMA_DECAY = 2.6;
/** The big moments' edge pulse: its peak alpha and length (s). It darkens the screen's rim a moment;
 *  nothing on the screen moves. */
export const PULSE_A = 0.25;
export const PULSE_S = 0.3;
/** Ranged weapons whose single blows are heavy by nature (the 射日弓, the flying swords, 雷符): their
 *  class weight counts 0.25 more (a bigger reaction on the body; never the camera). */
const WEIGHTY: ReadonlySet<string> = new Set(['sunbow', 'qingping', 'casket', 'thunder']);
/** Hitstop token bucket (ms of freeze; refill per real s): only rare heavy moments stop the world. */
const STOP_CAP = 80;
const STOP_REFILL = 30;
/** A heavy weapon's crits stop the world at most this often (s). */
const HEAVY_CRIT_GAP = 0.45;

// the body's reaction by tier (light · medium · heavy/crit)
const SQUASH = [0.12, 0.18, 0.28] as const;
const RECOIL = [4, 7, 11] as const;
const FREEZE = [0, 0.045, 0.075] as const;
/** The struck body's square-wave shiver (was 1.5 / 2.6 u at 25 Hz: a melee sweep made a whole pack
 *  shiver, 屏幕抖动 RC7): off; squash, recoil and the local freeze carry the blow. */
const JITTER = [0, 0, 0] as const;
const FLASH = [0.05, 0.066, 0.1] as const;
/** A body re-pulses on a blow ≥ this share of its live reaction, or after PULSE_GAP s (≤ 12 Hz). */
const PULSE_SHARE = 0.6;
const PULSE_GAP = 0.08;
/** The flash never restarts within this (s): ≤ 50% duty, no strobe (reduced motion: CALM_FLASH_GAP). */
const FLASH_GAP = 0.066;
const CALM_FLASH_GAP = 0.25;
/** A body's freeze bank: it holds at most FRZ_CAP s, refilled at FRZ_REFILL per s (≤ 30% of a second). */
const FRZ_CAP = 0.15;
const FRZ_REFILL = 0.3;
/** The impact star by tier: life (s) and final size; the spatter by tier: count and size factors. */
const STAR_LIFE = [0.08, 0.1, 0.12] as const;
const STAR_GROW = [0.8, 1, 1.15] as const;
const SPRAY_N = [0.5, 1, 1.5] as const;
const SPRAY_S = [1, 1.15, 1.35] as const;
/** Full-white frames of a flash (s): 2 frames at 60 fps. */
const FLASH_FULL = 0.03;
/** The ink tint after the flash (s, peak alpha of the ink twin over the body). */
const INK_T = 0.16;
const INK_A = 0.34;

export interface FeelStats {
  sparks: number; emitted: number; hits: number; kills: number; voices: number; stopReqMs: number; stopMs: number; stopDenied: number;
  frozenMs: number; realMs: number; maxShare: number; lastShare: number; stamps: number; q: number;
  /** The stain layer's timed washes (STAIN_WASH every STAIN_WASH_S of play). */
  washes: number;
  /** Body reactions: pulses, local freezes (count, total s), staggers; marks and fragments made. */
  pulses: number; freezes: number; freezeS: number; staggers: number; marks: number; frags: number;
  /** Camera: frames drawn, frames the offset was > 0.5 px, frames zoomed. */
  camFrames: number; camOff: number; camZoom: number;
}

export class Feel {
  readonly sp: Sparks;
  readonly mk: Marks;
  readonly fr: Frags;
  sprites: FeelSprites;
  /** Emission quality 0..1 (quality × load × the frame guard), recomputed each step. */
  q = 1;
  private stepEmit = 0;
  private stepBudget = 24;
  private stepMarks = 0;
  private markBudget = 7;
  private fragBursts = 0;
  private stampsStep = 0;
  private washT = 0;
  private seed = 0x2545f491;
  // per-body reaction state (indexed by enemy slot; valid while rGen matches the slot's generation)
  readonly rGen: Uint32Array;
  /** Sim time of the last pulse and of the last flash start. */
  readonly rAt: Float32Array; readonly rFlAt: Float32Array;
  /** The pulse: weight, squash, recoil (u), blow axis, freeze (s), jitter (u) and how long it jitters. */
  readonly rW: Float32Array; readonly rS: Float32Array; readonly rR: Float32Array; readonly rA: Float32Array;
  readonly rFrz: Float32Array; readonly rJ: Float32Array; readonly rJT: Float32Array;
  /** Where the body was struck (the freeze holds it there). */
  readonly rHX: Float32Array; readonly rHY: Float32Array;
  /** The flash's length (s). */
  readonly rFl0: Float32Array;
  /** The freeze bank (s) and when it was last topped up. */
  readonly rBank: Float32Array; readonly rBankT: Float32Array;
  /** Elites and bosses: damage toward the next stagger, the wobble (rad) and when it started. */
  readonly rAcc: Float32Array; readonly rWob: Float32Array; readonly rWobAt: Float32Array;
  /** Where the renderer drew each body this frame (marks follow it). */
  readonly dX: Float32Array; readonly dY: Float32Array;
  /** pose()'s output. */
  readonly po: Pose = { x: 0, y: 0, ang: 0, s: 0, wob: 0, fl: 0, fa: 0, ink: 0 };
  // the body about to die (corpse(), then kill())
  private cId: AtlasId | null = null;
  private cFlip = 0;
  private cSc = 1;
  // camera (CSS px; real time)
  trauma = 0;
  kickX = 0; kickY = 0;
  zoom = 0;
  offX = 0; offY = 0;
  private shakeT = 0;
  private lastSlam = -9;
  private lastHurtShake = -9;
  // hitstop budget
  private bank = STOP_CAP;
  private lastCritStop = -9;
  private lastSkill = -9;
  private lastSkillStop = -9;
  private secReal = 0; private secFrozen = 0;
  // player
  /** Seconds (real) since you were last hurt; the heartbeat phase at low HP. */
  hurtAge = 9;
  hurtK = 0;
  /** The direction the last blow pushed you (a sprite offset only: the simulation never drifts). */
  hurtUx = 0; hurtUy = 0;
  /** The big moments' edge pulse (a boss's phase or death, a hard blow): seconds (real) since, and its
   *  strength (render.ts draws ≤ PULSE_A × it over PULSE_S s; the picture itself never moves). */
  pulseAge = 9;
  pulseK = 0;
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
  /** The cut direction alternates per body hit (a combo cuts back and forth). */
  private cutFlip = 0;
  /** A running mean of hit numbers (numbers size by damage against it). */
  numRef = 10;
  /** The last blow (where the body stood, when, the weapon's id): a kill that follows it on the same
   *  step takes its light (world.killIn only passes the feel class). */
  private lhX = 0; private lhY = 0; private lhT = -9; private lhWid = '';
  readonly st: FeelStats = {
    sparks: 0, emitted: 0, hits: 0, kills: 0, voices: 0, stopReqMs: 0, stopMs: 0, stopDenied: 0, frozenMs: 0, realMs: 0, maxShare: 0, lastShare: 0, stamps: 0, q: 1, washes: 0,
    pulses: 0, freezes: 0, freezeS: 0, staggers: 0, marks: 0, frags: 0, camFrames: 0, camOff: 0, camZoom: 0,
  };

  constructor(private W: World) {
    const q = W.quality;
    this.sp = new Sparks(SPARK_CAP[q] ?? SPARK_CAP.mid);
    this.mk = new Marks(MARK_CAP[q] ?? MARK_CAP.mid);
    this.fr = new Frags(FRAG_CAP[q] ?? FRAG_CAP.mid);
    const cap = W.E.cap;
    const F = () => new Float32Array(cap);
    this.rGen = new Uint32Array(cap).fill(0xffffffff);
    this.rAt = F(); this.rFlAt = F(); this.rW = F(); this.rS = F(); this.rR = F(); this.rA = F(); this.rFrz = F(); this.rJ = F(); this.rJT = F();
    this.rHX = F(); this.rHY = F(); this.rFl0 = F(); this.rBank = F(); this.rBankT = F(); this.rAcc = F(); this.rWob = F(); this.rWobAt = F();
    this.dX = F(); this.dY = F();
    this.sprites = new FeelSprites(this.spriteRes());
  }

  get motion(): boolean { return !this.W.settings.reduceMotion; }
  get shakeOn(): boolean { return !!this.W.settings.shake && !this.W.settings.reduceMotion; }

  /** Device px per u to bake the marks at: the painter's own sprite scale when it has one (the camera's
   *  scale), else the canvas dpr. */
  private spriteRes(): number {
    const W = this.W;
    const k = (W.painter as unknown as { k?: number } | null)?.k;
    if (typeof k === 'number' && Number.isFinite(k) && k > 0) return Math.max(1, Math.min(3.4, k)) * (W.quality === 'low' ? 0.9 : 1);
    const dev = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.max(1, Math.min(W.settings.dprCap || 2, dev, 3)) * (W.quality === 'low' ? 0.85 : 1);
  }

  /** A cosmetic random in [0, 1) (xorshift; never the simulation's streams). */
  rnd(): number {
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }

  begin(): void {
    this.sp.clear(); this.mk.clear(); this.fr.clear();
    this.fr.id.fill(null);
    this.rGen.fill(0xffffffff);
    this.trauma = 0; this.kickX = this.kickY = 0; this.zoom = 0; this.offX = this.offY = 0;
    this.bank = STOP_CAP; this.hurtAge = 9; this.hurtK = 0; this.pulseAge = 9; this.pulseK = 0;
    this.slotT.fill(9);
    this.cId = null;
    // the world clock restarts at 0 every wave, so every rate gate starts fresh too
    this.lastCritStop = this.lastSkill = this.lastSkillStop = this.lastSlam = this.lastHurtShake = -9;
    this.lastCrack = this.lastThump = this.lastZip = this.lastVib = -9;
    this.busReset();
    // a new painter (a new screen, a new quality) may bake at a new scale: the marks follow it
    const res = this.spriteRes();
    if (Math.abs(res - this.sprites.res) > 0.12) { this.sprites.dispose(); this.sprites = new FeelSprites(res); }
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
  /** May a mark of this priority be added now (0 a light hit, 1 medium/heavy/kills, 2 elites, bosses, skills)? */
  markRoom(prio: number): boolean {
    const M = this.mk;
    if (M.count >= M.cap) return false;
    if (prio >= 2) return true;
    const fill = M.count / M.cap;
    if (prio === 0) return fill < 0.6 && this.stepMarks < this.markBudget * 0.5;
    return fill < 0.88 && this.stepMarks < this.markBudget;
  }
  /** Add a mark (call markRoom() first). Owner i ≥ 0: it follows that body's drawn pose. */
  mark(kind: number, shape: number, tint: number, i: number, x: number, y: number, ang: number, life: number, s0: number, s1: number, a0: number): number {
    const M = this.mk, E = this.W.E;
    const j = M.take();
    if (j < 0) return -1;
    M.kind[j] = kind; M.shape[j] = shape; M.tint[j] = tint; M.x[j] = x; M.y[j] = y; M.ang[j] = ang;
    M.life[j] = M.life0[j] = life; M.s0[j] = s0; M.s1[j] = s1; M.a0[j] = a0; M.calm[j] = this.motion ? 0 : 1;
    if (i >= 0) { M.owner[j] = i; M.gen[j] = E.gen[i]; M.ox[j] = x - E.x[i]; M.oy[j] = y - E.y[i]; } else { M.owner[j] = -1; M.ox[j] = 0; M.oy[j] = 0; }
    this.stepMarks++;
    this.st.marks++;
    return j;
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

  /** One simulation step: move the sparks, marks and fragments, stamp what lands, flush the sound bus. */
  step(dt: number): void {
    const W = this.W;
    // emission quality: the quality setting, the frame guard, and the crowd on screen
    let q = Q_BASE[W.quality] ?? 0.85;
    if (W.degrade) q *= 0.45;
    const load = W.E.count + W.PS.count * 0.25;
    if (load > 110) q *= Math.max(0.3, 110 / load);
    this.q = q;
    this.st.q = q;
    this.stepBudget = Math.max(6, (this.sp.cap / 16) * q);
    const mb = MARK_STEP[W.quality] ?? MARK_STEP.mid;
    this.markBudget = Math.max(3, mb * (W.degrade ? 0.5 : 1) * (load > 110 ? Math.max(0.5, 110 / load) : 1));
    this.stepEmit = 0;
    this.stepMarks = 0;
    this.fragBursts = 0;
    this.stampsStep = 0;
    const P = this.sp;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) {
        if ((P.flags[i] & PF.stamp) && this.stampsStep < STAMPS_STEP && W.painter) {
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
    const Mk = this.mk;
    for (let i = 0; i < Mk.n; i++) {
      if (!Mk.alive[i]) continue;
      Mk.life[i] -= dt;
      if (Mk.life[i] <= 0) Mk.release(i);
    }
    Mk.trim();
    const Fr = this.fr;
    const fk = Math.exp(-4.5 * dt);
    for (let i = 0; i < Fr.n; i++) {
      if (!Fr.alive[i]) continue;
      Fr.life[i] -= dt;
      if (Fr.life[i] <= 0) {
        // the first piece of a burst lands and stains the paper
        if (Fr.stamp[i] && this.stampsStep < STAMPS_STEP && W.painter) {
          this.stampsStep++;
          this.st.stamps++;
          try { W.painter.stamp('splat', Fr.x[i], Fr.y[i], 4 + 6 * Fr.sc[i], (i * 2246822519 + W.kills) >>> 0); } catch { /* optional */ }
        }
        Fr.id[i] = null;
        Fr.release(i);
        continue;
      }
      Fr.vx[i] *= fk; Fr.vy[i] *= fk;
      Fr.x[i] += Fr.vx[i] * dt; Fr.y[i] += Fr.vy[i] * dt;
      Fr.rot[i] += Fr.vr[i] * dt;
    }
    Fr.trim();
    this.st.sparks = P.count;
    // the stains dry a little (one full-layer fill every 1.5 s)
    this.washT += dt;
    if (this.washT >= STAIN_WASH_S - 1e-4) {
      this.washT -= STAIN_WASH_S;
      this.st.washes++;
      try { W.painter?.wash(STAIN_WASH); } catch { /* optional */ }
    }
    for (let k = 0; k < 8; k++) if (this.slotT[k] < 9) this.slotT[k] += dt;
    this.flush();
  }

  // ─────────────────────────────────────────────────────────── the body's reaction

  /**
   * The struck body reacts (drawn only): a pulse of squash and recoil along the blow, a local freeze
   * and jitter on medium and heavy blows (from the body's own bank), a paced flash; elites and bosses
   * stagger every few % of their HP. `kk` scales the reaction by kind (elite 0.7, boss 0.35).
   */
  private react(i: number, tier: number, crit: boolean, ang: number, kk: number, thunder: boolean, d: number): void {
    const W = this.W, E = W.E, t = W.t;
    const k = E.kind[i];
    const boss = k === EKind.Boss, big = boss || k === EKind.Elite || k === EKind.Demon;
    if (this.rGen[i] !== E.gen[i]) {
      this.rGen[i] = E.gen[i];
      this.rAt[i] = this.rFlAt[i] = this.rWobAt[i] = -9; this.rW[i] = 0; this.rFrz[i] = 0; this.rJT[i] = 0; this.rFl0[i] = 0;
      this.rBank[i] = FRZ_CAP; this.rBankT[i] = t; this.rAcc[i] = 0; this.rWob[i] = 0;
    }
    const calm = !this.motion;
    const age = t - this.rAt[i];
    const live = age >= 0 && age < 0.6 ? this.rW[i] * Math.exp(-age / 0.1) : 0;
    const w = (tier + 1) / 3 * kk * (crit ? 1.15 : 1);
    if (w >= live * PULSE_SHARE || age >= PULSE_GAP || age < 0) {
      this.st.pulses++;
      this.rAt[i] = t; this.rW[i] = w; this.rA[i] = ang;
      let S: number = SQUASH[tier] * (crit ? 1.14 : 1);
      let R: number = RECOIL[tier] + (crit ? 2 : 0);
      let frz: number = crit && tier === 2 ? 0.06 : FREEZE[tier];
      let J: number = JITTER[tier];
      let jt = 0;
      if (boss) { S *= 0.35; R = Math.min(3, R * 0.35); frz = 0; J = 0; jt = 0; }
      else if (big) { S *= 0.7; R *= 0.7; frz = Math.min(0.055, frz); J = Math.min(2, J); }
      if (thunder) { J = 0; jt = Math.max(jt, 0.09); }
      if (calm) { S = 0.06; R = Math.min(2, R); frz = 0; J = 0; jt = 0; }
      if (frz > 0) {
        // the bank: a fast weapon can't pin a body in place
        const bank = Math.min(FRZ_CAP, this.rBank[i] + (t - this.rBankT[i]) * FRZ_REFILL);
        this.rBankT[i] = t;
        frz = Math.min(frz, bank);
        if (frz < 0.02) frz = 0;
        this.rBank[i] = bank - frz;
        if (frz > 0) { this.st.freezes++; this.st.freezeS += frz; }
      }
      this.rS[i] = S; this.rR[i] = R; this.rFrz[i] = frz; this.rJ[i] = J; this.rJT[i] = Math.max(frz, jt);
      this.rHX[i] = E.x[i]; this.rHY[i] = E.y[i];
      E.hitV[i] = w; E.hitAge[i] = 0;
    }
    E.hitA[i] = ang;
    // the flash: paced, so a fast weapon never strobes a body
    const fl = FLASH[tier];
    const fAge = t - this.rFlAt[i];
    if (calm) {
      if (fAge >= CALM_FLASH_GAP || fAge < 0) { this.rFlAt[i] = t; this.rFl0[i] = 0.15; E.flash[i] = 0.15; }
    } else if (fAge >= FLASH_GAP || fAge < 0 || (tier === 2 && E.flash[i] <= 0)) {
      this.rFlAt[i] = t; this.rFl0[i] = fl; E.flash[i] = fl;
    }
    // elites and bosses stagger every 8% (bosses 4%) of their HP, at most once per 0.6 s: a flash, a
    // ring of light, a wobble
    if (big && d > 0) {
      this.rAcc[i] += d;
      const th = E.hpMax[i] * (boss ? 0.04 : 0.08);
      if (this.rAcc[i] >= th && th > 0 && (t - this.rWobAt[i] >= 0.6 || t < this.rWobAt[i])) {
        this.rAcc[i] = 0;
        this.st.staggers++;
        this.rWobAt[i] = t; this.rWob[i] = calm ? 0 : boss ? 0.05 : 0.1;
        if (!calm) { this.rFlAt[i] = t; this.rFl0[i] = 0.1; E.flash[i] = 0.1; }
        if (this.markRoom(2)) {
          const r = E.r[i];
          this.mark(MK.ring, SH.halo, TN.azure, i, E.x[i], E.y[i], 0, 0.26, (r * 0.6) / 28, (r * 2.1) / 28, 0.95);
        }
      }
    }
  }

  /**
   * The drawn pose of body i this frame (the renderer's; visual only). Fills `po`; false when the body
   * shows nothing (draw it plainly at E.x, E.y).
   */
  pose(i: number): boolean {
    const W = this.W, E = W.E, o = this.po;
    o.x = E.x[i]; o.y = E.y[i]; o.ang = 0; o.s = 0; o.wob = 0; o.fl = 0; o.fa = 0; o.ink = 0;
    const calm = !this.motion;
    const valid = this.rGen[i] === E.gen[i];
    const t = W.t;
    if (E.flash[i] > 0) {
      const f0 = valid && this.rFl0[i] > 0 ? this.rFl0[i] : 0.05;
      const el = Math.max(0, f0 - E.flash[i]);
      const k = Math.max(0, Math.min(1, E.flash[i] / f0));
      if (calm) { o.fl = 2; o.fa = 0.3 * k; }
      else if (E.kind[i] === EKind.Boss) { o.fl = 2; o.fa = el < FLASH_FULL ? 0.6 : 0.4 * k; }
      else if (el < FLASH_FULL) o.fl = 1;
      else { o.fl = 2; o.fa = 0.6 * k; }
    } else if (valid && !calm) {
      // the ink tint the flash leaves behind
      const fa = t - this.rFlAt[i] - this.rFl0[i];
      if (fa >= -0.001 && fa < INK_T) o.ink = INK_A * (1 - Math.max(0, fa) / INK_T);
    }
    if (!valid) return o.fl !== 0;
    const age = t - this.rAt[i];
    if (age >= 0 && age < 0.5) {
      const frz = this.rFrz[i], S = this.rS[i], R = this.rR[i];
      let off: number;
      o.ang = this.rA[i];
      if (age < frz) {
        // held where it was struck, compressed (the simulation may already be carrying it away)
        o.x = this.rHX[i]; o.y = this.rHY[i];
        o.s = S; off = 0.35 * R;
      } else {
        const tau = age - frz;
        if (frz > 0 && tau < 0.05) {
          // released: it catches up with its body (a knockback now reads as a flight)
          const u = tau / 0.05, e = 1 - (1 - u) * (1 - u);
          o.x = this.rHX[i] + (E.x[i] - this.rHX[i]) * e; o.y = this.rHY[i] + (E.y[i] - this.rHY[i]) * e;
        }
        if (calm) { o.s = S * Math.exp(-tau / 0.08); off = R * Math.exp(-tau / 0.08); }
        else {
          o.s = S * Math.exp(-tau / 0.07) * Math.cos(tau * 48.33);
          off = tau < 0.035 ? R * (0.35 + 0.65 * (1 - (1 - tau / 0.035) ** 2)) : R * Math.exp(-(tau - 0.035) / 0.08) * Math.cos((tau - 0.035) * 13);
        }
      }
      let jit = 0;
      if (!calm && age < this.rJT[i]) jit = this.rJ[i] * ((Math.floor(age / 0.02) & 1) ? 1 : -1);
      const c = Math.cos(o.ang), n = Math.sin(o.ang);
      o.x += c * off - n * jit; o.y += n * off + c * jit;
    }
    const wa = t - this.rWobAt[i];
    if (!calm && wa >= 0 && wa < 0.45 && this.rWob[i] > 0) o.wob = this.rWob[i] * Math.exp(-wa / 0.12) * Math.sin(wa * 32);
    return true;
  }

  // ─────────────────────────────────────────────────────────── hits and kills

  /**
   * A player-side strike landed on body i (called from World.strike before a possible death).
   * (fx, fy) is where the blow came from; fc the feel class; d the damage dealt.
   */
  hit(i: number, fx: number, fy: number, d: number, crit: boolean, fc: number, dot: boolean, src: number, slot = -1): void {
    const W = this.W, E = W.E;
    this.st.hits++;
    if (dot) {
      // burns and bleeds tick quietly (their marks already show); a kill by one still takes its light
      this.lhX = E.x[i]; this.lhY = E.y[i]; this.lhT = W.t; this.lhWid = slot >= 0 && slot < W.slots.length ? W.slots[slot].id : '';
      return;
    }
    const def = FXD[fc] ?? FXD[FC.generic];
    const md = MKD[fc] ?? MKD[FC.generic];
    const x = E.x[i], y = E.y[i], r = E.r[i];
    let dx = x - fx, dy = y - fy;
    let L = Math.hypot(dx, dy);
    if (L < 1) { const a = this.rnd() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a); L = 1; }
    const ux = dx / L, uy = dy / L, ang = Math.atan2(uy, ux);
    const kind = E.kind[i];
    const boss = kind === EKind.Boss;
    const big = boss || kind === EKind.Elite || kind === EKind.Demon;
    const heavyCls = def.weight >= 0.75;
    const t = W.t;
    const wid = slot >= 0 && slot < W.slots.length ? W.slots[slot].id : '';
    this.lhX = x; this.lhY = y; this.lhT = t; this.lhWid = wid;
    const weighty = WEIGHTY.has(wid);
    // the blow's weight: its class (weighty weapons a notch up) and its damage against the body
    const dmgK = Math.max(0, Math.min(1, d / Math.max(1e-6, 0.2 * E.hpMax[i])));
    const w = Math.min(1.3, (def.weight + (weighty ? 0.25 : 0)) * (0.7 + 0.6 * dmgK) * (crit ? 1.3 : 1));
    const tier = crit || src === SRCI.skill || w >= 0.75 ? 2 : w >= 0.45 ? 1 : 0;
    this.react(i, tier, crit, ang, boss ? 0.35 : big ? 0.7 : 1, wid === 'thunder', d);
    // the marks: an impact star where the blow went in, the class's mark across the body, a ring
    const prio = tier === 2 || big ? 1 : 0;
    const calm = !this.motion;
    const lite = W.degrade ? 0.5 : 1;
    const sz = Math.max(0.8, Math.min(1.6, r / 20)) * (crit ? 1.3 : 1);
    const cx = x - ux * r * 0.45, cy = y - uy * r * 0.45;
    // the marks take the light of the weapon that struck (a 桃木剑 gamboge, a 青萍 jade, a 偃月 gold),
    // the class's own where the weapon's light is ink (claws, the 砚台, go): ink marks stay ink-and-white
    const vt = tintOfWeapon(wid || undefined, fc);
    const tw = vt !== VT.ink ? TN_OF[vt] : -1;
    const starT = tw >= 0 && md.star !== TN.white ? tw : md.star, markT = tw >= 0 ? tw : md.markT;
    const haloT = md.halo >= 0 && tw >= 0 ? tw : md.halo, sparkT = tw >= 0 ? tw : md.spark;
    if (this.markRoom(prio) && (tier > 0 || this.rnd() < 0.7 * lite)) {
      this.mark(MK.pop, SH.star, starT, i, cx, cy, ang, STAR_LIFE[tier], md.starS * sz * 0.6, md.starS * sz * STAR_GROW[tier], 1);
    }
    // 流光: where the blow meets the body, a hot white core in the weapon's light, sparks flung on
    // along the blow and what flies off by flavour; a crit's star-burst and radial streaks
    const flav = flavorOfWeapon(wid || undefined, fc);
    vfxOf(W).impact(x - ux * r * 0.3, y - uy * r * 0.3, ang, r, vt, flav,
      (crit ? IF.crit : 0) | (heavyCls || weighty || tier === 2 ? IF.heavy : 0) | (big ? IF.big : 0) | (fc === FC.go ? IF.clack : 0));
    if (crit && this.markRoom(1)) {
      this.mark(MK.pop, SH.star, TN.gold, i, x - ux * r * 0.2, y - uy * r * 0.2, ang + 0.4, 0.13, 0.5 * sz, 0.95 * sz, 1);
      if (this.markRoom(1)) this.mark(MK.cut, SH.cut, TN.white, i, x, y, ang + Math.PI / 2 + (this.rnd() - 0.5) * 0.5, 0.12, 0.9 * sz, 1.1, 1);
    }
    if (md.mark >= 0 && tier + (this.rnd() < 0.5 * lite ? 1 : 0) >= 1 && this.markRoom(prio)) {
      if (md.mark === SH.cut) {
        // the blade's path across the body (⟂ the blow), back and forth on a combo
        this.cutFlip ^= 1;
        const a = ang + Math.PI / 2 + (this.cutFlip ? 0.35 : -0.35) + (this.rnd() - 0.5) * 0.3;
        this.mark(MK.cut, SH.cut, markT, i, x, y, a, heavyCls ? 0.14 : 0.11, md.markS * sz, heavyCls ? 1.2 : 1, 1);
        if (heavyCls && this.markRoom(prio)) this.mark(MK.cut, SH.cut, TN.white, i, x + ux * 5, y + uy * 5, a - 0.5, 0.12, md.markS * sz * 0.8, 0.9, 0.95);
      } else if (md.mark === SH.beam) {
        // the flying sword's 流光 straight through the body, along its flight
        this.mark(MK.beam, SH.beam, markT, i, x + ux * r * 0.5, y + uy * r * 0.5, ang, 0.09, md.markS * sz, 0.75, 1);
      } else {
        this.mark(MK.rake, md.mark, markT, i, x, y, ang + Math.PI / 2 + (this.rnd() - 0.5) * 0.4, 0.14, md.markS * sz * 0.8, md.markS * sz, 1);
      }
    }
    if (md.halo >= 0 && (tier === 2 || (heavyCls && tier >= 1)) && this.markRoom(prio)) {
      this.mark(MK.ring, SH.halo, haloT, i, x, y, 0, 0.18, (r * 0.5) / 28, (r * 1.6) / 28, 0.9);
    }
    // the ground takes a splash on medium and heavy blows (under the bodies, drying away)
    if (md.splat >= 0 && tier >= 1 && (tier === 2 || this.rnd() < 0.5) && this.markRoom(prio)) {
      this.mark(MK.ground, SH.splat, md.splat, -1, x + ux * r * 0.3, y + uy * r * 0.3, ang + (this.rnd() - 0.5) * 0.5, 0.55, 0.45 * sz, 0.62 * sz, 0.75);
    }
    // directional sparks: out of the far side, along the blow
    if (tier >= 1 && !calm) {
      const n = this.count(tier === 2 ? 3 : 2);
      for (let k = 0; k < n && this.room(prio); k++) {
        const a = ang + (this.rnd() - 0.5) * 0.9;
        const v = 380 + 260 * this.rnd();
        this.emit(SH.ember, sparkT, x + ux * r * 0.4, y + uy * r * 0.4, Math.cos(a) * v, Math.sin(a) * v, 0.1 + 0.06 * this.rnd(), 0.9 * sz, 0.35 * sz, a, 0, 9, 0, 1);
      }
    }
    // spatter from the side the blow came in, flung on through the body
    const n = this.count(def.n * SPRAY_N[tier] * (big ? 1.4 : 1));
    this.spray(def, n, x + ux * r * 0.3, y + uy * r * 0.3, ang, prio, SPRAY_S[tier], 0);
    if (def.ring >= 0 && fc !== FC.heavy && (tier >= 1 || fc !== FC.go || this.rnd() < 0.5) && this.room(prio)) {
      this.emit(SH.ring, def.ring, x, y, 0, 0, 0.16, (def.ringR / 32) * 0.35, (def.ringR / 32) * (crit ? 1.3 : 1), this.rnd() * 6.28, 0, 0, PF.ease, 0.8);
    }
    // the bus: the class colour, a crack and a thump
    this.busW[fc] = Math.max(this.busW[fc], def.weight * (crit ? 1.3 : weighty ? 1.5 : 1));
    this.busN[fc]++;
    if (crit) this.busCrit++;
    if (heavyCls) this.busHeavy++;
    else if (weighty || tier === 2) this.busWeighty++;
    // the world stops only for the rare heavy moment: a heavy weapon's crit, the 镜技's landing
    if (src === SRCI.skill) this.skillImpact(x, y);
    else if (crit && heavyCls && t - this.lastCritStop >= HEAVY_CRIT_GAP) { this.lastCritStop = t; this.stop(30); }
  }

  /** The body about to die (world.killIn, before it releases the slot): its fragments are cut from this. */
  corpse(id: AtlasId | null, face: number, scale: number): void {
    this.cId = id; this.cFlip = Math.cos(face) < 0 ? 1 : 0; this.cSc = scale > 0 && Number.isFinite(scale) ? scale : 1;
  }

  /** A body died at (x, y) (radius r, kind k); ang is the direction of the killing blow. True when
   *  the body broke into pieces (the world then leaves out its dark ink burst, which is drawn over the
   *  enemy layer and would bury the pieces' white-hot breaks and the pop of light). */
  kill(x: number, y: number, r: number, k: number, crit: boolean, ang: number, fc: number): boolean {
    const W = this.W;
    this.st.kills++;
    const elite = k === EKind.Elite || k === EKind.Demon;
    const boss = k === EKind.Boss;
    const prio = elite || boss ? 2 : 1;
    const sz = r / 22;
    const md = MKD[fc] ?? MKD[FC.generic];
    const calm = !this.motion;
    const id = this.cId, flip = this.cFlip, sc = this.cSc;
    this.cId = null;
    // the killing blow's light: the weapon of the blow that just landed on this body (same step, same
    // place), else the class's
    const wid = this.lhT === W.t && Math.abs(this.lhX - x) < 1 && Math.abs(this.lhY - y) < 1 ? this.lhWid : '';
    const vt = tintOfWeapon(wid || undefined, fc);
    const tw = vt !== VT.ink ? TN_OF[vt] : -1;
    // 流光: the body pops — a flash, a ring of the weapon's light breaking outward, sparks all round
    vfxOf(W).impact(x, y, ang, r, vt, flavorOfWeapon(wid || undefined, fc), IF.kill | (crit ? IF.crit : 0) | (elite || boss ? IF.big : 0));
    // a pop of light where it broke, a ring of it spreading
    const popT = tw >= 0 && tw !== TN.white && tw !== TN.moon ? tw : md.star === TN.white || md.star === TN.moon ? TN.gold : md.star;
    if (this.markRoom(prio)) this.mark(MK.pop, SH.star, popT, -1, x, y, ang, boss ? 0.14 : 0.09, (2 * r * (boss ? 2.4 : elite ? 1.8 : 1.4)) / 48 * 0.6, (2 * r * (boss ? 2.4 : elite ? 1.8 : 1.4)) / 48, 1);
    if (this.markRoom(prio)) this.mark(MK.ring, SH.halo, tw >= 0 ? tw : md.halo >= 0 ? md.halo : md.star === TN.white ? TN.azure : md.star, -1, x, y, 0, 0.22, (0.4 * r) / 28, (2.2 * r) / 28, 0.9);
    if ((elite || boss) && this.markRoom(prio)) this.mark(MK.ring, SH.halo, TN.gold, -1, x, y, 0, 0.36, (0.6 * r) / 28, (3.2 * r) / 28, 0.8);
    // the killing blow's signature: a blade's cut left hanging where the body stood (a flying sword's
    // light straight through it, a claw's rakes), a talisman's embers rising from the burnt paper
    if ((fc === FC.slash || fc === FC.heavy || fc === FC.claw || fc === FC.flying) && this.markRoom(prio)) {
      if (fc === FC.flying) this.mark(MK.beam, SH.beam, tw >= 0 ? tw : TN.jade, -1, x + Math.cos(ang) * r * 0.9, y + Math.sin(ang) * r * 0.9, ang, 0.14, (3 * r) / 64, 1, 1);
      else if (fc === FC.claw) this.mark(MK.rake, SH.rake, TN.moon, -1, x, y, ang + Math.PI / 2, 0.18, (2.4 * r) / 44, (2.4 * r) / 44, 1);
      else this.mark(MK.cut, SH.cut, TN.white, -1, x, y, ang + Math.PI / 2 + (this.rnd() - 0.5) * 0.4, fc === FC.heavy ? 0.2 : 0.16, (2.6 * r) / 64, fc === FC.heavy ? 1.6 : 1.25, 1);
    } else if ((fc === FC.talisman || fc === FC.wine) && !calm) {
      for (let k = 0; k < 3 && this.room(prio); k++) {
        const a = -Math.PI / 2 + (this.rnd() - 0.5) * 1.1, v = 110 + 90 * this.rnd();
        this.emit(SH.ember, fc === FC.wine ? TN.gold : TN.gamboge, x + (this.rnd() - 0.5) * r, y + (this.rnd() - 0.5) * r * 0.6, Math.cos(a) * v, Math.sin(a) * v, 0.34 + 0.14 * this.rnd(), 0.8 * Math.max(0.8, sz), 0.3, a, 0, 2.5, PF.stretch, 1);
      }
    }
    // the body breaks: pieces of its own sprite flung on along the blow (the droplets and the world's
    // splat stain the paper; the pieces only fly and fade)
    let broke = false;
    if (id && this.fragBursts < 4 && !W.degrade) {
      this.fragBursts++;
      const Fr = this.fr;
      const g = fragGrid(k, W.quality);
      const want = boss ? (W.quality === 'low' ? 8 : 12) : elite ? (W.quality === 'low' ? 6 : 8) : (FRAG_MOB[W.quality] ?? 4);
      const room = Fr.cap - Fr.count - (prio >= 2 ? 0 : Math.floor(Fr.cap * 0.25));
      // the pieces that carry some of the body (known once its shards are baked), from a random start
      const gg = g * g;
      const solid = this.sprites.solid(id, g) || (gg >= 31 ? 0x7fffffff : (1 << gg) - 1);
      const nf = Math.min(want, popcount(solid), Math.max(0, room));
      const off = Math.floor(this.rnd() * gg);
      const step = gg % 5 === 0 ? 3 : 5;
      for (let j = 0, c = 0; j < nf && c < gg; c++) {
        const q = (off + c * step) % gg;
        if (!(solid & (1 << q))) continue;
        const f = Fr.take();
        if (f < 0) break;
        j++;
        this.st.frags++;
        // it flies out from its place in the body (the renderer adds the piece's exact offset in the sprite)
        const qx = (q % g + 0.5) / g - 0.5, qy = (Math.floor(q / g) + 0.5) / g - 0.5;
        const out = Math.atan2(qy, flip ? -qx : qx);
        const a = ang + Math.max(-1.05, Math.min(1.05, Math.atan2(Math.sin(out - ang), Math.cos(out - ang)) * 0.6 + (this.rnd() - 0.5) * 0.7));
        const v = calm ? 0 : (160 + 160 * this.rnd()) * (boss ? 1.3 : elite ? 1.2 : 1);
        Fr.x[f] = x; Fr.y[f] = y; Fr.vx[f] = Math.cos(a) * v; Fr.vy[f] = Math.sin(a) * v;
        Fr.rot[f] = 0; Fr.vr[f] = calm ? 0 : (5 + 7 * this.rnd()) * (this.rnd() < 0.5 ? -1 : 1);
        Fr.life[f] = Fr.life0[f] = calm ? 0.25 : (boss ? 0.5 : 0.32) + 0.13 * this.rnd();
        Fr.sc[f] = sc; Fr.g[f] = g; Fr.q[f] = q; Fr.flip[f] = flip; Fr.stamp[f] = 0; Fr.id[f] = id;
        broke = true;
      }
    }
    // the crown: a wet ring breaking outward
    if (this.room(prio)) this.emit(SH.crown, TN.ink, x, y, 0, 0, boss ? 0.5 : elite ? 0.38 : 0.28, sz * 0.5, sz * (boss ? 2.2 : elite ? 2.1 : 1.5), this.rnd() * 6.28, 0, 0, PF.ease, 0.85);
    // droplets flung along the blow (one lands and stains the paper)
    const n = boss ? 18 : elite ? 9 : this.count(3 + (crit ? 2 : 0));
    const def = FXD[fc] ?? FXD[FC.generic];
    for (let j = 0; j < n; j++) {
      if (!this.room(prio)) break;
      const a = ang + (this.rnd() - 0.5) * (j < 2 ? 1.2 : 3.4);
      const v = (180 + 260 * this.rnd()) * (boss ? 1.6 : elite ? 1.3 : 1);
      const shape = j & 1 ? SH.dot : SH.drop;
      const tint = j === 2 && fc !== FC.generic && fc !== FC.heavy && fc !== FC.skill ? def.tint : TN.ink;
      this.emit(shape, tint, x, y, Math.cos(a) * v, Math.sin(a) * v, 0.22 + 0.16 * this.rnd(), (0.9 + 0.6 * this.rnd()) * Math.max(0.8, sz), 0.4, a, 0, 5.5, (shape === SH.drop ? PF.stretch : 0) | (j === 0 ? PF.stamp : 0), 0.95);
    }
    // a splash on the ground along the blow
    if (this.markRoom(prio)) this.mark(MK.ground, SH.splat, md.splat >= 0 ? md.splat : TN.ink, -1, x, y, ang, 0.7, 0.55 * Math.max(0.8, sz), 0.8 * Math.max(0.8, sz), 0.8);
    this.busKill++;
    if (elite || boss) {
      this.busBig++;
      // an elite's death: a beat of stillness (no shake, no zoom)
      if (elite) {
        this.stop(40);
        this.vib(15, 1);
      }
    }
    return broke;
  }

  /** The 镜技 landed (the first hit of a cast, rate-limited): a boom, rings of light, a gentle zoom. */
  skillImpact(x: number, y: number): void {
    const W = this.W;
    if (W.t - this.lastSkill < 0.35 && W.t >= this.lastSkill) return;
    this.lastSkill = W.t;
    // the beat of stillness and the zoom once per cast (a 镜技 that keeps striking, like 急急如律令,
    // must not stutter the world): at most once per 1.2 s
    if (W.t - this.lastSkillStop >= 1.2 || W.t < this.lastSkillStop) {
      this.lastSkillStop = W.t;
    }
    this.vib(14, 1);
    if (this.markRoom(2)) this.mark(MK.ring, SH.halo, TN.gold, -1, x, y, 0, 0.32, 0.5 * 1.1, 2.6 * 1.1, 0.95);
    if (this.room(2)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.26, 0.3, 1.8, this.rnd() * 6.28, 0, 0, PF.ease, 0.8);
    // the boom goes out with the step's bus, counted in its 4 voices
    this.busSkill++;
  }

  /** A boss changed phase (the core's 120 ms stop already runs): an edge pulse, rings, a haptic. */
  phase(x: number, y: number): void {
    this.edgePulse(1);
    this.vib(40, 0);
    for (let k = 0; k < 2; k++) if (this.room(2)) this.emit(SH.ring, TN.ink, x, y, 0, 0, 0.4 + k * 0.15, 0.6, 3.5 + k, this.rnd() * 6.28, 0, 0, PF.ease, 0.9);
  }
  /** A boss died (the core stops 160 ms): an edge pulse, the crown, a haptic. */
  bossDown(x: number, y: number): void {
    this.edgePulse(1);
    this.vib(80, 0);
    if (this.room(2)) this.emit(SH.crown, TN.ink, x, y, 0, 0, 0.6, 1, 4, 0, 0, 0, PF.ease, 0.9);
  }

  /** You were hurt from (fx, fy) (NaN: unknown); frac is the blow's share of your max HP. A hard blow
   *  (≥ 15%, or a boss's) pulses the screen's edge, at most once per 0.6 s; the camera never moves. */
  hurt(fx: number, fy: number, boss: boolean, frac = 0): void {
    const W = this.W;
    const hard = boss || frac >= 0.15;
    this.hurtAge = 0;
    this.hurtK = hard ? 1 : 0.75;
    let ux = 0, uy = 0;
    if (Number.isFinite(fx)) { const dx = W.px - fx, dy = W.py - fy, L = Math.hypot(dx, dy) || 1; ux = dx / L; uy = dy / L; }
    this.hurtUx = ux; this.hurtUy = uy;
    if (hard && (W.t - this.lastHurtShake >= 0.6 || W.t < this.lastHurtShake)) {
      this.lastHurtShake = W.t;
      this.edgePulse(0.8);
    }
    // GDD §20.2: an 8 ms haptic tick (a boss's blow a little longer)
    this.vib(boss ? 20 : 8, 0.3);
    // ink knocked off you
    for (let k = 0; k < 4 && this.room(2); k++) {
      const a = Math.atan2(uy, ux) + (this.rnd() - 0.5) * 2.4;
      const v = 150 + 180 * this.rnd();
      this.emit(SH.drop, TN.ink, W.px, W.py, Math.cos(a) * v, Math.sin(a) * v, 0.25, 0.9, 0.4, a, 0, 6, PF.stretch, 0.9);
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

  /** A mid-wave level-up: a gold burst and a thump (the camera stays still). */
  level(x: number, y: number): void {
    // reduced motion: one soft glow, no streaks flying out
    if (!this.motion) { if (this.room(2)) this.emit(SH.flare, TN.gold, x, y, 0, 0, 0.18, 1.2, 1.6, 0, 0, 0, PF.ease, 0.5); this.busLevel++; return; }
    // two rings of gold streaks and glints (the inner slower), starting clear of the figure so the
    // level-up never covers him
    for (let k = 0; k < 18 && this.room(2); k++) {
      const outer = k < 12;
      const streak = outer && !(k & 1);
      const a = ((outer ? k : k - 12) / (outer ? 12 : 6)) * Math.PI * 2 + (outer ? 0 : Math.PI / 6) + this.rnd() * 0.25;
      const v = outer ? 260 + 110 * this.rnd() : 150 + 50 * this.rnd();
      // (a streak is drawn back from its head: it starts far enough out that its tail stays off him)
      const d0 = streak ? 40 : 22;
      this.emit(streak ? SH.streak : SH.glint, !streak && k % 3 === 2 ? TN.white : TN.gold, x + Math.cos(a) * d0, y + Math.sin(a) * d0, Math.cos(a) * v, Math.sin(a) * v, outer ? 0.45 : 0.55, outer ? 1.15 : 1.3, 0.4, a, 0, 4, streak ? PF.stretch : 0, 0.95);
    }
    if (this.room(2)) this.emit(SH.flare, TN.gold, x, y, 0, 0, 0.2, 0.8, 2.1, 0, 0, 0, PF.ease, 0.65);
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
    this.st.frozenMs += frozenMs; this.st.realMs += realMs;
    this.secReal += realMs; this.secFrozen += frozenMs;
    if (this.secReal >= 1000) {
      const s = this.secFrozen / this.secReal;
      this.st.lastShare = s; this.st.maxShare = Math.max(this.st.maxShare, s);
      this.secReal = 0; this.secFrozen = 0;
    }
    this.trauma = Math.max(0, this.trauma - dt * TRAUMA_DECAY);
    this.shakeT += dt;
    const on = this.shakeOn;
    const amp = on ? MAX_SHAKE * this.trauma * this.trauma : 0;
    const t = this.shakeT;
    const kd = Math.exp(-dt * 20);
    this.kickX *= kd; this.kickY *= kd;
    if (!on) { this.kickX = 0; this.kickY = 0; this.trauma = 0; }
    let ox = amp * (Math.sin(t * 47.3 + 1.1) * 0.6 + Math.sin(t * 23.9 + 4.2) * 0.4) + this.kickX;
    let oy = amp * (Math.sin(t * 41.7 + 2.3) * 0.6 + Math.sin(t * 29.1 + 0.7) * 0.4) + this.kickY;
    // the whole offset stays small, whatever piled up
    const L = Math.hypot(ox, oy);
    if (L > MAX_OFFSET) { ox *= MAX_OFFSET / L; oy *= MAX_OFFSET / L; }
    if (L < 0.02) { ox = 0; oy = 0; }
    this.offX = ox; this.offY = oy;
    this.zoom *= Math.exp(-dt * 9);
    if (this.zoom < 1e-4 || !on) this.zoom = 0;
    this.st.camFrames++;
    if (L > 0.5) this.st.camOff++;
    if (this.zoom > 0.005) this.st.camZoom++;
    this.hurtAge += dt;
    this.pulseAge += dt;
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

  /** A stop of `ms` asked for in ordinary play (a heavy crit, an elite's death): counted, never granted
   *  (屏幕抖动 RC5: the whole picture froze 18–75 times a minute). Boss phases and deaths use stopHard. */
  stop(ms: number): void {
    if (!this.motion || ms <= 0) return;
    this.st.stopReqMs += ms;
  }
  /** The old bucketed stop (kept for a dev probe; nothing in play calls it). */
  stopBucket(ms: number): void {
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
  /** Camera trauma: a no-op since round 5 (屏幕抖动 RC4; the picture never shakes). */
  addTrauma(a: number): void {
    void a;
  }
  /** The contract's shake(px), a boss's slam (the bosses and 镜主): a haptic tick, at most once per
   *  0.5 s; the camera no longer moves (屏幕抖动 RC4). */
  shake(px: number): void {
    if (!this.shakeOn || !(px > 0)) return;
    const t = this.W.t;
    if (t - this.lastSlam < 0.5 && t >= this.lastSlam) return;
    this.lastSlam = t;
    this.vib(Math.round(Math.min(30, 6 * px)), 0.5);
  }
  /** The big moments' feedback that leaves the picture still: a brief dark pulse at the screen's edge
   *  (render.ts overlays), strength k ≤ 1. */
  edgePulse(k: number): void {
    if (this.pulseAge < PULSE_S && this.pulseK * (1 - this.pulseAge / PULSE_S) >= k) return;
    this.pulseAge = 0; this.pulseK = Math.max(0, Math.min(1, k));
  }
  /** A directional kick of the camera: a no-op since round 5 (屏幕抖动 RC4). */
  kick(ux: number, uy: number, px: number): void {
    void ux; void uy; void px;
  }
  /** A zoom punch: a no-op since round 5 (屏幕抖动 RC4: 7–26 px at the screen's edges). */
  punch(z: number): void {
    void z;
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
    this.busReset();
  }

  stats(): FeelStats { return { ...this.st, sparks: this.sp.count }; }
}

/** The grid a dying body breaks on (g × g pieces): mobs 3 (2 on low), elites 3, bosses 4. */
export function fragGrid(kind: number, quality: string): number {
  return kind === EKind.Boss ? 4 : kind === EKind.Elite || kind === EKind.Demon ? 3 : quality === 'low' ? 2 : 3;
}
/** A death piece's white window: its first 35 ms are drawn from the white twin (the break's flash);
 *  never under reduced motion (no flashing), where the pieces break in place in their own ink. */
export const FRAG_WHITE_S = 0.035;
export function fragWhite(age: number, calm: boolean): boolean {
  return !calm && age >= 0 && age < FRAG_WHITE_S;
}
function popcount(v: number): number {
  let n = 0;
  for (let x = v >>> 0; x; x &= x - 1) n++;
  return n;
}

/** A crit number's steady size (× its size by damage): crits read bigger than plain hits. */
export const CRIT_NUM = 1.12;
/**
 * A damage number's pop at age t (s): plain hits overshoot to 1.15× and settle; crits jump to 1.42×,
 * bounce under (≈ 0.9×) and settle within 0.3 s. Reduced motion: no pop.
 */
export function numPop(t: number, crit: boolean, calm: boolean): number {
  if (calm) return 1;
  if (crit) {
    if (t < 0.05) return 0.7 + 0.72 * Math.max(0, t) / 0.05;
    if (t < 0.34) return 1 + 0.42 * Math.exp(-(t - 0.05) / 0.07) * Math.cos((t - 0.05) * 26);
    return 1;
  }
  if (t < 0.06) return 0.6 + 0.55 * (Math.max(0, t) / 0.06);
  if (t < 0.18) { const u = (t - 0.06) / 0.12; return 1.15 - 0.15 * (1 - (1 - u) * (1 - u)); }
  return 1;
}

/** Device-level feel preferences the UI sets (the pause sheet's 震动 switch: blows you take, elite
 *  kills, the 镜技 and bosses — never ordinary crits). */
export const FEEL_PREFS = { vibrate: true };
export function setVibrate(on: boolean): void { FEEL_PREFS.vibrate = on; }
