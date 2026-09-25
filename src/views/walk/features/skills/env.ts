// What every skill is handed, and what it hands back.
import type { WorldCtx } from '../../types';
import type { Bag } from '../kit';
import type { Rng } from '../../../../core/rng';
import type { Fx } from './fx';
import type { VerseDeck, VersePlace } from './verses';

export interface SkillEnv {
  ctx: WorldCtx;
  bag: Bag;
  fx: Fx;
  rng: Rng;
  reduced: boolean;
  deck: VerseDeck;
  /** 0 by day … 1 by night (eased). */
  night(): number;
  /** Where and when, for choosing verse. */
  place(): VersePlace;
  /** The surface under (x, z): the ground, or the water where there is water. */
  floorAt(x: number, z: number): number;
  /** Keep something going after the skill itself has ended (flowers fading, a trail drying). Return false when done. */
  linger(fn: (dt: number, t: number) => boolean): void;
  /** How many times this skill has been used this session (varies phrases, catches, poems). */
  uses: number;
}

/** A skill under way. */
export interface Running {
  /** Called every frame with the world's dt (slowed with it) and the real clock t (seconds, performance.now); false when it is over. */
  update(dt: number, t: number): boolean;
  /** Tidy up — also when cut short (another companion chosen, a mini-game starts). */
  end(): void;
  /** The skill key pressed again while it runs (dismount, land early…). */
  press?(): void;
  /** True while the walker is frozen by this skill itself (riding Red Hare): the button stays. */
  ownsFreeze?: boolean;
}

export type SkillStart = (env: SkillEnv) => Running | null;

/** A skill event for the rest of the world (NPCs gather, bow, beds bloom). */
export function skillEvent(name: 'banmu:music' | 'banmu:bow' | 'banmu:bloom', x: number, z: number, r: number): void {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail: { x, z, r } }));
  } catch { /* no window (tests) */ }
}

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (k: number) => 1 - Math.pow(1 - clamp01(k), 3);
export const easeInOut = (k: number) => { k = clamp01(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };
/** A springy pop-in (overshoots a little). */
export const easeBack = (k: number) => { k = clamp01(k); const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));

/** Colours (sRGB hex) of the warm ink palette the skills paint with. */
export const HUE = {
  ink: 0x1d1916,
  inkSoft: 0x3b332c,
  paper: 0xf4ecd9,
  rouge: 0xc8475a,
  peach: 0xec9a9a,
  blush: 0xf4c9c6,
  gamboge: 0xe2b13c,
  vermilion: 0xd1502f,
  ochre: 0xb8864a,
  dust: 0xc4a47c,
  jade: 0x6f9a5a,
  leaf: 0x8cab4e,
  teal: 0x2e6a66,
  indigo: 0x3c4f7a,
  silver: 0xe6ecf6,
  moon: 0xf6e7b4,
  gold: 0xf2c55c,
  amber: 0xffb86b,
  white: 0xf6f2e8,
  violet: 0x8f72b4,
} as const;

/** Forward (along the heading) as [x, z]. */
export function forward(heading: number): [number, number] {
  return [Math.sin(heading), Math.cos(heading)];
}
