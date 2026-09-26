// The skill events teammates raise on window (plain CustomEvents, detail { x, z, r? }):
//   'banmu:music' — someone plays music here: listeners gather round and sway
//   'banmu:bow'   — someone commanding passes: people bow
//   'banmu:bloom' — flowers burst open here: people smile and sniff the air
export type SkillEventKind = 'music' | 'bow' | 'bloom';
export interface SkillEvent { kind: SkillEventKind; x: number; z: number; r?: number }

const KINDS: SkillEventKind[] = ['music', 'bow', 'bloom'];

/** Listen to all three; returns an unsubscribe. */
export function onSkillEvent(fn: (e: SkillEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const offs = KINDS.map((kind) => {
    const h = (ev: Event) => {
      const d = (ev as CustomEvent).detail as { x?: unknown; z?: unknown; r?: unknown } | undefined;
      if (!d || typeof d.x !== 'number' || typeof d.z !== 'number' || !Number.isFinite(d.x) || !Number.isFinite(d.z)) return;
      fn({ kind, x: d.x, z: d.z, r: typeof d.r === 'number' && Number.isFinite(d.r) ? d.r : undefined });
    };
    window.addEventListener(`banmu:${kind}`, h);
    return () => window.removeEventListener(`banmu:${kind}`, h);
  });
  return () => offs.forEach((o) => o());
}
