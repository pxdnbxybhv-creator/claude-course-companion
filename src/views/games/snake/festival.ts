// Festival treats for 贪吃蛇: on a festival day the golden bonus becomes that day's food.
// 中秋 brings a mooncake and a full moon over the board. Lunar dates read the local calendar day.
// Preview any of them with ?fest=midautumn (same key names as the 入画 walk).
import { toLunar } from '../../../core/lunar';
import type { BonusKind } from './logic';

export interface SnakeFestival {
  key: 'midautumn' | 'dragonboat' | 'chongyang' | 'lantern' | 'spring';
  zh: string;
  en: string;
  bonus: BonusKind;
  /** Treat names for the toast. */
  treatZh: string;
  treatEn: string;
  /** English plural, written by hand (zongzi and tangyuan take no 's'). */
  treatsEn: string;
  moon?: boolean;
}

const FEST: Record<SnakeFestival['key'], SnakeFestival> = {
  midautumn: { key: 'midautumn', zh: '中秋', en: 'Mid-Autumn', bonus: 'mooncake', treatZh: '月饼', treatEn: 'mooncake', treatsEn: 'mooncakes', moon: true },
  dragonboat: { key: 'dragonboat', zh: '端午', en: 'Dragon Boat Festival', bonus: 'zongzi', treatZh: '粽子', treatEn: 'zongzi', treatsEn: 'zongzi' },
  chongyang: { key: 'chongyang', zh: '重阳', en: 'Double Ninth', bonus: 'chrysanthemum', treatZh: '菊花', treatEn: 'chrysanthemum', treatsEn: 'chrysanthemums' },
  lantern: { key: 'lantern', zh: '元宵', en: 'Lantern Festival', bonus: 'tangyuan', treatZh: '汤圆', treatEn: 'tangyuan', treatsEn: 'tangyuan' },
  spring: { key: 'spring', zh: '新春', en: 'Spring Festival', bonus: 'tangyuan', treatZh: '汤圆', treatEn: 'tangyuan', treatsEn: 'tangyuan' },
};

export function festivalFor(date: Date): SnakeFestival | null {
  const l = toLunar(date);
  if (l.leap) return null;
  const md = l.month * 100 + l.day;
  if (md >= 814 && md <= 816) return FEST.midautumn;
  if (md === 505) return FEST.dragonboat;
  if (md === 909) return FEST.chongyang;
  if (md === 115) return FEST.lantern;
  if (md >= 101 && md <= 103) return FEST.spring;
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const tomorrow = toLunar(new Date(y, m, d + 1));
  if (!tomorrow.leap && tomorrow.month === 1 && tomorrow.day === 1) return FEST.spring; // 除夕
  return null;
}

/** Today's festival, or the ?fest= override (an unknown or empty value turns festivals off). */
export function currentFestival(now = new Date()): SnakeFestival | null {
  try {
    const v = new URLSearchParams(location.search).get('fest');
    if (v !== null) {
      const k = v.split(',').map((s) => s.trim()).find((s) => s in FEST) as SnakeFestival['key'] | undefined;
      return k ? FEST[k] : null;
    }
  } catch {
    /* no location */
  }
  return festivalFor(now);
}
