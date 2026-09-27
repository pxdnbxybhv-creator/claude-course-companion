// 光隧 · the narrow way (初极狭，才通人): the cleft's dressing — the plank walk over the stream, the
// water-curtain of light at its start (the back of the waterfall), drips from the rock, the camera kept
// between its walls, and 「初极狭，才通人」 brushed onto the rock at (0, +56). The rock itself is the
// valley's (valley.ts, a fine patch of the ring cut through by the slot).
import type * as T from 'three';
import type { Valley } from './valley';
import type { ValleyFx } from './fx';
import { Cloud } from './fx';
import { Batch, COL, place } from '../../regions/hill-kit';
import { BRUSH_FONT, canvasTexture, loadBrush } from '../kit';
import { plop } from '../sfx';
import { makeRng } from '../../../../core/rng';
import { CAVE, G, L, Y_T, cleftFloor, cleftHalf } from './places';

export interface Cave {
  /** Brush 「初极狭，才通人」 onto the rock (once per call; it stays until wipe()). */
  brush(): Promise<void>;
  wipe(): void;
  /** The walker is in the cleft now. */
  inside(): boolean;
  dispose(): void;
}

export function buildCave(valley: Valley, fx: ValleyFx): Cave {
  const h = valley.hill;
  const TH = h.THREE;
  const ctx = h.ctx;
  const b = new Batch();
  const rng = makeRng(6464);
  const z0 = CAVE.mouth + 1.2, z1 = CAVE.end + 0.2;

  // the plank walk: boards across, on two stringers, a little over the stream
  for (let z = z0; z < z1; z += 0.2) {
    const y = cleftFloor(z);
    const w = Math.min(0.95, cleftHalf(z) * 2 - 0.2);
    b.add(place(new TH.BoxGeometry(w, 0.05, 0.16), -0.08 + (rng() - 0.5) * 0.03, y - 0.025, z, (rng() - 0.5) * 0.04), new TH.Color(COL.woodLight).multiplyScalar(0.8 + rng() * 0.25), { edge: 40 });
  }
  for (const sx of [-0.4, 0.25]) {
    for (let z = z0; z < z1; z += 2.4) {
      const y = cleftFloor(z);
      b.add(place(new TH.BoxGeometry(0.08, 0.1, 2.4), sx, y - 0.1, z + 1.2), COL.woodDark, {});
      b.add(place(new TH.CylinderGeometry(0.04, 0.05, 0.6, 5), sx, y - 0.35, z), COL.woodDark, {});
    }
  }
  // loose stones at the walls' feet, moss
  for (let i = 0; i < 26; i++) {
    const z = z0 + rng() * (z1 - z0), side = rng() < 0.5 ? -1 : 1;
    const x = side * (cleftHalf(z) - 0.12);
    b.add(place(new TH.IcosahedronGeometry(0.1 + rng() * 0.12, 0), x, cleftFloor(z) - 0.25, z, rng() * 6), rng() < 0.5 ? '#6d6a60' : '#5f7d56', {});
  }
  b.build(h, 'taoyuan:cave', { outline: 0.02, lineOpacity: 0.5 });

  // the camera stays between the walls (upright cylinders along both, just beyond the rock face)
  for (let z = CAVE.mouth + 2; z <= CAVE.end + 3; z += 0.9) {
    const hw = cleftHalf(z), y = Y_T + cleftFloor(z);
    for (const s of [-1, 1]) h.occlude({ x: G.x + s * (hw + 0.55), z: G.z + z, r: 0.55, y0: y - 1, y1: y + 40 });
  }
  // and the dead end behind the start: the camera stays on this side of the curtain of falling water
  for (let x = -1.2; x <= 1.2; x += 0.6) h.occlude({ x: G.x + x, z: G.z + CAVE.end + 1.2, r: 0.55, y0: Y_T - 1, y1: Y_T + 40 });

  // the back of the waterfall at the cleft's start: a sheet of falling light
  const sheetTex = h.tex(fallCanvas(64, 256), { repeat: true });
  sheetTex.repeat.set(2, 1);
  const sheetMat = h.own(new TH.MeshBasicMaterial({ map: sheetTex, color: '#e9f4f2', transparent: true, opacity: 0.5, depthWrite: false, blending: TH.AdditiveBlending, fog: false, side: TH.DoubleSide }));
  const sheet = new TH.Mesh(new TH.PlaneGeometry(2.6, 6), sheetMat);
  sheet.position.set(0, cleftFloor(CAVE.end) + 2.8, CAVE.end + 0.35);
  sheet.name = 'taoyuan:curtain';
  h.add(sheet);
  const back = new TH.Sprite(h.own(new TH.SpriteMaterial({ map: fx.glowTex, color: '#dff1ee', transparent: true, opacity: 0.7, depthWrite: false, blending: TH.AdditiveBlending, fog: false })));
  back.position.set(0, cleftFloor(CAVE.end) + 1.6, CAVE.end + 0.6);
  back.scale.set(3.4, 5.5, 1);
  h.add(back);
  // (seen from the cleft, never from behind or through: it fades as the camera comes up to it)
  const backMat = back.material as T.SpriteMaterial;
  h.frame((dt) => {
    sheetTex.offset.y += dt * 0.9;
    const gap = sheet.position.z - (ctx.camera.position.z - G.z);
    const k = Math.max(0, Math.min(1, (gap - 0.6) / 2));
    const f = k * k * (3 - 2 * k);
    sheetMat.opacity = 0.5 * f;
    backMat.opacity = 0.7 * f;
    sheet.visible = back.visible = f > 0.01;
  });

  // the light at the far end (the inner mouth), growing as one comes nearer (FX1)
  fx.mouthGlow();

  // drips from the rock: a bright drop, a ring on the water, a soft plop when the walker is near
  const drops = new Cloud(fx, 4, 'glow');
  const white = new TH.Color('#e8f0ff');
  const dz = [0, 0, 0, 0], dt0 = [1.3, 2.9, 4.1, 5.6], dx = [0, 0, 0, 0];
  let clock = 0;
  h.frame((dt) => {
    clock += dt;
    const p = L(ctx.player.position.x, ctx.player.position.z);
    const near = p.z > CAVE.mouth && p.z < CAVE.end + 1;
    for (let i = 0; i < 4; i++) {
      const cyc = 3.4 + i * 1.1;
      const k = ((clock + dt0[i]) % cyc) / 1.1;
      if (k < 0.02) { dz[i] = p.z - 3 - rng() * 6; dx[i] = (rng() < 0.5 ? -1 : 1) * (cleftHalf(dz[i]) - 0.15); }
      const zz = Math.min(CAVE.start, Math.max(CAVE.mouth + 2, dz[i]));
      const y = cleftFloor(zz) + 3.2 - 3.4 * Math.min(1, k) * Math.min(1, k);
      drops.set(i, dx[i], y, zz, 0.05, near && k < 1 ? 0.8 : 0, white);
      if (near && k >= 1 && k - dt / 1.1 < 1 && Math.abs(zz - p.z) < 7) { try { plop(0.08); } catch { /* muted */ } }
    }
    drops.flush();
  });

  // 「初极狭，才通人」 brushed onto the east wall at +56 (a decal on the rock, stroke by stroke)
  const TEXT = '初极狭，才通人';
  const chars = [...TEXT];
  const cell = 80, W = cell + 20, H = cell * chars.length + 20;
  let shown = 0;
  const paint = (g: CanvasRenderingContext2D) => {
    g.clearRect(0, 0, W, H);
    // a pale wash on the damp rock first (the ink reads against it)
    if (shown > 0) {
      const wash = g.createLinearGradient(0, 0, W, 0);
      wash.addColorStop(0, 'rgba(236,228,210,0)');
      wash.addColorStop(0.5, 'rgba(236,228,210,0.26)');
      wash.addColorStop(1, 'rgba(236,228,210,0)');
      g.fillStyle = wash;
      g.fillRect(0, 4, W, 12 + cell * Math.min(shown, chars.length));
    }
    g.font = `${cell * 0.86}px ${BRUSH_FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(24,20,17,0.92)';
    for (let i = 0; i < Math.min(shown, chars.length); i++) {
      const c = chars[i] === '，' ? '' : chars[i];
      if (c) g.fillText(c, W / 2, 10 + cell * (i + 0.5));
    }
  };
  const tex = canvasTexture(TH, W, H, paint);
  h.own(tex);
  const wordsMat = h.own(new TH.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.95 }));
  h.nightShade(wordsMat);
  const zW = CAVE.words;
  const words = new TH.Mesh(new TH.PlaneGeometry(0.52, (0.52 * H) / W), wordsMat);
  words.position.set(cleftHalf(zW) - 0.03, cleftFloor(zW) + 1.75, zW);
  words.rotation.y = -Math.PI / 2;
  words.renderOrder = 2;
  words.visible = false;
  words.name = 'taoyuan:cavewords';
  h.add(words);
  let brushing = false;

  return {
    async brush() {
      if (brushing) return;
      brushing = true;
      void loadBrush(TEXT);
      words.visible = true;
      // and brushed in the air a few steps ahead, facing the walker (the rock's words are seen edge-on)
      fx.words('初极狭　才通人', { x: G.x - 0.05, y: Y_T + cleftFloor(zW - 3.5) + 1.95, z: G.z + zW - 3.5 }, { vertical: true, size: 0.3, life: 5.5, rise: 0.35 });
      for (shown = 1; shown <= chars.length; shown++) {
        const g = (tex.image as HTMLCanvasElement).getContext('2d');
        if (g) { paint(g); tex.needsUpdate = true; }
        await fx.wait(260);
      }
      brushing = false;
    },
    wipe() { shown = 0; words.visible = false; },
    inside() {
      const p = L(ctx.player.position.x, ctx.player.position.z);
      return p.z > CAVE.mouth + 0.5 && Math.abs(p.x) < 3 && ctx.player.position.y > Y_T - 5;
    },
    dispose() { drops.dispose(); },
  };
}

/** Falling water seen from behind: bright streaks, broken. */
function fallCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const r = makeRng(9);
  for (let i = 0; i < 70; i++) {
    const x = r() * w, y = r() * h, l = 30 + r() * 90;
    const grd = g.createLinearGradient(0, y, 0, y + l);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, `rgba(255,255,255,${0.35 + r() * 0.5})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(x, y, 1 + r() * 2.5, l);
    if (y + l > h) g.fillRect(x, y - h, 1 + r() * 2.5, l);
  }
  return c;
}

