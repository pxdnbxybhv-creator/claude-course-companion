// 桃源 · 二期「常住」: everyday life in the valley after the story (spec §1–§7). This feature makes the
// world's LifeApi (the goods in kind, the visit's mood and hour, the gate, the one `taoyuan-life`
// claim and the one idempotent restore), answers the story through taoyuanHooks.life, and mounts
// every builder's module with it: the 特写 (P), the table (F), the games (G), and L's own (the board and
// the festival, the stalls and 留一碗, the moods and the echoes, 歇一歇 and 开饭). It also keeps the 食单
// chip's `lifeHere` and writes the visit's day (`tyl:lastday`) on every way in.
//
// Owner: L. Registered in features/index.ts after the story and the case.
import type { CharacterId } from '../../../../../data/characters';
import { play, record, recordMax } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { feature } from '../../kit';
import { begin, end } from '../../minigames/ui';
import { taoyuan, type TaoyuanWorld } from '../world';
import { engine } from '../engine';
import { seeFocus } from '../valley';
import { partOf, type Part } from '../folk';
import { taoyuanHooks, type LifeHooks, type VillagerKey, type VillagerPrompt } from '../hooks';
import type { Line } from '../text';
import { lifeOpen } from './gate';
import { setLife } from './api';
import { LAST_DAY, LIFE_CLAIM, dailyCount, dayNumber, gotKey, keptOf, stockFrom, usedKey } from './keys';
import { makeRestorer, restoreTargetOf } from './restore';
import { mountPV } from './pv';
import { mountTable } from './table';
import { mountGames } from './games/frame';
import { mountBoard } from './board';
import { mountStalls } from './stalls';
import { mountMoods } from './moods';
import { mountRest } from './rest';
import { lifeHere } from '../../../shidan/state';
import type { KindId, LifeActivity, LifeApi, LifeMount, LifePart, Mood } from './types';

/**
 * Every module mounted with the life API, in order (their prompts are asked in this order too): the
 * 特写 (P), the table (F), the games (G), then L's own — the board and the festival, the stalls and
 * the covered bowl, the moods and the echoes, 歇一歇 and 开饭.
 */
const MOUNTS: LifeMount[] = [mountPV, mountTable, mountGames, mountBoard, mountStalls, mountMoods, mountRest];

export const taoyuanLife = feature('taoyuan-life', (bag, ctx) => {
  const found = taoyuan(ctx);
  if (!found) return;
  const tv: TaoyuanWorld = found;
  const eng = engine(ctx);

  // ───────────── this visit (memory only)

  let mood: Mood | null = null;
  let current: LifeActivity | null = null;

  const restorer = makeRestorer(restoreTargetOf(ctx, seeFocus, (k) => {
    try { return taoyuanHooks.story?.villager(k) ?? null; } catch { return null; }
  }));

  const storyRunning = (): boolean => {
    try { return taoyuanHooks.story?.running() ?? false; } catch { return false; }
  };

  const api: LifeApi = {
    grant(kind: KindId, n: number): number {
      const kept = keptOf(play.peek().counters, kind, n);
      if (kept > 0) record(gotKey(kind), kept);
      return kept;
    },
    stock: (kind) => stockFrom(play.peek().counters, kind),
    use(kind) {
      if (stockFrom(play.peek().counters, kind) < 1) return false;
      record(usedKey(kind));
      return true;
    },
    today: (key) => dailyCount(play.peek().daily, today.value, key),
    day: () => today.value,

    mood: () => mood,
    setMood(m) { mood = m; },
    part(): Part {
      // (the painted hour: what the sky shows, as the story's partNow reads it)
      const tod = eng.moodTod();
      return tod === 'dawn' || tod === 'day' || tod === 'dusk' || tod === 'night' ? tod : partOf(api.hour());
    },
    hour: () => tv.hour(),

    open: () => tv.isInside() && lifeOpen(play.peek().flags, storyRunning()),
    claim(a) {
      if (current) return false;
      if (!begin(ctx, LIFE_CLAIM)) return false;
      current = a;
      restorer.arm();
      return true;
    },
    release(a) {
      if (current !== a) return;
      current = null;
      end(ctx, LIFE_CLAIM);
      restorer.restore();
    },
    current: () => current,
    borrow(k, at) {
      const h = taoyuanHooks.story?.villager(k);
      if (!h) return;
      restorer.borrowed(k);
      h.place(at);
    },
    defer: (fn) => restorer.defer(fn),
    restore: () => restorer.restore(),
  };

  /** Stop whatever runs, silently, give the claim back and put the world back (the way out, dispose). */
  function halt(): void {
    const a = current;
    current = null;
    if (a) {
      try { a.stop(); } catch (e) { console.error('[walk] taoyuan life stop', e); }
      end(ctx, LIFE_CLAIM);
    }
    restorer.restore();
  }

  setLife(ctx, api);
  bag.onDispose(() => setLife(ctx, null));

  // ───────────── the modules

  const parts: LifePart[] = [];
  for (const m of MOUNTS) {
    try {
      const p = m(bag, ctx, tv, api);
      if (p) parts.push(p);
    } catch (e) {
      console.error('[walk] taoyuan life module failed', e);
    }
  }

  // ───────────── the story's seam

  const hooks: LifeHooks = {
    prompt(k: VillagerKey): VillagerPrompt | null {
      if (current || !api.open()) return null;
      for (const p of parts) {
        try { const r = p.prompt?.(k) ?? null; if (r) return r; } catch (e) { console.error('[walk] taoyuan life prompt', e); }
      }
      return null;
    },
    async leaving(): Promise<boolean> {
      const a = current;
      if (!a) return true;
      let go = true;
      try { go = await a.leaving(); } catch (e) { console.error('[walk] taoyuan life leaving', e); }
      if (go) api.release(a);
      return go;
    },
    talkPrefix(k: VillagerKey, who: CharacterId): Line | null {
      if (!api.open()) return null;
      for (const p of parts) {
        try { const r = p.talkPrefix?.(k, who) ?? null; if (r) return r; } catch (e) { console.error('[walk] taoyuan life talk prefix', e); }
      }
      return null;
    },
    busy: () => current !== null,
  };
  taoyuanHooks.life = hooks;
  bag.onDispose(() => { if (taoyuanHooks.life === hooks) taoyuanHooks.life = null; });

  // ───────────── the way out, and the world going

  bag.onDispose(tv.onLeave(() => {
    halt();
    mood = null;
    lifeHere.value = false;
  }));
  bag.onDispose(() => { halt(); lifeHere.value = false; });

  // ───────────── every way in: the visit's day (the absence letter reads it); the chip's signal

  bag.onDispose(tv.onEnter(() => {
    if (lifeOpen(play.peek().flags, false)) recordMax(LAST_DAY, dayNumber(today.value));
  }));
  let acc = 1;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    const here = tv.isInside() && lifeOpen(play.peek().flags, false);
    if (lifeHere.value !== here) lifeHere.value = here;
  });

  // ───────────── DEV: window.__tylife

  if (import.meta.env.DEV) {
    const w = window as unknown as { __tylife?: Record<string, unknown> };
    const dev: Record<string, unknown> = {
      api,
      open: () => api.open(),
      current: () => current?.kind ?? null,
      stock: () => Object.fromEntries((['yu', 'shen', 'qu', 'dan', 'jun', 'shu'] as const).map((k) => [k, api.stock(k)])),
      grant: (k: KindId, n = 1) => api.grant(k, n),
      mood: (m?: Mood | null) => { if (m !== undefined) api.setMood(m); return api.mood(); },
      restore: () => halt(),
    };
    for (const p of parts) if (p.dev) Object.assign(dev, p.dev);
    w.__tylife = dev;
    bag.onDispose(() => { if (w.__tylife === dev) delete w.__tylife; });
  }
});

export const TAOYUAN_LIFE_FEATURES = [taoyuanLife];
