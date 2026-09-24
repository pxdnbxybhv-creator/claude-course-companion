// Real-world context for the garden painting: season & solar term, time of day, moon, pond clarity.
// Dev/screenshot overrides via the query string: ?hour=20.5&term=18 (never persisted).
import type { SceneEnv, TimeOfDay } from '../../ink/scene-types';
import type { Settings } from '../../core/types';
import { termContext, seasonOfTerm, type TermContext } from '../../core/solarterms';
import { moonInfo, sunTimes } from '../../core/astro';
import { toLunar, festivalsOn } from '../../core/lunar';
import { TERMS } from '../../data/terms';

function queryNum(name: string): number | null {
  try {
    const v = new URLSearchParams(location.search).get(name);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const HOUR_OVERRIDE = queryNum('hour');
const TERM_OVERRIDE = queryNum('term');

/** The garden's mountains stay the same from day to day; only light and season change. */
const LANDSCAPE_SEED = 1127;

function todFor(hour: number, rise: number, set: number): TimeOfDay {
  if (hour >= rise - 0.75 && hour < rise + 0.9) return 'dawn';
  if (hour >= rise + 0.9 && hour < set - 0.9) return 'day';
  if (hour >= set - 0.9 && hour < set + 0.75) return 'dusk';
  return 'night';
}

const hoursOf = (d: Date) => d.getHours() + d.getMinutes() / 60;

export function sceneEnv(now: Date, clarity: number, location?: Settings['location']): SceneEnv {
  const ctx = termContext(now);
  const termIndex = TERM_OVERRIDE !== null ? ((Math.round(TERM_OVERRIDE) % 24) + 24) % 24 : ctx.current.index;
  const hour = HOUR_OVERRIDE !== null ? HOUR_OVERRIDE % 24 : hoursOf(now);
  let rise = 6, set = 18.2;
  if (location) {
    try {
      const st = sunTimes(now, location.lat, location.lon);
      if (st.sunrise && st.sunset) {
        rise = hoursOf(st.sunrise);
        set = hoursOf(st.sunset);
      }
    } catch { /* fall back to a generic day */ }
  }
  return {
    season: seasonOfTerm(termIndex),
    tod: todFor(hour, rise, set),
    hour,
    moonPhase: moonInfo(now).phase,
    termIndex,
    clarity: Math.max(0, Math.min(1, clarity)),
    seed: LANDSCAPE_SEED,
  };
}

export interface TodayLine {
  zh: string;
  en: string;
  festivalZh?: string;
  festivalEn?: string;
  term: TermContext;
}

const ORD = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** "八月十四 · 秋分 · 雷始收声" and its English counterpart. */
export function todayLine(now: Date): TodayLine {
  const term = termContext(now);
  const lunar = toLunar(now);
  const tt = TERMS[term.current.index];
  const p = tt?.pentads[term.pentad];
  const fest = festivalsOn(now)[0];
  const zh = [lunar.monthName + lunar.dayName, tt?.zh, p?.zh].filter(Boolean).join(' · ');
  const monthEn = `${lunar.leap ? 'leap ' : ''}${ORD(lunar.month)} moon, day ${lunar.day}`;
  const en = [monthEn, tt?.en, p?.en].filter(Boolean).join(' · ');
  return { zh, en, festivalZh: fest?.zh, festivalEn: fest?.en, term };
}
