// 关公 · Lord Guan — broad and tall, the famous red face and phoenix eyes under sweeping brows,
// the long black beard (美髯) on a spring, a green robe over bronze-gold armour, a green 巾帻 cap,
// a crimson cape, and the Green Dragon Crescent Blade (青龙偃月刀) held upright at his side. He
// strides heavily — a dip at every footfall, the shoulders rolling, the cape swinging. Standing,
// he strokes his beard, sets a fist on his hip and looks far off, or grounds the glaive with a
// thump. His bow is a slow stroke of the beard; his skill (赤兔) raises the glaive high with a
// shout and stamps.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, clamp, damp, holdLevel, mix, put, smooth, type Frame } from './rig';

export const guan: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.28, skin: '#bb4632', robe: '#2f7552', skirt: '#2b6a4b', trim: '#cda146', hair: '#1a1918', sash: '#cda146', sashTails: false,
    shoe: '#1f1a17', hem: 0.07, flare: 0.28, sleeve: 'wide', eyes: 'fierce', blush: 0, girth: 1.18, shoulder: 0.19,
  }, { stride: 1.02, runStride: 1.5, bounce: 0.012, armSwing: 0.3, legSwing: 0.5, lean: 0.03 }, 10);
  const hc = h.headC;
  const gold = kit.toon('#cda146'), green = kit.toon('#2f7552'), black = kit.toon('#1a1918');

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
  put(h.chest, new THREE.Mesh(kit.cyl(0.045, 0.045, 0.024, 20).rotateX(Math.PI / 2), kit.toon('#f0dca0')), 0, 0.14, 0.168);
  put(h.waist, kit.mesh(kit.box(0.16, 0.09, 0.03), gold, OL * 0.6), 0, -0.01, 0.17);

  // the beard: a long flowing mass from the chin, two side locks, and a moustache
  const beard = kit.group(h.head, 0, hc - 0.135, 0.11);
  put(beard, kit.mesh(kit.lathe([[0, -0.42], [0.025, -0.36], [0.06, -0.2], [0.075, -0.06], [0.07, 0.0], [0, 0.03]], 12), black, OL * 0.6), 0, 0, 0.02, 0.18, 0, 0).scale.set(1, 1, 0.55);
  for (const sx of [1, -1]) put(beard, kit.mesh(kit.tube([[0.07 * sx, 0.07, -0.03], [0.08 * sx, -0.05, 0.02], [0.05 * sx, -0.24, 0.05]], 0.02, 0.004, 10, 5), black, OL * 0.5), 0, 0, 0);
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.05 * sx, -0.01, 0], [0.09 * sx, -0.08, -0.02]], 0.011, 0.004, 8, 4), black, OL * 0.4), 0.005 * sx, hc - 0.07, 0.155);
  const beardSpring = new Spring(22, 3.5);
  const beardSide = new Spring(22, 3.5);

  // the cape: crimson, from the shoulders to the calves, swinging with the stride
  const cape = new Ribbon(kit, '#98281f', 12, (u) => 0.26 + Math.sqrt(u) * 0.22);
  cape.face = new THREE.Vector3(0, 0, 1);
  h.body.add(cape.mesh);
  const capeFlow = new Spring(14, 4.5);
  const capeSwing = new Spring(20, 3);

  // 青龙偃月刀: a long shaft, a crescent blade with a dragon's mouth, a red tassel
  const blade = kit.group(h.armR.hand, 0, -0.01, 0.03);
  const shaft = kit.toon('#6a2f22');
  put(blade, kit.mesh(kit.cyl(0.018, 0.018, 1.5, 8), shaft, OL * 0.6), 0, 0.3, 0);
  put(blade, kit.mesh(kit.cyl(0.02, 0.008, 0.14, 8), gold, OL * 0.5), 0, -0.47, 0);
  const steel = kit.toon('#dfe0d8');
  const crescent = kit.shape([[0.0, 0.0], [0.08, 0.02], [0.17, 0.12], [0.2, 0.28], [0.16, 0.46], [0.1, 0.52], [0.12, 0.4], [0.1, 0.24], [0.04, 0.12], [-0.02, 0.1]], 0.014, 0.004);
  put(blade, kit.mesh(crescent, steel, OL * 0.6), 0.0, 1.03, 0, 0, Math.PI / 2, 0);
  put(blade, kit.mesh(kit.sphere(0.05, 1.3, 1, 1), green, OL * 0.6), 0, 1.05, 0);
  put(blade, new THREE.Mesh(kit.sphere(0.012), gold), 0.03, 1.08, 0.04);
  put(blade, new THREE.Mesh(kit.sphere(0.012), gold), -0.03, 1.08, 0.04);
  put(blade, kit.mesh(kit.cyl(0.012, 0.004, 0.12, 6), steel, OL * 0.4), 0, 1.15, -0.02);
  const tassel = kit.group(blade, 0, 0.99, 0);
  put(tassel, kit.mesh(kit.cyl(0.006, 0.035, 0.16, 7, 'top'), kit.toon('#c23b2b'), OL * 0.5), 0, 0, 0);
  const tasselSpring = new Spring(22, 3);
  h.handProps.push(blade);

  // when the right hand is needed (rowing, a throw, a seat in the boat, a feature's rod), the
  // blade is slung across his back, its crescent flat against it; otherwise held upright
  const upright = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.12));
  const raised = new THREE.Quaternion(), eul = new THREE.Euler();
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

  // his bow, his wave and his eating are one-handed (the left strokes the beard); he builds with
  // the glaive itself, driving its butt down like a rammer
  h.ownBuild = true;
  // astride Red Hare (his skill seats him on the horse): the glaive stays in his hand then
  let horse = false, wasRiding = false, skillAt = -99, rideV = 0;
  const lastW = new THREE.Vector3(), nowW = new THREE.Vector3();
  let hadW = false;
  const both = (f: Frame) => (f.emote === 'bow' || f.emote === 'wave' || f.emote === 'eat' || f.emote === 'build' ? h.seat : horse ? 0 : bothHands(f, h.seat));
  const stroke = (p: Parameters<NonNullable<typeof h.onPose>>[0], k: number, t: number) => {
    const m = h.mx.set(p, k).m;
    const s = (Math.sin(t * 2.2) + 1) / 2;
    m('shLx', -0.95 + s * 0.35); m('shLz', -0.28); m('elLx', -1.75 + s * 0.45); m('elLz', 0);
    m('headX', -0.08); m('headY', 0.15);
  };

  h.fidgets = [
    { id: 'beard', dur: 4.4, pose: (p, k, _u, secs) => stroke(p, k, secs) },
    {
      id: 'gaze', dur: 4, pose: (p, k, u) => {
        // left fist on the hip, chin up, looking far off
        const m = h.mx.set(p, k).m;
        m('shLx', 0.15); m('shLz', 0.75); m('elLx', -1.5); m('elLz', -0.6);
        m('headX', -0.12); m('headY', mix(-0.4, 0.2, smooth(u))); m('bodyX', -0.03); m('torsoY', 0.08);
      },
    },
    {
      id: 'ground', dur: 3, pose: (p, k, u) => {
        // lift the glaive a hand's breadth and ground it: thump
        const m = h.mx.set(p, k).m;
        const lift = Math.sin(clamp((u - 0.15) / 0.4) * Math.PI);
        m('shRx', -0.35 - lift * 0.3); m('elRx', -0.6 - lift * 0.5);
        m('bodyY', -0.02 * (u > 0.5 && u < 0.62 ? 1 : 0)); m('headX', -0.08);
      },
    },
  ];

  h.onPose = (p, f) => {
    // on the horse? (the core says so through s.mount; failing that, a ride that begins within a
    // few seconds of his own skill is Red Hare, not a boat or a bench)
    if (f.emote === 'skill') skillAt = f.t;
    if (f.s.riding && !wasRiding) horse = f.s.mount === 'horse' || (f.s.mount === undefined && f.t - skillAt < 3.6);
    if (!f.s.riding) horse = false;
    else if (f.s.mount === 'horse') horse = true;
    wasRiding = f.s.riding;
    // how fast the horse carries him (the core reports no speed while he rides)
    h.root.getWorldPosition(nowW);
    const v = hadW && f.dt > 0 ? Math.min(12, nowW.distanceTo(lastW) / f.dt) : 0;
    lastW.copy(nowW); hadW = true;
    rideV = horse ? damp(rideV, v, 4, f.dt) : 0;
    // the blade hand stays low at the side, barely swinging — unless both hands are wanted
    const lock = 1 - both(f);
    p.shRx = mix(p.shRx, p.shRx * 0.35, lock); p.shRz = mix(p.shRz, -0.5, lock); p.elRx = mix(p.elRx, -0.55 + p.shRx * 0.3, lock);
    // the heavy stride: a dip at each footfall, the shoulders rolling
    const g = Math.min(1, f.gait);
    p.bodyY -= Math.pow(Math.abs(Math.sin(f.phase)), 6) * 0.035 * g;
    p.torsoZ += Math.sin(f.phase) * 0.05 * g; p.bodyZ -= Math.sin(f.phase) * 0.02 * g;
    if (f.emote === 'bow' || f.emote === 'wave' || f.emote === 'eat') {
      // 捋须: the left hand strokes down the beard
      stroke(p, f.env, f.t);
      const m = h.mx.set(p, f.env).m;
      if (f.emote === 'bow') { m('torsoX', 0.2); m('bodyX', 0.03); } else m('bodyX', 0);
    } else if (f.emote === 'build') {
      // ramming: both hands on the shaft, heave up, drive down — thump
      const m = h.mx.set(p, f.env).m;
      const c = (f.since * 1.9) % 1, ram = c < 0.6 ? smooth(c / 0.6) : 1 - smooth((c - 0.6) / 0.12);
      m('shRx', -0.55 - ram * 0.75); m('shRz', -0.2); m('elRx', -0.9 + ram * 0.35);
      m('shLx', -0.9 - ram * 0.8); m('shLz', -0.45); m('elLx', -0.8 + ram * 0.3); m('elLz', 0);
      m('torsoX', 0.1 - ram * 0.12); m('bodyY', -0.03 * (1 - ram)); m('knL', 0.25 * (1 - ram)); m('knR', 0.25 * (1 - ram)); m('headX', 0.12);
    } else if (f.emote === 'skill') {
      // the glaive raised high (0–.3) with a shout, held (.3–.65), then brought down and a stamp
      const m = h.mx.set(p, f.env).m;
      const up = smooth(f.u / 0.25) * (1 - smooth((f.u - 0.66) / 0.14));
      const stamp = f.u > 0.66 ? Math.sin(clamp((f.u - 0.66) / 0.2) * Math.PI) : 0;
      m('shRx', mix(-0.3, -2.75, up)); m('shRz', mix(-0.5, -0.3, up)); m('elRx', mix(-0.6, -0.15, up));
      m('shLx', 0.15); m('shLz', 0.75); m('elLx', -1.5); m('elLz', -0.6);
      m('headX', -0.22 * up); m('torsoX', -0.08 * up); m('bodyX', -0.03 * up);
      m('hipLx', -0.9 * stamp); m('knL', 1.2 * stamp); m('bodyY', -0.03 * (f.u > 0.82 && f.u < 0.9 ? 1 : 0));
    }
    if (horse && h.seat > 0) {
      // astride: thighs over the horse's barrel, shins down its flanks, the robe spread over the
      // saddle; the left hand on the reins, the right holding the glaive; a rise and fall with the
      // horse's stride, a lean into the gallop
      const m = h.mx.set(p, h.seat).m;
      const gal = Math.min(1, rideV / 8), bob = Math.sin(f.t * (5 + gal * 6)) * (0.008 + gal * 0.025);
      m('bodyY', -(0.36 - 0.05) + bob); m('bodyX', 0.03 + gal * 0.16); m('bodyZ', 0);
      m('hipLx', -0.75); m('hipRx', -0.75); m('hipLz', 0.62); m('hipRz', -0.62); m('knL', 1.05); m('knR', 1.05);
      m('skX', -0.08); m('skS', 0.6); m('skF', 1.5); m('skZ', 0);
      m('shLx', -0.85 + bob * 3); m('shLz', -0.28); m('elLx', -0.85); m('elLz', 0.1);
      m('shRx', -0.75); m('shRz', -0.4); m('elRx', -0.95);
      m('torsoX', -0.02 - gal * 0.04); m('torsoY', 0); m('headX', -0.06 - gal * 0.08); m('headY', 0);
    }
  };
  h.onAfter = (f) => {
    const want = !!h.holding || both(f) > 0.5;
    if (want !== slung) sling(want);
    // in the hand: upright whatever the arm (and the waist) are doing; tipped forward when raised
    const sk = f.emote === 'skill' ? smooth(f.u / 0.25) * (1 - smooth((f.u - 0.66) / 0.14)) * f.env : 0;
    if (!slung) {
      if (horse && h.seat > 0.3) holdLevel(blade, h.body, raised.setFromEuler(eul.set(0.25 + Math.min(1, rideV / 8) * 0.25, 0, 0.18)), tmpQ);
      else holdLevel(blade, h.body, sk > 0 ? raised.copy(upright).slerp(tmpQ.setFromEuler(eul.set(0.35, 0, -0.35)), sk) : upright, tmpQ);
    }
    // the shout
    if (f.emote === 'skill' && f.u > 0.18 && f.u < 0.5) { h.talkMouth.visible = true; h.talkMouth.scale.set(1.3, 1.7, 1); }
    beard.rotation.x = beardSpring.step(-Math.min(0.5, f.s.speed * 0.09) - h.head.rotation.x * 0.8 - (h.body.rotation.x + h.torso.rotation.x) * 0.6 + (f.air ? -0.4 : 0), f.dt);
    beard.rotation.z = beardSide.step(-h.body.rotation.z - h.head.rotation.z, f.dt);
    tails.rotation.x = tailSpring.step(-f.s.speed * 0.12 + Math.sin(f.phase) * 0.1, f.dt);
    tassel.rotation.x = tasselSpring.step((slung ? 0 : -blade.rotation.x * 0.3) + Math.sin(f.phase) * 0.35 * Math.min(1, f.gait), f.dt);
    // the cape: out behind with speed (and the skill's gust), swinging with the stride
    const out = capeFlow.step(Math.min(1.3, f.s.speed * 0.25 + rideV * 0.15 + (f.air ? 0.5 : 0) + sk * 0.6), f.dt);
    const sw = capeSwing.step(Math.sin(f.phase) * 0.12 * Math.min(1, f.gait) - h.body.rotation.z, f.dt);
    const t = f.t;
    cape.update((u, c, s) => {
      const L = 0.6 * u;
      const wv = Math.sin(t * 3.2 - u * 4) * 0.03 * u * (0.4 + out);
      c.set(sw * u * 0.5 + wv, 0.88 - L * (1 - out * 0.5), -0.19 - 0.05 * u - L * (0.1 + out * 0.8) - Math.abs(wv) * 0.3);
      // a ripple across the cloth as it swings (so it is never a flat board)
      const tw = Math.sin(t * 2.4 - u * 3) * 0.3 * u * (0.3 + out) + sw * u;
      s.set(Math.cos(tw), 0, Math.sin(tw));
    });
  };
  return h;
};
