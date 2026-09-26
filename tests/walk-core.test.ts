// The walk's core feel and wayfinding: forgiving jumps (coyote time, buffering), the squash and
// stretch spring, where a waypoint stele may stand, where fast travel sets you down, which stele
// the walker lights.
import { describe, expect, it } from 'vitest';
import { BUFFER, COYOTE, JumpGate, squashAt } from '../src/views/walk/world/jump';
import { arrivalAt, findSpot, goodSpot, LIGHT_RADIUS, lightReach, toLight, type SpotTest } from '../src/views/walk/world/wayfind';
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
    // a stele 4 m off the road lights for a walker on the road; never from further than 6 m
    const road = [{ id: 'v', x: 4, z: 0, r: lightReach(4) }];
    expect(toLight(0, 1, road, () => false)?.id).toBe('v');
    expect(lightReach(0.5)).toBe(LIGHT_RADIUS);
    expect(lightReach(22)).toBe(6);
  });

  it('every place on the ground has one stele (a pocket has none), and the map\'s spots are on dry, level, reachable land', () => {
    const T = terrain();
    expect(new Set(WAYPOINTS.map((w) => w.id)).size).toBe(Object.values(REGION).filter((r) => !r.pocket).length);
    expect(WAYPOINTS.some((w) => REGION[w.id].pocket)).toBe(false);
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

// ───────────────────────────── 桃源: the pocket valley's plan (features/taoyuan/places.ts)
import { GROUND_REGIONS, pocketAt, regionAt } from '../src/views/walk/map';
import {
  ANCHORS as TY_ANCHORS, CAVE, CLEFT_END, CREST_MIN, CROSSINGS, FLOOR_R, G, PLACES, RING, SHRINE, Y_T, cleftHalf, crestH, doorStateFor, fenceValley, floorAt, standAt, streamAt, surfaceAt, walkAt, waterAt,
} from '../src/views/walk/features/taoyuan/places';
import { fenceDisc } from '../src/views/walk/world/photoMath';
import { changTod, SKY_MOODS } from '../src/views/walk/world/sky';

describe('桃源 · the pocket valley', () => {
  it('is a pocket: never on the ground plane, found in 3-D only on its floor', () => {
    expect(GROUND_REGIONS.some((r) => r.id === 'taoyuan')).toBe(false);
    expect(regionAt(G.x, G.z)).not.toBe('taoyuan');
    expect(pocketAt(G.x, Y_T + 1, G.z)).toBe('taoyuan');
    expect(pocketAt(G.x, 20, G.z)).toBe(null);
    expect(pocketAt(G.x, Y_T, G.z + CAVE.start)).toBe('taoyuan'); // the narrow way is inside the ring
    expect(REGION.taoyuan.pocket?.y).toBe(Y_T);
  });

  it('every place and anchor stands on the floor, inside the ring (the cleft in the south ring)', () => {
    const all = [...Object.values(TY_ANCHORS)];
    const walk = (o: unknown) => { if (o && typeof o === 'object' && 'x' in o && 'y' in o) all.push(o as { x: number; y: number; z: number }); else if (o && typeof o === 'object') Object.values(o).forEach(walk); };
    walk(PLACES);
    for (const p of all) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)).toBe(true);
      const r = Math.hypot(p.x - G.x, p.z - G.z);
      const inCave = p.z - G.z > CAVE.mouth - 1;
      expect(r).toBeLessThan(inCave ? CAVE.end : FLOOR_R);
      expect(p.y).toBeGreaterThan(Y_T - 1.5);
      expect(p.y).toBeLessThan(Y_T + 12);
    }
  });

  it('the places one walks to are walkable, dry and reachable; the stream only at its crossings', () => {
    const spots: [number, number][] = [[0, 0], [0, -20], [0, -24.5], [-1.4, 35.2], [-22, 3.4], [-24, 10.2], [23.2, 6.6], [18, -8.9], [8, -11.4], [26, -18.8], [-12.3, -13.2], [-17, -26.5], [14, -36], [24, 24], [-3, 28]];
    for (const [x, z] of spots) {
      expect(walkAt(x, z), `(${x}, ${z})`).toBe(true);
      expect(waterAt(x, z)).toBe(null);
    }
    // the stream: water, and not walked, except on the bridge, the slab and the stepping stones
    expect(waterAt(7.2, 6)).not.toBe(null);
    expect(walkAt(7.2, 6)).toBe(false);
    for (const c of CROSSINGS) {
      const mx = (c.a[0] + c.b[0]) / 2, mz = (c.a[1] + c.b[1]) / 2;
      expect(walkAt(mx, mz), c.id).toBe(true);
      expect(standAt(mx, mz)).toBeGreaterThanOrEqual(floorAt(mx, mz));
    }
    // beyond the floor's edge: the slopes are not walked
    expect(walkAt(0, -44)).toBe(false);
    expect(walkAt(44, 0)).toBe(false);
  });

  it('the narrow way: 1.3–1.8 m wide, its walls at least 0.6 m from the centre, the walker kept off them', () => {
    for (let z = 44; z <= CAVE.end; z += 0.25) {
      const hw = cleftHalf(z);
      expect(hw * 2).toBeGreaterThanOrEqual(1.3 - 1e-6);
      expect(hw * 2).toBeLessThanOrEqual(1.8 + 1e-6);
      expect(hw).toBeGreaterThanOrEqual(0.6);
      // the rock rises right beyond the half-width
      expect(surfaceAt(hw + 1.2, z)).toBeGreaterThan(standAt(0, z) + 2);
      if (z < CLEFT_END - 0.05) expect(walkAt(0, z)).toBe(true);
      expect(walkAt(hw - 0.2, z)).toBe(false);
    }
    // a walker can go from the start of the way to the valley floor without a step higher than a stair
    let prev = standAt(0, CAVE.start);
    for (let z = CAVE.start; z > CAVE.mouth - 6; z -= 0.1) {
      const y = standAt(z > CAVE.mouth + 1.5 ? 0 : -0.3, z);
      expect(Math.abs(y - prev)).toBeLessThan(0.1);
      prev = y;
    }
  });

  it('every walkable step lies inside the pocket\'s ring (past it the floor is taken away: a fall)', () => {
    let n = 0;
    for (let x = -45; x <= 45; x += 0.25) {
      for (let z = -45; z <= 70; z += 0.25) {
        if (!walkAt(x, z)) continue;
        n++;
        expect(Math.hypot(x, z), `(${x}, ${z})`).toBeLessThan(RING.outer - 0.5);
        expect(pocketAt(G.x + x, Y_T + standAt(x, z), G.z + z)).toBe('taoyuan');
      }
    }
    expect(n).toBeGreaterThan(10000);
    // the walker is set down in the cleft, a few steps in front of the curtain, and can walk it
    expect(walkAt(0, CAVE.start)).toBe(true);
    expect(CAVE.start).toBeLessThan(CLEFT_END - 2);
  });

  it('the ring: crests 34–48 m above the floor, never lower than the photo camera may rise', () => {
    for (let a = 0; a < Math.PI * 2; a += 0.05) {
      const h = crestH(a);
      expect(h).toBeGreaterThanOrEqual(CREST_MIN);
      expect(h).toBeLessThanOrEqual(48);
      const x = Math.cos(a) * 58, z = Math.sin(a) * 58;
      if (Math.abs(x) > 9 || z < 0) expect(surfaceAt(x, z)).toBeGreaterThan(CREST_MIN - 4); // (the cleft cuts the south)
    }
    // the stream runs from the spring to the cleft
    expect(streamAt(0, -33).d).toBeLessThan(0.5);
    expect(streamAt(0.36, 55).inCleft).toBe(true);
  });

  it('the photo camera keeps inside the ring and under its crest (and inside the cleft from there)', () => {
    const p = { x: G.x + 80, y: Y_T + 90, z: G.z };
    fenceValley(p, { x: G.x, y: Y_T, z: G.z });
    expect(Math.hypot(p.x - G.x, p.z - G.z)).toBeLessThanOrEqual(44 + 1e-6);
    expect(p.y).toBeLessThanOrEqual(Y_T + CREST_MIN - 3);
    const q = { x: G.x + 5, y: Y_T + 40, z: G.z + 55 };
    fenceValley(q, { x: G.x, y: Y_T, z: G.z + 55 });
    expect(Math.abs(q.x - G.x)).toBeLessThan(cleftHalf(55));
    expect(q.y).toBeLessThan(Y_T + 10);
    const d = fenceDisc({ x: 100, y: 50, z: 0 }, { x: 0, z: 0 }, 10, 5);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(10);
    expect(d.y).toBe(5);
  });

  it('the shrine: an 8 × 5 m courtyard before the hall, the altar inside it', () => {
    expect(SHRINE.wallX * 2).toBeCloseTo(8.4, 1);
    expect(SHRINE.south - SHRINE.courtN).toBeCloseTo(5, 1);
    expect(SHRINE.altar.z).toBeLessThan(SHRINE.hall.z0);
    expect(SHRINE.altar.z).toBeGreaterThan(SHRINE.hall.z1);
    expect(standAt(0, -24.5)).toBeGreaterThan(floorAt(0, -20)); // the hall's raised floor
  });

  it('the door follows the record (bible §2)', () => {
    expect(doorStateFor({}, false)).toBe('hidden');
    expect(doorStateFor({}, true)).toBe('open');
    expect(doorStateFor({ 'qy:taohua': true }, false)).toBe('open');
    expect(doorStateFor({ 'qy:taohua': true, 'ty:b8': true }, true)).toBe('closed');
    expect(doorStateFor({ 'ty:b8': true, 'ty:way': true }, false)).toBe('reopened');
  });

  it('the valley clock has every state of the bible, and 常 maps the world hour', () => {
    expect([...SKY_MOODS].sort()).toEqual(['case', 'chang', 'hai', 'mao', 'shen', 'xu', 'you', 'zi']);
    expect(changTod(6)).toBe('dawn');
    expect(changTod(12)).toBe('day');
    expect(changTod(18)).toBe('dusk');
    expect(changTod(23)).toBe('night');
    expect(changTod(3)).toBe('night');
  });
});
