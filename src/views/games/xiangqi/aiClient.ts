// Asks the 象棋 AI for a move without ever blocking the UI: a Web Worker when possible, otherwise
// the same search on the main thread, one iterative-deepening step at a time between frames.
import AiWorker from './ai.worker?worker&inline';
import type { AiRequest, AiResponse } from './ai.worker';
import { Thinker, type ThinkOptions, type ThinkResult } from './ai';

export interface Pending {
  promise: Promise<ThinkResult>;
  cancel(): void;
}

const SLICE_MS = 30;

export class AiClient {
  private worker: Worker | null = null;
  private seq = 0;
  private waiting = new Map<number, { resolve: (r: ThinkResult) => void; reject: (e: unknown) => void }>();
  private broken = false;

  private ensure(): Worker | null {
    if (this.worker || this.broken) return this.worker;
    try {
      const w = new AiWorker({ name: 'banmu-xiangqi' });
      w.onmessage = (e: MessageEvent<AiResponse>) => {
        const p = this.waiting.get(e.data.id);
        if (!p) return;
        this.waiting.delete(e.data.id);
        if (e.data.result) p.resolve(e.data.result);
        else p.reject(new Error(e.data.error ?? 'ai failed'));
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        this.fail();
      };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
    return this.worker;
  }

  /** The worker died (e.g. blocked by a sandbox): reject everyone so callers retry on the main thread. */
  private fail() {
    this.broken = true;
    try { this.worker?.terminate(); } catch { /* ignore */ }
    this.worker = null;
    const all = [...this.waiting.values()];
    this.waiting.clear();
    all.forEach((p) => p.reject(new Error('worker failed')));
  }

  think(moves: readonly number[], opts: ThinkOptions): Pending {
    const w = this.ensure();
    if (!w) return this.local(moves, opts);
    const id = ++this.seq;
    let cancelled = false;
    let fallback: Pending | null = null;
    const promise = new Promise<ThinkResult>((resolve, reject) => {
      this.waiting.set(id, { resolve, reject });
      const req: AiRequest = { id, type: 'think', moves: [...moves], opts };
      w.postMessage(req);
    }).catch((e) => {
      if (cancelled) throw e;
      fallback = this.local(moves, opts);
      return fallback.promise;
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
        fallback?.cancel();
        const p = this.waiting.get(id);
        if (!p) return;
        this.waiting.delete(id);
        p.reject(new Error('cancelled'));
        // a search can't be interrupted; replace the worker so the next request isn't queued behind it
        try { this.worker?.terminate(); } catch { /* ignore */ }
        this.worker = null;
      },
    };
  }

  private local(moves: readonly number[], opts: ThinkOptions): Pending {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<ThinkResult>((resolve, reject) => {
      let t: Thinker;
      const tick = () => {
        if (cancelled) return reject(new Error('cancelled'));
        try {
          t ??= new Thinker(moves, opts);
          const r = t.step(SLICE_MS);
          if (r) resolve(r);
          else timer = setTimeout(tick, 16);
        } catch (e) {
          reject(e);
        }
      };
      timer = setTimeout(tick, 0);
    });
    return { promise, cancel: () => { cancelled = true; clearTimeout(timer); } };
  }

  dispose() {
    const all = [...this.waiting.values()];
    this.waiting.clear();
    all.forEach((p) => p.reject(new Error('cancelled')));
    try { this.worker?.terminate(); } catch { /* ignore */ }
    this.worker = null;
  }
}
