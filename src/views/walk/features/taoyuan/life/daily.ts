// 桃源 · 二期: the valley's day — every daily pick (spec §5, §6.1) and the 今日谷中 board made from them.
// Pure (no DOM, no three.js): the tests import it, and the games (G) read today's twists here, so the
// board, 小满's news and the games always agree. Everything is `pickDaily(list, day, salt)`.
//
// Owner: L. G: read the picks from here (songOfDay, waterOfDay, leavesOfDay, draughtOfDay, kingOfDay,
// flowOfDay, seatsOfDay, lingOfDay, yueOfDay, YUE); never re-roll them with other salts.
import type { FestivalKey } from '../../../types';
import { pickDaily } from '../../npcs/logic';
import { playableLing } from '../../minigames/logic';
import { FESTIVALS } from '../../calendar';
import { fromKey } from '../../../../../core/date';
import { hashString, makeRng } from '../../../../../core/rng';
import { lunarDayName, lunarMonthName, toLunar } from '../../../../../core/lunar';
import type { Line } from '../text';
import type { VillagerKey } from '../hooks';
import { GAME_IDS, SONG_IDS } from './keys';
import { SEASON_DISH as FOOD_SEASON_DISH } from './food';
import { festivalDish as tableFestivalDish } from './table-logic';
import type { DishId, GameId, Part, Season, SongId } from './types';
import { BOARD, GEGU_COUNT, GEGU_LINES, GUINIANG_WHERE, NEWS, PART_NAME } from './life-text';

const t = (zh: string, en: string): Line => ({ zh, en });

// ───────────────────────────── 踩曲 · the 号子 of the day (always open that day)

export const SONG_NAMES: Record<SongId, Line> = {
  qizao: t('起早', 'Up Early'),
  caiqu: t('踩曲', 'Treading the Yeast'),
  gane: t('赶鹅', 'Driving the Geese'),
  shoushu: t('收黍', 'Millet Harvest'),
  huazhao: t('花朝', "Flowers' Birthday"),
};
export const songOfDay = (day: string): SongId => pickDaily(SONG_IDS, day, 'tyl:qu');

// ───────────────────────────── 摸鱼 · the water

export type Water = 'qing' | 'hua' | 'hun';
export const WATER_NAMES: Record<Water, Line> = { qing: t('清', 'clear'), hua: t('花', 'petals'), hun: t('浑', 'murky') };
export const waterOfDay = (day: string): Water => pickDaily(['qing', 'hua', 'hun'] as const, day, 'tyl:water');

// ───────────────────────────── 采桑 · the leaves, and which tray sleeps first

export type Leaves = 'nen' | 'lao' | 'yu';
export const LEAVES_NAMES: Record<Leaves, Line> = {
  nen: t('嫩叶多', 'mostly tender leaves'),
  lao: t('老叶多', 'mostly old leaves'),
  yu: t('雨后湿叶多', 'wet leaves after rain'),
};
export const leavesOfDay = (day: string): Leaves => pickDaily(['nen', 'lao', 'yu'] as const, day, 'tyl:leaves');
/** The tray (0–3) whose worms sleep first. */
export const sleeperOfDay = (day: string): number => pickDaily([0, 1, 2, 3] as const, day, 'tyl:sleep');

// ───────────────────────────── 纸鸢 · the cave's breath (with the weather outside)

export type Draught = 'huan' | 'ji' | 'zhen';
export const DRAUGHT_NAMES: Record<Draught, { word: Line; outside: Line }> = {
  huan: { word: t('缓', 'gentle'), outside: t('山外晴', 'fair outside') },
  ji: { word: t('急', 'strong'), outside: t('山外有雨', 'rain outside') },
  zhen: { word: t('阵', 'gusty'), outside: t('山外起风', 'wind outside') },
};
export const draughtOfDay = (day: string): Draught => pickDaily(['huan', 'ji', 'zhen'] as const, day, 'tyl:draught');

// ───────────────────────────── 捉萤 · the 萤王's code

export const KING_CODES: readonly Line[] = [
  t('三长一短', 'three long, one short'),
  t('两短一长', 'two short, one long'),
  t('长长短', 'long, long, short'),
  t('短短短长', 'short, short, short, long'),
];
/** The index into KING_CODES. */
export const kingOfDay = (day: string): number => pickDaily([0, 1, 2, 3] as const, day, 'tyl:king');

// ───────────────────────────── 流觞 · the flow, the seating, the 令

export type Flow = 'slow' | 'normal' | 'fast';
export const FLOW_NAMES: Record<Flow, Line> = { slow: t('水缓', 'slow water'), normal: t('水平', 'steady water'), fast: t('水急', 'fast water') };
/** The flow's speed (m/s) along the channel (spec §5.6). */
export const FLOW_SPEED: Record<Flow, number> = { slow: 0.28, normal: 0.35, fast: 0.45 };
export const flowOfDay = (day: string): Flow => pickDaily(['slow', 'normal', 'fast'] as const, day, 'tyl:flow');
/** Who may be seated at the bays (five a day; everyone present on a festival). */
export const CUP_GUESTS: readonly VillagerKey[] = ['duer', 'guiniang', 'shigu', 'liupo', 'gegu', 'lusan', 'xiaoman'];
/** The five seated today, in bay order. */
export function seatsOfDay(day: string): VillagerKey[] {
  const rng = makeRng(hashString(`${day}:tyl:seats`));
  const pool = [...CUP_GUESTS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 5);
}
/** Today's 令 character (飞花令 at your own bay). */
export function lingOfDay(day: string): string {
  const all = playableLing(5);
  return all.length ? pickDaily(all, day, 'tyl:ling') : '花';
}

// ───────────────────────────── 今日之约 · one game a day, a villager's posted target

export const yueOfDay = (day: string): GameId => pickDaily(GAME_IDS, day, 'tyl:yue');

export interface Yue {
  game: GameId;
  /** Who posted it. */
  by: VillagerKey;
  /** What to beat (踩曲 score, fish, trays spinning, 尺, fireflies, cups stopped right). */
  target: number;
  line: Line;
}

/** Today's 今日之约 (its line names today's 号子, the water, the leaves). */
export function yueFor(day: string): Yue {
  const game = yueOfDay(day);
  switch (game) {
    case 'qu': {
      const s = SONG_NAMES[songOfDay(day)];
      return { game, by: 'duer', target: 160, line: t(`今天《${s.zh}》，我杜二踩了一百六。踩过我，这碗我请！`, `Today it's '${s.en}'. I, Du Er, scored a hundred and sixty. Beat that and the bowl's on me!`) };
    }
    case 'mo':
      return { game, by: 'ashu', target: 7, line: t('我摸了七条。不服来比。', 'I got seven. Beat that.') };
    case 'can': {
      const l = leavesOfDay(day);
      const zh = l === 'yu' ? '今天叶子湿，手要快。' : l === 'lao' ? '今天老叶多，挑着喂。' : '叶子嫩，蚕吃得快，手要勤。';
      const en = l === 'yu' ? 'The leaves are wet today, so be quick.' : l === 'lao' ? "There's a lot of old leaf today. Pick what you feed them." : "The leaves are tender and the worms eat fast. Keep your hands busy.";
      return { game, by: 'sang', target: 4, line: t(`${zh}四盘都上簇，我请你吃糕。`, `${en} Get all four trays spinning and the cake's on me.`) };
    }
    case 'yuan':
      return { game, by: 'xiaoman', target: 250, line: t('我的飞了两百五十尺！……差不多两百五十。', 'Mine went two hundred and fifty feet! …About two hundred and fifty.') };
    case 'ying':
      return { game, by: 'ashu', target: 30, line: t('三十只。', 'Thirty.') };
    case 'shang': {
      const f = flowOfDay(day);
      const zh = f === 'fast' ? '今天水急。' : f === 'slow' ? '今天水慢。' : '今天水不急。';
      const en = f === 'fast' ? "The water's fast today." : f === 'slow' ? "The water's slow today." : "The water's easy today.";
      return { game, by: 'qin', target: 4, line: t(`${zh}五觞能停对四觞，我在簿子上给你记一笔。`, `${en} Stop four of the five right and I'll write it in the register.`) };
    }
  }
}

// ───────────────────────────── the season's dish, a festival's

/** The seasonal dish 桂娘 cooks for the outside season you walk in with (food.ts, F's). */
export const SEASON_DISH: Record<Season, DishId> = FOOD_SEASON_DISH;
/** The part the seasonal dish is on (艾糕 at 昼; the rest at 暮). */
export const SEASON_PART: Record<Season, Part> = { spring: 'day', summer: 'dusk', autumn: 'dusk', winter: 'dusk' };

/**
 * A festival's 暮 席 dish (spec §3.4): 中秋 桂花糖芋 · 冬至 菌子羹 · 端午 荷叶饭 · 春节 and 元宵 新糕 (with
 * red dots); any other festival serves the season's dish. One mapping: the table's (table-logic.ts).
 */
export const festivalDish: (f: FestivalKey, season: Season) => DishId = tableFestivalDish;

/** A festival's names. */
export function festivalName(f: FestivalKey): Line {
  const x = FESTIVALS.find((y) => y.key === f);
  return x ? t(x.zh, x.en) : t('节', 'a festival');
}

/** 秦's question: the real festival and two others, shuffled (the same all day). Returns [choices, right index]. */
export function festivalChoices(real: FestivalKey, day: string): { keys: FestivalKey[]; right: number } {
  const rng = makeRng(hashString(`${day}:tyl:jie`));
  const others = FESTIVALS.map((f) => f.key).filter((k) => k !== real);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const keys = [real, others[0], others[1]];
  for (let i = keys.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return { keys, right: keys.indexOf(real) };
}

// ───────────────────────────── 葛姑's petals

const CN = '零一二三四五六七八九';
/** 4000–4299 in Chinese numerals: 四千一百零三, 四千零二十, 四千二百. */
export function cnThousands(n: number): string {
  const q = Math.floor(n / 1000), b = Math.floor((n % 1000) / 100), s = Math.floor((n % 100) / 10), g = n % 10;
  let out = CN[q] + '千';
  if (b) out += CN[b] + '百';
  if (!b && (s || g)) out += '零';
  if (s) out += CN[s] + '十';
  else if (b && g) out += '零';
  if (g) out += CN[g];
  return out;
}
/** Last night's petals (4000 + the day's hash mod 300). */
export const petalsOfDay = (day: string): number => 4000 + (hashString(`${day}:tyl:petals`) % 300);

// ───────────────────────────── the board

export interface Board {
  title: Line;
  /** The register's rows, in order. */
  rows: Line[];
  /** The picks named on it (tests; 小满's news). */
  picks: { song: SongId; water: Water; leaves: Leaves; draught: Draught; king: number; flow: Flow; seats: VillagerKey[]; ling: string; yue: Yue; petals: number; gegu: number };
}

/** Villager names for the board (the plain names: the board is 秦's register). */
const NAMES: Partial<Record<VillagerKey, Line>> = {
  qin: t('秦', 'Qin'), duer: t('杜二', 'Du Er'), guiniang: t('桂娘', 'Gui Niang'), shigu: t('石瞽', 'Shi Gu'), liupo: t('柳婆', 'Liu Po'),
  gegu: t('葛姑', 'Ge Gu'), lusan: t('鲁三', 'Lu San'), xiaoman: t('小满', 'Xiaoman'), ashu: t('阿黍', 'A Shu'), sang: t('三娘', 'Sanniang'),
};
const nameOf = (k: VillagerKey): Line => NAMES[k] ?? t(k, k);

const MONTH_EN = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
const ord = (n: number) => (n % 10 === 1 && n !== 11 ? `${n}st` : n % 10 === 2 && n !== 12 ? `${n}nd` : n % 10 === 3 && n !== 13 ? `${n}rd` : `${n}th`);

/**
 * The 今日谷中 board for a day (a DateKey), written as 秦's register page. `o.festival`: today's
 * festival outside, if any; `o.season`: the outside season; `o.dish`: the season's (or festival's)
 * dish name as the table names it.
 */
export function boardFor(day: string, o: { season: Season; festival?: FestivalKey | null; dishName?: Line | null }): Board {
  const song = songOfDay(day), water = waterOfDay(day), leaves = leavesOfDay(day), draught = draughtOfDay(day);
  const king = kingOfDay(day), flow = flowOfDay(day), seats = seatsOfDay(day), ling = lingOfDay(day), yue = yueFor(day);
  const petals = petalsOfDay(day);
  const gegu = pickDaily(GEGU_LINES.map((_, i) => i), day, 'tyl:gegu');
  let lunar: { month: number; day: number; leap: boolean } | null = null;
  try { lunar = toLunar(fromKey(day)); } catch { lunar = null; }
  const date = lunar ? t(`${lunarMonthName(lunar.month, lunar.leap)}${lunarDayName(lunar.day)}`, `${ord(lunar.day)} day of the ${MONTH_EN[lunar.month - 1]} month`) : t(day, day);
  const title = t(`${BOARD.title.zh} · ${date.zh}`, `${BOARD.title.en} · ${date.en}`);
  const rows: Line[] = [];
  const part = o.festival ? 'dusk' : SEASON_PART[o.season];
  const dish = o.dishName ?? null;
  if (dish) rows.push(t(`${BOARD.season.zh}：${dish.zh}（${PART_NAME[part].zh}，${GUINIANG_WHERE[part].zh}）`, `${BOARD.season.en}: ${dish.en} (${PART_NAME[part].en}, ${GUINIANG_WHERE[part].en})`));
  const s = SONG_NAMES[song], d = DRAUGHT_NAMES[draught];
  rows.push(t(
    `${BOARD.song.zh}：《${s.zh}》 · ${BOARD.water.zh}：${WATER_NAMES[water].zh} · ${BOARD.draught.zh}：${d.word.zh}（${d.outside.zh}） · ${BOARD.worms.zh}：${LEAVES_NAMES[leaves].zh}`,
    `${BOARD.song.en}: '${s.en}' · ${BOARD.water.en}: ${WATER_NAMES[water].en} · ${BOARD.draught.en}: ${d.word.en} (${d.outside.en}) · ${BOARD.worms.en}: ${LEAVES_NAMES[leaves].en}`,
  ));
  const who = seats.map(nameOf);
  rows.push(t(
    `${BOARD.cups.zh}：${who.map((w) => w.zh).join(' ')} · ${FLOW_NAMES[flow].zh} · ${BOARD.ling.zh}「${ling}」 · ${BOARD.king.zh}：${KING_CODES[king].zh}`,
    `${BOARD.cups.en}: ${who.map((w) => w.en).join(', ')} · ${FLOW_NAMES[flow].en} · ${BOARD.ling.en} 「${ling}」 · ${BOARD.king.en}: ${KING_CODES[king].en}`,
  ));
  const y = nameOf(yue.by);
  rows.push(t(`${BOARD.yue.zh}：${y.zh}「${yue.line.zh}」`, `${BOARD.yue.en}: ${y.en}: "${yue.line.en}"`));
  const c = GEGU_COUNT(cnThousands(petals), petals.toLocaleString('en-US'));
  const gl = GEGU_LINES[gegu];
  rows.push(t(`${BOARD.gegu.zh}：「${c.zh}${gl.zh}」`, `${BOARD.gegu.en}: "${c.en} ${gl.en}"`));
  return { title, rows, picks: { song, water, leaves, draught, king, flow, seats, ling, yue, petals, gegu } };
}

/** 小满's news at the mouth: the line that matches today's board (the festival's on a festival day). */
export function newsOf(day: string, festival: boolean): Line {
  if (festival) return NEWS[7];
  const g = yueOfDay(day);
  const i = g === 'mo' ? 0 : g === 'qu' ? 2 : g === 'yuan' ? 3 : g === 'shang' ? 5 : g === 'can' ? 6
    : draughtOfDay(day) !== 'huan' ? 3 : pickDaily([1, 4] as const, day, 'tyl:news');
  return NEWS[i];
}

/** The part after this one (歇一歇): 晨 → 昼 → 暮 → 夜 → 晨. */
export const NEXT_PART: Record<Part, Part> = { dawn: 'day', day: 'dusk', dusk: 'night', night: 'dawn' };
/** 歇一歇's representative hours (at 20 小满 is still up for 捉萤). */
export const REST_HOURS: Record<Part, number> = { dawn: 6, day: 12, dusk: 18, night: 20 };
