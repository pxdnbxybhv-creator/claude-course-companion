import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CATALOG, GATE_CELLS, GRID, HOME_CATS, KIND, PET_HOUSE_KINDS, PLOT_X0, PLOT_Z0, STARTER, canWalkOut, cellAt, cellsOf, coupletLines, fits, footprint,
  growStage, inPlot, isGateCell, itemPoint, itemPose, itemText, joinCouplet, resale, textLine, wetCells,
} from '../src/views/walk/features/home/catalog';
import { bake, flatGeometry, mergeChunks } from '../src/views/walk/features/home/build/brush';
import { HOME_PLOT } from '../src/views/walk/map';
import { diffDays } from '../src/core/date';
import { home, placeItem, removeItem, resetHome, restoreItem, sanitizeHome, setItemText, setPetLine, adoptPet } from '../src/app/home';

const item = (uid: string, kind: string, i: number, j: number, rot: 0 | 1 | 2 | 3 = 0) => ({ uid, kind, i, j, rot });

describe('homestead catalog', () => {
  it('has about thirty kinds with unique ids, names, shelves and sane numbers', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(28);
    const ids = new Set(CATALOG.map((k) => k.id));
    expect(ids.size).toBe(CATALOG.length);
    const cats = new Set(HOME_CATS.map((c) => c.id));
    for (const k of CATALOG) {
      expect(k.zh.length, k.id).toBeGreaterThan(0);
      expect(k.en.length, k.id).toBeGreaterThan(0);
      expect(k.noteZh.length && k.noteEn.length, k.id).toBeTruthy();
      expect(cats.has(k.cat), k.id).toBe(true);
      expect(Number.isInteger(k.w) && Number.isInteger(k.d) && k.w >= 1 && k.d >= 1 && k.w <= 6 && k.d <= 6, k.id).toBe(true);
      if (k.starter) expect(k.price, k.id).toBeGreaterThanOrEqual(0);
      else expect(k.price, k.id).toBeGreaterThan(0);
      expect(k.price, k.id).toBeLessThanOrEqual(800);
    }
    for (const c of HOME_CATS) expect(CATALOG.some((k) => k.cat === c.id), c.id).toBe(true);
  });

  it('the free cottage is the starter, and a first house is affordable', () => {
    expect(KIND.cottage.price).toBe(0);
    expect(KIND.cottage.starter).toBe(true);
    const houses = CATALOG.filter((k) => k.cat === 'house' && k.price > 0).map((k) => k.price);
    expect(Math.min(...houses)).toBeLessThanOrEqual(600);
    for (const [kind, i, j, rot] of STARTER) expect(fits([], kind, i, j, rot).ok, kind).toBe(true);
    const placed = STARTER.map(([kind, i, j, rot], n) => item('s' + n, kind, i, j, rot));
    for (const p of placed) expect(fits(placed, p.kind, p.i, p.j, p.rot, p.uid).ok).toBe(true);
  });

  it('every pet home the homestead’s life expects is on the shelves', () => {
    for (const k of PET_HOUSE_KINDS) {
      expect(KIND[k], k).toBeTruthy();
      expect(KIND[k].pets?.length, k).toBeGreaterThan(0);
      expect(KIND[k].door, k).toBeTruthy();
    }
    expect(KIND.pond.pets).toEqual(expect.arrayContaining(['koi', 'crane']));
    expect(KIND.doghouse.pets).toContain('dog');
    expect(KIND.catbed.pets).toContain('cat');
    expect(KIND.hutch.pets).toContain('rabbit');
    expect(KIND.coop.pets).toContain('duck');
    expect(KIND.perch.pets).toContain('parrot');
    expect(KIND.pen.pets).toContain('goat');
  });

  it('plaques and couplets carry words', () => {
    expect(KIND.plaque.text).toBe('plaque');
    expect(KIND.couplets.text).toBe('couplet');
    expect(itemText({ kind: 'plaque' })).toBe(KIND.plaque.defaultText);
    expect(itemText({ kind: 'plaque', text: '耕读' })).toBe('耕读');
    expect(coupletLines('春风得意/花好月圆')).toEqual(['春风得意', '花好月圆']);
    expect(coupletLines('一二三四')).toEqual(['一二', '三四']);
    // one line left empty, commas inside a line: kept as written
    expect(coupletLines('春眠不觉晓/')).toEqual(['春眠不觉晓', '']);
    expect(coupletLines('/花香不在多')).toEqual(['', '花香不在多']);
    expect(coupletLines('春风，得意/马蹄疾')).toEqual(['春风，得意', '马蹄疾']);
    expect(coupletLines('一 二/三/四')).toEqual(['一 二', '三四']);
    expect(joinCouplet('春眠不觉晓', '')).toBe('春眠不觉晓/');
    expect(joinCouplet('', '花香')).toBe('/花香');
    expect(joinCouplet('a/b', 'c')).toBe('ab/c');
    expect(joinCouplet(' ', '')).toBe('');
    expect(textLine({ kind: 'couplets', text: '春眠不觉晓/' })).toBe('春眠不觉晓');
    expect(textLine({ kind: 'couplets', text: '春风/秋月' })).toBe('春风，秋月');
    expect(textLine({ kind: 'plaque', text: '耕/读' })).toBe('耕/读');
    for (const [a, b] of [['春风得意', '马蹄疾'], ['', '只下联'], ['只上联', ''], ['有，逗号', '有 空格']]) expect(coupletLines(joinCouplet(a, b))).toEqual([a, b]);
  });
});

describe('the plot grid', () => {
  it('matches the map', () => {
    expect(GRID).toBe(24);
    expect(PLOT_X0).toBe(HOME_PLOT.x - 12);
    expect(PLOT_Z0).toBe(HOME_PLOT.z - 12);
    expect(cellAt(PLOT_X0 + 0.5, PLOT_Z0 + 0.5)).toEqual({ i: 0, j: 0 });
    expect(cellAt(PLOT_X0 + 23.9, PLOT_Z0 + 23.9)).toEqual({ i: 23, j: 23 });
    expect(cellAt(PLOT_X0 - 0.1, PLOT_Z0)).toBeNull();
    // the gate's way in is on the east edge, at the gate
    for (const [i, j] of GATE_CELLS) {
      expect(i).toBeGreaterThanOrEqual(GRID - 3);
      expect(Math.abs(PLOT_Z0 + j + 0.5 - HOME_PLOT.gate.z)).toBeLessThanOrEqual(1);
    }
  });

  it('turning swaps a footprint and keeps it inside the bounds', () => {
    const house = KIND.house; // 5 × 4
    expect(footprint(house, 0)).toEqual({ w: 5, d: 4 });
    expect(footprint(house, 1)).toEqual({ w: 4, d: 5 });
    expect(footprint(house, 2)).toEqual({ w: 5, d: 4 });
    expect(cellsOf(house, 0, 0, 1)).toHaveLength(20);
    expect(inPlot(house, GRID - 5, GRID - 4, 0)).toBe(true);
    expect(inPlot(house, GRID - 5, GRID - 4, 1)).toBe(false); // turned it is 5 deep
    expect(inPlot(house, GRID - 4, GRID - 5, 1)).toBe(true);
    expect(fits([], 'house', GRID - 4, 0, 0)).toMatchObject({ ok: false, reason: 'bounds' });
    expect(fits([], 'house', -1, 0, 0).reason).toBe('bounds');
    expect(fits([], 'nope', 0, 0, 0).reason).toBe('unknown');
  });

  it('things do not overlap (with rotation), except a bridge over a pond', () => {
    const items = [item('a', 'house', 2, 2, 0)]; // cells i 2..6, j 2..5
    expect(fits(items, 'bench', 6, 5, 0)).toMatchObject({ ok: false, reason: 'overlap', clash: ['a'] });
    expect(fits(items, 'bench', 7, 5, 0).ok).toBe(true);
    // turned: the 2 × 1 bench becomes 1 × 2
    expect(fits(items, 'bench', 7, 4, 1).ok).toBe(true);
    expect(fits(items, 'bench', 6, 5, 1).ok).toBe(false);
    expect(fits(items, 'bench', 6, 6, 0).ok).toBe(true);
    // moving a thing: it does not block itself
    expect(fits(items, 'house', 3, 2, 0, 'a').ok).toBe(true);
    expect(fits(items, 'house', 3, 2, 0).ok).toBe(false);
    const pond = [item('p', 'pond', 10, 10, 0)];
    expect(fits(pond, 'bridge', 9, 11, 0).ok).toBe(true);
    expect(fits(pond, 'bench', 10, 11, 0).ok).toBe(false);
    expect(fits([item('b', 'bridge', 9, 11, 0)], 'pond', 10, 10, 0).ok).toBe(true);
    expect(fits([...pond, item('b', 'bridge', 9, 11, 0)], 'bridge', 9, 11, 0).ok).toBe(false);
  });

  it('keeps the way in at the gate clear', () => {
    const [i, j] = GATE_CELLS[0];
    expect(isGateCell(i, j)).toBe(true);
    expect(fits([], 'paving', i, j, 0)).toMatchObject({ ok: false, reason: 'gate' });
    expect(fits([], 'paving', i - 1, j, 0).ok).toBe(true);
  });

  it('places a thing by its turned footprint', () => {
    const p = itemPose(item('x', 'house', 0, 0, 1));
    expect(p.x).toBeCloseTo(PLOT_X0 + 2);
    expect(p.z).toBeCloseTo(PLOT_Z0 + 2.5);
    expect(p.heading).toBeCloseTo(Math.PI / 2);
    // its front (+z in its own frame) faces +x when turned once
    const f = itemPoint(item('x', 'house', 0, 0, 1), 0, 1);
    expect(f.x).toBeCloseTo(p.x + 1);
    expect(f.z).toBeCloseTo(p.z);
  });

  it('sells back for half, rounded down', () => {
    expect(resale(0)).toBe(0);
    expect(resale(1)).toBe(0);
    expect(resale(45)).toBe(22);
    expect(resale(520)).toBe(260);
    for (const k of CATALOG) expect(resale(k.price)).toBeLessThanOrEqual(k.price / 2);
  });

  it('knows when a walker is shut in (a house built round them, a pond under their feet)', () => {
    const at = (i: number, j: number) => ({ x: PLOT_X0 + i + 0.5, z: PLOT_Z0 + j + 0.5 });
    const mid = at(10, 10);
    expect(canWalkOut([], mid.x, mid.z)).toBe(true);
    expect(canWalkOut([], PLOT_X0 - 5, PLOT_Z0 - 5)).toBe(true); // off the plot
    // a tiled house round the walker: walls all round (the door is painted, not open)
    const h = item('h', 'house', 8, 8);
    const p = itemPose(h);
    const walls = bake(THREE, KIND.house, { text: '', stage: 0 }, 1, { x: p.x, y: 0, z: p.z, heading: p.heading }, 0).colliders;
    expect(canWalkOut(walls, p.x, p.z)).toBe(false);
    expect(canWalkOut(walls, p.x, p.z + 4)).toBe(true);
    // a pond under the walker; beside it they are free; a bridge across makes a way out
    const pond = item('p', 'pond', 9, 9);
    const wet = (items: ReturnType<typeof item>[]) => wetCells(items).map(([a, b]) => ({ x: PLOT_X0 + a + 0.5, z: PLOT_Z0 + b + 0.5, r: 0.6 }));
    expect(wetCells([pond]).length).toBe(9);
    expect(canWalkOut(wet([pond]), mid.x, mid.z)).toBe(false);
    const side = at(10, 13);
    expect(canWalkOut(wet([pond]), side.x, side.z)).toBe(true);
    const bridge = item('b', 'bridge', 8, 10);
    expect(wetCells([pond, bridge]).length).toBe(6);
    expect(canWalkOut(wet([pond, bridge]), mid.x, mid.z)).toBe(true);
    // the fence round the plot does not shut anyone in: the gate is open
    const k = GATE_CELLS[0];
    const posts = [];
    for (let a = 0; a <= GRID; a += 0.42) posts.push({ x: PLOT_X0 + a, z: PLOT_Z0, r: 0.24 }, { x: PLOT_X0 + a, z: PLOT_Z0 + GRID, r: 0.24 }, { x: PLOT_X0, z: PLOT_Z0 + a, r: 0.24 });
    expect(canWalkOut(posts, at(2, 2).x, at(2, 2).z)).toBe(true);
    expect(canWalkOut(posts, at(k[0], k[1]).x, at(k[0], k[1]).z)).toBe(true);
  });

  it('puts a thing sold back exactly as it was (the same uid), once', () => {
    resetHome();
    const uid = placeItem('couplets', 3, 4, 1, '春风/秋月')!;
    const it = home.value.items.find((x) => x.uid === uid)!;
    expect(removeItem(uid)).toBeTruthy();
    expect(removeItem(uid)).toBe(null);
    expect(restoreItem(it)).toBe(true);
    expect(home.value.items).toEqual([it]);
    expect(restoreItem(it)).toBe(false);
    setItemText(uid, '');
    expect(home.value.items[0].text).toBeUndefined();
    const pet = adoptPet('parrot', '翠翠')!;
    setPetLine(pet, '恭喜发财');
    expect(home.value.pets[0].line).toBe('恭喜发财');
    expect(sanitizeHome(JSON.parse(JSON.stringify(home.value))).pets[0].line).toBe('恭喜发财');
    setPetLine(pet, '');
    expect('line' in home.value.pets[0]).toBe(false);
    resetHome();
  });

  it('vegetables ripen over days, faster when watered', () => {
    expect(growStage({}, '2026-09-25', diffDays)).toBe(0);
    expect(growStage({ grow: { sown: '2026-09-25', boost: 0 } }, '2026-09-25', diffDays)).toBe(0);
    expect(growStage({ grow: { sown: '2026-09-23', boost: 0 } }, '2026-09-25', diffDays)).toBe(2);
    expect(growStage({ grow: { sown: '2026-09-24', boost: 2 } }, '2026-09-25', diffDays)).toBe(3);
    expect(growStage({ grow: { sown: '2026-09-01', boost: 0 } }, '2026-09-25', diffDays)).toBe(3);
  });

  it('keeps a plot’s season through a save', () => {
    const h = sanitizeHome({ items: [{ uid: 'f', kind: 'farm', i: 1, j: 1, rot: 0, grow: { sown: '2026-09-20', boost: 1, wet: '2026-09-21', reaped: 'bad' } }] });
    expect(h.items[0].grow).toEqual({ sown: '2026-09-20', boost: 1, wet: '2026-09-21' });
    expect(sanitizeHome({ items: [{ uid: 'g', kind: 'farm', i: 1, j: 1, rot: 0, grow: { sown: 'x' } }] }).items[0].grow).toBeUndefined();
  });
});

describe('the brush', () => {
  it('bakes every kind into sane world geometry at any turn', () => {
    for (const k of CATALOG) {
      for (const rot of [0, 1] as const) {
        const p = itemPose(item('t', k.id, 3, 3, rot));
        const b = bake(THREE, k, { text: k.defaultText ?? '', stage: 3 }, 7, { x: p.x, y: 0.6, z: p.z, heading: p.heading }, 5);
        expect(b.verts, k.id).toBeGreaterThan(0);
        expect(b.verts, k.id).toBeLessThan(40000);
        for (const ch of Object.values(b.buckets)) {
          if (!ch) continue;
          expect(ch.pos.every(Number.isFinite) && ch.nor.every(Number.isFinite), k.id).toBe(true);
        }
        // it stays (roughly) over its own footprint
        const f = footprint(k, rot);
        expect(b.box.x0, k.id).toBeGreaterThan(p.x - f.w / 2 - 1.6);
        expect(b.box.x1, k.id).toBeLessThan(p.x + f.w / 2 + 1.6);
        expect(b.box.z0, k.id).toBeGreaterThan(p.z - f.d / 2 - 1.6);
        expect(b.box.z1, k.id).toBeLessThan(p.z + f.d / 2 + 1.6);
        for (const c of b.colliders) expect(Math.abs(c.x - p.x) <= f.w / 2 + 0.5 && Math.abs(c.z - p.z) <= f.d / 2 + 0.5, k.id).toBe(true);
        if (k.use === 'sit' || k.use === 'table') expect(b.seats.length, k.id).toBeGreaterThan(0);
        if (k.text) expect(b.labels.length, k.id).toBeGreaterThan(0);
        const g = flatGeometry(THREE, b);
        expect(g, k.id).toBeTruthy();
        g?.dispose();
      }
    }
  }, 60000);

  it('marks moving parts (windmill, swing) and merges', () => {
    const k = KIND.windmill;
    const b = bake(THREE, k, { text: '', stage: 0 }, 1, { x: 0, y: 0, z: 0, heading: 0 }, 3);
    const anim = [...Object.values(b.buckets)].filter(Boolean).flatMap((c) => Array.from(c!.anim));
    const modes = new Set<number>();
    for (let i = 3; i < anim.length; i += 4) if (anim[i]) modes.add(anim[i] % 8);
    expect(modes.has(1)).toBe(true); // spin
    const s = bake(THREE, KIND.swing, { text: '', stage: 0 }, 1, { x: 0, y: 0, z: 0, heading: 0 }, 9);
    const slots = new Set<number>();
    for (const c of Object.values(s.buckets)) if (c) for (let i = 3; i < c.anim.length; i += 4) if (c.anim[i]) slots.add(Math.floor(c.anim[i] / 8));
    expect([...slots]).toEqual([9]);
    const g = mergeChunks(THREE, [b.buckets.solid!, s.buckets.solid!]);
    expect(g!.attributes.position.count).toBe(b.buckets.solid!.pos.length / 3 + s.buckets.solid!.pos.length / 3);
    expect(g!.attributes.aAnim.itemSize).toBe(4);
  });
});
