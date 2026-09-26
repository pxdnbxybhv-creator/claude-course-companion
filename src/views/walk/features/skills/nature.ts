// The skills of growing things, water and music:
//  - 园丁 催花: a sweep of the hoe and a ring of flowers springs up round him (and lingers ~20 s);
//    petals fly, sprouts push through, beds nearby ripen ('banmu:bloom').
//  - 渔翁 撒网: the net flies in an arc onto any water within reach, settles, and is hauled in with
//    fish leaping — and now and then a few coins.
//  - 琴师 高山流水: she sits and plays a phrase composed on the spot; birds fly in and perch, the koi
//    gather to the 'play' emote, people nearby stop to listen ('banmu:music').
import type * as T from 'three';
import { propMat, type Bag } from '../kit';
import { koiGeometry, instanceAttrs, swimMaterial } from '../geo';
import { earn, record } from '../../../../app/play';
import { SongBirds } from '../../world/gifts';
import { Bag as WorldBag } from '../../world/kit';
import { CELL, MODE } from './fx';
import { qinPhrase } from './logic';
import { flowerBloom, flowerStem } from './shapes';
import { HUE, TAU, clamp01, easeBack, easeInOut, easeOut, forward, skillEvent, type Running, type SkillEnv } from './env';
import * as snd from './sound';

// ───────────────────────────── 园丁 · 催花 ─────────────────────────────

interface FlowerRig { stems: T.InstancedMesh; blooms: T.InstancedMesh; busy: boolean }

const MAX_FLOWERS = 30;

function flowerRig(bag: Bag): FlowerRig {
  const { THREE } = bag.ctx;
  const stems = new THREE.InstancedMesh(flowerStem(THREE), propMat(bag.ctx), MAX_FLOWERS);
  const blooms = new THREE.InstancedMesh(flowerBloom(THREE), propMat(bag.ctx), MAX_FLOWERS);
  blooms.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FLOWERS * 3), 3);
  for (const m of [stems, blooms]) {
    m.frustumCulled = false;
    m.count = 0;
    m.visible = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    bag.add(m);
  }
  stems.name = 'bloom-stems';
  blooms.name = 'bloom-heads';
  return { stems, blooms, busy: false };
}

const BLOOM_HUES: Record<string, number[]> = {
  spring: [HUE.peach, HUE.rouge, HUE.blush, HUE.white, HUE.gamboge],
  summer: [HUE.rouge, HUE.peach, HUE.gamboge, HUE.violet, HUE.white],
  autumn: [HUE.gamboge, 0xe07a3a, HUE.white, HUE.violet, HUE.rouge],
  winter: [HUE.rouge, HUE.white, HUE.blush, HUE.gamboge, HUE.vermilion],
};

export function makeGardener(bag: Bag): (env: SkillEnv) => Running {
  const rigs: FlowerRig[] = [];
  return (env) => {
    const { ctx, fx, rng } = env;
    const { THREE } = ctx;
    const P = ctx.player;
    P.emote('skill');
    snd.bloom(0.7);
    snd.swish(0.3);
    let rig = rigs.find((r) => !r.busy);
    if (!rig && rigs.length < 2) { rig = flowerRig(bag); rigs.push(rig); }
    const cx = P.position.x, cz = P.position.z;
    skillEvent('banmu:bloom', cx, cz, 6);
    record('bloom');
    const hues = BLOOM_HUES[ctx.env.season] ?? BLOOM_HUES.spring;
    // where the flowers stand: two rings and a scatter, only on dry land
    const spots: { x: number; y: number; z: number; r: number; yaw: number; s: number; delay: number }[] = [];
    const want = env.reduced ? 16 : MAX_FLOWERS;
    const rings: [number, number, number][] = [[10, 1.1, 1.6], [12, 2.0, 2.8], [8, 3.2, 5.0]];
    for (const [n, r0, r1] of rings) {
      const a0 = rng() * TAU;
      for (let i = 0; i < n && spots.length < want; i++) {
        const a = a0 + (i / n) * TAU + rng.range(-0.2, 0.2), r = rng.range(r0, r1);
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (ctx.waterAt(x, z) !== null) continue;
        const y = ctx.groundY(x, z);
        if (Math.abs(y - P.position.y) > 1.2) continue;
        spots.push({ x, y, z, r, yaw: rng() * TAU, s: rng.range(1.25, 1.85), delay: 0.12 + r * 0.13 + rng() * 0.08 });
      }
    }
    const tint = new THREE.Color();
    if (rig) {
      rig.busy = true;
      rig.stems.count = rig.blooms.count = spots.length;
      rig.stems.visible = rig.blooms.visible = true;
      spots.forEach((_, i) => { tint.setHex(rng.pick(hues)); rig!.blooms.setColorAt(i, tint); });
      if (rig.blooms.instanceColor) rig.blooms.instanceColor.needsUpdate = true;
    }
    // petals flung up, a green ring rolling out, sprouts pushing through
    for (let i = 0; i < (env.reduced ? 14 : 40); i++) {
      const a = rng() * TAU, r = rng.range(0.3, 2.5);
      fx.air.emit({
        x: cx + Math.cos(a) * r, y: P.position.y + 0.2, z: cz + Math.sin(a) * r,
        vx: Math.cos(a) * rng.range(0.3, 1.2), vy: rng.range(2, 3.6), vz: Math.sin(a) * rng.range(0.3, 1.2),
        g: 2.2, drag: 1.2, flutter: 0.5, life: rng.range(3.5, 5.5), size: rng.range(0.06, 0.09), color: rng.pick(hues),
        mode: MODE.flake, cell: rng.chance(0.35) ? CELL.blossom : CELL.petal, spin: rng.range(3, 6), floor: env.floorAt(cx, cz) + 0.02,
      });
    }
    fx.ground.emit({ x: cx, y: env.floorAt(cx, cz) + 0.04, z: cz, life: 1.6, size: 1.2, grow: 7, color: HUE.leaf, alpha: 0.55, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.05, fadeOut: 0.6 });
    for (let i = 0; i < (env.reduced ? 8 : 20); i++) {
      const a = rng() * TAU, r = rng.range(0.6, 4.5);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (ctx.waterAt(x, z) !== null) continue;
      fx.ground.emit({ x, y: ctx.groundY(x, z) + 0.07, z, life: rng.range(8, 14), size: rng.range(0.14, 0.2), grow: 1.25, color: rng.chance(0.5) ? HUE.leaf : HUE.jade, alpha: 0.95, mode: MODE.puff, cell: CELL.sprout, fadeIn: 0.3 + r * 0.12, fadeOut: 0.25, rot: rng.range(-0.2, 0.2) });
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    let t0 = -1;
    const LIFE = 20;
    if (rig) {
      const r = rig;
      env.linger((_dt, t) => {
        if (t0 < 0) t0 = t;
        const el = t - t0;
        for (let i = 0; i < spots.length; i++) {
          const f = spots[i];
          const grow = env.reduced ? clamp01((el - f.delay) / 0.4) : easeBack((el - f.delay) / 0.55);
          const wither = clamp01((el - (LIFE - 1.6 + (5 - f.r) * 0.15)) / 1.4);
          const k = Math.max(0, grow * (1 - easeInOut(wither)));
          const sway = env.reduced ? 0 : Math.sin(t * 1.7 + f.x * 1.3 + f.z) * 0.07;
          e.set(sway, f.yaw, sway * 0.6);
          q.setFromEuler(e);
          m.compose(v.set(f.x, f.y - 0.01, f.z), q, s.set(f.s * Math.max(0.001, k), f.s * Math.max(0.001, k), f.s * Math.max(0.001, k)));
          r.stems.setMatrixAt(i, m);
          r.blooms.setMatrixAt(i, m);
        }
        r.stems.instanceMatrix.needsUpdate = true;
        r.blooms.instanceMatrix.needsUpdate = true;
        if (el > LIFE + 1) {
          r.stems.visible = r.blooms.visible = false;
          r.busy = false;
          return false;
        }
        return true;
      });
    }
    let a0 = -1;
    return {
      update(_dt, t) {
        if (a0 < 0) a0 = t;
        return t - a0 < 1.6;
      },
      end() { /* the flowers linger */ },
    };
  };
}

// ───────────────────────────── 渔翁 · 撒网 ─────────────────────────────

/** The nearest water within a net's throw, searching ahead first. */
export function findWater(env: SkillEnv, x: number, z: number, heading: number): { x: number; y: number; z: number } | null {
  const turns = [0, 0.3, -0.3, 0.6, -0.6, 0.95, -0.95, 1.35, -1.35, 1.8, -1.8, 2.3, -2.3, Math.PI];
  for (const da of turns) {
    for (const d of [3.2, 4.2, 5.2, 2.4, 6.2, 7.4, 8.4]) {
      const a = heading + da;
      const wx = x + Math.sin(a) * d, wz = z + Math.cos(a) * d;
      const w = env.ctx.waterAt(wx, wz);
      if (w === null) continue;
      // open water, not a sliver at the edge
      let wet = 0;
      for (let k = 0; k < 4; k++) if (env.ctx.waterAt(wx + Math.cos(k * 1.57) * 0.9, wz + Math.sin(k * 1.57) * 0.9) !== null) wet++;
      if (wet >= 3) return { x: wx, y: w, z: wz };
    }
  }
  return null;
}

interface NetRig { net: T.Mesh; rope: T.Line; ropePos: T.BufferAttribute; fish: T.InstancedMesh; swim: { uniforms: { uTime: { value: number } } } }

/** A round cast net painted in ink: spokes, rings, knots, and lead weights round the rim. */
function netTexture(THREE: SkillEnv['ctx']['THREE']): T.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const m = S / 2, R = S / 2 - 8;
  g.strokeStyle = 'rgba(40,32,24,0.85)';
  g.lineWidth = 2.2;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(a) * R, m + Math.sin(a) * R); g.stroke();
  }
  for (let k = 1; k <= 6; k++) {
    const r = (k / 6) * R;
    g.beginPath();
    // sagging mesh: each ring hangs a little between the spokes
    for (let i = 0; i <= 80; i++) {
      const a = (i / 80) * TAU;
      const sag = Math.abs(Math.sin(a * 10)) * 3 * (k / 6);
      const rr = r - sag;
      if (i) g.lineTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr); else g.moveTo(m + Math.cos(a) * rr, m + Math.sin(a) * rr);
    }
    g.stroke();
  }
  g.fillStyle = 'rgba(60,52,44,0.95)';
  for (let i = 0; i < 20; i++) {
    const a = ((i + 0.5) / 20) * TAU;
    g.beginPath(); g.arc(m + Math.cos(a) * (R - 2), m + Math.sin(a) * (R - 2), 4.5, 0, TAU); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function netRig(bag: Bag): NetRig {
  const { THREE } = bag.ctx;
  const geo = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
  const net = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: netTexture(THREE), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: '#ffffff' }));
  net.name = 'fisher-net';
  net.visible = false;
  net.frustumCulled = false;
  net.renderOrder = 2;
  bag.add(net);
  const rg = new THREE.BufferGeometry();
  const ropePos = new THREE.BufferAttribute(new Float32Array(6), 3);
  ropePos.setUsage(THREE.DynamicDrawUsage);
  rg.setAttribute('position', ropePos);
  const rope = new THREE.Line(rg, new THREE.LineBasicMaterial({ color: '#5a4a38', transparent: true, opacity: 0.8 }));
  rope.visible = false;
  rope.frustumCulled = false;
  bag.add(rope);
  const fg = koiGeometry(THREE, '#8a8f86', '#c9ccc2', '#a7aca2');
  instanceAttrs(THREE, fg, 4, (i) => i * 1.9);
  const swim = swimMaterial(THREE);
  bag.own(swim.material);
  const fish = new THREE.InstancedMesh(fg, swim.material, 4);
  fish.name = 'net-fish';
  fish.visible = false;
  fish.frustumCulled = false;
  bag.add(fish);
  return { net, rope, ropePos, fish, swim };
}

const CATCH: Record<string, [string, string][]> = {
  lake: [['鲤鱼', 'carp'], ['鲫鱼', 'crucian carp'], ['青虾', 'river shrimp'], ['菱角', 'water caltrops']],
  village: [['鳜鱼', 'mandarin fish'], ['白条', 'sharpbelly'], ['田螺', 'river snails'], ['鲢鱼', 'silver carp']],
  mountain: [['溪石斑', 'stream barbel'], ['山溪鱼', 'hill-stream fish']],
  home: [['小鱼', 'little fish'], ['泥鳅', 'loaches']],
  any: [['小鱼', 'little fish'], ['鲫鱼', 'crucian carp']],
};

export function makeFisher(bag: Bag): (env: SkillEnv) => Running | null {
  let rig: NetRig | null = null;
  return (env) => {
    const { ctx, fx, rng } = env;
    const P = ctx.player;
    const spot = findWater(env, P.position.x, P.position.z, P.heading);
    if (!spot) {
      ctx.hud.toast('近处无水可撒网——走到水边再试', 'No water within a throw — try by the water’s edge', 2400);
      return null;
    }
    rig ??= netRig(bag);
    const r = rig;
    const { THREE } = ctx;
    P.emote('skill');
    snd.swish(0.6);
    const hand = new THREE.Vector3();
    const start = new THREE.Vector3();
    const [f0x, f0z] = forward(P.heading);
    const region = ctx.currentRegion();
    const inPond = region === 'garden' && Math.hypot(spot.x - ctx.pond.center.x, spot.z - ctx.pond.center.z) < 10;
    const n = rng.int(1, inPond ? 2 : 4);
    const coins = !inPond && rng.chance(region === 'lake' ? 0.5 : 0.35) ? rng.int(2, 8) : 0;
    const fish: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; yaw: number }[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    let t0 = -1;
    let landed = false, hauled = false, leapt = false, told = false, ringAt = 0;
    const R = 1.35;
    const handAt = () => hand.set(P.position.x + f0x * 0.35, P.position.y + 1.05, P.position.z + f0z * 0.35);
    handAt();
    start.copy(hand);
    r.net.visible = r.rope.visible = true;
    return {
      update(dt, t) {
        if (t0 < 0) t0 = t;
        const el = t - t0;
        handAt();
        r.swim.uniforms.uTime.value = t;
        let x: number, y: number, z: number, sc: number, spin: number;
        if (el < 0.85) {
          // the throw: an arc, the net opening as it flies
          const k = el / 0.85;
          x = start.x + (spot.x - start.x) * k;
          z = start.z + (spot.z - start.z) * k;
          y = start.y + (spot.y + 0.03 - start.y) * k + Math.sin(k * Math.PI) * 1.6;
          sc = R * (0.2 + 0.8 * easeOut(k));
          spin = k * 2.4;
        } else if (el < 2.9) {
          if (!landed) {
            landed = true;
            snd.splash(0.7);
            for (let i = 0; i < (env.reduced ? 6 : 16); i++) {
              const a = rng() * TAU;
              fx.air.emit({ x: spot.x + Math.cos(a) * R * 0.8, y: spot.y + 0.05, z: spot.z + Math.sin(a) * R * 0.8, vx: Math.cos(a) * 0.6, vy: rng.range(1.2, 2.4), vz: Math.sin(a) * 0.6, g: 9, life: 0.8, size: rng.range(0.04, 0.07), color: 0xdfe9ea, alpha: 0.85, mode: MODE.puff, cell: CELL.drop, floor: spot.y });
            }
          }
          if (t > ringAt) {
            ringAt = t + 0.55;
            fx.ground.emit({ x: spot.x, y: spot.y + 0.03, z: spot.z, life: 1.6, size: R * 1.4, grow: 2.2, color: 0xe8eef0, alpha: 0.45, mode: MODE.flat, cell: CELL.ring, fadeIn: 0.05, fadeOut: 0.7 });
          }
          x = spot.x; z = spot.z;
          y = spot.y + 0.02 + Math.sin(el * 3) * 0.01;
          sc = R;
          spin = 2.4 + (el - 0.85) * 0.05;
        } else {
          // the haul: bundled up and drawn in
          const k = clamp01((el - 2.9) / 0.9);
          if (!hauled) { hauled = true; snd.splash(0.45); snd.swish(0.4); }
          const kk = easeInOut(k);
          x = spot.x + (hand.x - spot.x) * kk;
          z = spot.z + (hand.z - spot.z) * kk;
          y = spot.y + (hand.y - 0.35 - spot.y) * kk + Math.sin(k * Math.PI) * 0.5;
          sc = R * (1 - 0.72 * kk);
          spin = 2.5 + k;
          if (!leapt && k > 0.45) {
            leapt = true;
            for (let i = 0; i < n; i++) {
              const tx = P.position.x + rng.range(-0.3, 0.3), tz = P.position.z + rng.range(-0.3, 0.3);
              const T = 0.75;
              fish.push({ x, y, z, vx: (tx - x) / T, vy: 4.2 + rng.range(0, 1), vz: (tz - z) / T, t: 0, yaw: rng() * TAU });
            }
            r.fish.count = fish.length;
            r.fish.visible = fish.length > 0;
          }
        }
        r.net.position.set(x, y, z);
        r.net.rotation.set(hauled ? -0.5 * Math.min(1, (el - 2.9) / 0.5) : 0, spin, 0);
        r.net.scale.set(sc, 1, sc);
        // dim the unlit net by night
        const nk = 1 - env.night() * 0.45;
        (r.net.material as T.MeshBasicMaterial).color.setRGB(nk, nk, nk);
        const rp = r.ropePos.array as Float32Array;
        rp[0] = hand.x; rp[1] = hand.y; rp[2] = hand.z; rp[3] = x; rp[4] = y; rp[5] = z;
        r.ropePos.needsUpdate = true;
        // the fish, leaping into the basket
        for (let i = 0; i < fish.length; i++) {
          const f = fish[i];
          f.t += dt;
          f.vy -= 11 * dt;
          f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
          const alive = f.t < 0.75;
          e.set(Math.atan2(-f.vy, Math.hypot(f.vx, f.vz)), Math.atan2(f.vx, f.vz), Math.sin(f.t * 20) * 0.4);
          q.setFromEuler(e);
          m.compose(v.set(f.x, f.y, f.z), q, s.setScalar(alive ? 0.55 : 0));
          r.fish.setMatrixAt(i, m);
          if (!alive && f.t < 0.75 + dt * 1.5) {
            for (let j = 0; j < 4; j++) fx.air.emit({ x: f.x, y: f.y, z: f.z, vx: rng.range(-0.4, 0.4), vy: rng.range(0.4, 1.2), vz: rng.range(-0.4, 0.4), g: 3, life: 0.7, size: 0.1, color: HUE.silver, mode: MODE.glow, cell: CELL.star });
          }
        }
        if (fish.length) r.fish.instanceMatrix.needsUpdate = true;
        if (!told && el > 4.0) {
          told = true;
          record('fish');
          const pool = CATCH[region ?? 'any'] ?? CATCH.any;
          const [zh, en] = pool[rng.int(0, pool.length - 1)];
          if (inPond) ctx.hud.toast(`网起${n === 1 ? '一' : '两'}尾锦鲤，看了一眼，又放回池中`, `${n === 1 ? 'A koi' : 'Two koi'} in the net — a look, and back into the pond ${n === 1 ? 'it goes' : 'they go'}`, 3000);
          else ctx.hud.toast(`一网收起${zh}${['', '一', '两', '三', '四'][n]}${zh.length > 2 || /虾|螺|菱|鳅/.test(zh) ? '' : '尾'}`, `A haul of ${en} (${n})`, 2800);
          if (coins) {
            earn(coins);
            snd.shimmer(0.4);
            for (let j = 0; j < 12; j++) fx.air.emit({ x: P.position.x, y: P.position.y + 1, z: P.position.z, vx: rng.range(-0.8, 0.8), vy: rng.range(1.5, 2.8), vz: rng.range(-0.8, 0.8), g: 5, life: 1.1, size: rng.range(0.1, 0.16), color: HUE.gold, mode: MODE.glow, cell: CELL.star });
            env.bag.later(900, () => ctx.hud.toast(`网底还缠着 ${coins} 枚铜钱`, `And ${coins} coins tangled in the net`, 2600));
          }
        }
        return el < 4.3;
      },
      end() {
        r.net.visible = r.rope.visible = false;
        r.fish.visible = false;
        r.fish.count = 0;
      },
    };
  };
}

// ───────────────────────────── 琴师 · 高山流水 ─────────────────────────────

export function makeMusician(bag: Bag): { start: (env: SkillEnv) => Running; update(dt: number, t: number): void } {
  let birds: SongBirds | null = null;
  const wbag = new WorldBag();
  bag.onDispose(() => wbag.dispose());
  let px = 0, pz = 0;
  return {
    update(dt, t) {
      if (birds?.busy) birds.update(dt, t, bag.ctx.player.position.x, bag.ctx.player.position.z);
    },
    start(env) {
      const { ctx, fx, rng } = env;
      const P = ctx.player;
      if (!birds) {
        birds = new SongBirds(wbag, (x, z) => ctx.groundY(x, z), (x, z) => ctx.isWalkable(x, z), 6);
        bag.add(birds.mesh);
      }
      P.emote('skill');
      px = P.position.x; pz = P.position.z;
      const notes = qinPhrase(rng);
      let next = 0;
      let t0 = -1, playAt = 1.2, musicAt = 0;
      let called = false;
      record('qin');
      ctx.hud.toast('高山流水——鸟停鱼聚，路人驻足', 'Mountains and waters — birds settle, koi gather, passers-by stop to listen', 3000);
      return {
        update(_dt, t) {
          if (t0 < 0) t0 = t;
          const el = t - t0;
          // she walked off: the music stops
          if (el > 1.4 && P.emoting !== 'play' && P.emoting !== 'skill') return false;
          if (el > playAt) { playAt = el + 2.55; P.emote('play'); }
          if (!called && el > 0.6) { called = true; birds!.call(px, pz, t, 10); }
          if (t > musicAt) { musicAt = t + 3; skillEvent('banmu:music', P.position.x, P.position.z, 10); }
          while (next < notes.length && el >= 1.0 + notes[next].at) {
            const nt = notes[next++];
            ctx.audio.pluck(nt.d, nt.v);
            const y = env.floorAt(P.position.x, P.position.z) + 0.04;
            fx.ground.emit({ x: P.position.x, y, z: P.position.z, life: nt.flow ? 1.1 : 1.8, size: 0.7, grow: nt.flow ? 4 : 7, color: env.night() > 0.5 ? HUE.amber : HUE.inkSoft, alpha: nt.flow ? 0.22 : 0.35, mode: env.night() > 0.5 ? MODE.flatGlow : MODE.flat, cell: CELL.ring, fadeIn: 0.05, fadeOut: 0.7 });
            if (!env.reduced) {
              const a = rng() * TAU;
              fx.air.emit({ x: P.position.x + Math.cos(a) * 0.5, y: P.position.y + 0.8, z: P.position.z + Math.sin(a) * 0.5, vx: Math.cos(a) * 0.25, vy: 0.5, vz: Math.sin(a) * 0.25, life: 2.2, size: rng.range(0.07, 0.12), color: env.night() > 0.5 ? HUE.amber : HUE.gold, alpha: 0.75, mode: MODE.glow, cell: nt.flow ? CELL.soft : CELL.star });
              if (!nt.flow && rng.chance(0.6)) {
                fx.air.emit({ x: P.position.x + rng.range(-2, 2), y: P.position.y + rng.range(2.2, 3), z: P.position.z + rng.range(-2, 2), vx: 0.2, vy: -0.1, g: 0.5, drag: 1.4, flutter: 0.5, life: 4.5, size: 0.08, color: rng.pick([HUE.leaf, HUE.peach, HUE.gamboge]), mode: MODE.flake, cell: CELL.leaf, spin: 3, floor: env.floorAt(P.position.x, P.position.z) + 0.02 });
              }
            }
          }
          return el < 1.4 + notes[notes.length - 1].at + 1.2;
        },
        end() { /* the birds fly off by themselves when she walks away or the time is up */ },
      };
    },
  };
}
