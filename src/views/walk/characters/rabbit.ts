// 玉兔 · the Jade Rabbit — a round white rabbit from the moon with long pink-lined ears, rouge
// eyes, a cotton tail and a little jade tag on a red cord. It hops (squash, stretch, ears
// streaming back), sits up tall to look round when idle, nose twitching, and when it "plays"
// it pounds elixir in a tiny mortar, as on the moon.
import type { CharacterFactory, CharacterModel, MotionState } from './types';
import { Blinker, Kit, OL, Spring, bake, clamp, damp, mix, put, smooth, type Group } from './rig';

export const rabbit: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const S = 1.05;
  const root = new THREE.Group();
  root.name = 'character';
  const flip = kit.group(root); flip.rotation.y = Math.PI;
  const scaler = kit.group(flip); scaler.scale.setScalar(S);
  const hop = kit.group(scaler);
  const body = kit.group(hop, 0, 0.0, 0);
  const white = kit.toon('#f6f3ed'), pink = kit.toon('#eab1b3'), eyeM = kit.toon('#a8323a'), shade = kit.toon('#e8e2d8');

  // body: a soft pear, the haunches, the cotton tail
  const trunk = kit.group(body, 0, 0.0, -0.02);
  put(trunk, kit.mesh(kit.sphere(0.13, 1, 1.08, 1.12, 20, 16), white), 0, 0.15, 0);
  const haunches: Group[] = [];
  const feet: Group[] = [];
  for (const sx of [1, -1]) {
    const hn = kit.group(trunk, 0.075 * sx, 0.1, -0.03);
    put(hn, kit.mesh(kit.sphere(0.07, 0.85, 1, 1.15), white), 0, 0, 0);
    haunches.push(hn);
    const ft = kit.group(hn, 0.005 * sx, -0.05, 0.0);
    put(ft, kit.mesh(kit.sphere(0.036, 1, 0.55, 2.1), white, OL * 0.8), 0, -0.035, 0.05);
    feet.push(ft);
  }
  const tail = put(trunk, kit.mesh(kit.sphere(0.045), white), 0, 0.12, -0.14);
  // front paws
  const paws: Group[] = [];
  for (const sx of [1, -1]) {
    const pw = kit.group(trunk, 0.05 * sx, 0.12, 0.1);
    put(pw, kit.mesh(kit.cyl(0.024, 0.022, 0.09, 8, 'top'), white, OL * 0.8), 0, 0, 0);
    put(pw, kit.mesh(kit.sphere(0.027, 1, 0.8, 1.2), white, OL * 0.8), 0, -0.09, 0.01);
    paws.push(pw);
  }
  // jade tag on a red cord
  // jade tag on a red cord. The head hangs low over the chest, so the cord rings the body just
  // under the chin (the body's cross-section there is ≈ 0.12 × 0.14) and the tag lies on the breast.
  const cord = kit.torus(0.128, 0.009, 5, 30).rotateX(Math.PI / 2).scale(1, 1, 1.16);
  put(trunk, new THREE.Mesh(cord, kit.toon('#b93a2b')), 0, 0.205, 0.0, 0.15, 0, 0);
  const tag = put(trunk, kit.mesh(kit.cyl(0.028, 0.028, 0.012, 16).rotateX(Math.PI / 2), kit.toon('#7fb39a'), OL * 0.5), 0, 0.158, 0.158);
  put(tag, new THREE.Mesh(kit.torus(0.011, 0.004, 4, 10), kit.toon('#5f8f78')), 0, 0, 0.007);

  // head
  const head = kit.group(trunk, 0, 0.29, 0.07);
  put(head, kit.mesh(kit.sphere(0.1, 1.06, 0.95, 1, 22, 16), white), 0, 0, 0);
  for (const sx of [1, -1]) put(head, new THREE.Mesh(kit.sphere(0.038, 1, 0.85, 0.8), shade), 0.03 * sx, -0.035, 0.07);
  const nose = put(head, new THREE.Mesh(kit.sphere(0.013, 1.3, 0.9, 0.8), pink), 0, -0.01, 0.1);
  const eyes = kit.group(head, 0, 0.018, 0);
  for (const sx of [1, -1]) {
    const e = new THREE.Mesh(kit.sphere(0.018, 1, 1.15, 0.5, 10, 8), eyeM);
    e.position.set(0.052 * sx, 0, 0.083);
    e.lookAt(0.052 * sx * 3, 0, 1);
    eyes.add(e);
    put(head, new THREE.Mesh(kit.sphere(0.016, 1.4, 0.7, 0.35), kit.basic('#eba0a0', { opacity: 0.5 })), 0.07 * sx, -0.022, 0.07);
  }
  // ears: long, pink-lined, on springs
  const ears: Group[] = [];
  const earGeo = kit.sphere(0.036, 1, 3.3, 0.5, 14, 12);
  const earIn = kit.sphere(0.022, 1, 2.8, 0.3, 10, 8);
  for (const sx of [1, -1]) {
    const ear = kit.group(head, 0.035 * sx, 0.07, -0.015);
    put(ear, kit.mesh(earGeo, white), 0, 0.11, 0);
    put(ear, new THREE.Mesh(earIn, pink), 0, 0.11, 0.012);
    ears.push(ear);
  }
  const earSpring = [new Spring(40, 4), new Spring(38, 4)];

  // mortar & pestle, only while pounding elixir
  const kitchen = kit.group(body, 0, 0, 0.2);
  const stone = kit.toon('#b8b3a8');
  put(kitchen, kit.mesh(kit.lathe([[0, 0], [0.06, 0], [0.07, 0.05], [0.06, 0.09], [0.045, 0.09], [0.04, 0.03], [0, 0.03]], 16), stone), 0, 0, 0);
  const pestle = kit.group(trunk, 0, 0.12, 0.13);
  put(pestle, kit.mesh(kit.cyl(0.012, 0.018, 0.2, 8), kit.toon('#b08d5a'), OL * 0.6), 0, -0.02, 0);
  kitchen.visible = false; pestle.visible = false;

  const blink = new Blinker(13);
  let phase = 0, idleT = 0, wasGrounded = true, landed = 0, lookAt = 2, perk = 0;
  const cur = { y: 0, pitch: 0, sq: 1, feet: 0, paws: 0, head: 0, headY: 0, up: 0 };

  // fold the still parts into a few draws; the nose twitches and the tail breathes on their own
  kit.keep(nose, tail);
  bake(kit, root);

  const hand = kit.group(paws[1], 0, -0.09, 0.03);

  const model: CharacterModel & { hand: Group; hold(prop: string | null): void } = {
    root,
    height: 0.6 * S,
    hand,
    hold() { /* the mortar only appears while pounding */ },
    update(dt: number, s: MotionState) {
      dt = Math.max(0, Math.min(dt, 0.1));
      const t = s.t;
      const v = s.riding ? 0 : s.speed;
      const run = s.running && v > 2.4;
      const moving = v > 0.12;
      const hopLen = (run ? 0.8 : 0.42) * S;
      phase += (v * dt) / hopLen;
      const hp = phase % 1;
      const air = !s.grounded && !s.riding;
      if (!moving && !air) idleT += dt; else idleT = 0;
      const e = s.emote;
      const u = clamp(s.emoteT);
      const env = e ? (e === 'sit' || e === 'row' ? 1 : smooth(Math.min(1, u / 0.14, (1 - u) / 0.18))) : 0;

      let y = 0, pitch = 0, sq = 1, ft = 0, pw = -0.1, hd = 0, hy = 0, up = 0, earBack = 0;
      if (moving && !air) {
        // one hop per cycle: an arc with squash on landing, feet kicking back in the air
        const k = Math.min(1, v / 1.2);
        const arc = Math.sin(Math.PI * hp);
        y = arc * (run ? 0.17 : 0.09) * k;
        pitch = -Math.cos(Math.PI * hp) * 0.3 * k;
        sq = 1 - (1 - arc) * 0.1 * k + arc * 0.05 * k;
        ft = arc * 1.1 * k;
        pw = -arc * 0.9 * k - 0.1;
        earBack = arc * 0.7 * k;
      }
      if (air) { y = 0; pitch = s.vy > 0 ? -0.3 : 0.2; ft = 1.0; pw = -0.9; earBack = s.vy > 0 ? 0.9 : -0.3; sq = 1.08; }
      if (!wasGrounded && s.grounded) landed = 1;
      wasGrounded = s.grounded;
      if (landed > 0) { landed = Math.max(0, landed - dt * 5); sq -= Math.sin(landed * Math.PI) * 0.12; }

      // idle: now and then sit up tall to look round
      if (idleT > 0.5 && !e) {
        if (t > lookAt) { lookAt = t + 3 + ((t * 5.7) % 3); perk = perk ? 0 : 1; }
        up = perk; hy = Math.sin(t * 0.6) * 0.5 * perk;
      }
      if (e && env > 0) {
        const m = (a: number, b: number) => mix(a, b, env);
        if (e === 'eat' || e === 'water') { hd = m(hd, 0.35 + Math.sin(t * 20) * 0.05); pw = m(pw, -1.2); up = m(up, 0.4); }
        else if (e === 'bow') { hd = m(hd, 0.5); earBack = m(earBack, -0.8); pitch = m(pitch, 0.25); }
        else if (e === 'wave') { up = m(up, 1); }
        else if (e === 'play') { up = m(up, 1); pw = m(pw, -1.25 + Math.max(0, Math.sin(t * 9)) * 0.5); hd = m(hd, 0.3); }
        else if (e === 'throw' || e === 'cast') { up = m(up, 0.8); }
        else if (e === 'jump') { ft = m(ft, 0.6); }
      }

      const k = 16;
      cur.y = damp(cur.y, y, moving ? 30 : 12, dt);
      cur.pitch = damp(cur.pitch, pitch, k, dt);
      cur.sq = damp(cur.sq, sq, 22, dt);
      cur.feet = damp(cur.feet, ft, k, dt);
      cur.paws = damp(cur.paws, pw, k, dt);
      cur.head = damp(cur.head, hd, 10, dt);
      cur.headY = damp(cur.headY, hy, 4, dt);
      cur.up = damp(cur.up, up, 6, dt);

      hop.position.y = cur.y;
      trunk.rotation.x = cur.pitch - cur.up * 0.55;
      trunk.position.z = -cur.up * 0.04;
      body.scale.set(1 / Math.sqrt(cur.sq), cur.sq, 1 / Math.sqrt(cur.sq));
      for (const f of feet) f.rotation.x = cur.feet + cur.up * 0.55;
      for (const h of haunches) h.rotation.x = 0;
      paws.forEach((p, i) => {
        let a = cur.paws + cur.up * 0.5;
        if (i === 1 && e === 'wave') a = mix(a, -2.2 + Math.sin(t * 8) * 0.4, env);
        if (i === 1 && (e === 'throw' || e === 'cast')) a = mix(a, -0.4 - Math.max(0, Math.sin(t * 10)) * 1.3, env);
        p.rotation.x = a;
      });
      head.rotation.x = cur.head + cur.up * 0.45 + Math.sin(t * 1.1) * 0.03;
      head.rotation.y = cur.headY;
      nose.scale.y = 1 + (Math.sin(t * 22) > 0.6 && Math.sin(t * 0.9) > 0 ? 0.25 : 0);
      tail.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      ears.forEach((ear, i) => {
        const sx = i ? -1 : 1;
        const back = earSpring[i].step(-earBack - v * 0.05 + (i ? Math.sin(t * 0.7) * 0.08 : 0), dt);
        ear.rotation.x = back;
        ear.rotation.z = -0.16 * sx + (i && idleT > 3 ? Math.max(0, Math.sin(t * 0.8)) * 0.35 : 0) * -sx;
      });
      const pounding = e === 'play' && env > 0.3;
      kitchen.visible = pestle.visible = pounding;
      if (pounding) pestle.position.y = 0.12 - Math.max(0, Math.sin(t * 9)) * 0.06;

      eyes.scale.y = blink.at(t);
    },
    dispose() {
      root.removeFromParent();
      kit.dispose();
    },
  };
  return model;
};
