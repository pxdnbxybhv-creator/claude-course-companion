// 信物: the keepsakes and clues the letters and the 桃源 story give (play flags `item:keep:<id>` and
// `item:clue:<id>`), with a line each for the keepsake list in the quest book. Small on purpose: the
// quest book (main bundle) reads it; the story's own text stays in the walk's lazy chunk.

export interface Keepsake { zh: string; en: string; noteZh: string; noteEn: string; /** The seal it shows under (1–2 characters). */ seal: string }

export const KEEPSAKES: Record<string, Keepsake> = {
  wulinggou: { zh: '武陵钩', en: 'The Wuling Hook', seal: '钩', noteZh: '一枚青铜鱼钩，小满在老碧桃的树洞最里头找到的。', noteEn: "A bronze fishhook Xiaoman found at the very back of the old white-edged peach's hollow." },
  xiantao: { zh: '仙桃', en: 'A Peach of the Immortals', seal: '桃', noteZh: '夭夭给道童的一颗仙桃。她说：别急着吃，种下去。', noteEn: "The peach Yaoyao gave the Taoist child. \"Don't eat it yet,\" she said. \"Plant it.\"" },
  petal: { zh: '压花桃瓣', en: 'A Pressed Peach Petal', seal: '瓣', noteZh: '小满夹在信里的一片桃瓣，压得平平的，还是粉的。他说你拿着它，瀑布后面的光就还在。', noteEn: 'A peach petal Xiaoman pressed flat in his letter, still pink. He says that while you keep it, the light behind the falls stays.' },
  taoyuanli: { zh: '桃源里印', en: 'The Peach Spring Village Seal', seal: '印', noteZh: '秦老托桑三娘寄来的里印。盖在哪里，哪里便算桃源——此后拍照落款，它会一并盖上。', noteEn: 'The village seal the elder had Sang Sanniang send you. Wherever it is pressed counts as Peach Spring — from now on it goes on beside your signature whenever you sign a picture.' },
  feather: { zh: '青鸟羽', en: 'A Bluebird Feather', seal: '羽', noteZh: '随无名氏的信而来的一根青羽。谁寄的，信里没说。', noteEn: 'A blue feather that came with the unsigned letter. Who sent it, the letter does not say.' },
};

/** The keepsakes and clues held now (in the order above, then any others by id), from play flags. */
export function heldKeepsakes(flags: Readonly<Record<string, unknown>>): { id: string; kind: 'keep' | 'clue'; k: Keepsake | null }[] {
  const out: { id: string; kind: 'keep' | 'clue'; k: Keepsake | null }[] = [];
  for (const f of Object.keys(flags)) {
    const m = /^item:(keep|clue):([a-z0-9_-]+)$/.exec(f);
    if (m && flags[f]) out.push({ id: m[2], kind: m[1] as 'keep' | 'clue', k: KEEPSAKES[m[2]] ?? null });
  }
  const order = Object.keys(KEEPSAKES);
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  return out.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}
