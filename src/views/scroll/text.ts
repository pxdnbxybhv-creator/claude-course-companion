// Words for the scroll: classical phrasing of the user's record, Chinese numerals, poster data.
// Pure except for reading the solar-term / lunar helpers.
import type { AppState, DateKey, Habit, PlantKind } from '../../core/types';
import { PLANT_KINDS } from '../../core/types';
import { cnYearDigits, fromKey, addDays } from '../../core/date';
import { statsFor, isScheduled, bestStreakFor, type HabitStats } from '../../core/habits';
import { PLANT_INFO } from '../../ink/plants';
import { termContext } from '../../core/solarterms';
import { toLunar, type LunarDate } from '../../core/lunar';
import { TERMS } from '../../data/terms';

const D = '〇一二三四五六七八九';

function under10k(n: number): string {
  const units = ['', '十', '百', '千'];
  const digits = String(n).split('').map(Number);
  let out = '';
  let zero = false;
  digits.forEach((d, i) => {
    if (d === 0) { zero = true; return; }
    if (zero && out) out += '零';
    zero = false;
    out += D[d] + units[digits.length - 1 - i];
  });
  return out;
}

/** Counting numerals: 7 → 七, 12 → 十二, 105 → 一百零五, 120 → 一百二十, 10240 → 一万零二百四十. */
export function cnCount(n: number): string {
  n = Math.max(0, Math.floor(n));
  if (n === 0) return '零';
  let s: string;
  if (n < 10000) s = under10k(n);
  else {
    const hi = Math.floor(n / 10000), lo = n % 10000;
    s = under10k(hi) + '万' + (lo ? (lo < 1000 ? '零' : '') + under10k(lo) : '');
  }
  return s.startsWith('一十') ? s.slice(1) : s;
}

/** Gregorian month names for the year poster (一月 … 十二月). */
export const CN_MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
export const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Leisure-seal (闲章) texts — all ≤ 4 characters. */
export const LEISURE_SEALS = ['源头活水', '天光云影', '日日好日', '清如许', '日新', '惜阴', '岁寒', '知白守黑'];

export interface PlantEntry {
  habit: Habit;
  stats: HabitStats;
}

export interface PosterData {
  today: DateKey;
  date: Date;
  year: number;
  termIndex: number;
  termZh: string;
  termEn: string;
  lunar: LunarDate;
  plants: PlantEntry[];
  /** Distinct plant kinds among active habits, in canonical order. */
  kinds: PlantKind[];
  /** Distinct days with at least one check-in (on or before today). */
  daysTended: number;
  totalCheckins: number;
  /** Completed incense sessions. */
  incense: number;
  bestStreak: number;
  /** Average freshness of active habits, 0..1 (1 for an empty garden). */
  clarity: number;
}

export function posterData(s: AppState, today: DateKey): PosterData {
  const date = fromKey(today);
  const active = s.habits.filter((h) => !h.archived);
  const plants = active.map((habit) => ({ habit, stats: statsFor(habit, s.checkins[habit.id] ?? [], today) }));
  const kindSet = new Set(active.map((h) => h.plant));
  const kinds = PLANT_KINDS.filter((k) => kindSet.has(k));
  const days = new Set<DateKey>();
  let total = 0;
  let best = 0;
  for (const h of s.habits) {
    const list = (s.checkins[h.id] ?? []).filter((d) => d <= today);
    total += list.length;
    list.forEach((d) => days.add(d));
    best = Math.max(best, bestStreakFor(h, list));
  }
  let termIndex = 0;
  try { termIndex = termContext(date).current.index; } catch { /* stub or bad date — keep 0 */ }
  const term = TERMS[((termIndex % 24) + 24) % 24];
  const clarity = plants.length ? plants.reduce((a, p) => a + p.stats.freshness, 0) / plants.length : 1;
  return {
    today, date, year: date.getFullYear(), termIndex, termZh: term?.zh ?? '', termEn: term?.en ?? '',
    lunar: toLunar(date), plants, kinds, daysTended: days.size, totalCheckins: total,
    incense: s.focus.filter((f) => f.completed).length, bestStreak: best, clarity,
  };
}

/** Share of the habits that existed and were due on `day` that were done (0..1), or null when nothing was due. */
export function dayShare(habits: readonly Habit[], sets: ReadonlyMap<string, ReadonlySet<DateKey>>, day: DateKey): number | null {
  let due = 0, done = 0;
  for (const h of habits) {
    if (h.createdAt > day) continue;
    const did = sets.get(h.id)?.has(day) ?? false;
    if (isScheduled(h, day)) {
      due++;
      if (did) done++;
    } else if (did) done++; // a bonus day still counts, but the share is capped below
  }
  if (due === 0) return done > 0 ? 1 : null;
  return Math.min(1, done / due);
}

const isHan = (s: string) => /^[\u3007\u3400-\u9fff\uf900-\ufaff]+$/.test(s);

export interface Inscription {
  /** Verses of the poem, punctuation removed. */
  verses: string[];
  /** The colophon (款): date, record and signature, as phrases. */
  date: string[];
  record: string[];
  sign: string;
  /** Name-seal text and leisure-seal text. */
  seal: string;
  leisure: string;
}

/** Split poem lines into verses (a verse ends at any full-width punctuation). */
export function versesOf(lines: readonly string[]): string[] {
  return lines
    .flatMap((l) => l.split(/[，。？！、；：,.?!;:「」『』“”‘’《》〈〉（）()\s·—…]+/))
    .map((v) => v.trim())
    .filter(Boolean);
}

export function composeInscription(d: PosterData, poemLines: readonly string[], sealName: string, salt: number): Inscription {
  const name = sealName.trim();
  const seal = name || '半亩';
  const record: string[] = [];
  if (d.kinds.length === 0) {
    record.push('半亩初开', '犹待栽植');
  } else {
    const chars = d.kinds.map((k) => PLANT_INFO[k].zh).join('');
    if (d.kinds.length === 1) {
      const n = d.plants.length;
      record.push(`园中植${chars}${cnCount(n)}本`);
    } else record.push(d.kinds.length <= 3 ? `园中植${chars}${cnCount(d.kinds.length)}种` : `园中植${chars}`);
    if (d.daysTended > 0) record.push(`计功${cnCount(d.daysTended)}日`);
  }
  if (d.incense > 0) record.push(`焚香${cnCount(d.incense)}炷`);
  const date = [`${cnYearDigits(d.year)}年`, d.termZh, `${d.lunar.yearGanZhi}年${d.lunar.monthName}`].filter((p) => p && isHan(p));
  const sign = name && isHan(name) && name !== '半亩' ? `${name}记` : '半亩主人记';
  const leisure = LEISURE_SEALS[Math.abs(salt + d.termIndex) % LEISURE_SEALS.length];
  return { verses: versesOf(poemLines), date, record, sign, seal, leisure };
}

const EN_NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const enCount = (n: number, one: string, many: string) => `${n <= 12 ? EN_NUM[n] : n} ${n === 1 ? one : many}`;

/** The small English caption under the painting (English mode only). */
export function englishCaption(d: PosterData): string {
  const parts = [`Half-Acre, ${d.termEn ? d.termEn + ' ' : ''}${d.year}`];
  if (d.plants.length) parts.push(enCount(d.plants.length, 'plant', 'plants'));
  else parts.push('a garden waiting to be planted');
  if (d.daysTended) parts.push(`${d.daysTended} ${d.daysTended === 1 ? 'day' : 'days'} tended`);
  if (d.incense) parts.push(enCount(d.incense, 'stick', 'sticks') + ' of incense');
  return parts.join(' · ');
}

/** Dates of the Gregorian year `y` as keys, Jan 1 … Dec 31. */
export function daysOfYear(y: number): DateKey[] {
  const out: DateKey[] = [];
  let k = `${y}-01-01`;
  while (k.startsWith(String(y))) {
    out.push(k);
    k = addDays(k, 1);
  }
  return out;
}

/** Classical summary for the year poster. */
export function yearRecord(s: AppState, year: number, today: DateKey): { zh: string[]; en: string; days: number; best: number } {
  const prefix = String(year);
  const days = new Set<DateKey>();
  let best = 0;
  for (const h of s.habits) {
    const list = (s.checkins[h.id] ?? []).filter((d) => d.startsWith(prefix) && d <= today);
    list.forEach((d) => days.add(d));
    best = Math.max(best, bestStreakFor(h, list));
  }
  const incense = s.focus.filter((f) => f.completed && new Date(f.start).getFullYear() === year).length;
  const kinds = PLANT_KINDS.filter((k) => s.habits.some((h) => !h.archived && h.plant === k));
  const zh: string[] = [];
  if (kinds.length) zh.push(`植${kinds.map((k) => PLANT_INFO[k].zh).join('')}${kinds.length > 1 ? cnCount(kinds.length) + '种' : ''}`);
  zh.push(days.size ? `勤于园者${cnCount(days.size)}日` : '园中尚静');
  if (best > 1) zh.push(`连日不辍${cnCount(best)}日`);
  if (incense) zh.push(`焚香${cnCount(incense)}炷`);
  const en = [
    `${days.size} ${days.size === 1 ? 'day' : 'days'} tended`,
    best > 1 ? `longest run ${best} days` : '',
    incense ? `${incense} ${incense === 1 ? 'stick' : 'sticks'} of incense` : '',
  ].filter(Boolean).join(' · ');
  return { zh, en, days: days.size, best };
}
