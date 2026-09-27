// 信 · the letters that can arrive in the mailbox. Letter text lives only here (never in the saved
// box), so a wording fix reaches old letters and an edited backup cannot invent attachments. What
// has been claimed is kept in play (`flags['mail:<id>']`), written in the same change as its coins.
// The 初见礼 is here; the 桃源 letters live with the walk (their glyphs belong in the walk's font).
import type { CharacterId } from './characters';
import type { DateKey } from '../core/types';
import type { PlayState } from '../app/play';
import type { NameScope } from '../app/name';
import { TAOYUAN_LETTERS } from '../views/walk/features/taoyuan/letters';
import { NPC_LETTERS } from '../views/walk/features/npcs/letters';

export interface Line { zh: string; en: string }

/** Something a letter carries that is not coins or a companion: kept as play flag `item:<kind>:<id>`. */
export interface LetterItem { kind: 'clue' | 'seal' | 'keep'; id: string; zh: string; en: string }

export interface Attachments {
  coins?: number;
  character?: CharacterId;
  item?: LetterItem;
}

export interface LetterDef {
  id: string;
  from: Line;
  /** One glyph on the envelope's seal. */
  seal?: string;
  subject: Line;
  /** May hold `{名}` (filled at render). */
  body: Line;
  /** A grey line under the letter: the paper, the handwriting. */
  note?: Line;
  /** A postscript: the first whose play flag is set is shown. */
  ps?: { flag: string; zh: string; en: string }[];
  attach?: Attachments;
  /** Play flags set when it is claimed (e.g. `ty:way`). */
  sets?: string[];
  /** The letter carries the field where the player writes their name (the 初见礼). */
  askName?: true;
  /** How `{名}` reads when there is no name: 'valley' letters say 客 / guest. */
  scope?: NameScope;
  /** When it arrives by itself (checked on load and when the world is built); omitted = only deliver() sends it. */
  due?: (p: PlayState, today: DateKey) => boolean;
}

/** 初见礼 · A First Gift — from 嫦娥, carrying 玉兔 and 300 文 (every player, once). */
const CHUJIAN: LetterDef = {
  id: 'chujian',
  from: { zh: '广寒 · 嫦娥', en: "Chang'e, of the Moon Palace" },
  seal: '月',
  subject: { zh: '初见礼', en: 'A First Gift' },
  body: {
    zh: '{名}足下：见字如面。闻人间有半亩园，园主以日日功课浇灌花木，一年四季，不曾荒废。广寒清冷，玉兔终日伏在桂下望着人间，捣药也不专心，索性遣它下来与你作伴。另附铜钱三百文，权作初见之礼。尚不知足下如何称呼？写在下面便好。月圆之夜，或许我也来看看。——广寒 嫦娥',
    en: "Dear {名}, as if face to face. I hear that in the world below there is a Half-Acre garden, and that its keeper waters it with a little work every day and never lets it go to weeds. The Moon Palace is cold and quiet. The Jade Rabbit spends all day lying under the cassia gazing down at your world and cannot keep her mind on the medicine, so I have sent her down to keep you company. I also enclose three hundred coins, a small gift for a first meeting. I do not yet know what to call you — write it below. On a full-moon night, perhaps I shall come and see for myself. — Chang'e, of the Moon Palace",
  },
  ps: [{ flag: 'char:rabbit', zh: '又：听说玉兔早已与你同行，那这三百文，便算给她买萝卜吧。', en: 'P.S. I hear the Rabbit has been walking with you already — then let the three hundred coins buy her carrots.' }],
  attach: { coins: 300, character: 'rabbit' },
  askName: true,
  due: () => true,
};

export const LETTERS: LetterDef[] = [CHUJIAN, ...TAOYUAN_LETTERS, ...NPC_LETTERS];
export const LETTER: Record<string, LetterDef> = Object.fromEntries(LETTERS.map((l) => [l.id, l]));
