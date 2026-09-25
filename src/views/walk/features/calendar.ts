// Which festival easter eggs apply on a date. Pure (no DOM, no three.js) so it is unit-tested.
// Lunar dates and solar-term days follow the almanac (China time), read from the date's local Y/M/D.
import { toLunar } from '../../../core/lunar';
import { termOnDay } from '../../../core/solarterms';
import type { FestivalKey } from '../types';

/** Every festival with an easter egg, in calendar order (for the preview picker). */
export const FESTIVALS: { key: FestivalKey; zh: string; en: string }[] = [
  { key: 'newyear', zh: '元旦', en: "New Year's Day" },
  { key: 'spring', zh: '春节', en: 'Spring Festival' },
  { key: 'lantern', zh: '元宵', en: 'Lantern Festival' },
  { key: 'qingming', zh: '清明', en: 'Qingming' },
  { key: 'dragonboat', zh: '端午', en: 'Dragon Boat Festival' },
  { key: 'qixi', zh: '七夕', en: 'Qixi' },
  { key: 'midautumn', zh: '中秋', en: 'Mid-Autumn Festival' },
  { key: 'chongyang', zh: '重阳', en: 'Double Ninth' },
  { key: 'dongzhi', zh: '冬至', en: 'Winter Solstice' },
  { key: 'laba', zh: '腊八', en: 'Laba' },
];

/** The festivals whose easter eggs apply on this date (its local calendar day). */
export function festivalsOn(date: Date): FestivalKey[] {
  const out: FestivalKey[] = [];
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  if (m === 0 && d === 1) out.push('newyear');
  const l = toLunar(date);
  const md = l.leap ? 0 : l.month * 100 + l.day;
  // 春节: 除夕 (the eve — tomorrow is 正月初一) through 初三.
  const tomorrow = toLunar(new Date(y, m, d + 1));
  const eve = !tomorrow.leap && tomorrow.month === 1 && tomorrow.day === 1;
  if (eve || (md >= 101 && md <= 103)) out.push('spring');
  if (md === 115) out.push('lantern');
  const term = termOnDay(date);
  if (term?.index === 4) out.push('qingming');
  if (md === 505) out.push('dragonboat');
  if (md === 707) out.push('qixi');
  if (md >= 814 && md <= 816) out.push('midautumn');
  if (md === 909) out.push('chongyang');
  if (term?.index === 21) out.push('dongzhi');
  if (md === 1208) out.push('laba');
  return out;
}

/** Dev/preview override: ?fest=midautumn (or a comma list) replaces the real calendar. */
export function festivalOverride(): FestivalKey[] | null {
  try {
    const v = new URLSearchParams(location.search).get('fest');
    if (v === null) return null;
    const keys = new Set(FESTIVALS.map((f) => f.key));
    return v.split(',').map((s) => s.trim()).filter((s): s is FestivalKey => keys.has(s as FestivalKey));
  } catch {
    return null;
  }
}
