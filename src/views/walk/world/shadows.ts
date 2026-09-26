// 身临其境's shadows: one soft shadow map from the sun by day (the moon by night) over a square of
// about 64 m that follows the view — what the camera looks at, a little ahead of it — snapped to the
// map's texels so the edges never crawl as you walk. Soft, and never black: the shade keeps the sky's
// warm fill (the hemisphere light), so it reads as a thin wash of warm ink-brown, not a hole.
//
// What casts and what receives is found by looking at the scene now and then (things arrive late:
// regions dress themselves, features put up their stalls, a companion is swapped): anything drawn
// with a lit material receives; solid lit things cast (people, trees, buildings, props), but not the
// ground itself, flat decks and floors, outlines, glass, glows or water. Anything that set castShadow
// or receiveShadow itself (scatter's painted trees, the crowd) is left as it chose.
import * as THREE from 'three';
import type { ShadowSpec } from './quality';

const LIT = (m: THREE.Material) => (m as THREE.MeshToonMaterial).isMeshToonMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial
  || (m as THREE.MeshStandardMaterial).isMeshStandardMaterial || (m as THREE.MeshPhongMaterial).isMeshPhongMaterial;

/** Flat things (ground, decks, floors, slabs, paving, coins) receive but do not cast. */
function flat(g: THREE.BufferGeometry): boolean {
  if (!g.boundingBox) g.computeBoundingBox();
  const b = g.boundingBox;
  if (!b || b.isEmpty()) return true;
  const h = b.max.y - b.min.y, w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z);
  return w > 0.4 && h < w * 0.1;
}

export class ShadowRig {
  private seen = new WeakSet<THREE.Object3D>();
  private scanAt = 0;
  private cam: THREE.OrthographicCamera;
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private fwd = new THREE.Vector3();
  private readonly texel: number;
  private readonly base: number;

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
    const e = spec.extent;
    this.cam.left = -e; this.cam.right = e; this.cam.top = e; this.cam.bottom = -e;
    this.cam.near = 1;
    this.cam.far = 260;
    this.cam.updateProjectionMatrix();
    this.texel = (2 * e) / spec.mapSize;
    this.base = spec.intensity;
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
      if (m.name === 'land' || m.name === 'water' || o.userData.noShadow) return;
      if (m.geometry && flat(m.geometry)) return;
      m.castShadow = true;
    });
  }

  /**
   * Place the shadow's square round what the camera looks at (a little ahead of it), the light coming
   * from `toLight` (unit). The square moves in whole texels, so the edges hold still.
   */
  update(dt: number, camera: THREE.Camera, toLight: THREE.Vector3, night: number): void {
    this.scanAt -= dt;
    if (this.scanAt <= 0) { this.scanAt = 1.5; this.scan(); }
    camera.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const f = this.focus.copy(camera.position).addScaledVector(this.fwd, this.spec.extent * 0.45);
    f.y = camera.position.y - 1.6;
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
