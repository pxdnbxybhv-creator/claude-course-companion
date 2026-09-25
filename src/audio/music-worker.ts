// Off-main-thread synthesis for the background music (see music-dsp.ts). A separate worker from
// the sound effects' so a long phrase render never delays a tap's pluck.
import { runMusicJob, type MusicJobRequest, type MusicJobResult } from './music-dsp';

const scope = self as unknown as { onmessage: ((e: MessageEvent<MusicJobRequest>) => void) | null; postMessage(m: MusicJobResult, t?: Transferable[]): void };
scope.onmessage = (e) => {
  const { id, sr, job } = e.data;
  try {
    const chans = runMusicJob(sr, job);
    scope.postMessage({ id, chans }, chans.map((c) => c.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
