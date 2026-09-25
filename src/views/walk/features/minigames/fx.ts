// Little water effects shared by the games: expanding ripple rings, a leaping fish, a paper glow.
import type * as T from 'three';
import type { Bag } from '../kit';
import { glowTexture, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';

export interface Ripples {
  /** A ring spreading from (x, y, z); `size` ≈ the final radius (m). */
  spawn(x: number, y: number, z: number, size?: number, strength?: number): void;
}

/** A small pool of ink-grey ripple rings on the water. */
export function ripples(bag: Bag, parent: T.Object3D, n = 8): Ripples {
  const { THREE } = bag.ctx;
  const geo = new THREE.RingGeometry(0.86, 1, 40);
  geo.rotateX(-Math.PI / 2);
  const pool = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#f4efe4', transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.renderOrder = 3;
    bag.add(m, parent);
    return { m, age: 1, life: 1.4, size: 1, strength: 0.5 };
  });
  let next = 0;
  const still = reducedMotion();
  bag.frame((dt) => {
    for (const r of pool) {
      if (!r.m.visible) continue;
      r.age += dt / r.life;
      if (r.age >= 1) { r.m.visible = false; continue; }
      const k = 1 - Math.pow(1 - r.age, 2);
      r.m.scale.setScalar(0.05 + k * r.size);
      (r.m.material as T.MeshBasicMaterial).opacity = (1 - r.age) * r.strength;
    }
  });
  return {
    spawn(x, y, z, size = 0.8, strength = 0.55) {
      const r = pool[next++ % n];
      r.m.position.set(x, y + 0.02, z);
      r.age = 0;
      r.size = size;
      r.life = still ? 0.8 : 1.1 + size * 0.5;
      r.strength = strength;
      r.m.visible = true;
    },
  };
}

/** A low-poly fish of a colour (its length ≈ `len` m), nose toward +z. */
export function fishMesh(bag: Bag, color: string, len = 0.4): T.Mesh {
  const { THREE } = bag.ctx;
  const c = new THREE.Color(color);
  const belly = c.clone().lerp(new THREE.Color('#f4efe4'), 0.55).getStyle();
  const geo = merge(THREE, [
    part(THREE, new THREE.SphereGeometry(0.5, 12, 8), color, { s: [0.28, 0.36, 1] }),
    part(THREE, new THREE.SphereGeometry(0.45, 10, 6), belly, { p: [0, -0.06, 0.02], s: [0.22, 0.24, 0.85] }),
    part(THREE, new THREE.ConeGeometry(0.22, 0.34, 4), color, { p: [0, 0, -0.6], r: [-Math.PI / 2, 0, 0], s: [0.25, 1, 1.4] }),
    part(THREE, new THREE.ConeGeometry(0.12, 0.28, 3), color, { p: [0, 0.2, -0.05], r: [-0.6, 0, 0], s: [0.3, 1, 1] }),
    part(THREE, new THREE.SphereGeometry(0.035, 6, 4), '#1b1916', { p: [0.1, 0.07, 0.36] }),
    part(THREE, new THREE.SphereGeometry(0.035, 6, 4), '#1b1916', { p: [-0.1, 0.07, 0.36] }),
  ]);
  geo.scale(len, len, len);
  return inked(bag.ctx, geo, { width: 0.006 });
}

/** A soft glow sprite (for lanterns and the bell's shimmer). */
export function glowSprite(bag: Bag, color: string, size: number, opacity = 0.8): T.Sprite {
  const { THREE } = bag.ctx;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(THREE, 64, 0.12), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}
