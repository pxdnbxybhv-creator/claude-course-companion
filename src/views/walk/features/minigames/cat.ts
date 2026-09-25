// 寻猫 — hide-and-seek with Big Ginger. Besides his nap under a plant in your garden (hidden.ts), each
// day he slips off to a hiding place somewhere else in the painting — the same place all day. Walk
// near and you hear him purring (louder as you close in); the people of the painting have seen him
// and will drop a clue. Find him: record('cat'), once a day.
import type * as T from 'three';
import type { WorldCtx } from '../../types';
import { feature, glowTexture, reducedMotion } from '../kit';
import { billboard, catAsleepDrawing, catAwakeDrawing } from '../painted';
import { record, play } from '../../../../app/play';
import { toKey } from '../../../../core/date';
import { catSpotFor, type CatSpot } from './logic';
import * as sfx from '../sfx';
import * as snd from './sound';

/** Today's hiding place (by the world's date). */
export function todaysCat(ctx: WorldCtx): CatSpot {
  return catSpotFor(toKey(ctx.env.date));
}

/** A walkable spot as close as possible to (x, z). */
export function walkableNear(ctx: WorldCtx, x: number, z: number, maxR = 7): { x: number; z: number } {
  if (ctx.isWalkable(x, z)) return { x, z };
  for (let r = 0.6; r <= maxR; r += 0.6) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + r;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (ctx.isWalkable(px, pz)) return { x: px, z: pz };
    }
  }
  return { x, z };
}

export const hideAndSeek = feature('mg-cat', (bag, ctx) => {
  const { THREE } = ctx;
  const spot = todaysCat(ctx);
  const group = ctx.regionGroup(spot.region);
  const p = walkableNear(ctx, spot.x, spot.z);
  const at = new THREE.Vector3(p.x, ctx.groundY(p.x, p.z), p.z);
  const still = reducedMotion();
  const day = toKey(ctx.env.date);
  const foundToday = () => play.value.daily.day === day && (play.value.daily.counts.cat ?? 0) > 0;

  const pic = billboard(bag, [catAsleepDrawing(611), catAwakeDrawing(612)], 0.78, { px: 320 });
  pic.mesh.position.copy(at);
  bag.add(pic.mesh, group);
  const zTex = glowTexture(THREE, 32, 0.3);
  const zz = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, color: '#cfc8b8', transparent: true, opacity: 0, depthWrite: false }));
  zz.scale.set(0.08, 0.08, 1);
  bag.add(zz, group);

  let awake = 0, pets = 0, purrT = 0;
  bag.interact({
    id: 'mg-cat', position: at, radius: 1.4,
    labelZh: '大橘', labelEn: 'Big Ginger', actionZh: '找到你了', actionEn: 'Found you!',
    act() {
      awake = 8;
      pets++;
      sfx.purr(2.8, 0.8);
      if (pets === 1 && !foundToday()) {
        record('cat');
        ctx.player.emote('jump');
        snd.ding(4);
        const n = play.value.counters.cat ?? 0;
        ctx.hud.showCard({
          titleZh: '找到大橘了！', titleEn: 'Found Big Ginger!',
          bodyZh: `它躲在${spot.whereZh}，正睡得香。\n被你找到，它不情不愿地伸了个懒腰。\n\n寻猫启事 · 第 ${n} 回${n < 3 ? '（找到三回，它就愿意跟你走）' : ''}\n明天它又会换个地方。`,
          bodyEn: `He was hiding ${spot.whereEn}, fast asleep.\nFound out, he stretches — most unwillingly.\n\nMissing cat · found ${n} time${n === 1 ? '' : 's'}${n < 3 ? ' (find him three times and he will come along with you)' : ''}\nTomorrow he will hide somewhere else.`,
          seal: '猫',
        });
      } else {
        ctx.hud.toast(pets % 3 === 0 ? '它翻过身，露出了肚皮' : '咕噜咕噜……', pets % 3 === 0 ? 'He rolls over, belly up' : 'Prrr… prrr…', 1800);
      }
    },
  });

  bag.frame((dt, t) => {
    const pp = ctx.player.position;
    const d = Math.hypot(pp.x - at.x, pp.z - at.z);
    // purring you can follow: louder as you come near
    purrT -= dt;
    if (d < 26 && purrT <= 0 && awake <= 0) {
      purrT = 2.6 + Math.random() * 0.8;
      const k = 1 - d / 26;
      sfx.purr(2.2, 0.12 + k * k * 0.85);
    }
    if (d > 40) return;
    if (d < 2 && awake <= 0) awake = 4;
    awake = Math.max(0, awake - dt);
    pic.show(awake > 0 ? 1 : 0);
    const breath = still ? 0 : Math.sin(t * (awake > 0 ? 3 : 1.6)) * 0.02;
    pic.mesh.scale.set(1 + breath * 0.3, 1 + breath, 1);
    const zk = (t * 0.35) % 1;
    zz.position.set(at.x + 0.1 + zk * 0.15, at.y + 0.35 + zk * 0.45, at.z);
    (zz.material as T.SpriteMaterial).opacity = awake > 0 ? 0 : Math.sin(zk * Math.PI) * 0.7;
    zz.scale.setScalar(0.05 + zk * 0.07);
  });
});
