// Walking up to someone with a flower in hand: offer it first. Each person thanks you their own way
// (a line, a few coins, a poem card); the caller adds any surprise of its own (a free fortune…).
// Only the first flower a person gets each day brings anything back; later ones are thanked, so a
// flower bought for 3 coins can't be turned into coins over and over.
import type { WorldCtx } from '../../types';
import type { Figure } from '../minigames/npc';
import { talk } from '../minigames/npc';
import { earn, play, record } from '../../../../app/play';
import { today } from '../../../../app/store';
import { FLOWER_AGAIN, FLOWER_THANKS, FLOWERS } from './lines';
import { countToday, flowerReward, giftKey } from './logic';
import { carrying, holdingFlower, takeFlower } from './carry';
import * as snd from './sound';

/** Not given (false), given as today's first flower to this person, or given again (thanks only). */
export type Gift = false | 'first' | 'again';

/**
 * If the walker holds a flower, ask whether to give it to `who` (a FLOWER_THANKS key). Resolves
 * 'first' when it was this person's first flower today (the thanks said and paid — the caller adds
 * its own surprise), 'again' when they already had one today (thanked, nothing more), false if kept.
 */
export async function offerFlower(ctx: WorldCtx, fig: Figure | null, name: { zh: string; en: string }, who: string): Promise<Gift> {
  if (!holdingFlower()) return false;
  const f = FLOWERS[carrying().flowerKind] ?? FLOWERS[0];
  const before = countToday(play.value.daily, today.value, giftKey(who));
  const c = await ctx.hud.say({
    nameZh: '行囊', nameEn: 'Your bag',
    zh: `你手里拿着一枝${f.zh}。送给${name.zh}吗？${before ? '（今天已经送过一枝了）' : ''}`,
    en: `You are holding a sprig of ${f.en}. Give it to the ${name.en.toLowerCase()}?${before ? ' (You already gave one today.)' : ''}`,
    choices: [{ zh: '送花', en: 'Give the flower' }, { zh: '留着', en: 'Keep it' }],
  });
  if (c !== 0 || !takeFlower()) return false;
  const th = FLOWER_THANKS[who];
  const r = flowerReward(th, before);
  record(giftKey(who));
  record('flower-given');
  if (fig) fig.wave();
  ctx.player.emote('bow');
  if (!r.first) {
    await talk(ctx, fig, name, [FLOWER_AGAIN[who] ?? FLOWER_AGAIN.any]);
    return 'again';
  }
  if (th) await talk(ctx, fig, name, [th.line]);
  if (r.coins) { earn(r.coins); snd.coins(); ctx.hud.toast(`+${r.coins} 文`, `+${r.coins} coins`, 1600); }
  if (r.card) ctx.hud.showCard(r.card);
  return 'first';
}
