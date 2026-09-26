// 侠客 · the Wandering Swordsman — an ink-brown robe cut for travel, leather belt and wrist guards,
// a bamboo hat hung with a gauze veil that lifts when he runs, a long crimson scarf, and a sword
// at his left hip, his left hand resting on the scabbard by the guard. Light, quick steps; he
// runs with his arms swept back. Standing, he thumbs the guard an inch out and back, tips his hat,
// or folds his arms. His skill (轻功) draws the sword in one motion, cuts a bright arc, spins it
// and sheathes it again.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, clamp, conicalHat, holdLevel, mix, put, smooth } from './rig';

export const swordsman: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.17, skin: '#eccdab', robe: '#3d302a', skirt: '#362a24', trim: '#1c1714', hair: '#1a1918', sash: '#7a5230', sashTails: false,
    pants: '#2c241f', shoe: '#1d1815', hem: 0.19, flare: 0.22, sleeve: 'narrow', eyes: 'fierce', blush: 0.25, shoulder: 0.165,
  }, { stride: 0.74, runStride: 1.55, trailArms: true, runLean: 0.38, lean: 0.09, armSwing: 0.36, bounce: 0.04, legSwing: 0.62 }, 5);
  const hc = h.headC;

  // leather wrist guards and belt buckle
  const leather = kit.toon('#6e4a30');
  for (const a of [h.armL, h.armR]) put(a.el, kit.mesh(kit.cyl(0.058, 0.055, 0.08, 10), leather, OL * 0.6), 0, -0.13, 0);
  put(h.waist, new THREE.Mesh(kit.box(0.05, 0.045, 0.02), kit.toon('#c29a52')), 0, 0, 0.15);
  // high boots
  for (const l of [h.legL, h.legR]) put(l.knee, kit.mesh(kit.cyl(0.052, 0.05, 0.13, 10, 'top'), kit.toon('#221c18'), OL * 0.6), 0, -0.04, 0);

  // hat and veil
  const hat = conicalHat(kit, 0.29, 0.12, '#c9a86a', { knob: true });
  put(h.head, hat, 0, hc + 0.1, 0, -0.06, 0, 0);
  // the gauze: open across the face (±70°), faint, with soft folds, fading to nothing at the hem
  const gap = (70 / 180) * Math.PI;
  const veilGeo = kit.add(new THREE.CylinderGeometry(0.28, 0.31, 0.22, 28, 1, true, gap, Math.PI * 2 - gap * 2).translate(0, -0.11, 0));
  const gauze = kit.tex(128, 64, (g, w, hh) => {
    const v = g.createLinearGradient(0, 0, 0, hh);
    // a warm silk, thin: it only dims what is behind it a little (never grey stripes on his hair)
    v.addColorStop(0, 'rgba(250,232,196,0.5)'); v.addColorStop(0.4, 'rgba(250,232,196,0.22)'); v.addColorStop(1, 'rgba(250,232,196,0)');
    g.fillStyle = v; g.fillRect(0, 0, w, hh);
    g.globalCompositeOperation = 'destination-out';
    for (let x = 3; x < w; x += 9) { g.fillStyle = 'rgba(0,0,0,0.1)'; g.fillRect(x, 0, 3, hh); }
    const e = g.createLinearGradient(0, 0, w, 0);
    e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.12, 'rgba(0,0,0,0)'); e.addColorStop(0.88, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = e; g.fillRect(0, 0, w, hh);
  });
  const veil = put(hat, new THREE.Mesh(veilGeo, kit.toon('#fff3dc', { double: true, opacity: 0.6, map: gauze, emissive: '#3a2614' })), 0, -0.005, 0);
  const veilSpring = new Spring(30, 5);
  kit.keep(veil);

  // the sword at the left hip: the scabbard slants back and down, the hilt forward and up
  const dark = kit.toon('#2a1f1a'), bronze = kit.toon('#c29a52'), red = kit.toon('#c23b2b');
  const sword = kit.group(h.waist, 0.17, -0.03, 0.04);
  sword.rotation.set(1.25, 0, -0.12);
  put(sword, kit.mesh(kit.cyl(0.022, 0.018, 0.62, 8), dark), 0, -0.05, 0);
  put(sword, new THREE.Mesh(kit.cyl(0.024, 0.024, 0.03, 8), bronze), 0, 0.2, 0);
  put(sword, new THREE.Mesh(kit.cyl(0.021, 0.024, 0.04, 8), bronze), 0, -0.34, 0);
  // the hilt that stays in the scabbard (hidden while the blade is out)
  const hilt = kit.group(sword);
  put(hilt, kit.mesh(kit.box(0.1, 0.022, 0.04), bronze, OL * 0.6), 0, 0.27, 0);
  put(hilt, kit.mesh(kit.cyl(0.015, 0.015, 0.13, 8), kit.toon('#3a2e28'), OL * 0.6), 0, 0.35, 0);
  put(hilt, new THREE.Mesh(kit.sphere(0.022), bronze), 0, 0.425, 0);
  const tasselG = kit.group(hilt, 0, 0.43, 0);
  put(tasselG, kit.mesh(kit.cyl(0.004, 0.02, 0.12, 6, 'top'), red, OL * 0.5), 0, -0.01, 0);
  const tasselSpring = new Spring(24, 3);
  // the drawn sword, in the right hand
  const drawn = kit.group(h.armR.hand, 0, -0.02, 0.02);
  const steel = kit.toon('#e2e4dc');
  put(drawn, kit.mesh(kit.box(0.1, 0.022, 0.04), bronze, OL * 0.6), 0, 0.0, 0);
  put(drawn, kit.mesh(kit.cyl(0.015, 0.015, 0.13, 8), kit.toon('#3a2e28'), OL * 0.6), 0, 0.075, 0);
  put(drawn, kit.mesh(kit.shape([[-0.018, 0], [0.018, 0], [0.016, 0.55], [0, 0.62], [-0.016, 0.55]], 0.006, 0.002), steel, OL * 0.4), 0, 0.01, 0, Math.PI, 0, 0);
  drawn.rotation.x = -1.5;
  drawn.visible = false;
  // the arc of the cut: a crescent of light that flashes and fades
  // (in front of the chest, in the plane of the rising cut: a bright leading edge fading inward)
  const R0 = 0.4, R1 = 0.62;
  const arcTex = kit.tex(128, 128, (g, w) => {
    const r0 = (R0 / (2 * R1)) * w, r1 = w / 2;
    const gr = g.createRadialGradient(w / 2, w / 2, r0, w / 2, w / 2, r1);
    gr.addColorStop(0, 'rgba(255,236,200,0)'); gr.addColorStop(0.72, 'rgba(255,236,200,0.55)'); gr.addColorStop(0.9, 'rgba(255,250,236,1)'); gr.addColorStop(1, 'rgba(255,250,236,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const arcMat = kit.add(new THREE.MeshBasicMaterial({ color: '#ffe9c4', map: arcTex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const arcGeo = kit.add(new THREE.RingGeometry(R0, R1, 28, 1, -0.35, Math.PI * 0.8));
  const arc = new THREE.Mesh(arcGeo, arcMat);
  arc.position.set(-0.05, 0.42, 0.5);
  arc.rotation.set(-0.35, 0, 0.35);
  arc.visible = false;
  h.body.add(arc);
  kit.keep(arc);

  // scarf: a knot at the throat and a long crimson tail
  const scarf = new Ribbon(kit, '#a8322a', 9, (u) => 0.065 * (1 - u * 0.5));
  h.body.add(scarf.mesh);
  scarf.twist = 1.2;
  put(h.chest, kit.mesh(kit.torus(0.075, 0.03, 6, 18).rotateX(Math.PI / 2), kit.toon('#a8322a'), OL * 0.6), 0, 0.31, 0);
  const flow = new Spring(26, 6);

  // the drawn blade's line (its tip is along −y in its own frame)
  const DOWN = new THREE.Vector3(0, -1, 0);
  const D_DRAW = new THREE.Vector3(0.25, -0.2, 1).normalize();
  const WHEEL0 = 0.4, WHEEL = Math.PI * 2 + 1.4;
  const D_UP = new THREE.Vector3(-0.3, Math.cos(WHEEL0), Math.sin(WHEEL0));
  const D_HOME = new THREE.Vector3(0.1, -0.35, -0.93);
  const bladeDir = new THREE.Vector3(), bladeQ = new THREE.Quaternion(), tmpQ = new THREE.Quaternion();

  h.fidgets = [
    {
      id: 'thumb', dur: 3, pose: (p, k, u) => {
        // thumb on the guard: an inch of steel shown and put away, eyes left and right
        const m = h.mx.set(p, k).m;
        m('headY', mix(0.45, -0.45, smooth((u - 0.2) / 0.5))); m('headX', 0.05); m('bodyX', 0.04);
        m('hipLx', -0.2); m('hipRx', 0.12); m('knL', 0.15); m('knR', 0.2);
      },
    },
    {
      id: 'hat', dur: 2.6, pose: (p, k, u) => {
        // tipping the hat brim down over the eyes
        const m = h.mx.set(p, k).m;
        const tip = Math.sin(clamp(u / 0.8) * Math.PI);
        m('shRx', -2.0); m('shRz', -0.5); m('elRx', -1.4 - tip * 0.2); m('elRz', 0.35);
        m('headX', 0.12 + tip * 0.12);
      },
    },
    {
      id: 'fold', dur: 4.5, pose: (p, k, _u, secs) => {
        // arms folded, weight on one leg, a slow look round
        const m = h.mx.set(p, k).m;
        m('shLx', -0.75); m('shLz', -0.45); m('elLx', -1.6); m('elLz', 0.1);
        m('shRx', -0.7); m('shRz', 0.45); m('elRx', -1.65); m('elRz', -0.1);
        m('bodyZ', 0.04); m('hipLz', 0.08); m('hipRz', 0.05); m('knR', 0.25); m('headY', Math.sin(secs * 0.7) * 0.3); m('headX', -0.04);
      },
    },
  ];

  h.onPose = (p, f) => {
    // the left hand rests on the scabbard by the guard (unless both hands, or a fidget, want it)
    const rest = (1 - bothHands(f, h.seat)) * (1 - (f.fidget === 'fold' ? f.fk : 0)) * (f.run ? 0 : 1) * (f.emote === 'skill' ? 1 - f.env : 1);
    if (rest > 0) {
      const m = h.mx.set(p, rest).m;
      m('shLx', -0.32); m('shLz', 0.12); m('elLx', -0.95); m('elLz', -0.25);
    }
    if (f.fidget === 'thumb') {
      const m = h.mx.set(p, f.fk).m;
      const push = Math.sin(clamp((f.fu - 0.25) / 0.45) * Math.PI);
      m('elLx', -0.95 - push * 0.2);
    }
    if (f.emote === 'talk') {
      // few words, arms folded, weight on one leg, a nod
      const m = h.mx.set(p, f.env).m;
      m('shLx', -0.75); m('shLz', -0.45); m('elLx', -1.6); m('elLz', 0.1);
      m('shRx', -0.7); m('shRz', 0.45); m('elRx', -1.65); m('elRz', -0.1);
      m('bodyZ', 0.04); m('hipLz', 0.08); m('knR', 0.25); m('headX', 0.04 + Math.max(0, Math.sin(f.since * 2.2)) * 0.1);
    }
    if (f.emote === 'bow' || f.emote === 'wave') {
      // 抱拳: right fist in left palm before the chest
      const m = h.mx.set(p, f.env).m;
      m('shLx', -1.05); m('shLz', -0.48); m('elLx', -1.2); m('elLz', 0);
      m('shRx', -1.05); m('shRz', 0.5); m('elRx', -1.2);
      if (f.emote === 'wave') { m('bodyX', 0.12); m('headX', 0.1); }
    } else if (f.emote === 'skill') {
      // draw across the body from the left hip (0–.25), a rising cut to the right (.25–.45), the
      // blade wheeled round at his right side (.45–.75), and home into the scabbard (.75–1)
      const m = h.mx.set(p, f.env).m;
      const u = f.u;
      const reach = smooth(u / 0.18), cut = smooth((u - 0.24) / 0.16), spin = smooth((u - 0.45) / 0.28), home = smooth((u - 0.78) / 0.18);
      const wheel = Math.sin(WHEEL0 + spin * WHEEL) * 0.15 * (1 - home);
      m('shRx', mix(mix(mix(mix(-0.2, -0.45, reach), -1.85, cut), -1.5 + wheel, spin), -0.4, home));
      m('shRz', mix(mix(mix(mix(-0.1, 0.7, reach), -1.2, cut), -1.35, spin), 0.6, home));
      m('elRx', mix(mix(mix(mix(-0.4, -0.75, reach), -0.15, cut), -0.35, spin), -0.85, home)); m('elRz', 0);
      m('shLx', -0.35 + cut * 0.1); m('shLz', 0.12 + cut * 0.5 * (1 - home)); m('elLx', -0.9);
      m('torsoY', mix(mix(0, 0.45, reach), -0.4, cut) * (1 - home)); m('headY', mix(0.3 * reach, -0.35, cut) * (1 - home));
      m('bodyX', 0.1 + cut * 0.05); m('hipLx', -0.55 * cut); m('knL', 0.5 * cut); m('hipRx', 0.35 * cut); m('knR', 0.2);
      m('bodyY', -0.05 * cut * (1 - home));
    }
  };
  h.onAfter = (f) => {
    const out = f.emote === 'skill' && f.u > 0.2 && f.u < 0.86 && f.env > 0.3;
    drawn.visible = out && !h.holding;
    hilt.visible = !drawn.visible;
    if (drawn.visible) {
      // the blade's line in the body's frame, whatever the arm does: out of the scabbard pointing
      // ahead and low, up and out to the right on the cut, wheeled at his side, and down and back
      // into the scabbard — never across his face or through his hat
      const u = f.u, cut = smooth((u - 0.24) / 0.16), spin = smooth((u - 0.45) / 0.28), home = smooth((u - 0.78) / 0.18);
      if (u < 0.45) bladeDir.copy(D_DRAW).lerp(D_UP, cut);
      else if (u < 0.78) { const a = WHEEL0 + spin * WHEEL; bladeDir.set(-0.3, Math.cos(a), Math.sin(a)); }
      else { const a = WHEEL0 + WHEEL; bladeDir.set(-0.3, Math.cos(a), Math.sin(a)).lerp(D_HOME, home); }
      bladeQ.setFromUnitVectors(DOWN, bladeDir.normalize());
      holdLevel(drawn, h.body, bladeQ, tmpQ);
    }
    // the flash of the cut
    const flash = f.emote === 'skill' ? Math.sin(clamp((f.u - 0.27) / 0.3) * Math.PI) * f.env : 0;
    arc.visible = flash > 0.02;
    arcMat.opacity = flash * 0.45;
    if (arc.visible) arc.rotation.z = 0.5 - smooth((f.u - 0.27) / 0.3) * 0.5;
    const trail = flow.step(Math.min(1.5, f.s.speed * 0.3 + (f.air ? 0.6 : 0) + (f.emote === 'skill' ? f.env * 0.6 : 0)), f.dt);
    veil.rotation.x = veilSpring.step(-Math.min(0.5, f.s.speed * 0.09) + (f.air ? 0.2 : 0), f.dt);
    tasselG.rotation.x = tasselSpring.step(Math.sin(f.phase) * 0.4 * Math.min(1, f.gait), f.dt);
    scarf.update((u, c, s) => {
      const L = 0.6 * u;
      const w = Math.sin(f.t * 6 - u * 6) * 0.05 * u * (0.3 + trail);
      c.set(0.06 + w, 0.9 - L * (1 - trail * 0.6), -0.14 - L * (0.2 + trail * 0.8));
      s.set(1, 0, 0);
    });
  };
  return h;
};
