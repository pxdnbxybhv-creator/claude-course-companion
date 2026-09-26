// 身临其境's shadows: one soft shadow map from the sun by day (the moon by night) over a square of
// about 64 m that follows the view — what the camera looks at, a little ahead of it — snapped to the
// map's texels so the edges never crawl as you walk. Soft, and never black: the shade keeps the sky's
// warm fill (the hemisphere light), so it reads as a thin wash of warm ink-brown, not a hole.
//
// What casts and what receives is found by looking at the scene now and then (things arrive late:
// regions dress themselves, features put up their stalls, a companion is swapped): anything drawn
// with a lit material receives; solid lit things cast (people, trees, buildings, props), but not the
// ground itself, flat decks and floors, outlines, glass, glows or water (flat() below). Anything that
// set castShadow or receiveShadow itself (scatter's painted trees, the crowd) is left as it chose, and
// a mesh may ask with userData.castShadow = true (or userData.noShadow = true).
import * as THREE from 'three';
import type { ShadowSpec } from './quality';

const LIT = (m: THREE.Material) => (m as THREE.MeshToonMaterial).isMeshToonMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial
  || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial;

const S = new THREE.Vector3();
const BOX = new THREE.Box3();

/** The share of a geometry's vertices whose normal (under `e`, a world matrix's elements) looks up (within ~18°); sampled. */
function upShare(g: THREE.BufferGeometry, e: ArrayLike<number>): number {
  const n = g.getAttribute('normal');
  if (!n || !n.count) return 0;
  const step = Math.max(1, Math.floor(n.count / 4000));
  let up = 0, all = 0;
  for (let i = 0; i < n.count; i += step) {
    const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
    const wx = e[0] * x + e[4] * y + e[8] * z, wy = e[1] * x + e[5] * y + e[9] * z, wz = e[2] * x + e[6] * y + e[10] * z;
    const l = Math.hypot(wx, wy, wz);
    if (l > 1e-6 && wy / l > 0.95) up++;
    all++;
  }
  return all ? up / all : 0;
}

/**
 * Flat things receive but do not cast: anything lower than a hand (paving, slabs, decks, coins,
 * decals), and ground — a wide sheet whose faces nearly all look up (a bank, a terrace, a lawn).
 * Judged in the world (a floor may be a plane turned to lie down) and by what the faces do, not by
 * the box's proportions alone: a merged street of houses, a garden wall or a run of bridges is
 * 88 m wide and 8 m tall, a slab by its box, yet all walls, roofs and rails.
 */
function flat(m: THREE.Mesh): boolean {
  const g = m.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b || b.isEmpty()) return true;
  m.updateWorldMatrix(true, false);
  let h: number, w: number;
  if ((m as THREE.InstancedMesh).isInstancedMesh) {
    // one of its things (its instances may stand anywhere): the geometry's own box, at the mesh's scale
    m.getWorldScale(S);
    h = (b.max.y - b.min.y) * Math.abs(S.y);
    w = Math.max((b.max.x - b.min.x) * Math.abs(S.x), (b.max.z - b.min.z) * Math.abs(S.z));
  } else {
    BOX.copy(b).applyMatrix4(m.matrixWorld);
    h = BOX.max.y - BOX.min.y;
    w = Math.max(BOX.max.x - BOX.min.x, BOX.max.z - BOX.min.z);
  }
  if (h < 0.25) return true;
  if (w < 6) return false;
  return upShare(g, m.matrixWorld.elements) > 0.8;
}

/** Where the photo camera's shadows should be: a point on the ground, and how much wider than walking (≥ 1). */
export interface ShadowAim { at: THREE.Vector3; reach: number }

export class ShadowRig {
  private seen = new WeakSet<THREE.Object3D>();
  private scanAt = 0;
  private cam: THREE.OrthographicCamera;
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private texel: number;
  private readonly base: number;
  /** The square's half-size now (the photo camera may widen it) and the map's size now (a photograph may double it). */
  private extentNow: number;
  private sizeNow: number;

  constructor(private scene: THREE.Scene, private light: THREE.DirectionalLight, private spec: ShadowSpec, private renderer: THREE.WebGLRenderer | null = null) {
    light.castShadow = true;
    // drawn once a frame, before the frame's first render: the pond's mirror renders the scene again
    // from inside the frame, and must not draw every caster a second time
    if (renderer) renderer.shadowMap.autoUpdate = false;
    const s = light.shadow;
    s.mapSize.set(spec.mapSize, spec.mapSize);
    s.radius = spec.radius;
    s.intensity = spec.intensity;
    // a little bias against acne on the toon washes, and a normal offset small enough that the feet
    // never float off their own shadow (no peter-panning)
    s.bias = -0.00035;
    s.normalBias = 0.035;
    this.cam = s.camera as THREE.OrthographicCamera;
    this.cam.near = 1;
    this.cam.far = 260;
    this.extentNow = spec.extent;
    this.sizeNow = spec.mapSize;
    this.texel = 1;
    this.fit(spec.extent);
    this.base = spec.intensity;
  }

  private fit(e: number): void {
    this.extentNow = e;
    this.cam.left = -e; this.cam.right = e; this.cam.top = e; this.cam.bottom = -e;
    this.cam.updateProjectionMatrix();
    this.texel = (2 * e) / this.sizeNow;
  }

  /**
   * A photograph's frame: a map of twice the texels over the same square (and a radius twice as many
   * texels wide, so the penumbra keeps its width but loses the texels' stair-steps), or back (`fine`
   * false). The map is made anew at the next render, and made again at its own size after.
   */
  setFine(fine: boolean): void {
    const size = fine ? Math.min(4096, this.spec.mapSize * 2) : this.spec.mapSize;
    if (size === this.sizeNow) return;
    const s = this.light.shadow;
    this.sizeNow = size;
    s.mapSize.set(size, size);
    s.radius = this.spec.radius * (size / this.spec.mapSize);
    if (s.map) {
      s.map.depthTexture?.dispose();
      s.map.dispose();
      s.map = null;
    }
    this.fit(this.extentNow);
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
  }

  /** Tag what casts and what receives (new things only). */
  scan(): void {
    this.scene.traverse((o) => {
      if (this.seen.has(o)) return;
      this.seen.add(o);
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.material) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!mats.some(LIT)) return;
      m.receiveShadow = true;
      if (m.castShadow) return;
      if (mats.some((x) => x.transparent || x.side === THREE.BackSide || !LIT(x))) return;
      if (o.userData.castShadow === true) { m.castShadow = true; return; }
      if (m.name === 'land' || m.name === 'ground' || m.name === 'water' || o.userData.noShadow) return;
      if (m.geometry && flat(m)) return;
      m.castShadow = true;
    });
  }

  /**
   * Place the shadow's square round what the camera looks at (a little ahead of it), the light coming
   * from `toLight` (unit). The square moves in whole texels, so the edges hold still. `aim` (the photo
   * camera, which may look down from high up): centre it on this point of the ground instead, `reach`
   * times as wide — a square centred in the air would slide along a low sun, far off what is framed.
   */
  update(dt: number, camera: THREE.Camera, toLight: THREE.Vector3, night: number, aim?: ShadowAim | null): void {
    this.scanAt -= dt;
    if (this.scanAt <= 0) { this.scanAt = 1.5; this.scan(); }
    // (in steps, so the square holds still while the camera does)
    const e = this.spec.extent * (aim ? Math.round(Math.min(1.75, Math.max(1, aim.reach)) * 8) / 8 : 1);
    if (e !== this.extentNow) this.fit(e);
    let f: THREE.Vector3;
    if (aim) f = this.focus.copy(aim.at);
    else {
      camera.getWorldDirection(this.fwd);
      this.fwd.y = 0;
      if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
      this.fwd.normalize();
      f = this.focus.copy(camera.position).addScaledVector(this.fwd, this.spec.extent * 0.45);
      f.y = camera.position.y - 1.6;
    }
    // the light's own axes: snap the focus to texels across them
    this.right.crossVectors(THREE.Object3D.DEFAULT_UP, toLight);
    if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(toLight, this.right).normalize();
    const t = this.texel;
    const a = Math.round(f.dot(this.right) / t) * t, b = Math.round(f.dot(this.up) / t) * t, c = f.dot(toLight);
    f.copy(this.right).multiplyScalar(a).addScaledVector(this.up, b).addScaledVector(toLight, c);
    this.light.target.position.copy(f);
    this.light.position.copy(f).addScaledVector(toLight, 120);
    this.light.target.updateMatrixWorld();
    // moonlight's shadows are fainter
    this.light.shadow.intensity = this.base * (1 - 0.35 * night);
    if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
  }

  dispose(): void {
    this.light.castShadow = false;
    this.light.shadow.map?.dispose();
  }
}
