// 关公 · Lord Guan — broad and tall, the famous red face and phoenix eyes under sweeping brows,
// the long black beard (美髯) on a spring, a green robe over bronze-gold armour, a green 巾帻 cap,
// and the Green Dragon Crescent Blade (青龙偃月刀) held upright at his side. His bow is a slow
// stroke of the beard.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Spring, bothHands, holdLevel, mix, put, type Frame } from './rig';

export const guan: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.28, skin: '#b5493a', robe: '#3f6b54', skirt: '#3a634d', trim: '#b8913f', hair: '#1a1918', sash: '#b8913f', sashTails: false,
    shoe: '#1f1d1c', hem: 0.07, flare: 0.28, sleeve: 'wide', eyes: 'fierce', blush: 0, girth: 1.18, shoulder: 0.19,
  }, { stride: 0.95, runStride: 1.45, bounce: 0.02, armSwing: 0.3, legSwing: 0.5, lean: 0.03 }, 10);
  const hc = h.headC;
  const gold = kit.toon('#b8913f'), green = kit.toon('#3f6b54'), black = kit.toon('#1a1918');

  // green 巾帻 over the head, a knot at the back and two short tails
  put(h.head, kit.mesh(kit.cap(h.headR + 0.02, Math.PI * 0.48, 22, 9), green), 0, hc + 0.005, -0.01, -0.42, 0, 0);
  put(h.head, kit.mesh(kit.sphere(0.07, 1.2, 0.9, 1), green), 0, hc + 0.16, -0.1);
  put(h.head, new THREE.Mesh(kit.box(0.2, 0.025, 0.02), gold), 0, hc + 0.13, 0.12, -0.75, 0, 0);
  const tails = kit.group(h.head, 0, hc + 0.13, -0.16);
  for (const sx of [1, -1]) put(tails, kit.mesh(kit.box(0.045, 0.2, 0.012).translate(0, -0.1, 0), green, OL * 0.5), 0.04 * sx, 0, 0, 0.1, 0, 0.15 * sx);
  const tailSpring = new Spring(26, 4);

  // armour: pauldrons, a round breast mirror (护心镜), a belt plate
  for (const [a, sx] of [[h.armL, 1], [h.armR, -1]] as const) {
    const pd = put(a.sh, kit.mesh(kit.cap(0.1, Math.PI * 0.5, 14, 6), gold), 0.01 * sx, 0.01, 0, 0, 0, -0.35 * sx);
    pd.scale.set(1, 0.7, 1.05);
  }
  put(h.chest, kit.mesh(kit.cyl(0.07, 0.07, 0.02, 20).rotateX(Math.PI / 2), gold, OL * 0.6), 0, 0.14, 0.165);
  put(h.chest, new THREE.Mesh(kit.cyl(0.045, 0.045, 0.024, 20).rotateX(Math.PI / 2), kit.toon('#d8c89a')), 0, 0.14, 0.168);
  put(h.waist, kit.mesh(kit.box(0.16, 0.09, 0.03), gold, OL * 0.6), 0, -0.01, 0.17);

  // the beard: a long flowing mass from the chin, two side locks, and a moustache
  const beard = kit.group(h.head, 0, hc - 0.135, 0.11);
  put(beard, kit.mesh(kit.lathe([[0, -0.42], [0.025, -0.36], [0.06, -0.2], [0.075, -0.06], [0.07, 0.0], [0, 0.03]], 12), black, OL * 0.6), 0, 0, 0.02, 0.18, 0, 0).scale.set(1, 1, 0.55);
  for (const sx of [1, -1]) put(beard, kit.mesh(kit.tube([[0.07 * sx, 0.07, -0.03], [0.08 * sx, -0.05, 0.02], [0.05 * sx, -0.24, 0.05]], 0.02, 0.004, 10, 5), black, OL * 0.5), 0, 0, 0);
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.05 * sx, -0.01, 0], [0.09 * sx, -0.08, -0.02]], 0.011, 0.004, 8, 4), black, OL * 0.4), 0.005 * sx, hc - 0.07, 0.155);
  const beardSpring = new Spring(22, 3.5);
  const beardSide = new Spring(22, 3.5);

  // 青龙偃月刀: a long shaft, a crescent blade with a dragon's mouth, a red tassel
  const blade = kit.group(h.armR.hand, 0, -0.01, 0.03);
  const shaft = kit.toon('#5b2c24');
  put(blade, kit.mesh(kit.cyl(0.018, 0.018, 1.5, 8), shaft, OL * 0.6), 0, 0.3, 0);
  put(blade, kit.mesh(kit.cyl(0.02, 0.008, 0.14, 8), gold, OL * 0.5), 0, -0.47, 0);
  const steel = kit.toon('#d4d8d4');
  const crescent = kit.shape([[0.0, 0.0], [0.08, 0.02], [0.17, 0.12], [0.2, 0.28], [0.16, 0.46], [0.1, 0.52], [0.12, 0.4], [0.1, 0.24], [0.04, 0.12], [-0.02, 0.1]], 0.014, 0.004);
  put(blade, kit.mesh(crescent, steel, OL * 0.6), 0.0, 1.03, 0, 0, Math.PI / 2, 0);
  put(blade, kit.mesh(kit.sphere(0.05, 1.3, 1, 1), green, OL * 0.6), 0, 1.05, 0);
  put(blade, new THREE.Mesh(kit.sphere(0.012), gold), 0.03, 1.08, 0.04);
  put(blade, new THREE.Mesh(kit.sphere(0.012), gold), -0.03, 1.08, 0.04);
  put(blade, kit.mesh(kit.cyl(0.012, 0.004, 0.12, 6), steel, OL * 0.4), 0, 1.15, -0.02);
  const tassel = kit.group(blade, 0, 0.99, 0);
  put(tassel, kit.mesh(kit.cyl(0.006, 0.035, 0.16, 7, 'top'), kit.toon('#b93a2b'), OL * 0.5), 0, 0, 0);
  const tasselSpring = new Spring(22, 3);
  h.handProps.push(blade);

  // when the right hand is needed (rowing, a throw, a seat in the boat, a feature's rod), the
  // blade is slung across his back, its crescent flat against it; otherwise held upright
  const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.12));
  const tmpQ = new THREE.Quaternion();
  let slung = false;
  const sling = (on: boolean) => {
    slung = on;
    if (on) {
      const a = 0.62;
      blade.rotation.set(0, Math.PI / 2, a, 'ZYX');
      blade.position.set(Math.sin(a) * 0.36, -0.04 - Math.cos(a) * 0.36, -0.06);
      h.back.add(blade);
    } else {
      blade.rotation.order = 'XYZ';
      blade.position.set(0, -0.01, 0.03);
      h.armR.hand.add(blade);
    }
    blade.visible = true;
  };

  // his bow, his wave and his eating are one-handed (the left strokes the beard)
  const both = (f: Frame) => (f.emote === 'bow' || f.emote === 'wave' || f.emote === 'eat' ? h.seat : bothHands(f, h.seat));

  h.onPose = (p, f) => {
    // the blade hand stays low at the side, barely swinging — unless both hands are wanted
    const lock = 1 - both(f);
    p.shRx = mix(p.shRx, p.shRx * 0.35, lock); p.shRz = mix(p.shRz, -0.5, lock); p.elRx = mix(p.elRx, -0.55 + p.shRx * 0.3, lock);
    if (f.emote === 'bow' || f.emote === 'wave' || f.emote === 'eat') {
      // 捋须: the left hand strokes down the beard
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      const k = (Math.sin(f.t * 2.2) + 1) / 2;
      m('shLx', -0.95 + k * 0.35); m('shLz', -0.28); m('elLx', -1.75 + k * 0.45); m('elLz', 0);
      m('headX', -0.08); m('headY', 0.15);
      if (f.emote === 'bow') { m('torsoX', 0.2); m('bodyX', 0.03); }
      else m('bodyX', 0);
    }
  };
  h.onAfter = (f) => {
    const want = !!h.holding || both(f) > 0.5;
    if (want !== slung) sling(want);
    // in the hand: upright whatever the arm (and the waist) are doing
    if (!slung) holdLevel(blade, h.body, upright, tmpQ);
    beard.rotation.x = beardSpring.step(-Math.min(0.5, f.s.speed * 0.09) - h.head.rotation.x * 0.8 - (h.body.rotation.x + h.torso.rotation.x) * 0.6 + (f.air ? -0.4 : 0), f.dt);
    beard.rotation.z = beardSide.step(-h.body.rotation.z - h.head.rotation.z, f.dt);
    tails.rotation.x = tailSpring.step(-f.s.speed * 0.12 + Math.sin(f.phase) * 0.1, f.dt);
    tassel.rotation.x = tasselSpring.step((slung ? 0 : -blade.rotation.x * 0.3) + Math.sin(f.phase) * 0.35 * Math.min(1, f.gait), f.dt);
  };
  return h;
};
