// Photographs: the filters on small pixel arrays (the same colour matrices the live CSS preview
// uses), the frames' layout, the inscription and the file name, and the album without IndexedDB.
import { describe, expect, it } from 'vitest';
import {
  FILTER_OPS, PHOTO_FILTERS, PHOTO_FRAMES, applyFilter, cssFilter, filterPixels, frameLayout, inscriptionText, inside, overlaps, photoName, type PhotoFrame,
} from '../src/views/walk/world/photoFx';
import { ALBUM_KEEP, addPhoto, listPhotos, removePhoto } from '../src/views/walk/photo/album';

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe('filters', () => {
  it('write the CSS the preview uses', () => {
    expect(cssFilter('none')).toBe('none');
    expect(cssFilter('ink')).toBe('grayscale(1) sepia(0.14) contrast(1.16) brightness(1.05)');
    expect(cssFilter('warm')).toContain('hue-rotate(-6deg)');
    for (const f of PHOTO_FILTERS) expect(cssFilter(f)).not.toMatch(/undefined|NaN/);
  });

  it('原色 leaves the pixels alone', () => {
    const d = px(12, 200, 99, 255, 255, 0, 3, 128);
    applyFilter(d, 'none');
    expect([...d]).toEqual([12, 200, 99, 255, 255, 0, 3, 128]);
  });

  it('greyscale gives the luminance in every channel; alpha is untouched', () => {
    const d = px(255, 0, 0, 77);
    filterPixels(d, [['grayscale', 1]]);
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
    expect(d[0]).toBe(54); // 0.2126 × 255
    expect(d[3]).toBe(77);
  });

  it('sepia on white clamps, as the browser does', () => {
    const d = px(255, 255, 255, 255);
    filterPixels(d, [['sepia', 1]]);
    expect([d[0], d[1], d[2]]).toEqual([255, 255, 239]);
  });

  it('identity amounts change nothing', () => {
    const d = px(10, 120, 240, 255, 60, 60, 60, 255);
    filterPixels(d, [['saturate', 1], ['hue', 0], ['brightness', 1], ['contrast', 1], ['sepia', 0], ['grayscale', 0]]);
    expect([...d]).toEqual([10, 120, 240, 255, 60, 60, 60, 255]);
  });

  it('a full turn of hue comes back round', () => {
    const d = px(200, 90, 30, 255);
    filterPixels(d, [['hue', 360]]);
    expect(Math.abs(d[0] - 200) + Math.abs(d[1] - 90) + Math.abs(d[2] - 30)).toBeLessThanOrEqual(3);
  });

  it('contrast pulls toward the middle; brightness scales', () => {
    const d = px(0, 255, 128, 255);
    filterPixels(d, [['contrast', 0.5]]);
    expect(d[0]).toBe(64);
    expect(d[1]).toBe(191);
    expect(d[2]).toBe(128);
    const e = px(100, 100, 100, 255);
    filterPixels(e, [['brightness', 1.5]]);
    expect(e[0]).toBe(150);
  });

  it('clamps between steps (each function works on the last one’s image)', () => {
    const d = px(200, 200, 200, 255);
    filterPixels(d, [['brightness', 2], ['brightness', 0.5]]);
    expect(d[0]).toBe(128); // 255 × 0.5, not 200
  });

  it('水墨 turns colour to warm grey; 旧纸 yellows; 冷 cools', () => {
    const d = px(40, 160, 90, 255);
    applyFilter(d, 'ink');
    expect(d[0]).toBeGreaterThanOrEqual(d[1]);
    expect(d[1]).toBeGreaterThanOrEqual(d[2]);
    expect(d[0] - d[2]).toBeLessThan(16);
    const p = px(128, 128, 128, 255);
    applyFilter(p, 'paper');
    expect(p[0]).toBeGreaterThan(p[2] + 10);
    const w = px(128, 128, 128, 255), c = px(128, 128, 128, 255);
    applyFilter(w, 'warm');
    applyFilter(c, 'cool');
    expect(w[0] - w[2]).toBeGreaterThan(c[0] - c[2]);
  });

  it('every filter keeps every pixel in range', () => {
    const d = new Uint8ClampedArray(4 * 64);
    for (let i = 0; i < d.length; i++) d[i] = (i * 37) % 256;
    for (const f of PHOTO_FILTERS) {
      const x = d.slice();
      applyFilter(x, f);
      for (const v of x) expect(v >= 0 && v <= 255).toBe(true);
    }
    expect(Object.keys(FILTER_OPS).sort()).toEqual([...PHOTO_FILTERS].sort());
  });
});

describe('frames', () => {
  const sizes: [number, number][] = [[2400, 1500], [947, 2048], [2000, 2000], [3072, 1200]];
  it('keep the photograph whole, in proportion, at its own resolution', () => {
    for (const f of PHOTO_FRAMES) {
      for (const [w, h] of sizes) {
        const L = frameLayout(f, w, h, 64e6);
        const all = { x: 0, y: 0, w: L.W, h: L.H };
        expect(inside(L.photo, all)).toBe(true);
        expect(L.photo.w / L.photo.h).toBeCloseTo(w / h, 6);
        expect(L.photo.w * L.k).toBeCloseTo(w, 3);
      }
    }
  });

  it('put the inscription on the mount (never over the picture), or in its corner when bare', () => {
    for (const f of PHOTO_FRAMES) {
      for (const [w, h] of sizes) {
        const L = frameLayout(f, w, h);
        const all = { x: 0, y: 0, w: L.W, h: L.H };
        expect(inside(L.text.box, all)).toBe(true);
        if (f === 'none') {
          expect(inside(L.text.box, L.photo)).toBe(true);
          expect(L.text.ink).toBe('light');
        } else {
          expect(overlaps(L.text.box, L.photo)).toBe(false);
          expect(L.text.ink).toBe('dark');
        }
        expect(L.text.size).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it('画轴: the poetry panel above the picture, the scroll inside the wall, head taller than foot', () => {
    const L = frameLayout('scroll', 1500, 2400);
    const S = L.scroll!;
    expect(S.panel.y + S.panel.h).toBeLessThan(S.painting.y);
    expect(S.panel.y).toBeGreaterThan(S.top + S.head);
    expect(S.head).toBeGreaterThan(S.foot);
    expect(S.x).toBeGreaterThan(34); // room for the roller's knobs
    expect(S.x + S.w).toBeLessThan(L.W - 34);
    expect(S.nailY).toBeLessThan(S.top);
    expect(S.painting.y + S.painting.h + S.gapB + S.foot + S.rollerD).toBeLessThan(L.H);
  });

  it('册页: the leaf holds the picture with a wide margin for the words', () => {
    const L = frameLayout('album', 2400, 1500);
    const A = L.album!;
    expect(inside(A.leaf, A.outer)).toBe(true);
    expect(inside(L.photo, A.leaf)).toBe(true);
    expect(L.photo.x - A.leaf.x).toBeGreaterThan(A.leaf.x + A.leaf.w - (L.photo.x + L.photo.w));
    expect(inside(L.text.box, A.leaf)).toBe(true);
  });

  it('scale down, never crop, when the whole would pass the pixel budget', () => {
    for (const f of ['scroll', 'album', 'none'] as PhotoFrame[]) {
      const L = frameLayout(f, 3072, 2048, 8e6, 4096);
      expect(L.W * L.k * L.H * L.k).toBeLessThanOrEqual(8e6 * 1.0001);
      expect(Math.max(L.W, L.H) * L.k).toBeLessThanOrEqual(4096 + 1e-6);
      expect(L.photo.w / L.photo.h).toBeCloseTo(1.5, 6);
    }
  });
});

describe('the inscription and the file', () => {
  const at = new Date(2026, 8, 26, 14, 30, 5);
  it('reads the lunar date and the place in Chinese, one line each in English', () => {
    const zh = inscriptionText({ lang: 'zh', ganzhi: '丙午', lunarMonth: '八月', lunarDay: '十六', placeZh: '荷塘', placeEn: 'Lotus Lake', date: at });
    expect(zh).toEqual(['丙午年八月十六', '荷塘留影']);
    const en = inscriptionText({ lang: 'en', ganzhi: '丙午', lunarMonth: '八月', lunarDay: '十六', placeZh: '荷塘', placeEn: 'Lotus Lake', date: at });
    expect(en).toEqual(['Lotus Lake', '26 Sep 2026']);
  });

  it('names the file by the moment it was taken', () => {
    expect(photoName(at)).toBe('banmu-photo-20260926-143005.jpg');
  });
});

describe('the album without IndexedDB (a sandboxed frame)', () => {
  const blob = (s: string) => new Blob([s], { type: 'image/jpeg' });
  it('keeps the pictures for the session, newest first, twelve at most', async () => {
    for (let i = 0; i < ALBUM_KEEP + 3; i++) {
      const lasting = await addPhoto({ at: 1000 + i, name: `p${i}.jpg`, w: 10, h: 10, blob: blob('x' + i), thumb: blob('t' + i) });
      expect(lasting).toBe(false);
    }
    const ps = await listPhotos();
    expect(ps.length).toBe(ALBUM_KEEP);
    expect(ps[0].name).toBe(`p${ALBUM_KEEP + 2}.jpg`);
    await removePhoto(ps[0].id);
    expect((await listPhotos()).length).toBe(ALBUM_KEEP - 1);
  });
});
