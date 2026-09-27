// 桃源 · the pocket valley (see features/taoyuan/*): at build, only its door at the waterfall pool; the
// valley itself is built on the first way in, behind the veil (features/taoyuan/world.ts).
import type { RegionModule, WorldCtx } from '../types';
import { createTaoyuan, type TaoyuanWorld } from '../features/taoyuan/world';
import { ANCHORS, PLACES } from '../features/taoyuan/places';

const live = new Set<TaoyuanWorld>();

export const taoyuanRegion: RegionModule = {
  id: 'taoyuan',
  build(ctx: WorldCtx) {
    const tv = createTaoyuan(ctx);
    live.add(tv);
    if (import.meta.env.DEV) devHooks(tv);
  },
  dispose() {
    for (const tv of live) tv.dispose();
    live.clear();
    if (import.meta.env.DEV) delete (window as unknown as { __taoyuan?: unknown }).__taoyuan;
  },
};

/** DEV: window.__taoyuan — go in and out, turn the clock, play an effect, pin the door. */
function devHooks(tv: TaoyuanWorld): void {
  (window as unknown as { __taoyuan?: unknown }).__taoyuan = {
    tv,
    enter: (o?: Parameters<TaoyuanWorld['enter']>[0]) => tv.enter(o),
    leave: (o?: Parameters<TaoyuanWorld['leave']>[0]) => tv.leave(o),
    clock: (s: Parameters<TaoyuanWorld['setClock']>[0], secs?: number) => tv.setClock(s, { secs }),
    /** Play an effect by its method name on the effects library (tv.fx), e.g. fx('da') or fx('skyLanterns', { n: 20 }). */
    fx: (name: string, ...args: unknown[]) => {
      const fx = tv.fx as unknown as Record<string, (...a: unknown[]) => unknown> | null;
      if (!fx || typeof fx[name] !== 'function') return `no effect "${name}" (build the valley first: __taoyuan.enter())`;
      return fx[name](...args);
    },
    door: (s: Parameters<TaoyuanWorld['setDoorState']>[0]) => tv.setDoorState(s),
    shrineDoor: (open: boolean) => tv.shrineDoor(open),
    places: PLACES,
    anchors: ANCHORS,
  };
}
