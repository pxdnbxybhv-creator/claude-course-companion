// How a jump feels: forgiving timing. Pure logic, no three.js — the walker (player.ts) asks every
// step whether to take off, and tests pin the timing down.
//  - coyote time: a jump pressed just after stepping off a ledge still leaves from the ground;
//  - jump buffering: a jump pressed just before landing fires the moment the feet touch.

/** Seconds after leaving the ground (without jumping) that a jump still counts as from the ground. */
export const COYOTE = 0.1;
/** Seconds a jump press is remembered while still in the air. */
export const BUFFER = 0.12;

export type TakeOff = 'ground' | 'air' | null;

export class JumpGate {
  /** Time since the feet left the ground (0 while grounded). */
  private air = 0;
  /** Time since the last press (Infinity when none is waiting). */
  private buf = Infinity;
  /** A jump already took us off the ground (no coyote jump after it). */
  private jumped = false;

  /**
   * One step of the walker. `grounded` is the state at the start of the step, `pressed` whether the
   * jump button went down since the last step, `airJumps` how many extra jumps are left in the air.
   * Returns 'ground' to jump from the ground (or its coyote grace), 'air' for an extra jump, or null.
   */
  step(dt: number, grounded: boolean, pressed: boolean, airJumps = 0): TakeOff {
    if (pressed) this.buf = 0;
    else if (this.buf !== Infinity) this.buf += dt;
    if (grounded) { this.air = 0; this.jumped = false; } else this.air += dt;
    if (this.buf > BUFFER) this.buf = Infinity;
    if (this.buf === Infinity) return null;
    if (grounded || (!this.jumped && this.air <= COYOTE)) {
      this.buf = Infinity;
      this.jumped = true;
      this.air = COYOTE + 1;
      return 'ground';
    }
    // an extra jump in the air (a skill's 轻功) answers the press at once, never a buffered one
    if (pressed && airJumps > 0) {
      this.buf = Infinity;
      return 'air';
    }
    return null;
  }

  /** Something else launched the walker (a skill's leap, an emote): no coyote jump after it. */
  launched(): void {
    this.jumped = true;
    this.air = COYOTE + 1;
  }

  /** Forget a waiting press (teleport, freeze). */
  reset(): void {
    this.buf = Infinity;
    this.air = 0;
    this.jumped = false;
  }
}

/**
 * The squash and stretch of the walker's body: a short spring kicked by a take-off (stretch, k > 0)
 * or a landing (squash, k < 0). Returns [scaleXZ, scaleY] for the time since the kick.
 */
export function squashAt(k: number, since: number, dur = 0.22): [number, number] {
  if (since >= dur || k === 0) return [1, 1];
  const u = since / dur;
  // a damped half-wobble: the full amount at once, a small overshoot, back to rest
  const w = Math.cos(u * Math.PI * 1.5) * (1 - u) * (1 - u);
  const y = 1 + k * w;
  return [1 / Math.sqrt(Math.max(0.5, y)), y];
}
