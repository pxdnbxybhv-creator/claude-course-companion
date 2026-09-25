// The cast's models, headless: every companion builds, plays every emote, its idle fidgets, walks,
// runs, jumps and sits without a NaN anywhere; stays within its draw budget in every pose; is
// deterministic; and disposes cleanly.
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import type { EmoteKind } from '../src/views/walk/types';
import type { CharacterModel, MotionState } from '../src/views/walk/characters/types';

const EMOTES: EmoteKind[] = ['eat', 'bow', 'jump', 'wave', 'throw', 'cast', 'row', 'sit', 'play', 'water', 'skill', 'talk', 'pet', 'build', 'dance', 'sleep'];
const DUR: Record<EmoteKind, number> = { eat: 2.1, bow: 1.7, jump: 0.95, wave: 1.9, water: 1.5, throw: 0.9, cast: 1.3, row: 1.5, sit: 2.5, play: 2.8, skill: 1.6, talk: 2.2, pet: 1.8, build: 1.6, dance: 1.9, sleep: 3.2 };

let FACTORIES: Record<CharacterId, (T: typeof THREE, o: { palette: Record<string, string>; reduced?: boolean }) => CharacterModel>;

beforeAll(async () => {
  // just enough of a DOM for the painted textures (they draw nothing without a 2D context)
  const g = globalThis as unknown as { document?: unknown };
  if (!g.document) g.document = { createElement: () => ({ width: 0, height: 0, getContext: () => null, style: {} }) };
  ({ FACTORIES } = (await import('../src/views/walk/characters')) as unknown as { FACTORIES: typeof FACTORIES });
});

/** What the renderer would draw of the figure now: visible meshes (one draw per material group) and sprites. */
function draws(root: THREE.Object3D): number {
  let n = 0;
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    const m = o as THREE.Mesh;
    if (m.isMesh) n += Array.isArray(m.material) ? Math.max(1, m.geometry.groups.length) : 1;
    else if ((o as THREE.Sprite).isSprite) n += 1;
    for (const c of o.children) walk(c);
  };
  walk(root);
  return n;
}

function finite(root: THREE.Object3D): string | null {
  let bad: string | null = null;
  root.traverse((o) => {
    if (bad) return;
    const v = [...o.position.toArray(), ...o.quaternion.toArray(), ...o.scale.toArray()];
    if (v.some((x) => !Number.isFinite(x as number))) bad = o.name || o.type;
  });
  return bad;
}

const state = (t: number, o: Partial<MotionState> = {}): MotionState => ({ speed: 0, running: false, grounded: true, vy: 0, emote: null, emoteT: 0, t, riding: false, ...o });

/** A walk through everything a companion does; calls check() on the way. */
function program(m: CharacterModel, check: (label: string) => void) {
  const dt = 1 / 30;
  let t = 0;
  const run = (secs: number, o: (t: number) => Partial<MotionState>, label: string) => {
    for (let i = 0; i < secs / dt; i++) { t += dt; m.update(dt, state(t, o(t))); if (i % 9 === 0) check(label); }
  };
  run(14, () => ({}), 'idle');                                   // long enough for the fidgets
  run(2, () => ({ speed: 2.1 }), 'walk');
  run(2, () => ({ speed: 4.3, running: true }), 'run');
  run(1, (tt) => ({ grounded: false, vy: Math.cos(tt * 3) * 3 }), 'air');
  for (const e of EMOTES) {
    const t0 = t;
    run(DUR[e], (tt) => ({ emote: e, emoteT: Math.min(1, (tt - t0) / DUR[e]), riding: e === 'row' || e === 'sit' }), e);
    run(0.3, () => ({}), 'after ' + e);
  }
  run(1.5, () => ({ riding: true }), 'riding');
}

describe('the cast', () => {
  it('has a model for every companion', () => {
    for (const c of CHARACTERS) expect(FACTORIES[c.id], c.id).toBeTypeOf('function');
  });

  for (const c of CHARACTERS) {
    it(`${c.id}: every pose finite, within 40 draws, disposes`, () => {
      const m = FACTORIES[c.id](THREE, { palette: {}, reduced: false });
      expect(m.height).toBeGreaterThan(0.4);
      let worst = 0, worstAt = '';
      program(m, (label) => {
        const bad = finite(m.root);
        expect(bad, `${c.id} ${label}: non-finite transform on ${bad}`).toBeNull();
        const d = draws(m.root);
        if (d > worst) { worst = d; worstAt = label; }
      });
      if (process.env.CAST_LOG) console.log(c.id, worst, worstAt);
      expect(worst, `${c.id} peaks at ${worst} draws (${worstAt})`).toBeLessThanOrEqual(40);
      expect(() => m.dispose()).not.toThrow();
      expect(m.root.parent).toBeNull();
    });
  }

  it('is deterministic: the same motion gives the same pose', () => {
    for (const id of ['poet', 'cat', 'rabbit', 'swordsman'] as CharacterId[]) {
      const a = FACTORIES[id](THREE, { palette: {}, reduced: false });
      const b = FACTORIES[id](THREE, { palette: {}, reduced: false });
      const snap = (m: CharacterModel) => { const out: number[] = []; m.root.traverse((o) => out.push(...o.position.toArray(), ...o.quaternion.toArray())); return out; };
      program(a, () => {});
      program(b, () => {});
      expect(snap(a)).toEqual(snap(b));
      a.dispose(); b.dispose();
    }
  });

  it('holds still under reduced motion: no idle fidgets', () => {
    const m = FACTORIES.scholar(THREE, { palette: {}, reduced: true });
    const at = (t: number) => { m.update(1 / 30, state(t)); const q: number[] = []; m.root.traverse((o) => q.push(...o.quaternion.toArray())); return q; };
    for (let i = 0; i < 300; i++) at(i / 30);
    const q1 = at(10.0);
    for (let i = 0; i < 90; i++) at(10 + i / 30);
    const q2 = at(13.0);
    // arms and hands keep their place (the head may glance round, the chest breathes)
    const diff = q1.reduce((s, v, i) => Math.max(s, Math.abs(v - q2[i])), 0);
    expect(diff).toBeLessThan(0.5);
    m.dispose();
  });
});
