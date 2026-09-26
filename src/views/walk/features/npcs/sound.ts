// Sounds of the street the shared engine has no voice for: the peddler's rattle-drum (拨浪鼓), the
// storyteller's gavel (醒木), bamboo fortune sticks shaken in their tube (签筒), a coin's clink.
// Web Audio only, a private context made on the first sound (always after a gesture), honouring the
// app's sound switch and volume; every call is a safe no-op when audio is unavailable.
import { state } from '../../../../app/store';

let ac: AudioContext | null = null;
let out: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let broken = false;

function live(): { c: AudioContext; o: GainNode } | null {
  const s = state.value.settings;
  if (!s.sound || broken || typeof window === 'undefined') return null;
  if (!ac) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) { broken = true; return null; }
    try {
      ac = new C();
      out = ac.createGain();
      out.connect(ac.destination);
    } catch {
      broken = true;
      return null;
    }
  }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  const v = Math.max(0, Math.min(1, s.volume ?? 0.7));
  out!.gain.value = v * v;
  return { c: ac, o: out! };
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const n = Math.floor(c.sampleRate);
  noiseBuf = c.createBuffer(1, n, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let seed = 7777;
  for (let i = 0; i < n; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1; }
  return noiseBuf;
}

function click(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, freq: number, q = 4) {
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o);
  src.start(t, (t * 0.37) % 0.8, dur + 0.03);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
}

function tone(c: AudioContext, o: AudioNode, t: number, dur: number, gain: number, f0: number, f1 = f0) {
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  osc.onended = () => { osc.disconnect(); g.disconnect(); };
}

/** 拨浪鼓: the two beads hitting both skins in a quick roll. `level` 0..1 (distance). */
export function rattle(level = 0.6): void {
  const a = live();
  if (!a || level < 0.03) return;
  const { c, o } = a;
  const t0 = c.currentTime + 0.01;
  for (let i = 0; i < 8; i++) {
    const t = t0 + i * 0.075 + (i % 2) * 0.012;
    tone(c, o, t, 0.08, 0.12 * level, i % 2 ? 330 : 290, 180);
    click(c, o, t, 0.03, 0.18 * level, 2400, 2);
  }
}

/** 醒木: a sharp crack of hardwood on the table. */
export function gavel(level = 0.8): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t = c.currentTime + 0.01;
  click(c, o, t, 0.09, 0.6 * level, 1500, 1.2);
  tone(c, o, t, 0.12, 0.25 * level, 420, 160);
}

/** 签筒: bamboo sticks shaken, one falling out at the end. */
export function sticks(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t0 = c.currentTime + 0.01;
  for (let i = 0; i < 14; i++) click(c, o, t0 + i * 0.06 + ((i * 37) % 7) * 0.004, 0.035, 0.16, 1800 + (i % 3) * 500, 3);
  click(c, o, t0 + 1.05, 0.07, 0.35, 1300, 2);
}

/** Coins in the hand. */
export function coins(): void {
  const a = live();
  if (!a) return;
  const { c, o } = a;
  const t0 = c.currentTime + 0.01;
  for (let i = 0; i < 3; i++) { tone(c, o, t0 + i * 0.07, 0.25, 0.08, 2600 + i * 180); tone(c, o, t0 + i * 0.07, 0.2, 0.05, 3900 + i * 120); }
}
