// 诗仙 · the Poet Immortal (Li Bai) — a loose warm-white robe open at the collar, a long azure hair
// ribbon, cheeks pink with wine, eyes happily shut, a wine gourd on a red cord swinging at his hip
// and a little cup in his left hand. He sways as he walks and now and then lurches a step. Standing,
// he sips from the gourd, raises the cup to the moon and declaims, or hiccups. "Eating" is a long
// pull from the gourd; his skill (斗酒) drinks deep, then flings the cup up to the moon.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, clamp, put, smooth, type Pose } from './rig';

export const poet: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.15, skin: '#f2d0b0', robe: '#f6ecda', skirt: '#ecdcc0', trim: '#3f79a0', hair: '#221f1d', sash: '#2f5f7a', sashTails: true,
    shoe: '#3a2c22', hem: 0.05, flare: 0.28, sleeve: 'long', eyes: 'sleepy', blush: 1, mouth: 'smile',
  }, { stride: 0.82, sway: 0.085, armSwing: 0.5, bounce: 0.03 }, 9);
  const hc = h.headC;
  const hair = kit.toon('#221f1d');

  // a loose top-knot with a long ribbon, a few stray locks
  put(h.head, kit.mesh(kit.sphere(0.07, 1, 1.2, 1), hair), 0, hc + 0.2, -0.04, -0.2, 0, 0.1);
  put(h.head, new THREE.Mesh(kit.torus(0.05, 0.012, 6, 14).rotateX(Math.PI / 2), kit.toon('#3f79a0')), 0, hc + 0.16, -0.04);
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.02 * sx, -0.08, 0.01], [0.0, -0.16, 0.03]], 0.014, 0.004, 8, 4), hair, OL * 0.4), 0.13 * sx, hc + 0.06, 0.08);
  const rib = new Ribbon(kit, '#4a88b2', 9, (u) => 0.04 * (1 - u * 0.3));
  h.head.add(rib.mesh);
  rib.twist = 1.6;
  const flow = new Spring(24, 5);

  // moustache & goatee
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.035 * sx, -0.005, 0], [0.06 * sx, -0.035, -0.01]], 0.007, 0.003, 8, 4), hair, OL * 0.4), 0.004 * sx, hc - 0.05, 0.158);
  put(h.head, kit.mesh(kit.lathe([[0, -0.08], [0.014, -0.05], [0.02, 0.0], [0, 0.01]], 8), hair, OL * 0.4), 0, hc - 0.115, 0.14, 0.25, 0, 0);

  // open collar: a triangle of skin
  put(h.chest, new THREE.Mesh(kit.cyl(0.001, 0.05, 0.1, 3), kit.toon('#f2d0b0')), 0, 0.28, 0.1, -0.35, Math.PI, 0);

  // the wine gourd on a red cord
  const gourdM = kit.toon('#cf9446');
  const gourd = kit.group(h.waist, 0.17, -0.02, 0.06);
  put(gourd, new THREE.Mesh(kit.cyl(0.003, 0.003, 0.07, 3, 'top'), kit.toon('#c23b2b')), 0, 0, 0);
  put(gourd, kit.mesh(kit.sphere(0.05), gourdM), 0, -0.14, 0);
  put(gourd, kit.mesh(kit.sphere(0.033), gourdM), 0, -0.075, 0);
  put(gourd, new THREE.Mesh(kit.torus(0.02, 0.006, 5, 10).rotateX(Math.PI / 2), kit.toon('#c23b2b')), 0, -0.105, 0);
  put(gourd, kit.mesh(kit.cyl(0.01, 0.012, 0.03, 6), kit.toon('#6e4526'), OL * 0.5), 0, -0.035, 0);
  const gSpring = new Spring(30, 3.5);
  const cup = kit.group(h.armL.hand, 0, -0.035, 0.02);
  put(cup, kit.mesh(kit.lathe([[0, 0], [0.028, 0.005], [0.035, 0.03], [0.03, 0.03], [0, 0.012]], 12), kit.toon('#f2e6c8', { double: true }), OL * 0.5), 0, 0, 0);
  cup.rotation.x = -1.2;
  let inHand = false;
  const hip = () => { gourd.position.set(0.17, -0.02, 0.06); gourd.rotation.set(0, 0, 0); h.waist.add(gourd); };
  const hand = () => { gourd.position.set(0, -0.02, 0.06); gourd.rotation.set(Math.PI - 0.4, 0, 0); h.armR.hand.add(gourd); };
  // the drunken lurch: every so often a step goes astray
  let lurch = 0;

  const drink = (m: (k: keyof Pose, v: number) => void, deep: number) => {
    m('shRx', -2.3); m('shRz', 0.35); m('elRx', -1.1);
    m('headX', -0.4 * deep); m('torsoX', -0.16 * deep); m('bodyX', -0.04 * deep); m('shLz', 0.5);
  };
  h.fidgets = [
    { id: 'sip', dur: 3, pose: (p, k, u) => drink(h.mx.set(p, k * Math.sin(clamp(u / 0.9) * Math.PI)).m, 0.7) },
    {
      id: 'toast', dur: 4.2, mouth: true, pose: (p, k, _u, secs) => {
        // the cup up to the moon, the other arm flung wide, declaiming
        const m = h.mx.set(p, k).m;
        m('shLx', -2.5); m('shLz', 0.35); m('elLx', -0.35);
        m('shRx', -0.6); m('shRz', -1.0 + Math.sin(secs * 1.6) * 0.2); m('elRx', -0.3);
        m('headX', -0.35); m('headZ', -0.1); m('torsoX', -0.08);
      },
    },
    {
      id: 'hiccup', dur: 2.6, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        const hic = Math.pow(Math.max(0, Math.sin(secs * 4.2)), 8);
        m('bodyY', hic * 0.04); m('shLz', 0.2 + hic * 0.3); m('shRz', -0.2 - hic * 0.3); m('headX', -0.1 * hic);
        m('shRx', -0.9); m('elRx', -1.6); // a hand to the mouth
      },
    },
  ];

  h.onPose = (p, f) => {
    // the cup hand is held up a little, as if toasting the moon
    p.shLx = Math.min(p.shLx, -0.25); p.elLx = Math.min(p.elLx, -0.9);
    // now and then a step goes astray: a lurch to one side, caught with a flail of the arm
    if (f.gait > 0.3 && !f.air && !f.reduced) {
      if (lurch <= 0 && Math.sin(f.phase * 0.08) > 0.998) lurch = 1;
    }
    if (lurch > 0) {
      lurch = Math.max(0, lurch - f.dt * 1.6);
      const k = Math.sin(lurch * Math.PI);
      p.bodyZ += k * 0.12; p.headZ -= k * 0.15; p.shRz -= k * 0.8; p.hipRz -= k * 0.2;
    }
    if (f.emote === 'eat') drink(h.mx.set(p, f.env).m, 1);
    else if (f.emote === 'skill') {
      // 斗酒: a deep pull (0–.45), then the cup flung up to the moon, head back, laughing
      const d = 1 - smooth((f.u - 0.4) / 0.12);
      if (d > 0) drink(h.mx.set(p, f.env * d).m, 1);
      const up = smooth((f.u - 0.45) / 0.15) * f.env;
      const mu = h.mx.set(p, up).m;
      mu('shLx', -2.8); mu('shLz', 0.2); mu('elLx', -0.15);
      mu('shRx', -0.4); mu('shRz', -1.3 + Math.sin(f.t * 3) * 0.15); mu('elRx', -0.2);
      mu('headX', -0.5); mu('torsoX', -0.18); mu('bodyZ', Math.sin(f.t * 2.2) * 0.08);
    }
  };
  h.onAfter = (f) => {
    const drinking = (f.emote === 'eat' && f.env > 0.5) || (f.emote === 'skill' && f.env > 0.5 && f.u < 0.44) || (f.fidget === 'sip' && f.fk > 0.5);
    if (drinking !== inHand) { inHand = drinking; if (drinking) hand(); else hip(); }
    if (!inHand) gourd.rotation.x = gSpring.step(Math.sin(f.phase) * 0.45 * Math.min(1, f.gait) - h.body.rotation.x, f.dt);
    gourd.rotation.z = inHand ? 0 : -h.body.rotation.z;
    const sk = f.emote === 'skill' ? f.env : 0;
    const trail = flow.step(Math.min(1.3, f.s.speed * 0.3 + (f.air ? 0.6 : 0) + sk * 0.5), f.dt);
    rib.update((u, c, s) => {
      const L = 0.5 * u;
      const w = Math.sin(f.t * 3 - u * 5) * 0.05 * u * (0.5 + trail);
      c.set(w, hc + 0.16 - L * (1 - trail * 0.6), -0.1 - L * (0.2 + trail * 0.75));
      s.set(Math.cos(u * 1.5), 0, Math.sin(u * 1.5) * 0.5).normalize();
    });
  };
  return h;
};
