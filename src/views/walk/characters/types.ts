// Contract for playable character models (see data/characters.ts for the cast).
// A model is a three.js object the core moves around; the model animates itself from the state
// the core passes in every frame.
import type * as THREE_NS from 'three';
import type { CharacterId } from '../../../data/characters';
import type { EmoteKind } from '../types';

export interface MotionState {
  /** Horizontal speed (m/s). */
  speed: number;
  running: boolean;
  grounded: boolean;
  /** Vertical velocity (m/s), for jump poses. */
  vy: number;
  /** The emote playing now and its progress 0..1, or null. */
  emote: EmoteKind | null;
  emoteT: number;
  /** Seconds since the world started (for idle breathing, blinking, tails swishing…). */
  t: number;
  /** Frozen for a mini-game or riding a boat (sitting / standing pose). */
  riding: boolean;
}

export interface CharacterModel {
  /** Origin at the feet, facing −z (the core rotates it to the heading). */
  root: THREE_NS.Object3D;
  /** Standing height (m), for the camera and name labels. */
  height: number;
  update(dt: number, s: MotionState): void;
  dispose(): void;
  /** Right-hand attach point for a prop a feature lends the walker (a fishing rod…). */
  hand?: THREE_NS.Object3D;
  /** A feature put `prop` in the hand (parented to `hand`): hide the character's own hand props; null gives them back. */
  hold?(prop: string | null): void;
}

/** `reduced`: prefers-reduced-motion (read from the media query when not given). */
export type CharacterFactory = (THREE: typeof THREE_NS, opts: { palette: Record<string, string>; reduced?: boolean }) => CharacterModel;

export type CharacterRegistry = Record<CharacterId, CharacterFactory>;
