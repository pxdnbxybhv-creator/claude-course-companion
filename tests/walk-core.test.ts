// The walk's core feel and wayfinding: forgiving jumps (coyote time, buffering), the squash and
// stretch spring, where a waypoint stele may stand, where fast travel sets you down, which stele
// the walker lights.
import { describe, expect, it } from 'vitest';
import { BUFFER, COYOTE, JumpGate, squashAt } from '../src/views/walk/world/jump';
import { arrivalAt, findSpot, goodSpot, LIGHT_RADIUS, toLight, type SpotTest } from '../src/views/walk/world/wayfind';
import { HOME_PLOT, WAYPOINTS, REGION } from '../src/views/walk/map';
import { terrain } from '../src/views/walk/world/terrain';

const DT = 1 / 60;

/** Run the gate over a timeline of [grounded, pressed] steps; returns the step index of each take-off. */
function run(gate: JumpGate, steps: [boolean, boolean][], airJumps = 0): { i: number; kind: string }[] {
  const out: { i: number; kind: string }[] = [];
  steps.forEach(([g, p], i) => {
    const k = gate.step(DT, g, p, airJumps);
    if (k) out.push({ i, kind: k });
  });
  return out;
}
const repeat = <T>(n: number, v: T): T[] => Array.from({ length: n }, () => v);

describe('jump timing', () => {
  it('jumps at once from the ground', () => {
    expect(run(new JumpGate(), [[true, false], [true, true]])).toEqual([{ i: 1, kind: 'ground' }]);
  });

  it('coyote time: a press just after walking off a ledge still jumps from the ground', () => {
    const late = Math.floor((COYOTE * 0.8) / DT);
    const steps: [boolean, boolean][] = [[true, false], ...repeat(late, [false, false] as [boolean, boolean]), [false, true]];
    expect(run(new JumpGate(), steps)).toEqual([{ i: steps.length - 1, kind: 'ground' }]);
  });

  it('coyote time runs out', () => {
    const late = Math.ceil((COYOTE * 1.5) / DT);
    const steps: [boolean, boolean][] = [[true, false], ...repeat(late, [false, false] as [boolean, boolean]), [false, true], ...repeat(3, [false, false] as [boolean, boolean])];
    expect(run(new JumpGate(), steps)).toEqual([]);
  });

  it('no coyote jump after a real jump (no free double jump)', () => {
    const steps: [boolean, boolean][] = [[true, true], [false, false], [false, true], [false, false]];
    expect(run(new JumpGate(), steps)).toEqual([{ i: 0, kind: 'ground' }]);
  });

  it('buffering: a press just before landing fires on touch-down', () => {
    const early = Math.floor((BUFFER * 0.75) / DT);
    const steps: [boolean, boolean][] = [[true, true], ...repeat(20, [false, false] as [boolean, boolean]), [false, true], ...repeat(early, [false, false] as [boolean, boolean]), [true, false]];
    const got = run(new JumpGate(), steps);
    expect(got).toEqual([{ i: 0, kind: 'ground' }, { i: steps.length - 1, kind: 'ground' }]);
  });

  it('a press long before landing is forgotten', () => {
    const early = Math.ceil((BUFFER * 2) / DT);
    const steps: [boolean, boolean][] = [[true, true], ...repeat(20, [false, false] as [boolean, boolean]), [false, true], ...repeat(early, [false, false] as [boolean, boolean]), [true, false], [true, false]];
    expect(run(new JumpGate(), steps)).toEqual([{ i: 0, kind: 'ground' }]);
  });

  it('an extra air jump answers a press in the air at once', () => {
    const steps: [boolean, boolean][] = [[true, true], ...repeat(12, [false, false] as [boolean, boolean]), [false, true]];
    expect(run(new JumpGate(), steps, 1)).toEqual([{ i: 0, kind: 'ground' }, { i: 13, kind: 'air' }]);
  });

  it('launched by something else: no coyote jump afterwards', () => {
    const g = new JumpGate();
    g.step(DT, true, false);
    g.launched();
    expect(g.step(DT, false, true)).toBe(null);
  });

  it('squash and stretch settle back to rest and keep the volume roughly', () => {
    expect(squashAt(-0.2, 0)).toEqual([1 / Math.sqrt(0.8), 0.8]);
    expect(squashAt(-0.2, 1)).toEqual([1, 1]);
    const [xz, y] = squashAt(0.15, 0.05);
    expect(y).toBeGreaterThan(1);
    expect(xz).toBeLessThan(1);
    expect(Math.abs(xz * xz * y - 1)).toBeLessThan(0.02);
  });
});

describe('waypoint steles', () => {
  // a flat world with a pond in the middle and a road along z = 0
  const flat: SpotTest = {
    walkable: (x, z) => Math.hypot(x - 10, z - 10) > 4,
    height: () => 0,
    pathDist: (_x, z) => Math.abs(z),
  };

  it('a clear spot stays where it is', () => {
    expect(findSpot(-5, 5, flat)).toEqual({ x: -5, z: 5, moved: 0 });
  });

  it('a spot on the road or in the pond moves to the nearest good ground', () => {
    const onRoad = findSpot(0, 0.5, flat)!;
    expect(onRoad).not.toBeNull();
    expect(goodSpot(onRoad.x, onRoad.z, flat)).toBe(true);
    expect(onRoad.moved).toBeLessThanOrEqual(2.5);
    const inPond = findSpot(10, 10, flat)!;
    expect(Math.hypot(inPond.x - 10, inPond.z - 10)).toBeGreaterThan(4.8);
    expect(inPond.moved).toBeLessThan(6);
  });

  it('slopes too steep for a stele are refused', () => {
    const steep: SpotTest = { walkable: () => true, height: (x) => x * 0.6 };
    expect(goodSpot(0, 0, steep)).toBe(false);
    expect(findSpot(0, 0, steep, 3)).toBeNull();
  });

  it('arrives a step in front of the stele and to one side, facing into the place', () => {
    const a = arrivalAt({ x: 0, z: 0 }, { x: 0, z: 20 }, () => true);
    expect(a.z).toBeCloseTo(1.8);
    expect(Math.abs(a.x)).toBeCloseTo(1.4);
    expect(Math.cos(a.heading)).toBeGreaterThan(0.95);
    // the stele is never on the line from the walker back to the camera behind them
    const back = { x: -Math.sin(a.heading), z: -Math.cos(a.heading) };
    const rel = { x: 0 - a.x, z: 0 - a.z };
    const across = Math.abs(rel.x * back.z - rel.z * back.x);
    expect(across).toBeGreaterThan(1);
    // blocked on one side: takes the other, still facing the place
    const b = arrivalAt({ x: 0, z: 0 }, { x: 0, z: 20 }, (x) => x > 0.5);
    expect(b.x).toBeGreaterThan(0.5);
    expect(Math.cos(b.heading)).toBeGreaterThan(0.8);
  });

  it('lights the nearest unlit stele within reach', () => {
    const list = [{ id: 'a', x: 0, z: 0 }, { id: 'b', x: 2, z: 0 }, { id: 'c', x: 50, z: 0 }];
    expect(toLight(1.6, 0, list, () => false)?.id).toBe('b');
    expect(toLight(1.6, 0, list, (id) => id === 'b')?.id).toBe('a');
    expect(toLight(20, 0, list, () => false)).toBeNull();
    expect(toLight(0, LIGHT_RADIUS + 0.1, list, () => false)).toBeNull();
  });

  it('every place has one stele, and the map\'s spots are on dry, level, reachable land', () => {
    const T = terrain();
    expect(new Set(WAYPOINTS.map((w) => w.id)).size).toBe(Object.keys(REGION).length);
    for (const w of WAYPOINTS) {
      const t: SpotTest = { walkable: (x, z) => T.waterAt(x, z) === null, height: T.height, pathDist: (x, z) => T.pathNear(x, z).d };
      const s = findSpot(w.x, w.z, t);
      expect(s, w.id).not.toBeNull();
      expect(s!.moved, w.id).toBeLessThan(6);
    }
  });
});

describe('the homestead plot', () => {
  it('is level ground to build on, with no water on it', () => {
    const T = terrain();
    const h = HOME_PLOT.size / 2;
    let lo = Infinity, hi = -Infinity;
    for (let x = HOME_PLOT.x - h; x <= HOME_PLOT.x + h; x += 1) {
      for (let z = HOME_PLOT.z - h; z <= HOME_PLOT.z + h; z += 1) {
        const y = T.height(x, z);
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        expect(T.waterAt(x, z)).toBeNull();
      }
    }
    expect(hi - lo).toBeLessThan(0.25);
    expect(Math.abs((hi + lo) / 2 - 0.6)).toBeLessThan(0.2);
  });

  it('its path from the garden climbs gently all the way to the gate', () => {
    const T = terrain();
    const path = T.paths[T.paths.length - 1];
    const end = path[path.length - 1];
    expect(Math.hypot(end.x - HOME_PLOT.gate.x, end.z - HOME_PLOT.gate.z)).toBeLessThan(2);
    for (let i = 1; i < path.length; i++) {
      const rise = Math.abs(path[i].y - path[i - 1].y) / (Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z) || 1);
      expect(rise).toBeLessThan(0.4);
    }
  });
});
