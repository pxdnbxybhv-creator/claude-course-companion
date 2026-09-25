// Everyday life in the garden (always on): koi in the pond, sparrows on the lawn, dragonflies over
// the water, butterflies by day in spring and summer, fireflies on summer nights, a crane now and then.
import type * as T from 'three';
import type { WorldCtx, WorldFeature } from '../types';
import { Bag, feature, findSpot, glowTexture, pondDist, reducedMotion, reflects, shorePoint, dayRng } from './kit';
import { birdGeometry, butterflyGeometry, dragonflyGeometry, instanceAttrs, koiGeometry, merge, part, poly, swimMaterial, wingMaterial } from './geo';
import * as sfx from './sfx';

const TAU = Math.PI * 2;


// ───────────────────────────── koi ─────────────────────────────

interface Fish { x: number; z: number; h: number; speed: number; tx: number; tz: number; wait: number; scare: number; bob: number }

export const koi: WorldFeature = feature('koi', (bag, ctx) => {
  const { THREE, pond, palette: P } = ctx;
  const rng = dayRng(ctx, '101');
  const n = 7;
  const geo = koiGeometry(THREE, P.vermilion, P.white, '#e9dccb');
  const attrs = instanceAttrs(THREE, geo, n, (i) => i * 2.3);
  const anim = swimMaterial(THREE);
  const mesh = bag.add(new THREE.InstancedMesh(geo, anim.material, n));
  mesh.frustumCulled = false;
  const tints = [P.white, P.white, '#f0c060', P.white, '#3a3833', '#f3dfb0', P.white];
  const scale: number[] = [];
  for (let i = 0; i < n; i++) {
    mesh.setColorAt(i, new THREE.Color(tints[i % tints.length]));
    scale.push(0.75 + rng() * 0.55);
  }
  const inside = (): [number, number] => {
    const a = rng() * TAU, r = Math.sqrt(rng()) * 0.72;
    return [pond.center.x + Math.cos(a) * pond.radiusX * r, pond.center.z + Math.sin(a) * pond.radiusZ * r];
  };
  const fish: Fish[] = Array.from({ length: n }, () => {
    const [x, z] = inside();
    const [tx, tz] = inside();
    return { x, z, h: rng() * TAU, speed: 0.2, tx, tz, wait: 0, scare: 0, bob: rng() * TAU };
  });

  // 观鱼: a spot on the shore with a little jar of fish food.
  const feedAt = shorePoint(ctx, rng() * TAU, 0.7);
  let feedA = Math.atan2(feedAt.z - pond.center.z, feedAt.x - pond.center.x);
  for (let k = 0; k < 24 && !ctx.isWalkable(feedAt.x, feedAt.z); k++) {
    feedA += TAU / 24;
    feedAt.copy(shorePoint(ctx, feedA, 0.7));
  }
  const jar = new THREE.Group();
  jar.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.16, 7), new THREE.MeshLambertMaterial({ color: P.ochre, flatShading: true })));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.03, 7), new THREE.MeshLambertMaterial({ color: P.ink, flatShading: true }));
  lid.position.y = 0.09;
  jar.add(lid);
  const out = new THREE.Vector3(Math.cos(feedA), 0, Math.sin(feedA));
  jar.position.set(feedAt.x + out.x * 0.5, ctx.groundY(feedAt.x + out.x * 0.5, feedAt.z + out.z * 0.5) + 0.08, feedAt.z + out.z * 0.5);
  bag.add(jar);
  const feedWater = new THREE.Vector3(pond.center.x + Math.cos(feedA) * pond.radiusX * 0.78, pond.waterY, pond.center.z + Math.sin(feedA) * pond.radiusZ * 0.78);
  let feeding = 0;
  const pellets = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.018, 0), new THREE.MeshLambertMaterial({ color: P.ochre, flatShading: true }), 10);
  pellets.count = 0;
  bag.add(pellets);
  const pelletPos: T.Vector3[] = [];
  bag.interact({
    id: 'koi-feed', position: feedAt, radius: 1.8,
    labelZh: '观鱼', labelEn: 'Koi',
    actionZh: '喂鱼', actionEn: 'Feed the koi',
    act() {
      feeding = 9;
      pelletPos.length = 0;
      for (let i = 0; i < 10; i++) pelletPos.push(new THREE.Vector3(feedWater.x + (rng() - 0.5) * 0.9, pond.waterY + 0.01, feedWater.z + (rng() - 0.5) * 0.9));
      pellets.count = 10;
      sfx.plop(0.4);
      ctx.hud.toast('锦鲤都游过来了', 'The koi come gliding over', 2600);
    },
  });

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  let plopCool = 0;
  bag.frame((dt, t) => {
    anim.uniforms.uTime.value = t;
    dt = Math.min(dt, 0.1);
    const pp = ctx.player.position;
    feeding = Math.max(0, feeding - dt);
    plopCool -= dt;
    // the qin player playing by the pond: the koi forget their fear and gather to listen
    const listening = ctx.player.emoting === 'play' && pondDist(ctx, pp.x, pp.z) < 2.4;
    let lx = 0, lz = 0;
    if (listening) {
      const a = Math.atan2(pp.z - pond.center.z, pp.x - pond.center.x);
      lx = pond.center.x + Math.cos(a) * pond.radiusX * 0.62;
      lz = pond.center.z + Math.sin(a) * pond.radiusZ * 0.62;
    }
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      const dp = Math.hypot(f.x - pp.x, f.z - pp.z);
      if (listening) {
        const k = i * 1.7;
        f.scare = 0;
        f.tx = lx + Math.cos(t * 0.5 + k) * 0.6;
        f.tz = lz + Math.sin(t * 0.5 + k) * 0.6;
      } else if (dp < 2.6 && f.scare <= 0) {
        f.scare = 2.2;
        const ax = f.x - pp.x, az = f.z - pp.z, len = Math.hypot(ax, az) || 1;
        f.tx = pond.center.x + (ax / len) * pond.radiusX * 0.2 + (pond.center.x - pp.x) * 0.3;
        f.tz = pond.center.z + (az / len) * pond.radiusZ * 0.2 + (pond.center.z - pp.z) * 0.3;
        if (plopCool <= 0) { sfx.plop(0.35); plopCool = 3; }
      }
      f.scare -= dt;
      if (feeding > 0 && f.scare <= 0) {
        const k = i * 1.7;
        f.tx = feedWater.x + Math.cos(t * 0.8 + k) * 0.45;
        f.tz = feedWater.z + Math.sin(t * 0.8 + k) * 0.45;
      }
      let want = f.scare > 0 ? 1.5 : feeding > 0 || listening ? 0.7 : 0.22;
      const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
      if (d < 0.3 && f.scare <= 0 && feeding <= 0 && !listening) {
        f.wait -= dt;
        want = 0.04;
        if (f.wait <= 0) { [f.tx, f.tz] = inside(); f.wait = 1 + rng() * 4; }
      }
      const th = Math.atan2(dx, dz);
      let dh = th - f.h;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      f.h += Math.max(-1, Math.min(1, dh)) * dt * (f.scare > 0 ? 4 : 1.2);
      f.speed += (want - f.speed) * Math.min(1, dt * 2);
      let nx = f.x + Math.sin(f.h) * f.speed * dt, nz = f.z + Math.cos(f.h) * f.speed * dt;
      if (pondDist(ctx, nx, nz) > 0.86) { // turn back from the shore
        nx = f.x; nz = f.z;
        [f.tx, f.tz] = inside();
      }
      f.x = nx; f.z = nz;
      attrs.amp.setX(i, Math.min(1, f.speed / 1.2));
      const sc = scale[i];
      e.set(0, f.h, Math.sin(t * 1.3 + f.bob) * 0.04);
      q.setFromEuler(e);
      v.set(f.x, pond.waterY - 0.09 + Math.sin(t * 0.7 + f.bob) * 0.02, f.z);
      s.set(sc, sc, sc);
      m.compose(v, q, s);
      mesh.setMatrixAt(i, m);
    }
    attrs.amp.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
    if (pellets.count) {
      for (let i = 0; i < pelletPos.length; i++) {
        const pz = pelletPos[i];
        if (pz.y < -100) continue;
        for (const f of fish) if (Math.hypot(f.x - pz.x, f.z - pz.z) < 0.14) { pz.y = -999; if (plopCool <= 0) { sfx.plop(0.2); plopCool = 0.4; } }
        if (pz.y < -100) { m.makeScale(0, 0, 0); pellets.setMatrixAt(i, m); continue; }
        m.makeTranslation(pz.x, pond.waterY + 0.012 + Math.sin(t * 2 + i) * 0.004, pz.z);
        pellets.setMatrixAt(i, m);
      }
      pellets.instanceMatrix.needsUpdate = true;
      if (feeding <= 0) pellets.count = 0;
    }
  });
});

// ───────────────────────────── sparrows ─────────────────────────────

interface Bird { x: number; y: number; z: number; h: number; mode: 0 | 1; hop: number; hopT: number; fx: number; fz: number; fy: number; tx: number; tz: number; ty: number; ft: number; fd: number; delay: number; peck: number }

export const sparrows: WorldFeature = feature('sparrows', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '202');
  const n = 6;
  const geo = birdGeometry(THREE, { body: P.ochre, belly: '#e8dcc6', wing: '#7a5431', tip: P.ink, beak: P.ink });
  const attrs = instanceAttrs(THREE, geo, n, (i) => i * 1.9);
  const anim = wingMaterial(THREE, { rate: 38, angle: 0.9, lift: 0.15, fold: 0.2 });
  const mesh = bag.add(new THREE.InstancedMesh(geo, anim.material, n));
  mesh.frustumCulled = false;
  let home = findSpot(ctx, rng, { minR: 3, clear: 2.5, pondMargin: 2 });
  const birds: Bird[] = Array.from({ length: n }, () => {
    const x = home.x + (rng() - 0.5) * 2.2, z = home.z + (rng() - 0.5) * 2.2;
    return { x, y: ctx.groundY(x, z), z, h: rng() * TAU, mode: 0, hop: 0, hopT: rng() * 1.5, fx: 0, fy: 0, fz: 0, tx: 0, ty: 0, tz: 0, ft: 0, fd: 1, delay: 0, peck: 0 };
  });
  const scare = () => {
    const next = findSpot(ctx, rng, { near: { x: home.x, z: home.z, r: 16, min: 8 }, pondMargin: 2, noClaim: true });
    home = next;
    birds.forEach((b, i) => {
      b.mode = 1;
      b.fx = b.x; b.fy = b.y; b.fz = b.z;
      b.tx = home.x + (rng() - 0.5) * 2.4; b.tz = home.z + (rng() - 0.5) * 2.4; b.ty = ctx.groundY(b.tx, b.tz);
      b.ft = 0; b.fd = 2.2 + rng() * 1.2; b.delay = i * 0.07 + rng() * 0.15;
    });
    sfx.chirps(4, 0.5);
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1.15, 1.15, 1.15);
  bag.frame((dt, t) => {
    anim.uniforms.uTime.value = t;
    dt = Math.min(dt, 0.1);
    const pp = ctx.player.position;
    if (birds.every((b) => b.mode === 0) && birds.some((b) => Math.hypot(b.x - pp.x, b.z - pp.z) < 3.2)) scare();
    for (let i = 0; i < n; i++) {
      const b = birds[i];
      let pitch = 0, yOff = 0;
      if (b.mode === 1) {
        if (b.delay > 0) { b.delay -= dt; attrs.amp.setX(i, 0); }
        else {
          b.ft += dt;
          const k = Math.min(1, b.ft / b.fd);
          const ek = k * k * (3 - 2 * k);
          b.x = b.fx + (b.tx - b.fx) * ek;
          b.z = b.fz + (b.tz - b.fz) * ek;
          b.y = b.fy + (b.ty - b.fy) * ek + Math.sin(k * Math.PI) * (2.2 + i * 0.2);
          b.h = Math.atan2(b.tx - b.fx, b.tz - b.fz);
          pitch = -Math.cos(k * Math.PI) * 0.35;
          attrs.amp.setX(i, k < 0.92 ? 1 : 0);
          if (k >= 1) { b.mode = 0; b.hopT = 0.5 + rng(); }
        }
      } else {
        attrs.amp.setX(i, 0);
        b.hopT -= dt;
        if (b.hop > 0) {
          b.hop -= dt * 4;
          const d = 0.06 * dt * 4 * 3;
          b.x += Math.sin(b.h) * d; b.z += Math.cos(b.h) * d;
          yOff = Math.sin(Math.max(0, b.hop) * Math.PI) * 0.07;
        } else if (b.hopT <= 0) {
          b.hopT = 0.35 + rng() * 1.4;
          if (rng() < 0.35) b.peck = 0.35;
          else {
            const toHome = Math.atan2(home.x - b.x, home.z - b.z);
            b.h = Math.hypot(home.x - b.x, home.z - b.z) > 1.6 ? toHome : b.h + (rng() - 0.5) * 2.4;
            const nx = b.x + Math.sin(b.h) * 0.18, nz = b.z + Math.cos(b.h) * 0.18;
            if (ctx.isWalkable(nx, nz) && pondDist(ctx, nx, nz, 0.3) > 1) b.hop = 1;
          }
        }
        if (b.peck > 0) { b.peck -= dt; pitch = Math.sin((b.peck / 0.35) * Math.PI) * 0.6; }
        b.y = ctx.groundY(b.x, b.z);
      }
      e.set(pitch, b.h, 0);
      q.setFromEuler(e);
      v.set(b.x, b.y + 0.05 + yOff, b.z);
      m.compose(v, q, one);
      mesh.setMatrixAt(i, m);
    }
    attrs.amp.needsUpdate = true;
    mesh.instanceMatrix.needsUpdate = true;
  });
});

// ───────────────────────────── dragonflies & butterflies ─────────────────────────────

interface Flyer { x: number; y: number; z: number; tx: number; ty: number; tz: number; h: number; wait: number; speed: number }

export const insects: WorldFeature = feature('insects', (bag, ctx) => {
  const { THREE, pond, palette: P, env } = ctx;
  const rng = dayRng(ctx, '303');
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);

  // Dragonflies: red in autumn (红蜻蜓), blue-green otherwise; not in winter.
  const dfN = env.season === 'winter' ? 0 : 3;
  let dfMesh: T.InstancedMesh | null = null;
  let dfAnim: ReturnType<typeof wingMaterial> | null = null;
  const dfs: Flyer[] = [];
  const overWater = (): [number, number, number] => {
    const a = rng() * TAU, r = 0.45 + rng() * 0.6;
    return [pond.center.x + Math.cos(a) * pond.radiusX * r, pond.waterY + 0.5 + rng() * 0.9, pond.center.z + Math.sin(a) * pond.radiusZ * r];
  };
  if (dfN) {
    const geo = dragonflyGeometry(THREE, env.season === 'autumn' ? P.cinnabar : P.azurite, '#e8eef0');
    instanceAttrs(THREE, geo, dfN, (i) => i * 1.3);
    dfAnim = wingMaterial(THREE, { rate: 70, angle: 0.35 });
    dfMesh = bag.add(new THREE.InstancedMesh(geo, dfAnim.material, dfN));
    dfMesh.frustumCulled = false;
    for (let i = 0; i < dfN; i++) {
      const [x, y, z] = overWater();
      dfs.push({ x, y, z, tx: x, ty: y, tz: z, h: 0, wait: rng() * 2, speed: 0 });
    }
  }

  // Butterflies: spring & summer days.
  const bfN = env.season === 'spring' || env.season === 'summer' ? 5 : env.season === 'autumn' ? 2 : 0;
  let bfMesh: T.InstancedMesh | null = null;
  let bfAnim: ReturnType<typeof wingMaterial> | null = null;
  const bfs: Flyer[] = [];
  if (bfN) {
    const geo = butterflyGeometry(THREE, '#f1ead8', P.ink, P.ink);
    instanceAttrs(THREE, geo, bfN, (i) => i * 2.1);
    bfAnim = wingMaterial(THREE, { rate: 16, angle: 0.95, lift: 0.35 });
    bfMesh = bag.add(new THREE.InstancedMesh(geo, bfAnim.material, bfN));
    bfMesh.frustumCulled = false;
    const tints = ['#ffffff', P.gamboge, '#f3c9c0', '#ffffff', P.gamboge];
    for (let i = 0; i < bfN; i++) {
      bfMesh.setColorAt(i, new THREE.Color(tints[i]));
      const s = findSpot(ctx, rng, { pondMargin: 0.5, noClaim: true });
      bfs.push({ x: s.x, y: s.y + 1, z: s.z, tx: s.x, ty: s.y + 1, tz: s.z, h: 0, wait: 0, speed: 0.7 });
    }
  }

  bag.frame((dt, t) => {
    dt = Math.min(dt, 0.1);
    const night = ctx.sky.isNight();
    if (dfMesh && dfAnim) {
      dfMesh.visible = !night;
      if (!night) {
        dfAnim.uniforms.uTime.value = t;
        for (let i = 0; i < dfN; i++) {
          const f = dfs[i];
          f.wait -= dt;
          const dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z, d = Math.hypot(dx, dy, dz);
          if (d < 0.05 && f.wait <= 0) {
            [f.tx, f.ty, f.tz] = overWater();
            f.wait = 0.8 + rng() * 2.5;
          }
          if (d > 0.02 && f.wait < 0.6) {
            const k = Math.min(1, dt * 3.5);
            f.x += dx * k; f.y += dy * k; f.z += dz * k;
            f.h = Math.atan2(dx, dz);
          }
          e.set(0, f.h, 0);
          q.setFromEuler(e);
          v.set(f.x + Math.sin(t * 7 + i) * 0.01, f.y + Math.sin(t * 3 + i * 2) * 0.03, f.z);
          m.compose(v, q, one);
          dfMesh.setMatrixAt(i, m);
        }
        dfMesh.instanceMatrix.needsUpdate = true;
      }
    }
    if (bfMesh && bfAnim) {
      bfMesh.visible = !night;
      if (!night) {
        bfAnim.uniforms.uTime.value = t;
        for (let i = 0; i < bfN; i++) {
          const f = bfs[i];
          const dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
          if (d < 0.3) {
            const s = findSpot(ctx, rng, { near: { x: f.x, z: f.z, r: 5, min: 1.5 }, pondMargin: 0, noClaim: true, tries: 12 });
            f.tx = s.x; f.tz = s.z; f.ty = s.y + 0.5 + rng() * 1.3;
          }
          const want = Math.atan2(dx, dz);
          let dh = Math.atan2(Math.sin(want - f.h), Math.cos(want - f.h));
          dh += Math.sin(t * 2.3 + i * 5) * 1.4; // erratic
          f.h += dh * dt * 1.6;
          f.x += Math.sin(f.h) * f.speed * dt;
          f.z += Math.cos(f.h) * f.speed * dt;
          f.y += (f.ty - f.y) * dt * 0.8;
          e.set(0, f.h, Math.sin(t * 3 + i) * 0.2);
          q.setFromEuler(e);
          v.set(f.x, f.y + Math.sin(t * 16 + i * 2.1) * 0.035, f.z);
          m.compose(v, q, one);
          bfMesh.setMatrixAt(i, m);
        }
        bfMesh.instanceMatrix.needsUpdate = true;
      }
    }
  });
});

// ───────────────────────────── fireflies ─────────────────────────────

/** Fireflies on summer nights (and on 七夕, whatever the season). */
export function fireflySwarm(bag: Bag, ctx: WorldCtx, n: number, always = false): void {
  const { THREE, pond } = ctx;
  const rng = dayRng(ctx, '404');
  const count = reducedMotion() ? Math.ceil(n / 2) : n;
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const home: { x: number; y: number; z: number; p: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    let x: number, z: number;
    if (i % 2 === 0) { // by the water's edge
      const a = rng() * TAU, r = 0.8 + rng() * 0.5;
      x = pond.center.x + Math.cos(a) * pond.radiusX * r;
      z = pond.center.z + Math.sin(a) * pond.radiusZ * r;
    } else {
      const s = findSpot(ctx, rng, { noClaim: true, pondMargin: 0, tries: 10 });
      x = s.x; z = s.z;
    }
    const gy = Math.max(ctx.groundY(x, z), pond.waterY);
    home.push({ x, y: gy + 0.3 + rng() * 1.4, z, p: rng() * TAU, s: 0.5 + rng() * 0.8 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const tex = glowTexture(THREE, 64, 0.08);
  const mat = new THREE.PointsMaterial({
    size: 0.22, map: tex, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false,
  });
  const pts = bag.add(new THREE.Points(geo, mat));
  pts.frustumCulled = false;
  const c = new THREE.Color('#d8f07a');
  bag.frame((_dt, t) => {
    const on = always || ctx.sky.isNight();
    pts.visible = on;
    if (!on) return;
    for (let i = 0; i < count; i++) {
      const h = home[i];
      const k = t * 0.25 * h.s + h.p;
      pos[i * 3] = h.x + Math.sin(k) * 0.9 + Math.sin(k * 2.7) * 0.2;
      pos[i * 3 + 1] = h.y + Math.sin(k * 1.3) * 0.35;
      pos[i * 3 + 2] = h.z + Math.cos(k * 0.8) * 0.9;
      const blink = Math.max(0, Math.sin(t * 1.7 * h.s + h.p * 3));
      const b = blink * blink * blink;
      col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  });
}

export const fireflies: WorldFeature = feature('fireflies', (bag, ctx) => {
  if (ctx.env.season !== 'summer' || ctx.env.festivals.includes('qixi')) return; // 七夕 brings its own
  fireflySwarm(bag, ctx, 40);
});

// ───────────────────────────── crane ─────────────────────────────

export const crane: WorldFeature = feature('crane', (bag, ctx) => {
  const { THREE, palette: P } = ctx;
  const rng = dayRng(ctx, '505');
  const white = '#f6f2e8';
  const parts: T.BufferGeometry[] = [];
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.22, 0), white, { s: [0.9, 0.75, 2.0] }));
  parts.push(part(THREE, new THREE.CylinderGeometry(0.035, 0.05, 0.75, 5), P.ink, { p: [0, 0.07, 0.65], r: [Math.PI / 2 - 0.15, 0, 0] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.06, 0), white, { p: [0, 0.13, 1.02] }));
  parts.push(part(THREE, new THREE.IcosahedronGeometry(0.035, 0), P.cinnabar, { p: [0, 0.18, 1.02] }));
  parts.push(part(THREE, new THREE.ConeGeometry(0.018, 0.2, 4), P.ochre, { p: [0, 0.12, 1.16], r: [Math.PI / 2, 0, 0] }));
  parts.push(part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.9, 3), P.ink, { p: [0.05, -0.05, -0.75], r: [Math.PI / 2 + 0.08, 0, 0] }));
  parts.push(part(THREE, new THREE.CylinderGeometry(0.012, 0.012, 0.9, 3), P.ink, { p: [-0.05, -0.05, -0.75], r: [Math.PI / 2 + 0.08, 0, 0] }));
  parts.push(part(THREE, poly(THREE, [[0, 0, -0.35], [0.12, 0.02, -0.62], [-0.12, 0.02, -0.62]]), P.ink));
  for (const s of [1, -1]) {
    const h = 0.14, f = (x: number) => Math.max(0, Math.abs(x) - h);
    parts.push(part(THREE, poly(THREE, [[s * h, 0.05, 0.2], [s * (h + 0.6), 0.05, 0.12], [s * (h + 1.05), 0.05, -0.05], [s * (h + 0.7), 0.05, -0.3], [s * h, 0.05, -0.25]]), white, {}, f));
    parts.push(part(THREE, poly(THREE, [[s * (h + 0.1), 0.049, -0.24], [s * (h + 0.7), 0.049, -0.3], [s * (h + 0.6), 0.049, -0.42], [s * (h + 0.12), 0.049, -0.36]]), P.ink, {}, f));
  }
  const geo = merge(THREE, parts);
  const attrs = instanceAttrs(THREE, geo, 1, () => 0);
  const anim = wingMaterial(THREE, { rate: 3.2, angle: 0.55, lift: 0.05, fold: 1 });
  const mesh = bag.add(reflects(new THREE.InstancedMesh(geo, anim.material, 1))); // a crane flying over the pond
  mesh.frustumCulled = false;
  mesh.visible = false;
  const R = ctx.bounds.radius * 1.5;
  let next = 10 + rng() * 15, flying = false, from = new THREE.Vector3(), to = new THREE.Vector3(), k = 0, dur = 1;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1.3, 1.3, 1.3);
  bag.frame((dt, t) => {
    anim.uniforms.uTime.value = t;
    if (!flying) {
      next -= dt;
      if (next > 0) return;
      const a = rng() * TAU, b = a + Math.PI + (rng() - 0.5) * 1.2, y = 13 + rng() * 7;
      from.set(Math.cos(a) * R, y, Math.sin(a) * R);
      to.set(Math.cos(b) * R, y + (rng() - 0.5) * 4, Math.sin(b) * R);
      dur = from.distanceTo(to) / 5.5;
      k = 0;
      flying = true;
      mesh.visible = true;
    }
    k += dt / dur;
    if (k >= 1) { flying = false; mesh.visible = false; next = 45 + rng() * 60; return; }
    v.lerpVectors(from, to, k);
    v.y += Math.sin(k * Math.PI) * 2;
    const beat = (Math.sin(t * 0.45) + 1) / 2; // long glides between slow beats
    attrs.amp.setX(0, beat > 0.6 ? 1 : 0.15);
    attrs.amp.needsUpdate = true;
    e.set(0, Math.atan2(to.x - from.x, to.z - from.z), Math.sin(t * 0.3) * 0.12);
    q.setFromEuler(e);
    m.compose(v, q, sc);
    mesh.setMatrixAt(0, m);
    mesh.instanceMatrix.needsUpdate = true;
  });
});

export const LIFE: WorldFeature[] = [koi, sparrows, insects, fireflies, crane];
