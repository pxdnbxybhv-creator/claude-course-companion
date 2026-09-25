// 奇遇 · Chance encounters. The director watches where and when the walker is; when the place, the
// hour (and sometimes the season or the companion) are right and the day's roll says yes (see
// logic.ts: the chance rises every day it was due and did not come), it sets the encounter's small
// scene in the world (scenes-*.ts, with the stagehand in stage.ts). One at a time. Arriving at the
// right place and hour for one not yet met, someone mentions it — once a day each.
//
// Skills reach in: the musician's 高山流水 in the bamboo brings the woodcutter out to listen; the
// painter's paper crane leads to a place where a wonder is waiting (it happens there for sure).
import type { WorldFeature } from '../../types';
import { ENCOUNTERS, type EncounterDef } from '../../../../data/encounters';
import { feature, type Bag } from '../kit';
import { busy } from '../minigames/ui';
import { toKey } from '../../../../core/date';
import { encounterMet, play } from '../../../../app/play';
import { REGION } from '../../map';
import { Stage, type Scene } from './stage';
import { RULES, RUMOURS, doneToday, happensToday, misses, noteDone, noteMiss, noteRumour, rumourFor, variantFor, type Memory, type Moment } from './logic';
import { loadMemory, saveMemory } from './memory';
import { SCENES } from './scenes';
import { laterGifts } from './later';

/** Place-bound encounters first; the ones that can happen anywhere give way to them. */
const ORDER: EncounterDef[] = [...ENCOUNTERS.filter((d) => d.region !== 'any'), ...ENCOUNTERS.filter((d) => d.region === 'any')];

export const encounters = feature('encounters', (bag, ctx) => {
  const day = toKey(ctx.env.date);
  let mem: Memory = loadMemory();
  const put = (m: Memory) => { if (m !== mem) { mem = m; saveMemory(m); } };

  const moment = (): Moment => ({
    day, tod: ctx.env.tod, hour: ctx.env.hour, night: ctx.sky.isNight(), season: ctx.env.season, moon: ctx.env.moonPhase,
    region: ctx.currentRegion(), who: ctx.player.character, festivals: ctx.env.festivals,
  });
  const met = (id: string) => encounterMet(play.value, id);
  const variantNew = (d: EncounterDef, m: Moment) => {
    const v = variantFor(d, m.who);
    return !!v && !play.value.flags[`qyv:${d.id}:${v}`];
  };

  let active: { stage: Stage; scene: Scene | null; def: EncounterDef; at: number } | null = null;
  let clock = 0;
  /** Encounters that will happen for certain today (a skill called them). */
  const forced = new Set<string>();
  /** Encounters not to set again for a while (taken down unmet: the herd-boy does not pop up again at once). */
  const cool = new Map<string, number>();
  /** The painter's crane was sent: the next wonder due where it leads is sure to come. */
  let craneUntil = -1;

  function takeDown(): void {
    if (!active) return;
    const a = active;
    active = null;
    if (!a.stage.finished) cool.set(a.def.id, clock + (a.scene?.roaming ? 150 : 25));
    a.stage.dispose();
  }

  async function start(d: EncounterDef): Promise<void> {
    const build = SCENES[d.id];
    if (!build || active) return;
    const parent = d.region === 'any' ? ctx.scene : ctx.regionGroup(d.region);
    const stage = new Stage(ctx, d, parent, day, (s) => {
      put(noteDone(mem, d.id, day));
      forced.delete(d.id);
      // a finished scene lingers while the walker is near, then goes (see tick)
      if (active?.stage === s) active.at = clock;
    }, (key) => put({ ...mem, later: { ...mem.later, [key]: day } }));
    active = { stage, scene: null, def: d, at: clock };
    try {
      const scene = await build(stage);
      if (active?.stage !== stage || !stage.alive) { stage.dispose(); return; }
      active.scene = scene;
    } catch (e) {
      console.warn('[walk] encounter', d.id, e);
      if (active?.stage === stage) active = null;
      stage.dispose();
    }
  }

  function tick(): void {
    if (active) {
      const { stage, scene } = active;
      if (!scene) return;
      if (stage.abandoned && !stage.finished) { takeDown(); return; }
      const far = stage.dist(scene.x, scene.z);
      if (stage.finished) {
        if (far > scene.r + 25 || (clock - active.at > 240 && far > 16)) takeDown();
      } else if (scene.roaming) {
        if (!stage.engaged && far > scene.r + 60) takeDown();
      } else if (far > scene.r + (stage.engaged ? 90 : 45)) takeDown();
      return;
    }
    if (busy(ctx) || ctx.player.isFrozen) return;
    const m = moment();
    for (const d of ORDER) {
      if (!SCENES[d.id] || doneToday(mem, d.id, day)) continue;
      if ((cool.get(d.id) ?? -1) > clock) continue;
      const r = RULES[d.id];
      if (!r || !r.when(m)) continue;
      const guided = craneUntil > clock && d.region !== 'any' && d.region === m.region && !met(d.id);
      if (forced.has(d.id) || guided || happensToday(d.id, m, misses(mem, d.id), met(d.id), variantNew(d, m))) {
        if (guided) ctx.hud.toast('纸鹤落在这里，停了停——此地似有奇遇。', 'The paper crane settles here a moment — something is waiting.', 3600);
        craneUntil = guided ? -1 : craneUntil;
        void start(d);
        return;
      }
      put(noteMiss(mem, d.id, day));
    }
  }

  let acc = 0;
  bag.frame((dt) => {
    clock += dt;
    // the painter sends the crane (Q / 技)
    if (ctx.input.skillPressed && ctx.player.character === 'painter') craneUntil = clock + 600;
    acc += dt;
    if (acc < 1.2) return;
    acc = 0;
    tick();
  });

  // rumours, a little after arriving (the place's own banner first)
  let rumourTimer = 0;
  bag.onDispose(ctx.onRegion((r) => {
    rumourTimer++;
    const mine = rumourTimer;
    if (r === null) return;
    bag.later(4200, () => {
      if (mine !== rumourTimer || ctx.currentRegion() !== r) return;
      const m = moment();
      const d = rumourFor(ORDER, m, mem, met);
      if (!d) return;
      put(noteRumour(mem, d.id, day));
      const rm = RUMOURS[d.id];
      if (rm) ctx.hud.toast(rm.zh, rm.en, 5200);
    });
  }));

  // the musician plays in the bamboo: the woodcutter will come
  const onMusic = (e: Event) => {
    const det = (e as CustomEvent<{ x: number; z: number }>).detail;
    if (!det) return;
    const c = REGION.bamboo.center;
    if (Math.hypot(det.x - c.x, det.z - c.z) > REGION.bamboo.radius * 1.3) return;
    if (doneToday(mem, 'zhiyin', day) || ctx.sky.isNight()) return;
    if (!forced.has('zhiyin')) forced.add('zhiyin');
  };
  window.addEventListener('banmu:music', onMusic);
  bag.onDispose(() => window.removeEventListener('banmu:music', onMusic));

  bag.onDispose(() => { active?.stage.dispose(); active = null; });

  // consequences from other days (the fox's basket at the garden gate…)
  laterGifts(bag as Bag, ctx, () => mem, put, day);

  if (import.meta.env.DEV) {
    // DEV: window.__qiyu — force an encounter now ('zhiyin'), see what is on, read the memory
    (window as unknown as { __qiyu?: unknown }).__qiyu = {
      start: (id: string) => { takeDown(); const d = ENCOUNTERS.find((e) => e.id === id); if (d) void start(d); },
      active: () => (active ? { id: active.def.id, finished: active.stage.finished, engaged: active.stage.engaged, scene: active.scene } : null),
      prompts: () => (active ? active.stage.prompts.map((i) => ({ id: i.id, x: +i.position.x.toFixed(2), y: +i.position.y.toFixed(2), z: +i.position.z.toFixed(2), r: i.radius })) : []),
      memory: () => mem,
      moment,
      stop: takeDown,
    };
    bag.onDispose(() => { delete (window as unknown as { __qiyu?: unknown }).__qiyu; });
  }
});

export const ENCOUNTERS_FEATURES: WorldFeature[] = [encounters];
