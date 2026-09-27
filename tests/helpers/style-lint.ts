// 桃源 · the dialogue style lint (spec Appendix A; style.md §2–§3, §8): every new line of the valley's
// everyday life — the food, the life layer's lines, the games' — runs through `lint`. Shared by the
// four builders' tests (taoyuan-food, -life, -pv, -games). Owner: F.
//
//   lint(zh, speaker?) → every violation (an empty list: the line is clean)
//
// `speaker` is a villager key (qin, sang, liupo… — 客人 and 莫 belong to some of them only), a
// companion id (scholar…), 'narr' and 'yaoyao' (the lyric exemptions: no shape rules, but the word
// lists and 不是…是… still apply) or 'quote' (the period quotations on result cards: exempt from
// everything). Left out, the line is held to every rule, as a villager's who is neither 秦, 三娘 nor 柳婆.

export type LintSpeaker = string;

/** Literary tics, modern words, northern dialect, anachronisms (style.md §2). */
export const BANNED_ALWAYS: readonly string[] = [
  // literary
  '便', '竟', '方才', '方可', '方子', '只此', '生前', '以为', '仿佛', '宛如', '似乎', '也罢', '敢问', '忝为', '一一断来', '真相', '情有可原',
  // modern
  '感觉', '情绪', '压力', '崩溃', '搞', '行吧', '没问题',
  // dialect
  '俺', '啥', '咋', '娃', '呗', '哩',
  // anachronism
  '钟头', '铜板', '辣',
];

/** Food clichés (style.md §8). */
export const BANNED_FOOD: readonly string[] = [
  '人间烟火', '治愈', '舌尖', '味蕾', '绽放', '满满的', '幸福感', '灵魂', '家的味道', '岁月', '入口即化', '回味无穷', '唇齿留香',
];

/** Not in the period kitchen (spec §3.5; 青团 and 圆子 are later names). */
export const BANNED_KITCHEN: readonly string[] = [
  '辣椒', '土豆', '玉米', '番茄', '红薯', '花生', '豆腐', '白糖', '砂糖', '芝麻', '香菜', '青团', '汤圆', '圆子',
];

/** The 不是A，是B reveal (style.md §2). */
export const NOT_A_BUT_B = /不是[^，。！？]{1,12}[，,]\s*(而)?是/;

const KEREN = new Set(['qin', 'sang']);
const MO = new Set(['liupo', 'qin']);

/** Every violation of the style rules in one Chinese line said by `speaker`. */
export function lint(zh: string, speaker?: LintSpeaker): string[] {
  if (speaker === 'quote') return [];
  const out: string[] = [];
  for (const w of [...BANNED_ALWAYS, ...BANNED_FOOD, ...BANNED_KITCHEN]) if (zh.includes(w)) out.push(`banned 「${w}」`);
  // speaker rules
  if (zh.includes('客人') && !(speaker && KEREN.has(speaker))) out.push('客人 is only for 秦 and 三娘');
  if (zh.includes('老朽')) out.push('老朽 is 秦\'s introduction only');
  if (zh.includes('莫') && !(speaker && MO.has(speaker))) out.push('莫 is only for 柳婆 and 秦');
  // the reveal is flagged for everyone (the lyric voices included)
  if (NOT_A_BUT_B.test(zh)) out.push('不是A，是B');
  if (speaker === 'narr' || speaker === 'yaoyao') return out;
  // shape rules
  if (/^[\s「“"（(]*其实/.test(zh)) out.push('opens with 其实');
  if ((zh.match(/——/g) ?? []).length > 1) out.push('more than one ——');
  if ((zh.match(/（/g) ?? []).length > 1) out.push('more than one （stage direction）');
  return out;
}

/** A line that is only a stage direction 「（…）」 (drawn in the narrator's style). */
export const isStage = (zh: string): boolean => /^（[^（）]*）$/.test(zh.trim());

/** Every {zh, en} pair in a value, with its path (functions are left out). */
export function linesIn(v: unknown, path = ''): { path: string; zh: string; en: string }[] {
  const out: { path: string; zh: string; en: string }[] = [];
  const walk = (o: unknown, p: string, depth: number): void => {
    if (!o || typeof o !== 'object' || depth > 12) return;
    const r = o as Record<string, unknown>;
    if (typeof r.zh === 'string' && typeof r.en === 'string') out.push({ path: p, zh: r.zh, en: r.en });
    for (const [k, x] of Object.entries(r)) if (x && typeof x === 'object') walk(x, p ? `${p}.${k}` : k, depth + 1);
  };
  walk(v, path, 0);
  return out;
}

/**
 * The speaker a line's path names, if any: the first path segment that is one of `who` (villager keys,
 * companion ids), else 'narr' for a bare stage direction.
 */
export function speakerOf(path: string, zh: string, who: readonly string[]): LintSpeaker | undefined {
  const segs = path.split('.');
  for (let i = segs.length - 1; i >= 0; i--) if (who.includes(segs[i])) return segs[i];
  return isStage(zh) ? 'narr' : undefined;
}

/** Hanzi in an English string (the hours keep their names; {名} is filled at render). */
export function hanziIn(en: string): boolean {
  const ok = en.replace(/\{名\}/g, '').replace(/[申酉戌亥子卯][初正末]?(二刻)?/g, '');
  return /[㐀-鿿]/.test(ok);
}
