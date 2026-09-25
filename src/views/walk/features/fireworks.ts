// Fireworks (烟花): one pooled Points cloud, shells launched in front of the viewer, gold / red /
// white peonies and slow golden willows. Cheap: a few hundred particles, one draw call.
import type * as T from 'three';
import type { Bag } from './kit';
import { glowTexture, reducedMotion } from './kit';
import * as sfx from './sfx';

const TAU = Math.PI * 2;

export interface Fireworks {
  /** Launch one shell now (optionally at a world point). */
  launch(at?: T.Vector3): void;
  /** Launch n shells over the next second or so. */
  salvo(n: number): void;
}

export function fireworks(bag: Bag, o: { every?: [number, number]; onlyAtNight?: boolean } = {}): Fireworks {
  const ctx = bag.ctx;
  const { THREE, palette: P } = ctx;
  const still = reducedMotion();
  const MAX = still ? 260 : 700;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), age = new Float32Array(MAX), base = new Float32Array(MAX * 3), drag = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  // Normal blending with per-point alpha: the night sky here is moonlit paper, not black, so sparks
  // must read as colour on a light ground (additive light would vanish into it).
  const mat = new THREE.PointsMaterial({ size: 1.1, map: glowTexture(THREE, 64, 0.35), vertexColors: true, transparent: true, depthWrite: false, fog: false, sizeAttenuation: true });
  const pts = bag.add(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  let head = 0;
  const colours = [P.gamboge, '#f0b030', P.cinnabar, P.vermilion, P.rouge, '#e8c060'].map((c) => new THREE.Color(c));
  interface Rocket { x: number; y: number; z: number; vy: number; top: number; c: T.Color; willow: boolean }
  const rockets: Rocket[] = [];
  const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, l: number, c: T.Color, dr: number) => {
    const i = head;
    head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    base[i * 3] = c.r; base[i * 3 + 1] = c.g; base[i * 3 + 2] = c.b;
    life[i] = l; age[i] = 0; drag[i] = dr;
  };
  const target = (): T.Vector3 => {
    const cam = ctx.camera;
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    const side = new THREE.Vector3(-f.z, 0, f.x);
    const d = 30 + Math.random() * 16, s = (Math.random() - 0.5) * 36;
    return new THREE.Vector3(cam.position.x + f.x * d + side.x * s, 0, cam.position.z + f.z * d + side.z * s);
  };
  const launch = (at?: T.Vector3) => {
    const p = at ?? target();
    // low enough to bloom inside the walking camera's view (it looks slightly down at the scholar)
    const top = 7 + Math.random() * 6;
    const g = Math.min(top - 5, Math.max(0, ctx.groundY(p.x, p.z)));
    rockets.push({ x: p.x, y: g + 0.5, z: p.z, vy: 15 + Math.random() * 3, top, c: colours[Math.floor(Math.random() * colours.length)], willow: Math.random() < 0.3 });
  };
  const explode = (r: Rocket) => {
    const n = still ? 40 : r.willow ? 70 : 90;
    const sp = r.willow ? 5 : 8 + Math.random() * 3;
    const second = Math.random() < 0.4 ? colours[Math.floor(Math.random() * colours.length)] : r.c;
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * TAU, s = Math.sqrt(1 - u * u);
      const k = sp * (0.85 + Math.random() * 0.15);
      emit(r.x, r.y, r.z, Math.cos(a) * s * k, u * k + 1, Math.sin(a) * s * k, r.willow ? 3.2 : 1.7 + Math.random() * 0.5, i % 3 === 0 ? second : r.c, r.willow ? 1.6 : 2.4);
    }
    const cam = ctx.camera.position;
    const dist = Math.hypot(r.x - cam.x, r.y - cam.y, r.z - cam.z);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ctx.camera.quaternion);
    const pan = right.dot(new THREE.Vector3(r.x - cam.x, 0, r.z - cam.z).normalize());
    const delay = Math.min(1500, dist * 3); // sound lags the light
    bag.later(delay, () => sfx.firework(Math.min(1, 30 / dist) * 0.8, pan * 0.7));
  };
  let next = 0.6;
  const [lo, hi] = o.every ?? (still ? [4, 7] : [1.6, 3.6]);
  const gold = new THREE.Color('#e0a030');
  bag.frame((dt) => {
    dt = Math.min(dt, 0.1);
    const night = ctx.sky.isNight();
    if (!o.onlyAtNight || night) {
      next -= dt;
      if (next <= 0) { launch(); next = lo + Math.random() * (hi - lo); }
    }
    for (let i = rockets.length - 1; i >= 0; i--) {
      const r = rockets[i];
      r.vy -= 9 * dt;
      r.y += r.vy * dt;
      if (!still) emit(r.x + (Math.random() - 0.5) * 0.1, r.y, r.z, 0, -1, 0, 0.5, gold, 3);
      if (r.y >= r.top || r.vy < 3) { explode(r); rockets.splice(i, 1); }
    }
    for (let i = 0; i < MAX; i++) {
      if (age[i] >= life[i]) { col[i * 4 + 3] = 0; continue; }
      age[i] += dt;
      const dd = Math.exp(-drag[i] * dt);
      vel[i * 3] *= dd; vel[i * 3 + 1] = vel[i * 3 + 1] * dd - 3.2 * dt; vel[i * 3 + 2] *= dd;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const k = 1 - age[i] / life[i];
      const tw = k < 0.35 ? (Math.random() < 0.5 ? 1 : 0.3) : 1; // crackle as they die
      col[i * 4] = base[i * 3]; col[i * 4 + 1] = base[i * 3 + 1]; col[i * 4 + 2] = base[i * 3 + 2];
      col[i * 4 + 3] = Math.min(1, k * 1.6) * tw;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
  return {
    launch,
    salvo(n) { for (let i = 0; i < n; i++) bag.later(i * 180 + Math.random() * 120, () => launch()); },
  };
}
