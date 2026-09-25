// 技 · The companions' skills (Q, or the 技 button). Whoever you walk as (it can change at any
// moment), the skill key runs their signature move — each with its own emote, sound, effects that
// mean something in the world, and a cooldown shown on the button. See data/characters.ts for the
// designs, logic.ts for timings, and the files beside this one for each skill:
//   brush.ts  书生 题诗 · 诗仙 斗酒 · 画师 神笔          nature.ts 园丁 催花 · 渔翁 撒网 · 琴师 高山流水
//   moves.ts  侠客 轻功 · 道童 御风符 · 大橘 猫跃 · 玉兔 月华 · 嫦娥 奔月
//   go.ts     棋士 推演                                horse.ts  关公 赤兔
//   passive.ts the little traces some companions leave as they walk.
import type { WorldCtx, WorldFeature } from '../../types';
import { feature, loadBrush, reducedMotion, type Bag } from '../kit';
import { CHARACTER, type CharacterId } from '../../../../data/characters';
import { record } from '../../../../app/play';
import { hashString, makeRng } from '../../../../core/rng';
import { todayKey } from '../../../../core/date';
import { Fx } from './fx';
import { Cooldowns, SKILL_TIMING } from './logic';
import { VerseDeck, verseEnv } from './verses';
import type { Running, SkillEnv } from './env';
import { Inscriptions, painter, paperCrane, poet, scholar } from './brush';
import { makeFisher, makeGardener, makeMusician } from './nature';
import { Strays, cat, makeChange, makeTaoist, rabbit, swordsman } from './moves';
import { makeGo } from './go';
import { makeGuan } from './horse';
import { Trails } from './passive';
import { closeSkillSound } from './sound';

/** Characters whose glyphs the skills brush (fetched early so the first stroke is in brush). */
const BRUSH_SAMPLE = '题诗酒月花风云山水春秋醉梦仙鹤松竹梅兰菊荷';

function build(bag: Bag, ctx: WorldCtx): void {
  const reduced = reducedMotion();
  const fx = new Fx(bag);
  const day = todayKey();
  const deck = new VerseDeck(hashString('verse:' + day));
  verseEnv.season = ctx.env.season;
  bag.onDispose(() => { verseEnv.season = null; });
  loadBrush(BRUSH_SAMPLE).then(() => { if (!bag.disposed) fx.glyphs.repaint(); });

  let night = ctx.sky.isNight() ? 1 : 0;
  const lingering: ((dt: number, t: number) => boolean)[] = [];
  const env: SkillEnv = {
    ctx, bag, fx, reduced, deck,
    rng: makeRng(hashString('skills:' + day)),
    night: () => night,
    place: () => {
      const d = new Date();
      return { region: ctx.currentRegion(), season: ctx.env.season, hour: d.getHours() + d.getMinutes() / 60, night: ctx.sky.isNight() };
    },
    floorAt: (x, z) => {
      const g = ctx.groundY(x, z);
      const w = ctx.waterAt(x, z);
      return w === null ? g : Math.max(g, w);
    },
    linger: (fn) => { lingering.push(fn); },
    uses: 0,
  };

  // each companion's skill, built lazily where it needs props of its own
  const inscriptions = new Inscriptions(bag);
  let crane: ReturnType<typeof paperCrane> | null = null;
  const strays = new Strays(bag);
  const music = makeMusician(bag);
  const change = makeChange(bag);
  const START: Record<CharacterId, (t: number) => Running | null> = {
    scholar: () => scholar(env, inscriptions),
    gardener: ((g) => () => g(env))(makeGardener(bag)),
    fisher: ((f) => () => f(env))(makeFisher(bag)),
    musician: () => music.start(env),
    swordsman: () => swordsman(env),
    taoist: ((f) => () => f(env))(makeTaoist(bag)),
    painter: () => painter(env, (crane ??= paperCrane(bag))),
    player: ((f) => () => f(env))(makeGo(bag)),
    cat: (t) => cat(env, strays, t),
    rabbit: () => rabbit(env),
    poet: () => poet(env),
    guan: ((f) => () => f(env))(makeGuan(bag)),
    change: () => change.start(env),
  };
  const trails = new Trails();
  const cds = new Cooldowns();
  let run: Running | null = null;
  let runId: CharacterId | null = null;
  let lastChar = ctx.player.character;
  let lastT = -1;
  let waitToast = 0;
  let hudShown = false;
  const hud = { glyph: '', zh: '', en: '', cooldown: 0, active: false };

  const stop = (t: number) => {
    if (!run || !runId) return;
    const r = run, id = runId;
    run = null;
    runId = null;
    try { r.end(); } catch (e) { console.warn('[walk] skill end', e); }
    cds.start(id, t, SKILL_TIMING[id].cooldown);
  };

  bag.frame((dt) => {
    // skills keep real time (a cooldown, the 4 s of 推演) while the world's own clock may be slowed
    const t = performance.now() / 1000;
    const realDt = lastT < 0 ? 0 : Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    night += ((ctx.sky.isNight() ? 1 : 0) - night) * Math.min(1, realDt * 1.5);
    const P = ctx.player;
    const id = P.character;
    if (id !== lastChar) {
      // another companion: whatever the last one was doing ends now
      stop(t);
      lastChar = id;
    }
    const frozenByOther = P.isFrozen && !run?.ownsFreeze;
    if (frozenByOther && run) stop(t);
    if (run) {
      let going = false;
      try { going = run.update(dt, t); } catch (e) { console.error('[walk] skill failed', e); }
      if (!going) stop(t);
    }
    if (ctx.input.skillPressed && !frozenByOther) {
      if (run) run.press?.();
      else if (cds.ready(id, t)) {
        let r: Running | null = null;
        try { r = START[id](t); } catch (e) { console.error('[walk] skill start failed', e); }
        if (r) {
          run = r;
          runId = id;
          env.uses++;
          record('skill');
        }
      } else if (t > waitToast) {
        waitToast = t + 1.6;
        const s = Math.ceil(cds.left(id, t));
        const def = CHARACTER[id].skill;
        ctx.hud.toast(`「${def.zh}」还需 ${s} 息`, `${def.en} is ready in ${s}s`, 1300);
      }
    }
    for (let i = lingering.length - 1; i >= 0; i--) {
      let keep = false;
      try { keep = lingering[i](dt, t); } catch (e) { console.error('[walk] skill linger', e); }
      if (!keep) lingering.splice(i, 1);
    }
    music.update(dt, t);
    change.update(realDt, t, env);
    strays.update(realDt, t, env);
    inscriptions.update(t, night);
    trails.update(env, realDt, t, id);
    fx.update(dt, night, P.position);

    // the 技 button: the glyph, and how far through its cooldown
    if (frozenByOther) {
      if (hudShown) { ctx.hud.skill(null); hudShown = false; }
      return;
    }
    const def = CHARACTER[id].skill;
    hud.glyph = def.glyph;
    hud.zh = def.zh;
    hud.en = def.en;
    hud.active = !!run;
    hud.cooldown = run ? 0 : cds.frac(id, t);
    ctx.hud.skill(hud);
    hudShown = true;
  });

  bag.onDispose(() => {
    if (run) { try { run.end(); } catch { /* the world is going */ } }
    run = null;
    lingering.length = 0;
    try {
      ctx.hud.skill(null);
      ctx.setTimeScale(1);
      ctx.player.setMoveMods(null);
    } catch { /* the world is going */ }
    closeSkillSound();
  });
}

export const skills = feature('skills', build);

export const SKILLS_FEATURES: WorldFeature[] = [skills];
