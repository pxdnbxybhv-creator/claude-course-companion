// 桃源 · 二期: the visit's mood and the echoes (spec §3.8, §6.7).
//   · The last dish eaten sets one mood (memory only; cleared on the way out): 暖 (热, 脆), 甜, 醺 (酒),
//     定 (茶; it clears 醺). Tells: 暖 — a small breath puff from the walker after 3 s standing still (one
//     reused sprite); 醺 — a warm pink edge vignette and a ±0.4° sway (no sway under reduced motion), and
//     the well's 「井 · 洗把脸」 prompt, which clears it. The games and the table read the mood themselves.
//   · 石瞽 reads your step while a dish or a game is fresh (a line before his chat); 夭夭, at dawn, once
//     桃花粥 has been tasted, says the petals in it were hers.
//
// Owner: L. Mounted by life/index.ts.
import type * as T from 'three';
import { play } from '../../../../../app/play';
import { glowTexture, reducedMotion } from '../../kit';
import type { VillagerKey } from '../hooks';
import { DISH_IDS, ateKey, eatKey } from './keys';
import { SHIGU_DISH, SHIGU_GAME, WELL, YAOYAO_CONGEE } from './life-text';
import { gated } from './prompt';
import { TASTE_MOOD } from './food';
import { floorAt } from './board';
import type { DishId, GameId, Line, LifeMount, LifePart, Mood, Taste } from './types';

/** The mood a dish's taste sets (spec §3.8; food.ts TASTE_MOOD, F's): 暖 热/脆 · 甜 · 醺 酒 · 定 茶. */
export function moodOfTaste(t: Taste): Mood {
  return TASTE_MOOD[t];
}

/** How long a dish or a game stays fresh on you (real ms): 石瞽 hears it within this. */
export const FRESH_MS = 4 * 60_000;

/** 石瞽's echo for the freshest thing, or null (pure: the tests call it). */
export function shiguEcho(fresh: { dish?: DishId; game?: GameId } | null): Line | null {
  if (!fresh) return null;
  if (fresh.game) return SHIGU_GAME[fresh.game] ?? null;
  if (fresh.dish) return SHIGU_DISH[fresh.dish] ?? null;
  return null;
}

export const mountMoods: LifeMount = (bag, ctx, tv, life): LifePart => {
  const TH = ctx.THREE;
  const still = reducedMotion();

  // ───────────── what is fresh on you (the last dish eaten, the last game played, this visit)

  let fresh: { dish?: DishId; game?: GameId; at: number; told: boolean } | null = null;
  let ate: Record<string, number> = {};
  const snapAte = () => { const c = play.peek().counters; ate = Object.fromEntries(DISH_IDS.map((d) => [d, c[ateKey(d)] ?? 0])); };
  snapAte();
  let playing: GameId | null = null;
  let yaoTold = false;
  bag.onDispose(tv.onEnter(() => { fresh = null; playing = null; yaoTold = false; snapAte(); }));
  bag.onDispose(tv.onLeave(() => { fresh = null; playing = null; }));

  const watch = () => {
    const c = play.peek().counters;
    for (const d of DISH_IDS) {
      const n = c[ateKey(d)] ?? 0;
      if (n > (ate[d] ?? 0)) fresh = { dish: d, at: performance.now(), told: false };
      ate[d] = n;
    }
    const cur = life.current();
    const g = cur?.kind === 'game' ? cur.game ?? null : null;
    if (g) playing = g;
    else if (playing && !cur) { fresh = { game: playing, at: performance.now(), told: false }; playing = null; }
  };

  // ───────────── 暖: a breath puff after standing still

  let puff: T.Sprite | null = null;
  let puffT = -1;
  let pause = 0;
  let stillFor = 0;
  let last = { x: 0, z: 0 };
  const ensurePuff = (): T.Sprite => {
    if (puff) return puff;
    const tex = bag.own(glowTexture(TH, 32, 0.1));
    const mat = new TH.SpriteMaterial({ map: tex, color: '#f4f1ea', transparent: true, depthWrite: false, opacity: 0 });
    bag.own(mat);
    puff = new TH.Sprite(mat);
    puff.name = 'tyl:breath';
    puff.userData.pocket = true;
    puff.visible = false;
    bag.add(puff, ctx.regionGroup('taoyuan'));
    return puff;
  };

  // ───────────── 醺: the vignette and the sway

  let tipsy: { off: () => void; el: HTMLElement } | null = null;
  const canvas = (): HTMLElement | null => (ctx.renderer?.domElement as HTMLElement | undefined) ?? null;
  const setTipsy = (on: boolean) => {
    if (on && !tipsy) {
      const el = document.createElement('div');
      el.className = 'tyl-tipsy';
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:1;opacity:0;transition:opacity 1.2s ease;'
        + 'background:radial-gradient(ellipse at center, rgba(255,190,190,0) 52%, rgba(236,140,150,0.3) 84%, rgba(210,110,125,0.46) 100%);';
      const off = ctx.hud.mount(el);
      requestAnimationFrame(() => { el.style.opacity = '1'; });
      tipsy = { off, el };
    } else if (!on && tipsy) {
      tipsy.off();
      tipsy = null;
      const c = canvas();
      if (c) c.style.transform = '';
    }
  };
  bag.onDispose(() => setTipsy(false));

  gated(bag, ctx, {
    id: 'tyl:well', position: floorAt(ctx, -3.9, 1.3), radius: 1.3,
    labelZh: WELL.label.zh, labelEn: WELL.label.en, actionZh: WELL.action.zh, actionEn: WELL.action.en,
    act: () => {
      if (life.mood() !== '醺' || life.current()) return;
      life.setMood(null);
      ctx.hud.toast(WELL.done.zh, WELL.done.en, 3200);
    },
  }, () => life.open() && !life.current() && life.mood() === '醺');

  // ───────────── every frame: the tells; every second: what is fresh

  let acc = 0;
  let t = 0;
  bag.frame((dt) => {
    t += dt;
    acc += dt;
    if (acc >= 1) { acc = 0; if (tv.isInside()) watch(); }
    const inside = tv.isInside();
    const m = inside ? life.mood() : null;
    // 醺
    setTipsy(m === '醺' && !life.current());
    if (tipsy && !still) {
      const c = canvas();
      if (c) c.style.transform = `rotate(${(0.4 * Math.sin(t * 0.7)).toFixed(3)}deg) scale(1.012)`;
    }
    // 暖
    const p = ctx.player.position;
    const moved = Math.hypot(p.x - last.x, p.z - last.z);
    last = { x: p.x, z: p.z };
    stillFor = moved < 0.004 ? stillFor + dt : 0;
    if (puffT >= 0) {
      const s = ensurePuff();
      puffT += dt;
      const k = puffT / 1.6;
      if (k >= 1 || m !== '暖') {
        s.visible = false;
        puffT = -1;
        pause = 2.2;
      } else {
        const h = ctx.player.heading;
        s.visible = true;
        s.position.set(p.x + Math.sin(h) * (0.35 + k * 0.3), p.y + 1.52 + k * 0.25, p.z + Math.cos(h) * (0.35 + k * 0.3));
        s.scale.setScalar(0.12 + k * 0.35);
        (s.material as T.SpriteMaterial).opacity = 0.5 * Math.sin(Math.PI * k);
      }
    } else {
      // (a pause between breaths while you stand)
      pause -= dt;
      if (m === '暖' && !ctx.player.isFrozen && stillFor > 3 && pause <= 0) puffT = 0;
    }
  });

  return {
    talkPrefix(k: VillagerKey): Line | null {
      if (k === 'shigu') {
        const f = fresh;
        if (!f || f.told || performance.now() - f.at > FRESH_MS) return null;
        const l = shiguEcho(f);
        if (l) f.told = true;
        return l;
      }
      if (k === 'yaoyao') {
        if (yaoTold || life.part() !== 'dawn' || life.hour() >= 7 || !play.peek().flags[eatKey('zhou')]) return null;
        yaoTold = true;
        return YAOYAO_CONGEE;
      }
      return null;
    },
    dev: {
      fresh: () => fresh,
      moodOf: (taste: Taste) => moodOfTaste(taste),
    },
  };
};
