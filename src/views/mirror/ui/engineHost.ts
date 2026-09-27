// 水月幻镜 · where the UI gets its engine. The real one (engine/index.ts, engine/content/index.ts) is
// found by a glob, so the UI builds and runs before the engine lanes land. In a dev build without it
// (or with ?mirrorStub in the address) a stub plays a timed wave so every screen can be walked; a
// production build without it refuses to start a wave.
import type { ContentRegistry, CreateEngine } from '../types';

const ENGINE = import.meta.glob<{ createEngine: CreateEngine }>('../engine/index.ts');
const CONTENT = import.meta.glob<{ CONTENT: ContentRegistry }>('../engine/content/index.ts');

export const EMPTY_CONTENT: ContentRegistry = {
  skills: {}, passives: {}, hazards: {}, elites: {}, treasures: {}, bosses: {}, patterns: {}, affixes: {}, mutators: {}, terms: {},
};

export interface EngineModule { createEngine: CreateEngine; content: ContentRegistry; stub: boolean }

function wantStub(): boolean {
  if (!import.meta.env.DEV || typeof location === 'undefined') return false;
  try { return new URLSearchParams(location.search).has('mirrorStub'); } catch { return false; }
}

let loading: Promise<EngineModule> | null = null;
/** Load the engine once (the promise is shared); a failed real engine rejects, so the run can be voided. */
export function loadEngine(): Promise<EngineModule> {
  return (loading ??= (async () => {
    const load = Object.values(ENGINE)[0];
    if (load && !wantStub()) {
      const m = await load();
      const c = Object.values(CONTENT)[0];
      let content = EMPTY_CONTENT;
      if (c) {
        try { content = (await c()).CONTENT ?? EMPTY_CONTENT; } catch (e) { console.warn('[mirror] content failed to load; the core plays without it', e); }
      }
      return { createEngine: m.createEngine, content, stub: false };
    }
    // never in a production build: a timed stand-in that hands back plausible results would pay real
    // coins for nothing (GDD §16.6), so a build without the engine refuses (a fresh run is voided)
    if (!import.meta.env.DEV) throw new Error('mirror: this build has no engine');
    const s = await import('./stub');
    return { createEngine: s.createStubEngine, content: EMPTY_CONTENT, stub: true };
  })().catch((e) => { loading = null; throw e; }));
}
