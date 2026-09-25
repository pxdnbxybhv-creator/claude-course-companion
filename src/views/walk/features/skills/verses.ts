// Which line of verse fits here and now: the poet's drifting verses, his 斗酒 swirl and the scholar's
// 题诗 all draw from src/data/poems.ts through a VerseDeck. A poem is chosen for the place (a plum
// poem on Plum Ridge, lotus on the lake, the temple bell up the mountain), the season (no snow in
// summer) and the hour (the moon by night, the dawn at dawn); its clauses come in reading order, the
// deck never repeats a line twice in a row, and it keeps a memory of recent poems so it cycles
// widely. Pure logic (no DOM, no three.js): tested in tests/skills.test.ts.
import { POEMS, type Poem, type Season } from '../../../../data/poems';
import type { RegionId } from '../../map';
import { makeRng, type Rng } from '../../../../core/rng';

export interface VersePlace {
  region: RegionId | null;
  season: Season;
  /** Local hour 0..24. */
  hour: number;
  /** The sky is dark (the time switch may force night at noon). Defaults to the hour. */
  night?: boolean;
}

export interface VerseLine {
  /** One clause, Han characters only (e.g. 疏影横斜水清浅). */
  text: string;
  poem: Poem;
  /** Index of the clause within the poem. */
  at: number;
  /** How many clauses the poem has (the ones a deck shows). */
  of: number;
}

const HAN = /\p{Script=Han}/u;

/** A poem's clauses, split at its punctuation; only those of 3–9 characters are shown. */
export function clausesOf(p: Poem): string[] {
  const out: string[] = [];
  for (const line of p.lines) {
    for (const piece of line.split(/[，。？！；、：,.?!;:\s]+/u)) {
      const han = [...piece].filter((ch) => HAN.test(ch)).join('');
      const n = [...han].length;
      if (n < 3 || n > 9) continue;
      if (out[out.length - 1] === han) continue; // 争渡，争渡
      out.push(han);
    }
  }
  return out;
}

/** Words that tie a poem to a place of the walk. */
const REGION_WORDS: Record<RegionId, string> = {
  garden: '园庭池塘阶院花圃檐窗砚方塘',
  village: '桥家村酒市巷楼灯船舟人家杏茶店',
  lake: '荷莲藕湖舟鱼鸥鹭芙蓉塘渡船',
  bamboo: '竹篁琴幽林啸',
  plum: '梅雪香岭疏影寒',
  mountain: '山寺钟云松僧泉峰磬石涧',
  home: '田园屋庐归豆锄宅草屋柴门桑麻篱',
};
const REGION_PLANT: Partial<Record<RegionId, string>> = { plum: 'plum', bamboo: 'bamboo', lake: 'lotus', mountain: 'pine', home: 'chrysanthemum' };
const ROAD_WORDS = '路行客归马径驿';

const SEASON_WORDS: Record<Season, string> = {
  spring: '春杏柳燕桃花雨莺',
  summer: '荷莲蝉蛙夏麦熏',
  autumn: '秋菊霜枫桂雁露',
  winter: '雪梅寒冰冬炉',
};
/** Words that clash with a season (snow in summer, lotus in winter). */
const OFF_SEASON: Record<Season, string> = {
  spring: '雪冰枫菊',
  summer: '雪冰寒梅菊枫',
  autumn: '春杏燕冰',
  winter: '荷莲蝉蛙杏燕',
};

type Hour = 'dawn' | 'day' | 'dusk' | 'night';
export function hourKind(hour: number, night?: boolean): Hour {
  const h = ((hour % 24) + 24) % 24;
  if (night === true) return h >= 4.5 && h < 7 ? 'dawn' : 'night';
  if (night === false) return h >= 4.5 && h < 8 ? 'dawn' : h >= 17 && h < 20.5 ? 'dusk' : 'day';
  if (h >= 4.5 && h < 7.5) return 'dawn';
  if (h >= 17 && h < 19.5) return 'dusk';
  if (h >= 19.5 || h < 4.5) return 'night';
  return 'day';
}
const HOUR_WORDS: Record<Hour, string> = {
  dawn: '晓晨朝初阳鸡曙旦',
  day: '日昼晴午',
  dusk: '暮夕晚黄昏斜残阳归',
  night: '月夜灯星烛眠宿',
};

const count = (text: string, words: string) => {
  let n = 0;
  for (const ch of words) if (text.includes(ch)) n++;
  return n;
};

/** How well a poem suits a place and moment (higher is better; may be negative). */
export function scorePoem(p: Poem, place: VersePlace): number {
  const text = p.lines.join('');
  const clauses = clausesOf(p);
  if (!clauses.length) return -99;
  let s = 1;
  // the season
  if (p.seasons?.length) s += p.seasons.includes(place.season) ? 2.5 : -4;
  else s += Math.min(2, count(text, SEASON_WORDS[place.season]) * 0.8);
  s -= Math.min(3, count(text, OFF_SEASON[place.season]) * 1.5);
  // the place
  let here = 0;
  if (place.region) {
    here += Math.min(4.5, count(text, REGION_WORDS[place.region]) * 1.5);
    const plant = REGION_PLANT[place.region];
    if (plant && p.plants?.includes(plant as never)) here += 3;
    if (place.region === 'garden' && (p.themes?.includes('garden') || p.plants?.length)) here += 1.5;
    if (place.region === 'lake' && p.themes?.includes('water')) here += 1.5;
  } else here += Math.min(2, count(text, ROAD_WORDS) * 1);
  s += here;
  // the hour
  const hk = hourKind(place.hour, place.night);
  const h = ((place.hour % 24) + 24) % 24;
  // a dawn poem (鸡声茅店月, 春眠不觉晓) belongs to the early hours (4-9 h) only: outside them it drops out
  if (p.themes?.includes('morning') && !(h >= 4 && h < 10 && hk !== 'night')) return -60;
  // by night the place leads: a night poem with no tie to where you stand gets only part of the
  // hour's pull, so each place opens with a night of its own rather than the same 夜雨 everywhere
  const nightPoem = !!(p.themes?.includes('night') || p.themes?.includes('moon'));
  const generic = hk === 'night' && place.region !== null && here === 0;
  s += Math.min(generic ? 1.2 : 3, count(text, HOUR_WORDS[hk]) * 1.2);
  if (hk === 'night' && nightPoem) s += generic ? 0.8 : 2.5;
  if ((hk === 'day' || hk === 'dawn') && p.themes?.includes('night')) s -= 2;
  if (hk === 'dawn' && p.themes?.includes('morning')) s += 2.5;
  // precepts and prose (勤学 sayings) read less like a walk's verse
  if (p.themes?.length === 1 && p.themes[0] === 'diligence') s -= 1.5;
  if (clauses.length === 1) s -= 0.5;
  return s;
}

/**
 * A deck of verse for one walker: next() gives the next clause to show. A poem's clauses come in
 * order (at most `perPoem` of them); then a new poem is drawn, weighted by how well it suits the
 * place and hour, never one of the last `memory` poems.
 */
export class VerseDeck {
  private rng: Rng;
  private recent: Poem[] = [];
  private poem: Poem | null = null;
  private clauses: string[] = [];
  private at = 0;
  private last = '';
  private placeKey = '';

  constructor(seed: number, private opts: { memory?: number; perPoem?: number } = {}) {
    this.rng = makeRng(seed >>> 0);
  }

  /** Choose a new poem for this place (not one of the recent ones). */
  pickPoem(place: VersePlace): Poem {
    const memory = Math.min(this.opts.memory ?? 18, Math.floor(POEMS.length / 3));
    const scored: { p: Poem; w: number }[] = [];
    let best = -Infinity;
    for (const p of POEMS) {
      if (this.recent.includes(p)) continue;
      const s = scorePoem(p, place);
      if (s <= -50) continue;
      scored.push({ p, w: s });
      if (s > best) best = s;
    }
    let pick: Poem;
    if (!scored.length) pick = POEMS[Math.floor(this.rng() * POEMS.length)];
    else {
      // favour the fitting ones steeply, but let anything decent come round now and then
      let total = 0;
      for (const c of scored) { c.w = Math.exp((c.w - best) / 1.3); total += c.w; }
      let r = this.rng() * total;
      pick = scored[scored.length - 1].p;
      for (const c of scored) { r -= c.w; if (r <= 0) { pick = c.p; break; } }
    }
    this.recent.push(pick);
    while (this.recent.length > memory) this.recent.shift();
    return pick;
  }

  /** The next clause for this place and moment. */
  next(place: VersePlace): VerseLine {
    const key = `${place.region}|${place.season}|${hourKind(place.hour, place.night)}`;
    const moved = key !== this.placeKey;
    this.placeKey = key;
    const per = this.opts.perPoem ?? 4;
    // a new place starts a new poem once the current couplet is complete
    if (!this.poem || this.at >= Math.min(per, this.clauses.length) || (moved && this.at % 2 === 0)) this.startPoem(place);
    let text = this.clauses[this.at];
    if (text === this.last) {
      // never the same line twice in a row
      this.at++;
      if (this.at >= this.clauses.length) this.startPoem(place);
      text = this.clauses[this.at];
    }
    const line: VerseLine = { text, poem: this.poem!, at: this.at, of: this.clauses.length };
    this.at++;
    this.last = text;
    return line;
  }

  /** A whole couplet (two clauses of one poem, or one if the poem is short), starting a new poem. */
  couplet(place: VersePlace): VerseLine[] {
    this.startPoem(place);
    const out: VerseLine[] = [];
    const start = this.clauses.length > 2 ? Math.floor(this.rng() * (this.clauses.length / 2)) * 2 : 0;
    for (let i = start; i < Math.min(this.clauses.length, start + 2); i++) {
      if (this.clauses[i] === this.last) continue;
      out.push({ text: this.clauses[i], poem: this.poem!, at: i, of: this.clauses.length });
      this.last = this.clauses[i];
    }
    if (!out.length) return this.couplet(place);
    this.at = this.clauses.length; // the next next() starts a fresh poem
    return out;
  }

  private startPoem(place: VersePlace): void {
    for (let tries = 0; tries < 6; tries++) {
      const p = this.pickPoem(place);
      const c = clausesOf(p);
      if (!c.length) continue;
      this.poem = p;
      this.clauses = c;
      this.at = 0;
      if (c[0] === this.last && c.length > 1) this.at = 1;
      return;
    }
  }
}

/** Season from a month (1..12), northern hemisphere, by the solar terms' rough months. */
export function seasonOfMonth(m: number): Season {
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'autumn';
  return 'winter';
}

/**
 * The walk's season and night, shared with the poet's drifting verses (world/gifts.ts), which the
 * core builds without them: the skills feature fills this in when a world starts.
 */
export const verseEnv: { season: Season | null; forcedNight: boolean | null } = { season: null, forcedNight: null };
