// Render jobs: a serialisable description of a sound to synthesise. The realtime engine runs them
// in a Web Worker (render.worker.ts) so the main thread never stalls on DSP; the offline lab and
// the no-worker fallback run them synchronously with the same code.
import { renderBell, renderHarmonic, renderIR, renderKnock, renderNoise, renderQin, type NoiseColour, type QinNote } from './dsp';

export type Job =
  | { op: 'qin'; note: QinNote }
  | { op: 'harm'; freq: number; vel: number; decay: number; seed: number }
  | { op: 'bell' }
  | { op: 'knock'; seed: number }
  | { op: 'noise'; colour: NoiseColour; secs: number; seed: number }
  | { op: 'ir' };

export function runJob(sr: number, j: Job): Float32Array[] {
  switch (j.op) {
    case 'qin': return [renderQin(sr, j.note)];
    case 'harm': return [renderHarmonic(sr, j.freq, j.vel, j.decay, j.seed)];
    case 'bell': return renderBell(sr);
    case 'knock': return [renderKnock(sr, j.seed)];
    case 'noise': return [renderNoise(j.colour, sr, j.secs, j.seed), renderNoise(j.colour, sr, j.secs, j.seed + 1)];
    case 'ir': return renderIR(sr);
  }
}

export interface JobRequest { id: number; sr: number; job: Job }
export interface JobResult { id: number; chans?: Float32Array[]; error?: string }
