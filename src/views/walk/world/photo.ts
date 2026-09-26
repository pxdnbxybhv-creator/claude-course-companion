// 拍照 · the photo mode, on the world's side: the free camera is taken up (controls.ts), the walker
// stands for the picture (still breathing) and may strike a pose and hold it at its fullest (定格),
// the world's clock may be stopped, the hour of the picture chosen (此刻 · 昼 · 暮 · 夜), and a frame
// captured at a raised resolution through the colour grade (the world does the rendering: see
// `capture` in index.ts). Leaving puts everything back as it was: the view, the time, the hour,
// the walker.
import type { EmoteKind } from '../types';
import type { Controls } from './controls';
import type { PlayerController } from './player';
import type { SkySystem } from './sky';
import { posePeak, type PhotoPose } from './photoMath';

export type PhotoTime = 'now' | 'day' | 'dusk' | 'night';
export type { PhotoPose };

/** A frame as captured: the raw graded pixels, before any filter or mount. */
export interface Shot {
  canvas: HTMLCanvasElement;
  /** When and where it was taken (for the inscription). */
  at: Date;
  place: { zh: string; en: string };
}

/** What the HUD drives. */
export interface PhotoApi {
  /** Take up the camera; false when it cannot be now (travelling, held by a game). */
  enter(): boolean;
  exit(): void;
  readonly active: boolean;
  /** Show or hide the walker in the picture. */
  setWalker(on: boolean): void;
  /** Strike a pose and hold it at its fullest; null lets the walker stand at ease again. */
  pose(kind: PhotoPose | null): void;
  /** The hour of the picture. */
  setTime(t: PhotoTime): void;
  /** Stop the world's clock (water, leaves, people, particles) or let it run. */
  pauseTime(on: boolean): void;
  /** Zoom (vertical field of view, degrees). */
  fov(): number;
  setFov(deg: number): void;
  /** Rise (+1), sink (−1) or hold (0): the HUD's buttons. */
  lift(v: number): void;
  /** Told when the zoom changes (pinch, wheel). */
  onFov(fn: ((deg: number) => void) | null): void;
  /** Capture the view now (null if it could not be read back). */
  capture(): Shot | null;
  /** Whether the hours other than 此刻 can be shown (the sky allows it). */
  readonly canSetTime: boolean;
}

export interface PhotoHooks {
  controls: Controls;
  player: PlayerController;
  sky: SkySystem;
  reduced: boolean;
  /** May the camera be taken up now? */
  allowed(): boolean;
  /** Render one frame at a raised resolution and copy it out (index.ts). */
  grab(): HTMLCanvasElement | null;
  /** Where the walker is (for the inscription). */
  place(): { zh: string; en: string };
  /** The world's pixel-size uniforms follow the zoom. */
  fovChanged(): void;
  /** The camera was taken up (the world shows the places it can now fly into). */
  entered?(): void;
}

export class PhotoRig implements PhotoApi {
  private on = false;
  private walkerOn = true;
  private posing: PhotoPose | null = null;
  private poseT = 0;
  private held = false;
  private paused = false;
  /** The world's clock factor, eased (1 runs, 0 stopped). */
  private k = 1;
  private fovFn: ((deg: number) => void) | null = null;
  private skyWas: { forced: boolean } | null = null;
  private hour: PhotoTime = 'now';

  constructor(private h: PhotoHooks) {
    h.controls.onFov = (f) => {
      h.fovChanged();
      this.fovFn?.(f);
    };
  }

  get active(): boolean {
    return this.on;
  }

  /** The walker shows in the picture (while taking photographs). */
  get walkerShown(): boolean {
    return this.walkerOn;
  }

  get canSetTime(): boolean {
    return true;
  }

  enter(): boolean {
    if (this.on) return true;
    if (!this.h.allowed()) return false;
    this.on = true;
    this.walkerOn = true;
    this.posing = null;
    this.held = false;
    this.paused = false;
    this.hour = 'now';
    this.skyWas = null;
    this.h.controls.enterPhoto();
    this.h.entered?.();
    return true;
  }

  exit(): void {
    if (!this.on) return;
    this.on = false;
    this.setTime('now');
    this.skyWas = null;
    this.paused = false;
    // a held pose is let go: the walker finishes the gesture and stands at ease
    this.posing = null;
    this.held = false;
    this.walkerOn = true;
    this.h.controls.exitPhoto();
  }

  setWalker(on: boolean): void {
    this.walkerOn = on;
  }

  pose(kind: PhotoPose | null): void {
    if (!this.on) return;
    this.held = false;
    this.posing = kind;
    this.poseT = 0;
    if (kind) this.h.player.emote(kind as EmoteKind);
  }

  pauseTime(on: boolean): void {
    this.paused = on;
  }

  fov(): number {
    return this.h.controls.photo?.fov ?? 50;
  }

  setFov(deg: number): void {
    this.h.controls.setPhotoFov(deg);
  }

  lift(v: number): void {
    const ph = this.h.controls.photo;
    if (ph) ph.lift = Math.max(-1, Math.min(1, v));
  }

  onFov(fn: ((deg: number) => void) | null): void {
    this.fovFn = fn;
  }

  setTime(t: PhotoTime): void {
    if (t === this.hour) return;
    const sky = this.h.sky;
    // whether the real hour was night (put back on 此刻 and on leaving)
    if (!this.skyWas && t !== 'now') this.skyWas = { forced: sky.isForcedNight() };
    this.hour = t;
    const was = this.skyWas;
    if (t === 'now') { sky.setTimeOfDay(null); if (was) sky.forceNight(was.forced); }
    else if (t === 'night') { sky.setTimeOfDay(null); sky.forceNight(true); }
    else { sky.forceNight(false); sky.setTimeOfDay(t); }
  }

  /** The world's clock factor this frame (eases to a stop in about a third of a second). */
  timeK(rawDt: number): number {
    const want = this.on && this.paused ? 0 : 1;
    if (this.h.reduced) this.k = want;
    else {
      this.k += (want - this.k) * Math.min(1, rawDt * 7);
      if (Math.abs(this.k - want) < 0.004) this.k = want;
    }
    return this.k;
  }

  /**
   * The walker's own clock this frame: real time while photographing (it breathes even when the
   * world is stopped), none once a pose has reached its fullest (定格), the world's otherwise.
   */
  walkerDt(rawDt: number, dt: number): number {
    if (!this.on) return dt;
    if (!this.posing) return rawDt;
    if (this.held) {
      // someone else ended the emote (a feature): stand at ease
      if (this.h.player.emoting !== this.posing) { this.posing = null; this.held = false; return rawDt; }
      return 0;
    }
    const peak = posePeak(this.posing);
    if (this.poseT + rawDt >= peak) {
      const step = Math.max(0, peak - this.poseT);
      this.poseT = peak;
      this.held = true;
      return step;
    }
    this.poseT += rawDt;
    return rawDt;
  }

  capture(): Shot | null {
    if (!this.on) return null;
    const canvas = this.h.grab();
    if (!canvas) return null;
    return { canvas, at: new Date(), place: this.h.place() };
  }
}
