// 桃源 · 二期: the valley's day made visible (spec §6.1, §6.2, §6.6) —
//   · 今日谷中: the board on the 花神杆, a card written as 秦's register page (daily.ts boardFor);
//   · 小满's news at the mouth, the first way in of the day, matching the board;
//   · 外头的节: on a festival day, the lane lanterns light early at 暮 and 秦 asks what festival it is.
//
// Owner: L. Mounted by life/index.ts.
import type * as T from 'three';
import type { FestivalKey, WorldCtx } from '../../../types';
import { play, record } from '../../../../../app/play';
import { seasonOfTerm, termContext } from '../../../../../core/solarterms';
import { taoyuanHooks, type VillagerKey } from '../hooks';
import { VILLAGERS, partOf } from '../folk';
import { engine } from '../engine';
import { CAVE, L, W, Y_T, standAt } from '../places';
import { DISHES } from './food';
import { NEWS } from './keys';
import { boardFor, festivalChoices, festivalDish, festivalName, newsOf, SEASON_DISH } from './daily';
import { BOARD, FEST, NEWS_WHO } from './life-text';
import { gated } from './prompt';
import { lifeOpen } from './gate';
import type { LifeActivity, LifeMount, LifePart, Season } from './types';

/** The outside season you walk in with (桂娘 cooks it; the board posts it). */
export function seasonNow(ctx: WorldCtx): Season {
  try { return seasonOfTerm(termContext(ctx.env.date).current.index); } catch { return 'spring'; }
}
/** Today's festival outside (the first, if two fall together), or null. */
export function festivalNow(ctx: WorldCtx): FestivalKey | null {
  return ctx.env.festivals?.[0] ?? null;
}

/** A point on the valley floor (local x, z), in the world, `dy` above it. */
export function floorAt(ctx: WorldCtx, x: number, z: number, dy = 0): T.Vector3 {
  const w = W(x, z);
  return new ctx.THREE.Vector3(w.x, Y_T + standAt(x, z) + dy, w.z);
}

export const mountBoard: LifeMount = (bag, ctx, tv, life): LifePart => {
  // ───────────── 今日谷中 on the 花神杆

  const board = () => {
    const season = seasonNow(ctx);
    const fest = festivalNow(ctx);
    const dish = DISHES[fest ? festivalDish(fest, season) : SEASON_DISH[season]];
    return boardFor(life.day(), { season, festival: fest, dishName: dish ? { zh: dish.zh, en: dish.en } : null });
  };
  gated(bag, ctx, {
    id: 'tyl:board', position: floorAt(ctx, 0, 0.6), radius: 2.2,
    labelZh: BOARD.label.zh, labelEn: BOARD.label.en, actionZh: BOARD.action.zh, actionEn: BOARD.action.en,
    act: () => {
      if (!life.open() || life.current()) return;
      const b = board();
      ctx.hud.showCard({ titleZh: b.title.zh, titleEn: b.title.en, bodyZh: b.rows.map((r) => r.zh).join('\n'), bodyEn: b.rows.map((r) => r.en).join('\n'), seal: '秦' });
    },
  }, () => life.open() && !life.current());

  // ───────────── 小满's news: the first way in of the day, once out of the cleft

  let newsWait = false;
  bag.onDispose(tv.onEnter(() => { newsWait = life.today(NEWS) === 0; }));
  bag.onDispose(tv.onLeave(() => { newsWait = false; }));
  let acc = 0;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    if (!tv.isInside()) return;
    if (newsWait) {
      const p = ctx.player.position;
      const l = L(p.x, p.z);
      // (past the mouth, the valley open in front of you, and nothing else being said)
      if (l.z < CAVE.mouth - 3 && life.open() && !life.current() && !ctx.player.isFrozen && life.today(NEWS) === 0) {
        newsWait = false;
        const n = newsOf(life.day(), !!festivalNow(ctx));
        record(NEWS);
        ctx.hud.toast(`${NEWS_WHO.zh}：「${n.zh}」`, `${NEWS_WHO.en}: "${n.en}"`, 5200);
      }
    }
    holdFestDusk(1.2);
    lanternsEarly();
  });

  // ───────────── a festival's evening keeps its 暮 inside
  // (中秋, 元宵, 春节: festivalNight() forces the world's night at dusk, and 常 would paint 夜 at 17–19 —
  //  no 席, no festival dish. Once a visit, the valley holds its own 暮 for the dusk hours; rest.ts's
  //  hold loop keeps it, and the way out gives the world's hour back.)
  let festHeld = false;
  function holdFestDusk(secs: number): void {
    if (festHeld || !tv.isInside() || tv.hourHeld || tv.clock !== 'chang' || !festivalNow(ctx)) return;
    if (!lifeOpen(play.peek().flags, false) || partOf(ctx.env.hour) !== 'dusk') return;
    if (engine(ctx).moodTod() !== 'night') return;
    festHeld = true;
    tv.setClock('chang', { secs, hour: ctx.env.hour });
    // (on the way in, everyone at once; later, the story's own second walks them there)
    if (secs === 0) { try { taoyuanHooks.story?.refresh(); } catch (e) { console.error('[walk] taoyuan festival dusk', e); } }
  }
  // (on the way in, after the story has set the valley's hour: every enter listener runs first)
  bag.onDispose(tv.onEnter(() => { festHeld = false; queueMicrotask(() => holdFestDusk(0)); }));
  bag.onDispose(tv.onLeave(() => { festHeld = false; }));

  // ───────────── 外头的节: the lanterns at 暮, and 秦's question

  let lit = false;
  function lanternsEarly(): void {
    // (not life.open(): a chat with 秦 shuts the gate for a moment, and the lanterns stay lit through it)
    const on = !!festivalNow(ctx) && tv.isInside() && life.part() === 'dusk' && lifeOpen(play.peek().flags, false);
    if (on && !lit) { lit = true; tv.fx?.lanterns(true, 450); }
    else if (!on && lit) { lit = false; if (life.part() !== 'night') tv.fx?.lanterns(false, 0); }
  }
  bag.onDispose(tv.onLeave(() => { lit = false; }));

  /** The day 秦 has asked (memory: the festival is the day's, the question once a visit's day). */
  let askedOn = '';
  async function ask(fest: FestivalKey): Promise<void> {
    const a: LifeActivity = { kind: 'board', leaving: async () => true, stop() {} };
    if (!life.claim(a)) return;
    try {
      askedOn = life.day();
      const { keys, right } = festivalChoices(fest, life.day());
      const q = VILLAGERS.qin;
      const choices = keys.map((k) => festivalName(k));
      const i = await ctx.hud.say({ nameZh: q.zh, nameEn: q.en, zh: FEST.ask.zh, en: FEST.ask.en, choices });
      if (i < 0 || !tv.isInside()) return;
      const pick = festivalName(keys[i]);
      const l = i === right ? FEST.right(pick.zh, pick.en) : FEST.wrong(pick.zh, pick.en);
      await ctx.hud.say({ nameZh: q.zh, nameEn: q.en, zh: l.zh, en: l.en });
    } finally {
      life.release(a);
    }
  }

  return {
    prompt(k: VillagerKey) {
      if (k !== 'qin') return null;
      const fest = festivalNow(ctx);
      // (at 暮 — or 夜: a festival outside may hold the world's night, 中秋's moon)
      const p = life.part();
      if (!fest || (p !== 'dusk' && p !== 'night') || askedOn === life.day()) return null;
      const q = VILLAGERS.qin;
      return { label: { zh: q.zh, en: q.en }, action: FEST.ask, act: () => ask(fest) };
    },
    dev: {
      board: () => board(),
      news: () => newsOf(life.day(), !!festivalNow(ctx)),
      festival: () => festivalNow(ctx),
      ask: () => { const f = festivalNow(ctx); return f ? ask(f) : null; },
      story: () => !!taoyuanHooks.story,
    },
  };
};
