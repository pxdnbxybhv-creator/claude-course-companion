// Modeled trees for the hill regions: old plum trees (gnarled trunks that zig-zag like 女, straight
// young shoots, blossoms as points) and ancient pines (leaning, twisting trunks with flat foliage
// pads, the way painters stack 松针 into cloud-like tiers). Geometry only; the regions batch it.
import type * as T from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Rng } from '../../../core/rng';
import { TAU, place, taperTube, three, tint } from './hill-kit';

type V3 = T.Vector3;

export interface PlumTree {
  /** Trunk and main limbs (vertex-coloured, indexed): outlined. */
  trunk: T.BufferGeometry[];
  /** Branches and shoots (vertex-coloured): rim-inked only. */
  twigs: T.BufferGeometry[];
  /** Where blossoms sit, with a relative size (buds are small). */
  blossoms: { p: V3; s: number }[];
  /** Crown points (for falling petals). */
  crown: V3[];
  height: number;
}

function zigzag(rng: Rng, from: V3, dir: V3, len: number, segs: number, kink: number, rise: number): V3[] {
  const THREE = three();
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  let side = rng() < 0.5 ? 1 : -1;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < segs; i++) {
    // 女-like zig-zag: alternate the bend, with a touch of lift
    const axis = new THREE.Vector3().crossVectors(d, up);
    if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
    axis.normalize();
    d.applyAxisAngle(up, side * kink * (0.6 + rng() * 0.8));
    d.applyAxisAngle(axis, (rng() - 0.35) * kink * 0.6);
    d.y += rise;
    d.normalize();
    side = -side;
    pts.push(pts[pts.length - 1].clone().addScaledVector(d, len / segs));
  }
  return pts;
}

/** An old plum tree (老梅): leaning, split trunk, zig-zag limbs, straight upright shoots. */
export function plumTree(rng: Rng, x: number, y: number, z: number, scale = 1): PlumTree {
  const THREE = three();
  const trunk: T.BufferGeometry[] = [];
  const twigs: T.BufferGeometry[] = [];
  const blossoms: { p: V3; s: number }[] = [];
  const crown: V3[] = [];
  const bark = rng() < 0.5 ? '#4a3a30' : '#3f3833';
  const lean = rng() * TAU;
  const tH = (1.6 + rng() * 1.4) * scale;
  // trunk: a heavy, bent stroke
  const tdir = new THREE.Vector3(Math.cos(lean) * 0.55, 1, Math.sin(lean) * 0.55);
  const tp = zigzag(rng, new THREE.Vector3(x, y - 0.25, z), tdir, tH, 5, 0.35, 0.25);
  const r0 = (0.2 + rng() * 0.1) * scale;
  trunk.push(taperTube(tp, tp.map((_, i) => r0 * (1 - 0.55 * (i / (tp.length - 1))) * (i === 0 ? 1.35 : 1)), 7, bark, { seed: rng.int(1, 1e6), jitter: 0.3 }));
  const top = tp[tp.length - 1];
  let maxY = top.y;
  // limbs
  const nLimb = 3 + Math.floor(rng() * 3);
  for (let l = 0; l < nLimb; l++) {
    const at = tp[Math.max(2, tp.length - 1 - Math.floor(rng() * 3))].clone();
    const a = lean + (l / nLimb) * TAU * 0.8 + rng() * 0.8 - 0.4;
    const dir = new THREE.Vector3(Math.cos(a), 0.4 + rng() * 0.9, Math.sin(a));
    const len = (1.6 + rng() * 1.8) * scale;
    const lp = zigzag(rng, at, dir, len, 5, 0.45, 0.08);
    const lr = r0 * (0.45 + rng() * 0.15);
    trunk.push(taperTube(lp, lp.map((_, i) => lr * (1 - 0.7 * (i / (lp.length - 1)))), 5, bark, { seed: rng.int(1, 1e6), jitter: 0.2 }));
    // branches off the limb
    for (let k = 1; k < lp.length; k++) {
      const p = lp[k];
      maxY = Math.max(maxY, p.y);
      if (k >= 2 && rng() < 0.9) {
        const ba = rng() * TAU;
        const bd = new THREE.Vector3(Math.cos(ba), 0.3 + rng() * 0.8, Math.sin(ba));
        const bl = (0.7 + rng() * 1.1) * scale;
        const bp = zigzag(rng, p, bd, bl, 3, 0.5, 0.1);
        twigs.push(taperTube(bp, bp.map((_, i) => lr * 0.4 * (1 - 0.75 * (i / (bp.length - 1)))), 4, bark, { seed: rng.int(1, 1e6) }));
        for (let j = 1; j < bp.length; j++) {
          const q = bp[j];
          maxY = Math.max(maxY, q.y);
          for (let n = 0; n < 11; n++) {
            const t = rng();
            const bpos = bp[j - 1].clone().lerp(q, t).add(new THREE.Vector3((rng() - 0.5) * 0.2, (rng() - 0.5) * 0.14, (rng() - 0.5) * 0.2));
            blossoms.push({ p: bpos, s: rng() < 0.2 ? 0.5 : 0.8 + rng() * 0.5 });
          }
        }
        crown.push(bp[bp.length - 1].clone());
        // a straight young shoot (枝) springing upward: plum's signature
        if (rng() < 0.85) {
          const s0 = bp[1].clone();
          const sl = (0.5 + rng() * 0.8) * scale;
          const s1 = s0.clone().add(new THREE.Vector3((rng() - 0.5) * 0.3, sl, (rng() - 0.5) * 0.3));
          const sm = s0.clone().lerp(s1, 0.5);
          twigs.push(taperTube([s0, sm, s1], [0.018 * scale, 0.012 * scale, 0.005], 3, '#3a302a', { seed: rng.int(1, 1e6) }));
          for (let n = 0; n < 9; n++) {
            const t = 0.2 + rng() * 0.8;
            blossoms.push({ p: s0.clone().lerp(s1, t).add(new THREE.Vector3((rng() - 0.5) * 0.06, 0, (rng() - 0.5) * 0.06)), s: t > 0.85 ? 0.45 : 0.7 + rng() * 0.4 });
          }
          maxY = Math.max(maxY, s1.y);
        }
      }
      if (k >= 1) for (let n = 0; n < 6; n++) blossoms.push({ p: lp[k - 1].clone().lerp(p, rng()).add(new THREE.Vector3((rng() - 0.5) * 0.12, 0.04, (rng() - 0.5) * 0.12)), s: 0.8 + rng() * 0.4 });
    }
    crown.push(lp[lp.length - 1].clone());
  }
  return { trunk, twigs, blossoms, crown, height: maxY - y };
}

export interface PineTree {
  trunk: T.BufferGeometry[];
  /** Foliage pads, tinted, non-indexed: outline them. */
  pads: T.BufferGeometry[];
  /** Branch tips (for ribbons, cones). */
  tips: V3[];
  height: number;
}

/** An ancient pine: leaning, twisting trunk, near-level limbs, flat tiers of needles. */
export function pineTree(rng: Rng, x: number, y: number, z: number, scale = 1, o: { lean?: number; leanDir?: number } = {}): PineTree {
  const THREE = three();
  const trunk: T.BufferGeometry[] = [];
  const pads: T.BufferGeometry[] = [];
  const tips: V3[] = [];
  const H = (7 + rng() * 4) * scale;
  const leanDir = o.leanDir ?? rng() * TAU;
  const lean = o.lean ?? 0.15 + rng() * 0.35;
  const pts: V3[] = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bend = lean * t * t * H * 0.6 + Math.sin(t * 5 + rng() * 0.5) * 0.25 * scale * t;
    pts.push(new THREE.Vector3(x + Math.cos(leanDir) * bend, y - 0.3 + t * H, z + Math.sin(leanDir) * bend));
  }
  const r0 = (0.32 + rng() * 0.12) * scale;
  const bark = '#57432f';
  trunk.push(taperTube(pts, pts.map((_, i) => r0 * (1 - 0.72 * (i / n)) * (i === 0 ? 1.4 : 1)), 7, bark, { seed: rng.int(1, 1e6), jitter: 0.25, dark: '#241a13' }));
  const padC = [new THREE.Color('#2c3930'), new THREE.Color('#3a4a3a'), new THREE.Color('#4b5b45')];
  const addPad = (c: V3, s: number) => {
    let g: T.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    // flatten into a tier: wide, thin, a little domed
    const p = g.attributes.position as T.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      p.setY(i, yy > 0 ? yy * 0.55 : yy * 0.22);
    }
    g.computeVertexNormals();
    place(g, c.x, c.y, c.z, rng() * TAU, s * (1.5 + rng() * 0.5), s * 0.9, s * (1.1 + rng() * 0.4));
    pads.push(tint(g, padC[Math.floor(rng() * padC.length)], 0.12, rng.int(1, 1e6)));
  };
  // limbs from the upper two thirds, near level, upturned at the tips
  const nLimb = 5 + Math.floor(rng() * 3);
  for (let l = 0; l < nLimb; l++) {
    const t = 0.38 + (l / nLimb) * 0.58 + rng() * 0.05;
    const i0 = Math.min(n - 1, Math.floor(t * n));
    const at = pts[i0].clone().lerp(pts[i0 + 1], t * n - i0);
    const a = leanDir + (l % 2 ? 1 : -1) * (0.6 + rng() * 1.4) + (rng() - 0.5) * 0.6;
    const len = (1.4 + rng() * 2.4) * scale * (1.15 - t * 0.5);
    const bp: V3[] = [at];
    const d = new THREE.Vector3(Math.cos(a), -0.05 + rng() * 0.15, Math.sin(a)).normalize();
    for (let k = 1; k <= 4; k++) {
      d.y += 0.08;
      d.normalize();
      bp.push(bp[k - 1].clone().addScaledVector(d, len / 4));
    }
    trunk.push(taperTube(bp, bp.map((_, i) => r0 * 0.34 * (1 - 0.65 * (i / 4))), 5, bark, { seed: rng.int(1, 1e6), dark: '#241a13' }));
    const tip = bp[bp.length - 1];
    tips.push(tip.clone());
    addPad(tip.clone().add(new THREE.Vector3(0, 0.25 * scale, 0)), (0.75 + rng() * 0.4) * scale * (1.1 - t * 0.3));
    if (rng() < 0.6) addPad(bp[2].clone().add(new THREE.Vector3(0, 0.3 * scale, 0)), (0.55 + rng() * 0.3) * scale);
  }
  // crown
  const topP = pts[n];
  addPad(topP.clone().add(new THREE.Vector3(0, 0.2, 0)), 1.0 * scale);
  addPad(topP.clone().add(new THREE.Vector3(Math.cos(leanDir) * 0.8 * scale, -0.5 * scale, Math.sin(leanDir) * 0.8 * scale)), 0.85 * scale);
  return { trunk, pads, tips, height: H };
}

/** The blossom sprite: five round petals in white (tinted per point), fine outline, ink stamens. */
export function blossomCanvas(): HTMLCanvasElement {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const cx = S / 2, cy = S / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    const px = cx + Math.cos(a) * S * 0.2, py = cy + Math.sin(a) * S * 0.2;
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath(); g.arc(px, py, S * 0.19, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(150,140,140,0.55)';
    g.lineWidth = 1.2;
    g.beginPath(); g.arc(px, py, S * 0.19, a - 1.9, a + 1.9); g.stroke();
  }
  g.fillStyle = 'rgba(80,60,50,0.9)';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    g.beginPath(); g.arc(cx + Math.cos(a) * S * 0.09, cy + Math.sin(a) * S * 0.09, 1.3, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(210,160,60,0.9)';
  g.beginPath(); g.arc(cx, cy, S * 0.045, 0, TAU); g.fill();
  return c;
}
