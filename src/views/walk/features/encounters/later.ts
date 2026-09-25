// Consequences that come on another day: after you lend the fox your umbrella, a basket of wild fruit
// sits by the garden gate the next morning (and your umbrella, dry, beside it).
import type { WorldCtx } from '../../types';
import { ANCHORS } from '../../map';
import type { Bag } from '../kit';
import { earn } from '../../../../app/play';
import { makeRng, hashString } from '../../../../core/rng';
import { walkableNear } from '../minigames/cat';
import type { Memory } from './logic';
import { fruitBasket, umbrella } from './models';
import { burst } from '../props';

export const FOX_GIFT_COINS = 40;

export function laterGifts(bag: Bag, ctx: WorldCtx, mem: () => Memory, put: (m: Memory) => void, day: string): void {
  const lent = mem().later.fox;
  if (!lent || lent >= day) return; // not until another day
  const { THREE } = ctx;
  const a = ANCHORS.gatePlaza;
  const p = walkableNear(ctx, a.x + 2.2, a.z - 1.6, 4);
  const y = ctx.groundY(p.x, p.z);
  const g = new THREE.Group();
  g.position.set(p.x, y, p.z);
  const basket = fruitBasket(ctx, makeRng(hashString(`fox-basket:${lent}`)));
  g.add(basket);
  const brolly = umbrella(ctx, '#c9573c');
  brolly.rotation.set(0.25, 0, 1.25);
  brolly.position.set(-0.45, 0.12, 0.1);
  g.add(brolly);
  bag.add(g, ctx.regionGroup('garden'));
  const stop = bag.interact({
    id: 'qiyu-fox-basket', position: new THREE.Vector3(p.x, y, p.z), radius: 1.8,
    labelZh: '门前一篮山果', labelEn: 'A basket of wild fruit', actionZh: '收下', actionEn: 'Take it',
    act() {
      stop();
      const m = { ...mem(), later: { ...mem().later } };
      delete m.later.fox;
      put(m);
      earn(FOX_GIFT_COINS);
      burst(bag, new THREE.Vector3(p.x, y + 0.3, p.z), '#f0a23a', 12, { speed: 0.9 });
      ctx.player.emote('bow');
      ctx.hud.showCard({
        titleZh: '一篮山果', titleEn: 'A Basket of Wild Fruit',
        bodyZh: `篮里是带露的山果，底下压着那把伞，伞面干干爽爽。\n篮沿上沾着几根雪白的毛。\n\n得钱 ${FOX_GIFT_COINS} 文`,
        bodyEn: `Wild fruit still wet with dew, and under it your umbrella, perfectly dry.\nA few snow-white hairs cling to the rim.\n\n+${FOX_GIFT_COINS} coins`,
        seal: '狐',
      });
      bag.later(1600, () => bag.drop(g));
    },
  });
}
