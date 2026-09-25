// Little portraits of every catalog thing for the build sheet: each one baked like on the plot,
// lit like a sunny morning, drawn from three-quarters above into a small render target and kept
// as an image. Done a few per frame, so opening the sheet never stalls; kept for the session.
import type * as T from 'three';
import { CATALOG, KIND } from '../catalog';
import type { HomeStage } from './stage';
import { BUCKETS, mergeChunks, mergeLines, type Chunk } from './brush';

const cache = new Map<string, string>();
const SIZE = 192, OUT = 112;

/** A thumbnail's data URL, if made. */
export const thumbOf = (kind: string) => cache.get(kind);

/**
 * Make the missing thumbnails, a few per animation frame; `onEach` after each one. Returns a
 * canceller.
 */
export function makeThumbs(stage: HomeStage, onEach: (kind: string) => void): () => void {
  const todo = CATALOG.map((k) => k.id).filter((id) => !cache.has(id));
  if (!todo.length) return () => {};
  const THREE = stage.THREE;
  const r = stage.ctx.renderer;
  let rt: T.WebGLRenderTarget;
  try {
    rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, colorSpace: THREE.SRGBColorSpace });
    rt.texture.internalFormat = 'RGBA8';
    (rt as T.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true; // shaders write sRGB, like the screen
  } catch {
    return () => {};
  }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fbf6ea', '#a99d88', 2.3));
  const sun = new THREE.DirectionalLight('#fff4e0', 1.5);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const buf = new Uint8Array(SIZE * SIZE * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  const out = document.createElement('canvas');
  out.width = out.height = OUT;
  const go = out.getContext('2d')!;
  const img = g.createImageData(SIZE, SIZE);
  let raf = 0, dead = false;

  const one = (id: string) => {
    const kind = KIND[id];
    const b = stage.bakeShow(kind, '', 3, { x: 0, y: 0, z: 0, heading: 0 }, true);
    const objs: T.Object3D[] = [];
    const add = (ch: Chunk | null, mat: T.Material, hull = false) => {
      if (!ch) return;
      const geo = mergeChunks(THREE, [ch])!;
      objs.push(new THREE.Mesh(geo, mat));
      if (hull) objs.push(new THREE.Mesh(geo, stage.mats.hull));
    };
    const M = stage.mats;
    add(b.buckets.solid, M.solid);
    add(b.buckets.soft, M.soft, true);
    add(b.buckets.glow, M.glow, true);
    add(b.buckets.water, M.water);
    if (b.lines) objs.push(new THREE.LineSegments(mergeLines(THREE, [b.lines])!, M.lines));
    void BUCKETS;
    for (const o of objs) scene.add(o);
    // frame the thing's bounds from three-quarters above
    const bx = b.box;
    const cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2, cz = (bx.z0 + bx.z1) / 2;
    const R = Math.max(0.4, Math.hypot(bx.x1 - bx.x0, bx.y1 - bx.y0, bx.z1 - bx.z0) / 2);
    const dir = new THREE.Vector3(0.75, 0.72, 1).normalize();
    cam.position.set(cx + dir.x * R * 4, cy + dir.y * R * 4, cz + dir.z * R * 4);
    cam.lookAt(cx, cy, cz);
    const k = R * 0.92;
    cam.left = -k; cam.right = k; cam.top = k; cam.bottom = -k;
    cam.near = 0.1; cam.far = R * 10;
    cam.updateProjectionMatrix();
    // draw in daylight, then give the hour back
    const prevTarget = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    M.daylight();
    try {
      r.setRenderTarget(rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf);
    } finally {
      r.setRenderTarget(prevTarget);
      r.setClearColor(prevColor, prevAlpha);
      M.setNight(stage.night);
    }
    for (const o of objs) { scene.remove(o); (o as T.Mesh).geometry.dispose(); }
    // flip rows (GL reads bottom-up)
    for (let y = 0; y < SIZE; y++) img.data.set(buf.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    g.putImageData(img, 0, 0);
    go.clearRect(0, 0, OUT, OUT);
    go.imageSmoothingQuality = 'high';
    go.drawImage(canvas, 0, 0, OUT, OUT);
    cache.set(id, out.toDataURL('image/png'));
  };

  const step = () => {
    if (dead) return;
    const t0 = performance.now();
    while (todo.length && performance.now() - t0 < 12) {
      const id = todo.shift()!;
      try { one(id); } catch (e) { console.warn('[home] thumbnail', id, e); }
      onEach(id);
    }
    if (todo.length) raf = requestAnimationFrame(step);
    else finish();
  };
  const finish = () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    rt.dispose();
  };
  raf = requestAnimationFrame(step);
  return finish;
}
