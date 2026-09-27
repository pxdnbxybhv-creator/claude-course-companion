// 桃源 · 二期: 摸鱼 · Fishing by hand (spec §5.2). 阿黍 at the stream shallows, 昼. Top-down over a
// 3 × 2 m patch of the stream, 90 s. Hold on the water to sink your hands, drag slowly, lift to close.
// Fast hands ripple and scare the fish; still hands draw the curious ones in. 泥鳅 slip unless tapped,
// 虾 are caught close behind the tail, and a rare 鳜 comes in the last 30 s to hands held still
// upstream. Own draws: the fish (one InstancedMesh), the hands (one mesh), the ripples (one glow
// Cloud), the petal mats and the mud (one petal Cloud): 4.
//
// Owner: G.
import { h } from '../../../minigames/ui';
import * as snd from '../../../minigames/sound';
import { makeRng } from '../../../../../../core/rng';
import { hashString } from '../../../../../../core/rng';
import { Cloud } from '../../fx';
import { STREAM, W, Y_T, polyAt, polyDist, waterAt, floorAt } from '../../places';
import { WATER_NAMES, waterOfDay } from '../daily';
import type { Line } from '../types';
import type { GameDef, Round } from './frame';
import {
  FISH_POINTS, MO as R, PATCH, alertAround, ashuTally, catchAt, coinsFor, fishKindAt, fishWanted, guiAllowed, makeFish, nearMiss,
  ripple, rippleSpeed, slipKept, stepFish, type Fish,
} from './logic';
import { MO } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });

/** The patch: centred on the stream below the square, x downstream, y across (east). */
const S0 = polyDist(STREAM, 1.98, 15).s;
const C = polyAt(STREAM, S0);
const U = { x: C.dx, z: C.dz };
const V = { x: -C.dz, z: C.dx };
const E = V.x > 0 ? V : { x: -V.x, z: -V.z }; // (the east bank's side)
/** Patch (px, py) → valley-local (x, z). */
const toLocal = (px: number, py: number) => ({ x: C.x + U.x * (px - PATCH.w / 2) + E.x * (py - PATCH.h / 2), z: C.z + U.z * (px - PATCH.w / 2) + E.z * (py - PATCH.h / 2) });
const STAND = { x: C.x + E.x * 1.7, z: C.z + E.z * 1.7 };

export const moGame: GameDef = {
  id: 'mo',
  host: () => 'ashu',
  stand: STAND,
  face: { x: C.x, z: C.z },
  hostAt: { x: C.x + E.x * 1.9 + U.x * 1.8, z: C.z + E.z * 1.9 + U.z * 1.8 },
  hostFace: { x: C.x, z: C.z },
  leash: true,
  rules: () => MO.ashu.rules.map((line) => ({ who: 'ashu' as const, line })),
  twist: (day) => { const w = WATER_NAMES[waterOfDay(day)]; return t(`溪水：${w.zh}`, `The water: ${w.en}`); },
  good: () => null,
  play(r: Round) {
    const { ctx, tv } = r;
    const TH = ctx.THREE;
    const fx = tv.fx;
    if (!fx) { r.quit(); return; }
    const water = waterOfDay(r.day);
    const murky = water === 'hun';
    const rng = makeRng(hashString(`${r.day}:tyl:mo:${performance.now() | 0}`));
    const wy = (waterAt(C.x, C.z) ?? floorAt(C.x, C.z) + 0.3);
    const Y = wy + 0.012; // just over the surface: ink shapes read from above
    const group = fx.group; // valley-local, at (G, Y_T)

    // ── the view: top-down over the patch (higher on a narrow screen, so all 3 m show)
    const cam = ctx.camera;
    const aspect = cam.aspect || 1;
    const vh = Math.tan(((cam.fov || 50) * Math.PI) / 360);
    const needH = Math.max(3.2, (PATCH.w / 2 + 0.25) / (vh * Math.min(aspect, 1.5)), (PATCH.h / 2 + 0.25) / vh);
    const cw = W(C.x, C.z);
    r.view({ x: cw.x - E.x * 0.02, y: Y_T + wy + needH, z: cw.z - E.z * 0.02 }, { x: cw.x, y: Y_T + wy, z: cw.z }, 1.4);

    // ── the fish: flat ink ellipses with tails (one InstancedMesh)
    const fishGeo = (() => {
      const s = new TH.Shape();
      s.absellipse(0, 0, 0.09, 0.035, 0, Math.PI * 2, false, 0);
      const g1 = new TH.ShapeGeometry(s, 10);
      const tail = new TH.BufferGeometry();
      tail.setAttribute('position', new TH.Float32BufferAttribute([-0.08, 0, 0, -0.15, 0.035, 0, -0.15, -0.035, 0], 3));
      const merged = new TH.BufferGeometry();
      const a = g1.toNonIndexed().attributes.position.array as Float32Array, b = tail.attributes.position.array as Float32Array;
      const all = new Float32Array(a.length + b.length);
      all.set(a); all.set(b, a.length);
      merged.setAttribute('position', new TH.BufferAttribute(all, 3));
      merged.rotateX(-Math.PI / 2);
      g1.dispose(); tail.dispose();
      return merged;
    })();
    const fishMat = new TH.MeshBasicMaterial({ color: '#2b2a26', transparent: true, opacity: 0.62, depthWrite: false });
    const MAXF = R.max + 1;
    const fishMesh = new TH.InstancedMesh(fishGeo, fishMat, MAXF);
    fishMesh.frustumCulled = false;
    fishMesh.userData.pocket = true;
    fishMesh.renderOrder = 5;
    fishMesh.instanceColor = new TH.InstancedBufferAttribute(new Float32Array(MAXF * 3).fill(1), 3);
    group.add(fishMesh);

    // ── the hands: two cupped palms (one mesh, no outline)
    const handsGeo = (() => {
      const a = new TH.SphereGeometry(0.075, 10, 6); a.scale(1, 0.35, 1.35); a.translate(-0.07, 0, 0);
      const b = new TH.SphereGeometry(0.075, 10, 6); b.scale(1, 0.35, 1.35); b.translate(0.07, 0, 0);
      const pa = a.toNonIndexed().attributes.position.array as Float32Array, pb = b.toNonIndexed().attributes.position.array as Float32Array;
      const all = new Float32Array(pa.length + pb.length);
      all.set(pa); all.set(pb, pa.length);
      const g = new TH.BufferGeometry();
      g.setAttribute('position', new TH.BufferAttribute(all, 3));
      g.computeVertexNormals();
      a.dispose(); b.dispose();
      return g;
    })();
    const handsMat = new TH.MeshBasicMaterial({ color: '#e0b48f', transparent: true, opacity: 0.95, depthWrite: false });
    const hands = new TH.Mesh(handsGeo, handsMat);
    hands.userData.pocket = true;
    hands.renderOrder = 7;
    hands.frustumCulled = false;
    group.add(hands);

    // ── ripples (rings of glow points) and the petal mats and mud (petal points)
    const RIP = 6, RP = 14;
    const rip = new Cloud(fx, RIP * RP, 'glow');
    const ripples: { x: number; y: number; t: number; k: number }[] = [];
    const MATS = water === 'hua' ? 4 : 2, MP = 22, MUD = 10;
    const pet = new Cloud(fx, MATS * MP + MUD, 'petal');
    const mats: { x: number; y: number; r: number; from: number }[] = [];
    for (let i = 0; i < MATS; i++) mats.push({ x: 0.5 + rng() * (PATCH.w - 1), y: 0.3 + rng() * (PATCH.h - 0.6), r: water === 'hua' ? 0.42 : 0.3, from: water === 'hua' ? 0 : 30 });
    const matOff = Array.from({ length: MATS * MP }, () => ({ a: rng() * Math.PI * 2, d: Math.sqrt(rng()), s: rng() * 6 }));
    const pink = new TH.Color('#f3b7c4'), mudC = new TH.Color('#8a6f52'), ripC = new TH.Color('#dfeee8');

    r.onStop(() => {
      fishMesh.removeFromParent(); fishGeo.dispose(); fishMat.dispose();
      hands.removeFromParent(); handsGeo.dispose(); handsMat.dispose();
      rip.dispose(); pet.dispose();
      try { navigator.vibrate?.(0); } catch { /* optional */ }
    });

    // ── the HUD
    const pad = h('div', 'tyg-pad', undefined, r.root);
    const top = h('div', 'tyg-top mg-live', undefined, r.root);
    h('b', 'brush', r.tr(t('摸鱼', 'Fishing by hand')), top);
    const mineEl = h('span', 'tyg-num', '0', top);
    const creel = h('small', '', '', top);
    const clock = h('small', 'tyg-clock', '', top);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? MO.hint : MO.hintKeys), r.root);
    r.later(6000, () => hint.classList.add('is-fade'));
    const tapEl = h('div', 'tyg-tap', r.tr(MO.tap), r.root);
    tapEl.style.display = 'none';

    // ── the state
    const fish: Fish[] = [];
    let nextId = 0;
    const spawn = (kind = fishKindAt(tNow, rng), at?: { x: number; y: number }) => { const f = makeFish(nextId++, kind, rng, at); fish.push(f); return f; };
    // 0–30 s: a 鲫 school of three and one 鲤
    const sx = 0.6 + rng() * 1.8, sy = 0.5 + rng();
    for (let i = 0; i < 3; i++) spawn('ji', { x: sx + (rng() - 0.5) * 0.3, y: sy + (rng() - 0.5) * 0.3 });
    spawn('li');
    let tNow = 0;
    let points = 0, count = 0, gotGui = false;
    const guiToday = rng() < R.guiChance;
    let guiSpawned = false;
    const hand = { x: PATCH.w / 2, y: PATCH.h / 2, down: false, sink: 0, stillFor: 0, speed: 0, tx: PATCH.w / 2, ty: PATCH.h / 2 };
    let pressing = false;
    const mud: { x: number; y: number; until: number }[] = [];
    let slip: { f: Fish; t0: number; taps: number[] } | null = null;
    let lastRipple = -1, nextSplash = 60, bandR = 0, bandT = 0;
    let wanted = 4;
    const sinkTime = r.gentle ? R.sinkGentle : R.sink;
    const thr = rippleSpeed(r.gentle, r.mood);

    // screen → patch (a ray onto the water plane)
    const ray = new TH.Raycaster();
    const ndc = new TH.Vector2();
    const plane = new TH.Plane(new TH.Vector3(0, 1, 0), -(Y_T + wy));
    const hitP = new TH.Vector3();
    const toPatch = (cx: number, cy: number): { x: number; y: number } | null => {
      const rect = ctx.renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, ctx.camera);
      if (!ray.ray.intersectPlane(plane, hitP)) return null;
      const lx = hitP.x - W(0, 0).x - C.x, lz = hitP.z - W(0, 0).z - C.z;
      return { x: lx * U.x + lz * U.z + PATCH.w / 2, y: lx * E.x + lz * E.z + PATCH.h / 2 };
    };
    const inMud = (x: number, y: number) => mud.some((m) => m.until > tNow && Math.hypot(m.x - x, m.y - y) < R.mudR);
    const press = (p: { x: number; y: number } | null) => {
      if (slip) { slip.taps.push(tNow); return; }
      if (!p) return;
      pressing = true;
      hand.tx = Math.max(0, Math.min(PATCH.w, p.x)); hand.ty = Math.max(0, Math.min(PATCH.h, p.y));
      hand.x = hand.tx; hand.y = hand.ty;
      hand.sink = 0; hand.down = false; hand.stillFor = 0;
    };
    const lift = () => {
      if (!pressing) return;
      pressing = false;
      const wasDown = hand.down;
      hand.down = false; hand.sink = 0;
      if (!wasDown) return;
      mud.push({ x: hand.x, y: hand.y, until: tNow + R.mud });
      if (mud.length > MUD) mud.shift();
      const got = catchAt(fish, hand.x, hand.y, r.gentle);
      try { snd.splash(0.25); } catch { /* optional */ }
      if (!got.length) {
        if (nearMiss(fish, hand.x, hand.y)) r.pop(r.tr(t('跑了', 'Gone')), 'is-small');
        return;
      }
      for (const f of got) {
        if (f.kind === 'qiu') {
          // it slips unless tapped: 3 taps in 0.8 s (gentle 2 in 1.0 s)
          f.gone = true;
          slip = { f, t0: tNow, taps: [] };
          tapEl.style.display = '';
          continue;
        }
        take(f);
      }
    };
    const take = (f: Fish) => {
      f.gone = true;
      points += FISH_POINTS[f.kind];
      count++;
      if (f.kind === 'gui') { gotGui = true; r.say('ashu', MO.ashu.gui, 2000); try { ctx.audio.pluck(5, 0.6); } catch { /* optional */ } }
      r.pop(`${r.tr(MO.fish[f.kind])} +${FISH_POINTS[f.kind]}`, f.kind === 'gui' ? 'is-red' : '');
      try { snd.bite(); } catch { /* optional */ }
    };

    const pd = (e: PointerEvent) => { e.preventDefault(); press(toPatch(e.clientX, e.clientY)); };
    const pm = (e: PointerEvent) => {
      if (!pressing) return;
      const p = toPatch(e.clientX, e.clientY);
      if (p) { hand.tx = Math.max(0, Math.min(PATCH.w, p.x)); hand.ty = Math.max(0, Math.min(PATCH.h, p.y)); }
    };
    const pu = () => lift();
    pad.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    const keys = new Set<string>();
    const kd = (e: KeyboardEvent) => {
      if (document.querySelector('.walk-say-wrap')) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) { e.preventDefault(); e.stopPropagation(); }
      if (e.repeat) return;
      if (e.code === 'Space') { if (slip) slip.taps.push(tNow); else press({ x: hand.x, y: hand.y }); }
      keys.add(e.code);
    };
    const ku = (e: KeyboardEvent) => {
      keys.delete(e.code);
      if (e.code === 'Space') { e.preventDefault(); e.stopPropagation(); lift(); }
    };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    r.onStop(() => {
      pad.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    });

    // ── the loop
    const m4 = new TH.Matrix4(), q = new TH.Quaternion(), yAxis = new TH.Vector3(0, 1, 0), sc = new TH.Vector3(1, 1, 1), pos = new TH.Vector3();
    const col = new TH.Color();
    const place = (px: number, py: number, dy = 0) => { const l = toLocal(px, py); return pos.set(l.x, Y + dy, l.z); };
    r.frame((dt, tt) => {
      tNow = tt;
      // keys move the hands (0.35 m/s: slow enough not to ripple)
      const kx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), ky = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
      if (kx || ky) { hand.tx = Math.max(0, Math.min(PATCH.w, hand.tx + kx * 0.35 * dt)); hand.ty = Math.max(0, Math.min(PATCH.h, hand.ty + ky * 0.35 * dt)); }
      // the hands follow the finger; their speed on the water plane
      const ox = hand.x, oy = hand.y;
      const k = Math.min(1, dt * 14);
      hand.x += (hand.tx - hand.x) * k; hand.y += (hand.ty - hand.y) * k;
      const v = Math.hypot(hand.x - ox, hand.y - oy) / Math.max(1e-3, dt);
      hand.speed += (v - hand.speed) * Math.min(1, dt * 8);
      if (pressing && !hand.down) {
        if (inMud(hand.x, hand.y)) hand.sink = 0;
        else { hand.sink += dt; if (hand.sink >= sinkTime) { hand.down = true; hand.stillFor = 0; } }
      }
      if (hand.down) {
        hand.stillFor = hand.speed < R.stillSpeed ? hand.stillFor + dt : 0;
        if (tt - lastRipple > 0.3 && ripple(fish, hand.x, hand.y, hand.speed, thr, murky)) { lastRipple = tt; ripples.push({ x: hand.x, y: hand.y, t: 0, k: 1 }); }
        // 浑: a buzz when one brushes the hands
        if (murky && fish.some((f) => !f.gone && Math.hypot(f.x - hand.x, f.y - hand.y) < R.brushR)) { try { navigator.vibrate?.(15); } catch { /* optional */ } }
      }
      // the curve
      if (tt >= 30 && wanted === 4) wanted = fishWanted(tt, rng);
      const alive = fish.filter((f) => !f.gone).length;
      if (alive < wanted && rng() < dt * 0.8) {
        const f = spawn();
        // new fish come in at an edge
        if (rng() < 0.5) f.x = rng() < 0.5 ? 0.1 : PATCH.w - 0.1; else f.y = rng() < 0.5 ? 0.1 : PATCH.h - 0.1;
      }
      // 阿黍's splashes (60–90 s, every 8 s at the patch's edge)
      if (tt >= nextSplash && tt < R.round) {
        nextSplash += R.splashEvery;
        const ex = rng() * PATCH.w, ey = rng() < 0.5 ? 0.05 : PATCH.h - 0.05;
        alertAround(fish, ex, ey, R.splashR, R.splashAlert);
        ripples.push({ x: ex, y: ey, t: 0, k: 1.6 });
        try { snd.splash(0.4); } catch { /* optional */ }
      }
      // the 鳜: once, in the last 30 s, to hands held still upstream
      if (guiToday && !guiSpawned && hand.down && guiAllowed(tt, hand.stillFor, hand.x)) {
        guiSpawned = true;
        const g = spawn('gui', { x: Math.max(0.1, hand.x - 0.5), y: hand.y });
        g.dx = 1; g.dy = 0;
      }
      stepFish(fish, dt, { hands: { down: hand.down, x: hand.x, y: hand.y, stillFor: hand.stillFor }, gentle: r.gentle }, rng);
      // (the patch is straight and the stream is not: a fish over the bank turns back to the water)
      for (const f of fish) {
        const l = toLocal(f.x, f.y);
        if (waterAt(l.x, l.z) === null) { f.y += (PATCH.h / 2 - f.y) * Math.min(1, dt * 3); f.dy = Math.sign(PATCH.h / 2 - f.y) * Math.abs(f.dy || 0.5); }
      }
      for (let i = fish.length - 1; i >= 0; i--) if (fish[i].gone && fish[i] !== slip?.f) fish.splice(i, 1);
      // the loach's slip
      if (slip) {
        const win = r.gentle ? R.slipWindowGentle : R.slipWindow;
        if (slipKept(slip.taps, slip.t0, r.gentle)) { take(slip.f); slip = null; tapEl.style.display = 'none'; }
        else if (tt - slip.t0 > win) { r.say('ashu', MO.ashu.slipped, 1400); slip = null; tapEl.style.display = 'none'; }
      }
      // 阿黍's creel: within ±1 of yours, at least 2 (it drifts every ~10 s)
      bandT -= dt;
      if (bandT <= 0) { bandT = 8 + rng() * 6; bandR = Math.round(rng() * 2 - 1); }
      creel.textContent = `${r.tr(MO.creel)} ${ashuTally(count, bandR)}`;
      mineEl.textContent = String(points);
      clock.textContent = String(Math.max(0, Math.ceil(R.round - tt)));

      // ── draw: the fish
      let n = 0;
      for (const f of fish) {
        if (f.gone || n >= MAXF) continue;
        let a = 1;
        if (murky) a = Math.hypot(f.x - hand.x, f.y - hand.y) < R.murkSee ? 1 : 0;
        const moving = f.flee > 0;
        if (water === 'hua' || tt >= 30) for (const m of mats) if (tt >= m.from && Math.hypot(f.x - m.x, f.y - m.y) < m.r && !moving) a = Math.min(a, water === 'hua' ? 0 : 0.35);
        const s = f.kind === 'li' ? 1.5 : f.kind === 'gui' ? 1.9 : f.kind === 'xia' ? 0.7 : f.kind === 'qiu' ? 1.2 : 1;
        const l = toLocal(f.x, f.y);
        const heading = Math.atan2(f.dx * U.z + f.dy * E.z, f.dx * U.x + f.dy * E.x);
        q.setFromAxisAngle(yAxis, -heading);
        sc.set(f.kind === 'qiu' ? s * 1.3 : s, 1, f.kind === 'qiu' ? s * 0.6 : s).multiplyScalar(a > 0 ? 1 : 0.0001);
        m4.compose(pos.set(l.x, Y, l.z), q, sc);
        fishMesh.setMatrixAt(n, m4);
        col.set(f.kind === 'gui' ? '#6b5a2e' : f.kind === 'xia' ? '#8a7a6a' : f.kind === 'li' ? '#5a3d2c' : '#2b2a26');
        fishMesh.setColorAt(n, col);
        n++;
      }
      fishMesh.count = n;
      fishMesh.instanceMatrix.needsUpdate = true;
      if (fishMesh.instanceColor) fishMesh.instanceColor.needsUpdate = true;
      // the hands: up (pale, high) or sunk
      const sink = hand.down ? 1 : Math.min(1, hand.sink / sinkTime);
      hands.visible = pressing || hand.down;
      place(hand.x, hand.y, 0.12 * (1 - sink) - 0.01 * sink);
      hands.position.copy(pos);
      hands.rotation.y = -Math.atan2(U.z, U.x);
      handsMat.opacity = 0.95 - 0.4 * sink;
      // ripples
      for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.2) ripples.splice(i, 1); }
      while (ripples.length > RIP) ripples.shift();
      for (let i = 0; i < RIP; i++) {
        const rp = ripples[i];
        for (let j = 0; j < RP; j++) {
          const idx = i * RP + j;
          if (!rp) { rip.set(idx, 0, -50, 0, 0, 0); continue; }
          const rad = 0.08 + rp.t * 0.6 * rp.k;
          const a = (j / RP) * Math.PI * 2;
          const l = toLocal(rp.x + Math.cos(a) * rad, rp.y + Math.sin(a) * rad);
          rip.set(idx, l.x, Y + 0.01, l.z, 0.05, 0.5 * (1 - rp.t / 1.2), ripC);
        }
      }
      rip.flush();
      // the petal mats (花: from the start; otherwise from 30 s) and the mud
      for (let i = 0; i < MATS * MP; i++) {
        const m = mats[Math.floor(i / MP)], o = matOff[i];
        if (tt < m.from) { pet.set(i, 0, -50, 0, 0, 0); continue; }
        const l = toLocal(m.x + Math.cos(o.a) * o.d * m.r + Math.sin(tt * 0.3 + o.s) * 0.02, m.y + Math.sin(o.a) * o.d * m.r);
        pet.set(i, l.x, Y + 0.02, l.z, 0.09, 0.85, pink, o.s + tt * 0.05);
      }
      for (let i = 0; i < MUD; i++) {
        const md = mud[i];
        const idx = MATS * MP + i;
        if (!md || md.until <= tt) { pet.set(idx, 0, -50, 0, 0, 0); continue; }
        const l = toLocal(md.x, md.y);
        pet.set(idx, l.x, Y + 0.015, l.z, 0.45, 0.5 * ((md.until - tt) / R.mud), mudC, i);
      }
      pet.flush();

      if (tt >= R.round && !slip) {
        const ashu = ashuTally(count, bandR);
        const beat = count > ashu;
        r.finish({
          score: points,
          measure: points,
          feat: gotGui,
          yue: count,
          coins: coinsFor('mo', points, { beatAshu: beat }),
          bonus: gotGui,
          lines: [t(`${count} 条 · 阿黍：「${MO.ashu.tally.zh.replace('{n}', String(ashu))}」`, `${count} caught · A Shu: "${MO.ashu.tally.en.replace('{n}', String(ashu))}"`)],
          say: { who: 'ashu', line: beat ? MO.ashu.win : MO.ashu.lose },
          after: count > 0 ? () => r.bag.later(4200, () => ctx.hud.toast(`阿黍：「${MO.ashu.after.zh}」`, `A Shu: "${MO.ashu.after.en}"`, 3200)) : undefined,
        });
      }
    });
    void pos;
  },
};
