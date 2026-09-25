// /lab.html?scene=music[&theme=lake,village][&dur=40][&sr=32000][&day=2026-09-25][&visit=0]
// /lab.html?scene=music&solo=1      — each instrument alone (timbre, articulation, spectrum)
// /lab.html?scene=music&live=1      — realtime engine smoke / leak test (shared context, crossfade, duck, pause)
//
// Renders each background-music theme through the real music bus (reverb, echo, compressor, soft
// clip) in an OfflineAudioContext at full volume, then measures and draws it: waveform with its RMS
// envelope (cinnabar, 0 → −60 dB), a log-frequency spectrogram, and the score — every note as a
// piano-roll bar coloured by instrument, percussion as ticks, phrases labelled 起承转合 with mode.
// Checks: peak < 0.9 · |DC| < 2e-3 · no NaN · loudness in the theme's window · ≤ 24 voices.
import { Conductor, MAX_VOICES, MusicBus } from '../../audio/music-player';
import { THEMES, type Inst, type ThemeId } from '../../audio/music-themes';
import { STEP_NAMES, dayKey, daySeed, degreeToMidi, midiToFreq } from '../../audio/music-theory';
import type { LineNote, MusicJob, PluckNote } from '../../audio/music-dsp';
import { music, musicGain, musicStats } from '../../audio/music';

const PAPER = '#f1e9d8', INK = '#1d1a16', RED = '#b93a2b', MUTED = 'rgba(29,26,22,.55)';

const COLORS: Record<Inst, string> = {
  qin: '#1d1a16', harm: '#7d7466', zheng: '#b93a2b', pipa: '#c9772e', xiao: '#2f6f73', dizi: '#4c9a6a',
  erhu: '#7a3b69', suona: '#b58a12', sheng: '#9aa56b', drum: '#5a3a22', wood: '#8b5a2b', gong: '#b8860b',
  ling: '#3a6ea5', temple: '#444', bo: '#a0a0a0',
};
const ZH: Record<Inst, string> = {
  qin: '琴', harm: '泛音', zheng: '筝', pipa: '琵琶', xiao: '箫', dizi: '笛', erhu: '二胡', suona: '唢呐', sheng: '笙',
  drum: '鼓', wood: '木鱼/梆', gong: '锣', ling: '碰铃', temple: '钟', bo: '钹',
};
const PERC = new Set<Inst>(['drum', 'wood', 'gong', 'ling', 'temple', 'bo']);
const ROLE_ZH = { qi: '起', cheng: '承', zhuan: '转', he: '合' } as const;

/** Loudness window per theme (dBFS RMS at volume 1). */
const WINDOW: Partial<Record<ThemeId, [number, number]>> = { quiet: [-40, -26], night: [-34, -22] };
const windowOf = (t: ThemeId): [number, number] => WINDOW[t] ?? [-24, -18];

interface Result {
  name: string; theme: ThemeId; chs: Float32Array[]; sr: number; dur: number;
  cond: Conductor[]; split?: number; ms: number; peakVoices: number; dropped: number;
  /** An instrument demo: no loudness window. */
  solo?: boolean;
}

/** One instrument alone through the bus: a pentatonic phrase with slides, grace notes, a long note. */
async function renderSolo(name: string, jobs: MusicJob[], dur: number, sr: number): Promise<Result> {
  const off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const bus = new MusicBus(off, { worker: null });
  bus.volume.gain.value = 1;
  const t0 = performance.now();
  let t = 0.2;
  for (const job of jobs) {
    bus.render(job, (chans) => {
      const b = bus.buffer(chans);
      bus.play(b, t, { gain: 0.8, pan: 0, send: 0.25, echo: 0, dry: bus.input, wet: bus.verbIn, echoDest: bus.echoIn });
      t += b.duration + 0.1;
    });
  }
  const ms = performance.now() - t0;
  const buf = await off.startRendering();
  return { name, theme: 'garden', chs: [buf.getChannelData(0), buf.getChannelData(1)], sr, dur, cond: [], ms, peakVoices: bus.peakVoices, dropped: 0, solo: true };
}

function soloCases(): { name: string; jobs: MusicJob[] }[] {
  const mode = { tonic: 62, final: 0 };
  const f = (d: number, o = 0) => midiToFreq(degreeToMidi(mode, d) + 12 * o);
  const tune = [0, 1, 2, 4, 3, 2, 1, 0];
  const lineNotes = (o: number): LineNote[] => tune.map((d, i) => ({
    t: i * 0.45, dur: i === tune.length - 1 ? 1.6 : 0.45, freq: f(d, o), vel: 0.75,
    slide: i === 4 || i === 6, grace: i === 3 ? f(d + 1, o) : undefined,
  }));
  const pl = (o: number, extra: Partial<PluckNote> = {}): PluckNote[] => tune.map((d, i) => ({ t: i * 0.4, freq: f(d, o), vel: 0.7, pan: 0, ...(i === 7 ? extra : {}) }));
  return [
    { name: '箫 xiao', jobs: [{ op: 'line', inst: 'xiao', notes: lineNotes(0), seed: 1 }] },
    { name: '笛 dizi', jobs: [{ op: 'line', inst: 'dizi', notes: lineNotes(1), seed: 2 }] },
    { name: '二胡 erhu', jobs: [{ op: 'line', inst: 'erhu', notes: lineNotes(0), seed: 3 }] },
    { name: '唢呐 suona (gentle)', jobs: [{ op: 'line', inst: 'suona', notes: lineNotes(0), seed: 4 }] },
    { name: '古筝 zheng + 按音 bend on the last note', jobs: [{ op: 'pluck', inst: 'zheng', notes: pl(0, { bend: [{ at: 0.2, cents: 200, time: 0.14 }, { at: 0.55, cents: 0, time: 0.16 }], vib: true }), seed: 5 }] },
    { name: '琵琶 pipa + 轮指 tremolo', jobs: [{ op: 'pluck', inst: 'pipa', notes: pl(0, { trem: 1.6 }), seed: 6 }] },
    { name: '笙 sheng chord (air 1)', jobs: [{ op: 'sheng', freqs: [f(0, -1), f(3, -1), f(0)], dur: 5, vel: 0.7, seed: 7, air: 1 }] },
    { name: '鼓 锣 钹 碰铃 木鱼', jobs: [{ op: 'drum', kind: 'tang', seed: 1 }, { op: 'drum', kind: 'big', seed: 1 }, { op: 'gong', kind: 'xiao', seed: 1 }, { op: 'bo', seed: 1 }, { op: 'ling', freq: 2400, seed: 1 }, { op: 'wood', seed: 1 }, { op: 'gong', kind: 'da', seed: 1 }] },
  ];
}

async function renderTheme(theme: ThemeId, dur: number, sr: number, day: string, visit: number, next?: ThemeId, at = 14): Promise<Result> {
  const off = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const bus = new MusicBus(off, { worker: null });
  bus.volume.gain.value = musicGain(1);
  const t0 = performance.now();
  const a = new Conductor(bus, theme, 0.2, daySeed(theme, day), visit, { record: true });
  a.tick(next ? at + 6 : dur);
  const cond = [a];
  let split: number | undefined;
  if (next) {
    // the engine's handover, mid-render: let the phrase reach its cadence, then crossfade
    void off.suspend(at).then(() => {
      const end = Math.min(at + 5, Math.max(at + 0.3, a.phraseEnd(at)));
      a.finish(end, 3);
      split = end;
      const b = new Conductor(bus, next, end + 0.35, daySeed(next, day), visit, { fadeIn: 0.7, record: true });
      b.tick(dur);
      cond.push(b);
      void off.resume();
    });
  }
  const ms0 = performance.now() - t0;
  const buf = await off.startRendering();
  await new Promise((r) => setTimeout(r, 30));
  return {
    name: next ? `${theme} → ${next} (handover at ${at}s)` : theme, theme, chs: [buf.getChannelData(0), buf.getChannelData(1)], sr, dur, cond, split,
    ms: ms0, peakVoices: bus.peakVoices, dropped: bus.dropped,
  };
}

// ---------------------------------------------------------------------------
// analysis

function measure(chs: Float32Array[], sr: number, skip = 1) {
  let peak = 0, sum = 0, nans = 0, dc = 0, n = 0;
  const s0 = Math.round(skip * sr);
  for (const c of chs) {
    let m = 0;
    for (let i = 0; i < c.length; i++) {
      const v = c[i];
      if (!Number.isFinite(v)) { nans++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      m += v;
      if (i >= s0) { sum += v * v; n++; }
    }
    dc = Math.max(dc, Math.abs(m / c.length));
  }
  // short-term (3 s) loudness max
  const W = 3 * sr;
  let stMax = 0;
  for (let s = s0; s + W <= chs[0].length; s += sr) {
    let e = 0;
    for (const c of chs) for (let i = s; i < s + W; i++) e += c[i] * c[i];
    stMax = Math.max(stMax, Math.sqrt(e / (W * chs.length)));
  }
  const hop = Math.round(sr * 0.05);
  const env = new Float32Array(Math.floor(chs[0].length / hop));
  for (let k = 0; k < env.length; k++) {
    let e = 0;
    for (const c of chs) for (let i = k * hop; i < (k + 1) * hop; i++) e += c[i] * c[i];
    env[k] = Math.sqrt(e / (hop * chs.length));
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), dc, nans, stMax, env, hop };
}
const db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

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
        const a = i + k, b = a + len / 2;
        const vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// drawing

function drawPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, r: Result, dpr: number): { ok: boolean; line: Record<string, unknown> } {
  const { chs, sr, dur } = r;
  const m = measure(chs, sr);
  const [lo, hi] = windowOf(r.theme);
  const loud = db(m.rms);
  const released = r.cond.slice(0, -1).every((c) => c.done);
  const ok = m.peak < 0.9 && m.nans === 0 && m.dc < 2e-3 && (r.solo || (loud >= lo && loud <= hi)) && r.peakVoices <= MAX_VOICES && released;
  const evs = r.cond.flatMap((c) => c.events.filter((e) => e.at < c.cutoff));
  const pitched = evs.flatMap((e) => (e.ev.notes ?? []).map((n) => ({ t: e.at + n.t, dur: n.dur, midi: n.midi, inst: e.ev.inst })));
  const perInst = new Map<Inst, number>();
  for (const e of evs) perInst.set(e.ev.inst, (perInst.get(e.ev.inst) ?? 0) + (e.ev.notes?.length ?? 1));
  const midis = pitched.filter((n) => n.inst !== 'sheng').map((n) => n.midi);
  const mlo = midis.length ? Math.min(...midis) : 60, mhi = midis.length ? Math.max(...midis) : 72;
  const melodic = pitched.filter((n) => n.inst !== 'sheng').length;
  const phrases = r.cond.flatMap((c) => c.phrases.filter((ph) => ph.start < c.cutoff));
  const first = phrases[0]?.phrase;

  ctx.fillStyle = ok ? INK : RED;
  ctx.font = '600 14px system-ui';
  const modeName = first ? `${STEP_NAMES[first.mode.final]}调 tonic ${first.mode.tonic} · ${first.bpm} bpm` : 'solo';
  ctx.fillText(`${ok ? '✓' : '✗'} ${r.name}  ·  ${modeName}`, x, y + 13);
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillStyle = MUTED;
  const stats = `peak ${m.peak.toFixed(3)} (${db(m.peak).toFixed(1)} dB) · RMS ${loud.toFixed(1)} dBFS [${lo}…${hi}] · 3s max ${db(m.stMax).toFixed(1)} · dc ${m.dc.toExponential(0)} · nan ${m.nans} · voices ≤${r.peakVoices} dropped ${r.dropped} · ${(melodic / (dur / 60)).toFixed(0)} notes/min · range ${mlo.toFixed(0)}–${mhi.toFixed(0)} · DSP ${r.ms.toFixed(0)} ms for ${dur}s (${((r.ms / 1000 / dur) * 100).toFixed(1)}% CPU)${r.cond.length > 1 ? ` · released ${released ? '✓' : '✗'}` : ''}`;
  ctx.fillText(stats, x, y + 28, w);
  ctx.fillText([...perInst].map(([k, v]) => `${ZH[k]} ${v}`).join('  '), x, y + 42, w);

  const n = chs[0].length;
  const X = (t: number) => x + (t / dur) * w;
  // waveform + RMS envelope
  const wy = y + 50, wh = 44;
  ctx.fillStyle = 'rgba(29,26,22,.04)';
  ctx.fillRect(x, wy, w, wh);
  ctx.strokeStyle = INK; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let px = 0; px < w; px++) {
    const a = Math.floor((px / w) * n), b = Math.floor(((px + 1) / w) * n);
    let mn = 0, mx = 0;
    for (let i = a; i < b; i++) { const v = (chs[0][i] + chs[1][i]) / 2; if (v < mn) mn = v; if (v > mx) mx = v; }
    ctx.moveTo(x + px + 0.5, wy + wh / 2 - mx * (wh / 2));
    ctx.lineTo(x + px + 0.5, wy + wh / 2 - mn * (wh / 2) + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = RED; ctx.beginPath();
  m.env.forEach((v, k) => {
    const px = X((k * m.hop) / sr), py = wy + (Math.min(60, -db(v)) / 60) * wh;
    k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.stroke();
  // loudness window guide
  ctx.strokeStyle = 'rgba(185,58,43,.25)'; ctx.setLineDash([3, 3]);
  for (const d of [lo, hi]) { const py = wy + (-d / 60) * wh; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
  ctx.setLineDash([]);

  // spectrogram
  const sy = wy + wh + 4, sh = 80;
  const N = 2048, fLo = 50, fHi = Math.min(16000, sr / 2);
  const iw = Math.floor(w * dpr), ih = Math.floor(sh * dpr);
  const img = ctx.createImageData(iw, ih);
  const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  const cols: Float32Array[] = [];
  let gmax = -Infinity;
  const colsN = Math.min(iw, 700);
  for (let c = 0; c < colsN; c++) {
    const s = Math.floor((c / colsN) * Math.max(0, n - N));
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = ((chs[0][s + i] + chs[1][s + i]) / 2) * hann[i];
    fft(re, im);
    const col = new Float32Array(ih);
    for (let py = 0; py < ih; py++) {
      const f0 = fLo * Math.pow(fHi / fLo, 1 - (py + 1) / ih), f1 = fLo * Math.pow(fHi / fLo, 1 - py / ih);
      const b0 = Math.max(1, Math.floor((f0 * N) / sr)), b1 = Math.max(b0, Math.min(N / 2 - 1, Math.floor((f1 * N) / sr)));
      let mx = 0;
      for (let b = b0; b <= b1; b++) mx = Math.max(mx, re[b] * re[b] + im[b] * im[b]);
      col[py] = 10 * Math.log10(mx + 1e-20);
      if (col[py] > gmax) gmax = col[py];
    }
    cols.push(col);
  }
  const P = [241, 233, 216], I = [29, 26, 22];
  for (let px = 0; px < iw; px++) {
    const col = cols[Math.min(colsN - 1, Math.floor((px / iw) * colsN))];
    for (let py = 0; py < ih; py++) {
      const u = Math.pow(Math.max(0, Math.min(1, (col[py] - gmax + 75) / 75)), 1.6);
      const o = (py * iw + px) * 4;
      for (let k = 0; k < 3; k++) img.data[o + k] = P[k] + (I[k] - P[k]) * u;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, Math.round(x * dpr), Math.round(sy * dpr));
  ctx.fillStyle = MUTED; ctx.font = '9px ui-monospace, monospace';
  for (const f of [100, 1000, 10000]) {
    if (f > fHi) continue;
    ctx.fillText(f >= 1000 ? `${f / 1000}k` : String(f), x + 2, sy + (1 - Math.log(f / fLo) / Math.log(fHi / fLo)) * sh + 3);
  }

  // score: piano roll + percussion lane + phrases
  const ty = sy + sh + 6, th = 120, lane = 14;
  ctx.fillStyle = 'rgba(29,26,22,.03)';
  ctx.fillRect(x, ty, w, th + lane);
  const top = Math.max(mhi + 2, 60), bot = Math.min(mlo - 2, top - 24);
  const Y = (mi: number) => ty + ((top - mi) / (top - bot)) * th;
  for (let mi = Math.ceil(bot / 12) * 12; mi <= top; mi += 12) {
    ctx.strokeStyle = 'rgba(29,26,22,.12)'; ctx.beginPath(); ctx.moveTo(x, Y(mi)); ctx.lineTo(x + w, Y(mi)); ctx.stroke();
    ctx.fillStyle = MUTED; ctx.fillText(`C${mi / 12 - 1}`, x + 2, Y(mi) - 2);
  }
  for (const nt of pitched) {
    if (nt.t > dur) continue;
    ctx.fillStyle = COLORS[nt.inst];
    ctx.globalAlpha = nt.inst === 'sheng' ? 0.25 : 0.85;
    const yy = Math.max(ty, Math.min(ty + th - 2, Y(nt.midi) - 1.5));
    ctx.fillRect(X(nt.t), yy, Math.max(1.5, (nt.dur / dur) * w - 1), nt.inst === 'sheng' ? 2 : 3);
  }
  ctx.globalAlpha = 1;
  for (const e of evs) {
    if (!PERC.has(e.ev.inst) || e.at > dur) continue;
    ctx.fillStyle = COLORS[e.ev.inst];
    const h = Math.max(3, Math.min(lane - 2, e.ev.gain * 30));
    ctx.fillRect(X(e.at), ty + th + lane - h, 2, h);
  }
  ctx.font = '11px system-ui';
  for (const ph of phrases) {
    if (ph.start > dur) continue;
    ctx.strokeStyle = 'rgba(185,58,43,.35)';
    ctx.beginPath(); ctx.moveTo(X(ph.start), ty); ctx.lineTo(X(ph.start), ty + th + lane); ctx.stroke();
    ctx.fillStyle = RED;
    ctx.fillText(`${ROLE_ZH[ph.phrase.role]}${ph.phrase.role === 'qi' ? ` ${STEP_NAMES[ph.phrase.mode.final]}` : ''}`, X(ph.start) + 2, ty + 11);
  }
  if (r.split) {
    ctx.strokeStyle = RED; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(r.split), wy); ctx.lineTo(X(r.split), ty + th + lane); ctx.stroke();
    ctx.lineWidth = 1;
  }
  // legend
  let lx = x;
  ctx.font = '10px system-ui';
  for (const k of perInst.keys()) {
    ctx.fillStyle = COLORS[k]; ctx.fillRect(lx, ty + th + lane + 5, 8, 8);
    ctx.fillStyle = INK; ctx.fillText(ZH[k], lx + 11, ty + th + lane + 13);
    lx += 16 + ctx.measureText(ZH[k]).width + 8;
  }
  return {
    ok,
    line: {
      name: r.name, ok, peak: +m.peak.toFixed(3), rmsDb: +loud.toFixed(1), stMaxDb: +db(m.stMax).toFixed(1), dc: +m.dc.toExponential(1), nans: m.nans,
      voices: r.peakVoices, dropped: r.dropped, notesPerMin: Math.round(melodic / (dur / 60)), range: [Math.round(mlo), Math.round(mhi)],
      dspMs: Math.round(r.ms), released, insts: Object.fromEntries([...perInst].map(([k, v]) => [k, v])),
    },
  };
}
export const PANEL_H = 50 + 44 + 4 + 80 + 6 + 120 + 14 + 22;

// ---------------------------------------------------------------------------

async function liveTest(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const dpr = window.devicePixelRatio || 1;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = INK; ctx.font = '13px ui-monospace, monospace';
  const lines: string[] = [];
  const log = (s: string) => { lines.push(s); console.warn('[music-live]', s); ctx.fillText(s, 20, 24 + lines.length * 18, innerWidth - 40); };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const st = () => JSON.stringify(musicStats());
  music.setEnabled(true);
  music.setVolume(0.6);
  music.setTheme('garden');
  log(`before gesture: ${st()}`);
  window.dispatchEvent(new PointerEvent('pointerdown'));
  await wait(3500);
  const a = musicStats();
  log(`garden playing: ${st()}`);
  music.setTheme('lake');
  await wait(11000);
  const b = musicStats();
  log(`after crossfade to lake: ${st()}`);
  music.duck(0.3, 600);
  await wait(800);
  // page hidden → fade out and stop; visible → start again
  const vis = (v: 'hidden' | 'visible') => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v });
    document.dispatchEvent(new Event('visibilitychange'));
  };
  vis('hidden');
  await wait(3000);
  const c = musicStats();
  log(`hidden: ${st()}`);
  vis('visible');
  await wait(2500);
  const d = musicStats();
  log(`visible again: ${st()}`);
  music.setEnabled(false);
  await wait(4500);
  const e = musicStats();
  log(`disabled: ${st()}`);
  music.setEnabled(true);
  music.setTheme('festival');
  await wait(4000);
  const f = musicStats();
  log(`festival: ${st()}`);
  music.setTheme(null);
  await wait(9000);
  const g = musicStats();
  log(`theme null after 9 s: ${st()}`);
  const pass = a.playing === 'garden' && a.voices > 0 && a.shared && b.playing === 'lake' && b.fading === 0 &&
    c.playing === null && c.voices === 0 && d.playing === 'lake' && e.playing === null && e.voices === 0 &&
    f.playing === 'festival' && f.voices > 0 && g.voices === 0 && g.fading === 0 && g.backlog === 0;
  log(pass ? 'PASS — shared context, crossfade released, pause/resume, disable, silence: no leaked voices' : 'FAIL');
}

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  if (p.get('live')) return liveTest(canvas);
  const sr = Number(p.get('sr') ?? 32000);
  const dur = Number(p.get('dur') ?? 40);
  const day = p.get('day') ?? dayKey();
  const visit = Number(p.get('visit') ?? 0);
  const all = Object.keys(THEMES) as ThemeId[];
  const list = (p.get('theme') ?? all.join(',')).split(',').filter((t): t is ThemeId => all.includes(t as ThemeId));
  const withHandover = (!p.get('theme') || p.get('handover')) && !p.get('solo');
  const W = window.innerWidth;
  const n = p.get('solo') ? soloCases().length : list.length + (withHandover ? 1 : 0);
  const header = 64, gap = 18;
  const H = header + n * (PANEL_H + gap);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);

  const results: Result[] = [];
  if (p.get('solo')) {
    for (const c of soloCases()) results.push(await renderSolo(c.name, c.jobs, c.name.startsWith('鼓') ? 14 : 6, Number(p.get('sr') ?? 48000)));
  } else for (const t of list) results.push(await renderTheme(t, dur, sr, day, visit));
  if (withHandover) results.push(await renderTheme('garden', 34, sr, day, visit, 'lake', 14));
  const lines: Record<string, unknown>[] = [];
  let allOk = true;
  results.forEach((r, i) => {
    const { ok, line } = drawPanel(ctx, 16, header + i * (PANEL_H + gap), W - 32, r, dpr);
    allOk &&= ok;
    lines.push(line);
  });
  ctx.fillStyle = allOk ? INK : RED;
  ctx.font = '600 18px system-ui';
  ctx.fillText(`半亩 music — ${allOk ? 'all checks pass' : 'CHECK FAILURES'} · ${p.get('solo') ? 'instruments solo' : `${sr} Hz · ${dur}s per theme · day ${day}`} · offline, full volume, through the music bus`, 16, 26);
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = MUTED;
  ctx.fillText('checks: peak < 0.9 · |DC| < 2e-3 · no NaN · RMS in window (−24…−18 dBFS; night −34…−22; quiet −40…−26) · ≤ 24 voices · crossfaded conductor released', 16, 46);
  (p.get('report') ? console.warn : console.log)('[music-lab]', JSON.stringify({ allOk, results: lines }));
}
