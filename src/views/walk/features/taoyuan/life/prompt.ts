// 桃源 · 二期: a prompt in the valley that is there only while a condition holds, checked every second
// (as the story's remark() does): the board, the benches, the well, the covered bowl. Owner: L.
import type { Interactable, WorldCtx } from '../../../types';
import type { Bag } from '../../kit';

export interface Gated {
  /** The interactable (change its labels in place). */
  readonly it: Interactable;
  /** Check the condition now (not at the next second). */
  check(): void;
  /** It is shown now. */
  readonly shown: boolean;
}

/** Show `it` while `when()` holds (checked once a second, and on check()); removed on dispose. */
export function gated(bag: Bag, ctx: WorldCtx, it: Interactable, when: () => boolean): Gated {
  let off: (() => void) | null = null;
  const check = () => {
    let want = false;
    try { want = when(); } catch (e) { console.error('[walk] taoyuan life prompt gate', e); }
    if (want && !off) off = ctx.addInteractable(it);
    else if (!want && off) { off(); off = null; }
  };
  let acc = 1;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    check();
  });
  bag.onDispose(() => { off?.(); off = null; });
  return { it, check, get shown() { return off !== null; } };
}
