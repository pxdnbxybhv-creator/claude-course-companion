// 落花为证 · the companions as tools (story bible §4.6), lent through the 技 while the case is open
// inside the valley: 大橘's nose (the scent view), 玉兔's ears (footsteps as ink ripples), 画师's paper
// crane (to the nearest thing not yet found), 棋士's 复盘 at the altar (the "official" version replayed
// in ink) and 道童's wind in the courtyard (every print shows). None of them is ever needed: each is a
// faster way to something anyone can reach (the rest are lines in the talks, case-world.ts).
import type { WorldCtx } from '../../types';
import type { CharacterId } from '../../../../data/characters';
import { flag } from '../../../../app/play';
import type { Running, SkillEnv } from '../skills/env';
import { HUE, TAU, clamp01, damp } from '../skills/env';
import { CELL, MODE } from '../skills/fx';
import { paperCrane } from '../skills/brush';
import { clack, flap, meow, paper, shimmer, wind } from '../skills/sound';
import type { SkillLoan } from '../skills';
import type { TaoyuanWorld } from './world';
import { ANCHORS, L, W, Y_T, standAt } from './places';
import type { VillagerKey } from './hooks';
import * as K from './case';

type XYZ = { x: number; y: number; z: number };
type Flags = Readonly<Record<string, true | undefined>>;

/** What the case lends its tools. */
export interface ToolWorld {
  ctx: WorldCtx;
  tv: TaoyuanWorld;
  /** Inside the valley, the case open, nothing of the case's under way. */
  active(): boolean;
  flags(): Flags;
  discover(k: K.ClueKey): Promise<void>;
  /** 道童's wind: the prints shine and C5 is found. */
  windPrints(): Promise<void>;
  /** What is not yet found and where (for the crane). */
  targets(): { key: string; at: XYZ; where: K.Line }[];
  villagerAt(k: VillagerKey): XYZ | null;
  say(by: VillagerKey | 'me' | 'bird' | 'narr', l: K.Line): Promise<number>;
  /** 三娘's way home (valley-local), where the wine dripped. */
  trail: [number, number][];
}

const flat = (a: XYZ, b: XYZ) => Math.hypot(a.x - b.x, a.z - b.z);
const at = (x: number, z: number, up = 0): XYZ => { const w = W(x, z); return { x: w.x, y: Y_T + standAt(x, z) + up, z: w.z }; };

export function caseTools(w: ToolWorld): SkillLoan {
  const { ctx } = w;
  const tr = (l: K.Line) => (ctx.lang === 'zh' ? l.zh : l.en);
  const toast = (l: K.Line, ms = 3600) => ctx.hud.toast(l.zh, l.en, ms);
  const nearAltar = () => { const p = ctx.player.position, a = ANCHORS.incense; return flat(p, a) < 3.2 && Math.abs(p.y - a.y) < 2.2; };
  const inCourt = () => { const p = ctx.player.position, c = ANCHORS.courtyard; const l = L(p.x, p.z); return Math.abs(l.x) < 4.3 && l.z < -17.1 && l.z > -22.5 && Math.abs(p.y - c.y) < 2.5; };
  let crane: ReturnType<typeof paperCrane> | null = null;

  /** 大橘 · 嗅: amber wine wisps along 三娘's way home, green mulberry wisps by the silk room, a child's trail to the hollow. */
  function scent(env: SkillEnv): Running {
    const P = ctx.player;
    P.emote('skill');
    meow(0.9, 0.5);
    toast(K.TOOLS.cat.note, 4200);
    const pts = w.trail.map(([x, z]) => at(x, z, 0.3));
    const f = w.flags();
    const child = !f[K.CASE_FLAGS.found];
    if (child) setTimeout(() => toast(K.TOOLS.cat.hollow, 4200), 1800);
    const silk = ANCHORS.silkTray;
    let t0 = -1, acc = 0, sniffed = false;
    return {
      update(dt, t) {
        if (t0 < 0) t0 = t;
        const k = t - t0;
        acc += dt * (env.reduced ? 18 : 42);
        const p = P.position;
        while (acc > 1) {
          acc -= 1;
          // wine: a point along the trail, those near the walker more often
          const i = Math.floor(Math.random() * (pts.length - 1));
          const a = pts[i], b = pts[i + 1], u = Math.random();
          const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u, y = a.y + (b.y - a.y) * u;
          if (Math.hypot(x - p.x, z - p.z) > 34 && Math.random() < 0.7) continue;
          env.fx.air.emit({ x, y: y + Math.random() * 0.3, z, vx: (Math.random() - 0.5) * 0.2, vy: 0.12 + Math.random() * 0.12, vz: (Math.random() - 0.5) * 0.2, drag: 0.6, life: 2.8, size: 0.34 + Math.random() * 0.2, grow: 1.6, color: HUE.amber, alpha: 0.95, mode: MODE.glow, cell: CELL.soft, fadeIn: 0.5 });
          if (Math.random() < 0.25) env.fx.air.emit({ x: silk.x + (Math.random() - 0.5) * 3, y: silk.y + Math.random() * 0.6, z: silk.z + (Math.random() - 0.5) * 3, vy: 0.1, drag: 0.6, life: 2.2, size: 0.24, grow: 1.5, color: HUE.jade, alpha: 0.6, mode: MODE.glow, cell: CELL.soft, fadeIn: 0.4 });
          if (child && Math.random() < 0.3) {
            const h = ANCHORS.hollow, v = Math.random();
            env.fx.air.emit({ x: p.x + (h.x - p.x) * v, y: p.y + 0.4 + (h.y - p.y) * v, z: p.z + (h.z - p.z) * v, vy: 0.1, drag: 0.6, life: 2, size: 0.18, grow: 1.4, color: HUE.peach, alpha: 0.6, mode: MODE.glow, cell: CELL.soft, fadeIn: 0.3 });
          }
        }
        // a nose to the cellar or the altar's corner: found at once
        if (!sniffed && k > 0.6) {
          const g = w.flags();
          if (!g[K.clueFlag('feng')] && flat(p, ANCHORS.cellarJar) < 4) { sniffed = true; flag(K.addFlag('feng:cat')); void w.say('me', { zh: '土味。', en: 'Dirt.' }).then(() => w.discover('feng')); }
          else if (!g[K.clueFlag('beiyin')] && flat(p, ANCHORS.altarLeft) < 2.2) { sniffed = true; flag(K.addFlag('beiyin')); void w.say('me', { zh: '甜的，不是酒。', en: 'Sweet. Not wine.' }).then(() => w.discover('beiyin')); }
        }
        return k < 10;
      },
      end() { /* the wisps fade by themselves */ },
    };
  }

  /** 玉兔 · 听: every footstep near her becomes a ring of ink marked 嗒 (a clear tooth) or 咚 (a dull one). */
  function ears(env: SkillEnv): Running {
    const P = ctx.player;
    P.emote('skill');
    shimmer(0.5);
    toast(K.TOOLS.rabbit.note, 3600);
    type Rip = { h: number; x: number; y: number; z: number; age: number; size: number };
    const rips: Rip[] = [];
    // (the night is held under a knee-high mist: the sounds ripple out on its surface, and their glyphs rise above it)
    const ripple = (x: number, y: number, z: number, ch: '嗒' | '咚') => {
      const h = env.fx.glyphs.add(ch, ch === '嗒' ? HUE.ink : HUE.indigo);
      rips.push({ h, x, y: y + 1.0, z, age: 0, size: ch === '嗒' ? 0.42 : 0.52 });
      env.fx.ground.emit({ x, y: y + 0.9, z, life: 1.5, size: 0.3, grow: ch === '咚' ? 5.5 : 3.6, color: ch === '咚' ? HUE.indigo : HUE.ink, alpha: 0.6, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.8 });
    };
    const last = { x: P.position.x, z: P.position.z };
    let walked = 0;
    const sang = w.villagerAt('sang');
    const near = sang && flat(sang, P.position) < 32;
    let beat = 0, t0 = -1, told = false;
    return {
      update(dt, t) {
        if (t0 < 0) t0 = t;
        const k = t - t0;
        const p = P.position;
        walked += Math.hypot(p.x - last.x, p.z - last.z);
        last.x = p.x; last.z = p.z;
        if (walked > 0.55) { walked = 0; ripple(p.x, p.y, p.z, '嗒'); }
        if (near && sang) {
          beat += dt;
          if (beat > 0.48) {
            beat = 0;
            const clear = Math.floor(k / 0.48) % 2 === 0;
            ripple(sang.x + (clear ? -0.1 : 0.1), sang.y, sang.z, clear ? '嗒' : '咚');
            if (!told) { told = true; flag(K.addFlag('sang')); setTimeout(() => toast(K.TOOLS.rabbit.sang, 4600), 900); }
          }
        }
        for (let i = rips.length - 1; i >= 0; i--) {
          const r = rips[i];
          r.age += dt;
          const a = r.age < 0.2 ? r.age / 0.2 : Math.max(0, 1 - (r.age - 0.2) / 1.4);
          env.fx.glyphs.set(r.h, r.x, r.y + r.age * 0.25, r.z, r.size * (1 + r.age * 0.3), a * 0.9, 1);
          if (r.age > 1.6) { env.fx.glyphs.remove(r.h); rips.splice(i, 1); }
        }
        return k < 9 || rips.length > 0;
      },
      end() { for (const r of rips.splice(0)) env.fx.glyphs.remove(r.h); },
    };
  }

  /** 画师 · 纸鹤: the crane flies to the nearest thing not yet found, and circles over it. */
  function craneTo(env: SkillEnv): Running {
    const P = ctx.player;
    const p0 = P.position;
    const all = w.targets();
    const tg = all.sort((a, b) => flat(a.at, p0) - flat(b.at, p0))[0] ?? null;
    P.emote('skill');
    paper(6, 0.6);
    flap(0.5);
    crane ??= paperCrane(env.bag);
    const c = crane;
    const mine = ++c.flight;
    c.mesh.visible = true;
    c.setBeat(1);
    const TH = ctx.THREE;
    const m = new TH.Matrix4(), q = new TH.Quaternion(), e = new TH.Euler(0, 0, 0, 'YXZ'), v = new TH.Vector3(), s = new TH.Vector3();
    const circling = !tg;
    const cx = tg ? tg.at.x : p0.x, cz = tg ? tg.at.z : p0.z;
    let x = p0.x + Math.sin(P.heading) * 0.5, z = p0.z + Math.cos(P.heading) * 0.5, y = p0.y + 1.25;
    let heading = circling ? P.heading : Math.atan2(cx - x, cz - z);
    let phase: 'rise' | 'fly' | 'circle' | 'gone' = 'rise';
    let pt = 0, ca = 0;
    const speed = Math.max(5, (tg ? flat(tg.at, p0) : 0) / 9);
    if (tg) toast(K.TOOLS.painter.to(tg.where), 4200); else toast(K.TOOLS.painter.none, 3600);
    env.linger((dt, t) => {
      if (phase === 'gone') return false;
      if (c.flight !== mine) { phase = 'gone'; return false; }
      c.setTime(t);
      pt += dt;
      const floor = env.floorAt(x, z);
      if (phase === 'rise') {
        y = damp(y, floor + 2.4, 4, dt);
        x += Math.sin(heading) * dt * 1.4;
        z += Math.cos(heading) * dt * 1.4;
        if (pt > 0.8) { phase = circling ? 'circle' : 'fly'; pt = 0; ca = Math.atan2(x - cx, z - cz); }
      } else if (phase === 'fly') {
        const want = Math.atan2(cx - x, cz - z);
        let d = want - heading;
        while (d > Math.PI) d -= TAU;
        while (d < -Math.PI) d += TAU;
        heading += d * Math.min(1, dt * 3);
        x += Math.sin(heading) * speed * dt;
        z += Math.cos(heading) * speed * dt;
        y = damp(y, floor + 2.2 + Math.sin(pt * 1.3) * 0.2, 3, dt);
        if (Math.hypot(cx - x, cz - z) < 1.8 || pt > 20) {
          phase = 'circle'; pt = 0; ca = Math.atan2(x - cx, z - cz);
          // (on the courtyard: it settles on the patched prints)
          if (tg?.key === 'zuji' && !w.flags()[K.addFlag('zuji')]) { flag(K.addFlag('zuji')); toast(K.CLUE.zuji.addenda[0].line, 4600); }
        }
      } else if (phase === 'circle') {
        ca += dt * 1.3;
        const r = circling ? 2.4 : 1.6;
        const nx = cx + Math.sin(ca) * r, nz = cz + Math.cos(ca) * r;
        heading = Math.atan2(nx - x, nz - z);
        x = nx; z = nz;
        y = damp(y, env.floorAt(x, z) + (circling ? 2 : 1.6), 2, dt);
        if (pt > (circling ? 4 : 6)) { phase = 'gone'; c.mesh.visible = false; paper(4, 0.3); return false; }
      }
      e.set(phase === 'fly' ? -0.08 : 0, heading, phase === 'circle' ? -0.35 : Math.sin(pt * 2.1) * 0.08);
      q.setFromEuler(e);
      const near = clamp01((ctx.camera.position.distanceTo(v.set(x, y, z)) - 1.2) / 1.3);
      m.compose(v, q, s.setScalar(1.5 * near));
      c.mesh.setMatrixAt(0, m);
      c.mesh.instanceMatrix.needsUpdate = true;
      return true;
    });
    let t0 = -1;
    return { update(_dt, t) { if (t0 < 0) t0 = t; return t - t0 < 1.2; }, end() { /* the crane flies on */ } };
  }

  /** 棋士 · 复盘 at the altar: the hall to ink, the "official" version replayed — the splash that should be there. */
  function review(env: SkillEnv): Running | null {
    if (!nearAltar()) return null;
    const P = ctx.player;
    P.emote('skill');
    clack(0.6);
    const el = document.createElement('div');
    el.className = 'case-review';
    const cap = document.createElement('p');
    cap.textContent = tr(K.TOOLS.player.replay);
    el.appendChild(cap);
    const off = ctx.hud.mount(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-on')));
    const a = ANCHORS.incense;
    let t0 = -1, splashed = 0, said = false;
    const splash = () => {
      // the jar breaking at 亥正 as the record has it: wine flying both ways over the trail
      for (let i = 0; i < (env.reduced ? 10 : 26); i++) {
        const dir = i % 2 ? 1 : -1;
        env.fx.air.emit({ x: a.x, y: a.y + 0.5, z: a.z + 0.1, vx: dir * (0.6 + Math.random() * 1.2), vy: 0.8 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 0.8, g: 5.5, drag: 0.4, life: 1.1, size: 0.07, color: 0x3a1a18, alpha: 0.9, mode: MODE.flake, cell: CELL.drop, floor: a.y + 0.01 });
      }
    };
    return {
      update(_dt, t) {
        if (t0 < 0) t0 = t;
        const k = t - t0;
        if (splashed === 0 && k > 1.2) { splashed = 1; splash(); w.tv.fx?.words('亥正', { x: a.x, y: a.y + 0.9, z: a.z }, { size: 0.26, life: 3.2, rise: 0.3 }); }
        if (splashed === 1 && k > 2.4) { splashed = 2; splash(); }
        if (!said && k > 3.6) {
          said = true;
          flag(K.addFlag('xiang'));
          void w.say('me', K.TOOLS.player.line);
        }
        return k < 6.5;
      },
      end() { el.classList.remove('is-on'); setTimeout(off, 700); },
    };
  }

  /** 道童 · 风 in the courtyard: the petals lift, and every print shows, glowing by its age. */
  function gust(env: SkillEnv): Running | null {
    if (!inCourt()) return null;
    const P = ctx.player;
    P.emote('skill');
    wind(1.8, 0.7, true);
    const c = ANCHORS.courtyard;
    void w.tv.fx?.petalBurst(c, { n: env.reduced ? 160 : 460, up: 2.6, spread: 3.4, lit: false, wind: { x: 0.8, z: -0.4 } });
    const seen = !!w.flags()[K.clueFlag('zuji')];
    toast(K.TOOLS.taoist.line, 4600);
    let t0 = -1, done = false;
    return {
      update(_dt, t) {
        if (t0 < 0) t0 = t;
        if (!done && t - t0 > 0.7) { done = true; void w.windPrints(); void seen; }
        return t - t0 < 2.6;
      },
      end() { /* the petals settle by themselves */ },
    };
  }

  const LABEL: Partial<Record<CharacterId, () => { glyph: string; zh: string; en: string } | null>> = {
    cat: () => ({ glyph: K.TOOLS.cat.glyph, zh: K.TOOLS.cat.name.zh, en: K.TOOLS.cat.name.en }),
    rabbit: () => ({ glyph: K.TOOLS.rabbit.glyph, zh: K.TOOLS.rabbit.name.zh, en: K.TOOLS.rabbit.name.en }),
    painter: () => ({ glyph: K.TOOLS.painter.glyph, zh: K.TOOLS.painter.name.zh, en: K.TOOLS.painter.name.en }),
    player: () => (nearAltar() ? { glyph: K.TOOLS.player.glyph, zh: K.TOOLS.player.name.zh, en: K.TOOLS.player.name.en } : null),
    taoist: () => (inCourt() ? { glyph: K.TOOLS.taoist.glyph, zh: K.TOOLS.taoist.name.zh, en: K.TOOLS.taoist.name.en } : null),
  };
  const START: Partial<Record<CharacterId, (env: SkillEnv) => Running | null>> = { cat: scent, rabbit: ears, painter: craneTo, player: review, taoist: gust };

  return {
    label(id) {
      if (!w.active()) return null;
      return LABEL[id]?.() ?? null;
    },
    start(id, env) {
      if (!w.active()) return null;
      return START[id]?.(env) ?? null;
    },
  };
}
