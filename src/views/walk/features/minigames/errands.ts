// 今日 · a tiny chip in the corner of the walk: today's three errands (日课) as ticks. Tap it for a
// card listing them and the coins each pays. Updates as you go; a little flourish when the last one
// is done.
import { effect } from '@preact/signals';
import { feature } from '../kit';
import { daily, ERRAND_COINS, ERRANDS_ALL_COINS } from '../../../../app/play';
import { h, tr } from './ui';
import * as snd from './sound';

export const errands = feature('mg-errands', (bag, ctx) => {
  const root = h('div', 'mg');
  const chip = h('button', 'mg-errands', undefined, root);
  chip.type = 'button';
  h('b', '', tr(ctx, '今日', 'Today'), chip);
  const ticks = h('span', 'mg-ticks', undefined, chip);
  const dots = [0, 1, 2].map(() => h('i', '', undefined, ticks));
  let wasAll: boolean | null = null;
  const off = effect(() => {
    const list = daily.value;
    list.forEach((e, i) => dots[i]?.classList.toggle('is-done', e.done));
    const all = list.length > 0 && list.every((e) => e.done);
    chip.classList.toggle('is-all', all);
    chip.setAttribute('aria-label', tr(ctx, `今日日课 ${list.filter((e) => e.done).length}/${list.length}`, `Today’s errands ${list.filter((e) => e.done).length}/${list.length}`));
    if (wasAll === false && all) {
      snd.ding(5);
      ctx.hud.toast(`今日日课，圆满！另赏 ${ERRANDS_ALL_COINS} 文`, `Today’s errands — all done! ${ERRANDS_ALL_COINS} coins more`, 2600);
    }
    wasAll = all;
  });
  bag.onDispose(off);
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const list = daily.value;
    const coin = (zh: boolean, done: boolean) => (done ? (zh ? `  已得 ${ERRAND_COINS} 文` : `  ${ERRAND_COINS} coins ✓`) : (zh ? `  +${ERRAND_COINS} 文` : `  +${ERRAND_COINS} coins`));
    const line = (zh: boolean) => list.map((d) => `${d.done ? '✓' : '○'}  ${zh ? d.def.zh : d.def.en}${d.def.target > 1 ? `  ${d.value}/${d.def.target}` : ''}${coin(zh, d.done)}`).join('\n');
    const all = list.every((d) => d.done);
    ctx.hud.showCard({
      titleZh: '今日日课', titleEn: 'Today’s errands',
      bodyZh: `${line(true)}\n\n${all ? `都做完了，另得 ${ERRANDS_ALL_COINS} 文。明日再来。` : `小事三件，做与不做，都好。三件皆毕，另赏 ${ERRANDS_ALL_COINS} 文。`}`,
      bodyEn: `${line(false)}\n\n${all ? `All done — ${ERRANDS_ALL_COINS} coins more. Come back tomorrow.` : `Three small things — done or not, all is well. All three: ${ERRANDS_ALL_COINS} coins more.`}`,
      seal: '日',
    });
  });
  const unmount = ctx.hud.mount(root);
  bag.onDispose(unmount);
});
