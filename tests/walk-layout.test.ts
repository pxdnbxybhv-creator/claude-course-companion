// One habit, one plant: the walk's site plan must give every habit a slot, however many lotus.
import { describe, expect, it } from 'vitest';
import type { PlantKind } from '../src/core/types';
import { BOUNDS_R, GATE, SPAWN, layoutPlants, onBridge, pondQ, type LayoutItem } from '../src/views/walk/world/site';

const KINDS: PlantKind[] = ['plum', 'orchid', 'bamboo', 'chrysanthemum', 'pine', 'lotus'];

function check(items: LayoutItem[]) {
  const slots = layoutPlants(items);
  expect(slots.length).toBe(items.length);
  expect(slots.map((s) => s.key)).toEqual(items.map((i) => i.key));
  for (const s of slots) {
    expect(Number.isFinite(s.x) && Number.isFinite(s.z)).toBe(true);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(BOUNDS_R);
    if (s.inWater) {
      expect(pondQ(s.x, s.z)).toBeLessThan(0.95);
      expect(onBridge(s.x, s.z)).toBe(false);
    } else {
      expect(pondQ(s.x, s.z)).toBeGreaterThan(1.0);
    }
    expect(s.kind).toBe(items.find((i) => i.key === s.key)!.kind);
  }
  // no two plants on top of each other
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThan(0.7);
    }
  }
  return slots;
}

describe('walk layoutPlants', () => {
  for (let n = 1; n <= 12; n++) {
    it(`places ${n} lotus`, () => {
      check(Array.from({ length: n }, (_, i) => ({ key: 'h' + i, kind: 'lotus' as PlantKind })));
    });
  }

  it('places 40 mixed habits, lotus included', () => {
    check(Array.from({ length: 40 }, (_, i) => ({ key: 'm' + i, kind: KINDS[(i * 7) % KINDS.length] })));
  });

  it('places 30 of a kind', () => {
    for (const k of KINDS) check(Array.from({ length: 30 }, (_, i) => ({ key: k + i, kind: k })));
  });

  it('frames the first land plant in the moon gate', () => {
    const [first] = check([{ key: 'a', kind: 'plum' }, { key: 'b', kind: 'orchid' }, { key: 'c', kind: 'pine' }]);
    // beyond the wall, near the axis, visible through the round opening from the spawn point
    expect(first.z).toBeLessThan(GATE.z - 3);
    const k = (SPAWN.z - GATE.z) / (SPAWN.z - first.z);
    expect(Math.abs(first.x * k)).toBeLessThan(GATE.holeR);
  });

  it('is deterministic', () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ key: 'd' + i, kind: KINDS[i % KINDS.length] }));
    expect(layoutPlants(items)).toEqual(layoutPlants(items));
  });
});
