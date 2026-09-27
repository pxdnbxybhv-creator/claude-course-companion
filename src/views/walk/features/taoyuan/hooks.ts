// The seam between the 桃源 story (story.ts, folk.ts) and its mystery (case*.ts): neither imports the
// other. The case module registers itself here when it loads; the story asks here.
//
//   story → case: start the case (B5 ①), resume a parked case, ask whether a villager's talk is the
//                 case's (a testimony, a confrontation), ask whether the judgement can be called.
//   case → story: say the case is solved (B6 plays), look up a villager's figure.
//   story → life:  (二期「常住」, life/index.ts) a villager's life prompt (「吃点什么」), whether 出谷 may
//                 go now, a line said before a villager's chat, whether life holds the claim.
//   life → story:  a villager's ordinary chat, everyone put in place for the hour, whether a beat runs.
import type { CharacterId } from '../../../../data/characters';
import type { Line } from './text';

/** The thirteen villagers (bible §7): `ty.<key>`. */
export type VillagerKey = 'qin' | 'xiaoman' | 'guiniang' | 'sang' | 'taoye' | 'ruan' | 'duer' | 'ashu' | 'liupo' | 'shigu' | 'lusan' | 'gegu' | 'yaoyao';

/** What the story lends the case: a villager's figure and where they stand now (world coordinates). */
export interface VillagerHandle {
  key: VillagerKey;
  /** The figure's root (a three.js Object3D), to face, move, or hang a mark on. */
  root: unknown;
  position(): { x: number; y: number; z: number };
  /** Put them somewhere (world x, z; y follows the floor) facing a point, or back on their routine (null). */
  place(at: { x: number; z: number; face?: { x: number; z: number } } | null): void;
}

/** A conversation the case takes over: run it (the story has already claimed the talk slot). */
export type CaseTalk = () => Promise<void>;

export interface CaseHooks {
  /** The case opens (B5 choice ①, or the parked case taken up again). */
  start(o: { resumed: boolean }): void;
  /** While the case is open: this villager's talk is the case's (testimony, confrontation) — or null for their ordinary chat. */
  talk(key: VillagerKey, who: CharacterId): CaseTalk | null;
  /** The elder's 「请众人到庭」 prompt is live (bible §4.8) — and how many required clues are still missing. */
  ready(): { ok: boolean; missing: number };
  /** Call the judgement (the case plays §4.8 and then calls story.solved()). */
  judge(): Promise<void>;
}

export interface StoryHooks {
  /** The judgement is done: the story plays B6 (and on to B7, B8). */
  solved(grade: 'shen' | 'ming' | 'ping' | 'zibai'): void;
  /** A villager's figure (null while the valley is not built). */
  villager(key: VillagerKey): VillagerHandle | null;
  /**
   * A villager's ordinary chat, as a tap on them runs it (the menu card's 「聊两句」); resolves when it
   * is over. It takes the story's own claim: give back any claim you hold before calling it.
   */
  talk(key: VillagerKey): Promise<void>;
  /** Put everyone where the hour says, at once (歇一歇 turns the valley's hour while you look at the sky). */
  refresh(): void;
  /** A beat, or a story talk, is under way (life's gate is shut meanwhile). */
  running(): boolean;
}

/** A prompt on a villager in place of their chat (the story's own, or life's): the name label, the action, what it does. */
export interface VillagerPrompt {
  label: Line;
  action: Line;
  act(): void | Promise<void>;
}

/** 二期「常住」: what everyday life (life/index.ts) answers the story. */
export interface LifeHooks {
  /** This villager's life prompt now (「吃点什么」), or null. The story asks it last, only at 常 with the case closed. */
  prompt(key: VillagerKey): VillagerPrompt | null;
  /**
   * 出谷 was asked: settle whatever life runs (a game asks 「这局不玩了？」; a 特写 skips to its end).
   * True: go now. False: stay (the walker chose to keep playing).
   */
  leaving(): Promise<boolean>;
  /** A line this villager says before their chat (石瞽's echoes), or null. */
  talkPrefix(key: VillagerKey, who: CharacterId): Line | null;
  /** Life holds the claim now (the table, a game, 歇一歇). */
  busy(): boolean;
}

export const taoyuanHooks: { case: CaseHooks | null; story: StoryHooks | null; life: LifeHooks | null } = { case: null, story: null, life: null };
