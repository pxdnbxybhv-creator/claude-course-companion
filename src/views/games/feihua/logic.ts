// 飞花令 · Flying Flowers — pure logic. Every line in play is a clause cut from the verified poems
// in src/data/poems.ts (verse only — the prose sources are left out; split at full-width
// punctuation, never at 、); nothing is invented. A 令字 is drawn, and the lines fly by position
// (按位飞花): the first line holds it as its 1st character, the next as its 2nd, and so on round to
// the 7th. Each turn the player picks, from four real lines, the one with the 令字 in the right place.
import { POEMS, type Poem } from '../../../data/poems';

export interface Clause {
  /** The half-line itself, e.g. 「疏影横斜水清浅」. */
  text: string;
  poem: Poem;
}

/** Prose sources among the poems (sayings, essays, classics) — not 诗句, so not in play. */
export const PROSE_SOURCES = ['论语', '孔子家语', '道德经', '礼记', '劝学', '进学解', '爱莲说', '记承天寺夜游', '鹤林玉露'];
export const isVerse = (p: Poem) => !(p.author === '荀子' || PROSE_SOURCES.some((t) => p.title.startsWith(t)));

/** Split a poem line into clauses at full-width punctuation (not at 、, which joins a line). */
export function clausesOf(line: string): string[] {
  return line.split(/[，。？！；：]/).map((s) => s.trim()).filter(Boolean);
}

/** The characters of a clause that count for position (the 、 pause is not one). */
export const charsOf = (text: string) => [...text].filter((c) => c !== '、');

/** Every usable clause of the verse (4–11 characters, first occurrence wins). */
export const CORPUS: Clause[] = (() => {
  const seen = new Set<string>();
  const out: Clause[] = [];
  for (const poem of POEMS) {
    if (!isVerse(poem)) continue;
    for (const line of poem.lines)
      for (const text of clausesOf(line)) {
        const n = charsOf(text).length;
        if (n < 4 || n > 11 || seen.has(text)) continue;
        seen.add(text);
        out.push({ text, poem });
      }
  }
  return out;
})();

const BY_TEXT = new Map(CORPUS.map((c) => [c.text, c]));
export const inCorpus = (text: string) => BY_TEXT.has(text);

/** The 令字 on offer, with near neighbours used to pick tempting decoys. */
export const LING: { ch: string; en: string; near: string }[] = [
  { ch: '花', en: 'flower', near: '草叶梅香红芳枝' },
  { ch: '月', en: 'moon', near: '明夜光日星' },
  { ch: '春', en: 'spring', near: '秋夏冬风草' },
  { ch: '风', en: 'wind', near: '雨云吹声' },
  { ch: '山', en: 'mountain', near: '峰石岭水' },
  { ch: '水', en: 'water', near: '江河湖波流池' },
  { ch: '雨', en: 'rain', near: '风云雪露' },
  { ch: '夜', en: 'night', near: '月明晚星' },
  { ch: '人', en: 'person', near: '客君我' },
  { ch: '日', en: 'sun, day', near: '月时年朝' },
  { ch: '天', en: 'sky', near: '云日地' },
  { ch: '香', en: 'fragrance', near: '花芳梅' },
  { ch: '时', en: 'time', near: '日年岁' },
  { ch: '明', en: 'bright', near: '月光白' },
  { ch: '雪', en: 'snow', near: '霜寒冰白' },
  { ch: '云', en: 'cloud', near: '雨天山烟' },
  { ch: '酒', en: 'wine', near: '杯醉饮' },
];

/** Lines that carry the 令字. */
export function linesWith(ch: string): Clause[] {
  return CORPUS.filter((c) => c.text.includes(ch));
}

/** The places (1-based) where the 令字 stands in a line. */
export function placesOf(text: string, ch: string): number[] {
  const out: number[] = [];
  charsOf(text).forEach((c, i) => c === ch && out.push(i + 1));
  return out;
}

/** Does the line hold the 令字 as its `pos`-th character? */
export const fitsPlace = (text: string, ch: string, pos: number) => placesOf(text, ch).includes(pos);

/** The places run 1 → 7 and round again. */
export const PLACES = 7;

/**
 * The place for the next line: `from` (1..7) if a fresh line still fits it, otherwise the next place
 * round the cycle that has one. Null once the 令字 has no fresh line anywhere — the order is spent.
 */
export function nextPlace(ch: string, from: number, used: ReadonlySet<string>): number | null {
  const fresh = linesWith(ch).filter((c) => !used.has(c.text));
  for (let k = 0; k < PLACES; k++) {
    const pos = ((from - 1 + k) % PLACES) + 1;
    if (fresh.some((c) => fitsPlace(c.text, ch, pos))) return pos;
  }
  return null;
}

export type Rng = () => number;

function shuffle<T>(a: T[], rng: Rng): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export interface Round {
  /** Which character of the line must be the 令字 (1-based). */
  pos: number;
  options: Clause[];
  /** Texts among `options` that are right (the 令字 in place, not yet said). */
  correct: string[];
}

export type Verdict = 'missing' | 'place' | 'repeat' | 'unknown';

/** Why a pick is wrong, or null if it is right. */
export function verdict(ch: string, pos: number, text: string, used: ReadonlySet<string>): Verdict | null {
  if (!inCorpus(text)) return 'unknown';
  if (!text.includes(ch)) return 'missing';
  if (!fitsPlace(text, ch, pos)) return 'place';
  if (used.has(text)) return 'repeat';
  return null;
}

/**
 * Four choices for the player: one right line (the 令字 at `pos`), and as decoys real lines that
 * hold the 令字 somewhere else — so every option carries the character and only its place (or,
 * now and then, having been said already) decides. Lines without it fill in only when a scarce
 * 令字 runs short. `shown` counts how often each decoy has been offered; the least shown are
 * preferred and it is updated here, so the same decoys don't keep coming back.
 * Null when no fresh line fits the place.
 */
export function makeRound(ch: string, pos: number, used: ReadonlySet<string>, rng: Rng, shown: Map<string, number> = new Map()): Round | null {
  const fits = shuffle(linesWith(ch).filter((c) => fitsPlace(c.text, ch, pos)), rng);
  const right = fits.find((c) => !used.has(c.text));
  if (!right) return null;
  const seen = (c: Clause) => shown.get(c.text) ?? 0;
  const byFreshness = (list: Clause[]) => shuffle(list, rng).sort((a, b) => seen(a) - seen(b));
  const elsewhere = byFreshness(linesWith(ch).filter((c) => !fitsPlace(c.text, ch, pos)));
  const repeats = byFreshness(fits.filter((c) => used.has(c.text)));
  const near = LING.find((l) => l.ch === ch)?.near ?? '';
  const without = CORPUS.filter((c) => !c.text.includes(ch));
  const tempting = byFreshness(without.filter((c) => [...near].some((n) => c.text.includes(n))));
  const plain = byFreshness(without);
  const decoys: Clause[] = [];
  const take = (c: Clause | undefined) => {
    if (c && c !== right && !decoys.includes(c) && decoys.length < 3) decoys.push(c);
  };
  if (repeats.length && rng() < 0.3) take(repeats[0]);
  for (const c of elsewhere) take(c);
  for (const c of tempting) take(c);
  for (const c of plain) take(c);
  for (const c of decoys) shown.set(c.text, seen(c) + 1);
  return { pos, options: shuffle([right, ...decoys], rng), correct: [right.text] };
}

/** The guest's line: a fresh one with the 令字 at `pos` (or null — the guest is stumped). */
export function computerLine(ch: string, pos: number, used: ReadonlySet<string>, rng: Rng): Clause | null {
  const fresh = linesWith(ch).filter((c) => !used.has(c.text) && fitsPlace(c.text, ch, pos));
  if (!fresh.length) return null;
  return fresh[Math.floor(rng() * fresh.length)];
}

/** A new 令字 different from the ones already played, preferring ones with lines to spare. */
export function drawLing(played: readonly string[], used: ReadonlySet<string>, rng: Rng): string {
  const pool = LING.filter((l) => !played.includes(l.ch) && linesWith(l.ch).filter((c) => !used.has(c.text)).length >= 4);
  const from = pool.length ? pool : LING;
  return from[Math.floor(rng() * from.length)].ch;
}

/** Split a line around the 令字 for highlighting. */
export function splitOn(text: string, ch: string): { t: string; hit: boolean }[] {
  const out: { t: string; hit: boolean }[] = [];
  text.split(ch).forEach((part, i) => {
    if (i) out.push({ t: ch, hit: true });
    if (part) out.push({ t: part, hit: false });
  });
  return out;
}

/** Split a line for display, marking only the 令字 that stands at `pos` (1-based). */
export function markAt(text: string, pos: number): { t: string; hit: boolean }[] {
  const out: { t: string; hit: boolean }[] = [];
  let n = 0;
  let buf = '';
  for (const c of text) {
    if (c !== '、') n++;
    if (c !== '、' && n === pos) {
      if (buf) out.push({ t: buf, hit: false });
      out.push({ t: c, hit: true });
      buf = '';
    } else buf += c;
  }
  if (buf) out.push({ t: buf, hit: false });
  return out;
}

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
/** 3 → 「三」. */
export const cnNum = (n: number) => CN_NUM[n] ?? String(n);
