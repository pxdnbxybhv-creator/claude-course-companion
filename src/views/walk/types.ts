// Contract between the 3D world core (world/*) and the features that dress it (features/*):
// festival easter eggs, collectibles, critters. The core builds the land, the pond, the sky, the
// protagonist and the user's plants; features only use what is exposed here.
import type * as THREE_NS from 'three';
import type { SceneEnv } from '../../ink/scene-types';
import type { AudioEngine } from '../../audio/engine';
import type { Rng } from '../../core/rng';
import type { PIGMENTS } from '../../ink/types';

/** Festivals that have an easter egg. */
export type FestivalKey =
  | 'newyear'     // 元旦 Jan 1
  | 'spring'      // 春节 lunar 1/1 (and 除夕 the night before)
  | 'lantern'     // 元宵 lunar 1/15
  | 'qingming'    // 清明 solar term
  | 'dragonboat'  // 端午 lunar 5/5
  | 'qixi'        // 七夕 lunar 7/7
  | 'midautumn'   // 中秋 lunar 8/15
  | 'chongyang'   // 重阳 lunar 9/9
  | 'dongzhi'     // 冬至 solar term
  | 'laba';       // 腊八 lunar 12/8

export interface Interactable {
  id: string;
  /** World position the player must approach. */
  position: THREE_NS.Vector3;
  /** Distance (world units) within which the prompt appears. */
  radius: number;
  /** Short name shown in the prompt, e.g. "《读书》" or "月饼". */
  labelZh: string;
  labelEn: string;
  /** Verb on the action button, e.g. "浇水 · Water", "吃掉 · Eat". */
  actionZh: string;
  actionEn: string;
  /** Called when the player taps the action button or presses E / Enter. */
  act(): void | Promise<void>;
}

export interface Hud {
  /** A short message floating near the top of the screen. */
  toast(zh: string, en: string, ms?: number): void;
  /** A small persistent counter in the HUD (e.g. mooncakes eaten 2/6). Pass null to remove. */
  setCounter(id: string, label: { zh: string; en: string } | null, value?: string): void;
  /** A centred card, like a small hanging scroll (a poem, a riddle, a festival greeting). */
  showCard(o: { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal?: string }): void;
}

export interface Player {
  readonly position: THREE_NS.Vector3;
  /** Facing angle around +Y, radians. */
  readonly heading: number;
  /** A small expressive animation. */
  emote(kind: 'eat' | 'bow' | 'jump' | 'wave'): void;
}

export interface Sky {
  /** Adjust the moon (features may make it huge for 中秋). */
  setMoon(o: { visible?: boolean; scale?: number; glow?: number; position?: THREE_NS.Vector3 }): void;
  /** True between dusk and dawn (real clock, or forced by a feature/preview). */
  isNight(): boolean;
  /** Force night (e.g. fireworks, lanterns) while a feature is active. */
  forceNight(on: boolean): void;
}

export interface WorldCtx {
  /** The three.js namespace — import nothing else from 'three' at runtime in features. */
  THREE: typeof THREE_NS;
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  renderer: THREE_NS.WebGLRenderer;
  /** Ground height at (x, z). y is up; one unit ≈ one metre. */
  groundY(x: number, z: number): number;
  /** Walkable land (not water, not beyond the garden's edge). */
  isWalkable(x: number, z: number): boolean;
  /** The half-acre pond (an ellipse). */
  pond: { center: THREE_NS.Vector3; radiusX: number; radiusZ: number; waterY: number };
  /** Rough bounds of the garden the player can roam. */
  bounds: { radius: number };
  player: Player;
  env: SceneEnv & { date: Date; festivals: FestivalKey[] };
  /** Show a prompt when the player is near; returns an unregister function. */
  addInteractable(i: Interactable): () => void;
  hud: Hud;
  audio: AudioEngine;
  /** Deterministic randomness for this world (seeded from the date). */
  rng: Rng;
  /** Run every frame with (dt seconds, t seconds since start); returns an unsubscribe. */
  onFrame(fn: (dt: number, t: number) => void): () => void;
  sky: Sky;
  palette: typeof PIGMENTS;
  lang: 'zh' | 'en';
}

export interface WorldFeature {
  id: string;
  /** Called once after the core world is built. Features decide for themselves whether they apply today. */
  init(ctx: WorldCtx): void | Promise<void>;
  /** Remove everything the feature added (scene objects, listeners, HUD counters). */
  dispose?(): void;
}
