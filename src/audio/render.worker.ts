// Off-main-thread synthesis for the realtime engine (see jobs.ts).
import { runJob, type JobRequest, type JobResult } from './jobs';

const scope = self as unknown as { onmessage: ((e: MessageEvent<JobRequest>) => void) | null; postMessage(m: JobResult, t?: Transferable[]): void };
scope.onmessage = (e) => {
  const { id, sr, job } = e.data;
  try {
    const chans = runJob(sr, job);
    scope.postMessage({ id, chans }, chans.map((c) => c.buffer as ArrayBuffer));
  } catch (err) {
    scope.postMessage({ id, error: String(err) });
  }
};
