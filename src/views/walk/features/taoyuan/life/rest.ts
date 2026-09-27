// 桃源 · 二期: 歇一歇 and 开饭 (spec §6.3, §6.4).
//   · 歇一歇 · Take a rest: on the long-table bench, or on 石瞽's porch. Pick how long to sit (the parts
//     ahead: 晨 → 昼 → 暮 → 夜 → 晨); the camera tilts to the sky for 2.5 s while the valley's own hour
//     turns (tv.setClock('chang', {hour})) and everyone is put where that hour says (story.refresh()).
//     Reduced motion: a 300 ms curtain instead. For this visit only (the next way in reads the world's
//     hour again). Not while a game or a 特写 holds the life claim.
//   · 开饭: whenever the valley's part becomes 晨, 昼 or 暮 (on the way in, or by 歇一歇), a clapper and
//     「开饭喽！」 once per part per visit; at 晨 桂娘 adds 「小满！洗手！」.
//
// Owner: L. Mounted by life/index.ts.
import { reducedMotion } from '../../kit';
import { clapper } from '../../minigames/sound';
import { engine } from '../engine';
import { ANCHORS, CAVE, L } from '../places';
import { VILLAGERS, partOf } from '../folk';
import { taoyuanHooks } from '../hooks';
import { NEXT_PART, REST_HOURS } from './daily';
import { GUINIANG, KAIFAN, REST, WASH_HANDS } from './life-text';
import { gated } from './prompt';
import { floorAt } from './board';
import type { LifeActivity, LifeMount, LifePart, Part } from './types';

/** The parts ahead of `p`, in turn (歇一歇's three choices). */
export function partsAhead(p: Part): Part[] {
  const a = NEXT_PART[p], b = NEXT_PART[a], c = NEXT_PART[b];
  return [a, b, c];
}

export const mountRest: LifeMount = (bag, ctx, tv, life): LifePart => {
  const eng = engine(ctx);
  const still = reducedMotion();
  /** Real-time wait (never fx.wait: reduced motion caps those). */
  const sleep = (ms: number) => new Promise<void>((r) => bag.later(ms, r));

  const when = () => life.open() && !life.current();
  gated(bag, ctx, {
    id: 'tyl:rest:bench', position: floorAt(ctx, 3.3, 1.3), radius: 1.3,
    labelZh: REST.bench.zh, labelEn: REST.bench.en, actionZh: REST.action.zh, actionEn: REST.action.en,
    act: () => rest('bench'),
  }, when);
  const gu = ANCHORS.guPorch;
  const gl = L(gu.x, gu.z);
  gated(bag, ctx, {
    id: 'tyl:rest:porch', position: floorAt(ctx, gl.x + 0.6, gl.z + 1.2), radius: 1.6,
    labelZh: REST.porch.zh, labelEn: REST.porch.en, actionZh: REST.action.zh, actionEn: REST.action.en,
    act: () => rest('porch'),
  }, when);

  /** 石瞽 is on his porch now (within 3 m of it). */
  const shiguHome = (): boolean => {
    try {
      const h = taoyuanHooks.story?.villager('shigu');
      if (!h) return false;
      const p = h.position();
      return Math.hypot(p.x - gu.x, p.z - gu.z) < 3;
    } catch { return false; }
  };

  let busy = false;
  async function rest(where: 'bench' | 'porch'): Promise<void> {
    if (busy || !when()) return;
    let stopped = false;
    const a: LifeActivity = {
      kind: 'rest',
      // (出谷 mid-rest: the hour has already turned or not; either way, go)
      leaving: async () => { stopped = true; return true; },
      stop: () => { stopped = true; },
    };
    if (!life.claim(a)) return;
    busy = true;
    try {
      const ahead = partsAhead(life.part());
      const choices = [...ahead.map((p) => REST.until[p]), REST.stay];
      const byGu = where === 'porch' && shiguHome();
      const who = byGu ? { zh: VILLAGERS.shigu.zh, en: VILLAGERS.shigu.en } : { zh: '', en: '' };
      const line = byGu ? REST.shigu : REST.narr;
      const i = await ctx.hud.say({ nameZh: who.zh, nameEn: who.en, zh: line.zh, en: line.en, choices });
      if (stopped || i < 0 || i >= ahead.length || !tv.isInside()) return;
      await pass(REST_HOURS[ahead[i]], () => stopped);
    } finally {
      busy = false;
      life.release(a);
    }
  }

  /** The hour passes while you look at the sky (or behind a short curtain). */
  async function pass(hour: number, gone: () => boolean): Promise<void> {
    ctx.player.freeze(true);
    const turn = () => {
      tv.setClock('chang', { secs: still ? 0 : 2.5, hour });
      try { taoyuanHooks.story?.refresh(); } catch (e) { console.error('[walk] taoyuan rest refresh', e); }
    };
    if (still) {
      const c = curtain();
      life.defer(c.off);
      await c.up;
      if (gone()) return;
      turn();
      await sleep(300);
      c.off();
      return;
    }
    const p = ctx.player.position;
    const h = ctx.player.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    void eng.cinematic({
      to: { x: p.x - fx * 2.4, y: p.y + 1.5, z: p.z - fz * 2.4 },
      look: { x: p.x + fx * 5, y: p.y + 10, z: p.z + fz * 5 },
      secs: 1.1, hold: 3.2,
    });
    await sleep(1000);
    if (gone()) return;
    turn();
    await sleep(2500);
    if (gone()) return;
    eng.endCinematic();
    await sleep(600);
  }

  /**
   * A plain ink curtain (reduced motion): a 150 ms fade to paper and back. `up` resolves once it is
   * opaque (counted from the frame that starts the fade, so a slow frame never shows the hour turn).
   */
  function curtain(): { off: () => void; up: Promise<void> } {
    const d = document.createElement('div');
    d.className = 'tyl-curtain';
    d.style.cssText = 'position:fixed;inset:0;background:#efe6d2;opacity:0;transition:opacity 150ms linear;pointer-events:none;z-index:40;';
    const unmount = ctx.hud.mount(d);
    const up = new Promise<void>((res) => {
      // (a hidden tab runs no frames: never wait more than 700 ms for one)
      const fallback = setTimeout(res, 700);
      requestAnimationFrame(() => { d.style.opacity = '1'; setTimeout(() => { clearTimeout(fallback); res(); }, 170); });
    });
    let gone = false;
    const off = () => {
      if (gone) return;
      gone = true;
      d.style.opacity = '0';
      setTimeout(unmount, 180);
    };
    return { off, up };
  }

  // ───────────── the painted hour holds (a feature's night or a picture can repaint 常 from the world's hour)

  let acc = 0;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    if (!tv.isInside()) return;
    if (tv.hourHeld && eng.moodNow() === 'chang' && eng.moodTod() !== partOf(tv.hour()) && !busy) {
      tv.setClock('chang', { secs: 1.2, hour: tv.hour() });
    }
    kaifan();
  });

  // ───────────── 开饭

  const said = new Set<Part>();
  let openSince = -1;
  bag.onDispose(tv.onEnter(() => { said.clear(); openSince = -1; }));
  bag.onDispose(tv.onLeave(() => { said.clear(); openSince = -1; }));
  function kaifan(): void {
    const p = ctx.player.position;
    const out = L(p.x, p.z).z < CAVE.mouth - 3;
    if (!out || !life.open() || life.current() || ctx.player.isFrozen) { if (!out) openSince = -1; return; }
    const now = performance.now();
    if (openSince < 0) openSince = now;
    // (a moment after the way in: 小满's news first)
    if (now - openSince < 6000) return;
    const part = life.part();
    if (part === 'night' || said.has(part)) return;
    said.add(part);
    try { clapper(); } catch { /* optional */ }
    ctx.hud.toast(`${GUINIANG.zh}：「${KAIFAN.zh}」`, `${GUINIANG.en}: "${KAIFAN.en}"`, 3200);
    if (part === 'dawn') bag.later(2600, () => { if (tv.isInside()) ctx.hud.toast(`${GUINIANG.zh}：「${WASH_HANDS.zh}」`, `${GUINIANG.en}: "${WASH_HANDS.en}"`, 3200); });
  }

  return {
    dev: {
      rest: (where: 'bench' | 'porch' = 'bench') => rest(where),
      pass: async (hour: number) => {
        const a: LifeActivity = { kind: 'rest', leaving: async () => true, stop() {} };
        if (!life.claim(a)) return false;
        try { await pass(hour, () => false); } finally { life.release(a); }
        return true;
      },
      hour: () => tv.hour(),
    },
  };
};
