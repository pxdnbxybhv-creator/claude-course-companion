// The sfx limiter (GDD §22): at most 4 combat sounds start in any 50 ms window, and each kind has
// its own cap. Only the spammy combat kinds (hits, kills, crits, pickups, summons) share the global
// window; the cues a player must hear (铜钱 叮, level-up 磬, the heartbeat, the gong countdown, the
// boss drum, 镜碎, the 2 Hz beat…) check only their own cap, so a storm of hits can never starve them.
// Pure (the clock is passed in): the tests drive it with a fake clock.

export const WINDOW = 0.05;
export const MAX_PER_WINDOW = 4;

export class Limiter {
  /** Start times of recent spammy sounds (ring buffer) and of each kind. */
  private recent = new Float64Array(MAX_PER_WINDOW).fill(-1);
  private ri = 0;
  private kinds = new Map<string, Float64Array>();

  /** May a sound of `kind` start at `now` (seconds)? Records it when it may. */
  allow(kind: string, cap: number, spam: boolean, now: number): boolean {
    if (spam && now - this.recent[this.ri] < WINDOW) return false;
    let k = this.kinds.get(kind);
    if (!k) { k = new Float64Array(Math.max(1, cap)).fill(-1); this.kinds.set(kind, k); }
    let slot = -1, n = 0;
    for (let i = 0; i < k.length; i++) { if (now - k[i] < WINDOW) n++; else if (slot < 0) slot = i; }
    if (n >= cap || slot < 0) return false;
    if (spam && n > 0) {
      // fairness: a kind's second sound in a window only takes one of the last free slots when
      // fewer than half are used, so a storm of hits leaves room for the kill's pop
      let used = 0;
      for (let i = 0; i < MAX_PER_WINDOW; i++) if (now - this.recent[i] < WINDOW) used++;
      if (used >= MAX_PER_WINDOW / 2) return false;
    }
    k[slot] = now;
    if (spam) { this.recent[this.ri] = now; this.ri = (this.ri + 1) % MAX_PER_WINDOW; }
    return true;
  }
}
