// The skills that move the walker:
//  - 侠客 轻功: a dash on the wind with ink afterimages and a sweep of sword-qi that scatters leaves,
//    then a while of double jumps and quicker feet.
//  - 道童 御风符: a yellow talisman flies up and bursts; the wind lifts him over the rooftops and
//    he drifts down with leaves whirling round him.
//  - 大橘 猫跃: a pounce, springier jumps for a while, and a few stray cats who tag along.
//  - 玉兔 月华: a hop off the moon, a long glide trailing moon-dust; by night the moon brightens.
//  - 嫦娥 奔月: she rises and floats for a while, silk ribbons streaming, petals falling, then
//    settles gently — over water and gaps alike.
import type * as T from 'three';
import { outlineMat, propMat, type Bag } from '../kit';
import { BRUSH_FONT } from '../kit';
import { CELL, MODE } from './fx';
import { catGeometry } from './shapes';
import { HUE, TAU, clamp01, damp, forward, type Running, type SkillEnv } from './env';
import * as snd from './sound';

// ───────────────────────────── 侠客 · 轻功 ─────────────────────────────

export function swordsman(env: SkillEnv): Running {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  P.emote('skill');
  snd.blade(0.7);
  const [f0x, f0z] = forward(P.heading);
  // a long low bound on the wind: off the ground, so the dash carries (a rail, a ditch, a gap cleared),
  // with the second jump already his to take mid-flight
  P.impulse(f0x * 15, 3.6, f0z * 15);
  P.setMoveMods({ airJumps: 1, speed: 1.3 });
  const p = P.position;
  // the sword-qi: a crescent of ink sweeping ahead
  fx.air.emit({ x: p.x + f0x * 1.3, y: p.y + 0.9, z: p.z + f0z * 1.3, vx: f0x * 6, vz: f0z * 6, drag: 4, life: 0.5, size: 2.3, grow: 1.8, color: HUE.teal, alpha: 0.8, mode: MODE.flat, cell: CELL.swirl, rot: P.heading + 0.63, fadeIn: 0.02, fadeOut: 0.7 });
  fx.air.emit({ x: p.x + f0x * 1.1, y: p.y + 0.95, z: p.z + f0z * 1.1, vx: f0x * 5, vz: f0z * 5, drag: 4, life: 0.35, size: 1.6, grow: 1.6, color: HUE.white, alpha: 0.9, mode: MODE.flatGlow, cell: CELL.swirl, rot: P.heading + 0.63, fadeIn: 0.02, fadeOut: 0.8 });
  // leaves scattered by it
  const floor = env.floorAt(p.x, p.z);
  for (let i = 0; i < (env.reduced ? 6 : 18); i++) {
    const d = rng.range(0.8, 3.5), side = rng.range(-1.4, 1.4);
    const x = p.x + f0x * d - f0z * side, z = p.z + f0z * d + f0x * side;
    fx.air.emit({ x, y: floor + 0.1, z, vx: f0x * rng.range(1, 3) - f0z * side * 1.2, vy: rng.range(1.8, 3.4), vz: f0z * rng.range(1, 3) + f0x * side * 1.2, g: 3, drag: 1.3, flutter: 0.4, life: rng.range(2.2, 3.4), size: rng.range(0.07, 0.1), color: rng.pick([HUE.leaf, HUE.jade, HUE.ochre, HUE.gamboge]), mode: MODE.flake, cell: rng.chance(0.5) ? CELL.leaf : CELL.blade, spin: rng.range(4, 8), floor: floor + 0.02 });
  }
  let t0 = -1, ghostAt = 0, windAt = 0;
  let lx = p.x, lz = p.z;
  return {
    update(dt, t) {
      if (t0 < 0) t0 = t;
      const el = t - t0;
      const pp = P.position;
      const sp = dt > 0 ? Math.hypot(pp.x - lx, pp.z - lz) / dt : 0;
      lx = pp.x; lz = pp.z;
      // afterimages while the dash carries
      if ((el < 0.45 || (el < 0.9 && !P.grounded)) && t > ghostAt && !env.reduced) {
        ghostAt = t + 0.045;
        fx.air.emit({ x: pp.x, y: pp.y + 0.68, z: pp.z, life: 0.42, size: 1.35, color: HUE.inkSoft, alpha: 0.32, mode: MODE.puff, cell: CELL.streak, rot: 0, fadeIn: 0.01, fadeOut: 1 });
      }
      // a second jump in the air: a puff of cloud underfoot
      if (ctx.input.jumpPressed && !P.grounded) {
        snd.swish(0.5);
        fx.air.emit({ x: pp.x, y: pp.y + 0.05, z: pp.z, life: 0.6, size: 0.6, grow: 2.6, color: HUE.white, alpha: 0.7, mode: MODE.flat, cell: CELL.cloud, rot: P.heading, fadeIn: 0.02, fadeOut: 0.8 });
        fx.air.emit({ x: pp.x, y: pp.y + 0.05, z: pp.z, life: 0.5, size: 0.9, grow: 2.2, color: HUE.inkSoft, alpha: 0.25, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.8 });
      }
      // wind on the heels while running light
      if (sp > 3.6 && t > windAt && !env.reduced) {
        windAt = t + 0.12;
        fx.air.emit({ x: pp.x, y: pp.y + rng.range(0.3, 1.1), z: pp.z, life: 0.35, size: 0.7, color: HUE.inkSoft, alpha: 0.12, mode: MODE.puff, cell: CELL.streak, rot: Math.PI / 2, fadeIn: 0.02, fadeOut: 1 });
      }
      return el < 6.5;
    },
    end() {
      P.setMoveMods(null);
    },
  };
}

// ───────────────────────────── 道童 · 御风符 ─────────────────────────────

function talismanMesh(bag: Bag): T.Mesh {
  const { THREE } = bag.ctx;
  const c = document.createElement('canvas');
  c.width = 80; c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e8c457';
  g.fillRect(0, 0, 80, 200);
  g.strokeStyle = 'rgba(150,100,30,0.6)';
  g.lineWidth = 3;
  g.strokeRect(4, 4, 72, 192);
  g.fillStyle = '#b93a2b';
  g.strokeStyle = '#b93a2b';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `46px ${BRUSH_FONT}`;
  g.fillText('敕', 40, 40);
  g.fillText('令', 40, 88);
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(40, 112);
  for (let i = 0; i < 7; i++) g.quadraticCurveTo(i % 2 ? 62 : 18, 118 + i * 10, 40, 124 + i * 10);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.7), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: true }));
  mesh.name = 'talisman';
  mesh.visible = false;
  bag.add(mesh);
  return mesh;
}

export function makeTaoist(bag: Bag): (env: SkillEnv) => Running {
  let tal: T.Mesh | null = null;
  return (env) => {
    const { ctx, fx, rng } = env;
    const P = ctx.player;
    tal ??= talismanMesh(bag);
    const mesh = tal;
    P.emote('skill');
    snd.paper(6, 0.6);
    const [t0x, t0z] = forward(P.heading);
    const sx = P.position.x + t0x * 0.6, sz = P.position.z + t0z * 0.6, sy = P.position.y + 1.1;
    mesh.visible = true;
    let t0 = -1, lifted = -1, landed = false;
    const burst = (t: number) => {
      lifted = t;
      mesh.visible = false;
      snd.pop(0.7);
      snd.wind(1.6, 0.7, true);
      const p = P.position;
      const top = sy + 2.6;
      for (let i = 0; i < (env.reduced ? 10 : 26); i++) {
        const a = rng() * TAU, u = rng.range(-1, 1);
        fx.air.emit({ x: sx, y: top, z: sz, vx: Math.cos(a) * 2.2 * Math.sqrt(1 - u * u), vy: u * 2.2 + 0.4, vz: Math.sin(a) * 2.2 * Math.sqrt(1 - u * u), g: 1.2, drag: 2, life: rng.range(0.6, 1.2), size: rng.range(0.1, 0.2), color: rng.chance(0.5) ? HUE.gold : HUE.vermilion, mode: MODE.glow, cell: CELL.star });
      }
      for (let i = 0; i < (env.reduced ? 5 : 12); i++) {
        fx.air.emit({ x: sx, y: top, z: sz, vx: rng.range(-1.2, 1.2), vy: rng.range(-0.2, 1.2), vz: rng.range(-1.2, 1.2), g: 1.2, drag: 1.4, flutter: 0.4, life: rng.range(1.5, 2.4), size: rng.range(0.05, 0.08), color: 0xe8c457, mode: MODE.flake, cell: CELL.petal, spin: 7, floor: env.floorAt(sx, sz) });
      }
      // the wind takes him
      P.impulse(0, 9.5, 0);
      P.setMoveMods({ glide: true });
      const floor = env.floorAt(p.x, p.z);
      fx.ground.emit({ x: p.x, y: floor + 0.05, z: p.z, life: 1.2, size: 1.2, grow: 3.4, color: HUE.white, alpha: 0.65, mode: MODE.flat, cell: CELL.cloud, rot: rng() * TAU, fadeIn: 0.02, fadeOut: 0.7 });
      fx.ground.emit({ x: p.x, y: floor + 0.05, z: p.z, life: 1, size: 1.4, grow: 4, color: HUE.inkSoft, alpha: 0.3, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
      // leaves whirling round him as he rises
      for (let i = 0; i < (env.reduced ? 8 : 36); i++) {
        fx.air.emit({ x: p.x, y: floor + rng.range(0, 1.2), z: p.z, life: rng.range(2.4, 3.6), size: rng.range(0.1, 0.16), color: rng.pick([HUE.leaf, HUE.jade, HUE.ochre, HUE.gamboge]), mode: MODE.flake, cell: rng.chance(0.5) ? CELL.leaf : CELL.blade, spin: rng.range(4, 9), orbit: { r: rng.range(0.6, 1.3), w: rng.range(3.5, 5.5), a: rng() * TAU, rise: rng.range(1.2, 2.6), dr: 0.25, follow: true }, fadeIn: 0.15 });
      }
    };
    return {
      update(dt, t) {
        if (t0 < 0) t0 = t;
        const el = t - t0;
        if (lifted < 0) {
          // the talisman flies up from his hand, spinning
          const k = clamp01(el / 0.55);
          mesh.position.set(sx, sy + k * k * 2.6, sz);
          mesh.rotation.set(0, el * 14, Math.sin(el * 9) * 0.3);
          mesh.scale.setScalar(1 + k * 0.5);
          if (!env.reduced && rng.chance(dt * 30)) fx.air.emit({ x: mesh.position.x, y: mesh.position.y - 0.2, z: mesh.position.z, vy: -0.2, life: 0.5, size: 0.08, color: HUE.gold, mode: MODE.glow, cell: CELL.soft });
          if (k >= 1) burst(t);
          return true;
        }
        const air = t - lifted;
        if (air > 0.5 && P.grounded && !landed) {
          landed = true;
          const p = P.position;
          fx.ground.emit({ x: p.x, y: env.floorAt(p.x, p.z) + 0.04, z: p.z, life: 0.9, size: 0.6, grow: 3, color: HUE.dust, alpha: 0.4, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
          return false;
        }
        return air < 7;
      },
      end() {
        mesh.visible = false;
        P.setMoveMods(null);
      },
    };
  };
}

// ───────────────────────────── 大橘 · 猫跃 ─────────────────────────────

interface Stray { x: number; y: number; z: number; h: number; state: 'off' | 'in' | 'follow' | 'out'; side: number; back: number; bob: number; sit: number; meowAt: number; pitch: number; ax: number; az: number }

/** A few stray cats that come when the ginger pounces, and follow for a minute. */
export class Strays {
  private body: T.InstancedMesh | null = null;
  private hull: T.InstancedMesh | null = null;
  private cats: Stray[] = [];
  private until = 0;
  private still = 0;
  private m: T.Matrix4 | null = null;
  private q: T.Quaternion | null = null;
  private e: T.Euler | null = null;
  private v: T.Vector3 | null = null;
  private s: T.Vector3 | null = null;

  constructor(private bag: Bag) {}

  private build(): void {
    const { THREE } = this.bag.ctx;
    const geo = catGeometry(THREE);
    const n = 3;
    this.body = new THREE.InstancedMesh(geo, propMat(this.bag.ctx), n);
    this.hull = new THREE.InstancedMesh(geo, outlineMat(this.bag.ctx, 0.008), n);
    const coats = ['#3d3835', '#a39d92', '#efdcc0'];
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) { this.body.setColorAt(i, c.set(coats[i])); }
    for (const m of [this.body, this.hull]) { m.frustumCulled = false; m.count = 0; m.name = 'stray-cats'; this.bag.add(m); }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(0, 0, 0, 'YXZ'); this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1);
  }

  get active(): boolean {
    return this.cats.some((c) => c.state !== 'off');
  }

  summon(env: SkillEnv, t: number): void {
    if (!this.body) this.build();
    const { ctx, rng } = env;
    const P = ctx.player;
    const want = rng.int(2, 3);
    this.until = t + 60;
    while (this.cats.length < 3) this.cats.push({ x: 0, y: 0, z: 0, h: 0, state: 'off', side: 0, back: 0, bob: 0, sit: 0, meowAt: 0, pitch: 1.4, ax: 0, az: 0 });
    let come = 0;
    for (let i = 0; i < want; i++) {
      const c = this.cats[i];
      if (c.state === 'follow' || c.state === 'in') continue;
      // from somewhere behind or to the side, out of the grass
      for (let k = 0; k < 12; k++) {
        const a = P.heading + Math.PI + rng.range(-1.6, 1.6), d = rng.range(6, 9);
        const x = P.position.x + Math.sin(a) * d, z = P.position.z + Math.cos(a) * d;
        if (!ctx.isWalkable(x, z)) continue;
        c.x = x; c.z = z; c.y = ctx.groundY(x, z);
        c.h = Math.atan2(P.position.x - x, P.position.z - z);
        c.state = 'in';
        come++;
        break;
      }
      c.side = [-0.9, 0.9, 0.2][i];
      c.back = [1.3, 1.5, 2.3][i];
      c.pitch = 1.35 + i * 0.18;
      c.meowAt = t + 1 + i * 0.7;
    }
    if (come) env.bag.later(700, () => ctx.hud.toast(come > 1 ? `${['', '一', '两', '三'][come]}只野猫从草丛里钻出来，跟上了你` : '一只野猫从草丛里钻出来，跟上了你', come > 1 ? `${come} stray cats slip out of the grass and follow you` : 'A stray cat slips out of the grass and follows you', 2600));
  }

  update(dt: number, t: number, env: SkillEnv | null): void {
    if (!this.body || !this.hull || !env) return;
    const { ctx } = env;
    const P = ctx.player;
    let live = 0;
    const psp = Math.hypot(P.position.x - (this.lastPX ?? P.position.x), P.position.z - (this.lastPZ ?? P.position.z)) / Math.max(dt, 1e-4);
    this.lastPX = P.position.x; this.lastPZ = P.position.z;
    this.still = psp < 0.2 ? this.still + dt : 0;
    for (let i = 0; i < this.cats.length; i++) {
      const c = this.cats[i];
      if (c.state === 'off') { this.hide(i); continue; }
      if (t > this.until && c.state !== 'out') {
        c.state = 'out';
        const a = P.heading + Math.PI + (i - 1) * 0.8;
        c.ax = c.x + Math.sin(a) * 14; c.az = c.z + Math.cos(a) * 14;
      }
      // where to go: a place at the walker's heel, or away
      let tx: number, tz: number;
      if (c.state === 'out') { tx = c.ax; tz = c.az; }
      else {
        const [fx0, fz0] = forward(P.heading);
        tx = P.position.x - fx0 * c.back - fz0 * c.side;
        tz = P.position.z - fz0 * c.back + fx0 * c.side;
      }
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      // far behind (a waypoint jump, a gallop): catch up out of sight
      if (c.state !== 'out' && Math.hypot(P.position.x - c.x, P.position.z - c.z) > 24) {
        c.x = tx - Math.sin(P.heading) * 3; c.z = tz - Math.cos(P.heading) * 3;
        if (!ctx.isWalkable(c.x, c.z)) { c.x = tx; c.z = tz; }
        c.y = ctx.groundY(c.x, c.z);
      }
      let sp = 0;
      if (d > 0.25) {
        sp = Math.min(d > 3 ? 4.6 : 2.2, d * 2.2);
        const ux = dx / d, uz = dz / d;
        const nx = c.x + ux * sp * dt, nz = c.z + uz * sp * dt;
        if (ctx.isWalkable(nx, nz) || c.state === 'out' || !ctx.isWalkable(c.x, c.z)) { c.x = nx; c.z = nz; }
        else if (ctx.isWalkable(nx, c.z)) c.x = nx;
        else if (ctx.isWalkable(c.x, nz)) c.z = nz;
        else sp = 0;
        let dh = Math.atan2(ux, uz) - c.h;
        while (dh > Math.PI) dh -= TAU;
        while (dh < -Math.PI) dh += TAU;
        c.h += dh * Math.min(1, dt * 8);
        if (c.state === 'in' && d < 1.2) c.state = 'follow';
      } else if (this.still > 0.8) {
        // sit and look at the walker
        const want = Math.atan2(P.position.x - c.x, P.position.z - c.z);
        let dh = want - c.h;
        while (dh > Math.PI) dh -= TAU;
        while (dh < -Math.PI) dh += TAU;
        c.h += dh * Math.min(1, dt * 3);
      }
      const gy = ctx.groundY(c.x, c.z);
      const w = ctx.waterAt(c.x, c.z);
      c.y = damp(c.y, w === null ? gy : Math.max(gy, w), 14, dt);
      c.bob += dt * (6 + sp * 3.2);
      c.sit = damp(c.sit, sp < 0.1 && this.still > 0.8 ? 1 : 0, 5, dt);
      if (t > c.meowAt) {
        c.meowAt = t + 6 + ((i * 3.7 + t) % 5);
        if (c.state !== 'out' && Math.hypot(P.position.x - c.x, P.position.z - c.z) < 10) snd.meow(c.pitch, 0.35);
      }
      if (c.state === 'out' && d < 0.6) { c.state = 'off'; this.hide(i); continue; }
      const hop = sp > 0.1 ? Math.abs(Math.sin(c.bob)) * 0.05 * Math.min(1, sp / 2) : 0;
      this.e!.set(-0.4 * c.sit + (sp > 0.1 ? Math.sin(c.bob * 2) * 0.06 : 0), c.h, 0);
      this.q!.setFromEuler(this.e!);
      this.s!.set(1, 1 - c.sit * 0.12, 1 - c.sit * 0.1);
      this.m!.compose(this.v!.set(c.x, c.y + hop, c.z), this.q!, this.s!);
      this.body.setMatrixAt(i, this.m!);
      this.hull.setMatrixAt(i, this.m!);
      live = i + 1;
    }
    this.body.count = this.hull.count = live;
    if (live) {
      this.body.instanceMatrix.needsUpdate = true;
      this.hull.instanceMatrix.needsUpdate = true;
    }
  }

  private lastPX: number | null = null;
  private lastPZ: number | null = null;

  private hide(i: number): void {
    if (!this.body || !this.hull || !this.m) return;
    this.m.makeScale(0, 0, 0);
    this.body.setMatrixAt(i, this.m);
    this.hull.setMatrixAt(i, this.m);
  }
}

export function cat(env: SkillEnv, strays: Strays, t: number): Running {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  P.emote('skill');
  snd.meow(1, 0.7);
  const [f0x, f0z] = forward(P.heading);
  P.impulse(f0x * 7.6, 6.2, f0z * 7.6);
  P.setMoveMods({ jump: 1.6 });
  const p = P.position;
  const floor = env.floorAt(p.x, p.z);
  for (let i = 0; i < (env.reduced ? 3 : 8); i++) {
    fx.air.emit({ x: p.x + rng.range(-0.25, 0.25), y: floor + 0.05, z: p.z + rng.range(-0.25, 0.25), vx: -f0x * rng.range(0.3, 1), vy: rng.range(0.2, 0.6), vz: -f0z * rng.range(0.3, 1), drag: 2.5, life: 0.9, size: 0.25, grow: 2.4, color: HUE.dust, alpha: 0.35, mode: MODE.puff, cell: CELL.soft });
  }
  strays.summon(env, t);
  let t0 = -1;
  return {
    update(_dt, tt) {
      if (t0 < 0) t0 = tt;
      return tt - t0 < 5;
    },
    end() {
      P.setMoveMods(null);
    },
  };
}

// ───────────────────────────── 玉兔 · 月华 ─────────────────────────────

export function rabbit(env: SkillEnv): Running {
  const { ctx, fx, rng } = env;
  const P = ctx.player;
  P.emote('skill');
  snd.shimmer(0.7);
  const [f0x, f0z] = forward(P.heading);
  P.impulse(f0x * 5.2, 8.4, f0z * 5.2);
  P.setMoveMods({ glide: true });
  const p = P.position;
  const night = env.night() > 0.5;
  const moonUp = night && !ctx.env.festivals.includes('midautumn');
  fx.ground.emit({ x: p.x, y: env.floorAt(p.x, p.z) + 0.04, z: p.z, life: 1.2, size: 0.8, grow: 4, color: HUE.silver, alpha: 0.6, mode: night ? MODE.flatGlow : MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
  if (moonUp) ctx.hud.toast('月华如水——月亮也亮了几分', 'Moonlight like water — the moon itself brightens', 2400);
  let t0 = -1, dustAt = 0, landed = false;
  return {
    update(_dt, t) {
      if (t0 < 0) t0 = t;
      const el = t - t0;
      const pp = P.position;
      if (moonUp) ctx.sky.setMoon({ glow: 1 + 1.8 * Math.min(1, el / 0.4) * clamp01((3.4 - el) / 2.4) });
      if (!P.grounded && t > dustAt) {
        dustAt = t + (env.reduced ? 0.1 : 0.03);
        for (let i = 0; i < (env.reduced ? 1 : 2); i++) {
          // by night the dust glows; by day it glints gold so it reads against the grass
          const glow = night || rng.chance(0.4);
          fx.air.emit({ x: pp.x + rng.range(-0.15, 0.15), y: pp.y + rng.range(0.2, 0.7), z: pp.z + rng.range(-0.15, 0.15), vx: rng.range(-0.15, 0.15), vy: rng.range(-0.3, 0.05), vz: rng.range(-0.15, 0.15), g: 0.25, life: rng.range(1.4, 2.4), size: rng.range(0.07, 0.15) * (glow ? 1 : 0.8), color: glow ? (rng.chance(0.6) ? HUE.silver : HUE.moon) : rng.pick([0xe9c46a, 0xd9b45a, 0xf0dca0]), alpha: 0.9, mode: glow ? MODE.glow : MODE.puff, cell: rng.chance(0.4) ? CELL.star : CELL.soft });
        }
      }
      if (el > 0.4 && P.grounded && !landed) {
        landed = true;
        fx.ground.emit({ x: pp.x, y: env.floorAt(pp.x, pp.z) + 0.04, z: pp.z, life: 1.1, size: 0.5, grow: 3.4, color: HUE.silver, alpha: 0.55, mode: night ? MODE.flatGlow : MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
        snd.shimmer(0.25);
      }
      return (!landed || el < 3.4) && el < 6;
    },
    end() {
      P.setMoveMods(null);
      if (moonUp) ctx.sky.setMoon({ glow: 1 });
    },
  };
}

// ───────────────────────────── 嫦娥 · 奔月 ─────────────────────────────

const RIB_N = 22;

/** Two silk ribbons that stream from the shoulders (one draw, vertex alpha). */
class Ribbons {
  readonly mesh: T.Mesh;
  private pos: T.BufferAttribute;
  private hist: Float32Array[] = [new Float32Array(RIB_N * 3), new Float32Array(RIB_N * 3)];
  private fresh = true;
  private acc = 0;
  alpha = 0;

  constructor(bag: Bag) {
    const { THREE } = bag.ctx;
    const nv = 2 * RIB_N * 2;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    const col = new Float32Array(nv * 4);
    const a = new THREE.Color('#f2b6c3'), b = new THREE.Color('#b9d3ec'), c = new THREE.Color();
    const idx: number[] = [];
    for (let r = 0; r < 2; r++) {
      for (let j = 0; j < RIB_N; j++) {
        const k = j / (RIB_N - 1);
        c.copy(r ? b : a).lerp(r ? a : b, k * 0.8);
        for (let s = 0; s < 2; s++) {
          const v = (r * RIB_N + j) * 2 + s;
          col[v * 4] = c.r; col[v * 4 + 1] = c.g; col[v * 4 + 2] = c.b; col[v * 4 + 3] = (1 - k) * 0.85;
        }
        if (j < RIB_N - 1) {
          const v0 = (r * RIB_N + j) * 2;
          idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
        }
      }
    }
    this.colors = new THREE.BufferAttribute(col, 4);
    g.setAttribute('color', this.colors);
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.name = 'silk-ribbons';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    bag.add(this.mesh);
  }
  private colors: T.BufferAttribute;
  private mat: T.MeshBasicMaterial;

  reset(): void {
    this.fresh = true;
  }

  update(dt: number, t: number, x: number, y: number, z: number, heading: number, night: number): void {
    this.mesh.visible = this.alpha > 0.01;
    if (!this.mesh.visible) return;
    this.mat.opacity = this.alpha;
    const k = 1 - night * 0.35;
    this.mat.color.setRGB(k, k, k);
    const [fx0, fz0] = forward(heading);
    const rx = -fz0, rz = fx0;
    this.acc += dt;
    const shift = this.acc > 0.028 || this.fresh;
    if (shift) this.acc = 0;
    for (let r = 0; r < 2; r++) {
      const h = this.hist[r];
      const side = r ? -1 : 1;
      const ax = x + rx * side * 0.27 - fx0 * 0.12, ay = y + 1.02, az = z + rz * side * 0.27 - fz0 * 0.12;
      if (this.fresh) for (let j = 0; j < RIB_N; j++) { h[j * 3] = ax - fx0 * j * 0.06; h[j * 3 + 1] = ay - j * 0.02; h[j * 3 + 2] = az - fz0 * j * 0.06; }
      else if (shift) h.copyWithin(3, 0, (RIB_N - 1) * 3);
      h[0] = ax; h[1] = ay; h[2] = az;
      // drift: the tail floats down and out, waving
      for (let j = 1; j < RIB_N; j++) {
        const o = j * 3;
        h[o] += (-fx0 * 0.25 + rx * side * 0.12) * dt * (j / RIB_N) * 1.5;
        h[o + 1] += (Math.sin(t * 2.6 + j * 0.45 + r) * 0.35 - 0.15) * dt;
        h[o + 2] += (-fz0 * 0.25 + rz * side * 0.12) * dt * (j / RIB_N) * 1.5;
      }
      const P = this.pos.array as Float32Array;
      for (let j = 0; j < RIB_N; j++) {
        const o = j * 3;
        const n = Math.min(RIB_N - 1, j + 1), m = Math.max(0, j - 1);
        let dx = h[n * 3] - h[m * 3], dz = h[n * 3 + 2] - h[m * 3 + 2];
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const w = 0.1 * (1 - (j / RIB_N) * 0.75);
        const tw = j * 0.32 + t * 1.8 + r * 1.3;
        const cx = -dz * Math.cos(tw) * w, cy = Math.sin(tw) * w, cz = dx * Math.cos(tw) * w;
        const v = (r * RIB_N + j) * 2;
        P[v * 3] = h[o] - cx; P[v * 3 + 1] = h[o + 1] - cy; P[v * 3 + 2] = h[o + 2] - cz;
        P[v * 3 + 3] = h[o] + cx; P[v * 3 + 4] = h[o + 1] + cy; P[v * 3 + 5] = h[o + 2] + cz;
      }
    }
    this.fresh = false;
    this.pos.needsUpdate = true;
  }
}

export function makeChange(bag: Bag): { start: (env: SkillEnv) => Running; update(dt: number, t: number, env: SkillEnv): void } {
  let rib: Ribbons | null = null;
  let want = 0;
  return {
    update(dt, t, env) {
      if (!rib) return;
      rib.alpha = damp(rib.alpha, want, want > 0 ? 6 : 2.5, dt);
      const P = env.ctx.player;
      rib.update(dt, t, P.position.x, P.position.y, P.position.z, P.heading, env.night());
    },
    start(env) {
      const { ctx, fx, rng } = env;
      const P = ctx.player;
      rib ??= new Ribbons(bag);
      rib.reset();
      want = 1;
      P.emote('skill');
      snd.shimmer(0.6);
      snd.wind(1.8, 0.4, true);
      P.impulse(0, 3.2, 0);
      P.setMoveMods({ hover: true, float: true, speed: 1.25 });
      let t0 = -1, petalAt = 0, landing = false, landedAt = -1;
      const land = () => {
        if (landing) return;
        landing = true;
        P.setMoveMods({ glide: true, float: true });
      };
      return {
        press: land,
        update(_dt, t) {
          if (t0 < 0) t0 = t;
          const el = t - t0;
          const pp = P.position;
          if (el > 6 && !landing) land();
          if (t > petalAt) {
            petalAt = t + (env.reduced ? 0.3 : 0.1);
            fx.air.emit({ x: pp.x + rng.range(-0.4, 0.4), y: pp.y + rng.range(0.6, 1.4), z: pp.z + rng.range(-0.4, 0.4), vx: rng.range(-0.2, 0.2), vy: -0.2, vz: rng.range(-0.2, 0.2), g: 0.6, drag: 1.5, flutter: 0.5, life: rng.range(3, 4.5), size: rng.range(0.05, 0.08), color: rng.pick([HUE.blush, HUE.white, HUE.peach, 0xd9c8ec]), mode: MODE.flake, cell: CELL.petal, spin: rng.range(2, 5), floor: env.floorAt(pp.x, pp.z) + 0.02 });
            if (env.night() > 0.4) fx.air.emit({ x: pp.x + rng.range(-0.3, 0.3), y: pp.y + rng.range(0.3, 1.2), z: pp.z + rng.range(-0.3, 0.3), vy: -0.1, life: 1.5, size: 0.1, color: HUE.silver, mode: MODE.glow, cell: CELL.soft });
          }
          if (landing && P.grounded && landedAt < 0) {
            landedAt = t;
            want = 0;
            const w = ctx.waterAt(pp.x, pp.z);
            fx.ground.emit({ x: pp.x, y: env.floorAt(pp.x, pp.z) + 0.04, z: pp.z, life: 1.4, size: 0.6, grow: 4, color: w === null ? HUE.blush : HUE.silver, alpha: 0.55, mode: env.night() > 0.5 ? MODE.flatGlow : MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
            snd.shimmer(0.25);
          }
          return landedAt < 0 ? el < 14 : t - landedAt < 0.3;
        },
        end() {
          want = 0;
          P.setMoveMods(null);
        },
      };
    },
  };
}
