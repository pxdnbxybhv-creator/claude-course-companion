// 诗仙 · the Poet Immortal (Li Bai) — a loose white robe open at the collar, a long hair ribbon,
// cheeks pink with wine, eyes happily shut, a wine gourd on a red cord swinging at his hip. He
// sways as he walks; "eating" is a long pull from the gourd, head thrown back.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, put } from './rig';

export const poet: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.15, skin: '#f1d4ba', robe: '#f1f1ec', skirt: '#dfe6e8', trim: '#7a96ab', hair: '#221f1d', sash: '#3d5a73', sashTails: true,
    shoe: '#2b2926', hem: 0.05, flare: 0.28, sleeve: 'long', eyes: 'sleepy', blush: 0.9, mouth: 'smile',
  }, { stride: 0.82, sway: 0.075, armSwing: 0.5, bounce: 0.03 }, 9);
  const hc = h.headC;
  const hair = kit.toon('#221f1d');

  // a loose top-knot with a long ribbon, a few stray locks
  put(h.head, kit.mesh(kit.sphere(0.07, 1, 1.2, 1), hair), 0, hc + 0.2, -0.04, -0.2, 0, 0.1);
  put(h.head, new THREE.Mesh(kit.torus(0.05, 0.012, 6, 14).rotateX(Math.PI / 2), kit.toon('#7a96ab')), 0, hc + 0.16, -0.04);
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.02 * sx, -0.08, 0.01], [0.0, -0.16, 0.03]], 0.014, 0.004, 8, 4), hair, OL * 0.4), 0.13 * sx, hc + 0.06, 0.08);
  const rib = new Ribbon(kit, '#7a96ab', 9, (u) => 0.04 * (1 - u * 0.3));
  h.head.add(rib.mesh);
  rib.twist = 1.6;
  const flow = new Spring(24, 5);

  // moustache & goatee
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.035 * sx, -0.005, 0], [0.06 * sx, -0.035, -0.01]], 0.007, 0.003, 8, 4), hair, OL * 0.4), 0.004 * sx, hc - 0.05, 0.158);
  put(h.head, kit.mesh(kit.lathe([[0, -0.08], [0.014, -0.05], [0.02, 0.0], [0, 0.01]], 8), hair, OL * 0.4), 0, hc - 0.115, 0.14, 0.25, 0, 0);

  // open collar: a triangle of skin
  put(h.chest, new THREE.Mesh(kit.cyl(0.001, 0.05, 0.1, 3), kit.toon('#f1d4ba')), 0, 0.28, 0.1, -0.35, Math.PI, 0);

  // the wine gourd on a red cord
  const gourdM = kit.toon('#c08c45');
  const gourd = kit.group(h.waist, 0.17, -0.02, 0.06);
  put(gourd, new THREE.Mesh(kit.cyl(0.003, 0.003, 0.07, 3, 'top'), kit.toon('#b93a2b')), 0, 0, 0);
  put(gourd, kit.mesh(kit.sphere(0.05), gourdM), 0, -0.14, 0);
  put(gourd, kit.mesh(kit.sphere(0.033), gourdM), 0, -0.075, 0);
  put(gourd, new THREE.Mesh(kit.torus(0.02, 0.006, 5, 10).rotateX(Math.PI / 2), kit.toon('#b93a2b')), 0, -0.105, 0);
  put(gourd, kit.mesh(kit.cyl(0.01, 0.012, 0.03, 6), kit.toon('#6b4a2a'), OL * 0.5), 0, -0.035, 0);
  const gSpring = new Spring(30, 3.5);
  const cup = kit.group(h.armL.hand, 0, -0.035, 0.02);
  put(cup, kit.mesh(kit.lathe([[0, 0], [0.028, 0.005], [0.035, 0.03], [0.03, 0.03], [0, 0.012]], 12), kit.toon('#e9e2cf', { double: true }), OL * 0.5), 0, 0, 0);
  cup.rotation.x = -1.2;
  let inHand = false;
  const hip = () => { gourd.position.set(0.17, -0.02, 0.06); gourd.rotation.set(0, 0, 0); h.waist.add(gourd); };
  const hand = () => { gourd.position.set(0, -0.02, 0.06); gourd.rotation.set(Math.PI - 0.4, 0, 0); h.armR.hand.add(gourd); };

  h.onPose = (p, f) => {
    // the cup hand is held up a little, as if toasting the moon
    p.shLx = Math.min(p.shLx, -0.25); p.elLx = Math.min(p.elLx, -0.9);
    if (f.emote === 'eat') {
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      m('shRx', -2.3); m('shRz', 0.35); m('elRx', -1.1);
      // head thrown back from the waist, not tipped over at the heels
      m('headX', -0.4); m('torsoX', -0.16); m('bodyX', -0.04); m('shLz', 0.5);
    }
  };
  h.onAfter = (f) => {
    const drink = f.emote === 'eat' && f.env > 0.5;
    if (drink !== inHand) { inHand = drink; if (drink) hand(); else hip(); }
    if (!inHand) gourd.rotation.x = gSpring.step(Math.sin(f.phase) * 0.45 * Math.min(1, f.gait) - h.body.rotation.x, f.dt);
    gourd.rotation.z = inHand ? 0 : -h.body.rotation.z;
    const trail = flow.step(Math.min(1.3, f.s.speed * 0.3 + (f.air ? 0.6 : 0)), f.dt);
    rib.update((u, c, s) => {
      const L = 0.5 * u;
      const w = Math.sin(f.t * 3 - u * 5) * 0.05 * u * (0.5 + trail);
      c.set(w, hc + 0.16 - L * (1 - trail * 0.6), -0.1 - L * (0.2 + trail * 0.75));
      s.set(Math.cos(u * 1.5), 0, Math.sin(u * 1.5) * 0.5).normalize();
    });
  };
  return h;
};
