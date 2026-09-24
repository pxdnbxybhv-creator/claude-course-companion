// All sound is synthesised with the Web Audio API — no audio files. STUB — contract only.
import type { AmbientKind } from '../core/types';

export interface AudioEngine {
  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock(): Promise<void>;
  setEnabled(on: boolean): void;
  setVolume(v: number): void;
  /** A guqin (古琴) pluck on the pentatonic scale. degree 0 = 宫; negative/above 4 wrap octaves. */
  pluck(degree?: number, velocity?: number): void;
  /** Check-in reward: a short rising phrase of harmonics (泛音). `streak` can make it richer. */
  chime(streak?: number): void;
  /** A struck bronze bowl / chime stone (磬) — end of a focus session. */
  bell(): void;
  /** A soft wooden knock (木鱼) — lighting the incense. */
  knock(): void;
  /** Crossfade the ambient bed. 'qin' = slow generative guqin improvisation. */
  setAmbient(kind: AmbientKind): void;
}

const noop = () => {};
export const audio: AudioEngine = {
  unlock: async () => {},
  setEnabled: noop,
  setVolume: noop,
  pluck: noop,
  chime: noop,
  bell: noop,
  knock: noop,
  setAmbient: noop,
};
