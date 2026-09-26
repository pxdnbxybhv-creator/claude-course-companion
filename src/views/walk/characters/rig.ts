// The shared workshop for the cast: a disposal-tracking kit of toon materials and ink-outlined
// primitives, and a small humanoid rig (body → torso → head / arms with elbows, hips → knees,
// a bell of robe) animated procedurally from MotionState — walk & run cycles, idle breathing and
// blinking, a jump pose, sitting, and every EmoteKind. Characters dress the rig and add their own
// touches through two hooks (onPose, onAfter).
//
// Nothing here imports 'three' at runtime: the namespace is handed in by the factory, so the
// registry (index.ts) can be imported by DOM pages without pulling three.js into their chunk.
import type * as THREE_NS from 'three';
import type { EmoteKind } from '../types';
import type { CharacterModel, MotionState } from './types';

export type T3 = typeof THREE_NS;
export type Group = THREE_NS.Group;
export type Mesh = THREE_NS.Mesh;
export type Obj = THREE_NS.Object3D;
type Geo = THREE_NS.BufferGeometry;
type Mat = THREE_NS.Material;

export const damp = (a: number, b: number, lambda: number, dt: number) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const smooth = (x: number) => { const k = clamp(x); return k * k * (3 - 2 * k); };
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;
/** Ink outline width (m, before the rig's scale). */
export const OL = 0.013;

/** The figures' ink line: brown-black, like pine-soot ink on warm paper. */
export const INK_LINE = '#2a1f18';

/** Toon shading that reads the gradient's colour (three reads only .r): warm shade bands. */
function warmToon(m: THREE_NS.MeshToonMaterial): void {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <gradientmap_pars_fragment>',
      `#ifdef USE_GRADIENTMAP
uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
  float dotNL = dot( normal, lightDirection );
  vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
  #ifdef USE_GRADIENTMAP
    return texture2D( gradientMap, coord ).rgb;
  #else
    vec2 fw = fwidth( coord ) * 0.5;
    return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
  #endif
}`,
    );
  };
  m.customProgramCacheKey = () => 'ch-toon-warm';
}

// ------------------------------------------------------------------------------------------ kit

export class Kit {
  private bin = new Set<{ dispose(): void }>();
  private mats = new Map<string, Mat>();
  private gradient: THREE_NS.DataTexture;

  /** prefers-reduced-motion: no idle fidgets, gentler flutter. */
  readonly reduced: boolean;

  constructor(readonly THREE: T3, reduced?: boolean) {
    this.reduced = reduced ?? (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    // three soft bands — shade, half-light, light — the flat washes of a painted figure. The bands
    // are tinted (the shader below reads all three channels): shade falls into a warm ink-brown,
    // the half-light into ochre, the light into a sunlit paper-gold — never a cold grey.
    const data = new Uint8Array([176, 146, 124, 255, 226, 206, 184, 255, 255, 250, 238, 255]);
    const g = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    g.minFilter = g.magFilter = THREE.NearestFilter;
    g.generateMipmaps = false;
    g.needsUpdate = true;
    this.gradient = this.add(g);
  }

  add<X extends { dispose(): void }>(x: X): X {
    this.bin.add(x);
    return x;
  }

  toon(color: string, o: { double?: boolean; opacity?: number; emissive?: string; map?: THREE_NS.Texture; vertexColors?: boolean } = {}): THREE_NS.MeshToonMaterial {
    const key = `t|${color}|${o.double ? 1 : 0}|${o.opacity ?? 1}|${o.emissive ?? ''}|${o.map?.uuid ?? ''}|${o.vertexColors ? 1 : 0}`;
    const hit = this.mats.get(key);
    if (hit) return hit as THREE_NS.MeshToonMaterial;
    const T = this.THREE;
    const m = new T.MeshToonMaterial({
      color, gradientMap: this.gradient,
      side: o.double ? T.DoubleSide : T.FrontSide,
      transparent: o.opacity !== undefined && o.opacity < 1,
      opacity: o.opacity ?? 1,
      ...(o.emissive ? { emissive: new T.Color(o.emissive) } : {}),
      ...(o.map ? { map: o.map } : {}),
      ...(o.vertexColors ? { vertexColors: true } : {}),
    });
    if (m.transparent) m.depthWrite = false;
    warmToon(m);
    this.mats.set(key, this.add(m));
    return m;
  }

  /** Mark objects the character animates on their own (moves, scales, shows/hides): bake() leaves them be. */
  keep(...objs: Obj[]): void {
    for (const o of objs) o.userData.keep = true;
  }

  basic(color: string, o: { opacity?: number; double?: boolean; additive?: boolean } = {}): THREE_NS.MeshBasicMaterial {
    const key = `b|${color}|${o.opacity ?? 1}|${o.double ? 1 : 0}|${o.additive ? 1 : 0}`;
    const hit = this.mats.get(key);
    if (hit) return hit as THREE_NS.MeshBasicMaterial;
    const T = this.THREE;
    const m = new T.MeshBasicMaterial({
      color, transparent: (o.opacity ?? 1) < 1 || !!o.additive, opacity: o.opacity ?? 1,
      side: o.double ? T.DoubleSide : T.FrontSide,
      blending: o.additive ? T.AdditiveBlending : T.NormalBlending,
    });
    if (m.transparent) m.depthWrite = false;
    this.mats.set(key, this.add(m));
    return m;
  }

  /** Rouge painted onto skin: a soft round wash (see facePatch), `opacity` at its heart. */
  rouge(color: string, opacity: number): THREE_NS.MeshBasicMaterial {
    const key = `r|${color}|${opacity}`;
    const hit = this.mats.get(key);
    if (hit) return hit as THREE_NS.MeshBasicMaterial;
    const T = this.THREE;
    if (!this.washTex) this.washTex = this.add(washTexture(T));
    const m = new T.MeshBasicMaterial({
      color, map: this.washTex, transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    });
    this.mats.set(key, this.add(m));
    return m;
  }
  private washTex: THREE_NS.DataTexture | null = null;

  /** Inverted-hull ink outline: back faces pushed out along the normal (a warm brown-black ink). */
  outline(width: number, color = INK_LINE): THREE_NS.MeshBasicMaterial {
    const w = Math.round(width * 2000) / 2000;
    const key = `o|${w}|${color}`;
    const hit = this.mats.get(key);
    if (hit) return hit as THREE_NS.MeshBasicMaterial;
    const m = new this.THREE.MeshBasicMaterial({ color, side: this.THREE.BackSide });
    m.userData.outline = w;
    if (w === 0) { this.mats.set(key, this.add(m)); return m; } // a baked hull: already pushed out
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uOutline = { value: w };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uOutline;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uOutline;');
    };
    m.customProgramCacheKey = () => `ch-outline-${w}`;
    this.mats.set(key, this.add(m));
    return m;
  }

  /** A mesh plus its ink hull (ow = 0 for none). */
  mesh(geo: Geo, mat: Mat, ow = OL): Mesh {
    const m = new this.THREE.Mesh(geo, mat);
    if (ow > 0) {
      const o = new this.THREE.Mesh(geo, this.outline(ow));
      o.name = 'outline';
      o.raycast = () => {};
      m.add(o);
    }
    return m;
  }

  // --- geometry (all tracked; sizes are real, so outlines stay even)
  sphere(r: number, sx = 1, sy = 1, sz = 1, ws = 18, hs = 14): Geo {
    const g = new this.THREE.SphereGeometry(r, ws, hs);
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    return this.add(g);
  }
  /** Part of a sphere: theta from the top (0) to thetaLen. */
  cap(r: number, thetaLen: number, ws = 18, hs = 8, phiStart = 0, phiLen = Math.PI * 2): Geo {
    return this.add(new this.THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, 0, thetaLen));
  }
  /** Upright cylinder. anchor 'top' hangs it below y = 0, 'bottom' stands it on y = 0. */
  cyl(rt: number, rb: number, h: number, seg = 12, anchor: 'top' | 'center' | 'bottom' = 'center', open = false): Geo {
    const g = new this.THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
    if (anchor === 'top') g.translate(0, -h / 2, 0);
    else if (anchor === 'bottom') g.translate(0, h / 2, 0);
    return this.add(g);
  }
  box(w: number, h: number, d: number): Geo {
    return this.add(new this.THREE.BoxGeometry(w, h, d));
  }
  /** Revolve [radius, y] points round the y axis. */
  lathe(pts: [number, number][], segs = 20): Geo {
    return this.add(new this.THREE.LatheGeometry(pts.map(([r, y]) => new this.THREE.Vector2(Math.max(0.0001, r), y)), segs));
  }
  torus(R: number, t: number, rs = 8, ts = 24, arc = Math.PI * 2): Geo {
    return this.add(new this.THREE.TorusGeometry(R, t, rs, ts, arc));
  }
  /** A tube along a smooth curve through the points, tapering from r0 to r1. */
  tube(pts: [number, number, number][], r0: number, r1 = r0, seg = 20, radial = 7): Geo {
    const T = this.THREE;
    const curve = new T.CatmullRomCurve3(pts.map(([x, y, z]) => new T.Vector3(x, y, z)));
    const g = new T.TubeGeometry(curve, seg, 1, radial, false);
    if (r0 !== r1 || r0 !== 1) {
      // taper: pull each ring toward its centre
      const pos = g.attributes.position;
      const c = new T.Vector3(), p = new T.Vector3();
      for (let i = 0; i <= seg; i++) {
        const u = i / seg;
        curve.getPointAt(u, c);
        const r = r0 + (r1 - r0) * u;
        for (let j = 0; j <= radial; j++) {
          const k = i * (radial + 1) + j;
          p.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
          pos.setXYZ(k, p.x, p.y, p.z);
        }
      }
      pos.needsUpdate = true;
      g.computeVertexNormals();
    }
    return this.add(g);
  }
  /** A flat shape extruded a little (fans, blades, ears, leaves). */
  shape(outline: [number, number][], depth = 0.01, bevel = 0.004): Geo {
    const T = this.THREE;
    const s = new T.Shape(outline.map(([x, y]) => new T.Vector2(x, y)));
    const g = new T.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 8 });
    g.translate(0, 0, -depth / 2);
    return this.add(g);
  }
  /** A small painted canvas texture. */
  tex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE_NS.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (g) draw(g, w, h);
    const t = new this.THREE.CanvasTexture(c);
    t.colorSpace = this.THREE.SRGBColorSpace;
    t.anisotropy = 2;
    return this.add(t);
  }

  group(parent?: Obj, x = 0, y = 0, z = 0): Group {
    const g = new this.THREE.Group();
    g.position.set(x, y, z);
    parent?.add(g);
    return g;
  }

  dispose(): void {
    for (const it of this.bin) {
      try { it.dispose(); } catch { /* already gone */ }
    }
    this.bin.clear();
    this.mats.clear();
  }
}

// ------------------------------------------------------------------------------------------ bake

type Part = { geo: Geo; m: THREE_NS.Matrix4; color?: THREE_NS.Color; push?: number; bone: number };

/** Merge parts (each in its joint's space) into one indexed geometry, each vertex bound to its joint. */
function mergeParts(kit: Kit, parts: Part[], withColor: boolean, bare: boolean): Geo {
  const T = kit.THREE;
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.geo.attributes.position.count; ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = bare ? null : new Float32Array(nv * 3), uv = bare ? null : new Float32Array(nv * 2);
  const col = withColor ? new Float32Array(nv * 3) : null;
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const v = new T.Vector3(), n = new T.Vector3(), nm = new T.Matrix3();
  let ov = 0, oi = 0;
  for (const p of parts) {
    const g = p.geo, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(p.m);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      if (N) n.fromBufferAttribute(N, i);
      // an ink hull: the outline shader's push along the normal, baked in (in the part's own space)
      if (p.push && N) v.addScaledVector(n.lengthSq() > 0 ? n.normalize() : n, p.push);
      v.applyMatrix4(p.m);
      pos[(ov + i) * 3] = v.x; pos[(ov + i) * 3 + 1] = v.y; pos[(ov + i) * 3 + 2] = v.z;
      if (nor) {
        if (N) n.applyMatrix3(nm).normalize(); else n.set(0, 1, 0);
        nor[(ov + i) * 3] = n.x; nor[(ov + i) * 3 + 1] = n.y; nor[(ov + i) * 3 + 2] = n.z;
      }
      if (uv) { uv[(ov + i) * 2] = U ? U.getX(i) : 0; uv[(ov + i) * 2 + 1] = U ? U.getY(i) : 0; }
      if (col && p.color) { col[(ov + i) * 3] = p.color.r; col[(ov + i) * 3 + 1] = p.color.g; col[(ov + i) * 3 + 2] = p.color.b; }
      si[(ov + i) * 4] = p.bone; sw[(ov + i) * 4] = 1;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.getX(i) + ov;
    else for (let i = 0; i < P.count; i++) idx[oi + i] = i + ov;
    oi += g.index ? g.index.count : P.count;
    ov += P.count;
  }
  const out = kit.add(new T.BufferGeometry());
  out.setAttribute('position', new T.BufferAttribute(pos, 3));
  if (nor) out.setAttribute('normal', new T.BufferAttribute(nor, 3));
  if (uv) out.setAttribute('uv', new T.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new T.BufferAttribute(col, 3));
  out.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
  out.setAttribute('skinWeight', new T.BufferAttribute(sw, 4));
  out.setIndex(new T.BufferAttribute(idx, 1));
  return out;
}

/**
 * A patch of an ellipsoid's own surface (centre `c`, semi-axes `radii`) round the direction `dir`,
 * a hair above it: `ah` / `av` are its half-widths in radians, across and up. Its uv runs 0..1 over
 * the patch, so a round wash texture lies on it as a soft oval — rouge that follows the curve of
 * the face instead of standing off it.
 */
export function facePatch(T: T3, c: THREE_NS.Vector3, radii: THREE_NS.Vector3, dir: THREE_NS.Vector3, ah: number, av: number, lift = 1.004): THREE_NS.BufferGeometry {
  const nx = 9, ny = 7;
  const f = dir.clone().normalize();
  const right = new T.Vector3(0, 1, 0).cross(f).normalize();
  const up = f.clone().cross(right).normalize();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const d = new T.Vector3();
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / (nx - 1), v = j / (ny - 1);
      d.copy(f).addScaledVector(right, Math.tan((u * 2 - 1) * ah)).addScaledVector(up, Math.tan((v * 2 - 1) * av)).normalize();
      // where this direction meets the ellipsoid
      const t = lift / Math.sqrt((d.x / radii.x) ** 2 + (d.y / radii.y) ** 2 + (d.z / radii.z) ** 2);
      pos.push(c.x + d.x * t, c.y + d.y * t, c.z + d.z * t);
      nor.push(d.x, d.y, d.z);
      uv.push(u, v);
    }
  }
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, e = a + nx, g = e + 1;
      idx.push(a, b, g, a, g, e);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

/** A small white wash whose alpha falls off smoothly from the middle to nothing at the rim. */
export function washTexture(T: T3, n = 32): THREE_NS.DataTexture {
  const data = new Uint8Array(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const r = Math.min(1, Math.hypot(((i + 0.5) / n) * 2 - 1, ((j + 0.5) / n) * 2 - 1));
      const s = r * r * (3 - 2 * r); // smoothstep(0, 1, r)
      const k = (j * n + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(255 * (1 - s));
    }
  }
  const t = new T.DataTexture(data, n, n, T.RGBAFormat);
  t.minFilter = t.magFilter = T.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Fold the figure's still parts into a handful of draws (it is drawn again for the pond's
 * reflection, and a crowd may stand about). Every joint (any non-mesh object: shoulder, elbow,
 * head, a prop's group) becomes a bone of one skeleton, and the meshes hanging from the joints are
 * merged by material across the whole figure: plain opaque toon parts into one vertex-coloured
 * skinned mesh (one per side mode), other materials one each, and every ink hull into one with its
 * push baked in. Each vertex follows its own joint rigidly, so the rig animates exactly as before
 * (joints move, turn, scale, are re-parented, and a hidden joint hides its parts). Objects marked
 * with kit.keep() — and anything under them — are left alone, as are multi-material meshes.
 */
export function bake(kit: Kit, root: Obj): void {
  const T = kit.THREE;
  const isMesh = (o: Obj): o is Mesh => (o as Mesh).isMesh === true && !(o as THREE_NS.InstancedMesh).isInstancedMesh && !(o as THREE_NS.SkinnedMesh).isSkinnedMesh;
  // a mesh can be folded in only if nothing under it is a joint or kept
  const still = (o: Obj): boolean => isMesh(o) && !o.userData.keep && !Array.isArray(o.material) && o.children.every(still);
  const joints: Obj[] = [];
  const walk = (o: Obj) => {
    if (o.userData.keep) return;
    if ((o as Mesh).isMesh !== true) joints.push(o);
    for (const c of o.children) walk(c);
  };
  walk(root);
  const outlineM = kit.outline(0);
  const buckets = new Map<string, { mat: Mat; parts: Part[]; color: boolean; outline: boolean }>();
  const bones: Obj[] = [];
  for (const j of joints) {
    const taken: Mesh[] = [];
    let bone = -1;
    const gather = (o: Mesh, parentM: THREE_NS.Matrix4 | null) => {
      o.updateMatrix();
      const m = parentM ? parentM.clone().multiply(o.matrix) : o.matrix.clone();
      const mat = o.material as Mat;
      const outline = o.name === 'outline';
      let key: string, bmat: Mat, color = false;
      const toon = mat as THREE_NS.MeshToonMaterial;
      if (outline) {
        key = 'outline'; bmat = outlineM;
      } else if (toon.isMeshToonMaterial && !toon.map && !toon.transparent && !toon.vertexColors && toon.emissive.getHex() === 0) {
        const dbl = toon.side === T.DoubleSide;
        key = 'toon|' + (dbl ? 2 : 0); bmat = kit.toon('#ffffff', { double: dbl, vertexColors: true }); color = true;
      } else {
        key = 'm|' + mat.uuid; bmat = mat;
      }
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = { mat: bmat, parts: [], color, outline }));
      const push = outline ? (((mat as THREE_NS.MeshBasicMaterial).userData.outline as number | undefined) ?? 0) : 0;
      if (bone < 0) { bone = bones.length; bones.push(j); }
      b.parts.push({ geo: o.geometry, m, color: color ? toon.color : undefined, push, bone });
      for (const c of o.children) gather(c as Mesh, m);
    };
    for (const c of j.children) if (still(c)) { taken.push(c as Mesh); gather(c as Mesh, null); }
    for (const c of taken) j.remove(c);
  }
  if (!bones.length) return;
  // the bones' offsets are their world matrices (the parts are in joint space: no inverse needed),
  // and a joint hidden anywhere up its chain folds its parts to nothing
  const skel = kit.add(new T.Skeleton(bones as THREE_NS.Bone[], bones.map(() => new T.Matrix4())));
  const tmp = new T.Matrix4();
  const shown = (o: Obj): boolean => {
    for (let p: Obj | null = o; p; p = p.parent) { if (!p.visible) return false; if (p === root) return true; }
    return false;
  };
  skel.update = function update(this: THREE_NS.Skeleton) {
    const arr = this.boneMatrices as Float32Array | null;
    if (!arr) return;
    for (let i = 0; i < bones.length; i++) {
      const b = bones[i];
      if (shown(b)) b.matrixWorld.toArray(arr, i * 16);
      else tmp.makeScale(0, 0, 0).toArray(arr, i * 16);
    }
    if (this.boneTexture) this.boneTexture.needsUpdate = true;
  };
  const ident = new T.Matrix4();
  // a generous fixed bound in the root's space (the skinned sphere would be measured once, in one pose)
  const bound = new T.Sphere(new T.Vector3(0, 0.9, 0), 2.4);
  for (const b of buckets.values()) {
    const mesh = new T.SkinnedMesh(mergeParts(kit, b.parts, b.color, b.outline), b.mat);
    mesh.name = b.outline ? 'outline' : 'baked';
    mesh.bind(skel, ident);
    mesh.boundingSphere = bound;
    mesh.layers.mask = root.layers.mask; // (the world moves the walker between layers for the pond)
    mesh.raycast = () => {};
    root.add(mesh);
  }
}

/** Add obj to parent at a position / rotation; returns obj. */
export function put<O extends Obj>(parent: Obj, obj: O, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): O {
  obj.position.set(x, y, z);
  obj.rotation.set(rx, ry, rz);
  parent.add(obj);
  return obj;
}

// ------------------------------------------------------------------------------------------ ribbons

/** A cloth strip whose centre line is recomputed every frame (披帛, hair ribbons, veils' ties). */
export class Ribbon {
  readonly mesh: Mesh;
  private pos: THREE_NS.BufferAttribute;
  private geo: THREE_NS.BufferGeometry;
  private c: THREE_NS.Vector3;
  private s: THREE_NS.Vector3;

  /** Twist along the length (radians from root to tip), so a hanging strip never goes edge-on. */
  twist = 0;
  /**
   * Show the strip's face along this axis (e.g. 0,0,1: to the camera behind and to the front):
   * the across direction is derived from the centre line (tangent × axis) instead of the callback's.
   */
  face: THREE_NS.Vector3 | null = null;
  private cs: Float32Array;
  private ss: Float32Array;

  constructor(private kit: Kit, color: string, readonly n: number, private width: (u: number) => number, opacity = 1) {
    const T = kit.THREE;
    this.geo = kit.add(new T.BufferGeometry());
    this.pos = new T.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.pos.setUsage(T.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    this.geo.setIndex(idx);
    this.mesh = new T.Mesh(this.geo, kit.toon(color, { double: true, opacity }));
    this.mesh.frustumCulled = false;
    kit.keep(this.mesh);
    this.c = new T.Vector3();
    this.s = new T.Vector3();
    this.cs = new Float32Array(n * 3);
    this.ss = new Float32Array(n * 3);
  }

  /** fn(u, centre, side) fills the centre point and the (unit) across direction for u in 0..1. */
  update(fn: (u: number, centre: THREE_NS.Vector3, side: THREE_NS.Vector3) => void): void {
    const n = this.n, cs = this.cs, ss = this.ss;
    for (let i = 0; i < n; i++) {
      this.s.set(1, 0, 0);
      fn(i / (n - 1), this.c, this.s);
      cs[i * 3] = this.c.x; cs[i * 3 + 1] = this.c.y; cs[i * 3 + 2] = this.c.z;
      ss[i * 3] = this.s.x; ss[i * 3 + 1] = this.s.y; ss[i * 3 + 2] = this.s.z;
    }
    const f = this.face;
    const a = this.pos.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      let sx = ss[i * 3], sy = ss[i * 3 + 1], sz = ss[i * 3 + 2];
      if (f) {
        // tangent × axis, with a little of the callback's side so a strip running along the axis stays put
        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
        const tx = cs[i1 * 3] - cs[i0 * 3], ty = cs[i1 * 3 + 1] - cs[i0 * 3 + 1], tz = cs[i1 * 3 + 2] - cs[i0 * 3 + 2];
        const tl = Math.hypot(tx, ty, tz) || 1;
        const k = 0.2;
        const x = (ty * f.z - tz * f.y) / tl + sx * k, y = (tz * f.x - tx * f.z) / tl + sy * k, z = (tx * f.y - ty * f.x) / tl + sz * k;
        const l = Math.hypot(x, y, z) || 1;
        sx = x / l; sy = y / l; sz = z / l;
      }
      if (this.twist) {
        const an = this.twist * u, ca = Math.cos(an), sa = Math.sin(an);
        const x = sx, z = sz;
        sx = x * ca + z * sa; sz = -x * sa + z * ca;
      }
      const w = this.width(u) / 2;
      const cx = cs[i * 3], cy = cs[i * 3 + 1], cz = cs[i * 3 + 2];
      a[i * 6] = cx - sx * w; a[i * 6 + 1] = cy - sy * w; a[i * 6 + 2] = cz - sz * w;
      a[i * 6 + 3] = cx + sx * w; a[i * 6 + 4] = cy + sy * w; a[i * 6 + 5] = cz + sz * w;
    }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    void this.kit;
  }
}

// ------------------------------------------------------------------------------------------ trails

/**
 * Ink left in the air: a strip that follows a tip (a brush's point) through `space` while drawing,
 * then lingers and fades. The strip faces along `face` (the figure's front/back).
 */
export class Trail {
  readonly mesh: Mesh;
  private rib: Ribbon;
  private buf: Float32Array;
  private count = 0;
  private mat: THREE_NS.MeshBasicMaterial;
  private v: THREE_NS.Vector3;
  private readonly peak: number;

  /** `step`: the least distance (m) between recorded points, so n points cover n × step of stroke. */
  constructor(kit: Kit, color: string, private n: number, width: number, opacity = 0.9, private step = 0.03, private space?: Obj) {
    const T = kit.THREE;
    this.peak = opacity;
    this.rib = new Ribbon(kit, color, n, (u) => width * (0.3 + 0.7 * Math.sin(Math.PI * (0.08 + 0.84 * u))));
    this.mat = kit.add(new T.MeshBasicMaterial({ color, transparent: true, opacity, side: T.DoubleSide, depthWrite: false }));
    this.rib.mesh.material = this.mat;
    this.rib.face = new T.Vector3(0, 0, 1);
    this.mesh = this.rib.mesh;
    this.mesh.visible = false;
    this.buf = new Float32Array(n * 3);
    this.v = new T.Vector3();
  }

  /** Start a new stroke. */
  reset(): void {
    this.count = 0;
    this.mesh.visible = false;
  }

  /** Add the tip's current position (a world object) to the stroke. */
  follow(tip: Obj): void {
    const v = this.v;
    tip.updateWorldMatrix(true, false);
    v.setFromMatrixPosition(tip.matrixWorld);
    const sp = this.space ?? this.mesh.parent;
    if (sp) { sp.updateWorldMatrix(true, false); sp.worldToLocal(v); }
    this.point(v.x, v.y, v.z);
  }

  /** Add a point (in the stroke's own space) to the stroke. */
  point(x: number, y: number, z: number): void {
    const v = this.v.set(x, y, z);
    const b = this.buf, n = this.n;
    if (this.count > 0) {
      const i = (this.count - 1) * 3;
      if (Math.hypot(v.x - b[i], v.y - b[i + 1], v.z - b[i + 2]) < this.step) return;
    }
    if (this.count === n) { b.copyWithin(0, 3); this.count--; }
    b[this.count * 3] = v.x; b[this.count * 3 + 1] = v.y; b[this.count * 3 + 2] = v.z;
    this.count++;
  }

  /** Draw what there is at this opacity (0..1 of the peak). */
  draw(alpha: number): void {
    const c = this.count;
    this.mesh.visible = c >= 3 && alpha > 0.01;
    if (!this.mesh.visible) return;
    this.mat.opacity = this.peak * alpha;
    const b = this.buf;
    this.rib.update((u, ce, si) => {
      const x = u * (c - 1), i = Math.floor(x), k = x - i, j = Math.min(c - 1, i + 1);
      ce.set(mix(b[i * 3], b[j * 3], k), mix(b[i * 3 + 1], b[j * 3 + 1], k), mix(b[i * 3 + 2], b[j * 3 + 2], k));
      si.set(0, 1, 0);
    });
  }
}

// ------------------------------------------------------------------------------------------ eyes

export class Blinker {
  private next: number;
  constructor(private seed = 1) { this.next = 1.5 + (seed % 7) * 0.3; }
  /** 1 open … 0.1 shut. */
  at(t: number): number {
    if (t > this.next + 0.13) this.next = t + 2.2 + ((t * 5.31 + this.seed) % 3.2);
    return t > this.next && t < this.next + 0.13 ? 0.12 : 1;
  }
}

// ------------------------------------------------------------------------------------------ humanoid

export interface HumanSpec {
  /** Overall size multiplier (natural figure ≈ 1.4 m to the top of the head). */
  scale: number;
  skin: string;
  robe: string;
  /** Lower robe / skirt colour (default robe). */
  skirt?: string;
  trim: string;
  hair: string;
  sash?: string | null;
  shoe?: string;
  pants?: string;
  /** Hem height above the ground (m, natural): 0.06 ankle-length … 0.34 knee-length. */
  hem?: number;
  /** Hem radius. */
  flare?: number;
  sleeve?: 'wide' | 'narrow' | 'long';
  /** Shoulder half-width. */
  shoulder?: number;
  /** Torso girth multiplier. */
  girth?: number;
  headR?: number;
  eyes?: 'dot' | 'smile' | 'fierce' | 'lady' | 'old' | 'sleepy';
  blush?: number;
  /** The hair cap over the skull (false for hats that cover it, or bald). */
  hairCap?: boolean;
  /** Sash ribbons hanging at the front. */
  sashTails?: boolean;
  /** Draw legs as trousers below a short hem. */
  mouth?: 'none' | 'smile' | 'o' | 'line';
  brows?: string | null;
}

export interface Style {
  /** Stride per step cycle at walking pace (m, natural). */
  stride: number;
  runStride: number;
  legSwing: number;
  armSwing: number;
  /** Forward lean while walking / running (rad). */
  lean: number;
  runLean: number;
  bounce: number;
  /** Baseline stoop (rad), e.g. an old man. */
  stoop: number;
  /** Tipsy sway amplitude. */
  sway: number;
  /** Floats instead of walking: legs still, hover height (m). */
  hover: number;
  /** Run with arms trailing behind (wuxia). */
  trailArms: boolean;
}

const STYLE: Style = { stride: 0.84, runStride: 1.3, legSwing: 0.55, armSwing: 0.42, lean: 0.06, runLean: 0.2, bounce: 0.03, stoop: 0, sway: 0, hover: 0, trailArms: false };

/** Every animated angle / offset of the rig. */
export interface Pose {
  bodyY: number; bodyX: number; bodyZ: number; bodyYaw: number;
  torsoX: number; torsoY: number; torsoZ: number;
  headX: number; headY: number; headZ: number;
  shLx: number; shLy: number; shLz: number; elLx: number; elLz: number;
  shRx: number; shRy: number; shRz: number; elRx: number; elRz: number;
  hipLx: number; hipLz: number; knL: number;
  hipRx: number; hipRz: number; knR: number;
  skX: number; skZ: number; skS: number; skF: number;
  lift: number;
}
const POSE_KEYS: (keyof Pose)[] = [
  'bodyY', 'bodyX', 'bodyZ', 'bodyYaw', 'torsoX', 'torsoY', 'torsoZ', 'headX', 'headY', 'headZ',
  'shLx', 'shLy', 'shLz', 'elLx', 'elLz', 'shRx', 'shRy', 'shRz', 'elRx', 'elRz',
  'hipLx', 'hipLz', 'knL', 'hipRx', 'hipRz', 'knR', 'skX', 'skZ', 'skS', 'skF', 'lift',
];
function zeroPose(): Pose {
  const p = {} as Pose;
  for (const k of POSE_KEYS) p[k] = 0;
  p.skS = 1; p.skF = 1;
  return p;
}

export interface Frame {
  dt: number;
  t: number;
  s: MotionState;
  /** 0 standing … 1 walking pace (and above when running). */
  gait: number;
  run: boolean;
  phase: number;
  /** Emote progress 0..1 and its blend 0..1. */
  emote: EmoteKind | null;
  u: number;
  env: number;
  air: boolean;
  /** Seconds standing still. */
  idle: number;
  /** Seconds since this emote began (0 when none). */
  since: number;
  /** The idle fidget playing (see Fidget), its blend 0..1, progress 0..1 and seconds in. */
  fidget: string | null;
  fk: number;
  fu: number;
  fs: number;
  reduced: boolean;
}

/**
 * A little something a figure does after standing still for a few seconds (licks a paw, sips
 * from the gourd, strokes the beard). The rig plays them in turn with pauses between; `pose`
 * bends the target pose by k (0..1, the fidget's blend) — characters may also read f.fidget.
 */
export interface Fidget {
  id: string;
  /** Seconds. */
  dur: number;
  pose?(p: Pose, k: number, u: number, secs: number, f: Frame): void;
  /** The mouth moves (reciting, humming, a yawn when `lid` is low too). */
  mouth?: boolean;
  /** Eyelids (1 open … 0.1 shut) while it plays. */
  lid?: number;
}

/** Blend pose keys toward values by a weight, without allocating a closure per frame. */
export class Mixer {
  private p: Pose = zeroPose();
  private k = 1;
  set(p: Pose, k: number): this { this.p = p; this.k = k; return this; }
  readonly m = (key: keyof Pose, v: number): void => { this.p[key] += (v - this.p[key]) * this.k; };
  /** Add to a key, scaled by the weight. */
  readonly add = (key: keyof Pose, v: number): void => { this.p[key] += v * this.k; };
}
const MX = new Mixer();

export interface Arm { sh: Group; el: Group; hand: Group; sleeve: Mesh }
export interface Leg { hip: Group; knee: Group; foot: Mesh }

/** Natural heights of the rig. */
export const H = { hip: 0.36, knee: 0.2, waist: 0.6, shoulder: 0.26, neck: 0.33, headC: 0.15 };

export class Human implements CharacterModel {
  readonly root: Group;
  /** Turns the figure (built facing +z) to face −z, as the contract asks. */
  readonly flip: Group;
  /** Scaled container; hover lives here. */
  readonly scaler: Group;
  readonly body: Group;
  readonly torso: Group;
  readonly chest: Group;
  readonly head: Group;
  /** Attach point on the upper back (y at the shoulder blades, z behind). */
  readonly back: Group;
  readonly waist: Group;
  readonly skirt: Group;
  readonly skirtMesh: Mesh;
  readonly armL: Arm;
  readonly armR: Arm;
  readonly legL: Leg;
  readonly legR: Leg;
  /** Both eyes, in one row that blinks as one (y at the eyes' centre). */
  readonly eyes: Group;
  readonly style: Style;
  height: number;
  headR: number;
  /** Character hooks. */
  onPose?: (p: Pose, f: Frame) => void;
  onAfter?: (f: Frame) => void;
  /** Idle fidgets, played in turn after a few seconds standing (none under reduced motion). */
  fidgets: Fidget[] = [];
  /** A pose mixer for the hooks: `const m = h.mx.set(p, f.env).m;` */
  readonly mx = new Mixer();
  /** The mouth that opens while talking (and yawning); the resting mouth hides meanwhile. */
  readonly talkMouth: Mesh;
  private restMouth: Mesh | null = null;
  /** A wooden mallet for 'build', in the right hand (the character's own hand props hide). */
  readonly mallet: Group;
  /** The character builds its own way (with its own tools): no mallet, its hand props stay. */
  ownBuild = false;
  /** Extra yaw (a dance turn), applied undamped so a full turn never unwinds. */
  private spinYaw = 0;
  private fid = -1;
  private fidT = 0;
  private fidRest = 3.2;
  private fidN = 0;
  private fidGate = 0;
  private readonly seed: number;
  private readonly frame: Frame;

  private robed: boolean;
  private baked = false;
  private cur = zeroPose();
  private tgt = zeroPose();
  private phase = 0;
  private blink: Blinker;
  private lookAt = 3;
  private lookYaw = 0;
  private lookPitch = 0;
  private wasGrounded = true;
  private landed = 0;
  private idleT = 0;
  private swayT = 0;
  private lastKey: string | null = null;
  private emoteSeen = 0;
  private seatT = 0;
  /** 0 standing … 1 seated (in the boat, or the sit / row emotes); characters read it in their hooks. */
  seat = 0;
  /** Right-hand attach point, for a prop a feature lends the walker (a fishing rod, an arrow). */
  readonly hand: Obj;
  /** What a feature has put in the hand ('rod', 'arrow'…), or null. */
  holding: string | null = null;
  /** The character's own props in the right hand, hidden while it holds a feature's prop. */
  readonly handProps: Obj[] = [];

  constructor(readonly kit: Kit, readonly spec: HumanSpec, style: Partial<Style> = {}, seed = 1) {
    const T = kit.THREE;
    this.style = { ...STYLE, ...style };
    this.seed = seed;
    this.frame = { dt: 0, t: 0, s: null as unknown as MotionState, gait: 0, run: false, phase: 0, emote: null, u: 0, env: 0, air: false, idle: 0, since: 0, fidget: null, fk: 0, fu: 0, fs: 0, reduced: kit.reduced };
    // under a long robe the feet only peek out at the hem
    this.robed = (spec.hem ?? 0.07) < 0.15;
    if (this.robed) this.style.legSwing = Math.min(this.style.legSwing, 0.36);
    this.blink = new Blinker(seed);
    const sp = spec;
    const skin = kit.toon(sp.skin), robe = kit.toon(sp.robe), trim = kit.toon(sp.trim), hair = kit.toon(sp.hair);
    const skirtM = kit.toon(sp.skirt ?? sp.robe);
    const shoeM = kit.toon(sp.shoe ?? '#2a2724');
    const pantsM = kit.toon(sp.pants ?? sp.trim);
    const g = sp.girth ?? 1;
    const shoulder = sp.shoulder ?? 0.155;
    const hr = (this.headR = sp.headR ?? 0.17);

    this.root = new T.Group();
    this.root.name = 'character';
    this.flip = kit.group(this.root);
    this.flip.rotation.y = Math.PI;
    this.scaler = kit.group(this.flip);
    this.scaler.scale.setScalar(sp.scale);
    this.body = kit.group(this.scaler);

    // --- legs: thigh (hip → knee), shin + shoe (knee → ground)
    const mkLeg = (sx: number): Leg => {
      const hip = kit.group(this.body, 0.072 * sx * g, H.hip, 0);
      // under a long robe the thigh is never seen: no ink hull for it (one draw fewer per leg)
      const thigh = kit.mesh(kit.cyl(0.052 * g, 0.046, H.hip - H.knee + 0.02, 10, 'top'), pantsM, this.robed ? 0 : OL * 0.8);
      hip.add(thigh);
      const knee = kit.group(hip, 0, -(H.hip - H.knee), 0);
      const shin = kit.mesh(kit.cyl(0.046, 0.04, H.knee - 0.03, 10, 'top'), pantsM, OL * 0.8);
      knee.add(shin);
      const foot = kit.mesh(kit.sphere(0.058, 1, 0.62, 1.7, 14, 10), shoeM);
      foot.position.set(0, -H.knee + 0.028, 0.03);
      knee.add(foot);
      return { hip, knee, foot };
    };
    this.legL = mkLeg(1);
    this.legR = mkLeg(-1);

    // --- the robe below the waist: a bell of cloth
    this.skirt = kit.group(this.body, 0, H.waist + 0.02, 0);
    const hem = sp.hem ?? 0.07;
    const fl = (sp.flare ?? 0.25) * g;
    const L = H.waist + 0.02 - hem;
    const skirtGeo = kit.lathe([[0, -L], [fl, -L], [fl - 0.006, -L + 0.035], [fl * 0.86, -L * 0.62], [0.16 * g, -L * 0.3], [0.142 * g, -0.02], [0.13 * g, 0.03], [0, 0.03]], 24);
    this.skirtMesh = kit.mesh(skirtGeo, skirtM);
    this.skirt.add(this.skirtMesh);
    const hemRing = new T.Mesh(kit.torus(fl - 0.004, 0.017, 6, 28).rotateX(Math.PI / 2), trim);
    hemRing.position.y = -L + 0.012;
    this.skirt.add(hemRing);

    // --- torso: crossed collar, sash
    this.torso = kit.group(this.body, 0, H.waist, 0);
    this.chest = kit.group(this.torso);
    const sw = shoulder / 0.155;
    const torsoGeo = kit.lathe([[0, 0], [0.135 * g, 0], [0.15 * g, 0.1], [0.152 * g * Math.max(1, sw * 0.95), 0.2], [0.13 * sw, 0.27], [0.07, 0.31], [0.045, 0.34], [0, 0.34]], 22);
    this.chest.add(kit.mesh(torsoGeo, robe));
    const collar = kit.box(0.03, 0.2, 0.02);
    const c1 = put(this.chest, new T.Mesh(collar, trim), 0.02, 0.22, 0.13 * Math.max(1, g * 0.97), -0.35, 0, -0.62);
    const c2 = put(this.chest, new T.Mesh(collar, trim), -0.035, 0.24, 0.12 * Math.max(1, g * 0.97), -0.4, 0, 0.55);
    c2.scale.y = 0.7; void c1;
    this.waist = kit.group(this.torso, 0, 0.03, 0);
    if (sp.sash !== null) {
      const sashM = kit.toon(sp.sash ?? '#a8463a');
      this.waist.add(new T.Mesh(kit.torus(0.143 * g, 0.03, 8, 26).rotateX(Math.PI / 2), sashM));
      if (sp.sashTails !== false) {
        const rib = kit.box(0.036, 0.22, 0.012).translate(0, -0.11, 0);
        put(this.waist, new T.Mesh(rib, sashM), 0.06, -0.01, 0.14 * g, 0.12, 0, 0.02);
        put(this.waist, new T.Mesh(rib, sashM), 0.1, -0.01, 0.13 * g, 0.12, 0, 0.14).scale.y = 0.8;
      }
    }
    this.back = kit.group(this.chest, 0, 0.2, -0.14 * g);

    // --- arms: shoulder → upper sleeve, elbow → forearm sleeve, cuff, hand
    const sleeve = sp.sleeve ?? 'wide';
    const innerDeep = kit.toon('#' + new T.Color(sp.robe).lerp(new T.Color('#2a1f18'), 0.62).getHexString(), { double: true });
    const mkArm = (sx: number): Arm => {
      const sh = kit.group(this.chest, shoulder * sx, H.shoulder, 0);
      const up = kit.mesh(kit.cyl(0.05, 0.062, 0.18, 10, 'top'), robe);
      sh.add(up);
      const el = kit.group(sh, 0, -0.17, 0);
      let sl: Mesh;
      if (sleeve === 'narrow') {
        sl = kit.mesh(kit.cyl(0.056, 0.05, 0.17, 10, 'top'), robe);
        const cuff = new T.Mesh(kit.torus(0.05, 0.012, 6, 14).rotateX(Math.PI / 2), trim);
        cuff.position.y = -0.165;
        el.add(sl, cuff);
      } else {
        const long = sleeve === 'long';
        const len = long ? 0.25 : 0.2;
        const w = long ? 0.115 : 0.095;
        sl = kit.mesh(kit.lathe([[0, -len + 0.02], [w - 0.02, -len + 0.006], [w, -len], [w * 0.95, -len * 0.75], [0.075, -0.05], [0.06, 0.02], [0, 0.02]], 14), robe);
        const cuff = new T.Mesh(kit.torus(w - 0.006, 0.013, 6, 18).rotateX(Math.PI / 2), trim);
        cuff.position.y = -len + 0.004;
        // the dark mouth of the sleeve: a shallow funnel into the dark (so a sleeve seen end-on
        // reads as an opening with the hand in it, never a flat plate)
        const hole = new T.Mesh(kit.cyl(0.03, w - 0.012, 0.07, 14, 'bottom', true), innerDeep);
        hole.position.y = -len - 0.002;
        el.add(sl, cuff, hole);
      }
      const hy = sleeve === 'long' ? -0.235 : -0.2;
      const hand = kit.group(el, 0, hy, 0);
      // the hand itself hangs from the elbow (it never turns on its own): one draw fewer per arm
      put(el, new T.Mesh(kit.sphere(0.042, 1, 1.1, 0.95, 10, 8), skin), 0, hy, 0);
      sh.rotation.z = 0.1 * sx;
      return { sh, el, hand, sleeve: sl };
    };
    this.armL = mkArm(1);
    this.armR = mkArm(-1);
    this.hand = this.armR.hand;

    // --- head
    this.head = kit.group(this.torso, 0, H.neck, 0);
    const neck = new T.Mesh(kit.cyl(0.05, 0.055, 0.08, 8), skin);
    neck.position.y = 0.0;
    this.head.add(neck);
    put(this.head, kit.mesh(kit.sphere(hr, 1, 0.98, 0.98, 24, 18), skin), 0, H.headC, 0);
    if (sp.hairCap !== false) {
      const capM = kit.mesh(kit.cap(hr + 0.009, Math.PI * 0.53, 24, 10), hair);
      put(this.head, capM, 0, H.headC, 0, -0.4, 0, 0);
    }
    this.eyes = this.addFace(sp.eyes ?? 'dot', sp.blush ?? 0.5, sp.mouth ?? 'none', sp.brows ?? null);
    // the talking mouth: a small open 'o', shown while speaking
    this.talkMouth = new T.Mesh(kit.sphere(0.017, 1.15, 1, 0.45, 10, 6), kit.toon('#7a2e24'));
    this.talkMouth.position.set(0, H.headC - 0.085, hr * 0.9 - 0.004);
    this.talkMouth.visible = false;
    kit.keep(this.talkMouth);
    this.head.add(this.talkMouth);
    if (this.restMouth) kit.keep(this.restMouth);

    // a little wooden mallet for building (hidden till then)
    this.mallet = kit.group(this.armR.hand, 0, -0.02, 0.02);
    const wood = kit.toon('#9a6a3c'), head = kit.toon('#6e4a2c');
    put(this.mallet, kit.mesh(kit.cyl(0.011, 0.013, 0.26, 6), wood, OL * 0.5), 0, 0.02, 0.09, Math.PI / 2, 0, 0);
    put(this.mallet, kit.mesh(kit.cyl(0.042, 0.042, 0.13, 10), head, OL * 0.6), 0, 0.02, 0.22, 0, 0, 0);
    this.mallet.visible = false;

    this.height = (H.waist + H.neck + H.headC + hr + 0.02) * sp.scale;
  }

  private addFace(kind: NonNullable<HumanSpec['eyes']>, blush: number, mouth: NonNullable<HumanSpec['mouth']>, brows: string | null): Group {
    const kit = this.kit, T = kit.THREE, hr = this.headR;
    const ink = kit.toon('#221e1a');
    const y = H.headC - 0.015, z = hr * 0.9;
    const row = kit.group(this.head, 0, y, 0);
    const eyeGeo = kind === 'lady' ? kit.sphere(0.017, 1.15, 1.25, 0.5, 10, 8) : kit.sphere(kind === 'old' ? 0.014 : 0.019, 1, 1.15, 0.5, 10, 8);
    const arcGeo = kit.torus(0.02, 0.006, 4, 10, Math.PI).rotateZ(0);
    for (const sx of [1, -1]) {
      const ex = 0.06 * sx;
      if (kind === 'smile' || kind === 'sleepy') {
        const a = new T.Mesh(arcGeo, ink);
        a.position.set(ex, y + 0.005, z);
        if (kind === 'sleepy') a.rotation.z = Math.PI; // ︶ closed, content
        a.scale.set(1, 0.8, 1);
        this.head.add(a);
      } else {
        const e = new T.Mesh(eyeGeo, ink);
        e.position.set(ex, 0, z);
        e.lookAt(ex * 2.5, 0, z + 1);
        row.add(e);
        if (kind === 'lady') {
          const lash = new T.Mesh(kit.box(0.03, 0.005, 0.005), ink);
          lash.position.set(ex + 0.006 * sx, y + 0.016, z - 0.002);
          lash.rotation.z = -0.35 * sx;
          this.head.add(lash);
        }
      }
      if (kind === 'fierce' || kind === 'old' || brows) {
        const bm = kit.toon(brows ?? '#221e1a');
        const b = new T.Mesh(kit.box(kind === 'old' ? 0.05 : 0.045, kind === 'old' ? 0.014 : 0.011, 0.012), bm);
        b.position.set(ex + 0.004 * sx, y + (kind === 'old' ? 0.036 : 0.042), z - 0.01);
        b.rotation.z = kind === 'fierce' ? 0.42 * sx : kind === 'old' ? -0.3 * sx : 0.1 * sx;
        this.head.add(b);
      }
      if (blush > 0) {
        // rouge painted on the skin (a patch of the skull's own surface), not a lump stuck to it
        const c = new T.Vector3(0, H.headC, 0);
        const dir = new T.Vector3(0.1 * sx, y - 0.045 - H.headC, z - 0.025);
        const g = kit.add(facePatch(T, c, new T.Vector3(hr, hr * 0.98, hr * 0.98), dir, 0.25, 0.16));
        this.head.add(new T.Mesh(g, kit.rouge('#e39a8c', Math.min(0.8, 0.2 + blush * 0.6))));
      }
    }
    if (mouth !== 'none') {
      let m: Mesh;
      if (mouth === 'smile') { m = new T.Mesh(kit.torus(0.018, 0.005, 4, 10, Math.PI), ink); m.rotation.z = Math.PI; }
      else if (mouth === 'o') m = new T.Mesh(kit.sphere(0.012, 1, 1.2, 0.5, 8, 6), kit.toon('#6b2a22'));
      else m = new T.Mesh(kit.box(0.03, 0.006, 0.006), ink);
      m.position.set(0, y - 0.07, z - 0.005);
      this.head.add(m);
      this.restMouth = m;
    }
    return row;
  }

  /** Where the skull's centre is, in head space. */
  get headC(): number {
    return H.headC;
  }

  /** Put a feature's prop in the hand (the feature parents it to `hand`), hiding the character's own; null gives it back. */
  hold(prop: string | null): void {
    this.holding = prop;
    for (const o of this.handProps) o.visible = !prop;
  }

  update(dt: number, s: MotionState): void {
    // a negative step (a first rAF stamped before the request) would make every damp and spring explode
    dt = Math.max(0, Math.min(dt, 0.1));
    // the character has finished dressing the rig by now: fold its still parts into a few draws
    if (!this.baked) { this.baked = true; bake(this.kit, this.root); }
    const st = this.style;
    const t = s.t;
    const sc = this.spec.scale;
    const hovering = st.hover > 0;
    const v = s.riding ? 0 : s.speed;
    const run = s.running && v > 2.6;
    const gait = Math.min(1.25, v / 2.1);
    const walkK = Math.min(1, gait);
    const stride = (run ? st.runStride : st.stride) * sc;
    this.phase += (v * dt * Math.PI * 2) / stride;
    const ph = this.phase;
    const sn = Math.sin(ph), cs = Math.cos(ph);
    const air = !s.grounded && !s.riding;
    if (v < 0.15 && !air) this.idleT += dt; else this.idleT = 0;

    // emote progress & blend. Sitting, rowing and riding are one family with one clock (seat), so
    // boarding, a stroke and the pause between strokes never stand the figure up in the boat.
    const e = s.emote;
    const sustained = e === 'sit' || e === 'row';
    const seated = s.riding || sustained;
    this.seatT = clamp(this.seatT + (seated ? dt : -dt) / 0.4);
    const seat = (this.seat = smooth(this.seatT));
    const key = sustained ? 'seat' : e;
    if (key !== this.lastKey) { this.lastKey = key; this.emoteSeen = 0; }
    this.emoteSeen += dt;
    const u = clamp(s.emoteT);
    const env = e ? (sustained ? seat : smooth(Math.min(1, u / 0.14, (1 - u) / 0.18))) : 0;

    const f = this.frame;
    f.dt = dt; f.t = t; f.s = s; f.gait = gait; f.run = run; f.phase = ph; f.emote = e; f.u = u; f.env = env; f.air = air;
    f.idle = this.idleT; f.since = e ? this.emoteSeen : 0;
    const p = this.tgt;
    const legA = st.legSwing * (run ? 1.25 : 1) * walkK;
    const armA = st.armSwing * (run ? 1.3 : 1) * walkK;

    // --- locomotion
    p.hipLx = hovering ? -0.15 * walkK : sn * legA;
    p.hipRx = hovering ? 0.05 * walkK : -sn * legA;
    p.hipLz = 0; p.hipRz = 0;
    const kneeK = (run ? 1.1 : 0.55) * (this.robed ? 0.55 : 1);
    p.knL = hovering ? 0.25 * walkK : Math.max(0, -cs) * kneeK * walkK + 0.02;
    p.knR = hovering ? 0.1 * walkK : Math.max(0, cs) * kneeK * walkK + 0.02;
    if (st.trailArms && run) {
      p.shLx = 1.05; p.shRx = 1.05; p.shLz = 0.25; p.shRz = -0.25; p.elLx = 0; p.elRx = 0;
    } else {
      p.shLx = -sn * armA + (hovering ? -0.1 : 0); p.shRx = sn * armA + (hovering ? -0.1 : 0);
      p.shLz = 0.1 + walkK * 0.06; p.shRz = -0.1 - walkK * 0.06;
      p.elLx = -0.15 - (run ? 0.9 : 0.2 * walkK) - Math.max(0, -sn) * 0.25 * walkK;
      p.elRx = -0.15 - (run ? 0.9 : 0.2 * walkK) - Math.max(0, sn) * 0.25 * walkK;
    }
    p.shLy = 0; p.shRy = 0; p.elLz = 0; p.elRz = 0;
    p.bodyX = st.stoop + (run ? st.runLean : st.lean) * walkK;
    p.bodyZ = 0; p.bodyYaw = 0;
    p.bodyY = hovering ? 0 : Math.abs(cs) * st.bounce * (run ? 1.7 : 1) * walkK;
    p.torsoX = 0; p.torsoY = sn * 0.07 * walkK; p.torsoZ = 0;
    p.headX = -p.bodyX * 0.5; p.headY = 0; p.headZ = 0;
    p.skX = -p.bodyX * 0.45 - 0.05 * walkK - (hovering ? 0.12 * walkK : 0);
    p.skZ = Math.sin(ph - 0.6) * 0.05 * walkK;
    if (this.robed) p.skF = 1 + Math.abs(sn) * 0.06 * walkK;
    p.skS = 1;
    if (!this.robed) p.skF = 1;
    p.lift = hovering ? (st.hover + Math.sin(t * 1.7) * 0.025) * (1 - seat) : 0;

    // idle: breathe, glance round, shift weight
    if (walkK < 0.1 && !e) {
      if (t > this.lookAt) {
        this.lookAt = t + 2.8 + ((t * 7.13) % 3.5);
        const r = Math.floor(t * 3.7) % 4;
        this.lookYaw = [0, 0.4, -0.4, 0.15][r];
        this.lookPitch = [0, -0.05, 0.08, -0.12][r];
      }
      p.headY = this.lookYaw;
      p.headX += this.lookPitch;
      const shift = Math.sin(t * 0.55) * 0.5 + 0.5;
      p.bodyZ = (shift - 0.5) * 0.03;
      p.hipLz = 0.02; p.hipRz = -0.02;
    }
    if (st.sway > 0) {
      const k = 0.55 + walkK * 0.8;
      this.swayT += dt * (0.9 + walkK * 0.6);
      p.bodyZ += Math.sin(this.swayT * 1.3) * st.sway * k;
      p.bodyYaw += Math.sin(this.swayT * 0.8) * st.sway * 0.8 * k;
      p.headZ -= Math.sin(this.swayT * 1.3 - 0.7) * st.sway * 1.3 * k;
    }

    // air
    if (air) {
      const up = s.vy > 0;
      p.hipLx = up ? -0.7 : -0.25; p.hipRx = up ? 0.1 : 0.15;
      p.knL = up ? 1.1 : 0.3; p.knR = up ? 0.6 : 0.2;
      p.shLx = up ? -0.5 : -0.25; p.shRx = up ? -0.5 : -0.25;
      p.shLz = up ? 1.0 : 0.75; p.shRz = up ? -1.0 : -0.75;
      p.elLx = -0.3; p.elRx = -0.3;
      p.skX = 0.15; p.skF = 1.08;
      p.bodyX = up ? 0.05 : -0.05;
    }
    if (!this.wasGrounded && s.grounded) this.landed = 1;
    this.wasGrounded = s.grounded;
    if (this.landed > 0) {
      this.landed = Math.max(0, this.landed - dt * 4.5);
      const k = Math.sin(this.landed * Math.PI);
      p.bodyY -= k * 0.06; p.knL += k * 0.5; p.knR += k * 0.5; p.hipLx -= k * 0.25; p.hipRx -= k * 0.25;
    }

    // idle fidgets: after a few seconds standing, one of the character's little habits
    // (not while holding a feature's prop: no reading a scroll with a fishing rod in hand)
    this.fidgetStep(f, dt, walkK < 0.05 && !e && !air && seat < 0.05 && !s.riding && !this.holding);
    if (f.fidget) this.fidgets[this.fid]?.pose?.(p, f.fk, f.fu, f.fs, f);

    // seated with no seated emote playing (riding between strokes, or a bow / wave in the boat)
    if (seat > 0 && !sustained) emotePose(p, 'sit', 0, seat, t, 0);
    if (e && env > 0) emotePose(p, e, u, env, t, this.emoteSeen);
    // whatever the arms do, the legs stay folded on the seat
    if (seat > 0 && e && !sustained) sitPose(MX.set(p, seat).m);
    // a dance turns the whole figure once round (not under reduced motion)
    // (under reduced motion, a gentle sway from side to side instead: never a still, front-on pose)
    this.spinYaw = e === 'dance' ? (this.kit.reduced ? Math.sin(this.emoteSeen * 1.55) * 0.4 * env : Math.PI * 2 * smooth((u - 0.18) / 0.55)) : 0;
    this.onPose?.(p, f);

    // --- apply, eased
    const c = this.cur;
    const kLimb = run ? 22 : 16;
    for (const k of POSE_KEYS) c[k] = damp(c[k], p[k], k === 'lift' || k === 'bodyY' ? 12 : kLimb, dt);
    this.body.position.y = c.bodyY;
    this.body.rotation.set(c.bodyX, c.bodyYaw + this.spinYaw, c.bodyZ);
    this.scaler.position.y = c.lift * sc;
    this.torso.rotation.set(c.torsoX, c.torsoY, c.torsoZ);
    this.chest.scale.set(1, 1 + Math.sin(t * 1.8) * 0.014 * (1 - walkK), 1);
    this.head.rotation.set(c.headX, c.headY, c.headZ);
    this.armL.sh.rotation.set(c.shLx, c.shLy, c.shLz);
    this.armR.sh.rotation.set(c.shRx, c.shRy, c.shRz);
    this.armL.el.rotation.set(c.elLx, 0, c.elLz);
    this.armR.el.rotation.set(c.elRx, 0, c.elRz);
    this.legL.hip.rotation.set(c.hipLx, 0, c.hipLz);
    this.legR.hip.rotation.set(c.hipRx, 0, c.hipRz);
    this.legL.knee.rotation.x = c.knL;
    this.legR.knee.rotation.x = c.knR;
    this.skirt.rotation.set(c.skX, 0, c.skZ);
    this.skirt.scale.set(c.skF, c.skS, c.skF);
    // the face: blinks; shut while dozing (a start awake at the end), a happy squint dancing
    let lid = this.blink.at(t);
    if (e === 'sleep') lid = u > 0.82 && u < 0.95 ? 1.15 : mix(lid, 0.1, env);
    else if (e === 'dance' || e === 'pet') lid = Math.min(lid, mix(1, 0.45, env));
    const fd = f.fidget ? this.fidgets[this.fid] : null;
    if (fd?.lid !== undefined) lid = Math.min(lid, mix(1, fd.lid, f.fk));
    this.eyes.scale.y = lid;
    const fidMouth = !!fd?.mouth && f.fk > 0.3;
    const talking = (e === 'talk' && env > 0.2) || fidMouth || (e === 'sleep' && u > 0.1 && u < 0.3);
    this.talkMouth.visible = talking;
    if (talking) {
      const ts = e === 'talk' ? this.emoteSeen : f.fs;
      const yawn = fidMouth && (fd?.lid ?? 1) < 0.5;
      const open = yawn || e === 'sleep' ? 1.5 : 0.55 + Math.abs(Math.sin(ts * 11)) * 0.9 * (Math.sin(ts * 2.3) > -0.6 ? 1 : 0.2);
      this.talkMouth.scale.set(1, open, 1);
    }
    if (this.restMouth) this.restMouth.visible = !talking;
    // building: the mallet in the hand, the character's own props (those in the hand) away
    const building = e === 'build' && env > 0.15 && !this.holding && !this.ownBuild;
    this.mallet.visible = building;
    if (!building && this.propsAway) { this.propsAway = false; if (!this.holding) for (const o of this.handProps) o.visible = true; }
    this.onAfter?.(f);
    if (this.holding) for (const o of this.handProps) o.visible = false;
    else if (building) {
      for (const o of this.handProps) if (this.inHand(o)) o.visible = false;
      this.propsAway = true;
    }
  }

  private propsAway = false;
  /** Is o held in the right hand now (not slung on the back)? */
  private inHand(o: Obj): boolean {
    for (let p = o.parent; p; p = p.parent) if (p === this.armR.hand) return true;
    return false;
  }

  private fidgetStep(f: Frame, dt: number, can: boolean): void {
    const n = this.fidgets.length;
    const ok = can && n > 0 && !this.kit.reduced;
    this.fidGate = damp(this.fidGate, ok ? 1 : 0, ok ? 6 : 12, dt);
    if (ok) {
      if (this.fid < 0) {
        this.fidRest -= dt;
        if (this.fidRest <= 0) { this.fid = (this.fidN++ + this.seed) % n; this.fidT = 0; }
      } else {
        this.fidT += dt;
        if (this.fidT >= this.fidgets[this.fid].dur) {
          this.fid = -1;
          this.fidRest = 2.2 + ((this.fidN * 1.37 + this.seed * 0.61) % 2.6);
        }
      }
    } else {
      if (!can) this.fidRest = 3.2;
      if (this.fid >= 0 && this.fidGate < 0.02) this.fid = -1;
    }
    if (this.fid >= 0) {
      const d = this.fidgets[this.fid];
      f.fidget = d.id;
      f.fs = this.fidT;
      f.fu = clamp(this.fidT / d.dur);
      f.fk = smooth(Math.min(1, this.fidT / 0.45, (d.dur - this.fidT) / 0.55)) * this.fidGate;
    } else {
      f.fidget = null; f.fk = 0; f.fu = 0; f.fs = 0;
    }
  }

  dispose(): void {
    this.root.removeFromParent();
    this.kit.dispose();
  }
}

/**
 * How much the pose needs both hands (0..1): the two-handed emotes, and sitting (hands on the
 * knees, or on the oars). Characters blend their prop-arm locks out by this, and put the prop
 * away (on the back, under the arm) while it is high.
 */
export function bothHands(f: Frame, seat: number): number {
  const e = f.emote;
  const k = e === 'row' || e === 'bow' || e === 'throw' || e === 'cast' || e === 'eat' || e === 'jump' || e === 'water'
    || e === 'dance' || e === 'pet' || e === 'build' ? f.env : 0;
  return Math.max(k, seat);
}

/**
 * Orient obj so that, seen from `frame` (an ancestor), it has the rotation `want`, whatever the
 * joints between them are doing — a can that hangs plumb from a hand raised overhead.
 */
export function holdLevel(obj: Obj, frame: Obj, want: THREE_NS.Quaternion, tmp: THREE_NS.Quaternion): void {
  tmp.identity();
  for (let o = obj.parent; o && o !== frame; o = o.parent) tmp.premultiply(o.quaternion);
  obj.quaternion.copy(tmp.invert().multiply(want));
}

/** The generic poses for every EmoteKind (characters may refine them in onPose). */
export function emotePose(p: Pose, e: EmoteKind, u: number, env: number, t: number, since: number): void {
  const m = MX.set(p, env).m;
  switch (e) {
    case 'eat': {
      const chew = Math.sin(since * 16) * 0.06;
      m('shLx', -1.15); m('shLz', -0.25); m('elLx', -1.75);
      m('shRx', -1.1); m('shRz', 0.25); m('elRx', -1.8);
      m('headX', 0.08 + chew); m('bodyX', 0.02);
      break;
    }
    case 'bow': {
      // 作揖: hands folded before the chest, a slow bow
      const deep = Math.sin(clamp((u - 0.1) / 0.75) * Math.PI);
      m('shLx', -0.85); m('shLz', -0.42); m('elLx', -1.35); m('elLz', 0);
      m('shRx', -0.85); m('shRz', 0.42); m('elRx', -1.35);
      // bend at the waist (the robe stays hanging), barely at the ankles
      m('torsoX', 0.04 + deep * 0.4); m('bodyX', 0.02 + deep * 0.06); m('headX', 0.1 + deep * 0.16);
      m('skX', -deep * 0.05);
      break;
    }
    case 'jump': {
      m('shLx', -2.6); m('shLz', 0.45); m('elLx', -0.2);
      m('shRx', -2.6); m('shRz', -0.45); m('elRx', -0.2);
      break;
    }
    case 'wave': {
      const w = Math.sin(since * 9);
      m('shRx', -0.2); m('shRz', -2.55); m('elRz', w * 0.45); m('elRx', -0.25);
      m('headZ', 0.1); m('headX', -0.06); m('bodyZ', 0.04);
      break;
    }
    case 'throw': {
      // wind up (0–.45), whip forward (.45–.6), follow through
      const wind = smooth(u / 0.45), rel = smooth((u - 0.45) / 0.15);
      const sx = mix(mix(-0.3, -2.7, wind), -0.7, rel);
      m('shRx', sx); m('shRz', -0.25); m('elRx', mix(mix(-0.2, -1.2, wind), -0.1, rel));
      m('shLx', mix(-0.9, 0.3, rel)); m('shLz', 0.3); m('elLx', -0.3);
      m('torsoY', mix(mix(0, 0.45, wind), -0.35, rel)); m('bodyX', mix(-0.05, 0.2, rel));
      m('hipLx', -0.35); m('hipRx', 0.25);
      break;
    }
    case 'cast': {
      // two-handed: rod back over the shoulder, then out over the water
      const wind = smooth(u / 0.4), rel = smooth((u - 0.4) / 0.2);
      const a = mix(mix(-0.8, -2.6, wind), -1.15, rel);
      m('shRx', a); m('shRz', 0.15); m('elRx', -0.4);
      m('shLx', a + 0.25); m('shLz', -0.25); m('elLx', -0.7);
      m('bodyX', mix(-0.08 * wind, 0.16, rel)); m('torsoY', mix(0.25 * wind, -0.1, rel));
      m('hipLx', -0.3); m('hipRx', 0.2);
      break;
    }
    case 'row': {
      sitPose(m);
      const k = Math.sin(t * 3.2);
      m('shLx', -1.0 - k * 0.45); m('shRx', -1.0 - k * 0.45);
      m('shLz', -0.15); m('shRz', 0.15);
      m('elLx', -0.5 + k * 0.45); m('elRx', -0.5 + k * 0.45);
      m('torsoX', 0.08 + k * 0.16);
      break;
    }
    case 'sit': {
      sitPose(m);
      const b = Math.sin(t * 1.5) * 0.02;
      m('shLx', -0.55); m('shRx', -0.55); m('shLz', -0.05); m('shRz', 0.05);
      m('elLx', -0.7); m('elRx', -0.7); m('torsoX', 0.04 + b);
      break;
    }
    case 'play': {
      // hands before the body, fingers busy
      const k = Math.sin(since * 11), k2 = Math.sin(since * 13 + 1);
      m('shLx', -0.75 + k * 0.05); m('shLz', -0.1); m('elLx', -0.8 + k2 * 0.08);
      m('shRx', -0.75 - k2 * 0.05); m('shRz', 0.1); m('elRx', -0.85 + k * 0.08);
      m('headX', 0.18); m('bodyX', 0.08); m('headY', Math.sin(since * 1.2) * 0.1);
      break;
    }
    case 'water': {
      const k = Math.sin(since * 5) * 0.06;
      m('shLx', -1.0 + k); m('shLz', -0.3); m('elLx', -0.35);
      m('shRx', -0.95 + k); m('shRz', 0.3); m('elRx', -0.4);
      m('torsoX', 0.24); m('bodyX', 0.04); m('headX', 0.22); m('skX', -0.03);
      break;
    }
    case 'talk': {
      // an open palm that turns over as the words come, a nod, a tilt of the head
      const a = Math.sin(since * 3.1), b = Math.sin(since * 4.7 + 1);
      m('shRx', -0.75 + a * 0.18); m('shRz', 0.12 - b * 0.12); m('elRx', -1.05 + b * 0.2); m('elRz', 0.2);
      m('shLx', -0.25); m('shLz', 0.18); m('elLx', -0.5 + a * 0.08);
      m('headX', 0.02 + Math.sin(since * 5.3) * 0.06); m('headZ', Math.sin(since * 1.4) * 0.09); m('headY', Math.sin(since * 0.9) * 0.12);
      m('torsoY', a * 0.06);
      break;
    }
    case 'pet': {
      // crouch and stroke something small at the feet
      const st = Math.sin(since * 4.2);
      m('bodyY', -0.17); m('bodyX', 0.1);
      m('hipLx', -1.25); m('knL', 1.9); m('hipRx', -0.35); m('knR', 1.65); m('hipLz', 0.12); m('hipRz', -0.1);
      m('torsoX', 0.38); m('headX', 0.28);
      m('shRx', -0.95 + st * 0.22); m('shRz', 0.1); m('elRx', -0.35 - st * 0.12);
      m('shLx', -0.55); m('shLz', 0.15); m('elLx', -1.0);
      m('skX', -0.25); m('skS', 0.72); m('skF', 1.18);
      break;
    }
    case 'build': {
      // hammering: the mallet comes up and down on a peg held in the other hand
      const c = (since * 2.4) % 1;
      const hit = c < 0.62 ? smooth(c / 0.62) : 1 - smooth((c - 0.62) / 0.12);
      m('shRx', mix(-0.55, -2.25, hit)); m('shRz', 0.06); m('elRx', mix(-0.5, -1.15, hit));
      m('shLx', -0.72); m('shLz', -0.12); m('elLx', -0.72);
      m('torsoX', 0.22 - hit * 0.08); m('bodyX', 0.05); m('headX', 0.3); m('hipLx', -0.22); m('hipRx', 0.12);
      break;
    }
    case 'dance': {
      // a sleeve dance (袖舞): one arm swept high, the other low and across, trading on the beat,
      // the hips swaying toward the high arm, a step and a dip of the knees on every beat
      const s = Math.sin(since * 3.1), k = s * 0.5 + 0.5, bob = Math.abs(Math.sin(since * 6.2));
      m('shLx', mix(-2.2, -0.55, k)); m('shLz', mix(0.35, -0.45, k)); m('elLx', mix(-0.6, -0.95, k)); m('elLz', mix(0.25, 0, k));
      m('shRx', mix(-0.55, -2.2, k)); m('shRz', mix(0.45, -0.35, k)); m('elRx', mix(-0.95, -0.6, k)); m('elRz', mix(0, -0.25, k));
      m('bodyY', -0.03 + bob * 0.035); m('bodyZ', -s * 0.06); m('torsoY', -s * 0.22); m('torsoZ', s * 0.05);
      m('headZ', s * 0.1); m('headY', -s * 0.15); m('headX', -0.06);
      m('hipLx', -Math.max(0, s) * 0.35); m('knL', Math.max(0, s) * 0.45 + 0.1); m('hipRx', -Math.max(0, -s) * 0.35); m('knR', Math.max(0, -s) * 0.45 + 0.1);
      m('hipLz', 0.06); m('hipRz', -0.06); m('skF', 1.06 + bob * 0.04); m('skZ', s * 0.06);
      break;
    }
    case 'sleep': {
      // nods off where it stands: head sinks, a slow sway, a start awake near the end
      const wake = u > 0.82 && u < 0.95 ? Math.sin(((u - 0.82) / 0.13) * Math.PI) : 0;
      const sink = smooth(u / 0.25) * (1 - wake);
      m('headX', 0.5 * sink - 0.12 * wake + Math.sin(since * 1.2) * 0.04 * sink);
      m('headZ', 0.12 * sink); m('torsoX', 0.08 * sink); m('bodyZ', Math.sin(since * 0.9) * 0.035 * sink);
      m('shLx', 0.05); m('shRx', 0.05); m('shLz', 0.05); m('shRz', -0.05); m('elLx', -0.08); m('elRx', -0.08);
      m('bodyY', -0.015 * sink);
      if (wake) { m('shLz', 0.5 * wake + 0.05); m('shRz', -0.5 * wake - 0.05); }
      break;
    }
    case 'skill': {
      // the generic flourish (every character has its own in its onPose)
      const up = smooth(u / 0.3);
      m('shRx', -2.4 * up); m('shRz', -0.3); m('elRx', -0.2);
      m('shLx', -0.4); m('shLz', 0.4); m('elLx', -0.8); m('headX', -0.15 * up);
      break;
    }
  }
}

/** Seated on the ground (or a boat's floor): knees up, the robe draped over them. */
export function sitPose(m: (k: keyof Pose, v: number) => void): void {
  // seated on the ground / a boat's floor: knees up, robe draped over them
  m('bodyY', -(H.hip - 0.07));
  m('hipLx', -1.5); m('hipRx', -1.5); m('hipLz', 0.35); m('hipRz', -0.35);
  m('knL', 1.2); m('knR', 1.2);
  m('skX', -0.12); m('skS', 0.42); m('skF', 1.3);
}

/** A tiny spring for dangling things (beards, tassels, ribbons): follows a target angle with lag and overshoot. */
export class Spring {
  v = 0;
  x = 0;
  constructor(private k = 60, private c = 8) {}
  step(target: number, dt: number): number {
    if (!(dt > 0)) return this.x;
    const a = (target - this.x) * this.k - this.v * this.c;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

// ------------------------------------------------------------------------------------------ shared props

/** Woven straw: fine radial lines (maps onto a lathe as spokes). */
export function strawTex(kit: Kit, base: string, line = 'rgba(90,70,35,0.45)', n = 28): THREE_NS.CanvasTexture {
  return kit.tex(128, 32, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = line; g.lineWidth = 1.2;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) * (w / n); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.strokeStyle = 'rgba(255,245,220,0.25)';
    for (let i = 0; i < n; i++) { const x = i * (w / n) + 1.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  });
}

/** A conical bamboo/straw hat (斗笠): brim radius r, peak height ht; origin at the brim's centre. */
export function conicalHat(kit: Kit, r: number, ht: number, color: string, o: { straw?: boolean; knob?: boolean } = {}): Group {
  const g = kit.group();
  const mat = o.straw === false ? kit.toon(color, { double: true }) : kit.toon('#ffffff', { map: strawTex(kit, color), double: true });
  const cone = kit.lathe([[r * 0.98, -0.012], [r, 0], [r * 0.55, ht * 0.5], [r * 0.18, ht * 0.9], [0.0, ht]], 28);
  g.add(kit.mesh(cone, mat, OL * 0.8));
  const rim = new kit.THREE.Mesh(kit.torus(r - 0.004, 0.009, 5, 32).rotateX(Math.PI / 2), kit.toon('#5b4a32'));
  g.add(rim);
  if (o.knob) put(g, new kit.THREE.Mesh(kit.sphere(0.018), kit.toon('#5b4a32')), 0, ht, 0);
  return g;
}
