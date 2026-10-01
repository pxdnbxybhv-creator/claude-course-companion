// 水月幻镜 · the first-time tips of real runs (d-tutorial §2): each shows once per account, only while
// 新手提示 is on, never in the tutorial. `markTip` writes when a tip is shown, through the store's
// debounced write (never a synchronous write mid-frame).
import { mirror } from '../../../app/mirror';
import { isHidden, type CharacterId, type HiddenId, type MirrorMeta, type TutorFlags, type TutorTipId } from '../types';

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

// ── m8:hidden · the coach lines for the first run with each hidden companion (hidden.md §3.9, §4.9, §5.9) ──
type Say = { zh: string; en: string };
/** Two lines each, whispered one after the other as the first wave starts (ui/Tutorial.tsx TipsBrain). */
export const HIDDEN_COACH: Readonly<Record<HiddenId, { id: TutorTipId; lines: readonly [Say, Say] }>> = {
  yuenv: { id: 'hidYuenv', lines: [
    { zh: '敌人的招打到你的一刻再按，接住的会加倍还回去。', en: 'Press the moment a blow lands on you: what you catch goes back twice as hard.' },
    { zh: '早按会落空，落空的时候最怕挨打。', en: 'Press too early and you catch nothing, and that\'s when you\'re easiest to hurt.' },
  ] },
  shangui: { id: 'hidShangui', lines: [
    { zh: '按一下缠住，别急着扯：先走开，藤绷直了再按。', en: 'Tap to bind, then don\'t snap yet: walk away and press once the vines pull straight.' },
    { zh: '扯断时敌人会被拽到你身前，挑个好地方站。', en: 'Snapped foes land in front of you, so pick where you stand.' },
  ] },
  houyi: { id: 'hidHouyi', lines: [
    { zh: '按住拉弓，金色那一格松手最准最狠。', en: 'Hold to draw; let go in the gold notch for the truest, hardest shot.' },
    { zh: '站着不动时弓更强，拖动能瞄一整排。', en: 'Bows are stronger while you stand still, and dragging lines up a whole row.' },
  ] },
};
/** The hidden companion's coach lines when they are still due on this account (新手提示 on), else null. */
export function hiddenCoachDue(m: Pick<MirrorMeta, 'settings' | 'tutor'>, char: CharacterId): (typeof HIDDEN_COACH)[HiddenId] | null {
  if (!isHidden(char)) return null;
  const c = HIDDEN_COACH[char];
  return tipDue(m, c.id) ? c : null;
}
