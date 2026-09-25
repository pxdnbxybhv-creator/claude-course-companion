// 棋士 · the Board-game Master — a celadon robe and a 纶巾 scarf-cap, a neat long moustache and
// goatee, a go board slung on his back (a stone pot tied on top) and a folding fan tucked at the
// back of his collar. He walks with his hands clasped behind him, turning a stone in his fingers.
// Standing, he fans himself, holds a stone up to the light and flips it, or ponders with his chin
// in his hand. Playing, he taps his chin with the fan over a move; his skill (推演) takes a stone
// and sets it — click — on the empty air, where a board's lines glow round it for a moment.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, clamp, mix, put, smooth, type Pose } from './rig';

export const player: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.13, skin: '#f0d3b4', robe: '#739c8c', trim: '#2e3a35', hair: '#221f1c', sash: '#b98f45',
    shoe: '#2a221c', hem: 0.07, sleeve: 'wide', eyes: 'dot', brows: '#221f1c', blush: 0.4,
  }, { stride: 0.78, armSwing: 0.05, bounce: 0.018, lean: 0.02 }, 8);
  const hc = h.headC;
  const dark = kit.toon('#2e3a35');

  // 纶巾: a soft square cap and two ties
  put(h.head, kit.mesh(kit.cap(h.headR + 0.016, Math.PI * 0.5, 20, 8), dark), 0, hc + 0.01, -0.01, -0.28, 0, 0);
  put(h.head, kit.mesh(kit.box(0.17, 0.13, 0.15), dark, OL * 0.8), 0, hc + 0.19, -0.03, -0.12, 0, 0);
  const ties = [new Ribbon(kit, '#2e3a35', 6, () => 0.035), new Ribbon(kit, '#2e3a35', 6, () => 0.035)];
  for (const r of ties) h.head.add(r.mesh);
  ties.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });

  // moustache and goatee
  const hairM = kit.toon('#221f1c');
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.04 * sx, -0.01, 0], [0.07 * sx, -0.05, -0.01]], 0.008, 0.003, 8, 4), hairM, OL * 0.4), 0.005 * sx, hc - 0.055, 0.158);
  const goatee = kit.group(h.head, 0, hc - 0.13, 0.13);
  put(goatee, kit.mesh(kit.lathe([[0, -0.13], [0.018, -0.08], [0.025, 0.0], [0, 0.01]], 8), hairM, OL * 0.4), 0, 0, 0, 0.2, 0, 0);
  const gSpring = new Spring(30, 4);

  // the go board on his back, a stone pot tied on
  const grid = kit.tex(128, 128, (g, w) => {
    g.fillStyle = '#e0b775'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(60,36,16,0.8)'; g.lineWidth = 1;
    for (let i = 0; i < 13; i++) { const x = 8 + i * (112 / 12); g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 120); g.moveTo(8, x); g.lineTo(120, x); g.stroke(); }
    g.fillStyle = '#1b1916';
    for (const [x, y] of [[3, 3], [9, 9], [3, 9], [9, 3], [6, 6]]) { g.beginPath(); g.arc(8 + x * (112 / 12), 8 + y * (112 / 12), 2.2, 0, Math.PI * 2); g.fill(); }
  });
  const wood = kit.toon('#c49656');
  const board = kit.group(h.back, 0, -0.06, -0.06);
  board.rotation.set(-Math.PI / 2, 0, 0);
  // (one wooden block and a painted face on top: a six-material box would cost six draws)
  put(board, kit.mesh(kit.box(0.3, 0.06, 0.3), wood, OL * 0.8), 0, 0, 0);
  put(board, new THREE.Mesh(kit.add(new THREE.PlaneGeometry(0.29, 0.29).rotateX(-Math.PI / 2)), kit.toon('#ffffff', { map: grid })), 0, 0.0305, 0);
  put(board, kit.mesh(kit.lathe([[0, 0], [0.05, 0], [0.058, 0.04], [0.045, 0.07], [0, 0.075]], 12), kit.toon('#8a5a32'), OL * 0.6), 0.07, -0.06, 0.1, Math.PI, 0, 0);

  // the fan: at the back of the collar, or open in the right hand
  const fanTex = kit.tex(128, 64, (g, w, hh) => {
    g.fillStyle = '#f5ecd8'; g.fillRect(0, 0, w, hh);
    g.fillStyle = 'rgba(47,111,126,0.45)';
    g.beginPath(); g.moveTo(0, hh); g.lineTo(30, 20); g.lineTo(52, 42); g.lineTo(78, 12); g.lineTo(128, hh); g.fill();
    g.fillStyle = 'rgba(34,26,20,0.5)';
    g.beginPath(); g.moveTo(40, hh); g.lineTo(62, 34); g.lineTo(90, hh); g.fill();
    g.fillStyle = 'rgba(190,58,43,0.9)'; g.fillRect(100, 10, 7, 7);
    g.strokeStyle = 'rgba(34,26,20,0.2)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(w / 2, hh * 1.6); g.lineTo(i * (w / 13), 0); g.stroke(); }
  });
  const fanPts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const a = -1.1 + (2.2 * i) / 12; fanPts.push([Math.sin(a) * 0.2, Math.cos(a) * 0.2]); }
  for (let i = 12; i >= 0; i--) { const a = -1.1 + (2.2 * i) / 12; fanPts.push([Math.sin(a) * 0.07, Math.cos(a) * 0.07]); }
  const fanGeo = kit.shape(fanPts, 0.004, 0.002);
  const uv = fanGeo.attributes.uv, pos = fanGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.4 + 0.5, pos.getY(i) / 0.2);
  const fan = kit.group(h.armR.hand, 0, -0.03, 0.03);
  put(fan, kit.mesh(fanGeo, kit.toon('#ffffff', { map: fanTex, double: true }), OL * 0.5), 0, 0, 0);
  fan.rotation.set(-1.4, 0, 0);
  // folded, it is just a slim stick at the collar
  const folded = kit.group(h.back, 0.03, 0.12, 0.02);
  folded.rotation.set(0.2, 0, -0.25);
  put(folded, kit.mesh(kit.box(0.03, 0.22, 0.018), kit.toon('#8a5a32'), OL * 0.5), 0, 0, 0);
  h.handProps.push(fan);

  // a go stone: turning in the fingers, or set on the air
  const stoneM = kit.toon('#1d1a18');
  const stone = new THREE.Mesh(kit.sphere(0.022, 1, 0.5, 1, 12, 8), stoneM);
  stone.visible = false;
  kit.keep(stone);
  h.armR.hand.add(stone);
  stone.position.set(0, -0.05, 0.02);
  // the placed stone and a board's lines glowing round it
  const placed = kit.group(h.scaler);
  put(placed, new THREE.Mesh(kit.sphere(0.04, 1, 0.5, 1, 12, 8), stoneM), 0, 0, 0, Math.PI / 2, 0, 0);
  const gridTex = kit.tex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, 'rgba(255,214,140,1)'); grd.addColorStop(0.7, 'rgba(255,200,120,0.5)'); grd.addColorStop(1, 'rgba(255,190,110,0)');
    g.strokeStyle = grd; g.lineWidth = 2.5;
    for (let i = 0; i < 5; i++) { const x = 16 + i * 24; g.beginPath(); g.moveTo(x, 4); g.lineTo(x, w - 4); g.moveTo(4, x); g.lineTo(w - 4, x); g.stroke(); }
    g.strokeStyle = 'rgba(255,220,150,0.9)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, 20, 0, Math.PI * 2); g.stroke();
  });
  const gridMat = kit.add(new THREE.MeshBasicMaterial({ map: gridTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, opacity: 0 }));
  const gridPlane = put(placed, new THREE.Mesh(kit.add(new THREE.PlaneGeometry(0.7, 0.7)), gridMat), 0, 0, -0.01);
  kit.keep(gridPlane);
  placed.visible = false;
  const handW = new THREE.Vector3();
  const PLACE = new THREE.Vector3(0.02, 0.2, 0.38), placedAt = new THREE.Vector3();

  const behind = (m: (k: keyof Pose, v: number) => void) => {
    // hands clasped at the small of the back
    m('shLx', 0.45); m('shLz', 0.2); m('elLx', -1.15); m('elLz', -0.45);
    m('shRx', 0.45); m('shRz', -0.2); m('elRx', -1.15); m('elRz', 0.45);
  };
  h.fidgets = [
    {
      id: 'fan', dur: 4.5, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        m('shRx', -0.6); m('shRz', 0.25); m('elRx', -1.5 + Math.sin(secs * 5.5) * 0.25);
        m('headX', -0.06); m('headZ', 0.05);
      },
    },
    {
      id: 'stone', dur: 3.8, pose: (p, k, u, secs) => {
        // a stone held up to the light, turned, flipped with the thumb
        const m = h.mx.set(p, k).m;
        const flip = u > 0.55 && u < 0.7 ? Math.sin(((u - 0.55) / 0.15) * Math.PI) : 0;
        m('shRx', -1.05 - flip * 0.25); m('shRz', 0.3); m('elRx', -1.6 + Math.sin(secs * 2.2) * 0.08);
        m('headX', -0.1 - flip * 0.15); m('headY', 0.18);
      },
    },
    {
      id: 'ponder', dur: 4, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        m('shRx', -0.85); m('shRz', 0.4); m('elRx', -2.05 + Math.abs(Math.sin(secs * 1.7)) * 0.1);
        m('shLx', -0.55); m('shLz', -0.4); m('elLx', -1.45);
        m('headX', 0.12); m('headZ', 0.1); m('torsoX', 0.03);
      },
    },
  ];

  h.onPose = (p, f) => {
    // walking and standing: hands clasped behind the back (the right one turning a stone)
    const free = 1 - Math.max(bothHands(f, h.seat), f.emote ? f.env : 0, f.fidget ? f.fk : 0);
    if (free > 0) behind(h.mx.set(p, free).m);
    if (f.fidget === 'ponder' || f.fidget === 'fan' || f.fidget === 'stone') {
      // (the left hand stays behind the back for the one-handed ones)
      if (f.fidget !== 'ponder') { const m = h.mx.set(p, f.fk).m; m('shLx', 0.45); m('shLz', 0.2); m('elLx', -1.15); m('elLz', -0.45); }
    }
    // a scholar's measured stride
    p.headX -= 0.04 * Math.min(1, f.gait);
    if (f.emote === 'talk') {
      // a point made with the fan: open, a sweep, a tap into the left palm
      const m = h.mx.set(p, f.env).m;
      const a = Math.sin(f.since * 2.6);
      m('shRx', -1.0 + a * 0.2); m('shRz', 0.2 - a * 0.25); m('elRx', -1.25);
      m('shLx', -0.7); m('shLz', -0.3); m('elLx', -1.2); m('elLz', 0);
      m('headX', 0.04); m('headY', a * 0.12);
    }
    if (f.emote === 'play') {
      // thinking over a move: fan tapping the chin
      const m = h.mx.set(p, f.env).m;
      m('shRx', -0.9); m('shRz', 0.4); m('elRx', -1.9 + Math.abs(Math.sin(f.t * 3)) * 0.15); m('headX', 0.1); m('headZ', 0.12);
    } else if (f.emote === 'skill') {
      // 推演: a stone from the pot on his back, the elbow out over the right shoulder (0–.22),
      // brought round before the eyes (.25–.45), a pause, then set firmly on the air out in front
      // (.55–.62); he holds the pose, looking at it. (The arm always passes beside the head.)
      const m = h.mx.set(p, f.env).m;
      const take = smooth(f.u / 0.22), lift = smooth((f.u - 0.25) / 0.2), set = smooth((f.u - 0.55) / 0.07);
      m('shRx', mix(mix(-0.3, -2.8, take), mix(-1.9, -1.75, set), lift));
      m('shRz', mix(mix(-0.1, -0.9, take), mix(-0.35, -0.24, set), lift));
      m('elRx', mix(mix(-0.8, -1.3, take), mix(-0.5, -0.2, set), lift)); m('elRz', 0);
      m('shLx', 0.45); m('shLz', 0.2); m('elLx', -1.15); m('elLz', -0.45);
      m('headX', mix(-0.05 * take, -0.08 + 0.1 * set, lift)); m('headY', mix(-0.35 * take, -0.12, lift)); m('bodyX', 0.06 * set);
      m('torsoY', mix(-0.12 * take, 0, lift));
      m('hipLx', -0.25 * set); m('hipRx', 0.15 * set);
    }
  };
  h.onAfter = (f) => {
    const sk = f.emote === 'skill' && f.env > 0.05;
    // the fan: open in the hand for fanning and thinking, folded at the collar otherwise
    const fanOut = (f.fidget === 'fan' && f.fk > 0.3) || ((f.emote === 'play' || f.emote === 'talk') && f.env > 0.3);
    fan.visible = fanOut && !h.holding;
    folded.visible = !fan.visible;
    // the stone in the fingers
    stone.visible = !h.holding && !fanOut && ((f.gait > 0.1 && !f.emote) || (f.fidget === 'stone' && f.fk > 0.2) || (sk && f.u > 0.2 && f.u < 0.58));
    if (stone.visible) stone.rotation.set(f.t * 3, 0, f.t * 1.7);
    // the stone set on the air, the lines glowing out round it
    const setNow = sk && f.u >= 0.58;
    const fresh = setNow && !placed.visible;
    placed.visible = setNow;
    if (placed.visible) {
      if (fresh) {
        // (taken from the fingers on the first frame it shows, however long the frames are)
        h.armR.hand.updateWorldMatrix(true, false);
        handW.set(0, -0.05, 0.02).applyMatrix4(h.armR.hand.matrixWorld);
        h.scaler.updateWorldMatrix(true, false);
        h.scaler.worldToLocal(handW);
        placedAt.copy(handW);
      }
      // flicked from the fingers out in front and up: the glowing board reads above his shoulder
      // from the camera behind
      placed.position.copy(placedAt).addScaledVector(PLACE, smooth((f.u - 0.58) / 0.12));
      const g = clamp((f.u - 0.58) / 0.42);
      gridMat.opacity = Math.sin(Math.min(1, g * 1.3) * Math.PI) * 0.9;
      gridPlane.scale.setScalar(0.4 + smooth(g) * 1.2);
    }
    goatee.rotation.x = gSpring.step(-f.s.speed * 0.1 - h.head.rotation.x * 0.5, f.dt);
    ties.forEach((r, i) => {
      const sx = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.26 * u;
        const k = Math.min(0.8, f.s.speed * 0.2);
        c.set(0.05 * sx, hc + 0.14 - L * (1 - k * 0.6), -0.1 - L * (0.2 + k) + Math.sin(f.t * 4 - u * 4 + i) * 0.02 * u);
        s.set(1, 0, 0);
      });
    });
  };
  return h;
};
