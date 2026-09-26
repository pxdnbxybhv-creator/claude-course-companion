// 渔翁 · the Old Fisherman — 斗笠 and 蓑衣 (a shaggy straw cape), a long white beard and white
// brows, a bamboo rod over his shoulder with the line swinging from its tip, and a fish creel
// at his hip. He stoops under the rod and shuffles slowly. Standing, he shades his eyes to read
// the water, strokes his beard, or knocks at his aching back. Casting swings the rod out; his
// skill (撒网) puts the rod on his back, gathers a net at his hip, whirls and throws it — the net
// opens wide in the air and sinks.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Spring, bothHands, clamp, conicalHat, mix, put, sitPose, smooth, strawTex } from './rig';

export const fisher: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.08, skin: '#e6bd95', robe: '#8f7a58', trim: '#5a4632', hair: '#efe9dd', sash: '#6a4f33', sashTails: false,
    pants: '#6d5c45', shoe: '#a2865a', hem: 0.2, flare: 0.21, sleeve: 'narrow', eyes: 'old', brows: '#f4efe4', blush: 0.45,
  }, { stride: 0.6, stoop: 0.2, bounce: 0.014, armSwing: 0.24, legSwing: 0.42, lean: 0.04 }, 3);
  const hc = h.headC;

  // 斗笠
  put(h.head, conicalHat(kit, 0.33, 0.17, '#d6b56c', { knob: true }), 0, hc + 0.11, -0.01, -0.12, 0, 0);

  // 蓑衣: two shaggy tiers of straw over the shoulders
  const straw = kit.toon('#ffffff', { map: strawTex(kit, '#ad9255', 'rgba(84,56,24,0.55)', 40), double: true });
  const tier = (r0: number, r1: number, len: number) =>
    kit.lathe([[r1 - 0.012, -len - 0.004], [r1, -len], [(r0 + r1) / 2 + 0.025, -len * 0.5], [r0, 0], [0, 0.03]], 22);
  const cape1 = put(h.chest, kit.mesh(tier(0.09, 0.25, 0.3), straw, OL * 0.8), 0, 0.33, -0.005);
  const cape2 = put(h.skirt, kit.mesh(tier(0.19, 0.27, 0.22), straw, OL * 0.8), 0, -0.02, -0.01);
  // shaggy fringe: little straw tufts round the hems
  const tuft = kit.cyl(0.0, 0.018, 0.07, 4, 'top');
  const tuftM = kit.toon('#927a45');
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    put(cape1, new THREE.Mesh(tuft, tuftM), Math.sin(a) * 0.245, -0.29, Math.cos(a) * 0.245, Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2);
    put(cape2, new THREE.Mesh(tuft, tuftM), Math.sin(a + 0.17) * 0.265, -0.21, Math.cos(a + 0.17) * 0.265, Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15);
  }

  // the long white beard (and moustache), on a spring
  const white = kit.toon('#f4efe4');
  const beard = kit.group(h.head, 0, hc - 0.1, 0.13);
  put(beard, kit.mesh(kit.lathe([[0.0, -0.26], [0.03, -0.2], [0.065, -0.07], [0.07, 0.0], [0.0, 0.03]], 12), white, OL * 0.8), 0, 0, 0, 0.12, 0, 0);
  const mous = kit.tube([[-0.07, -0.03, 0], [-0.03, 0.01, 0.02], [0, 0.015, 0.025], [0.03, 0.01, 0.02], [0.07, -0.03, 0]], 0.012, 0.012, 12, 5);
  put(h.head, kit.mesh(mous, white, OL * 0.6), 0, hc - 0.06, 0.155);
  const beardSpring = new Spring(35, 5);

  // creel at the hip (a joint of its own, so it swings)
  const creel = kit.group(h.waist, -0.19, -0.08, 0.02);
  creel.rotation.z = 0.15;
  put(creel, kit.mesh(kit.lathe([[0, -0.12], [0.06, -0.12], [0.08, -0.06], [0.06, 0.0], [0.045, 0.02], [0, 0.02]], 14), kit.toon('#b39060'), OL * 0.8), 0, 0, 0);
  put(creel, new THREE.Mesh(kit.torus(0.07, 0.008, 5, 16).rotateX(Math.PI / 2), kit.toon('#6e5230')), 0, -0.05, 0);
  const creelSpring = new Spring(30, 4);

  // the rod: over the right shoulder, the line hanging from the tip
  const bamboo = kit.toon('#9a8048');
  const rod = kit.group();
  put(rod, kit.mesh(kit.tube([[0, 0, 0], [0, 0.6, 0.02], [0, 1.2, 0.08], [0, 1.65, 0.2]], 0.014, 0.005, 16, 5), bamboo, OL * 0.55), 0, -0.18, 0);
  const line = kit.group(rod, 0, 1.47, 0.2);
  put(line, new THREE.Mesh(kit.cyl(0.0022, 0.0022, 0.55, 3, 'top'), kit.toon('#403a32')), 0, 0, 0);
  put(line, new THREE.Mesh(kit.sphere(0.018, 1, 1.4, 1, 8, 6), kit.toon('#c8452f')), 0, -0.4, 0);
  const lineSpring = new Spring(22, 3);
  // his own rod: on the shoulder, or slung across the back while both hands are busy (rowing, a
  // bow, the net); hidden while a feature has lent him its rod (so there are never two)
  h.handProps.push(rod);
  let slung = true;
  const sling = (on: boolean) => {
    slung = on;
    // across the back: centred on the shoulder blades, the line wound up
    if (on) { rod.rotation.set(0, 0, 0.5); rod.position.set(0.12, -0.15, -0.1); h.back.add(rod); }
    else { rod.position.set(0, -0.02, 0.02); h.armR.hand.add(rod); }
    line.visible = !on;
  };
  sling(false);

  // the casting net: a cone of mesh with a weighted rim, flying free of the body once thrown
  const netTex = kit.tex(128, 128, (g, w, hh) => {
    g.clearRect(0, 0, w, hh);
    g.strokeStyle = 'rgba(92,70,44,0.95)'; g.lineWidth = 2.2;
    for (let i = 0; i <= 16; i++) { const x = (i / 16) * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
    for (let j = 0; j <= 8; j++) { const y = (j / 8) * hh; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  const net = kit.group(h.scaler);
  // (no alpha test: the mesh and its weighted rim fade out together as the net sinks)
  const netMat = kit.add(new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  const rimMat = kit.add(new THREE.MeshBasicMaterial({ color: '#4a3a2a', transparent: true, depthWrite: false }));
  put(net, new THREE.Mesh(kit.add(new THREE.ConeGeometry(0.5, 0.32, 20, 1, true).translate(0, -0.16, 0)), netMat), 0, 0, 0);
  put(net, new THREE.Mesh(kit.torus(0.5, 0.012, 4, 28).rotateX(Math.PI / 2), rimMat), 0, -0.32, 0);
  net.visible = false;
  const handW = new THREE.Vector3(), from = new THREE.Vector3();
  let netFrom = false;

  h.fidgets = [
    {
      id: 'shade', dur: 4, pose: (p, k, u) => {
        // a hand over the eyes, looking out over the water, turning slowly
        const m = h.mx.set(p, k).m;
        m('shLx', -1.5); m('shLz', -0.6); m('elLx', -1.6); m('elLz', 0.2);
        m('headX', -0.15); m('headY', mix(0.35, -0.3, smooth(u))); m('bodyX', 0.1);
      },
    },
    {
      id: 'beard', dur: 4, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        const st = (Math.sin(secs * 2) + 1) / 2;
        m('shLx', -0.95 + st * 0.3); m('shLz', -0.3); m('elLx', -1.7 + st * 0.45); m('elLz', 0);
        m('headX', -0.05); m('headY', 0.12);
      },
    },
    {
      id: 'back', dur: 3.2, pose: (p, k, _u, secs) => {
        // knocking the small of his back with a fist, grimacing, straightening a little
        const m = h.mx.set(p, k).m;
        const knock = Math.max(0, Math.sin(secs * 9));
        m('shLx', 0.5 + knock * 0.15); m('shLz', 0.25); m('elLx', -1.4 + knock * 0.3); m('elLz', -0.3);
        m('bodyX', -0.1); m('torsoX', -0.1); m('headX', -0.12); m('headZ', 0.1);
      },
    },
  ];

  const casting = (f: { emote: string | null; env: number }) => (f.emote === 'cast' || f.emote === 'throw' ? f.env : 0);
  const busy = (f: Parameters<typeof bothHands>[0]) => (casting(f) > 0 ? 0 : Math.max(bothHands(f, h.seat), f.emote === 'skill' ? f.env : 0));

  h.onPose = (p, f) => {
    // hold the rod on the shoulder: right hand up by the collar
    const k = 1 - Math.max(casting(f), busy(f));
    p.shRx = p.shRx + (-0.55 - p.shRx) * k; p.shRz = p.shRz + (0.18 - p.shRz) * k; p.elRx = p.elRx + (-1.85 - p.elRx) * k;
    // an old man's shuffle: head pushed a little forward, knees soft
    p.headX += 0.12 * Math.min(1, f.gait); p.knL += 0.08; p.knR += 0.08;
    if (f.emote === 'sleep') {
      // an old man's nap: down on the ground, arms on his knees, chin on his chest under the hat
      const m = h.mx.set(p, f.env).m;
      sitPose(m);
      m('shLx', -0.75); m('shRx', -0.75); m('shLz', -0.12); m('shRz', 0.12); m('elLx', -0.9); m('elRx', -0.9);
      m('torsoX', 0.22); m('headX', 0.45 + Math.sin(f.since * 1.1) * 0.04);
    }
    if (f.emote === 'skill') {
      // 撒网: gather at the right hip, twist, whirl up and fling out wide — then follow through,
      // arms forward and down after the net, a little bow as he watches it sink
      const m = h.mx.set(p, f.env).m;
      const wind = smooth(f.u / 0.3), fling = smooth((f.u - 0.32) / 0.14), after = smooth((f.u - 0.48) / 0.2), rest = smooth((f.u - 0.8) / 0.18);
      const tw = mix(mix(0, 0.6, wind), -0.45, fling) * (1 - after * 0.7) * (1 - rest);
      m('torsoY', tw); m('bodyYaw', tw * 0.3);
      m('shRx', mix(mix(mix(-0.3, -0.9, wind), -1.7, fling), -1.0, after) * (1 - rest) - 0.3 * rest);
      m('shRz', mix(mix(0.2, -0.7, fling), 0.12, after)); m('elRx', mix(mix(-0.9, -0.2, fling), -0.4, after));
      m('shLx', mix(mix(mix(-0.4, -1.0, wind), -1.6, fling), -1.0, after) * (1 - rest) - 0.3 * rest);
      m('shLz', mix(mix(-0.5, 0.7, fling), -0.12, after)); m('elLx', mix(mix(-1.2, -0.2, fling), -0.4, after));
      m('bodyX', mix(mix(0.2, 0.05, fling), 0.14, after)); m('torsoX', 0.12 * after * (1 - rest)); m('headX', mix(mix(0.1, -0.15, fling), 0.18, after));
      m('hipLx', -0.35); m('hipRx', 0.25); m('knL', 0.35 * (1 - fling) + 0.1);
    }
  };
  h.onAfter = (f) => {
    const want = busy(f) > 0.5;
    if (want !== slung) sling(want);
    const castK = casting(f);
    // the rod's pitch in body space (0 = straight up, + = forward): back over the shoulder, or the cast
    const armAngle = h.armR.sh.rotation.x + h.armR.el.rotation.x;
    const wind = Math.min(1, f.u / 0.4), rel = Math.max(0, Math.min(1, (f.u - 0.4) / 0.2));
    const castPitch = -0.6 - 0.6 * wind + 1.9 * rel * rel * (3 - 2 * rel);
    const pitch = -0.95 * (1 - castK) + castPitch * castK;
    if (!slung) {
      rod.rotation.x = pitch - armAngle - h.torso.rotation.x;
      rod.rotation.z = 0.12 * (1 - castK);
    }
    line.rotation.x = lineSpring.step(slung ? -f.s.speed * 0.12 : -(rod.rotation.x + armAngle) - f.s.speed * 0.12, f.dt);
    beard.rotation.x = beardSpring.step(-f.s.speed * 0.08 + (f.air ? -0.4 : 0) - h.head.rotation.x * 0.5, f.dt);
    creel.rotation.x = creelSpring.step(Math.sin(f.phase) * 0.18 * Math.min(1, f.gait), f.dt);

    // the net: bunched in the hands, then flying out, opening, sinking, fading
    const sk = f.emote === 'skill' && f.env > 0.05;
    if (!sk) netFrom = false;
    net.visible = sk && f.u > 0.06 && f.u < 0.97;
    if (net.visible) {
      h.armR.hand.updateWorldMatrix(true, false);
      handW.setFromMatrixPosition(h.armR.hand.matrixWorld);
      h.scaler.updateWorldMatrix(true, false);
      h.scaler.worldToLocal(handW);
      const fly = clamp((f.u - 0.42) / 0.36);
      if (fly <= 0 || !netFrom) {
        netFrom = true;
        from.copy(handW);
        net.position.copy(handW);
        net.scale.setScalar(0.22);
        net.rotation.set(0.4, f.t * 3, 0);
      } else {
        const e = smooth(fly);
        // out to ~2 m in front (the figure's +z), up in an arc and down to the ground
        net.position.set(mix(from.x, 0.1, e), mix(from.y, 0.35, e) + Math.sin(fly * Math.PI) * 0.55, mix(from.z, 1.9, e));
        const open = 0.22 + smooth(fly * 1.6) * 1.35;
        net.scale.set(open, mix(0.8, 0.35, e), open);
        net.rotation.set(0, f.t * 2.2, 0);
      }
      netMat.opacity = rimMat.opacity = 1 - smooth((f.u - 0.8) / 0.16);
    }
  };
  return h;
};
