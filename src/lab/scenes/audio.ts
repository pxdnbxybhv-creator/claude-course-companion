// /lab.html?scene=audio[&only=bell,knock][&sr=48000]   — offline renders + measurements
// /lab.html?scene=audio&live=1                          — realtime engine smoke/leak test
//
// Every sound is rendered through the real node graph (Mixer: reverb, compressor, soft clip)
// in an OfflineAudioContext, then measured: peak, RMS, DC, NaNs, T-60, and pitch (YIN) for the
// plucks. Each panel draws the waveform with its RMS envelope in dB (cinnabar) and a
// log-frequency spectrogram (50 Hz – 16 kHz, 80 dB range).
import type { AmbientKind } from '../../core/types';
import { Mixer } from '../../audio/graph';
import { degreeFreq, playBell, playChime, playKnock, playPluck, qinRange } from '../../audio/voices';
import { createBed } from '../../audio/ambient';
import { renderQin } from '../../audio/dsp';
import { audio } from '../../audio/engine';

const PAPER = '#f1e9d8', INK = '#1d1a16', RED = '#b93a2b', MUTED = 'rgba(29,26,22,.55)';

interface Case { name: string; dur: number; play: (m: Mixer) => void; pitch?: number; ambient?: AmbientKind; notes?: () => string }

function cases(): Case[] {
  const bedCase = (kind: AmbientKind, dur: number, name: string): Case => {
    let bed: ReturnType<typeof createBed> = null;
    const seed = Number(new URLSearchParams(location.search).get('seed') ?? 1234);
    return {
      name, dur, ambient: kind,
      play: (m) => { bed = createBed(kind, m, 0.05, seed); bed?.tick(dur); },
      notes: () => {
        const h = (bed as unknown as { history?: { t: number; deg: number; tex: string; slide?: number; glide?: number; dyad?: number }[] })?.history;
        if (!h) return '';
        const names = ['宫', '商', '角', '徵', '羽'];
        let prev = -9, line = '';
        for (const e of h) {
          if (e.t - prev > 1.9) line += ` ‖${e.t.toFixed(0)}s ${e.tex}:`;
          prev = e.t;
          const o = Math.floor(e.deg / 5);
          line += ` ${names[e.deg - 5 * o]}${o >= 0 ? "'".repeat(o) : ','.repeat(-o)}${e.slide ? (e.slide > 0 ? '↗' : '↘') : ''}${e.glide ? '~' : ''}${e.dyad !== undefined ? '+8' : ''}`;
        }
        return line;
      },
    };
  };
  return [
    { name: 'pluck 宫 F3 (degree 0)', dur: 6, pitch: degreeFreq(0), play: (m) => playPluck(m, 0.05, 0, 0.7) },
    { name: 'pluck 徵 C2 (degree −7, lowest string)', dur: 7, pitch: degreeFreq(-7), play: (m) => playPluck(m, 0.05, -7, 0.85) },
    { name: 'pluck 徵 C5 (degree 8)', dur: 5, pitch: degreeFreq(8), play: (m) => playPluck(m, 0.05, 8, 0.6) },
    { name: 'chime(1) — 2 harmonics', dur: 5, play: (m) => playChime(m, 0.05, 1) },
    { name: 'chime(30) — 4 harmonics + 散音 + low 泛', dur: 6, play: (m) => playChime(m, 0.05, 30) },
    { name: 'bell 颂钵', dur: 10, play: (m) => playBell(m, 0.05) },
    { name: 'knock 木鱼', dur: 1.2, play: (m) => playKnock(m, 0.05) },
    bedCase('rain', 12, 'ambient rain 雨'),
    bedCase('stream', 12, 'ambient stream 溪'),
    bedCase('pines', 16, 'ambient pines 松风'),
    bedCase('qin', 40, 'ambient qin 琴 (generative)'),
    {
      name: 'stress: 3 loud plucks + chime(30) + bell + knock + qin bed', dur: 10,
      play: (m) => {
        createBed('qin', m, 0, 99)?.tick(10);
        playBell(m, 0.05); playKnock(m, 0.06); playChime(m, 0.1, 30);
        for (const d of [-7, 0, 4]) playPluck(m, 0.1, d, 1);
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// analysis

interface Measure { peak: number; rms: number; dc: number; nans: number; t60: number | null; env: Float32Array; envHop: number }

function measure(chs: Float32Array[], sr: number): Measure {
  let peak = 0, sum = 0, nans = 0, dc = 0;
  const n = chs[0].length;
  for (const c of chs) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) { nans++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v; m += v;
    }
    dc = Math.max(dc, Math.abs(m / n));
  }
  const hop = Math.round(sr * 0.01);
  const env = new Float32Array(Math.floor(n / hop));
  for (let k = 0; k < env.length; k++) {
    let e = 0;
    for (const c of chs) for (let i = k * hop; i < (k + 1) * hop; i++) e += c[i] * c[i];
    env[k] = Math.sqrt(e / (hop * chs.length));
  }
  let emax = 0, kmax = 0;
  env.forEach((v, k) => { if (v > emax) { emax = v; kmax = k; } });
  // T-60: last time the 10 ms RMS is within 60 dB of its maximum (null if it never falls that far)
  let t60: number | null = null;
  for (let k = env.length - 1; k > kmax; k--) if (env[k] > emax * 1e-3) { t60 = k < env.length - 2 ? ((k - kmax) * hop) / sr : null; break; }
  return { peak, rms: Math.sqrt(sum / (n * chs.length)), dc, nans, t60, env, envHop: hop };
}

/** YIN fundamental estimate over [t0, t1) seconds. */
function yin(x: Float32Array, sr: number, t0: number, t1: number, fmin = 50, fmax = 1200): number {
  const s = Math.round(t0 * sr), W = Math.round((t1 - t0) * sr);
  const tmin = Math.floor(sr / fmax), tmax = Math.ceil(sr / fmin);
  const d = new Float64Array(tmax + 2);
  for (let tau = 1; tau <= tmax + 1; tau++) {
    let acc = 0;
    for (let j = s; j < s + W; j++) { const v = x[j] - x[j + tau]; acc += v * v; }
    d[tau] = acc;
  }
  let run = 0;
  const dn = new Float64Array(tmax + 2);
  dn[0] = 1;
  for (let tau = 1; tau <= tmax + 1; tau++) { run += d[tau]; dn[tau] = (d[tau] * tau) / (run || 1); }
  let best = -1;
  for (let tau = tmin; tau <= tmax; tau++) {
    if (dn[tau] < 0.12) { while (tau + 1 <= tmax && dn[tau + 1] < dn[tau]) tau++; best = tau; break; }
  }
  if (best < 0) { let m = Infinity; for (let tau = tmin; tau <= tmax; tau++) if (dn[tau] < m) { m = dn[tau]; best = tau; } }
  const a = dn[best - 1], b = dn[best], c = dn[best + 1];
  const off = (a - c) / (2 * (a - 2 * b + c)) || 0;
  return sr / (best + Math.max(-1, Math.min(1, off)));
}
const cents = (f: number, ref: number) => 1200 * Math.log2(f / ref);

function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// drawing

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string, chs: Float32Array[], sr: number, m: Measure, extra: string, ok: boolean, win = 0) {
  if (win > 0) chs = chs.map((c) => c.subarray(0, Math.min(c.length, Math.round(win * sr))));
  const mono = new Float32Array(chs[0].length);
  for (const c of chs) for (let i = 0; i < mono.length; i++) mono[i] += c[i] / chs.length;
  const n = mono.length;
  ctx.fillStyle = ok ? INK : RED;
  ctx.font = '600 13px system-ui';
  ctx.fillText(`${ok ? '✓' : '✗'} ${name}`, x, y + 12);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = MUTED;
  const db = (v: number) => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  ctx.fillText(`peak ${m.peak.toFixed(3)} (${db(m.peak)})  rms ${db(m.rms)}  dc ${m.dc.toExponential(0)}  nan ${m.nans}  T60 ${m.t60 == null ? '—' : m.t60.toFixed(1) + 's'} ${extra}`, x, y + 27, w);

  // waveform + RMS envelope (dB, 0 → −80 over the strip height)
  const wy = y + 34, wh = 40;
  ctx.fillStyle = 'rgba(29,26,22,.04)';
  ctx.fillRect(x, wy, w, wh);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let px = 0; px < w; px++) {
    const a = Math.floor((px / w) * n), b = Math.floor(((px + 1) / w) * n);
    let lo = 0, hi = 0;
    for (let i = a; i < b; i++) { if (mono[i] < lo) lo = mono[i]; if (mono[i] > hi) hi = mono[i]; }
    ctx.moveTo(x + px + 0.5, wy + wh / 2 - hi * (wh / 2));
    ctx.lineTo(x + px + 0.5, wy + wh / 2 - lo * (wh / 2) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = RED;
  ctx.beginPath();
  m.env.forEach((v, k) => {
    if (k * m.envHop >= n) return;
    const px = x + (k * m.envHop / n) * w;
    const d = Math.max(-80, 20 * Math.log10(Math.max(v, 1e-9)));
    const py = wy + (-d / 80) * wh;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.stroke();

  // log-frequency spectrogram
  const sy = wy + wh + 3, sh = h - (sy - y) - 6;
  const N = 2048;
  const img = ctx.createImageData(Math.floor(w), Math.floor(sh));
  const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const fLo = 50, fHi = 16000;
  const cols: Float64Array[] = [];
  let gmax = -Infinity;
  const ltas = new Float64Array(N / 2);
  for (let px = 0; px < img.width; px++) {
    const s = Math.floor((px / img.width) * Math.max(0, n - N));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (mono[s + i] ?? 0) * hann[i];
    fft(re, im);
    for (let b = 1; b < N / 2; b++) ltas[b] += re[b] * re[b] + im[b] * im[b];
    const col = new Float64Array(img.height);
    for (let py = 0; py < img.height; py++) {
      const f0 = fLo * Math.pow(fHi / fLo, 1 - (py + 1) / img.height), f1 = fLo * Math.pow(fHi / fLo, 1 - py / img.height);
      const b0 = Math.max(1, Math.floor((f0 * N) / sr)), b1 = Math.max(b0, Math.min(N / 2 - 1, Math.floor((f1 * N) / sr)));
      let mx = 0;
      for (let b = b0; b <= b1; b++) mx = Math.max(mx, re[b] * re[b] + im[b] * im[b]);
      col[py] = 10 * Math.log10(mx + 1e-20);
      if (col[py] > gmax) gmax = col[py];
    }
    cols.push(col);
  }
  const P = [241, 233, 216], I = [29, 26, 22];
  for (let px = 0; px < img.width; px++) for (let py = 0; py < img.height; py++) {
    const v = Math.max(0, Math.min(1, (cols[px][py] - gmax + 80) / 80));
    const u = Math.pow(v, 1.6);
    const o = (py * img.width + px) * 4;
    for (let c = 0; c < 3; c++) img.data[o + c] = P[c] + (I[c] - P[c]) * u;
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, x * (ctx.getTransform().a), sy * (ctx.getTransform().d));
  let num = 0, den = 0;
  for (let b = 1; b < N / 2; b++) { num += ((b * sr) / N) * ltas[b]; den += ltas[b]; }
  ctx.fillStyle = INK;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText(`centroid ${(num / (den || 1)).toFixed(0)} Hz`, x + w - 110, sy + 11);
  ctx.fillStyle = MUTED;
  ctx.font = '9px ui-monospace, monospace';
  for (const f of [100, 1000, 10000]) {
    const py = sy + (1 - Math.log(f / fLo) / Math.log(fHi / fLo)) * sh;
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 2, py + 3);
  }
}

// ---------------------------------------------------------------------------

async function liveTest(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = INK;
  ctx.font = '13px ui-monospace, monospace';
  const lines: string[] = [];
  const log = (s: string) => { lines.push(s); console.warn('[audio-live]', s); ctx.fillText(s, 20, 24 + lines.length * 18); };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await audio.unlock();
  log(`after unlock: ${JSON.stringify(audio.stats())}`);
  audio.setVolume(0.8);
  for (const d of [0, 2, 4, 7]) audio.pluck(d, 0.6);
  audio.chime(8); audio.knock();
  audio.setAmbient('rain');
  await wait(400);
  log(`sounding: ${JSON.stringify(audio.stats())}`);
  await wait(2500);
  audio.setAmbient('qin');
  await wait(2500);
  log(`crossfaded to qin: ${JSON.stringify(audio.stats())}`);
  audio.setEnabled(false);
  audio.pluck(0); // must be a no-op while disabled
  await wait(300);
  log(`disabled: ${JSON.stringify(audio.stats())}`);
  audio.setEnabled(true);
  audio.setAmbient('none');
  await wait(9000);
  const s = audio.stats();
  log(`idle after 9 s: ${JSON.stringify(s)}`);
  log(s.voices === 0 && s.fading === 0 && s.ambient === 'none' ? 'PASS — no live voices, all beds released' : 'FAIL — leaked voices or beds');
}

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  if (p.get('live')) return liveTest(canvas);
  const sr = Number(p.get('sr') ?? 48000);
  const only = (p.get('only') ?? '').split(',').filter(Boolean);
  const list = cases().filter((c) => !only.length || only.some((o) => c.name.includes(o)));
  const cols = list.length > 3 ? 2 : 1;
  const panelH = 150, header = 150, gap = 14;
  const W = window.innerWidth;
  const rows = Math.ceil(list.length / cols);
  const H = header + rows * (panelH + gap) + 10;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // 1. pitch accuracy of the raw string model across the range, and render cost
  const pitchRows: string[] = [];
  let worst = 0, costMax = 0, costSum = 0;
  for (let d = -7; d <= 9; d++) {
    const f = qinRange(degreeFreq(d));
    const t0 = performance.now();
    const x = renderQin(sr, { freq: f, velocity: 0.7, seed: d + 50 });
    const dt = performance.now() - t0;
    costMax = Math.max(costMax, dt); costSum += dt;
    const est = yin(x, sr, 0.3, 0.3 + Math.max(0.06, 6 / f), 50, 1200);
    const c = cents(est, f);
    worst = Math.max(worst, Math.abs(c));
    pitchRows.push(`${d}:${c >= 0 ? '+' : ''}${c.toFixed(1)}`);
  }
  // with glide + vibrato (engine defaults): pitch after the glide, before the vibrato
  const withGlide = renderQin(sr, { freq: degreeFreq(0), velocity: 0.7, glide: { cents: -18, time: 0.07 }, vibrato: { cents: 6, rate: 5.2, delay: 0.45 } });
  const cGlide = cents(yin(withGlide, sr, 0.2, 0.4), degreeFreq(0));
  const early = cents(yin(withGlide, sr, 0.0, 0.02), degreeFreq(0));

  // 2. offline renders through the full graph
  const results: { c: Case; chs: Float32Array[]; m: Measure; extra: string; ok: boolean; ms: number }[] = [];
  for (const c of list) {
    const t0 = performance.now();
    const off = new OfflineAudioContext(2, Math.ceil(c.dur * sr), sr);
    const mix = new Mixer(off);
    mix.master.gain.value = 1; // full volume: the worst case
    c.play(mix);
    const buf = await off.startRendering();
    const chs = [buf.getChannelData(0), buf.getChannelData(1)];
    const m = measure(chs, sr);
    let extra = '';
    let ok = m.peak < 0.98 && m.nans === 0 && m.dc < 2e-3;
    if (c.pitch) {
      const f = qinRange(c.pitch);
      const est = yin(chs[0], sr, 0.3, 0.3 + Math.max(0.06, 6 / f));
      const e = cents(est, f);
      extra += ` f ${est.toFixed(1)} Hz (${e >= 0 ? '+' : ''}${e.toFixed(1)} c)`;
      ok &&= Math.abs(e) < 10;
    }
    const ms = performance.now() - t0;
    extra += `  ${ms.toFixed(0)} ms`;
    const score = c.notes?.();
    if (score) console.log('[audio-lab] score', c.name, score);
    if (score && p.get('report')) console.warn('[audio-lab] score', score);
    results.push({ c, chs, m, extra, ok, ms });
  }

  // header
  const allOk = results.every((r) => r.ok) && worst < 5;
  ctx.fillStyle = allOk ? INK : RED;
  ctx.font = '600 18px system-ui';
  ctx.fillText(`半亩 audio — ${allOk ? 'all checks pass' : 'CHECK FAILURES'} · ${sr} Hz · offline renders through the full master chain at volume 1`, 16, 26);
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = INK;
  ctx.fillText(`qin string pitch error by degree (cents, YIN @0.3 s): ${pitchRows.join('  ')}`, 16, 50);
  ctx.fillText(`worst ${worst.toFixed(2)} c · with 綽 glide: first 20 ms ${early.toFixed(0)} c → settled ${cGlide.toFixed(1)} c · renderQin cost avg ${(costSum / 17).toFixed(1)} ms, max ${costMax.toFixed(1)} ms per note`, 16, 68);
  ctx.fillStyle = MUTED;
  ctx.fillText('checks: peak < 0.98 after master · no NaN · |DC| < 2e-3 · pluck pitch within 10 c · cinnabar = 10 ms RMS envelope, 0 → −80 dB', 16, 86);
  const worstPeak = Math.max(...results.map((r) => r.m.peak));
  ctx.fillText(`max peak across all renders ${worstPeak.toFixed(3)} · total render+analysis ${results.reduce((a, r) => a + r.ms, 0).toFixed(0)} ms`, 16, 104);

  const pw = (W - 16 * 2 - gap * (cols - 1)) / cols;
  results.forEach((r, i) => {
    const cx = 16 + (i % cols) * (pw + gap), cy = header - 30 + Math.floor(i / cols) * (panelH + gap);
    drawPanel(ctx, cx, cy, pw, panelH, r.c.name, r.chs, sr, r.m, r.extra, r.ok, Number(p.get('win') ?? 0));
  });
  (p.get('report') ? console.warn : console.log)('[audio-lab]', JSON.stringify({ allOk, worstCents: worst, worstPeak, results: results.map((r) => ({ name: r.c.name, peak: +r.m.peak.toFixed(4), rmsDb: +(20 * Math.log10(r.m.rms)).toFixed(1), dc: r.m.dc, nans: r.m.nans, t60: r.m.t60, extra: r.extra.trim(), ok: r.ok })) }));
}
