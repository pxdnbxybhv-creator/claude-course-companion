// Pure helpers for reading a letter (no DOM): its salutation, body and signature laid out as a
// letter is written, which postscript it shows, and the day it came.
import type { DateKey, Lang } from '../../core/types';
import type { LetterDef } from '../../data/letters';
import { fromKey } from '../../core/date';
import { toLunar } from '../../core/lunar';

export interface LetterParts { salute: string; body: string; sign: string }
export type Ps = NonNullable<LetterDef['ps']>[number];

/**
 * Split a letter's text (before `{名}` is filled, so a name can never move the seams): a Chinese
 * salutation 「…：」 opens it on a column of its own, and a short 「——署名」 (English: " — name")
 * closes it at the foot. A dash that runs on into a sentence (the unsigned letter) stays in the body.
 */
export function splitLetter(text: string, lang: Lang): LetterParts {
  let body = text.trim();
  let salute = '';
  let sign = '';
  if (lang === 'zh') {
    const m = /^([^，。：？！\n]{1,16}：)/.exec(body);
    if (m) { salute = m[1]; body = body.slice(m[1].length); }
    const i = body.lastIndexOf('——');
    const tail = i >= 0 ? body.slice(i + 2).trim() : '';
    if (tail && Array.from(tail).length <= 14 && !/[，。？！；]/.test(tail)) { sign = tail; body = body.slice(0, i); }
  } else {
    const i = body.lastIndexOf(' — ');
    const tail = i >= 0 ? body.slice(i + 3).trim() : '';
    if (tail && tail.length <= 48 && !/[.?!;]$/.test(tail)) { sign = tail; body = body.slice(0, i); }
  }
  return { salute, body: body.trim(), sign };
}

/** The flags a letter's claim sets itself (its companion, its item, its own flags). */
export function claimSets(l: LetterDef): Set<string> {
  const out = new Set<string>(l.sets ?? []);
  if (l.attach?.character) out.add(`char:${l.attach.character}`);
  if (l.attach?.item) out.add(`item:${l.attach.item.kind}:${l.attach.item.id}`);
  return out;
}

/**
 * The postscript to show: the first whose flag is set — but not one the letter's own claim set
 * (「听说玉兔早已与你同行」 is for someone who had her before the letter came, which the claim
 * remembers as `mail:<id>:had`).
 */
export function pickPs(l: LetterDef, flags: Record<string, true | undefined>): Ps | undefined {
  const own = flags[`mail:${l.id}`] ? claimSets(l) : null;
  return l.ps?.find((x) => flags[x.flag] && (!own || !own.has(x.flag) || !!flags[`mail:${l.id}:had`]));
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The day a letter came: 「八月初五」 (the lunar date, as letters were dated) / "26 Sep". */
export function letterDate(k: DateKey, lang: Lang): string {
  const d = fromKey(k);
  if (Number.isNaN(d.getTime())) return '';
  if (lang === 'en') return `${d.getDate()} ${MONTHS_EN[d.getMonth()]}`;
  try {
    const l = toLunar(d);
    return `${l.monthName}${l.dayName}`;
  } catch {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
}
