// Contract between the 3D world core (world/*) and the features that dress it (features/*):
// festival easter eggs, collectibles, critters. The core builds the land, the pond, the sky, the
// protagonist and the user's plants; features only use what is exposed here.
import type * as THREE_NS from 'three';
import type { SceneEnv } from '../../ink/scene-types';
import type { AudioEngine } from '../../audio/engine';
import type { Rng } from '../../core/rng';
import type { PIGMENTS } from '../../ink/types';
import type { RegionId, MusicTheme, XZ } from './map';
import type { CharacterId } from '../../data/characters';

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
  /**
   * Put a mini-game overlay (a power bar, a reel meter, a dialogue) above the world. The node is
   * appended to a full-screen, pointer-transparent layer; give interactive parts pointer-events: auto.
   * Returns a remover.
   */
  mount(node: HTMLElement): () => void;
  /** A dialogue line from a character in the world (NPC), with optional choices. Resolves with the chosen index (or -1). */
  say(o: { nameZh: string; nameEn: string; zh: string; en: string; choices?: { zh: string; en: string }[] }): Promise<number>;
  /** A small persistent counter in the HUD (e.g. mooncakes eaten 2/6). Pass null to remove. */
  setCounter(id: string, label: { zh: string; en: string } | null, value?: string): void;
  /** A centred card, like a small hanging scroll (a poem, a riddle, a festival greeting). */
  showCard(o: { titleZh: string; titleEn: string; bodyZh: string; bodyEn: string; seal?: string }): void;
}

export type EmoteKind = 'eat' | 'bow' | 'jump' | 'wave' | 'throw' | 'cast' | 'row' | 'sit' | 'play' | 'water';

export interface Player {
  readonly position: THREE_NS.Vector3;
  /** Facing angle around +Y, radians. */
  readonly heading: number;
  /** Who the player is walking as. */
  readonly character: CharacterId;
  /** A small expressive animation. */
  emote(kind: EmoteKind): void;
  /** Move the player (e.g. fast travel, getting into a boat). y is taken from the ground unless given. */
  teleport(x: number, z: number, heading?: number, y?: number): void;
  /**
   * Stop normal walking (mini-games, riding a boat). While frozen the core still animates the
   * character and follows it with the camera; features drive position via teleport().
   */
  freeze(on: boolean): void;
  /** Sit in / stand on a moving object; the character is placed at the object's origin each frame. Pass null to get off. */
  ride(obj: THREE_NS.Object3D | null): void;
}

/** The movement intent from keys / joystick, readable by features (e.g. rowing a boat). */
export interface InputState {
  /** −1..1 strafe (right positive) and forward (forward positive), camera-relative. */
  readonly x: number;
  readonly y: number;
  readonly run: boolean;
  /** True on the frame the action button / E is pressed. */
  readonly actionPressed: boolean;
}

export interface Sky {
  /** Adjust the moon (features may make it huge for 中秋). */
  setMoon(o: { visible?: boolean; scale?: number; glow?: number; position?: THREE_NS.Vector3 }): void;
  /** True between dusk and dawn (real clock, or forced by a feature/preview). */
  isNight(): boolean;
  /** Force night (e.g. fireworks, lanterns) while a feature is active. */
  forceNight(on: boolean): void;
}

/** A solid prop the player cannot walk through: an upright cylinder at (x, z). */
export interface Collider { x: number; z: number; r: number; /** Height above the ground (m); tall props also keep the camera clear. */ h?: number }
/** Something the camera must not sit behind: an upright cylinder from y0 to y1 (world metres). */
export interface Occluder { x: number; z: number; r: number; y0: number; y1: number }

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
  env: SceneEnv & {
    date: Date;
    festivals: FestivalKey[];
    /** What the visitor chose in the time switch: the real clock, or forced day / night. */
    timeMode?: 'now' | 'day' | 'night';
  };
  /** Show a prompt when the player is near; returns an unregister function. */
  addInteractable(i: Interactable): () => void;
  /** Make a prop solid; returns a remover. */
  addCollider(c: Collider): () => void;
  /** Keep the camera from hiding behind a prop; returns a remover. */
  addOccluder(o: Occluder): () => void;
  hud: Hud;
  audio: AudioEngine;
  /** Deterministic randomness for this world (seeded from the date). */
  rng: Rng;
  /** Run every frame with (dt seconds, t seconds since start); returns an unsubscribe. */
  onFrame(fn: (dt: number, t: number) => void): () => void;
  sky: Sky;
  palette: typeof PIGMENTS;
  lang: 'zh' | 'en';
  /** Movement intent (joystick / keys). */
  input: InputState;
  /** The region the player is in (null on the paths between). */
  currentRegion(): RegionId | null;
  /** Called when the player enters a region; returns an unsubscribe. */
  onRegion(fn: (id: RegionId | null) => void): () => void;
  /**
   * A group for a region's content. The core hides groups of far-away regions (and their
   * interactables stop prompting), so put everything region-specific in here.
   */
  regionGroup(id: RegionId): THREE_NS.Group;
  /** Water in the world (pond, lake, river): its surface height at (x, z), or null on land. */
  waterAt(x: number, z: number): number | null;
  /** World position of a named spot from map.ts ANCHORS, with y on the ground (or water). */
  anchor(x: XZ): THREE_NS.Vector3;
  /** Background music: request a theme (the core already sets one per region; features may override briefly). */
  music: { setTheme(theme: MusicTheme | null): void };
}

/** Builds one region's scenery (see map.ts REGIONS). Content goes into ctx.regionGroup(id). */
export interface RegionModule {
  id: RegionId;
  build(ctx: WorldCtx): void | Promise<void>;
  dispose?(): void;
}

export interface WorldFeature {
  id: string;
  /** Called once after the core world is built. Features decide for themselves whether they apply today. */
  init(ctx: WorldCtx): void | Promise<void>;
  /** Remove everything the feature added (scene objects, listeners, HUD counters). */
  dispose?(): void;
}
