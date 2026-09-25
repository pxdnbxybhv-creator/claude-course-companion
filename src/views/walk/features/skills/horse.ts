// 关公 · 赤兔: Red Hare gallops in, Lord Guan swings up into the saddle and rides — steer with the
// stick, run to gallop, jump to leap — hoofbeats, dust and hoof prints behind, and people bow as he
// passes ('banmu:bow'). The action button (E) — or the skill key, where the HUD lets it through —
// and he swings down; the horse canters off. The horse is one draw (plus its outline), its legs,
// mane and tail moving in the vertex shader.
import type * as T from 'three';
import type { Bag } from '../kit';
import { CELL, MODE } from './fx';
import { horseAnimate, horseGeometry } from './shapes';
import { HUE, TAU, clamp01, damp, forward, skillEvent, type Running, type SkillEnv } from './env';
import * as snd from './sound';

interface Rig {
  group: T.Group;
  body: T.Group;
  saddle: T.Object3D;
  shadow: T.Mesh;
  uniforms: { uGait: { value: number }; uAmp: { value: number } };
}

function buildHorse(bag: Bag): Rig {
  const { THREE } = bag.ctx;
  const { geo, saddleY } = horseGeometry(THREE);
  const grad = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  bag.own(grad);
  const uniforms = { uGait: { value: 0 }, uAmp: { value: 0 } };
  const mat = new THREE.MeshToonMaterial({ color: '#ffffff', vertexColors: true, gradientMap: grad });
  horseAnimate(mat, uniforms, 'red-hare');
  const hullMat = new THREE.MeshBasicMaterial({ color: '#1b1916', side: THREE.BackSide });
  horseAnimate(hullMat, uniforms, 'red-hare-outline', 0.016);
  const group = new THREE.Group();
  group.name = 'red-hare';
  const body = new THREE.Group();
  group.add(body);
  const mesh = new THREE.Mesh(geo, mat);
  const hull = new THREE.Mesh(geo, hullMat);
  body.add(mesh, hull);
  const saddle = new THREE.Object3D();
  saddle.position.set(0, saddleY - 0.03, -0.04);
  body.add(saddle);
  // a soft shadow on the ground
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(0,0,0,0.5)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const st = new THREE.CanvasTexture(c);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, color: '#3a2a1c', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  shadow.name = 'red-hare-shadow';
  group.visible = false;
  shadow.visible = false;
  bag.add(group);
  bag.add(shadow);
  return { group, body, saddle, shadow, uniforms };
}

export function makeGuan(bag: Bag): (env: SkillEnv) => Running {
  let rig: Rig | null = null;
  return (env) => {
    const { ctx, fx, rng } = env;
    const { THREE } = ctx;
    const P = ctx.player;
    rig ??= buildHorse(bag);
    const R = rig;
    P.emote('skill');
    snd.neigh(0.7);
    // Red Hare comes from behind and to the side
    const [f0x, f0z] = forward(P.heading);
    let hx = P.position.x, hz = P.position.z;
    for (let k = 0; k < 10; k++) {
      const a = P.heading + Math.PI + rng.range(-0.9, 0.9), d = rng.range(7, 10);
      const x = P.position.x + Math.sin(a) * d, z = P.position.z + Math.cos(a) * d;
      if (ctx.isWalkable(x, z) && Math.abs(ctx.groundY(x, z) - P.position.y) < 2) { hx = x; hz = z; break; }
    }
    let hy = env.floorAt(hx, hz), vy = 0, grounded = true;
    let heading = Math.atan2(P.position.x - hx, P.position.z - hz);
    let speed = 0, gait = 0, beat = 0;
    let phase: 'come' | 'ride' | 'go' | 'gone' = 'come';
    let t0 = -1, rideAt = -1, goAt = -1, dustAt = 0, bowAt = 0, printAt = 0, pSide = 1;
    let lastLandX = hx, lastLandZ = hz;
    R.group.visible = R.shadow.visible = true;
    R.group.scale.setScalar(1);
    const dir = new THREE.Vector3();
    ctx.hud.toast('赤兔来也！——摇杆驭马，疾跑飞驰，跳跃越涧；按互动键（E）下马', 'Red Hare! Steer with the stick, run to gallop, jump to leap; the action button (E) to dismount', 3600);
    const mount = () => {
      phase = 'ride';
      hx = P.position.x; hz = P.position.z; hy = env.floorAt(hx, hz);
      heading = P.heading;
      place(0);
      R.group.updateMatrixWorld(true);
      P.freeze(true);
      P.ride(R.saddle);
      snd.swish(0.5);
      for (let i = 0; i < 8; i++) fx.air.emit({ x: hx + rng.range(-0.5, 0.5), y: hy + 0.1, z: hz + rng.range(-0.5, 0.5), vx: rng.range(-0.6, 0.6), vy: rng.range(0.3, 0.8), vz: rng.range(-0.6, 0.6), drag: 2, life: 1, size: 0.35, grow: 2.4, color: HUE.dust, alpha: 0.35, mode: MODE.puff, cell: CELL.soft });
    };
    const dismount = () => {
      if (phase !== 'ride') return;
      phase = 'go';
      P.ride(null);
      P.freeze(false);
      snd.neigh(0.5);
    };
    const place = (bob: number) => {
      R.group.position.set(hx, hy + bob, hz);
      R.group.rotation.y = heading;
      R.shadow.position.set(hx, env.floorAt(hx, hz) + 0.03, hz);
      R.shadow.rotation.y = heading;
    };
    /** May the horse step from (x0, z0) to (x, z)? */
    const open = (x0: number, z0: number, x: number, z: number, air: boolean) => {
      const w = ctx.waterAt(x, z);
      if (w !== null) return air;
      if (!ctx.isWalkable(x, z)) return false;
      if (air) return ctx.groundY(x, z) < hy + 0.2;
      // no cliffs: judged half a metre ahead
      const l = Math.hypot(x - x0, z - z0) || 1;
      const ax = x + ((x - x0) / l) * 0.5, az = z + ((z - z0) / l) * 0.5;
      return ctx.groundY(ax, az) - ctx.groundY(x0, z0) < 0.55;
    };
    return {
      ownsFreeze: true,
      press: dismount,
      update(dt, t) {
        if (t0 < 0) t0 = t;
        const el = t - t0;
        let target = 0;
        if (phase === 'come') {
          // gallop up beside him, then he is up in the saddle
          const tx = P.position.x - f0z * 0.2, tz = P.position.z + f0x * 0.2;
          const dx = tx - hx, dz = tz - hz, d = Math.hypot(dx, dz);
          heading = Math.atan2(dx, dz);
          target = Math.min(8, d * 3);
          speed = damp(speed, target, 4, dt);
          const stepLen = Math.min(d, speed * dt);
          hx += (dx / (d || 1)) * stepLen; hz += (dz / (d || 1)) * stepLen;
          hy = damp(hy, env.floorAt(hx, hz), 12, dt);
          if (d < 0.35 || el > 2.4) mount();
        } else if (phase === 'ride') {
          if (rideAt < 0) rideAt = t;
          if (ctx.input.actionPressed) dismount();
          // steer by the stick, relative to the camera
          ctx.camera.getWorldDirection(dir);
          const cl = Math.hypot(dir.x, dir.z) || 1;
          const cfx = dir.x / cl, cfz = dir.z / cl;
          const ix = ctx.input.x, iy = ctx.input.y;
          const mag = Math.min(1, Math.hypot(ix, iy));
          if (mag > 0.08) {
            const wx = cfx * iy - cfz * ix, wz = cfz * iy + cfx * ix;
            let dh = Math.atan2(wx, wz) - heading;
            while (dh > Math.PI) dh -= TAU;
            while (dh < -Math.PI) dh += TAU;
            heading += Math.max(-1, Math.min(1, dh)) * Math.min(1, dt * 4.2);
          }
          target = mag * (ctx.input.run ? 9.5 : 5.4);
          speed = damp(speed, target, target > speed ? 2.2 : 4, dt);
          if (ctx.input.jumpPressed && grounded) { vy = 5.8; grounded = false; snd.neigh(0.35); }
          const [hfx, hfz] = forward(heading);
          const nx = hx + hfx * speed * dt, nz = hz + hfz * speed * dt;
          if (open(hx, hz, nx, nz, !grounded)) { hx = nx; hz = nz; }
          else if (open(hx, hz, nx, hz, !grounded)) { hx = nx; speed *= 0.9; }
          else if (open(hx, hz, hx, nz, !grounded)) { hz = nz; speed *= 0.9; }
          else speed *= 0.5;
          const floor = env.floorAt(hx, hz);
          if (!grounded) {
            vy -= 14 * dt;
            hy += vy * dt;
            if (hy <= floor) {
              hy = floor; vy = 0; grounded = true;
              snd.hoof(0.8);
              fx.ground.emit({ x: hx, y: floor + 0.04, z: hz, life: 0.9, size: 0.8, grow: 3, color: HUE.dust, alpha: 0.4, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
              if (ctx.waterAt(hx, hz) !== null) {
                // came down in the water: back onto the bank
                snd.splash(0.6);
                hx = lastLandX; hz = lastLandZ; hy = env.floorAt(hx, hz); speed = 0;
              }
            }
          } else {
            hy = damp(hy, floor, 14, dt);
            if (ctx.waterAt(hx, hz) === null) { lastLandX = hx; lastLandZ = hz; }
          }
          if (t - rideAt > 20) dismount();
        } else if (phase === 'go') {
          if (goAt < 0) goAt = t;
          // he is off: Red Hare canters away and is gone
          const k = t - goAt;
          speed = damp(speed, 7, 2, dt);
          const [hfx, hfz] = forward(heading);
          const nx = hx + hfx * speed * dt, nz = hz + hfz * speed * dt;
          if (k > 0.35) {
            if (open(hx, hz, nx, nz, false)) { hx = nx; hz = nz; } else heading += dt * 2;
          }
          hy = damp(hy, env.floorAt(hx, hz), 12, dt);
          const fade = clamp01((k - 1.6) / 0.8);
          R.group.scale.setScalar(Math.max(0.001, 1 - fade));
          if (k > 2.4) {
            phase = 'gone';
            R.group.visible = R.shadow.visible = false;
            for (let i = 0; i < 10; i++) fx.air.emit({ x: hx + rng.range(-0.6, 0.6), y: hy + rng.range(0.2, 1.2), z: hz + rng.range(-0.6, 0.6), vy: rng.range(0.2, 0.7), drag: 2, life: 1.2, size: 0.4, grow: 2.5, color: HUE.dust, alpha: 0.3, mode: MODE.puff, cell: CELL.soft });
            return false;
          }
        }
        // the gait
        const amp = clamp01(speed / 4) * (grounded ? 1 : 0.35);
        gait += speed * 1.9 * dt;
        R.uniforms.uGait.value = gait;
        R.uniforms.uAmp.value = env.reduced ? amp * 0.6 : amp;
        const bob = grounded ? Math.abs(Math.sin(gait)) * 0.07 * amp : 0;
        R.body.rotation.x = grounded ? Math.sin(gait) * 0.04 * amp : -vy * 0.04;
        place(bob);
        // four beats a stride
        const nb = Math.floor(gait / (Math.PI / 2));
        if (nb !== beat) {
          beat = nb;
          if (grounded && speed > 1) snd.hoof(0.25 + 0.3 * amp);
        }
        const [hfx, hfz] = forward(heading);
        // dust, hoof prints, and the bow of everyone he passes
        if (grounded && speed > 3 && t > dustAt && ctx.waterAt(hx, hz) === null) {
          dustAt = t + (env.reduced ? 0.25 : 0.08);
          fx.air.emit({ x: hx - hfx * 0.7 + rng.range(-0.3, 0.3), y: hy + 0.08, z: hz - hfz * 0.7 + rng.range(-0.3, 0.3), vx: -hfx * 0.6, vy: rng.range(0.3, 0.7), vz: -hfz * 0.6, drag: 2.2, life: rng.range(0.7, 1.1), size: rng.range(0.3, 0.45), grow: 2.4, color: HUE.dust, alpha: 0.32, mode: MODE.puff, cell: CELL.soft });
        }
        if (grounded && speed > 1.5 && t > printAt && ctx.waterAt(hx, hz) === null) {
          printAt = t + 3.2 / Math.max(3, speed);
          pSide = -pSide;
          const px = hx - hfz * 0.14 * pSide, pz = hz + hfx * 0.14 * pSide;
          fx.ground.emit({ x: px, y: env.floorAt(px, pz) + 0.025, z: pz, life: 8, size: 0.2, color: HUE.inkSoft, alpha: 0.4, mode: MODE.flat, cell: CELL.hoof, rot: heading + Math.PI, fadeIn: 0.05, fadeOut: 0.3 });
        }
        if (phase === 'ride' && speed > 1.5 && t > bowAt) {
          bowAt = t + 0.6;
          skillEvent('banmu:bow', hx, hz, 12);
        }
        return true;
      },
      end() {
        if (phase === 'ride') { P.ride(null); P.freeze(false); }
        phase = 'gone';
        R.group.visible = R.shadow.visible = false;
      },
    };
  };
}
