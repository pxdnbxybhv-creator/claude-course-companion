// The seam between the 桃源 story (story.ts, folk.ts) and its mystery (case*.ts): neither imports the
// other. The case module registers itself here when it loads; the story asks here.
//
//   story → case: start the case (B5 ①), resume a parked case, ask whether a villager's talk is the
//                 case's (a testimony, a confrontation), ask whether the judgement can be called.
//   case → story: say the case is solved (B6 plays), look up a villager's figure.
import type { CharacterId } from '../../../../data/characters';

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
}

export const taoyuanHooks: { case: CaseHooks | null; story: StoryHooks | null } = { case: null, story: null };
