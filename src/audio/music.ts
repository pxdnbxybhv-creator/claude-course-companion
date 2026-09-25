// Background music — generative, synthesised with Web Audio (no audio files). STUB — contract only.
// Themes follow the place: the garden, the water town, the lake, the bamboo grove, the plum ridge,
// the temple, night, festival days, and the games hall.
import type { MusicTheme } from '../views/walk/map';

export interface MusicEngine {
  /** Crossfade to a theme (≈3 s); null fades to silence. Safe to call repeatedly with the same theme. */
  setTheme(theme: MusicTheme | null): void;
  /** Master switch (settings.music). Starting is deferred until audio.unlock() has run. */
  setEnabled(on: boolean): void;
  /** 0..1 (settings.musicVolume). */
  setVolume(v: number): void;
  /** Lower the music briefly under a sound effect (0..1 = how much to keep). */
  duck(amount?: number, ms?: number): void;
  /** Currently requested theme. */
  readonly theme: MusicTheme | null;
}

export const music: MusicEngine = {
  setTheme() {},
  setEnabled() {},
  setVolume() {},
  duck() {},
  theme: null,
};
