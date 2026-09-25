// Walking up to someone with a flower in hand: offer it first. Each person thanks you their own way
// (a line, a few coins, a poem card); the caller adds any surprise of its own (a free fortune…).
import type { WorldCtx } from '../../types';
import type { Figure } from '../minigames/npc';
import { talk } from '../minigames/npc';
import { earn, record } from '../../../../app/play';
import { FLOWER_THANKS, FLOWERS } from './lines';
import { carrying, holdingFlower, takeFlower } from './carry';
import * as snd from './sound';

/**
 * If the walker holds a flower, ask whether to give it to `who` (a FLOWER_THANKS key). Resolves true
 * when it was given (the thanks already said and paid).
 */
export async function offerFlower(ctx: WorldCtx, fig: Figure | null, name: { zh: string; en: string }, who: string): Promise<boolean> {
  if (!holdingFlower()) return false;
  const f = FLOWERS[carrying().flowerKind] ?? FLOWERS[0];
  const c = await ctx.hud.say({
    nameZh: '行囊', nameEn: 'Your bag',
    zh: `你手里拿着一枝${f.zh}。送给${name.zh}吗？`, en: `You are holding a sprig of ${f.en}. Give it to the ${name.en.toLowerCase()}?`,
    choices: [{ zh: '送花', en: 'Give the flower' }, { zh: '留着', en: 'Keep it' }],
  });
  if (c !== 0 || !takeFlower()) return false;
  const th = FLOWER_THANKS[who];
  if (fig) fig.wave();
  ctx.player.emote('bow');
  if (th) await talk(ctx, fig, name, [th.line]);
  record('flower-given');
  if (th?.coins) { earn(th.coins); snd.coins(); ctx.hud.toast(`+${th.coins} 文`, `+${th.coins} coins`, 1600); }
  if (th?.card) ctx.hud.showCard(th.card);
  return true;
}
