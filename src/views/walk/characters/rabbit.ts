// 玉兔 · the Jade Rabbit — a round white rabbit from the moon with long pink-lined ears, rouge
// eyes, a cotton tail and a little jade tag on a red cord. It hops (squash, stretch, ears
// streaming back), sits up tall to look round when idle, nose twitching — and washes its face
// with both paws, thumps a hind foot, or pulls an ear down to groom it. When it "plays" it
// pounds elixir in a tiny mortar, as on the moon. Talking is a quick twitch of nose and ears,
// petting flattens the ears in bliss, building is digging, dancing is a binky (a leap with a
// twist), sleeping is a flat loaf; its skill (月华) is a deep crouch and a spring high into the air.
import type { CharacterFactory, CharacterModel, MotionState } from './types';
import { Blinker, Kit, OL, Spring, bake, clamp, damp, mix, put, smooth, type Group } from './rig';

type Fid = 'wash' | 'thump' | 'ear';
const FIDGETS: { id: Fid; dur: number }[] = [{ id: 'wash', dur: 3.4 }, { id: 'thump', dur: 1.8 }, { id: 'ear', dur: 3.6 }];

export const rabbit: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const reduced = kit.reduced;
  const S = 1.05;
  const root = new THREE.Group();
  root.name = 'character';
  const flip = kit.group(root); flip.rotation.y = Math.PI;
  const scaler = kit.group(flip); scaler.scale.setScalar(S);
  const hop = kit.group(scaler);
  const body = kit.group(hop, 0, 0.0, 0);
  const white = kit.toon('#fbf3e8'), pink = kit.toon('#f0aaa8'), eyeM = kit.toon('#b0303a'), shade = kit.toon('#f0e2d0');

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
  put(trunk, new THREE.Mesh(cord, kit.toon('#c23b2b')), 0, 0.205, 0.0, 0.15, 0, 0);
  const tag = put(trunk, kit.mesh(kit.cyl(0.028, 0.028, 0.012, 16).rotateX(Math.PI / 2), kit.toon('#6fb592'), OL * 0.5), 0, 0.158, 0.158);
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
  const stone = kit.toon('#c8b8a0');
  put(kitchen, kit.mesh(kit.lathe([[0, 0], [0.06, 0], [0.07, 0.05], [0.06, 0.09], [0.045, 0.09], [0.04, 0.03], [0, 0.03]], 16), stone), 0, 0, 0);
  const pestle = kit.group(trunk, 0, 0.12, 0.13);
  put(pestle, kit.mesh(kit.cyl(0.012, 0.018, 0.2, 8), kit.toon('#b8894e'), OL * 0.6), 0, -0.02, 0);
  kitchen.visible = false; pestle.visible = false;

  const blink = new Blinker(13);
  let phase = 0, idleT = 0, wasGrounded = true, landed = 0, lookAt = 2, perk = 0, spinA = 0;
  let holding = false;
  let fid = -1, fidT = 0, fidRest = 4, fidN = 0, fidK = 0;
  const cur = { y: 0, pitch: 0, sq: 1, feet: 0, paws: 0, pawL: 0, head: 0, headY: 0, up: 0, flat: 0, earBack: 0, earL: 0 };

  // fold the still parts into a few draws; the nose twitches and the tail breathes on their own
  kit.keep(nose, tail);
  bake(kit, root);

  const hand = kit.group(paws[1], 0, -0.09, 0.03);

  const model: CharacterModel & { hand: Group; hold(prop: string | null): void } = {
    root,
    height: 0.6 * S,
    hand,
    hold(prop: string | null) { holding = !!prop; /* the mortar only appears while pounding */ },
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

      // idle fidgets
      const can = !reduced && !holding && idleT > 3 && !e && !s.riding;
      fidK = damp(fidK, can && fid >= 0 ? 1 : 0, can ? 6 : 12, dt);
      if (can) {
        if (fid < 0) { fidRest -= dt; if (fidRest <= 0) { fid = fidN++ % FIDGETS.length; fidT = 0; } }
        else if ((fidT += dt) >= FIDGETS[fid].dur) { fid = -1; fidRest = 2.2 + (fidN % 3) * 0.8; }
      } else { if (idleT < 3) fidRest = 0.8; if (fidK < 0.02) fid = -1; }
      const fd = fid >= 0 ? FIDGETS[fid].id : null;
      const fu = fid >= 0 ? clamp(fidT / FIDGETS[fid].dur) : 0;
      const fk = fid >= 0 ? fidK * smooth(Math.min(1, fidT / 0.35, (FIDGETS[fid].dur - fidT) / 0.4)) : 0;

      let y = 0, pitch = 0, sq = 1, ft = 0, pw = -0.1, pwL = 0, hd = 0, hy = 0, up = 0, earBack = 0, earL = 0, flat = 0, lid = 1;
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
      if (idleT > 0.5 && !e && !fd) {
        if (t > lookAt) { lookAt = t + 3 + ((t * 5.7) % 3); perk = perk ? 0 : 1; }
        up = perk; hy = Math.sin(t * 0.6) * 0.5 * perk;
      }
      if (fd && fk > 0) {
        if (fd === 'wash') {
          // up on the haunches, both paws over the face, round and round
          const r = Math.sin(fidT * 8);
          up = mix(up, 0.85, fk); pw = mix(pw, -1.6 + r * 0.25, fk); pwL = r * 0.25 * fk; hd = mix(hd, 0.35 + r * 0.05, fk); lid = mix(1, 0.2, fk);
        } else if (fd === 'thump') {
          // ears up, alert, one hind foot drums the ground twice
          const th = fu > 0.3 && fu < 0.75 ? Math.max(0, Math.sin((fu - 0.3) * 28)) : 0;
          ft = mix(ft, -0.5 * th, fk); earBack = mix(earBack, -0.35, fk); hy = mix(hy, 0.4, fk); sq = mix(sq, 1 - th * 0.03, fk);
        } else if (fd === 'ear') {
          // the right ear pulled down with both paws and licked
          const lick = Math.sin(fidT * 10) * 0.04;
          up = mix(up, 0.7, fk); earL = fk; pw = mix(pw, -1.3, fk); hd = mix(hd, 0.45 + lick, fk); hy = mix(hy, -0.25, fk); lid = mix(1, 0.4, fk);
        }
      }
      if (e && env > 0) {
        const m = (a: number, b: number) => mix(a, b, env);
        if (e === 'eat' || e === 'water') { hd = m(hd, 0.35 + Math.sin(t * 20) * 0.05); pw = m(pw, -1.2); up = m(up, 0.4); }
        else if (e === 'bow') { hd = m(hd, 0.5); earBack = m(earBack, -0.8); pitch = m(pitch, 0.25); }
        else if (e === 'wave') { up = m(up, 1); }
        else if (e === 'play') { up = m(up, 1); pw = m(pw, -1.25 + Math.max(0, Math.sin(t * 9)) * 0.5); hd = m(hd, 0.3); }
        else if (e === 'throw' || e === 'cast') { up = m(up, 0.8); }
        else if (e === 'jump') { ft = m(ft, 0.6); }
        else if (e === 'talk') {
          // a busy nose, ears flicking, a bob of the head
          up = m(up, 0.6); hd = m(hd, Math.sin(t * 7) * 0.12); earBack = m(earBack, Math.sin(t * 5) * 0.3); hy = m(hy, Math.sin(t * 2.5) * 0.3);
        } else if (e === 'pet') {
          // ears laid flat along the back, eyes shut in bliss
          flat = env; hd = m(hd, 0.3); lid = mix(1, 0.1, env); sq = m(sq, 0.93);
        } else if (e === 'build') {
          // digging: the fore-paws scrabble, head down
          const dg = Math.sin(t * 16);
          pitch = m(pitch, 0.35); hd = m(hd, 0.35); pw = m(pw, -0.6 + dg * 0.5); pwL = dg * -0.9 * env; earBack = m(earBack, 0.4);
        } else if (e === 'dance') {
          // a binky: a leap with a twist in the air, twice
          const b1 = Math.sin(clamp(u / 0.4) * Math.PI), b2 = Math.sin(clamp((u - 0.5) / 0.4) * Math.PI);
          const b = Math.max(b1, b2);
          y = m(y, b * 0.28); ft = m(ft, b * 1.3); pw = m(pw, -0.9 * b); earBack = m(earBack, b * 0.8); sq = m(sq, 1 + b * 0.1);
        } else if (e === 'sleep') {
          // a flat loaf, ears down, eyes shut, breathing slow
          flat = smooth(u / 0.3) * env; sq = m(sq, 0.86 + Math.sin(t * 1.8) * 0.02); hd = m(hd, 0.25); lid = mix(1, 0.08, flat); pw = m(pw, 0.4);
        } else if (e === 'skill') {
          // 月华: crouch low (0–.35), spring high (.35–.6), float down ears up (.6–.85), land
          const crouch = smooth(u / 0.25) * (1 - smooth((u - 0.33) / 0.05));
          const rise = Math.sin(clamp((u - 0.35) / 0.55) * Math.PI);
          y = m(y, rise * 0.42); sq = m(sq, 1 - crouch * 0.18 + rise * 0.14); pitch = m(pitch, crouch * 0.2 - rise * 0.25);
          ft = m(ft, rise * 1.2 - crouch * 0.3); pw = m(pw, -0.8 * rise); hd = m(hd, -0.2 * rise);
          earBack = m(earBack, crouch * 0.9 - rise * 0.5); up = m(up, rise * 0.5);
        }
      }

      const k = 16;
      cur.y = damp(cur.y, y, moving || e === 'skill' || e === 'dance' ? 30 : 12, dt);
      cur.pitch = damp(cur.pitch, pitch, k, dt);
      cur.sq = damp(cur.sq, sq, 22, dt);
      cur.feet = damp(cur.feet, ft, k, dt);
      cur.paws = damp(cur.paws, pw, k, dt);
      cur.pawL = damp(cur.pawL, pwL, k, dt);
      cur.head = damp(cur.head, hd, 10, dt);
      cur.headY = damp(cur.headY, hy, 4, dt);
      cur.up = damp(cur.up, up, 6, dt);
      cur.flat = damp(cur.flat, flat, 6, dt);
      cur.earBack = earBack;
      cur.earL = damp(cur.earL, earL, 8, dt);

      // the binky's twist
      if (e === 'dance' && !reduced) spinA = Math.sin(clamp(u / 0.4) * Math.PI) * 0.6 - Math.sin(clamp((u - 0.5) / 0.4) * Math.PI) * 0.6;
      else spinA = damp(spinA, 0, 8, dt);

      hop.position.y = cur.y;
      hop.rotation.y = spinA;
      trunk.rotation.x = cur.pitch - cur.up * 0.55;
      trunk.position.z = -cur.up * 0.04;
      body.scale.set(1 / Math.sqrt(cur.sq) * (1 + cur.flat * 0.08), cur.sq * (1 - cur.flat * 0.06), 1 / Math.sqrt(cur.sq));
      for (const f of feet) f.rotation.x = cur.feet + cur.up * 0.55;
      if (fd === 'thump' && fk > 0) feet[1].rotation.x = mix(feet[1].rotation.x, cur.feet * 0.2, fk);
      for (const h of haunches) h.rotation.x = 0;
      paws.forEach((p, i) => {
        let a = cur.paws + cur.up * 0.5 + (i ? cur.pawL : -cur.pawL);
        if (i === 1 && e === 'wave') a = mix(a, -2.2 + Math.sin(t * 8) * 0.4, env);
        if (i === 1 && (e === 'throw' || e === 'cast')) a = mix(a, -0.4 - Math.max(0, Math.sin(t * 10)) * 1.3, env);
        p.rotation.x = a;
      });
      head.rotation.x = cur.head + cur.up * 0.45 + Math.sin(t * 1.1) * 0.03 * (reduced ? 0 : 1);
      head.rotation.y = cur.headY;
      const busyNose = e === 'talk' ? 1 : 0;
      nose.scale.y = 1 + ((Math.sin(t * 22) > 0.6 && Math.sin(t * 0.9) > 0) || (busyNose && Math.sin(t * 30) > 0) ? 0.25 : 0);
      tail.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      ears.forEach((ear, i) => {
        const sx = i ? -1 : 1;
        const back = earSpring[i].step(-cur.earBack - v * 0.05 + (i ? Math.sin(t * 0.7) * 0.08 : 0) - cur.flat * 1.5 - (i ? cur.earL * 0.5 : 0), dt);
        ear.rotation.x = back;
        ear.rotation.z = -0.16 * sx + (i && idleT > 3 && !fd ? Math.max(0, Math.sin(t * 0.8)) * 0.35 : 0) * -sx + (i ? -cur.earL * 0.6 : 0);
      });
      const pounding = e === 'play' && env > 0.3;
      kitchen.visible = pestle.visible = pounding;
      if (pounding) pestle.position.y = 0.12 - Math.max(0, Math.sin(t * 9)) * 0.06;

      eyes.scale.y = Math.min(blink.at(t), lid);
    },
    dispose() {
      root.removeFromParent();
      kit.dispose();
    },
  };
  return model;
};
