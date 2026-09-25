// Pure helpers for the quest book (no DOM): counts, grouping, where to go for a quest, dates,
// seal styles and the brush-stroke outline used by the progress bars.
import { CHARACTER, CHARACTERS, type CharacterId } from '../../data/characters';
import { QUESTS, type QuestDef } from '../../data/quests';
import type { PlayState } from '../../app/play';
import type { Route } from '../../app/router';
import type { DateKey } from '../../core/types';
import { hashString, makeRng } from '../../core/rng';
import { fromKey } from '../../core/date';
import { toLunar } from '../../core/lunar';

export type Lang = 'zh' | 'en';

export const COMPANION_QUESTS: QuestDef[] = QUESTS.filter((q) => 'character' in q.reward);
export const SEAL_QUESTS: QuestDef[] = QUESTS.filter((q) => 'seal' in q.reward);

export function isUnlocked(id: CharacterId, p: PlayState): boolean {
  const c = CHARACTER[id];
  return !!c && (c.unlock === 'default' || !!p.done[c.unlock]);
}

export function companionCount(p: PlayState): number {
  return CHARACTERS.filter((c) => isUnlocked(c.id, p)).length;
}

export function sealCount(p: PlayState): number {
  return SEAL_QUESTS.filter((q) => p.done[q.id]).length;
}

export function questsDone(p: PlayState): number {
  return QUESTS.filter((q) => p.done[q.id]).length;
}

/** "同伴 4/13 · 印 2" / "Companions 4/13 · Seals 2". */
export function statText(p: PlayState, lang: Lang): string {
  const n = companionCount(p), s = sealCount(p);
  return lang === 'zh' ? `同伴 ${n}/${CHARACTERS.length} · 印 ${s}` : `Companions ${n}/${CHARACTERS.length} · Seals ${s}`;
}

/** The text carved on a finished quest's stamp: the seal itself, or the companion's name. */
export function stampText(q: QuestDef): string {
  if ('seal' in q.reward) return q.reward.seal;
  return CHARACTER[q.reward.character]?.zh ?? '讫';
}

export interface SealLook { style: 'bai' | 'zhu'; shape: 'square' | 'round' | 'oval' }

const LOOKS: Record<string, SealLook> = {
  十中: { style: 'bai', shape: 'square' },
  莲心: { style: 'zhu', shape: 'round' },
  寄愿: { style: 'zhu', shape: 'oval' },
  登高: { style: 'bai', shape: 'square' },
  灵蛇: { style: 'zhu', shape: 'square' },
  巧思: { style: 'bai', shape: 'round' },
  国手: { style: 'zhu', shape: 'square' },
  毕: { style: 'zhu', shape: 'square' },
};

/** A stable, varied look for each seal (like a real 印谱: mostly square, a few leisure seals). */
export function sealLook(text: string): SealLook {
  const fixed = LOOKS[text];
  if (fixed) return fixed;
  const h = hashString('look:' + text);
  const style = h % 2 ? 'zhu' : 'bai';
  const r = (h >>> 3) % 7;
  const shape = r === 0 ? 'round' : r === 1 ? 'oval' : 'square';
  return { style, shape: Array.from(text).length > 2 && shape === 'round' ? 'square' : shape };
}

/** Where to go to work on a quest (or an errand), if anywhere. */
export function routeForKey(key: string): Route | null {
  if (key === 'incense') return 'focus';
  if (key === 'streak') return 'garden';
  if (key === 'boardgame' || key === 'win:club') return 'games';
  if (key === 'win:xiangqi-master') return 'xiangqi';
  if (key === 'feihua') return 'feihua';
  if (key.startsWith('klotski')) return 'klotski';
  if (key === 'snake' || key === 'blossom') return 'snake';
  if (key === 'tangram') return 'tangram';
  if (key === 'companions') return null;
  // everything else happens inside the painting: water, fish, cat, bell, summit, visits, lotus…
  return 'walk';
}

export function routeForQuest(q: QuestDef): Route | null {
  const g = q.goal;
  switch (g.kind) {
    case 'counter':
    case 'best':
    case 'flag': return routeForKey(g.key);
    case 'flags': return 'walk';
    case 'streak': return 'garden';
    case 'incense': return 'focus';
    case 'companions': return null;
  }
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK_ZH = '日一二三四五六';
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The day a quest was finished: "9月25日" / "25 Sep 2026". */
export function doneDate(k: DateKey, lang: Lang): string {
  const d = fromKey(k);
  if (Number.isNaN(d.getTime())) return '';
  return lang === 'zh' ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : `${d.getDate()} ${MONTHS_EN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Today's heading: "八月初四 · 周五" / "Friday, 25 Sep". */
export function dayHeading(k: DateKey, lang: Lang): string {
  const d = fromKey(k);
  if (Number.isNaN(d.getTime())) return '';
  if (lang === 'en') return `${WEEK_EN[d.getDay()]}, ${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
  try {
    const l = toLunar(d);
    return `${l.monthName}${l.dayName} · 周${WEEK_ZH[d.getDay()]}`;
  } catch {
    return `${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEK_ZH[d.getDay()]}`;
  }
}

/** Chinese numerals for small counts (一方, 二方…). */
export function cnCount(n: number): string {
  const D = '〇一二三四五六七八九十';
  if (n <= 10) return D[n];
  if (n < 20) return '十' + D[n - 10];
  return String(n);
}

/**
 * The outline of one horizontal brush stroke in a W × H box, as an SVG path: a heavy, slightly
 * blotted start (起笔), a body that breathes, and a tapering end (收笔). Deterministic per seed.
 */
export function brushOutline(seed: number, W = 200, H = 12): string {
  const rng = makeRng(seed || 1);
  const n = 26;
  const top: [number, number][] = [];
  const bot: [number, number][] = [];
  const phase = rng() * 6;
  const maxHw = H * 0.4;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = 3 + (W - 6) * k;
    const blot = 0.34 * Math.exp(-(((k - 0.025) / 0.05) ** 2));
    const taper = 0.62 * Math.max(0, (k - 0.72) / 0.28) ** 1.6;
    const breathe = 0.06 * Math.sin(k * 9 + phase);
    const hw = maxHw * (0.74 + blot - taper + breathe) * (0.94 + 0.1 * rng());
    const mid = H / 2 + Math.sin(k * 2.6 + phase) * H * 0.05;
    top.push([x, mid - hw * (0.95 + 0.1 * rng())]);
    bot.push([x, mid + hw * (0.9 + 0.12 * rng())]);
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(top[0][0])} ${f(top[0][1])}`;
  for (let i = 1; i < top.length; i++) d += `L${f(top[i][0])} ${f(top[i][1])}`;
  // a pointed, slightly lifted tip
  const [ex, ey] = top[top.length - 1];
  const [bx, by] = bot[bot.length - 1];
  d += `Q${f(ex + 3)} ${f((ey + by) / 2 - 0.4)} ${f(bx)} ${f(by)}`;
  for (let i = bot.length - 2; i >= 0; i--) d += `L${f(bot[i][0])} ${f(bot[i][1])}`;
  // a round, pressed-in start
  const [sx, sy] = top[0];
  d += `Q${f(sx - 3.2)} ${f((sy + bot[0][1]) / 2)} ${f(sx)} ${f(sy)}Z`;
  return d;
}

/** 正 tally strokes (five per character), in a 20 × 20 box, in writing order. */
export const ZHENG_STROKES: string[] = [
  'M3.4 3.6 Q10 2.6 16.8 3.4',   // 一 top
  'M10.1 3.8 Q10.4 10.5 10 17',  // 丨 centre
  'M10.6 10 Q13.2 9.6 15.4 9.9', // short 一, right
  'M5.2 9.2 Q5.5 13.4 5.1 16.6', // 丨 left
  'M2.2 17.2 Q10 16.4 17.9 17',  // 一 bottom
];

/** How to split a target into 正 glyphs: stroke counts per glyph (e.g. 7 → [5, 2]). */
export function tallyGlyphs(target: number): number[] {
  const t = Math.max(1, Math.min(30, Math.round(target)));
  const out: number[] = [];
  for (let left = t; left > 0; left -= 5) out.push(Math.min(5, left));
  return out;
}

/** Set by the celebration's 「翻看印谱」 so the quest book scrolls to the album when it opens. */
export const albumRequest = { pending: false };
