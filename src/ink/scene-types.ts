// Shared scene vocabulary for the garden, the scroll export and the almanac.
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export interface SceneEnv {
  season: Season;
  tod: TimeOfDay;
  /** Local hour as a fraction, 0..24 (drives sun/moon position and light). */
  hour: number;
  /** 0 new moon → 0.5 full → 1 new again. */
  moonPhase: number;
  /** Solar term index 0..23 (0 = 立春 Start of Spring). */
  termIndex: number;
  /** 0..1 — how clear the pond is (average freshness of the user's habits). 半亩方塘一鉴开. */
  clarity: number;
  seed: number;
}
