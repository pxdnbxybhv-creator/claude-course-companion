import { describe, expect, it } from 'vitest';
import {
  QUALITY_INFO, QUALITY_LEVELS, QUALITY_TEXT, adaptPixelRatio, crowdKeeps, fogFor, gradeSampling, qualityProfile, type Device,
} from '../src/views/walk/world/quality';

const desktop: Device = { dpr: 1, touch: false, cores: 8 };
const retina: Device = { dpr: 2, touch: false, cores: 10 };
const phone: Device = { dpr: 3, touch: true, cores: 6 };
const weakPhone: Device = { dpr: 2, touch: true, cores: 4 };

describe('picture quality profiles', () => {
  it('中 is the world as it always was', () => {
    // the old code: dpr = min(devicePixelRatio, touch ? (lowEnd ? 1.5 : 1.75) : 1.75)
    for (const d of [desktop, retina, phone, weakPhone, { dpr: 1.25, touch: false, cores: 4 }]) {
      const lowEnd = d.touch && d.cores <= 4;
      const dpr = Math.min(d.dpr, d.touch ? (lowEnd ? 1.5 : 1.75) : 1.75);
      const p = qualityProfile('medium', d);
      expect(p.pixelRatio).toBe(dpr);
      expect(p.minPixelRatio).toBe(Math.min(dpr, d.touch ? 1 : 0.75));
      expect(p.canvasAntialias).toBe(lowEnd && dpr < 1.6);
      expect(p.grade).toBe(lowEnd ? 'off' : 'standard');
      expect(p.mirror).toEqual({ scale: lowEnd ? 0.4 : 0.55, every: 1 });
      expect(p.adapt).toMatchObject({ slowMs: 22, step: 0.25, every: 2.5, samples: 30, after: 6 });
      expect(p.distance).toBe(1);
      expect(p.scatter).toEqual({ density: 1, tufts: 30, reeds: 48, shrubs: 70, slabs: 60, rocks: 110 });
      expect(p.landLod).toBe(1);
      expect(p.particles).toBe(1);
      expect(p.crowd).toBe(1);
      expect(p.halo).toBe(1);
      expect(p.shadows).toBeNull();
      expect(p.bloom).toBe(false);
      expect(p.depth).toBe(false);
    }
  });

  it('中 samples the grade as it always did', () => {
    const m = qualityProfile('medium', desktop);
    expect(gradeSampling(m, 1, 1280 * 800)).toEqual({ samples: 4, fxaa: false });
    expect(gradeSampling(m, 1.5, 2560 * 1440)).toEqual({ samples: 2, fxaa: false });
    expect(gradeSampling(m, 1.75, 1280 * 800 * 3)).toEqual({ samples: 0, fxaa: true });
  });

  it('中 lowers the pixel ratio as it always did', () => {
    const m = qualityProfile('medium', retina);
    expect(adaptPixelRatio(m, 1.75, 30)).toBe(1.5);
    expect(adaptPixelRatio(m, 1.75, 18)).toBe(1.75);
    expect(adaptPixelRatio(m, 0.75, 40)).toBe(0.75);
  });

  it('低 is small and quick to give way', () => {
    for (const d of [desktop, retina, phone, weakPhone]) {
      const p = qualityProfile('low', d);
      expect(p.pixelRatio).toBeLessThanOrEqual(1);
      expect(p.pixelRatio).toBeGreaterThanOrEqual(0.75);
      expect(p.minPixelRatio).toBeLessThanOrEqual(0.75);
      expect(p.grade).toBe('off');
      expect(p.canvasAntialias).toBe(false);
      expect(p.shadows).toBeNull();
      expect(p.mirror.scale).toBeLessThanOrEqual(0.25);
      expect(p.mirror.every).toBeGreaterThan(1);
      const m = qualityProfile('medium', d);
      expect(p.adapt.slowMs).toBeLessThan(m.adapt.slowMs);
      expect(p.adapt.every).toBeLessThan(m.adapt.every);
      expect(p.scatter.tufts).toBeLessThan(m.scatter.tufts);
      expect(p.scatter.density).toBeLessThan(1);
      expect(p.distance).toBeLessThan(1);
      expect(p.crowd).toBeLessThan(1);
    }
    expect(gradeSampling(qualityProfile('low', desktop), 1, 1e6)).toEqual({ samples: 0, fxaa: false });
  });

  it('高 and 身临其境 go finer, further and fuller', () => {
    const h = qualityProfile('high', phone), u = qualityProfile('ultra', phone);
    expect(h.pixelRatio).toBe(2);
    expect(u.pixelRatio).toBe(2.5);
    expect(qualityProfile('ultra', desktop).pixelRatio).toBe(1);
    expect(qualityProfile('high', { dpr: 1.5, touch: false, cores: 8 }).pixelRatio).toBe(1.5);
    expect(h.grade).toBe('fine');
    expect(u.grade).toBe('rich');
    expect(u.bloom && u.depth).toBe(true);
    expect(h.shadows).toBeNull();
    expect(u.shadows).not.toBeNull();
    expect(u.shadows!.extent * 2).toBeGreaterThanOrEqual(50);
    expect(u.shadows!.extent * 2).toBeLessThanOrEqual(70);
    expect(u.shadows!.intensity).toBeLessThan(1);
    expect(u.mirror.scale).toBe(1);
    expect(u.distance).toBeGreaterThan(h.distance);
    expect(h.distance).toBeGreaterThan(1);
    expect(u.scatter.tufts).toBeGreaterThan(h.scatter.tufts);
    // ultra only gives way when frames are really slow
    expect(u.adapt.slowMs).toBeGreaterThan(30);
    expect(adaptPixelRatio(u, 2.5, 25)).toBe(2.5);
    expect(adaptPixelRatio(u, 2.5, 50)).toBe(2.25);
    expect(adaptPixelRatio(u, 1.25, 80)).toBe(1.25);
    // always multisampled, FXAA on top where samples are few
    expect(gradeSampling(h, 2, 1280 * 800 * 4)).toEqual({ samples: 4, fxaa: false });
    expect(gradeSampling(h, 2, 2560 * 1600 * 4)).toEqual({ samples: 2, fxaa: true });
    expect(gradeSampling(u, 2.5, 1280 * 800 * 6.25)).toEqual({ samples: 2, fxaa: true });
  });

  it('each level goes one way: more pixels, more things, further', () => {
    const d = retina;
    const ps = QUALITY_LEVELS.map((l) => qualityProfile(l, d));
    for (let i = 1; i < ps.length; i++) {
      expect(ps[i].pixelRatio).toBeGreaterThanOrEqual(ps[i - 1].pixelRatio);
      expect(ps[i].distance).toBeGreaterThan(ps[i - 1].distance);
      expect(ps[i].scatter.tufts).toBeGreaterThan(ps[i - 1].scatter.tufts);
      expect(ps[i].mirror.scale).toBeGreaterThan(ps[i - 1].mirror.scale);
      expect(ps[i].info).toBe(QUALITY_INFO[QUALITY_LEVELS[i]]);
    }
  });

  it('an unknown level or a bad device falls back safely', () => {
    const p = qualityProfile('bogus' as never, { dpr: NaN, touch: false, cores: 8 });
    expect(p.level).toBe('medium');
    expect(p.pixelRatio).toBe(1);
  });

  it('fog scales with distance', () => {
    expect(fogFor(1)).toEqual({ near: 58, far: 176, nightNear: 26, nightFar: 126 });
    expect(fogFor(0.75).far).toBeCloseTo(132);
    expect(fogFor(NaN).far).toBe(176);
  });

  it('thins the crowd by a fixed share, keeping the people a place is made of', () => {
    expect(crowdKeeps(1, 3, 'villager', 'village')).toBe(true);
    for (const role of ['vendor', 'boatman', 'watchman', 'woodfish', 'tea']) expect(crowdKeeps(0.1, 7, role, 'village')).toBe(true);
    let kept = 0;
    const n = 400;
    for (let i = 0; i < n; i++) if (crowdKeeps(0.55, i, 'villager', 'village')) kept++;
    expect(kept / n).toBeGreaterThan(0.45);
    expect(kept / n).toBeLessThan(0.65);
    // the same people every visit
    expect(crowdKeeps(0.55, 12, 'child', 'lake')).toBe(crowdKeeps(0.55, 12, 'child', 'lake'));
  });

  it('every level says what it does, in both languages', () => {
    for (const l of QUALITY_LEVELS) {
      expect(QUALITY_TEXT[l].zh.length).toBeGreaterThan(8);
      expect(QUALITY_TEXT[l].en.length).toBeGreaterThan(8);
      expect(QUALITY_TEXT[l].name.zh).toBeTruthy();
    }
    expect(QUALITY_TEXT.ultra.name.zh).toBe('身临其境');
  });
});
