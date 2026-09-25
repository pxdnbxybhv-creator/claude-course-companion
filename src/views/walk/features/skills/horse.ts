// 关公 · 赤兔: Red Hare gallops in, Lord Guan swings up into the saddle and rides — steer with the
// stick, run to gallop, jump to leap — hoofbeats, dust and hoof prints behind, and people bow as he
// passes ('banmu:bow'). The skill key again (Q / 技: the core lets it through while the ridden saddle
// carries userData.skillRide) or the action button (E), and he swings down; the horse canters off.
// It crosses bridges and decks, and slides round what it bumps into. The horse is one draw (plus its
// outline), its legs, mane and tail moving in the vertex shader.
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
  // a skill's own mount: while he sits on it, the skill key still reaches the skill (to get off)
  saddle.userData.skillRide = true;
  saddle.userData.mount = 'horse'; // the rider sits astride (characters' riding pose)
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
    for (let k = 0; k < 20; k++) {
      // from behind if there is room there, else from wherever there is (never out of his own feet)
      const a = k < 10 ? P.heading + Math.PI + rng.range(-0.9, 0.9) : rng.range(0, TAU), d = k < 10 ? rng.range(7, 10) : rng.range(3.5, 8);
      const x = P.position.x + Math.sin(a) * d, z = P.position.z + Math.cos(a) * d;
      if (ctx.isWalkable(x, z) && Math.abs(ctx.groundY(x, z) - P.position.y) < 2) { hx = x; hz = z; break; }
    }
    let hy = env.floorAt(hx, hz), vy = 0, grounded = true;
    let heading = Math.atan2(P.position.x - hx, P.position.z - hz);
    let speed = 0, gait = 0, beat = 0;
    let phase: 'come' | 'ride' | 'go' | 'gone' = 'come';
    let t0 = -1, rideAt = -1, goAt = -1, dustAt = 0, bowAt = 0, printAt = 0, pSide = 1;
    let lastLandX = hx, lastLandZ = hz, slideSide = 1, offNext = false;
    R.group.visible = R.shadow.visible = true;
    R.group.scale.setScalar(1);
    const dir = new THREE.Vector3();
    ctx.hud.toast('赤兔来也！——摇杆驭马，疾跑飞驰，跳跃越涧；再按「技」（Q）或互动键下马', 'Red Hare! Steer with the stick, run to gallop, jump to leap; the skill key (Q) or the action button to get down', 3600);
    const mount = () => {
      if (P.isFrozen) {
        // something else took him meanwhile (a game, a boat, a card): Red Hare turns and goes
        phase = 'go';
        return;
      }
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
    /** Open water here (a bridge, a quay or a deck over it is ground). */
    const wet = (x: number, z: number) => {
      const w = ctx.waterAt(x, z);
      return w !== null && ctx.groundY(x, z) < w + 0.2;
    };
    /**
     * May the horse step from (x0, z0) to (x, z)? Open water only in a leap (a bridge or a deck over
     * it is ground); props and walls keep their clearance (a horse is broad); no cliffs.
     */
    const open = (x0: number, z0: number, x: number, z: number, air: boolean) => {
      if (wet(x, z)) return air;
      if (!ctx.isWalkable(x, z)) return false;
      if (air) return ctx.groundY(x, z) < hy + 0.2;
      // no cliffs: judged half a metre ahead
      const l = Math.hypot(x - x0, z - z0) || 1;
      const ax = x + ((x - x0) / l) * 0.5, az = z + ((z - z0) / l) * 0.5;
      return ctx.groundY(ax, az) - ctx.groundY(x0, z0) < 0.55;
    };
    /**
     * One stride along `heading` for `len` metres, or — if that is blocked — along the nearest free
     * line within 45° of it (sliding along a parapet, round a post). Returns the turn taken (0 when
     * straight on), or null when nothing is open.
     */
    const SLIDE = [0.35, -0.35, 0.7, -0.7, 0.95, -0.95];
    const stride = (len: number, air: boolean, prefer: number): number | null => {
      for (let k = -1; k < SLIDE.length; k++) {
        const a = k < 0 ? 0 : SLIDE[k] * (prefer < 0 ? -1 : 1);
        const f = k < 0 ? 1 : Math.cos(a);
        const nx = hx + Math.sin(heading + a) * len * f, nz = hz + Math.cos(heading + a) * len * f;
        if (open(hx, hz, nx, nz, air)) { hx = nx; hz = nz; return a; }
      }
      return null;
    };
    return {
      /** Only his own saddle: while Red Hare is still coming, a game or a boat that takes him ends it. */
      get ownsFreeze() { return phase === 'ride'; },
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
          if (!P.isFrozen) { phase = 'go'; return true; } // someone else set him down
          // the action button: off on the next frame, so the same press does not also reach the
          // stall or the game beside him (the core hands the press on once he is no longer held)
          if (offNext) dismount();
          else if (ctx.input.actionPressed) offNext = true;
          // steer by the stick, relative to the camera
          ctx.camera.getWorldDirection(dir);
          const cl = Math.hypot(dir.x, dir.z) || 1;
          const cfx = dir.x / cl, cfz = dir.z / cl;
          const ix = ctx.input.x, iy = ctx.input.y;
          const mag = Math.min(1, Math.hypot(ix, iy));
          let want = 0;
          if (mag > 0.08) {
            const wx = cfx * iy - cfz * ix, wz = cfz * iy + cfx * ix;
            let dh = Math.atan2(wx, wz) - heading;
            while (dh > Math.PI) dh -= TAU;
            while (dh < -Math.PI) dh += TAU;
            want = dh;
            heading += Math.max(-1, Math.min(1, dh)) * Math.min(1, dt * 4.2);
          }
          target = mag * (ctx.input.run ? 9.5 : 5.4);
          speed = damp(speed, target, target > speed ? 2.2 : 4, dt);
          if (ctx.input.jumpPressed && grounded) { vy = 5.8; grounded = false; snd.neigh(0.35); }
          // straight on, or slide along whatever is in the way (the rider's own turn decides which side)
          const turn = stride(speed * dt, !grounded, Math.abs(want) > 0.05 ? want : slideSide);
          if (turn === null) speed *= Math.exp(-dt * 8);
          else if (turn !== 0) {
            slideSide = turn;
            heading += turn * Math.min(1, dt * 2.5);
            speed *= Math.exp(-dt * 1.5 * Math.abs(turn));
          }
          const floor = env.floorAt(hx, hz);
          if (!grounded) {
            vy -= 14 * dt;
            hy += vy * dt;
            if (hy <= floor) {
              hy = floor; vy = 0; grounded = true;
              snd.hoof(0.8);
              fx.ground.emit({ x: hx, y: floor + 0.04, z: hz, life: 0.9, size: 0.8, grow: 3, color: HUE.dust, alpha: 0.4, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.02, fadeOut: 0.7 });
              if (wet(hx, hz)) {
                // came down in the water: back onto the bank
                snd.splash(0.6);
                hx = lastLandX; hz = lastLandZ; hy = env.floorAt(hx, hz); speed = 0;
              }
            }
          } else {
            hy = damp(hy, floor, 14, dt);
            if (!wet(hx, hz)) { lastLandX = hx; lastLandZ = hz; }
          }
          if (t - rideAt > 20) dismount();
        } else if (phase === 'go') {
          if (goAt < 0) goAt = t;
          // he is off: Red Hare canters away and is gone
          const k = t - goAt;
          speed = damp(speed, 7, 2, dt);
          if (k > 0.35 && stride(speed * dt, false, 1) === null) heading += dt * 2;
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
        if (grounded && speed > 3 && t > dustAt && !wet(hx, hz)) {
          dustAt = t + (env.reduced ? 0.25 : 0.08);
          fx.air.emit({ x: hx - hfx * 0.7 + rng.range(-0.3, 0.3), y: hy + 0.08, z: hz - hfz * 0.7 + rng.range(-0.3, 0.3), vx: -hfx * 0.6, vy: rng.range(0.3, 0.7), vz: -hfz * 0.6, drag: 2.2, life: rng.range(0.7, 1.1), size: rng.range(0.3, 0.45), grow: 2.4, color: HUE.dust, alpha: 0.32, mode: MODE.puff, cell: CELL.soft });
        }
        if (grounded && speed > 1.5 && t > printAt && !wet(hx, hz)) {
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
        if (phase !== 'gone' && R.group.visible) {
          // cut short (a game took him, another companion): Red Hare is gone in a puff of dust
          for (let i = 0; i < 8; i++) fx.air.emit({ x: hx + rng.range(-0.6, 0.6), y: hy + rng.range(0.2, 1.2), z: hz + rng.range(-0.6, 0.6), vy: rng.range(0.2, 0.7), drag: 2, life: 1.1, size: 0.4, grow: 2.5, color: HUE.dust, alpha: 0.3, mode: MODE.puff, cell: CELL.soft });
        }
        phase = 'gone';
        R.group.visible = R.shadow.visible = false;
      },
    };
  };
}
