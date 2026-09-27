// 桃源 · 二期「常住」: the phase-0 contracts (spec §11). Types only, no runtime: the ids of the dishes,
// the goods in kind (土产), the six games, the moods, and the LifeApi every builder's module is handed
// by life/index.ts. The flag and counter keys built from these ids are in keys.ts.
//
// Owners (spec §10): L writes this file; F (food), P (特写) and G (games) code against it. A change
// here is a change request to L.
import type { WorldCtx } from '../../../types';
import type { CharacterId } from '../../../../../data/characters';
import type { Bag } from '../../kit';
import type { TaoyuanWorld } from '../world';
import type { VillagerKey, VillagerPrompt } from '../hooks';
import type { Line } from '../text';
import type { Part } from '../folk';

export type { Line, Part, VillagerKey, VillagerPrompt };

// ───────────────────────────── ids (they go into saved keys: never rename one)

/** The 17 dishes (spec §3.5): 13 year-round, then the four seasonal ones (`s-`). */
export type DishId =
  | 'zhou' | 'bing' | 'gao' | 'tangbing' | 'jishu' | 'sunzu' | 'xinpei' | 'weiyu' | 'taocha'
  | 'zisu' | 'taojiao' | 'shengao' | 'zhiyu'
  | 's-aigao' | 's-heye' | 's-guiyu' | 's-junge';
/** The four seasonal dishes (桂娘 cooks the season you walk in with). */
export type SeasonDishId = Extract<DishId, `s-${string}`>;

/** The goods in kind, 土产 (spec §2): 鱼 桑葚 曲 鹅蛋 菌 黍. */
export type KindId = 'yu' | 'shen' | 'qu' | 'dan' | 'jun' | 'shu';

/** The six valley games, 谷中六戏 (spec §5): 踩曲 摸鱼 采桑喂蚕 纸鸢 捉萤 流觞. */
export type GameId = 'qu' | 'mo' | 'can' | 'yuan' | 'ying' | 'shang';

/** The five 号子 of 踩曲 (spec §5.1): 《起早》《踩曲》《赶鹅》《收黍》《花朝》. */
export type SongId = 'qizao' | 'caiqu' | 'gane' | 'shoushu' | 'huazhao';

/** The outside season (by solar term), as core/solarterms.ts seasonOfTerm names it. */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

// ───────────────────────────── in memory only (display glyphs as ids)

/** A dish's taste (spec §3.5): sets the companion's reaction and the mood. */
export type Taste = '热' | '甜' | '脆' | '酒' | '茶';
/** The 特写's camera category (spec §4.2). */
export type PvCat = '羹' | '蒸' | '炙' | '饮' | '凉';
/** The one mood of a visit (spec §3.8): 暖 from 热/脆, 甜 from 甜, 醺 from 酒, 定 from 茶 (clears 醺). Never saved. */
export type Mood = '暖' | '甜' | '醺' | '定';
/** A game round's grade (spec §5.0): 精 pays 2 土产. */
export type GameGrade = '初' | '熟' | '精';

/** The five who cook (spec §3.3). */
export type CookKey = Extract<VillagerKey, 'guiniang' | 'duer' | 'gegu' | 'sang' | 'ashu'>;

type XYZ = { x: number; y: number; z: number };
type XZ = { x: number; z: number };

// ───────────────────────────── a dish (F writes the data in food.ts; P and the 食单 read it)

/**
 * One dish, as food.ts DISHES holds it (spec §3.5). Lines are verbatim from the spec. F may add
 * fields in food.ts (an interface extending this); P reads only what is here.
 */
export interface Dish {
  id: DishId;
  /** The dish's name (brushed on the title card, the 食单 page). */
  zh: string;
  en: string;
  cook: CookKey;
  /** The parts of the day it is listed at (spec §3.4, before festival overrides). */
  parts: readonly Part[];
  /** Seasonal dishes: the outside season that brings it. */
  season?: Season;
  taste: Taste;
  pv: PvCat;
  /** Paid for with one of these even the first time (炙鱼 yu · 桑葚糕 shen · 新醅 qu or dan). */
  required?: readonly KindId[];
  /** The 亲手 kind: paying with it plays the 亲 beat and its line. */
  own?: KindId;
  /** The cook working, heard in the 特写 (line 1: what goes in and how long; line 2: the warning). */
  vo: readonly [Line, Line];
  /** The 亲手 line (the cook holds up your good). */
  ownLine?: Line;
  /** The only lyric text: at most 8 characters. */
  caption: Line;
  /** The 食单 note, in the player's plain voice. */
  note: Line;
  /** The missing-page text, in the cook's voice. */
  hint: Line;
}

// ───────────────────────────── the 特写 (P's pv.ts plays it; F's table calls it)

/** How much of the 特写 plays (spec §4.4): the whole thing, the 3.2 s cut (题 + 尝), or the emote and a card. */
export type PvMode = 'full' | 'short' | 'none';

/** Where the 特写 films (spec §3.3; the table picks it): the cook at the station, the walker at the seat. */
export interface PvPlace {
  cook: CookKey;
  /** 起 is filmed here (world): the stove, the counter, the brazier… */
  station: XYZ;
  /** Where the cook faces while working (world); default: the seat. */
  stationFace?: XZ;
  /** 落 → 尝: where the dish is set and the walker sits (world). */
  seat: XYZ;
  /** What the walker faces at the seat (world); default: the station. */
  seatFace?: XZ;
}

export interface PVOpts {
  /** The first taste of this dish (the full 特写 under 头一回, the new-page toast, the sting's low note). */
  first: boolean;
  /** Paid with the dish's own good: the 亲 beat shows it (null: no 亲 beat). */
  own: KindId | null;
  mode: PvMode;
  /** Where to film; null or absent: at the walker, where they stand (留一碗's 3.2 s cut). */
  at?: PvPlace | null;
  /** A seasonal dish: the outside season, for the 外 shot's 「山外 · 秋」. */
  season?: Season | null;
  /** 新醅's 醴 variant (道童, 玉兔): milky, no froth; the page is still 新醅's. */
  li?: boolean;
  /** (柳枝炙鱼's 亲手) the fish is a 鳜 from 摸鱼: the cook says the dish's `ownRare` line. */
  rare?: boolean;
  /** A festival serving (新糕 on red paper at the 春节 and 元宵 暮 席: table-logic festivalServing). */
  festival?: boolean;
  /** The reaction said in 尝 (the table picks the companion's line); null: none. */
  react?: Line | null;
}

// ───────────────────────────── the life API (life/index.ts makes one per world)

/**
 * What is running inside the `taoyuan-life` claim: the table's order and 特写, a game round, 歇一歇.
 * The claimant hands this to `life.claim()`; 出谷, the way out and dispose reach it here.
 */
export interface LifeActivity {
  /** What it is (出谷's question, DEV). */
  kind: 'table' | 'game' | 'rest' | 'bowl' | 'board';
  /** (a game round) which game: 石瞽 hears it on you afterwards (his echo). */
  game?: GameId;
  /**
   * 出谷 was asked while it runs. Settle it — a game asks 「这局不玩了？」 and stops the round with no
   * pay; a 特写 skips to its end — then resolve true to let the walker leave, false to stay.
   * It must not call life.release() itself before resolving true (index does it).
   */
  leaving(): Promise<boolean>;
  /** Stop at once, silently, with no pay (the walker left some other way, the world went). Idempotent. */
  stop(): void;
}

/** What a builder's module offers the valley's villagers (index merges every module's). */
export interface LifePart {
  /**
   * This villager's life prompt now (the table: 「吃点什么」 on a cook with something on), or null.
   * Asked only while life.open() and nothing holds the life claim. A villager with a life prompt
   * shows their speech mark.
   */
  prompt?(k: VillagerKey): VillagerPrompt | null;
  /** A line this villager says before their chat (石瞽's echoes, 夭夭's congee line), or null. */
  talkPrefix?(k: VillagerKey, who: CharacterId): Line | null;
  /** Extra DEV hooks, merged into window.__tylife. */
  dev?: Record<string, unknown>;
}

/**
 * A builder's module entry: called once per world by life/index.ts (after the story and the case),
 * with the feature's Bag (dispose everything through it) and the valley. Build 3D things in
 * `tv.onBuilt`, into `ctx.regionGroup('taoyuan')`.
 */
export type LifeMount = (bag: Bag, ctx: WorldCtx, tv: TaoyuanWorld, life: LifeApi) => LifePart | void;

export interface LifeApi {
  // ── goods in kind (play counters `tyl:got:<k>` and `tyl:used:<k>`; see keys.ts)
  /** Grant n of a kind; returns how many were kept (the jar holds 6; the rest is lost). */
  grant(kind: KindId, n: number): number;
  /** How many of a kind are held now: got − used (0…6). */
  stock(kind: KindId): number;
  /** Pay one of a kind (the table). False, and nothing recorded, if none is held. */
  use(kind: KindId): boolean;
  /** Today's daily count of a key (0 on a new day): `tyl:belly`, `tyl:play:<g>`… */
  today(key: string): number;
  /** Today, as a DateKey (for pickDaily). */
  day(): string;

  // ── this visit (memory only)
  /** The mood now, or null. Cleared on the way out. */
  mood(): Mood | null;
  /** Set (or clear) the mood (the last dish eaten; a 流觞 cup drunk sets 醺; 定 clears 醺 by replacing it). */
  setMood(m: Mood | null): void;
  /** The valley's part now: the painted hour (after 歇一歇, the valley's own). */
  part(): Part;
  /** The valley's hour now (0–24): the 歇一歇 hour, or the world's. */
  hour(): number;

  // ── the gate and the claim
  /** Everyday life may run now: lifeOpen(flags, a beat running) and the walker inside the valley. */
  open(): boolean;
  /** Take the `taoyuan-life` claim for this activity (minigames/ui begin); false if anything else holds one. */
  claim(a: LifeActivity): boolean;
  /** Give the claim back and restore() the world. Idempotent; ignores an activity that is not current. */
  release(a: LifeActivity): void;
  /** The activity holding the claim, or null. */
  current(): LifeActivity | null;
  /** Borrow a villager (story hooks' place); restore() gives every borrowed one back to their routine. */
  borrow(k: VillagerKey, at: { x: number; z: number; face?: XZ }): void;
  /** Something else for the next restore() to undo, once (a panel to remove, a theme to hand back). */
  defer(fn: () => void): void;
  /**
   * The one idempotent restore (spec §1): lens(null), setTimeScale(1), holdProp(null), freeze(false),
   * endCinematic, seeFocus cleared, borrowed villagers given back, the deferred undos. Runs on every
   * release, on the way out and on dispose; a second call with nothing new to undo does nothing.
   */
  restore(): void;
}
