// One instanced figure for the whole crowd of a place: a robed body whose parts carry, per vertex,
// a colour role (robe, trim, skin, hat…), a rig (upper body, head, arms, feet, props in hand) and an
// option (which hat, which prop): each instance picks its own colours, hat and props, and is posed in
// the vertex shader (walk swing, a bow, a turn of the head, an arm raised to drink or to strike the
// wooden fish). The same geometry and pose drive an ink outline hull, so a whole crowd is two draws.
import type * as T from 'three';
import type { WorldCtx } from '../../types';

type Three = WorldCtx['THREE'];

/** Colour roles (the fixed ones are painted here; robe, trim, hair and hat come from each instance). */
export const ROLE = { robe: 0, trim: 1, skin: 2, hair: 3, hat: 4, wood: 5, paper: 6, straw: 7, ink: 8, cheek: 9, white: 10, bronze: 11, green: 12, apron: 13 } as const;
/** Rigs: what moves each vertex. */
export const RIG = { lower: 0, upper: 1, head: 2, armL: 3, armR: 4, footL: 5, footR: 6, propR: 7, propL: 8, back: 9 } as const;

/** Options (slot · id): a vertex is drawn only if its instance chose that id in that slot. */
export const HAT = { none: 0, bamboo: 1, cap: 2, buns: 3, scholar: 4, bun: 5, scarf: 6 } as const;
export const HAND = { none: 0, lantern: 1, broom: 2, rod: 3, pole: 4, clapper: 5, fan: 6, cup: 7, mallet: 8, hoe: 9, paddle: 10 } as const;
export const BACK = { none: 0, carry: 1, bundle: 2, basket: 3, woodfish: 4, gong: 5, book: 6 } as const;
export const CAPE = { none: 0, apron: 1, straw: 2 } as const;

const SLOT = { always: 0, hat: 1, hand: 2, back: 3, beard: 4, cape: 5 } as const;

/** Where the posing pivots sit (figure space, feet at 0, facing +z; the walker's size). */
export const PIVOT = { shoulderY: 0.92, shoulderX: 0.15, neckY: 0.98, waistY: 0.62 };
/** Local offset of a lantern's paper (for the glow halo), arm hanging down. */
export const LANTERN_AT = { x: -0.19, y: 0.66, z: 0.62 };
/**
 * The rouge on the cheeks: a soft oval wash painted onto the face in the fragment shader (in the
 * figure's rest pose), centred `x` either side of the nose and `dy` below the head's centre.
 */
const CHEEK = { headY: 1.04, x: 0.095, dy: -0.05, w: 0.048, h: 0.03, k: 0.5 };

interface Xf { p?: [number, number, number]; r?: [number, number, number]; s?: [number, number, number] | number }

/** Build the crowd figure geometry (non-indexed; attributes position, normal, aPart = role, rig, option). */
export function crowdGeometry(THREE: Three): T.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], part: number[] = [];
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), tp = new THREE.Vector3();
  const add = (g: T.BufferGeometry, role: number, rig: number, slot = 0, id = 0, xf: Xf = {}) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.attributes.normal) ng.computeVertexNormals();
    const s = xf.s === undefined ? 1 : xf.s;
    if (typeof s === 'number') sc.setScalar(s); else sc.set(s[0], s[1], s[2]);
    e.set(...(xf.r ?? [0, 0, 0]));
    q.setFromEuler(e);
    tp.set(...(xf.p ?? [0, 0, 0]));
    m.compose(tp, q, sc);
    nm.getNormalMatrix(m);
    const P = ng.attributes.position, N = ng.attributes.normal;
    const opt = slot * 16 + id;
    for (let i = 0; i < P.count; i++) {
      v.set(P.getX(i), P.getY(i), P.getZ(i)).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
      v.set(N.getX(i), N.getY(i), N.getZ(i)).applyMatrix3(nm).normalize();
      nor.push(v.x, v.y, v.z);
      part.push(role, rig, opt);
    }
    if (ng !== g) ng.dispose();
    g.dispose();
  };
  const lathe = (pts: [number, number][], seg = 8) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const sph = (r: number, w = 8, h = 5) => new THREE.SphereGeometry(r, w, h);
  const cyl = (a: number, b: number, h: number, s = 6) => new THREE.CylinderGeometry(a, b, h, s);
  const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);
  const S = SLOT;

  // ── body: the robe's bell, the torso, sash and hem, a crossed collar
  add(lathe([[0, 0.02], [0.25, 0.02], [0.24, 0.1], [0.2, 0.34], [0.16, 0.56], [0.14, 0.62], [0, 0.62]]), ROLE.robe, RIG.lower, 0, 0, { p: [0, 0.08, 0] });
  add(new THREE.TorusGeometry(0.24, 0.016, 3, 10), ROLE.trim, RIG.lower, 0, 0, { p: [0, 0.11, 0], r: [Math.PI / 2, 0, 0] });
  add(lathe([[0, 0], [0.145, 0], [0.155, 0.12], [0.14, 0.24], [0.08, 0.3], [0, 0.31]]), ROLE.robe, RIG.upper, 0, 0, { p: [0, 0.66, 0] });
  add(new THREE.TorusGeometry(0.15, 0.028, 3, 10), ROLE.trim, RIG.upper, 0, 0, { p: [0, 0.69, 0], r: [Math.PI / 2, 0, 0] });
  add(box(0.03, 0.2, 0.02), ROLE.trim, RIG.upper, 0, 0, { p: [0.02, 0.87, 0.125], r: [-0.35, 0, -0.62] });
  add(box(0.03, 0.14, 0.02), ROLE.trim, RIG.upper, 0, 0, { p: [-0.035, 0.89, 0.115], r: [-0.4, 0, 0.55] });
  // an apron, or a straw rain cape (蓑衣)
  add(box(0.26, 0.42, 0.02), ROLE.apron, RIG.lower, S.cape, CAPE.apron, { p: [0, 0.48, 0.2], r: [-0.18, 0, 0] });
  add(lathe([[0, 0.1], [0.3, 0.1], [0.27, 0.3], [0.2, 0.5], [0.12, 0.62], [0, 0.64]], 9), ROLE.straw, RIG.upper, S.cape, CAPE.straw, { p: [0, 0.4, -0.02], s: [1, 0.95, 0.95] });
  // feet
  add(sph(0.06, 7, 5), ROLE.ink, RIG.footL, 0, 0, { p: [0.08, 0.04, 0.06], s: [1, 0.7, 1.6] });
  add(sph(0.06, 7, 5), ROLE.ink, RIG.footR, 0, 0, { p: [-0.08, 0.04, 0.06], s: [1, 0.7, 1.6] });

  // ── head: face, eyes, hair; the hats
  const HY = CHEEK.headY;
  add(sph(0.17, 12, 9), ROLE.skin, RIG.head, 0, 0, { p: [0, HY, 0], s: [1, 0.98, 0.95] });
  add(sph(0.018, 5, 4), ROLE.ink, RIG.head, 0, 0, { p: [-0.058, HY, 0.155] });
  add(sph(0.018, 5, 4), ROLE.ink, RIG.head, 0, 0, { p: [0.058, HY, 0.155] });
  // (the cheeks' rouge is painted onto the face in the shader, not stuck on: see CHEEK below)
  add(new THREE.SphereGeometry(0.175, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), ROLE.hair, RIG.head, 0, 0, { p: [0, HY + 0.01, -0.01] });
  // 斗笠 bamboo hat
  add(new THREE.ConeGeometry(0.4, 0.2, 14, 1, true), ROLE.hat, RIG.head, S.hat, HAT.bamboo, { p: [0, HY + 0.17, 0] });
  add(cyl(0.4, 0.4, 0.012, 14), ROLE.hat, RIG.head, S.hat, HAT.bamboo, { p: [0, HY + 0.07, 0] });
  // cloth cap
  add(new THREE.SphereGeometry(0.182, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2.2), ROLE.hat, RIG.head, S.hat, HAT.cap, { p: [0, HY + 0.02, -0.01] });
  // a child's two buns
  add(sph(0.07, 8, 6), ROLE.hair, RIG.head, S.hat, HAT.buns, { p: [-0.12, HY + 0.15, 0] });
  add(sph(0.07, 8, 6), ROLE.hair, RIG.head, S.hat, HAT.buns, { p: [0.12, HY + 0.15, 0] });
  add(new THREE.TorusGeometry(0.05, 0.013, 4, 8), ROLE.hat, RIG.head, S.hat, HAT.buns, { p: [-0.12, HY + 0.12, 0], r: [Math.PI / 2, 0, 0] });
  add(new THREE.TorusGeometry(0.05, 0.013, 4, 8), ROLE.hat, RIG.head, S.hat, HAT.buns, { p: [0.12, HY + 0.12, 0], r: [Math.PI / 2, 0, 0] });
  // 幞头 scholar's cap with two tails
  add(box(0.2, 0.14, 0.18), ROLE.hat, RIG.head, S.hat, HAT.scholar, { p: [0, HY + 0.16, -0.02] });
  add(box(0.3, 0.025, 0.04), ROLE.hat, RIG.head, S.hat, HAT.scholar, { p: [0, HY + 0.16, -0.13], r: [0, 0, 0.1] });
  // a topknot with a pin
  add(sph(0.07, 8, 6), ROLE.hair, RIG.head, S.hat, HAT.bun, { p: [0, HY + 0.16, -0.03] });
  add(cyl(0.008, 0.008, 0.22, 4), ROLE.hat, RIG.head, S.hat, HAT.bun, { p: [0, HY + 0.17, -0.03], r: [0, 0, Math.PI / 2] });
  // a headscarf knotted at the back
  add(new THREE.SphereGeometry(0.19, 9, 5, 0, Math.PI * 2, 0, Math.PI / 1.9), ROLE.hat, RIG.head, S.hat, HAT.scarf, { p: [0, HY + 0.005, -0.015] });
  add(sph(0.05, 6, 5), ROLE.hat, RIG.head, S.hat, HAT.scarf, { p: [0, HY - 0.02, -0.19], s: [1.4, 0.8, 0.8] });
  // a beard
  add(new THREE.ConeGeometry(0.07, 0.2, 7), ROLE.hair, RIG.head, S.beard, 1, { p: [0, HY - 0.2, 0.1], r: [Math.PI + 0.25, 0, 0] });

  // ── arms: wide sleeves hanging from the shoulders, a hand at the end
  for (const sx of [1, -1]) {
    const rig = sx > 0 ? RIG.armL : RIG.armR;
    const x = PIVOT.shoulderX * sx;
    add(cyl(0.045, 0.085, 0.34, 8), ROLE.robe, rig, 0, 0, { p: [x + 0.03 * sx, PIVOT.shoulderY - 0.17, 0], r: [0, 0, 0.16 * sx] });
    add(new THREE.TorusGeometry(0.083, 0.012, 4, 10), ROLE.trim, rig, 0, 0, { p: [x + 0.055 * sx, PIVOT.shoulderY - 0.33, 0], r: [Math.PI / 2, 0, 0.16 * sx] });
    add(sph(0.04, 7, 5), ROLE.skin, rig, 0, 0, { p: [x + 0.06 * sx, PIVOT.shoulderY - 0.37, 0.01] });
  }

  // ── in the right hand (moves with the right arm)
  const HX = -0.21, HYd = PIVOT.shoulderY - 0.37; // the right hand, arm down
  // a lantern on a stick, held out in front
  add(cyl(0.01, 0.012, 0.75, 4), ROLE.wood, RIG.propR, S.hand, HAND.lantern, { p: [HX, HYd + 0.12, 0.3], r: [1.15, 0, 0] });
  add(sph(0.12, 9, 7), ROLE.paper, RIG.propR, S.hand, HAND.lantern, { p: [LANTERN_AT.x, LANTERN_AT.y, LANTERN_AT.z], s: [1, 1.25, 1] });
  add(cyl(0.06, 0.06, 0.04, 8), ROLE.ink, RIG.propR, S.hand, HAND.lantern, { p: [LANTERN_AT.x, LANTERN_AT.y + 0.15, LANTERN_AT.z] });
  add(cyl(0.06, 0.06, 0.04, 8), ROLE.ink, RIG.propR, S.hand, HAND.lantern, { p: [LANTERN_AT.x, LANTERN_AT.y - 0.15, LANTERN_AT.z] });
  // a bamboo broom, bristles to the ground ahead
  add(cyl(0.013, 0.013, 1.05, 4), ROLE.wood, RIG.propR, S.hand, HAND.broom, { p: [HX + 0.06, HYd - 0.2, 0.3], r: [0.62, 0, 0.12] });
  add(new THREE.ConeGeometry(0.16, 0.36, 7, 1, true), ROLE.straw, RIG.propR, S.hand, HAND.broom, { p: [HX + 0.12, 0.12, 0.62], r: [0.62, 0, 0.12] });
  // a fishing rod out over the water
  add(cyl(0.006, 0.016, 2.4, 4), ROLE.wood, RIG.propR, S.hand, HAND.rod, { p: [HX, HYd + 0.65, 1.05], r: [1.05, 0, 0] });
  // a boatman's long pole, held upright
  add(cyl(0.02, 0.02, 3.4, 5), ROLE.wood, RIG.propR, S.hand, HAND.pole, { p: [HX, HYd + 0.2, 0.12], r: [0.12, 0, 0] });
  // the watchman's clapper (梆子): a slit wooden block
  add(cyl(0.045, 0.045, 0.2, 7), ROLE.wood, RIG.propR, S.hand, HAND.clapper, { p: [HX, HYd - 0.03, 0.05], r: [Math.PI / 2, 0, 0] });
  // a folding fan
  add(new THREE.CircleGeometry(0.2, 8, Math.PI * 0.25, Math.PI * 0.5), ROLE.white, RIG.propR, S.hand, HAND.fan, { p: [HX, HYd - 0.02, 0.05], r: [-0.3, Math.PI / 2, 0] });
  // a teacup
  add(cyl(0.035, 0.026, 0.05, 7), ROLE.white, RIG.propR, S.hand, HAND.cup, { p: [HX, HYd - 0.03, 0.06] });
  // a wooden-fish mallet
  add(cyl(0.01, 0.01, 0.26, 4), ROLE.wood, RIG.propR, S.hand, HAND.mallet, { p: [HX, HYd - 0.03, 0.12], r: [1.2, 0, 0] });
  add(sph(0.03, 6, 4), ROLE.wood, RIG.propR, S.hand, HAND.mallet, { p: [HX, HYd - 0.08, 0.24] });
  // a hoe over the shoulder
  add(cyl(0.013, 0.013, 1.3, 4), ROLE.wood, RIG.propR, S.hand, HAND.hoe, { p: [HX, HYd + 0.25, 0.1], r: [-0.25, 0, 0] });
  add(box(0.16, 0.02, 0.2), ROLE.bronze, RIG.propR, S.hand, HAND.hoe, { p: [HX, HYd + 0.86, -0.02], r: [-0.25, 0, 0] });
  // a washing paddle (棒槌)
  add(cyl(0.03, 0.022, 0.36, 6), ROLE.wood, RIG.propR, S.hand, HAND.paddle, { p: [HX, HYd - 0.02, 0.17], r: [Math.PI / 2 - 0.2, 0, 0] });

  // ── the left hand, the shoulder or the back
  const LX = 0.21;
  // a carrying pole (扁担) on the left shoulder with a basket at each end
  add(cyl(0.02, 0.02, 1.7, 5), ROLE.wood, RIG.back, S.back, BACK.carry, { p: [0.14, 1.0, 0], r: [Math.PI / 2, 0, 0] });
  for (const sz of [-1, 1]) {
    add(cyl(0.2, 0.15, 0.22, 8), ROLE.straw, RIG.back, S.back, BACK.carry, { p: [0.14, 0.42, sz * 0.78] });
    add(sph(0.14, 7, 5), ROLE.green, RIG.back, S.back, BACK.carry, { p: [0.14, 0.53, sz * 0.78], s: [1, 0.5, 1] });
    add(cyl(0.005, 0.005, 0.5, 3), ROLE.ink, RIG.back, S.back, BACK.carry, { p: [0.14, 0.76, sz * 0.78] });
  }
  // a cloth bundle on the back
  add(box(0.3, 0.3, 0.16), ROLE.trim, RIG.back, S.back, BACK.bundle, { p: [0, 0.8, -0.2] });
  // a basket on the left arm
  add(cyl(0.13, 0.1, 0.14, 8), ROLE.straw, RIG.propL, S.back, BACK.basket, { p: [LX + 0.03, HYd + 0.02, 0.08] });
  add(new THREE.TorusGeometry(0.11, 0.01, 3, 10, Math.PI), ROLE.straw, RIG.propL, S.back, BACK.basket, { p: [LX + 0.03, HYd + 0.08, 0.08], r: [0, Math.PI / 2, 0] });
  // a hand-held wooden fish (木鱼)
  add(sph(0.08, 8, 6), ROLE.bronze, RIG.propL, S.back, BACK.woodfish, { p: [LX - 0.04, HYd + 0.02, 0.14], s: [1.1, 0.85, 1] });
  // a small gong (锣)
  add(cyl(0.12, 0.12, 0.02, 12), ROLE.bronze, RIG.propL, S.back, BACK.gong, { p: [LX, HYd - 0.05, 0.08], r: [Math.PI / 2, 0, 0] });
  // a book held at the side
  add(box(0.03, 0.2, 0.14), ROLE.trim, RIG.propL, S.back, BACK.book, { p: [LX + 0.01, HYd + 0.02, 0.04] });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 3));
  g.computeBoundingSphere();
  return g;
}

// ───────────────────────────── the shader ─────────────────────────────

/** Fixed colours by role (index = ROLE); -1 = from the instance. */
const FIXED = ['', '', '#f0d4b4', '', '', '#7a5a3a', '#d8563a', '#c9ad72', '#231f1b', '#e8a08e', '#f4efe4', '#6a4a30', '#6f8f4a', '#efe6d2'];

const CROWD_GLSL = /* glsl */ `
attribute vec3 aPart;
attribute vec4 aCols;
attribute vec4 aLook;
attribute vec4 aPose;
attribute vec4 aPose2;
attribute vec4 aMisc;
uniform vec3 uFixed[14];
vec3 crowdUnpack(float v) {
  float r = floor(v / 65536.0);
  float g = floor((v - r * 65536.0) / 256.0);
  float b = v - r * 65536.0 - g * 256.0;
  return vec3(r, g, b) / 255.0;
}
mat3 crowdRx(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 crowdRy(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 crowdRz(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
/** Pose one vertex: returns false (and a collapsed point) when its option is not chosen. */
bool crowdXf(inout vec3 p, inout vec3 n) {
  float rig = aPart.y;
  float slot = floor(aPart.z / 16.0 + 0.01);
  float id = aPart.z - slot * 16.0;
  if (slot > 0.5) {
    float want = slot < 1.5 ? aLook.x : slot < 2.5 ? aLook.y : slot < 3.5 ? aLook.z : slot < 4.5 ? aLook.w : aMisc.z;
    if (abs(want - id) > 0.5) { p = vec3(0.0); return false; }
  }
  float ph = aPose.x, amp = aPose.y, sit = aMisc.x;
  // sitting: the robe's lower half folds forward, everything above drops
  if (rig < 0.5) {
    p.z += sit * 0.2 * smoothstep(0.12, 0.5, p.y);
    p.y = mix(p.y, p.y * 0.52 + 0.02, sit);
  }
  // feet: step forward and back, lifting a little
  if (rig > 4.5 && rig < 6.5) {
    float s = rig < 5.5 ? 1.0 : -1.0;
    p.z += sin(ph) * 0.15 * amp * s + sit * 0.3;
    p.y += max(0.0, cos(ph) * s) * 0.06 * amp;
  }
  bool left = (rig > 2.5 && rig < 3.5) || (rig > 7.5 && rig < 8.5);
  bool right = (rig > 3.5 && rig < 4.5) || (rig > 6.5 && rig < 7.5);
  if (left || right) {
    vec3 sh = vec3(left ? ${PIVOT.shoulderX.toFixed(3)} : -${PIVOT.shoulderX.toFixed(3)}, ${PIVOT.shoulderY.toFixed(3)}, 0.0);
    float pitch = (left ? aPose2.x : aPose2.y) + sin(ph) * 0.5 * amp * (left ? 1.0 : -1.0);
    float roll = left ? 0.0 : aPose2.z;
    mat3 R = crowdRz(-roll) * crowdRx(-pitch);
    p = sh + R * (p - sh);
    n = R * n;
  }
  if (rig > 1.5 && rig < 2.5) {
    vec3 nk = vec3(0.0, ${PIVOT.neckY.toFixed(3)}, 0.0);
    mat3 R = crowdRy(aPose.w) * crowdRx(aMisc.w);
    p = nk + R * (p - nk);
    n = R * n;
  }
  // the upper body bows and sways about the waist (and drops when seated)
  if (rig > 0.5 && rig < 4.5 || rig > 6.5) {
    vec3 w = vec3(0.0, ${PIVOT.waistY.toFixed(3)}, 0.0);
    mat3 R = crowdRz(aPose2.w) * crowdRx(aPose.z);
    p = w + R * (p - w);
    n = R * n;
    p.y -= sit * 0.3;
  }
  p.y += abs(sin(ph)) * 0.04 * amp;
  return true;
}
vec3 crowdColour() {
  float role = aPart.x;
  if (role < 0.5) return crowdUnpack(aCols.x);
  if (role < 1.5) return crowdUnpack(aCols.y);
  if (role > 2.5 && role < 3.5) return crowdUnpack(aCols.z);
  if (role > 3.5 && role < 4.5) return crowdUnpack(aCols.w);
  int i = int(role + 0.5);
  return uFixed[i];
}
`;

/** The cheeks' wash: an oval either side of the nose, soft at the rim, on the front of the face only. */
const CHEEK_GLSL = /* glsl */ `
if (vFace > 0.5) {
  vec2 cheekE = vec2((abs(vRest.x) - ${CHEEK.x.toFixed(3)}) / ${CHEEK.w.toFixed(3)}, (vRest.y - ${(CHEEK.headY + CHEEK.dy).toFixed(3)}) / ${CHEEK.h.toFixed(3)});
  float cheekW = (1.0 - smoothstep(0.2, 1.0, length(cheekE))) * smoothstep(0.05, 0.1, vRest.z);
  diffuseColor.rgb = mix(diffuseColor.rgb, uCheek, cheekW * ${CHEEK.k.toFixed(2)});
}`;

export interface CrowdMats {
  body: T.MeshToonMaterial;
  outline: T.MeshBasicMaterial;
}

/** The toon body material and its ink outline, posed by the instance attributes. */
export function crowdMaterials(THREE: Three, gradient: T.Texture | null, ink: string): CrowdMats {
  const fixed = FIXED.map((c) => (c ? new THREE.Color(c) : new THREE.Color(1, 1, 1)));
  const body = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: gradient ?? undefined });
  body.onBeforeCompile = (sh) => {
    sh.uniforms.uFixed = { value: fixed };
    sh.uniforms.uCheek = { value: fixed[ROLE.cheek] };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CROWD_GLSL}\nvarying vec3 vCrowd;\nvarying float vGlow;\nvarying vec3 vRest;\nvarying float vFace;`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nvec3 crowdP = position;\ncrowdXf(crowdP, objectNormal);`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = crowdP;\nvCrowd = crowdColour();\nvGlow = (aPart.x > 5.5 && aPart.x < 6.5) ? aMisc.y : 0.0;\nvRest = position;\nvFace = (aPart.x > 1.5 && aPart.x < 2.5 && aPart.y > 1.5 && aPart.y < 2.5) ? 1.0 : 0.0;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vCrowd;\nvarying float vGlow;\nvarying vec3 vRest;\nvarying float vFace;\nuniform vec3 uCheek;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= vCrowd;\n${CHEEK_GLSL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * vec3(1.0, 0.62, 0.3);`);
  };
  body.customProgramCacheKey = () => 'npc-crowd';
  const outline = new THREE.MeshBasicMaterial({ color: ink, side: THREE.BackSide });
  outline.onBeforeCompile = (sh) => {
    sh.uniforms.uFixed = { value: fixed };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${CROWD_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvec3 crowdN = normal;\nif (crowdXf(transformed, crowdN)) transformed += normalize(crowdN) * 0.013;`);
  };
  outline.customProgramCacheKey = () => 'npc-crowd-outline';
  return { body, outline };
}

/** Pack a CSS colour into one float (24-bit integer, exact in a float). */
export function packColor(THREE: Three, c: string): number {
  const col = new THREE.Color(c);
  // linear, like the fixed colours (Color converts from sRGB); 8 bits a channel is plenty for cloth
  const r = Math.round(Math.min(1, col.r) * 255), g = Math.round(Math.min(1, col.g) * 255), b = Math.round(Math.min(1, col.b) * 255);
  return r * 65536 + g * 256 + b;
}
