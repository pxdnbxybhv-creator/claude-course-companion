// The camera modes' arithmetic: where the free photo camera may go, the zoom range, the size a
// photograph is rendered at, the first-person head-bob, the view angles and the poses' peaks.
import { beforeAll, describe, expect, it } from 'vitest';
import type * as THREE_NS from 'three';
import {
  FOV_MAX, FOV_MIN, PHOTO_BUDGET, PHOTO_CEILING, PHOTO_CLEAR, PHOTO_LONG_SIDE, PHOTO_POSES, PHOTO_RADIUS,
  bobAmp, captureRatio, clampFov, clampPhotoCam, dirOf, ease, headBob, posePeak, yawPitchOf,
} from '../src/views/walk/world/photoMath';

const flat = () => 0;
const dry = () => null;

describe('the photo camera stays in bounds', () => {
  it('leaves a point near the walker as it is', () => {
    const p = clampPhotoCam({ x: 3, y: 2, z: -4 }, { x: 0, y: 0, z: 0 }, flat, dry);
    expect(p).toEqual({ x: 3, y: 2, z: -4 });
  });

  it('pulls a far point back to the edge of reach, along the same line', () => {
    const w = { x: 10, y: 1, z: -5 };
    const p = clampPhotoCam({ x: 10 + 300, y: 2, z: -5 }, w, flat, dry);
    const d = Math.hypot(p.x - w.x, p.y - (w.y + 1), p.z - w.z);
    expect(d).toBeCloseTo(PHOTO_RADIUS, 6);
    expect(p.z).toBeCloseTo(-5, 6);
    expect(p.x).toBeGreaterThan(w.x);
  });

  it('never goes below the ground', () => {
    const hill = (x: number) => 4 + x * 0.1;
    const p = clampPhotoCam({ x: 10, y: 0, z: 0 }, { x: 0, y: 4, z: 0 }, hill, dry);
    expect(p.y).toBeCloseTo(hill(10) + PHOTO_CLEAR, 6);
  });

  it('never goes into the water', () => {
    const lake = () => 1.2;
    const p = clampPhotoCam({ x: 2, y: 0.5, z: 2 }, { x: 0, y: 0, z: 0 }, flat, lake);
    expect(p.y).toBeCloseTo(1.2 + PHOTO_CLEAR, 6);
  });

  it('has a ceiling above the walker', () => {
    const p = clampPhotoCam({ x: 0, y: 55, z: 0 }, { x: 0, y: 0, z: 0 }, flat, dry);
    expect(p.y).toBeLessThanOrEqual(PHOTO_CEILING + 1e-9);
  });

  it('recovers from a broken position', () => {
    const p = clampPhotoCam({ x: NaN, y: 1, z: Infinity }, { x: 5, y: 1, z: 5 }, flat, dry);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
    expect(Math.hypot(p.x - 5, p.z - 5)).toBeLessThan(PHOTO_RADIUS);
  });
});

describe('zoom', () => {
  it('clamps the field of view to 20–75°', () => {
    expect(clampFov(5)).toBe(FOV_MIN);
    expect(clampFov(120)).toBe(FOV_MAX);
    expect(clampFov(42)).toBe(42);
    expect(clampFov(NaN)).toBe(50);
  });
});

describe('the size of a photograph', () => {
  it('aims its long side at the target', () => {
    const r = captureRatio(1280, 800, 1, 2048, 4096, 1e9);
    expect(Math.round(1280 * r)).toBeLessThanOrEqual(2048);
    expect(1280 * r).toBeGreaterThan(2030);
  });

  it('is never softer than the screen', () => {
    expect(captureRatio(390, 844, 3, 1600, 4096, 1e9)).toBeGreaterThanOrEqual(1.89);
    expect(captureRatio(390, 844, 1.75, 1600, 4096, 1e9)).toBeGreaterThanOrEqual(1.75);
  });

  it('keeps within the GPU and the pixel budget', () => {
    for (const [w, h] of [[1280, 800], [390, 844], [2560, 1440], [844, 390]]) {
      for (const long of Object.values(PHOTO_LONG_SIDE)) {
        for (const budget of Object.values(PHOTO_BUDGET)) {
          const r = captureRatio(w, h, 1, long, 4096, budget);
          expect(w * r * h * r).toBeLessThanOrEqual(budget * 1.001);
          expect(Math.max(w, h) * r).toBeLessThanOrEqual(4096);
        }
      }
    }
    // a screen already past the budget is not pushed further
    expect(captureRatio(2560, 1440, 2, 3072, 4096, 5.2e6)).toBeLessThanOrEqual(Math.sqrt(5.2e6 / (2560 * 1440)) + 1e-9);
  });
});

describe('first person', () => {
  it('does not bob standing still, bobs more running than walking, never much', () => {
    expect(bobAmp(0, false)).toBe(0);
    expect(bobAmp(0.1, true)).toBe(0);
    const walk = bobAmp(1.6, false), run = bobAmp(4.5, true);
    expect(walk).toBeGreaterThan(0.01);
    expect(run).toBeGreaterThan(walk);
    expect(run).toBeLessThanOrEqual(0.05);
  });

  it('dips once a footfall and sways once a stride', () => {
    const amp = 0.03;
    expect(headBob(0, amp)).toEqual({ x: 0, y: 0 });
    // a step is π of phase: the vertical returns, the sway has swung to the other side
    const a = headBob(Math.PI / 2, amp), b = headBob((3 * Math.PI) / 2, amp);
    expect(Math.abs(a.y)).toBeLessThan(1e-9);
    expect(a.x).toBeCloseTo(-b.x, 9);
    for (let p = 0; p < 7; p += 0.1) {
      const h = headBob(p, amp);
      expect(Math.abs(h.y)).toBeLessThanOrEqual(amp + 1e-12);
      expect(Math.abs(h.x)).toBeLessThanOrEqual(amp * 0.45 + 1e-12);
    }
  });

  it('turns a view direction into yaw and pitch and back (forward at yaw 0 is −z)', () => {
    const f = dirOf(0, 0);
    expect(f.x).toBeCloseTo(0, 9);
    expect(f.z).toBeCloseTo(-1, 9);
    for (const [yaw, pitch] of [[0.3, 0.2], [-2.5, -1.1], [3, 1.3], [1.2, 0]]) {
      const d = dirOf(yaw, pitch);
      const back = yawPitchOf(d.x, d.y, d.z);
      expect(Math.atan2(Math.sin(back.yaw - yaw), Math.cos(back.yaw - yaw))).toBeCloseTo(0, 9);
      expect(back.pitch).toBeCloseTo(pitch, 9);
    }
  });

  it('blends with an eased step that starts and ends still', () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 9);
    expect(ease(-3)).toBe(0);
    expect(ease(0.01)).toBeLessThan(0.01);
  });
});

describe('poses held for a picture', () => {
  it('stop inside their gesture, never at the start or the end', () => {
    for (const p of PHOTO_POSES) {
      const t = posePeak(p);
      expect(t).toBeGreaterThan(0.5);
      expect(t).toBeLessThan(2.5);
    }
  });
});

// ───────────────────────────── the controls themselves, headless

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
let THREE: typeof THREE_NS;
let Controls: typeof import('../src/views/walk/world/controls').Controls;

beforeAll(async () => {
  const g = globalThis as Record<string, unknown>;
  g.window ??= {
    innerHeight: 800, innerWidth: 1280,
    addEventListener: (t: string, f: Handler) => { (handlers[t] ??= []).push(f); },
    removeEventListener: (t: string, f: Handler) => { handlers[t] = (handlers[t] ?? []).filter((x) => x !== f); },
  };
  THREE = await import('three');
  ({ Controls } = await import('../src/views/walk/world/controls'));
});

const body = { tagName: 'BODY', closest: () => null, isContentEditable: false };
const key = (type: 'keydown' | 'keyup', code: string) =>
  (handlers[type] ?? []).forEach((f) => f({ code, target: body, repeat: false, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false }));

describe('first person and the photo camera (controls)', () => {
  const el = { clientHeight: 800, clientWidth: 1280, addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;
  const DT = 1 / 60;
  const make = () => {
    const cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 600);
    const c = new Controls(el, cam, 0, false);
    const feet = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(0, 0.05, 0);
    c.walker = feet;
    c.eye.set(0, 1.2, 0);
    const run = (n: number, speed = 0) => { for (let i = 0; i < n; i++) c.update(DT, target, 0, speed, () => 0); };
    c.update(0, target, 0, 0, () => 0, true);
    return { c, cam, run, feet };
  };

  it('blends to the eyes in about half a second, with a near plane close enough', () => {
    const { c, cam, run } = make();
    expect(c.mode).toBe('third');
    const d0 = cam.position.distanceTo(c.eye);
    expect(d0).toBeGreaterThan(3);
    c.setView('first');
    run(15);
    expect(c.fp).toBeGreaterThan(0.3);
    expect(c.fp).toBeLessThan(1);
    run(30);
    expect(c.fp).toBe(1);
    expect(c.mode).toBe('first');
    expect(cam.position.distanceTo(c.eye)).toBeLessThan(0.05);
    expect(cam.near).toBeLessThanOrEqual(0.05);
    // the stick and WASD go where the eyes look
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    key('keydown', 'KeyW');
    const m = c.move();
    key('keyup', 'KeyW');
    expect(m.x * dir.x + m.z * dir.z).toBeGreaterThan(0.9 * Math.hypot(dir.x, dir.z));
    c.dispose();
  });

  it('steps aside while something else holds the walker, and comes back', () => {
    const { c, run } = make();
    c.setView('first');
    run(40);
    expect(c.mode).toBe('first');
    c.firstAllowed = false; // a boat, a game, the building
    run(40);
    expect(c.mode).toBe('third');
    expect(c.view).toBe('first'); // the choice is kept
    c.firstAllowed = true;
    run(40);
    expect(c.mode).toBe('first');
    c.dispose();
  });

  it('the photo camera: the walker stands, the camera flies, and all is put back on leaving', () => {
    const { c, cam, run } = make();
    run(10);
    const pos = cam.position.clone(), quat = cam.quaternion.clone();
    const before = { yaw: c.yaw, pitch: c.pitch, dist: c.dist, fov: cam.fov };
    c.enterPhoto();
    expect(c.mode).toBe('photo');
    key('keydown', 'KeyW');
    key('keydown', 'Space');
    const m = c.move();
    expect(Math.hypot(m.x, m.z)).toBe(0); // the walker does not walk
    expect(c.input.jumpQueued).toBe(false); // nor jump
    run(120);
    key('keyup', 'KeyW');
    key('keyup', 'Space');
    expect(cam.position.distanceTo(pos)).toBeGreaterThan(2);
    expect(cam.position.y).toBeGreaterThan(pos.y + 1);
    c.setPhotoFov(5);
    expect(cam.fov).toBe(20);
    // however far it is sent, it stays within reach of the walker
    c.photo!.pos.set(500, -20, 0);
    run(1);
    expect(cam.position.length()).toBeLessThanOrEqual(61 + 1e-6);
    expect(cam.position.y).toBeGreaterThanOrEqual(0.3 - 1e-9);
    c.exitPhoto();
    expect(c.mode).toBe('third');
    expect(cam.fov).toBe(before.fov);
    expect({ yaw: c.yaw, pitch: c.pitch, dist: c.dist }).toEqual({ yaw: before.yaw, pitch: before.pitch, dist: before.dist });
    run(60);
    expect(cam.position.distanceTo(pos)).toBeLessThan(1e-3);
    expect(Math.abs(cam.quaternion.dot(quat))).toBeGreaterThan(0.99999);
    c.dispose();
  });
});
