// 画师 · the Painter — a black 幞头 cap whose two soft ties flutter behind him, a tea-coloured robe
// spattered with ink and dots of colour, a brush tucked behind his ear, and a scroll tube slung on
// his back. He ambles, head turning to every view. Standing, he frames the scene between his
// fingers with a squint, strokes his chin, or takes the brush from his ear and sketches in the
// air. Playing, he paints the air with a big brush; his skill (神笔) lays one great sweeping
// stroke of 花青 across the air, which hangs there a moment and fades.
import type { CharacterFactory } from './types';
import { Human, Kit, OL, Ribbon, Spring, Trail, mix, put, smooth } from './rig';

export const painter: CharacterFactory = (THREE, opts) => {
  const kit = new Kit(THREE, opts.reduced);
  const h = new Human(kit, {
    scale: 1.12, skin: '#f2d4b4', robe: '#e9d7b3', trim: '#6e5238', hair: '#23201d', sash: '#4f9a72',
    shoe: '#3a2c22', hem: 0.08, sleeve: 'wide', eyes: 'dot', blush: 0.5, mouth: 'none',
  }, { stride: 0.86, bounce: 0.028, armSwing: 0.36 }, 7);
  const hc = h.headC;

  // ink spatters on the robe (a painted map on the skirt)
  const spatter = kit.tex(256, 128, (g, w, hh) => {
    g.fillStyle = '#e9d7b3'; g.fillRect(0, 0, w, hh);
    const blot = (x: number, y: number, r: number, c: string) => {
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 5; i++) { const a = i * 1.3 + x; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.4, r * 0.25, 0, Math.PI * 2); g.fill(); }
    };
    blot(40, 90, 7, 'rgba(34,26,20,0.8)'); blot(150, 100, 5, 'rgba(34,26,20,0.75)'); blot(200, 70, 4, 'rgba(47,111,126,0.85)');
    blot(95, 105, 4, 'rgba(196,58,58,0.8)'); blot(230, 105, 6, 'rgba(34,26,20,0.7)'); blot(120, 60, 3, 'rgba(226,170,40,0.9)');
    blot(70, 40, 3, 'rgba(79,154,114,0.85)'); blot(180, 30, 2.5, 'rgba(196,58,58,0.8)');
  });
  h.skirtMesh.material = kit.toon('#ffffff', { map: spatter });

  // 幞头: a black cap with a raised back and two soft ties
  const black = kit.toon('#1e1c1b');
  put(h.head, kit.mesh(kit.cap(h.headR + 0.018, Math.PI * 0.5, 22, 8), black), 0, hc + 0.01, -0.01, -0.3, 0, 0);
  put(h.head, kit.mesh(kit.sphere(0.085, 1.1, 1, 0.9), black), 0, hc + 0.17, -0.06);
  const ties = [new Ribbon(kit, '#1e1c1b', 7, (u) => 0.04 * (1 - u * 0.3)), new Ribbon(kit, '#1e1c1b', 7, (u) => 0.04 * (1 - u * 0.3))];
  for (const r of ties) h.head.add(r.mesh);
  ties.forEach((r, i) => { r.twist = i ? -1.3 : 1.3; });
  const flow = new Spring(28, 6);

  // a brush behind the right ear
  const brush = kit.group(h.head, -0.16, hc + 0.07, -0.02);
  brush.rotation.set(0.3, 0, 0.9);
  put(brush, kit.mesh(kit.cyl(0.008, 0.008, 0.17, 6), kit.toon('#c9a064'), OL * 0.5), 0, 0, 0);
  put(brush, new THREE.Mesh(kit.cyl(0.001, 0.012, 0.04, 6), black), 0, -0.1, 0);
  // …and the same brush in the hand, for sketching in the air (a fidget)
  const small = kit.group(h.armR.hand, 0, -0.04, 0.02);
  small.rotation.x = 0.5;
  put(small, kit.mesh(kit.cyl(0.008, 0.008, 0.17, 6), kit.toon('#c9a064'), OL * 0.5), 0, 0, 0);
  put(small, new THREE.Mesh(kit.cyl(0.001, 0.012, 0.04, 6), black), 0, -0.1, 0);
  small.visible = false;

  // scroll tube across the back
  const tube = kit.group(h.back, 0, -0.06, -0.05);
  tube.rotation.set(0, 0, -0.9);
  put(tube, kit.mesh(kit.cyl(0.045, 0.045, 0.56, 12), kit.toon('#8a4f32')), 0, 0, 0);
  for (const y of [-0.28, 0.28]) put(tube, kit.mesh(kit.cyl(0.05, 0.05, 0.045, 12), kit.toon('#3b2a24'), OL * 0.6), 0, y, 0);
  put(tube, new THREE.Mesh(kit.torus(0.047, 0.007, 5, 14).rotateX(Math.PI / 2), kit.toon('#d0a445')), 0, 0.12, 0);
  put(h.chest, new THREE.Mesh(kit.box(0.025, 0.36, 0.012), kit.toon('#6e5238')), 0, 0.17, 0.14, -0.1, 0, 0.8);

  // a big brush for painting the air
  const bigBrush = kit.group(h.armR.hand, 0, -0.08, 0.02);
  put(bigBrush, kit.mesh(kit.cyl(0.014, 0.014, 0.34, 8), kit.toon('#b58a52'), OL * 0.6), 0, 0.06, 0);
  put(bigBrush, kit.mesh(kit.lathe([[0, -0.1], [0.025, -0.05], [0.028, 0.0], [0.016, 0.02], [0, 0.02]], 10), kit.toon('#2f6f7e'), OL * 0.6), 0, -0.12, 0);
  const tip = kit.group(bigBrush, 0, -0.22, 0);
  bigBrush.rotation.x = 0.4;
  bigBrush.visible = false;
  const wash = new Trail(kit, '#2f6f7e', 56, 0.12, 0.85, 0.03);
  h.scaler.add(wash.mesh);
  let stroking = false;

  h.fidgets = [
    {
      id: 'frame', dur: 4.2, lid: 0.45, pose: (p, k, _u, secs) => {
        // thumbs and forefingers make a frame; a squint; the frame drifts over the view
        const m = h.mx.set(p, k).m;
        const pan = Math.sin(secs * 0.8) * 0.12;
        m('shLx', -1.45); m('shLz', -0.35 + pan); m('elLx', -0.9); m('elLz', 0);
        m('shRx', -1.45); m('shRz', 0.35 + pan); m('elRx', -0.9);
        m('headX', -0.02); m('headZ', 0.14); m('headY', pan * 1.5); m('bodyX', -0.03);
      },
    },
    {
      id: 'chin', dur: 3.8, pose: (p, k, _u, secs) => {
        const m = h.mx.set(p, k).m;
        m('shRx', -0.9); m('shRz', 0.35); m('elRx', -2.0 + Math.abs(Math.sin(secs * 2.5)) * 0.12);
        m('shLx', -0.5); m('shLz', -0.35); m('elLx', -1.5);
        m('headX', -0.1); m('headY', 0.2); m('headZ', -0.08);
      },
    },
    {
      id: 'sketch', dur: 4, pose: (p, k, _u, secs) => {
        // quick little strokes in the air with the ear-brush
        const m = h.mx.set(p, k).m;
        const a = Math.sin(secs * 5.5), b = Math.sin(secs * 3.7 + 1);
        m('shRx', -1.25 + b * 0.15); m('shRz', 0.15 + a * 0.18); m('elRx', -0.7);
        m('shLx', -0.3); m('shLz', 0.2); m('elLx', -1.0);
        m('headX', -0.05 + b * 0.05); m('headY', a * 0.1);
      },
    },
  ];

  h.onPose = (p, f) => {
    // looking round at the views as he walks
    p.headY += Math.sin(f.t * 0.45) * 0.3 * Math.min(1, f.gait);
    if (f.emote === 'play') {
      const m = h.mx.set(p, f.env).m;
      const a = f.t * 2.6;
      m('shRx', -1.3 + Math.sin(a) * 0.5); m('shRz', -0.3 + Math.sin(a * 2) * 0.35); m('elRx', -0.5);
      m('shLx', -0.4); m('shLz', 0.25); m('elLx', -1.1);
      m('torsoY', Math.sin(a) * 0.2); m('headY', Math.sin(a) * 0.2); m('bodyX', 0.06);
    } else if (f.emote === 'skill') {
      // one great S from low left to high right, the whole body behind it
      const m = h.mx.set(p, f.env).m;
      const w = smooth((f.u - 0.12) / 0.62);
      const x = mix(0.8, -0.9, w), y = -0.8 + 1.7 * w + Math.sin(w * Math.PI * 2) * 0.35;
      m('shRx', -1.3 - y * 0.55); m('shRz', -0.15 - x * 0.55); m('elRx', -0.25);
      m('shLx', -0.6); m('shLz', 0.5); m('elLx', -0.6);
      m('torsoY', -x * 0.3); m('headY', -x * 0.2); m('headX', -y * 0.12); m('bodyX', 0.05);
      m('hipLx', -0.4 * w); m('hipRx', 0.3 * w); m('knL', 0.2);
    }
  };
  h.onAfter = (f) => {
    const sk = f.emote === 'skill';
    bigBrush.visible = (f.emote === 'play' || sk) && f.env > 0.3;
    small.visible = f.fidget === 'sketch' && f.fk > 0.3;
    brush.visible = !bigBrush.visible && !small.visible;
    if (sk && !stroking) { stroking = true; wash.reset(); }
    if (!sk && stroking) { stroking = false; wash.reset(); }
    if (sk) {
      if (f.u > 0.14 && f.u < 0.74) wash.follow(tip);
      wash.draw(f.u < 0.78 ? 1 : 1 - smooth((f.u - 0.78) / 0.22));
    }
    const trail = flow.step(Math.min(1.3, f.s.speed * 0.3 + (f.air ? 0.6 : 0) + (sk ? f.env * 0.5 : 0)), f.dt);
    ties.forEach((r, i) => {
      const sx = i ? -1 : 1;
      r.update((u, c, s) => {
        const L = 0.34 * u;
        const w = Math.sin(f.t * 5 - u * 5 + i * 2) * 0.03 * u * (0.4 + trail);
        c.set(0.05 * sx + w * sx + u * 0.06 * sx, hc + 0.12 - L * (1 - trail * 0.6), -0.15 - L * (0.2 + trail * 0.8));
        s.set(1, 0, 0.3 * sx).normalize();
      });
    });
  };
  return h;
};
