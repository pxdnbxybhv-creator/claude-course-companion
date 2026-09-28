// 水月幻镜 · the first-time tips of real runs (d-tutorial §2): each shows once per account, only while
// 新手提示 is on, never in the tutorial. `markTip` writes when a tip is shown, through the store's
// debounced write (never a synchronous write mid-frame).
import { mirror } from '../../../app/mirror';
import type { MirrorMeta, TutorFlags, TutorTipId } from '../types';

export const NO_TUTOR: TutorFlags = { offered: false, done: false, tips: {} };
/** The tutorial's flags (a meta from an older literal may lack them). */
export const tutorOf = (m: Pick<MirrorMeta, 'tutor'>): TutorFlags => m.tutor ?? NO_TUTOR;
/** 新手提示 on? */
export const tipsOn = (m: Pick<MirrorMeta, 'settings'>): boolean => m.settings.tips !== false;
/** Is this tip still to be shown? */
export function tipDue(m: Pick<MirrorMeta, 'settings' | 'tutor'>, id: TutorTipId): boolean {
  return tipsOn(m) && !tutorOf(m).tips[id];
}
/** The skipper primers (cards, shop) show only to players who have not played the tutorial through. */
export function primerDue(m: Pick<MirrorMeta, 'settings' | 'tutor'>, id: 'cards' | 'shop'): boolean {
  return tipDue(m, id) && !tutorOf(m).done;
}
/** Mark a tip shown (debounced write). */
export function markTip(id: TutorTipId): void {
  const m = mirror.value;
  const tu = tutorOf(m);
  if (tu.tips[id]) return;
  mirror.value = { ...m, tutor: { ...tu, tips: { ...tu.tips, [id]: true } } };
}
