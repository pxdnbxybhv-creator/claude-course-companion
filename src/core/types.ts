// Domain model for 半亩 · Half-Acre.
// Everything the user owns lives in one AppState object persisted to localStorage.

/** The six classical plants of literati ink painting. Each habit grows as one of them. */
export type PlantKind = 'bamboo' | 'plum' | 'orchid' | 'chrysanthemum' | 'pine' | 'lotus';

export const PLANT_KINDS: readonly PlantKind[] = ['plum', 'orchid', 'bamboo', 'chrysanthemum', 'pine', 'lotus'];

/** A local calendar day, formatted `YYYY-MM-DD` in the user's own timezone. */
export type DateKey = string;

export interface Habit {
  id: string;
  name: string;
  plant: PlantKind;
  /** Seed for the plant's procedural shape — two bamboos never look the same. */
  seed: number;
  createdAt: DateKey;
  /** 0 = Sunday … 6 = Saturday. Empty/undefined means every day. */
  days?: number[];
  archived?: boolean;
}

export interface FocusSession {
  /** Epoch ms when the incense was lit. */
  start: number;
  /** Planned length in minutes. */
  minutes: number;
  /** True when it burned to the end; false when extinguished early. */
  completed: boolean;
  /** Optional intention written before lighting. */
  intent?: string;
}

export type Lang = 'zh' | 'en';

export type AmbientKind = 'none' | 'rain' | 'stream' | 'pines' | 'qin';

export interface Settings {
  lang: Lang;
  /** Up to 4 characters carved into the user's personal seal (印章). */
  sealName: string;
  sound: boolean;
  volume: number; // 0..1
  ambient: AmbientKind;
  focusMinutes: number;
  theme: 'auto' | 'light' | 'dark';
  /** Optional coordinates for sunrise/sunset in the almanac. */
  location?: { lat: number; lon: number; label?: string };
}

export interface AppState {
  version: 1;
  habits: Habit[];
  /** habitId → sorted, de-duplicated list of days it was done. */
  checkins: Record<string, DateKey[]>;
  /** One line per day (日记一句). */
  notes: Record<DateKey, string>;
  focus: FocusSession[];
  settings: Settings;
  /** Set once the welcome sheet has been dismissed. */
  onboarded: boolean;
}
