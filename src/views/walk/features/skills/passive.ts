// Small traces the companions leave as they walk, cheap and quiet:
//  园丁 — sprouts and a petal now and then on the grass;  诗仙 — a faint ink character underfoot;
//  嫦娥 — moonlit ripples where she walks on water;  大橘 — paw prints;  关公 — dust when he runs.
import type { CharacterId } from '../../../../data/characters';
import { CELL, MODE } from './fx';
import { HUE, forward, type SkillEnv } from './env';

const POET_GLYPHS = [...'诗酒月花风云山水春秋醉梦仙鹤松竹'];

export class Trails {
  private lx = NaN;
  private lz = NaN;
  private next = 0;
  private side = 1;
  private glyphAt = 0;
  private glyphN = 0;
  private glyphs: { h: number; born: number; x: number; y: number; z: number; yaw: number }[] = [];

  update(env: SkillEnv, dt: number, t: number, id: CharacterId): void {
    const { ctx, fx, rng } = env;
    const P = ctx.player;
    const p = P.position;
    const sp = Number.isNaN(this.lx) || dt <= 0 ? 0 : Math.hypot(p.x - this.lx, p.z - this.lz) / dt;
    this.lx = p.x; this.lz = p.z;
    // the poet's ink characters fade where they lie
    for (let i = this.glyphs.length - 1; i >= 0; i--) {
      const g = this.glyphs[i];
      const k = (t - g.born) / 6;
      if (k >= 1) { fx.glyphs.remove(g.h); this.glyphs.splice(i, 1); continue; }
      fx.glyphs.setFlat(g.h, g.x, g.y, g.z, 0.32, 0.34 * Math.min(1, k / 0.08) * Math.min(1, (1 - k) / 0.5), 1, g.yaw);
    }
    if (P.isFrozen || !P.grounded || sp < 0.5 || t < this.next) return;
    const floor = env.floorAt(p.x, p.z);
    const water = ctx.waterAt(p.x, p.z);
    const onWater = water !== null && Math.abs(floor - water) < 0.1;
    const [fx0, fz0] = forward(P.heading);
    switch (id) {
      case 'gardener': {
        this.next = t + 0.9;
        if (onWater) return;
        const x = p.x - fx0 * 0.4 + rng.range(-0.35, 0.35), z = p.z - fz0 * 0.4 + rng.range(-0.35, 0.35);
        if (rng.chance(0.55)) fx.ground.emit({ x, y: ctx.groundY(x, z) + 0.06, z, life: rng.range(8, 12), size: rng.range(0.12, 0.17), grow: 1.2, color: rng.chance(0.5) ? HUE.leaf : HUE.jade, mode: MODE.puff, cell: CELL.sprout, fadeIn: 0.5, fadeOut: 0.3, rot: rng.range(-0.2, 0.2) });
        else fx.ground.emit({ x, y: ctx.groundY(x, z) + 0.02, z, life: rng.range(8, 12), size: rng.range(0.07, 0.1), color: rng.pick([HUE.rouge, HUE.peach, HUE.white, HUE.gamboge]), mode: MODE.flat, cell: rng.chance(0.5) ? CELL.blossom : CELL.petal, fadeIn: 0.3, fadeOut: 0.3 });
        return;
      }
      case 'poet': {
        this.next = t + 0.5;
        if (t < this.glyphAt || this.glyphs.length >= 3 || onWater) return;
        this.glyphAt = t + 2.6;
        const h = fx.glyphs.add(POET_GLYPHS[this.glyphN++ % POET_GLYPHS.length], HUE.inkSoft);
        if (h < 0) return;
        const x = p.x - fx0 * 0.5, z = p.z - fz0 * 0.5;
        this.glyphs.push({ h, born: t, x, y: ctx.groundY(x, z) + 0.03, z, yaw: P.heading + Math.PI });
        return;
      }
      case 'change': {
        this.next = t + 0.32;
        if (!onWater) return;
        const night = env.night() > 0.5;
        fx.ground.emit({ x: p.x, y: water! + 0.03, z: p.z, life: 1.8, size: 0.35, grow: 5, color: night ? HUE.silver : 0xf2f5fa, alpha: night ? 0.7 : 0.55, mode: night ? MODE.flatGlow : MODE.flat, cell: CELL.ring, fadeIn: 0.05, fadeOut: 0.7 });
        return;
      }
      case 'cat': {
        this.next = t + 0.26;
        if (onWater) return;
        this.side = -this.side;
        const x = p.x - fz0 * 0.06 * this.side, z = p.z + fx0 * 0.06 * this.side;
        fx.ground.emit({ x, y: ctx.groundY(x, z) + 0.02, z, life: 7, size: 0.12, color: HUE.inkSoft, alpha: 0.42, mode: MODE.flat, cell: CELL.paw, rot: P.heading + Math.PI, fadeIn: 0.05, fadeOut: 0.35 });
        return;
      }
      case 'guan': {
        this.next = t + 0.09;
        if (sp < 3.2 || onWater) return;
        fx.air.emit({ x: p.x - fx0 * 0.3 + rng.range(-0.2, 0.2), y: floor + 0.06, z: p.z - fz0 * 0.3 + rng.range(-0.2, 0.2), vx: -fx0 * 0.5, vy: rng.range(0.2, 0.5), vz: -fz0 * 0.5, drag: 2, life: rng.range(0.6, 0.9), size: rng.range(0.22, 0.32), grow: 2.2, color: HUE.dust, alpha: 0.28, mode: MODE.puff, cell: CELL.soft });
        return;
      }
      default:
        this.next = t + 0.5;
    }
  }
}
