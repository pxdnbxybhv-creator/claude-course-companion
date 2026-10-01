// 水月幻镜 · m8 · the hidden companions' screen words (hidden.md §2.3, §2.4; HIDDEN H5), {zh, en}, Chinese first.
// Numbers and names only through slots ({wave}, {n}, {@map}), filled by ui/describe.ts `fill`. The unlock follows
// the owner's words (O2): wave 40 on that map, on any 镜境, so the hint names no difficulty.
import { COMPANION_REG } from '../ids';
import { isHidden, type CharacterId, type HiddenId, type MirrorMeta } from '../types';
import { HIDDEN_WAVE, deepestOn, hiddenMap, hiddenTease } from '../logic/hidden';
import { charTag, openOf } from '../logic/session';
import { fill } from './describe';
import { charTagText } from './sand/overlay';
import type { T } from './text';

type Say = { zh: string; en: string };
const b = (zh: string, en: string): Say => ({ zh, en });

export interface HiddenSay {
  /** The sealed tile's flavour line (italic, under the hint). */
  flavour: Say;
  /** The verb seal on the sealed pane (one glyph) and its word. */
  seal: Say;
  /** The reveal page's line, typed under the figure. */
  verse: Say;
  /** The reveal page's title. */
  title: Say;
}

export const HIDDEN_SAY: Readonly<Record<HiddenId, HiddenSay>> = {
  yuenv: {
    flavour: b('湖里有剑光，不见人。', 'A sword-light in the lake, and no one holding it.'),
    seal: b('接', 'catch'),
    verse: b('镜湖水面一动，有人从剑光里走出来。', 'Mirror Lake stirs, and someone steps out of the sword-light.'),
    title: b('镜中来客 · 越女', 'A visitor from the mirror · Maiden of Yue'),
  },
  shangui: {
    flavour: b('竹深处有人含笑。', 'Someone smiles from deep in the bamboo.'),
    seal: b('缠', 'bind'),
    verse: b('竹叶分开，一双赤豹的眼睛，然后是她的笑。', 'The bamboo parts: a red leopard\'s eyes, and then her smile.'),
    title: b('镜中来客 · 山鬼', 'A visitor from the mirror · Mountain Spirit'),
  },
  houyi: {
    flavour: b('殿外有人拉满了弓，没有射。', 'Outside the hall someone draws a bow to the full, and does not loose.'),
    seal: b('弓', 'bow'),
    verse: b('广寒宫外有人拉满了弓，这一次，他走了进来。', 'Outside the Moon Palace someone had drawn a bow to the full. This time, he walks in.'),
    title: b('镜中来客 · 后羿', 'A visitor from the mirror · Hou Yi'),
  },
};

/** The fixed words of the sealed tile, the pane and the reveal. */
export const HIDDEN_UI = {
  name: b('？', '?'),
  label: b('镜中来客，还没现身', 'A visitor from the mirror, not yet here'),
  head: b('镜中来客', 'A visitor from the mirror'),
  hint: b('在{@map}打过第 {wave} 重，哪个镜境都算。', 'Clear wave {wave} on {@map}, on any difficulty.'),
  deepest: b('你在{@map}最远：第 {n} 重', 'Your deepest on {@map}: wave {n}'),
  notYet: b('还没现身', 'Not here yet'),
  /** 后羿's page, when 嫦娥 is open. */
  moon: b('他来广寒，只看了一眼月亮。', 'He came to the Moon Palace and looked at the moon only once.'),
  meet: b('去见见', 'Go and meet them'),
  reveals: b('镜中来客', 'A visitor from the mirror'),
} as const;

/** A line with its slots filled: {@map} is the companion's map, {wave} the wave to clear, {n} a number. */
export function hiddenLine(s: Say, id: HiddenId, t: T, n = 0): string {
  const map = hiddenMap(id);
  const tpl = (x: string) => x.replace('{@map}', `{@${map}}`);
  const get = (p: string) => (p === 'wave' ? HIDDEN_WAVE : p === 'n' ? n : undefined);
  return t(fill(tpl(s.zh), get, 'zh'), fill(tpl(s.en), get, 'en'));
}

/** One tile of the companion sheet (Select): open, or a sealed hidden 「？」, with its words. */
export interface TileView { id: CharacterId; open: boolean; sealed: boolean; name: string; label: string; tag: string }
/**
 * The companion sheet's tiles (hidden.md §2.3): the 13 always (open or locked); a hidden companion once open
 * (earned or the code, tagged 「测试码开启」), or sealed (「？」, no name) once any map's deepest reaches 30.
 */
export function companionTiles(m: MirrorMeta, t: T, only?: readonly CharacterId[]): TileView[] {
  const open = openOf(m).chars;
  const tease = hiddenTease(m);
  const out: TileView[] = [];
  for (const c of COMPANION_REG) {
    if (only && !only.includes(c.id)) continue;
    const ok = open.includes(c.id);
    if (isHidden(c.id) && !ok && !tease) continue;
    const sealed = isHidden(c.id) && !ok;
    out.push({
      id: c.id, open: ok, sealed,
      name: sealed ? t(HIDDEN_UI.name.zh, HIDDEN_UI.name.en) : t(c.zh, c.en),
      label: sealed ? t(HIDDEN_UI.label.zh, HIDDEN_UI.label.en) : ok ? t(c.zh, c.en) : t(`${c.zh}，还没结伴`, `${c.en}, locked`),
      tag: charTagText(charTag(m, c.id), t),
    });
  }
  return out;
}
/** A sealed hidden companion's pane: the head, the hint, the flavour, the verb seal, the progress and the button. */
export function sealedView(m: Pick<MirrorMeta, 'bests'>, id: HiddenId, t: T): { head: string; hint: string; flavour: string; seal: string; sealWord: string; deepest: string; button: string } {
  const s = HIDDEN_SAY[id];
  return {
    head: t(HIDDEN_UI.head.zh, HIDDEN_UI.head.en),
    hint: hiddenLine(HIDDEN_UI.hint, id, t),
    flavour: t(s.flavour.zh, s.flavour.en),
    seal: s.seal.zh,
    sealWord: t(s.seal.zh, s.seal.en),
    deepest: hiddenLine(HIDDEN_UI.deepest, id, t, deepestOn(m, hiddenMap(id))),
    button: t(HIDDEN_UI.notYet.zh, HIDDEN_UI.notYet.en),
  };
}
