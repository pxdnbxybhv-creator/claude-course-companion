// 水月幻镜 · a stand-in engine for building the screens before engine/* lands (dev, or ?mirrorStub).
// It honours the Engine contract: a wave runs on a timer (short in dev), the stick moves an ink dot,
// the HUD is pushed at 8 Hz, a boss wave raises the intro hook and waits for resume(), and the wave
// ends with a plausible WaveResult built from the wave's own plan. window.__mirrorStub.die() / .win()
// end the wave at once (browser checks); .die({ sleeve: true }) dies holding the wave's planned coins.
import { maxHp, planMoon, xpNext } from '../logic';
import type { BossId } from '../ids';
import type { CreateEngine, Engine, EngineDeps, EnginePhase, HudState, RunSave, SkillTarget, WaveResult, WaveSetup } from '../types';

const STUB_WAVE_S = 6;

class StubEngine implements Engine {
  phase: EnginePhase = 'idle';
  paused = false;
  private raf = 0;
  private last = 0;
  private t = 0;
  private len = STUB_WAVE_S;
  private endT = 0;
  private hudT = 0;
  private run: RunSave;
  private setup: WaveSetup | null = null;
  private px = 0;
  private py = 0;
  private mx = 0;
  private my = 0;
  private hp = 1;
  private cd = 0;
  private introDone = false;
  private hud: HudState;
  readonly input = {
    move: (x: number, y: number) => { this.mx = x; this.my = y; },
    aim: () => {},
    cursor: () => {},
  };

  constructor(private canvas: HTMLCanvasElement, run: RunSave, private deps: EngineDeps) {
    this.run = run;
    this.hud = {
      hp: 1, hpMax: 1, shield: 0, moon: run.moon, sleeve: 0, showSleeve: run.coins > 0, level: run.lvl, xp: run.xp, xpNext: xpNext(run.lvl),
      wave: run.wave + 1, time: null, boss: null, skillCd: 0, skillActive: false, drunk: null, moonPhase: null, lives: run.char === 'cat' ? run.lives : null,
      curse: 0, lowHp: false, beat: false, dark: false, fps: 60,
    };
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      (window as unknown as { __mirrorStub?: unknown }).__mirrorStub = { die: (o?: { sleeve?: boolean }) => this.finish(true, !!o?.sleeve), win: () => this.finish(false), engine: this };
    }
    this.resize();
  }

  start(run: RunSave, setup: WaveSetup): void {
    if (this.phase === 'disposed') return;
    this.run = run;
    this.setup = setup;
    this.t = 0;
    this.len = setup.plan.len === null ? STUB_WAVE_S + 2 : Math.min(setup.plan.len, STUB_WAVE_S);
    this.px = this.py = 0;
    this.hp = maxHp(setup.stats);
    this.introDone = !setup.plan.boss;
    this.phase = 'wave';
    this.paused = false;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    if (this.phase === 'disposed') return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) this.step(dt);
    this.draw();
    if (this.phase === 'wave' || this.phase === 'ending') this.raf = requestAnimationFrame(this.frame);
  };

  private step(dt: number) {
    if (this.phase === 'wave') {
      this.t += dt;
      this.px = Math.max(-300, Math.min(300, this.px + this.mx * 280 * dt));
      this.py = Math.max(-300, Math.min(300, this.py + this.my * 280 * dt));
      this.cd = Math.max(0, this.cd - dt / 8);
      if (!this.introDone && this.t > 0.4 && this.setup?.plan.boss) {
        this.introDone = true;
        this.paused = true;
        const ids = this.setup.plan.boss.ids.filter((x): x is BossId => x !== 'mirrorself');
        const id = this.setup.plan.boss.ids.includes('mirrorself') ? 'mirrorself' : this.setup.plan.boss.twins ? 'twins' : ids[0];
        this.deps.hooks.boss({ kind: 'intro', id, ids });
        return;
      }
      if (this.t >= this.len) this.finish(false);
    } else if (this.phase === 'ending') {
      this.endT -= dt;
      if (this.endT <= 0) {
        this.phase = 'idle';
        this.deps.hooks.waveEnd(this.result());
      }
    }
    this.hudT -= dt;
    if (this.hudT <= 0 && this.setup) {
      this.hudT = 0.125;
      const h = this.hud;
      const hpMax = maxHp(this.setup.stats);
      h.hp = this.hp; h.hpMax = hpMax; h.wave = this.setup.wave;
      h.time = this.setup.plan.len === null ? null : Math.max(0, this.len - this.t);
      h.boss = this.setup.plan.boss ? { id: (this.setup.plan.boss.ids[0] === 'mirrorself' ? 'mirrorself' : this.setup.plan.boss.ids[0]) as BossId, hp: Math.max(0, 1 - this.t / this.len), phase: this.t / this.len > 0.4 ? (this.t / this.len > 0.75 ? 2 : 1) : 0 } : null;
      h.moon = this.run.moon + Math.floor((planMoon(this.setup.plan) * 0.8 * this.t) / this.len);
      h.skillCd = this.cd;
      h.lowHp = this.hp < hpMax * 0.3;
      this.deps.hooks.hud(h);
    }
  }

  private finish(dead: boolean, sleeve = false) {
    if (this.phase !== 'wave' || !this.setup) return;
    if (dead) {
      this.phase = 'dead';
      this.deps.audio.sfx('shatter');
      const partial = this.result();
      this.deps.hooks.death({ wave: this.setup.wave, partial: { ...partial, moon: 0, xp: 0, sleeve: sleeve ? partial.sleeve : [] }, cause: 'stub' });
      return;
    }
    this.phase = 'ending';
    this.endT = 1.2;
    this.deps.audio.sfx('gong');
  }

  private result(): WaveResult {
    const s = this.setup!;
    const moon = Math.round(planMoon(s.plan) * 0.8);
    const kills = s.plan.kills;
    const killsBy: Record<string, number> = {};
    for (const g of s.plan.groups) killsBy[g.id] = (killsBy[g.id] ?? 0) + g.n;
    for (const e of s.plan.elites) killsBy[e.id] = (killsBy[e.id] ?? 0) + 1;
    const bosses = s.plan.boss ? s.plan.boss.ids.filter((x): x is BossId => x !== 'mirrorself') : [];
    for (const b of bosses) killsBy[b] = (killsBy[b] ?? 0) + 1;
    const byWeapon: WaveResult['byWeapon'] = {};
    this.run.weapons.forEach((w, i) => {
      const k = Math.floor(kills / this.run.weapons.length) + (i === 0 ? kills % this.run.weapons.length : 0);
      byWeapon[w.id] = { dmg: k * 12 * s.plan.hpX, kills: k };
    });
    return {
      wave: s.wave, moon, xp: moon, field: Math.round(moon * 0.1), storeLeft: 0, levels: 0,
      crates: s.plan.elites.length ? 1 : 0, hearts: s.plan.boss ? ['boss'] : [], sleeve: s.coins, lives: this.run.lives, once: [],
      drunk: this.run.drunk, stats: { kills, dmgDealt: kills * 12, moonCollected: moon, peakHit: Math.round(30 * s.plan.hpX), bosses: bosses.length },
      killsBy, byWeapon, bosses, ms: Math.round(this.t * 1000),
    };
  }

  private draw() {
    const c = this.canvas;
    const g = c.getContext('2d');
    if (!g) return;
    const w = c.width, h = c.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#efe6d2';
    g.fillRect(0, 0, w, h);
    const k = Math.min(w, h) / 700;
    g.setTransform(k, 0, 0, k, w / 2, h / 2);
    g.strokeStyle = 'rgba(27,25,22,0.25)';
    g.lineWidth = 6;
    g.beginPath(); g.arc(0, 0, 330, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(27,25,22,0.08)';
    for (let i = 0; i < 12; i++) {
      const a = i * 0.52 + this.t * 0.4;
      g.beginPath(); g.arc(Math.cos(a) * 220, Math.sin(a * 1.3) * 200, 18, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = '#f6f7fb';
    g.beginPath(); g.arc(this.px, this.py, 26, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1b1916';
    g.beginPath(); g.arc(this.px, this.py, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c0412f';
    g.beginPath(); g.arc(this.px, this.py, 3, 0, Math.PI * 2); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(27,25,22,0.45)';
    g.font = `${Math.round(13 * (window.devicePixelRatio || 1))}px serif`;
    g.fillText('stub engine', 12 * (window.devicePixelRatio || 1), h - 12 * (window.devicePixelRatio || 1));
  }

  pause(): void { this.paused = true; }
  resume(): void {
    if (this.phase === 'disposed') return;
    this.paused = false;
    this.last = performance.now();
  }
  dispose(): void {
    this.phase = 'disposed';
    cancelAnimationFrame(this.raf);
    if (import.meta.env.DEV && typeof window !== 'undefined') delete (window as unknown as { __mirrorStub?: unknown }).__mirrorStub;
  }
  resize(): void {
    const d = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * d));
    this.canvas.height = Math.max(1, Math.round(r.height * d));
    if (this.phase !== 'wave') this.draw();
  }
  skill(_t?: SkillTarget): void {
    if (this.cd > 0 || this.phase !== 'wave') return;
    this.cd = 1;
    this.hud.skillActive = true;
    setTimeout(() => { this.hud.skillActive = false; }, 400);
  }
  skillPreview(_t: SkillTarget | null): void {}
  setSettings(): void {}
  snapshot(w: number, h: number): HTMLCanvasElement | null {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const s = Math.min(this.canvas.width, this.canvas.height);
    c.getContext('2d')?.drawImage(this.canvas, (this.canvas.width - s) / 2, (this.canvas.height - s) / 2, s, s, 0, 0, w, h);
    return c;
  }
}

export const createStubEngine: CreateEngine = (canvas, run, deps) => new StubEngine(canvas, run, deps);
