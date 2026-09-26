// The walker and the keyboard, headless: keys let go while a card has the focus, extra jumps a
// skill grants in mid-air, a jump that ends an emote, a jump as high at 20 fps as at 60, and the
// stride from one raised surface over a narrow gap onto the next.
import { beforeAll, describe, expect, it } from 'vitest';
import type * as THREE_NS from 'three';

type Handler = (e: unknown) => void;
const handlers: Record<string, Handler[]> = {};
let THREE: typeof THREE_NS;
let Controls: typeof import('../src/views/walk/world/controls').Controls;
let PlayerController: typeof import('../src/views/walk/world/player').PlayerController;
let Bag: typeof import('../src/views/walk/world/kit').Bag;

beforeAll(async () => {
  // just enough of a browser for the controls' listeners and the shadow's glow texture
  const g = globalThis as Record<string, unknown>;
  g.window ??= {
    innerHeight: 800, innerWidth: 1280,
    addEventListener: (t: string, f: Handler) => { (handlers[t] ??= []).push(f); },
    removeEventListener: (t: string, f: Handler) => { handlers[t] = (handlers[t] ?? []).filter((x) => x !== f); },
  };
  const ctx2d = new Proxy({}, { get: (_t, k) => (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'getImageData' || k === 'createImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true });
  g.document ??= { createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d }) };
  THREE = await import('three');
  ({ Controls } = await import('../src/views/walk/world/controls'));
  ({ PlayerController } = await import('../src/views/walk/world/player'));
  ({ Bag } = await import('../src/views/walk/world/kit'));
});

const body = { tagName: 'BODY', closest: () => null, isContentEditable: false };
const inCard = { tagName: 'BUTTON', closest: (s: string) => (s.includes('aria-modal') ? {} : null), matches: () => false, isContentEditable: false };
const key = (type: 'keydown' | 'keyup', code: string, target: unknown) =>
  (handlers[type] ?? []).forEach((f) => f({ code, target, repeat: false, preventDefault() {}, metaKey: false, ctrlKey: false, altKey: false }));

describe('keys and focus', () => {
  it('a key let go while a card has the focus stops the walk', () => {
    const el = { clientHeight: 800, clientWidth: 1280, addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;
    const c = new Controls(el, new THREE.PerspectiveCamera(), 0, false);
    key('keydown', 'KeyW', body);
    key('keydown', 'ShiftLeft', body);
    expect(c.moving).toBe(true);
    expect(c.shiftHeld).toBe(true);
    c.paused = true;               // the card opens and takes the focus
    key('keyup', 'KeyW', inCard);  // let go there
    key('keyup', 'ShiftLeft', inCard);
    c.paused = false;              // closed
    expect(c.moving).toBe(false);
    expect(c.shiftHeld).toBe(false);
    const m = c.move();
    expect(Math.hypot(m.x, m.z)).toBe(0);
    expect(m.run).toBe(false);
    // a key pressed inside the card never starts a walk
    key('keydown', 'KeyW', inCard);
    expect(c.moving).toBe(false);
    c.dispose();
  });

  it('opening a card lets go of the walking keys still held', () => {
    const el = { clientHeight: 800, clientWidth: 1280, addEventListener() {}, removeEventListener() {} } as unknown as HTMLElement;
    const c = new Controls(el, new THREE.PerspectiveCamera(), 0, false);
    key('keydown', 'KeyD', body);
    c.paused = true;
    c.paused = false;
    expect(c.moving).toBe(false);
    c.dispose();
  });
});

describe('the walker', () => {
  const model = () => ({ root: new THREE.Group(), height: 1.3, update() {}, dispose() {} });
  const flat = { floorY: () => 0, resolve: (x: number, z: number) => [x, z] as const, built: () => false };
  const mk = () => {
    const p = new PlayerController(new Bag(), 0, 0, 0, 0, model() as never);
    p.floorAt = () => 0;
    return p;
  };
  const I = (o: Partial<{ x: number; z: number; run: boolean; jump: boolean }> = {}) => ({ x: 0, z: 0, run: false, jump: false, ...o });
  const peak = (fps: number) => {
    const p = mk();
    p.update(1 / fps, I(), flat);
    p.update(1 / fps, I({ jump: true }), flat);
    let max = 0;
    for (let i = 0; i < fps * 2; i++) { p.update(1 / fps, I(), flat); max = Math.max(max, p.position.y); }
    return max;
  };

  it('a jump rises as high at 20 fps as at 60', () => {
    const a = peak(60), b = peak(30), c = peak(20);
    expect(a).toBeGreaterThan(0.65);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
    expect(Math.abs(a - c)).toBeLessThan(0.015);
  });

  it('extra jumps granted in mid-air arrive at once (a skill cast mid-jump, 轻功 after its own leap)', () => {
    const p = mk();
    p.update(1 / 60, I(), flat);
    p.update(1 / 60, I({ jump: true }), flat);
    for (let i = 0; i < 10; i++) p.update(1 / 60, I(), flat);
    p.setMoveMods({ airJumps: 1 });
    p.update(1 / 60, I({ jump: true }), flat);
    expect(p.vy).toBeGreaterThan(3.5);
    // the swordsman's own order: the leap first, then the mods
    const q = mk();
    q.update(1 / 60, I(), flat);
    q.emote('skill');
    q.impulse(9.5, 1.4, 0);
    q.setMoveMods({ airJumps: 1, speed: 1.3 });
    q.update(1 / 60, I({ x: 1 }), flat);
    q.update(1 / 60, I({ x: 1, jump: true }), flat);
    expect(q.vy).toBeGreaterThan(3.5);
    // only one: a second press does nothing, and the same mods set again add none
    q.setMoveMods({ airJumps: 1, speed: 1.3 });
    const v = q.vy;
    q.update(1 / 60, I({ x: 1, jump: true }), flat);
    expect(q.vy).toBeLessThan(v);
  });

  it('mods cleared in mid-air take the extra jumps away', () => {
    const p = mk();
    p.update(1 / 60, I(), flat);
    p.setMoveMods({ airJumps: 1 });
    p.update(1 / 60, I({ jump: true }), flat);
    p.update(1 / 60, I(), flat);
    p.setMoveMods(null);
    const v = p.vy;
    p.update(1 / 60, I({ jump: true }), flat);
    expect(p.vy).toBeLessThan(v);
  });

  it('a jump ends an emote (the skill flourish, a bow) instead of being dropped', () => {
    for (const kind of ['skill', 'bow', 'water'] as const) {
      const p = mk();
      for (let i = 0; i < 3; i++) p.update(1 / 60, I(), flat);
      p.emote(kind);
      p.update(1 / 60, I(), flat);
      p.update(1 / 60, I({ jump: true }), flat);
      expect(p.grounded).toBe(false);
      expect(p.emoting).toBe(null);
    }
  });

  it('strides from one raised deck over a narrow gap onto the next', () => {
    // decks at 0.5 m from x < 1 and from x > 1.2; bare ground (0) in the 0.2 m gap between
    const deck = (x: number) => x < 1 || x > 1.2;
    const world = { floorY: (x: number) => (deck(x) ? 0.5 : 0), resolve: (x: number, z: number) => [x, z] as const, built: (x: number) => deck(x) };
    const p = mk();
    p.floorAt = world.floorY;
    p.teleport(0.4, 0, Math.PI / 2);
    for (let i = 0; i < 90; i++) p.update(1 / 60, I({ x: 1 }), world);
    expect(p.position.x).toBeGreaterThan(1.8);
    expect(p.position.y).toBeCloseTo(0.5, 2);
    // but a real step up (0.6 m) past the gap is still a wall to walk into
    const high = { ...world, floorY: (x: number) => (x < 1 ? 0.5 : x > 1.2 ? 1.1 : 0) };
    const q = mk();
    q.floorAt = high.floorY;
    q.teleport(0.4, 0, Math.PI / 2);
    for (let i = 0; i < 90; i++) q.update(1 / 60, I({ x: 1 }), high);
    expect(q.position.x).toBeLessThan(1.21);
  });
});
