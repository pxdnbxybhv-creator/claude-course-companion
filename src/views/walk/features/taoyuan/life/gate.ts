// 桃源 · 二期: the gate of everyday life (spec §1). Pure: tests import it.
//
// Every stall prompt, stand prompt, the board, 歇一歇 and 留一碗 check lifeOpen every second, as the
// story's remark() does. A parked case is fine (it is not open); a case taken up again holds 子正 and
// shuts every stall and stand. Owner: L.
import { caseOpen, phaseOf } from '../text';

type Flags = Readonly<Record<string, true | undefined>>;

/** Everyday life runs: the story is over (常), the case is not open, and no beat (or story talk) is under way. */
export const lifeOpen = (f: Flags, storyRunning: boolean): boolean =>
  phaseOf(f) === 'chang' && !caseOpen(f) && !storyRunning;

/** The atlas's petal and travel('taoyuan') open only once 小满's letter is claimed (`ty:way`). */
export const canTravelToValley = (f: Flags): boolean => !!f['ty:way'];
