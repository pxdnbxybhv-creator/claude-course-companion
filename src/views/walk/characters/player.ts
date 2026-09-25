// 棋士 · the Board-game Master — grey-blue robe and a 纶巾 scarf-cap, a neat long moustache and
// goatee, a go board tucked under his left arm (stones in a little pot on top) and a folding fan
// painted with a mountain in his right, which he fans himself with while he thinks.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, bothHands, mix, put } from './rig';

export const player: CharacterFactory = (THREE) => {
  const kit = new Kit(THREE);
  const h = new Human(kit, {
    scale: 1.13, skin: '#f0d6bb', robe: '#8e9ba4', trim: '#2f3439', hair: '#221f1c', sash: '#2f3439',
    shoe: '#252322', hem: 0.07, sleeve: 'wide', eyes: 'dot', brows: '#221f1c', blush: 0.35,
  }, { stride: 0.8, armSwing: 0.3 }, 8);
  const hc = h.headC;
  const dark = kit.toon('#2f3439');

  // 纶巾: a soft square cap and two ties
  put(h.head, kit.mesh(kit.cap(h.headR + 0.016, Math.PI * 0.5, 20, 8), dark), 0, hc + 0.01, -0.01, -0.28, 0, 0);
  put(h.head, kit.mesh(kit.box(0.17, 0.13, 0.15), dark, OL * 0.8), 0, hc + 0.19, -0.03, -0.12, 0, 0);
  const ties = [new Ribbon(kit, '#2f3439', 6, () => 0.035), new Ribbon(kit, '#2f3439', 6, () => 0.035)];
  for (const r of ties) h.head.add(r.mesh);
  ties.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });

  // moustache and goatee
  const hairM = kit.toon('#221f1c');
  for (const sx of [1, -1]) put(h.head, kit.mesh(kit.tube([[0, 0, 0], [0.04 * sx, -0.01, 0], [0.07 * sx, -0.05, -0.01]], 0.008, 0.003, 8, 4), hairM, OL * 0.4), 0.005 * sx, hc - 0.055, 0.158);
  const goatee = kit.group(h.head, 0, hc - 0.13, 0.13);
  put(goatee, kit.mesh(kit.lathe([[0, -0.13], [0.018, -0.08], [0.025, 0.0], [0, 0.01]], 8), hairM, OL * 0.4), 0, 0, 0, 0.2, 0, 0);
  const gSpring = new Spring(30, 4);

  // the go board under the left arm
  const grid = kit.tex(128, 128, (g, w) => {
    g.fillStyle = '#d7b273'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(40,28,15,0.8)'; g.lineWidth = 1;
    for (let i = 0; i < 13; i++) { const x = 8 + i * (112 / 12); g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 120); g.moveTo(8, x); g.lineTo(120, x); g.stroke(); }
    g.fillStyle = '#1b1916';
    for (const [x, y] of [[3, 3], [9, 9], [3, 9], [9, 3], [6, 6]]) { g.beginPath(); g.arc(8 + x * (112 / 12), 8 + y * (112 / 12), 2.2, 0, Math.PI * 2); g.fill(); }
  });
  const wood = kit.toon('#b88e55');
  const board = kit.group(h.chest, 0.21, 0.08, 0.02);
  board.rotation.set(0, 0, 1.45);
  const top = kit.toon('#ffffff', { map: grid });
  const mats = [wood, wood, top, wood, wood, wood];
  const boardMesh = new THREE.Mesh(kit.box(0.3, 0.06, 0.3), mats);
  boardMesh.add(new THREE.Mesh(boardMesh.geometry, kit.outline(OL * 0.8)));
  board.add(boardMesh);

  // the fan
  const fanTex = kit.tex(128, 64, (g, w, hh) => {
    g.fillStyle = '#f2ead8'; g.fillRect(0, 0, w, hh);
    g.fillStyle = 'rgba(61,90,115,0.35)';
    g.beginPath(); g.moveTo(0, hh); g.lineTo(30, 20); g.lineTo(52, 42); g.lineTo(78, 12); g.lineTo(128, hh); g.fill();
    g.fillStyle = 'rgba(27,25,22,0.5)';
    g.beginPath(); g.moveTo(40, hh); g.lineTo(62, 34); g.lineTo(90, hh); g.fill();
    g.strokeStyle = 'rgba(27,25,22,0.2)';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(w / 2, hh * 1.6); g.lineTo(i * (w / 13), 0); g.stroke(); }
  });
  const fanPts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) { const a = -1.1 + (2.2 * i) / 12; fanPts.push([Math.sin(a) * 0.2, Math.cos(a) * 0.2]); }
  for (let i = 12; i >= 0; i--) { const a = -1.1 + (2.2 * i) / 12; fanPts.push([Math.sin(a) * 0.07, Math.cos(a) * 0.07]); }
  const fanGeo = kit.shape(fanPts, 0.004, 0.002);
  // planar UVs for the painted leaf
  const uv = fanGeo.attributes.uv, pos = fanGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 0.4 + 0.5, pos.getY(i) / 0.2);
  const fan = kit.group(h.armR.hand, 0, -0.03, 0.03);
  put(fan, kit.mesh(fanGeo, kit.toon('#ffffff', { map: fanTex, double: true }), OL * 0.5), 0, 0, 0);
  fan.rotation.set(-1.4, 0, 0);

  h.handProps.push(fan);
  // while both hands are wanted (rowing, a proper 作揖) the board rides on his back
  let slung = false;
  const sling = (on: boolean) => {
    slung = on;
    if (on) { board.position.set(0, -0.06, -0.06); board.rotation.set(-Math.PI / 2, 0, 0); h.back.add(board); }
    else { board.position.set(0.21, 0.08, 0.02); board.rotation.set(0, 0, 1.45); h.chest.add(board); }
  };

  h.onPose = (p, f) => {
    // the board arm stays clamped
    const lock = 1 - bothHands(f, h.seat);
    p.shLx = mix(p.shLx, -0.1, lock); p.shLz = mix(p.shLz, 0.3, lock); p.elLx = mix(p.elLx, -0.9, lock); p.elLz = mix(p.elLz, 0, lock);
    // fanning: right hand up by the shoulder, the wrist fluttering
    const fanning = f.emote ? 0 : 1;
    const flutter = Math.sin(f.t * 5.5) * 0.25;
    p.shRx = p.shRx + (-0.6 - p.shRx) * fanning; p.shRz = p.shRz + (0.25 - p.shRz) * fanning; p.elRx = p.elRx + (-1.5 + flutter - p.elRx) * fanning;
    if (f.emote === 'play') {
      // thinking over a move: fan tapping the chin
      const m = (k: keyof typeof p, v: number) => { p[k] = p[k] + (v - p[k]) * f.env; };
      m('shRx', -0.9); m('shRz', 0.4); m('elRx', -1.9 + Math.abs(Math.sin(f.t * 3)) * 0.15); m('headX', 0.1); m('headZ', 0.12);
    }
  };
  h.onAfter = (f) => {
    const want = bothHands(f, h.seat) > 0.35;
    if (want !== slung) sling(want);
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
