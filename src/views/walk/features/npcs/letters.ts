// Letters the people of the painting send (their stories' rewards and news): pure LetterDef data,
// joined into the catalog by src/data/letters.ts. Text lives under the walk (the walk's font).
import type { LetterDef } from '../../../../data/letters';
import { diffDays } from '../../../../core/date';

/** The day 王四娘's letter went off (done[...]): the answer comes the next day. */
export const WANG_LETTER_DAY = 'npc:wang-letter';
/** Her husband's answer taken from the mailbox (its claim flag); her last beat waits on it. */
export const WANGDA_READ = 'mail:npc-wangda';

const before = (d: string | undefined, today: string) => !!d && diffDays(d, today) >= 1;

export const NPC_LETTERS: LetterDef[] = [
  {
    // 王四娘 could not write; you wrote her letter home for her (folk-arcs.ts, v.lingjiao 'letter').
    // Her husband's answer comes back to whoever held the brush, the day after it went.
    id: 'npc-wangda',
    from: { zh: '瓜洲渡 · 王大', en: 'Wang Da, at Guazhou Ferry' },
    seal: '王',
    subject: { zh: '瓜洲回信', en: 'An Answer from Guazhou' },
    body: {
      zh: '代笔的{名}：信收到了。俺不识字，是渡口茶棚的先生念给俺听的。念到「菱儿长高了」，俺在纤道上坐了半天。开春船漏了，没钱修，只好给盐船拉纤，攒够了修船的钱，秋后就回。烦您念给四娘听，叫她夜里别再去湖心点灯了，风大。随信捎回二十文，是您的笔墨钱。——王大，托人代书',
      en: 'To {名}, who held the brush: your letter came. I can’t read — the gentleman at the ferry tea-shed read it to me. When he got to “Ling’er has grown” I sat down on the towpath for a long while. In spring the boat sprang a leak and I had no money to mend it, so I’ve been towing salt barges. When I’ve saved enough to mend her, I’ll be home after autumn. Please read this to Siniang, and tell her not to go out on the lake at night to light the lamp any more — the wind is strong. Twenty coins enclosed, for your ink and brush. — Wang Da, written by another’s hand',
    },
    note: { zh: '信纸是茶棚的账纸裁的，背面还有半行「茶两碗」。', en: 'The paper is cut from the tea-shed’s account book; on the back, half a line reads “two bowls of tea”.' },
    attach: { coins: 20 },
    due: (p, today) => before(p.done[WANG_LETTER_DAY], today),
  },
];
