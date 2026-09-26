// A small still for the "入画" card in the games hall: a little scholar on a stepping-stone path
// among ink bamboo and orchid, the path running down to an arched bridge over the river, a pagoda
// on the far ridge, a round moon over pale mountains. Cheap (a few ms), deterministic.
import { makeRng } from '../../core/rng';
import { toLunar, festivalsOn } from '../../core/lunar';
import { activeHabits } from '../../app/store';

export function paintPreview(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (!g) return;
  const W = canvas.width, H = canvas.height;
  const rng = makeRng(20260925);
  const u = Math.min(W, H * 1.6) / 100; // unit
  // paper
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#ece3cf');
  bg.addColorStop(1, '#f3ecdd');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  // moon (a paper disc ringed by a faint wash)
  const mx = W * 0.72, my = H * 0.3, mr = Math.min(W, H) * 0.14;
  const halo = g.createRadialGradient(mx, my, mr * 0.9, mx, my, mr * 2.4);
  halo.addColorStop(0, 'rgba(226,167,46,0.22)');
  halo.addColorStop(1, 'rgba(226,167,46,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fbf0d6';
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();

  // mountains, far to near
  const ridge = (base: number, amp: number, color: string, alpha: number, seed: number) => {
    const r = makeRng(seed);
    const pts: [number, number][] = [];
    let y = base;
    for (let x = -10; x <= W + 10; x += W / 18) {
      y = base - amp * (0.3 + 0.7 * r());
      pts.push([x, y]);
    }
    const grd = g.createLinearGradient(0, base - amp, 0, base + H * 0.18);
    grd.addColorStop(0, color.replace('A', String(alpha)));
    grd.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-10, H);
    for (let i = 0; i < pts.length; i++) {
      const [x, yy] = pts[i];
      const [nx, ny] = pts[i + 1] ?? pts[i];
      g.quadraticCurveTo(x, yy, (x + nx) / 2, (yy + ny) / 2);
    }
    g.lineTo(W + 10, H);
    g.closePath();
    g.fill();
  };
  // 青绿: the far ridge in a 花青 wash, the near one in jade over ink-brown
  ridge(H * 0.52, H * 0.16, 'rgba(63,110,124,A)', 0.32, 3);
  ridge(H * 0.62, H * 0.12, 'rgba(70,112,78,A)', 0.4, 8);

  // far off on the left ridge, the temple's pagoda (the world goes on beyond the garden)
  const pgx = W * 0.2, pgy = H * 0.47;
  g.fillStyle = 'rgba(92,60,40,0.5)';
  for (let i = 0; i < 5; i++) {
    const w = u * (3 - i * 0.42), y = pgy - i * u * 2;
    g.fillRect(pgx - w * 0.35, y - u * 1.3, w * 0.7, u * 1.3);
    g.beginPath(); g.moveTo(pgx - w * 0.75, y - u * 1.2); g.quadraticCurveTo(pgx, y - u * 1.9, pgx + w * 0.75, y - u * 1.2); g.lineTo(pgx, y - u * 2.1); g.closePath(); g.fill();
  }
  g.fillRect(pgx - u * 0.12, pgy - u * 12.5, u * 0.24, u * 2.4);

  // the river across the middle distance, and an arched bridge where the path meets it
  const ry = H * 0.665;
  g.fillStyle = 'rgba(64,116,128,0.26)';
  g.beginPath();
  g.moveTo(0, ry - u * 1.2);
  for (let x = 0; x <= W; x += W / 12) g.lineTo(x, ry - u * (1.1 + 0.4 * Math.sin(x * 0.03)));
  for (let x = W; x >= 0; x -= W / 12) g.lineTo(x, ry + u * (1.4 + 0.4 * Math.cos(x * 0.025)));
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(27,25,22,0.35)';
  g.lineWidth = Math.max(1, u * 0.2);
  for (let i = 0; i < 4; i++) {
    const x = W * (0.1 + i * 0.24);
    g.beginPath(); g.moveTo(x, ry + u * 0.2); g.lineTo(x + u * 3.5, ry + u * 0.2); g.stroke();
  }
  const bx = W * 0.47, bw = u * 6.5, bh = u * 2.6;
  g.fillStyle = '#e6d6b4';
  g.strokeStyle = 'rgba(27,25,22,0.75)';
  g.lineWidth = Math.max(1, u * 0.28);
  g.beginPath();
  g.moveTo(bx - bw, ry + u * 0.6);
  g.quadraticCurveTo(bx, ry - bh * 1.6, bx + bw, ry + u * 0.6);
  g.lineTo(bx + bw * 0.55, ry + u * 0.6);
  g.ellipse(bx, ry + u * 0.6, bw * 0.55, bh * 0.75, 0, 0, Math.PI, true);
  g.closePath();
  g.fill(); g.stroke();

  // the path: stepping stones curving toward the moon
  for (let i = 0; i < 11; i++) {
    const k = i / 10;
    const x = W * (0.3 + 0.28 * Math.sin(k * 2.2 + 0.4)) + (1 - k) * W * 0.05;
    const y = H * (0.97 - k * 0.3);
    const s = (1 - k * 0.65) * u * 2.2;
    g.fillStyle = 'rgba(27,25,22,0.32)';
    g.beginPath(); g.ellipse(x, y, s * 1.15, s * 0.42, rng.range(-0.2, 0.2), 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2d1ad';
    g.beginPath(); g.ellipse(x, y - s * 0.08, s, s * 0.34, 0, 0, Math.PI * 2); g.fill();
  }

  // bamboo, left
  g.lineCap = 'round';
  for (let c = 0; c < 3; c++) {
    const x0 = W * (0.08 + c * 0.05), h = H * (0.75 - c * 0.12);
    g.strokeStyle = `rgba(27,25,22,${0.8 - c * 0.2})`;
    g.lineWidth = u * (0.9 - c * 0.15);
    const segs = 5;
    for (let s = 0; s < segs; s++) {
      const y1 = H - (h * s) / segs - 2, y2 = H - (h * (s + 1)) / segs + u * 0.4;
      g.beginPath(); g.moveTo(x0 + s * u * 0.15, y1); g.lineTo(x0 + (s + 1) * u * 0.15, y2); g.stroke();
    }
    // leaves in 个 clusters
    for (let l = 0; l < 3; l++) {
      const lx = x0 + u * 0.8, ly = H - h * (0.45 + l * 0.2);
      for (const a of [-0.5, 0.35, 0.9]) {
        const len = u * rng.range(4, 6.5), ang = a + rng.range(-0.2, 0.2) + (c % 2 ? 0.3 : -0.1);
        g.fillStyle = `rgba(27,25,22,${0.75 - c * 0.18})`;
        g.beginPath();
        g.moveTo(lx, ly);
        g.quadraticCurveTo(lx + Math.cos(ang - 0.25) * len * 0.5, ly + Math.sin(ang - 0.25) * len * 0.5, lx + Math.cos(ang) * len, ly + Math.sin(ang) * len);
        g.quadraticCurveTo(lx + Math.cos(ang + 0.25) * len * 0.5, ly + Math.sin(ang + 0.25) * len * 0.5, lx, ly);
        g.fill();
      }
    }
  }
  // orchid, right foreground
  const ox = W * 0.86, oy = H * 0.98;
  g.strokeStyle = 'rgba(27,25,22,0.8)';
  for (const [a, l] of [[-2.1, 16], [-1.3, 20], [-0.8, 14], [-2.5, 11], [-1.7, 18]] as const) {
    g.lineWidth = u * 0.45;
    g.beginPath();
    g.moveTo(ox, oy);
    g.quadraticCurveTo(ox + Math.cos(a) * u * l * 0.5, oy + Math.sin(a) * u * l * 0.7, ox + Math.cos(a + 0.5) * u * l, oy + Math.sin(a + 0.3) * u * l * 0.8);
    g.stroke();
  }
  g.fillStyle = 'rgba(184,58,75,0.55)';
  g.beginPath(); g.ellipse(ox - u * 2, oy - u * 9, u * 0.9, u * 0.5, -0.4, 0, Math.PI * 2); g.fill();

  // the little scholar, walking in
  const fx = W * 0.47, fy = H * 0.84, fs = u * 1.15;
  g.fillStyle = 'rgba(27,25,22,0.18)';
  g.beginPath(); g.ellipse(fx, fy + fs * 0.2, fs * 2.4, fs * 0.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f3ead6';
  g.strokeStyle = '#1b1916';
  g.lineWidth = Math.max(1, fs * 0.28);
  g.beginPath();
  g.moveTo(fx - fs * 2, fy);
  g.quadraticCurveTo(fx - fs * 1.6, fy - fs * 4, fx - fs * 0.9, fy - fs * 5.6);
  g.lineTo(fx + fs * 0.9, fy - fs * 5.6);
  g.quadraticCurveTo(fx + fs * 1.6, fy - fs * 4, fx + fs * 2, fy);
  g.closePath();
  g.fill(); g.stroke();
  g.fillStyle = '#a8463a';
  g.fillRect(fx - fs * 1.2, fy - fs * 3.6, fs * 2.4, fs * 0.5);
  g.fillStyle = '#f2dcc3';
  g.beginPath(); g.arc(fx, fy - fs * 7, fs * 1.6, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#1b1916';
  g.beginPath(); g.arc(fx, fy - fs * 7.3, fs * 1.65, Math.PI * 1.05, Math.PI * 1.95); g.fill();
  g.beginPath(); g.arc(fx, fy - fs * 9, fs * 0.65, 0, Math.PI * 2); g.fill();
}

export function statLine(lang: 'zh' | 'en'): string | null {
  const now = new Date();
  const fest = festivalsOn(now)[0];
  const n = activeHabits.value.length;
  if (fest) return lang === 'zh' ? `今日${fest.zh} · 园中有惊喜` : `${fest.en} today — a surprise awaits`;
  const lunar = toLunar(now);
  if (n) return lang === 'zh' ? `${n} 株花木 · ${lunar.monthName}${lunar.dayName}` : `${n} plant${n > 1 ? 's' : ''} waiting for you`;
  return null;
}
