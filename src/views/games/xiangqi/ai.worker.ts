// The 象棋 AI off the main thread. Imported as `./ai.worker?worker&inline` so it also works in the
// single-file build (a blob: worker). The transposition table stays warm between moves.
import { Thinker, clearMemory, type ThinkOptions, type ThinkResult } from './ai';

export type AiRequest =
  | { id: number; type: 'think'; moves: number[]; fen?: string; opts: ThinkOptions }
  | { id: number; type: 'reset' };
export type AiResponse = { id: number; result?: ThinkResult; error?: string };

const scope = self as unknown as { onmessage: ((e: MessageEvent<AiRequest>) => void) | null; postMessage(m: AiResponse): void };
scope.onmessage = (e) => {
  const req = e.data;
  if (req.type === 'reset') {
    clearMemory();
    return;
  }
  try {
    const t = new Thinker(req.moves, req.opts, req.fen);
    let r: ThinkResult | null = null;
    while (!(r = t.step())) { /* resume */ }
    scope.postMessage({ id: req.id, result: r });
  } catch (err) {
    scope.postMessage({ id: req.id, error: String(err) });
  }
};
