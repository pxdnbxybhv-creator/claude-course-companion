// 大橘 · Big Ginger — a round, smug ginger tabby: striped back and tail, cream belly and muzzle,
// white socks, half-lidded eyes, whiskers. Walks with diagonal pairs and his tail up in a hook,
// bounds when running, sits down (tail swishing, ears twitching) when you stand still. Emotes:
// eating, the play-bow stretch, a beckoning paw (招财猫), paw swipes, chasing his own tail.
import type { CharacterFactory, CharacterModel, MotionState } from './types';
import { Blinker, Kit, OL, Spring, clamp, damp, mix, put, smooth, type Group, type Mesh } from './rig';

export const cat: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const S = 1.05;
  const ginger = '#d99550', dark = '#b56a2e', cream = '#f3e6cf';
  const root = new THREE.Group();
  root.name = 'character';
  const flip = kit.group(root); flip.rotation.y = Math.PI;
  const scaler = kit.group(flip); scaler.scale.setScalar(S);
  const spin = kit.group(scaler);
  const trunk = kit.group(spin, 0, 0.25, 0);

  // body with tabby stripes (rings round the spine, only over the back)
  const stripes = kit.tex(256, 128, (g, w, hh) => {
    g.fillStyle = ginger; g.fillRect(0, 0, w, hh);
    g.fillStyle = dark;
    for (let i = 0; i < 8; i++) {
      const y = 14 + i * 13.5 + (i % 2) * 2;
      const th = 5 + (i % 3);
      g.beginPath();
      g.moveTo(w * 0.52, y);
      g.quadraticCurveTo(w * 0.75, y - th * 0.8, w * 0.98, y + 1);
      g.quadraticCurveTo(w * 0.75, y + th * 1.2, w * 0.52, y);
      g.fill();
    }
  });
  const fur = kit.toon('#ffffff', { map: stripes });
  const gingerM = kit.toon(ginger), darkM = kit.toon(dark), creamM = kit.toon(cream), pink = kit.toon('#e7a3a0'), ink = kit.toon('#221e1a');
  const bodyGeo = kit.sphere(0.165, 1, 1, 1, 20, 16).rotateX(Math.PI / 2).scale(1.02, 0.9, 1.5);
  bodyGeo.computeVertexNormals();
  const torso = put(trunk, kit.mesh(bodyGeo, fur), 0, 0, 0);
  put(trunk, new THREE.Mesh(kit.sphere(0.14, 1, 0.75, 1.35), creamM), 0, -0.045, 0.02);
  void torso;

  // head
  const neck = kit.group(trunk, 0, 0.08, 0.2);
  const head = kit.group(neck, 0, 0.07, 0.04);
  put(head, kit.mesh(kit.sphere(0.135, 1.14, 0.95, 1, 22, 16), gingerM), 0, 0, 0);
  for (const sx of [1, -1]) put(head, new THREE.Mesh(kit.sphere(0.055, 1.1, 0.8, 0.8), creamM), 0.045 * sx, -0.05, 0.1);
  put(head, new THREE.Mesh(kit.sphere(0.045, 1.2, 0.7, 0.8), creamM), 0, -0.085, 0.085);
  put(head, new THREE.Mesh(kit.sphere(0.017, 1.3, 0.8, 0.8), pink), 0, -0.025, 0.14);
  // forehead "M"
  for (const [x, rz, len] of [[0, 0, 0.05], [0.03, 0.25, 0.04], [-0.03, -0.25, 0.04]] as const) put(head, new THREE.Mesh(kit.box(0.012, len, 0.01), darkM), x, 0.075, 0.105, -0.55, 0, rz);
  // eyes: smug half-lids
  const eyes: Mesh[] = [];
  for (const sx of [1, -1]) {
    const e = put(head, new THREE.Mesh(kit.sphere(0.024, 1.1, 1, 0.5, 10, 8), ink), 0.058 * sx, 0.02, 0.118);
    e.lookAt(0.058 * sx * 3, 0.02, 1);
    eyes.push(e);
  }
  // ears (pyramids with pink insides)
  const ears: Group[] = [];
  const earGeo = kit.add(new THREE.ConeGeometry(0.055, 0.1, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.55));
  const earIn = kit.add(new THREE.ConeGeometry(0.033, 0.065, 3, 1).scale(1, 1, 0.4));
  for (const sx of [1, -1]) {
    const ear = kit.group(head, 0.075 * sx, 0.1, -0.01);
    ear.rotation.set(-0.1, 0, -0.35 * sx);
    put(ear, kit.mesh(earGeo, gingerM, OL * 0.8), 0, 0.04, 0);
    put(ear, new THREE.Mesh(earIn, pink), 0, 0.03, 0.017);
    ears.push(ear);
  }
  // whiskers
  const wM = kit.toon('#f7f2e8');
  for (const sx of [1, -1]) for (let i = 0; i < 3; i++) put(head, new THREE.Mesh(kit.box(0.12, 0.004, 0.004), wM), 0.1 * sx, -0.045 + i * 0.018, 0.1, 0, -0.35 * sx, (i - 1) * 0.18 * sx);

  // legs: shoulders & hips, white socks
  const legGeo = kit.cyl(0.042, 0.036, 0.2, 10, 'top');
  const pawGeo = kit.sphere(0.045, 1.05, 0.62, 1.25);
  const mkLeg = (x: number, z: number, back: boolean) => {
    const g = kit.group(trunk, x, back ? -0.02 : -0.03, z);
    if (back) put(g, kit.mesh(kit.sphere(0.075, 0.9, 1.1, 1.1), gingerM), 0, 0.0, 0);
    put(g, kit.mesh(legGeo, gingerM, OL * 0.8), 0, 0, 0);
    put(g, kit.mesh(pawGeo, creamM, OL * 0.8), 0, -0.2, 0.012);
    return g;
  };
  const FL = mkLeg(0.085, 0.16, false), FR = mkLeg(-0.085, 0.16, false);
  const BL = mkLeg(0.095, -0.15, true), BR = mkLeg(-0.095, -0.15, true);

  // tail: striped segments
  const tailSegs: Group[] = [];
  let parent: Group = kit.group(trunk, 0, 0.06, -0.23);
  const tailBase = parent;
  for (let i = 0; i < 7; i++) {
    const seg = kit.group(parent, 0, i ? 0.065 : 0, 0);
    const r = 0.034 - i * 0.002;
    put(seg, kit.mesh(kit.cyl(r - 0.002, r, 0.075, 8, 'bottom'), i % 2 ? darkM : gingerM, OL * 0.7), 0, 0, 0);
    put(seg, new THREE.Mesh(kit.sphere(r - 0.001, 1, 1, 1, 8, 6), i % 2 ? darkM : gingerM), 0, 0.07, 0);
    tailSegs.push(seg);
    parent = seg;
  }

  const blink = new Blinker(12);
  const tailSpring = new Spring(18, 5);
  let phase = 0, idleT = 0, twitchAt = 2, twitchSide = 0, twitch = 0, wasGrounded = true, landed = 0, spinA = 0;
  const cur = { tp: 0, ty: 0.25, tz: 0, fl: 0, fr: 0, bl: 0, br: 0, neck: 0, head: 0, headY: 0, tailUp: 1, lid: 0.55, sit: 0, stretch: 1 };

  // the right fore-paw, for a prop a feature lends (a rod held between the paws as he sits)
  const hand = kit.group(FR, 0, -0.17, 0.05);

  const model: CharacterModel & { hand: Group; hold(prop: string | null): void } = {
    root,
    height: 0.56 * S,
    hand,
    hold() { /* nothing of his own to put down */ },
    update(dt: number, s: MotionState) {
      dt = Math.max(0, Math.min(dt, 0.1));
      const t = s.t;
      const v = s.riding ? 0 : s.speed;
      const run = s.running && v > 2.4;
      const walkK = Math.min(1, v / 1.6);
      phase += (v * dt * Math.PI * 2) / ((run ? 0.95 : 0.5) * S);
      const sn = Math.sin(phase);
      const air = !s.grounded && !s.riding;
      if (v < 0.12 && !air) idleT += dt; else idleT = 0;
      const e = s.emote;
      const u = clamp(s.emoteT);
      const env = e ? (e === 'sit' || e === 'row' ? 1 : smooth(Math.min(1, u / 0.14, (1 - u) / 0.18))) : 0;

      // targets
      let tp = 0, ty = 0.25 + Math.abs(Math.cos(phase)) * 0.012 * walkK, tz = 0;
      let fl = 0, fr = 0, bl = 0, br = 0;
      let neckT = -0.1 * walkK, headT = 0.1 * walkK, headY = 0;
      let tailUp = 1 - (run ? 0.8 : 0);
      let lid = 0.55, stretch = 1;
      let sit = idleT > 2.2 ? 1 : 0;
      if (run) {
        const a = Math.sin(phase), b = Math.sin(phase + 2.4);
        fl = a * 0.85; fr = a * 0.75; bl = b * 0.85; br = b * 0.75;
        tp = Math.cos(phase) * 0.12; ty = 0.25 + Math.max(0, Math.sin(phase + 0.8)) * 0.05;
        lid = 1; neckT = 0.05;
      } else {
        fl = sn * 0.5 * walkK; br = sn * 0.5 * walkK; fr = -sn * 0.5 * walkK; bl = -sn * 0.5 * walkK;
      }
      if (air) {
        const up = s.vy > 0;
        fl = fr = up ? -1.0 : -0.6; bl = br = up ? 1.0 : 0.5; tp = up ? -0.25 : 0.15; lid = 1; stretch = 1.1; sit = 0; tailUp = 0.3;
      }
      if (!wasGrounded && s.grounded) landed = 1;
      wasGrounded = s.grounded;
      if (landed > 0) { landed = Math.max(0, landed - dt * 4); ty -= Math.sin(landed * Math.PI) * 0.04; }

      if (s.riding || e === 'sit' || e === 'row' || e === 'wave' || e === 'throw' || e === 'cast') sit = 1;
      if (sit > 0) { fl = 0; fr = 0; bl = 0; br = 0; }
      if (e && env > 0) {
        const m = (x: number, y: number) => mix(x, y, env);
        if (e === 'eat' || e === 'water') {
          const nom = Math.sin(t * (e === 'water' ? 14 : 9)) * 0.08;
          neckT = m(neckT, 0.75); headT = m(headT, 0.45 + nom); fl = m(fl, -0.25); fr = m(fr, -0.25); bl = m(bl, 0.25); br = m(br, 0.25);
          ty = m(ty, 0.21); lid = m(lid, 0.25);
        } else if (e === 'bow') {
          // the play-bow stretch: chest down, rump up, tail high
          fl = m(fl, -1.1); fr = m(fr, -1.1); tp = m(tp, 0.35); ty = m(ty, 0.2); bl = m(bl, 0.15); br = m(br, 0.15);
          neckT = m(neckT, -0.25); headT = m(headT, -0.2); lid = m(lid, 0.15); tailUp = m(tailUp, 1.3); stretch = m(stretch, 1.08);
        } else if (e === 'jump') {
          fl = m(fl, -0.6); fr = m(fr, -0.6); bl = m(bl, 0.5); br = m(br, 0.5); lid = 1;
        } else if (e === 'play') {
          // chasing his own tail
          lid = 1; neckT = m(neckT, 0.2); headY = m(0, 0.6); tailUp = m(tailUp, 0.3);
          fl = Math.sin(t * 16) * 0.5 * env; br = fl; fr = -fl; bl = -fl;
        }
      }
      // ear twitches
      if (t > twitchAt) { twitchAt = t + 1.5 + ((t * 3.7) % 3); twitchSide = Math.floor(t * 10) % 2; twitch = 1; }
      twitch = Math.max(0, twitch - dt * 6);

      const k = run ? 20 : 14;
      cur.tp = damp(cur.tp, tp, k, dt); cur.ty = damp(cur.ty, ty, k, dt);
      cur.fl = damp(cur.fl, fl, k, dt); cur.fr = damp(cur.fr, fr, k, dt); cur.bl = damp(cur.bl, bl, k, dt); cur.br = damp(cur.br, br, k, dt);
      cur.neck = damp(cur.neck, neckT, 8, dt); cur.head = damp(cur.head, headT, 8, dt); cur.headY = damp(cur.headY, headY, 5, dt);
      cur.tailUp = damp(cur.tailUp, tailUp, 4, dt); cur.lid = damp(cur.lid, lid, 8, dt); cur.sit = damp(cur.sit, sit, 5, dt);
      cur.stretch = damp(cur.stretch, stretch, 8, dt);

      // sitting: rump down, chest up, hind legs folded, front legs upright
      const st = cur.sit;
      trunk.position.set(0, cur.ty - st * 0.04, tz - st * 0.05);
      trunk.rotation.x = cur.tp - st * 0.62;
      trunk.scale.set(1, 1, cur.stretch);
      FL.rotation.x = cur.fl + st * 0.62; FR.rotation.x = cur.fr + st * 0.62;
      BL.rotation.x = cur.bl - st * 0.95; BR.rotation.x = cur.br - st * 0.95;
      BL.position.y = BR.position.y = -0.02 + st * 0.05;
      // beckoning / swiping paw while sitting
      if (e === 'wave' || e === 'throw' || e === 'cast') {
        const a = e === 'wave' ? -1.9 + Math.sin(t * 7) * 0.35 : -0.6 - Math.max(0, Math.sin(t * 10)) * 1.2;
        FR.rotation.x = mix(FR.rotation.x, a, env);
      }
      neck.rotation.x = cur.neck + st * 0.55;
      head.rotation.x = cur.head;
      head.rotation.y = cur.headY + (idleT > 1 ? Math.sin(t * 0.45) * 0.35 : 0);
      head.rotation.z = Math.sin(t * 0.8) * 0.04 * (1 - walkK);
      ears.forEach((ear, i) => { ear.rotation.z = (i ? 0.35 : -0.35) + (i === twitchSide ? (i ? 1 : -1) * twitch * 0.5 : 0); ear.rotation.x = -0.1 - (air ? 0.5 : 0); });

      // chasing the tail: whole cat spins in place
      if (e === 'play') spinA += dt * 9 * env; else spinA = damp(spinA, Math.round(spinA / (Math.PI * 2)) * Math.PI * 2, 6, dt);
      spin.rotation.y = spinA;

      // tail: up in a hook when walking, streaming when running, lazy swish when sitting
      const swish = tailSpring.step(Math.sin(t * (st > 0.5 ? 1.6 : 2.4)) * (st > 0.5 ? 0.5 : 0.25), dt);
      const up = cur.tailUp;
      tailBase.rotation.x = mix(-1.9, -0.35, clamp(up)) - st * 0.6;
      tailSegs.forEach((seg, i) => {
        const w = Math.sin(t * 2.6 - i * 0.7 + phase * 0.3) * 0.12;
        seg.rotation.x = i === 0 ? 0 : (st > 0.5 ? -0.12 : up > 0.7 ? (i > 4 ? 0.45 : -0.06) : 0.05) + w * (run ? 0.5 : 0.3);
        seg.rotation.z = i === 0 ? swish : swish * 0.25 + (st > 0.5 ? 0.18 : 0);
      });

      const b = blink.at(t);
      for (const eye of eyes) eye.scale.y = Math.min(b, cur.lid);
    },
    dispose() {
      root.removeFromParent();
      kit.dispose();
    },
  };
  return model;
};
