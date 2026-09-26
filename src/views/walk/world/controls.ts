// Input and the camera. Keyboard (WASD / arrows, Shift, Space, E / Enter, Q), a virtual joystick
// fed by the HUD, drag to look, wheel / pinch to zoom. Running: hold Shift, push the stick to its
// edge, or switch 疾 on (then Shift walks).
//
// Three ways of looking:
//  - third person (第三人称): the camera orbits over the walker's shoulder, eases round behind a
//    walking walker, never digs into a hillside nor hides behind a wall;
//  - first person (第一人称): through the walker's eyes (drag or, after a click on a desktop, the
//    locked mouse to look; ±80°), with a light head-bob; it blends in and out of the third-person
//    view and steps aside by itself while a game frames the view, a boat or a horse carries the
//    walker or the homestead's building holds them (the world sets `firstAllowed`);
//  - the photo camera (拍照): a free camera within reach of the walker — the stick / WASD move it
//    along the view, Space / E rise, C / Q sink, drag looks, pinch / wheel zoom.
import * as THREE from 'three';
import { damp, dampAngle } from './kit';
import { LOOK_LIMIT, PHOTO_PITCH_LIMIT, bobAmp, clampFov, clampPhotoCam, ease, headBob, yawPitchOf } from './photoMath';

export interface InputState {
  /** Joystick vector from the HUD: x right, y forward, length ≤ 1. */
  stickX: number;
  stickY: number;
  stickRun: boolean;
  jumpQueued: boolean;
  actQueued: boolean;
  /** The skill (Q / 技) was pressed since the last frame. */
  skillQueued: boolean;
}

export type ViewMode = 'third' | 'first';

/**
 * The page may not lock the mouse at all (a frame sandboxed without allow-pointer-lock, or a policy
 * against it): found at the first refusal and remembered for the session, so the view stops asking
 * (each ask logs an error) and the HUD offers dragging instead. Only a refusal before any lock ever
 * held counts, and not one just after the mouse was let go (the browser's short cool-down after Esc).
 */
let lockBlocked = false;
let lockEverHeld = false;

/** The free photo camera. */
export interface PhotoCam {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yaw: number;
  /** + looks up. */
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  /** Rise (+1) or sink (−1) from the HUD's buttons. */
  lift: number;
}

const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const WALK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
/** In photo mode: rise and sink. */
const LIFT_UP = ['Space', 'KeyE'];
const LIFT_DOWN = ['KeyC', 'KeyQ'];

/** The painted plants are upright flats: looking down on them from much above ~37° flattens them. */
const MAX_PITCH = 0.65;
/** Seconds for the view to pass between the shoulder and the eyes. */
const BLEND_SECS = 0.55;
/** Seconds for the camera to settle back from the photo camera. */
const RETURN_SECS = 0.5;
const NEAR_THIRD = 0.1;
const NEAR_CLOSE = 0.04;
const UP = new THREE.Vector3(0, 1, 0);

export class Controls {
  readonly input: InputState = { stickX: 0, stickY: 0, stickRun: false, jumpQueued: false, actQueued: false, skillQueued: false };
  private keys = new Set<string>();
  yaw = 0;
  pitch = 0.24;
  dist = 5.6;
  private lastDrag = -10;
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; type: string }>();
  private pinch = 0;
  private target = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  private pausedNow = false;
  /** Set by the world while a card or sheet is open: walking keys are ignored, and the ones held are let go. */
  get paused(): boolean {
    return this.pausedNow;
  }
  set paused(p: boolean) {
    // the walking keys held when a card opens (or closes) are let go: press again to walk on
    if (p !== this.pausedNow) for (const k of [...WALK_KEYS, ...LIFT_UP, ...LIFT_DOWN]) this.keys.delete(k);
    this.pausedNow = p;
    // a card, a dialogue or the map wants the mouse: let go of it (a click on the view takes it again)
    if (p) this.releaseLock();
  }
  /** The 疾 switch: always run (Shift then walks). */
  runToggle = false;
  /** Shift is held (for the HUD's run chip). */
  get shiftHeld(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }
  private clock = 0;

  // ── first person
  /** The walker's own choice of view. */
  view: ViewMode = 'third';
  /** Set by the world every frame: may the view be through the eyes now (not riding, held or travelling). */
  firstAllowed = true;
  /** 0 = over the shoulder … 1 = through the eyes (eased by `ease`). */
  fp = 0;
  /** The last update wanted the view through the eyes (chosen, allowed and not framing a thing). */
  private firstNow = false;
  /** Wholly through the eyes now (the walker is hidden; where one looks is where one faces). */
  get throughEyes(): boolean {
    return this.firstNow && this.fp >= 1;
  }
  /** First-person look up (+) or down (−), radians. */
  look = -0.06;
  /** Set by the world every frame: the walker's eyes, and how they move. */
  readonly eye = new THREE.Vector3();
  grounded = true;
  running = false;
  private bobPhase = 0;
  private bobA = 0;
  /** The view's yaw before a game or a watering framed the walker (restored afterwards, in first person). */
  private preFrameYaw: number | null = null;
  /** The third-person camera position (eased), kept even while looking through the eyes. */
  private third = new THREE.Vector3();
  private thirdSet = false;
  private q3 = new THREE.Quaternion();
  private qF = new THREE.Quaternion();
  private m4 = new THREE.Matrix4();
  private euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private eyeAt = new THREE.Vector3();
  /** Pointer lock (desktop, first person). */
  private lockedNow = false;
  /** The pointer is locked to the view (first person on a desktop). */
  get locked(): boolean {
    return this.lockedNow;
  }
  /** Told when the pointer lock starts or ends (for the HUD's hint); `blocked`: this page may not lock it at all. */
  onLock: ((on: boolean, blocked: boolean) => void) | null = null;
  /** This page may not lock the mouse (see lockBlocked): look by dragging. */
  get lockBlocked(): boolean {
    return lockBlocked;
  }
  private lockLostAt = -1e9;

  // ── the photo camera
  photo: PhotoCam | null = null;
  /** The walker's feet (the photo camera stays within reach). Set by the world. */
  walker: THREE.Vector3 | null = null;
  /** Water surface at (x, z) or null (the photo camera stays out of it). Set by the world. */
  waterAt: (x: number, z: number) => number | null = () => null;
  /** The field of view changed (zoom): the world re-sizes its point sprites; the HUD's slider follows. */
  onFov: ((fov: number) => void) | null = null;
  private saved: { yaw: number; pitch: number; dist: number; look: number; fov: number } | null = null;
  /** Settling back from the photo camera: the pose it left from, and how far along. */
  private ret: { pos: THREE.Vector3; quat: THREE.Quaternion; t: number } | null = null;

  constructor(private el: HTMLElement, private camera: THREE.PerspectiveCamera, heading: number, private reduced: boolean) {
    this.yaw = heading + Math.PI;
    const portrait = el.clientHeight > el.clientWidth * 1.2 || window.innerHeight > window.innerWidth * 1.2;
    if (portrait) { this.dist = 6.6; this.pitch = 0.3; }
    const on = (t: EventTarget, type: string, fn: EventListener, o?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, o);
      this.listeners.push([t, type, fn, o]);
    };
    on(window, 'keydown', ((e: KeyboardEvent) => this.onKey(e, true)) as EventListener);
    on(window, 'keyup', ((e: KeyboardEvent) => this.onKey(e, false)) as EventListener);
    on(window, 'blur', () => this.keys.clear());
    on(el, 'pointerdown', ((e: PointerEvent) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), type: e.pointerType });
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.pointers.size === 2) this.pinch = this.pinchDist();
    }) as EventListener);
    on(el, 'pointermove', ((e: PointerEvent) => {
      // the locked mouse looks round without a button held
      if (this.lockedNow) {
        if (this.photo || this.fp < 0.5) return;
        this.turn(e.movementX * 0.0022, e.movementY * 0.0022);
        return;
      }
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size >= 2) {
        const d = this.pinchDist();
        if (this.pinch > 0 && d > 0) this.zoom(this.pinch / d);
        this.pinch = d;
        return;
      }
      const touch = e.pointerType === 'touch';
      if (this.photo) {
        // slower when zoomed in, so a long lens can still be aimed
        const k = (touch ? 0.0075 : 0.005) * Math.max(0.3, this.photo.fov / 55);
        this.photo.yaw -= dx * k;
        this.photo.pitch = THREE.MathUtils.clamp(this.photo.pitch - dy * k, -PHOTO_PITCH_LIMIT, PHOTO_PITCH_LIMIT);
        return;
      }
      if (this.view === 'first' && this.fp > 0.5) {
        const k = touch ? 0.0068 : 0.0048;
        this.turn(dx * k, dy * k);
        return;
      }
      const k = touch ? 0.009 : 0.006;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k * 0.7, 0.04, MAX_PITCH);
      this.lastDrag = this.clock;
    }) as EventListener);
    const up = ((e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.pinch = this.pointers.size >= 2 ? this.pinchDist() : 0;
      // first person on a desktop: a plain click on the view locks the mouse to it
      if (p && e.type === 'pointerup' && p.type === 'mouse' && !this.photo && this.firstNow && !this.pausedNow && this.fp > 0.5 && !this.lockedNow
        && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 5 && performance.now() - p.t < 400 && !lockBlocked) this.requestLock();
    }) as EventListener;
    on(el, 'pointerup', up);
    on(el, 'pointercancel', up);
    on(el, 'wheel', ((e: WheelEvent) => {
      e.preventDefault();
      if (this.photo) { this.zoom(Math.exp(e.deltaY * 0.0012)); return; }
      if (this.view === 'first' && this.fp > 0.5) return;
      this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0012), 2.4, 11);
    }) as EventListener, { passive: false });
    on(el, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') on(document, 'pointerlockchange', (() => {
      const now = document.pointerLockElement === el;
      if (now === this.lockedNow) return;
      this.lockedNow = now;
      if (now) lockEverHeld = true;
      else this.lockLostAt = performance.now();
      this.onLock?.(now, lockBlocked);
    }) as EventListener);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') on(document, 'pointerlockerror', () => this.lockRefused());
  }

  /** A request to lock the mouse was refused (see lockBlocked). */
  private lockRefused(): void {
    if (lockBlocked || lockEverHeld || performance.now() - this.lockLostAt < 2500) return;
    lockBlocked = true;
    this.onLock?.(false, true);
  }

  /** Look round by a turn of (dx, dy) radians (first person). */
  private turn(dx: number, dy: number): void {
    this.yaw -= dx;
    this.look = THREE.MathUtils.clamp(this.look - dy, -LOOK_LIMIT, LOOK_LIMIT);
    this.preFrameYaw = null;
  }

  /** Zoom by a factor on the distance (third person) or the field of view (photo). */
  private zoom(f: number): void {
    if (this.photo) { this.setPhotoFov(this.photo.fov * f); return; }
    if (this.view === 'first' && this.fp > 0.5) return;
    this.dist = THREE.MathUtils.clamp(this.dist * f, 2.4, 11);
  }

  private requestLock(): void {
    try {
      const r = (this.el as HTMLElement & { requestPointerLock(): Promise<void> | void }).requestPointerLock();
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => this.lockRefused());
    } catch { this.lockRefused(); }
  }

  /** Let go of the mouse (leaving first person, taking photographs). */
  releaseLock(): void {
    if (!this.lockedNow) return;
    try { document.exitPointerLock(); } catch { /* gone */ }
  }

  private pinchDist(): number {
    const ps = [...this.pointers.values()];
    if (ps.length < 2) return 0;
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const code = e.code;
    // a key let go always counts, wherever the focus is now (a card or the map may have taken it
    // since the key went down): a held W must never keep walking on its own
    if (!down) { this.keys.delete(code); return; }
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest?.('.sheet, [aria-modal="true"]'))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (MOVEMENT.has(code)) {
      this.keys.add(code);
      if (code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    // the photo camera: Space / E rise, C / Q sink — and nothing in the world is acted on
    if (this.photo) {
      if (LIFT_UP.includes(code) || LIFT_DOWN.includes(code)) {
        // a chip reached with the keyboard keeps Space for itself; one merely clicked lets it rise
        const onControl = !!(t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT' || t.closest?.('[role="button"], [role="slider"]')));
        if (onControl && code === 'Space') {
          let kb = true;
          try { kb = t!.matches(':focus-visible'); } catch { /* old engines: keyboard focus */ }
          if (kb) return;
        }
        e.preventDefault();
        if (!this.paused) this.keys.add(code);
      }
      return;
    }
    if (e.repeat) return;
    // A focused button or link keeps Enter for itself, and Space too when it was reached with the
    // keyboard (Tab): keyboard users can activate it. A button merely clicked with the mouse still
    // lets Space jump (it does not match :focus-visible). E never activates a button, so it acts.
    const onControl = !!(t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SELECT' || t.closest?.('[role="button"]')));
    if (onControl && (code === 'Enter' || code === 'NumpadEnter')) return;
    if (onControl && code === 'Space') {
      let kb = true;
      try { kb = t!.matches(':focus-visible'); } catch { /* old engines: treat as keyboard focus */ }
      if (kb) return;
    }
    if (code === 'Space') {
      e.preventDefault();
      this.input.jumpQueued = true;
    } else if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') {
      e.preventDefault();
      this.input.actQueued = true;
    } else if (code === 'KeyQ') {
      e.preventDefault();
      this.input.skillQueued = true;
    }
  }

  /** The raw, camera-relative intent of the last move(): x strafe, y forward (−1..1). */
  readonly intent = { x: 0, y: 0, run: false };

  private readonly moveOut = { x: 0, z: 0, run: false };

  /** The raw stick + keys (x strafe, y forward, run), whatever the mode. */
  private readonly raw = { x: 0, y: 0, run: false };
  private readInput(): { x: number; y: number; run: boolean } {
    let ix = this.input.stickX, iy = this.input.stickY;
    let run = this.input.stickRun;
    if (!this.paused) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      const shift = k.has('ShiftLeft') || k.has('ShiftRight');
      if (shift !== this.runToggle) run = true;
    } else {
      ix = 0; iy = 0;
    }
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    const r = this.raw;
    r.x = ix; r.y = iy; r.run = run;
    return r;
  }

  /** The move vector in world space, and whether to run (one object, reused every frame). */
  move(): { readonly x: number; readonly z: number; readonly run: boolean } {
    const o = this.moveOut;
    // taking photographs: the walker stands for the picture (the stick moves the camera)
    if (this.photo) {
      this.intent.x = 0; this.intent.y = 0; this.intent.run = false;
      o.x = 0; o.z = 0; o.run = false;
      return o;
    }
    const { x: ix, y: iy, run } = this.readInput();
    this.intent.x = ix; this.intent.y = iy; this.intent.run = run;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    o.x = fx * iy + rx * ix; o.z = fz * iy + rz * ix; o.run = run;
    return o;
  }

  get moving(): boolean {
    return Math.hypot(this.input.stickX, this.input.stickY) > 0.1 || WALK_KEYS.some((k) => this.keys.has(k));
  }

  /** The way of looking now: the photo camera, through the eyes, or over the shoulder. */
  get mode(): 'third' | 'first' | 'photo' {
    return this.photo ? 'photo' : this.fp > 0.5 ? 'first' : 'third';
  }

  /** Choose over the shoulder or through the eyes (it blends over half a second). */
  setView(v: ViewMode): void {
    if (v === this.view) return;
    this.view = v;
    this.preFrameYaw = null;
    if (v === 'first') this.look = -0.06;
    else this.releaseLock();
  }

  /** Follow the player: smooth target, gentle auto-turn behind them while walking, no ground clipping. */
  private frameUntil = -1;
  private frameAt = new THREE.Vector3();
  private frameYaw = 0;

  /** For a moment, look at the player and a thing together from a three-quarter angle. */
  frame(px: number, pz: number, ox: number, oz: number, y: number, secs = 3.2): void {
    this.frameAt.set((px + ox) / 2, y, (pz + oz) / 2);
    const away = Math.atan2(px - ox, pz - oz); // from the thing toward the player
    // pick the side closer to the current view so the swing is short
    const a = away + 0.75, b = away - 0.75;
    const d = (u: number) => Math.abs(Math.atan2(Math.sin(u - this.yaw), Math.cos(u - this.yaw)));
    // through the eyes, the view steps aside for the framing and comes back to where it looked
    if (this.view === 'first' && this.fp > 0.5 && this.preFrameYaw === null) this.preFrameYaw = this.yaw;
    this.frameYaw = d(a) < d(b) ? a : b;
    this.frameUntil = this.clock + secs;
  }

  /** Optional: fraction (0..1] of the way from the target to the camera that is not blocked by a wall. */
  occlusion: ((tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => number) | null = null;

  update(dt: number, player: THREE.Vector3, heading: number, speed: number, floorY: (x: number, z: number) => number, snap = false): void {
    this.clock += dt;
    if (this.photo) { this.firstNow = false; this.updatePhoto(dt, floorY); return; }
    const tgt = this.tmp.set(player.x, player.y + 0.95, player.z);
    const framing = this.clock < this.frameUntil && speed < 0.5;
    if (framing) {
      tgt.lerp(this.frameAt, 0.6);
      this.yaw = dampAngle(this.yaw, this.frameYaw, 2.2, dt);
    } else if (this.clock < this.frameUntil) this.frameUntil = -1;
    if (snap) this.target.copy(tgt);
    else {
      this.target.x = damp(this.target.x, tgt.x, 9, dt);
      this.target.z = damp(this.target.z, tgt.z, 9, dt);
      this.target.y = damp(this.target.y, tgt.y, this.reduced ? 4 : 6, dt);
    }
    const wantFirst = this.view === 'first' && this.firstAllowed && !framing;
    this.firstNow = wantFirst;
    // the view steps out of the eyes (a game, a boat, a horse, travel, a framing): the mouse is let go,
    // or it would be caught, hidden, by a view that no longer turns with it
    if (!wantFirst) this.releaseLock();
    // back through the eyes after a framing: turn back to where one was looking
    if (!framing && this.preFrameYaw !== null) {
      if (this.view !== 'first') this.preFrameYaw = null;
      else {
        this.yaw = snap || this.reduced ? this.preFrameYaw : dampAngle(this.yaw, this.preFrameYaw, 5, dt);
        if (Math.abs(Math.atan2(Math.sin(this.yaw - this.preFrameYaw), Math.cos(this.yaw - this.preFrameYaw))) < 0.01) this.preFrameYaw = null;
      }
    }
    // ease the camera round behind a walking player unless the user is steering it (over the
    // shoulder only: through the eyes, where one looks is where one goes)
    const stick = Math.hypot(this.input.stickX, this.input.stickY);
    const keysForward = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.input.stickY > 0.3;
    if (!wantFirst && this.fp < 0.5 && speed > 0.4 && this.clock - this.lastDrag > 1.6 && (keysForward || stick > 0.3)) {
      const want = heading + Math.PI;
      this.yaw = dampAngle(this.yaw, want, 0.9 * Math.min(1, speed / 2), dt);
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    let d = framing ? Math.min(this.dist, 4.8) : this.dist;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 6; i++) {
      x = this.target.x + Math.sin(this.yaw) * cp * d;
      z = this.target.z + Math.cos(this.yaw) * cp * d;
      y = this.target.y + sp * d;
      const floor = floorY(x, z) + 0.45;
      if (y >= floor) break;
      d *= 0.85; // pull in rather than dig into a hillside
    }
    y = Math.max(y, floorY(x, z) + 0.45);
    let rate = 14;
    if (this.occlusion) {
      const T = this.target;
      let f = this.occlusion(T.x, T.y, T.z, x, y, z);
      // pulled in right up to the player's head? rather rise and look over the rock / the prop
      if (f < 1 && f * d < 1.8) {
        for (const lift of [1.2, 2.2, 3.4]) {
          const ly = y + lift;
          const lf = this.occlusion(T.x, T.y, T.z, x, ly, z);
          if (lf * Math.hypot(x - T.x, ly - T.y, z - T.z) > Math.max(1.8, f * d + 0.5)) { y = ly; f = lf; break; }
        }
      }
      if (f < 1) {
        x = T.x + (x - T.x) * f;
        y = T.y + (y - T.y) * f;
        z = T.z + (z - T.z) * f;
        rate = 40;
        // backed right up against something tall: never sit inside the scholar's head — rise
        // above it and look down over the shoulder (the occluder is further off than this)
        const h = Math.hypot(x - T.x, z - T.z);
        const MIN = 1.25;
        if (Math.hypot(h, y - T.y) < MIN) y = Math.max(y, T.y + Math.min(Math.sqrt(Math.max(0, MIN * MIN - h * h)), 1.6 * h + 0.2));
      }
    }
    const th = this.third;
    if (snap || !this.thirdSet) { th.set(x, y, z); this.thirdSet = true; }
    else {
      th.x = damp(th.x, x, rate, dt);
      th.y = damp(th.y, y, rate, dt);
      th.z = damp(th.z, z, rate, dt);
    }

    // over the shoulder … through the eyes
    const goal = wantFirst ? 1 : 0;
    if (snap || this.reduced) this.fp = goal;
    else if (this.fp !== goal) this.fp = goal > this.fp ? Math.min(goal, this.fp + dt / BLEND_SECS) : Math.max(goal, this.fp - dt / BLEND_SECS);
    const e = ease(this.fp);
    const cam = this.camera.position;
    if (e <= 1e-4) {
      cam.copy(th);
      this.camera.lookAt(this.target);
    } else {
      // the head-bob: one dip a footfall, a sway from foot to foot (none under reduced motion)
      const amp = this.reduced || !this.grounded ? 0 : bobAmp(speed, this.running);
      this.bobA = damp(this.bobA, amp, 8, dt);
      if (this.bobA > 1e-4) this.bobPhase += dt * Math.PI * Math.max(1.2, speed / 0.78);
      const bob = headBob(this.bobPhase, this.bobA);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      const eye = this.eyeAt.set(this.eye.x + rx * bob.x, this.eye.y + bob.y, this.eye.z + rz * bob.x);
      this.m4.lookAt(th, this.target, UP);
      this.q3.setFromRotationMatrix(this.m4);
      this.qF.setFromEuler(this.euler.set(this.look, this.yaw, 0, 'YXZ'));
      if (e >= 1) { cam.copy(eye); this.camera.quaternion.copy(this.qF); }
      else {
        cam.lerpVectors(th, eye, e);
        this.camera.quaternion.slerpQuaternions(this.q3, this.qF, e);
      }
    }
    // coming back from the photo camera: from where it was to where the follow camera is now
    if (this.ret) {
      const r = this.ret;
      r.t += dt / RETURN_SECS;
      if (r.t >= 1 || snap || this.reduced) this.ret = null;
      else {
        const k = ease(r.t);
        cam.lerpVectors(r.pos, this.tmp.copy(cam), k);
        this.camera.quaternion.slerpQuaternions(r.quat, this.qF.copy(this.camera.quaternion), k);
      }
    }
    this.setNear(e > 0.5 ? NEAR_CLOSE : NEAR_THIRD);
  }

  private setNear(n: number): void {
    if (this.camera.near === n) return;
    this.camera.near = n;
    this.camera.updateProjectionMatrix();
  }

  // ───────────────────────────── the photo camera

  /** Take up the free camera where the view is now. */
  enterPhoto(): void {
    if (this.photo) return;
    this.releaseLock();
    const cam = this.camera;
    this.saved = { yaw: this.yaw, pitch: this.pitch, dist: this.dist, look: this.look, fov: cam.fov };
    const dir = cam.getWorldDirection(this.tmp);
    const yp = yawPitchOf(dir.x, dir.y, dir.z);
    const pos = cam.position.clone();
    let pitch = yp.pitch;
    // from behind the eyes, step back out of the walker's head and look down a touch: the whole
    // walker stands in the picture, the view beyond it as it was
    // (never back through a wall: only as far as the room behind allows; with one's back right
    // against it, the camera rises just above the head instead and keeps the view as it was)
    if (this.fp > 0.5) {
      const back = this.tmp2.set(dir.x, 0, dir.z).normalize();
      const STEP = 3.2, RISE = 0.6;
      const f = this.occlusion ? this.occlusion(pos.x, pos.y, pos.z, pos.x - back.x * STEP, pos.y + RISE, pos.z - back.z * STEP) : 1;
      const room = STEP * THREE.MathUtils.clamp(f, 0, 1);
      if (room >= 1.5) {
        pos.addScaledVector(back, -room);
        pos.y += RISE * (room / STEP);
        pitch = Math.min(pitch, 0.1) - 0.15;
      } else {
        pos.addScaledVector(back, -room);
        pos.y += 0.55;
      }
    }
    this.photo = { pos, vel: new THREE.Vector3(), yaw: yp.yaw, pitch, fov: clampFov(cam.fov), lift: 0 };
    this.ret = null;
    for (const k of [...LIFT_UP, ...LIFT_DOWN]) this.keys.delete(k);
    this.setNear(NEAR_CLOSE);
  }

  /** Put the free camera down: the view settles back exactly where it was. */
  exitPhoto(): void {
    const ph = this.photo;
    if (!ph) return;
    const cam = this.camera;
    this.photo = null;
    for (const k of [...LIFT_UP, ...LIFT_DOWN]) this.keys.delete(k);
    if (this.saved) {
      this.yaw = this.saved.yaw; this.pitch = this.saved.pitch; this.dist = this.saved.dist; this.look = this.saved.look;
      cam.fov = this.saved.fov;
      cam.updateProjectionMatrix();
      this.onFov?.(cam.fov);
    }
    this.saved = null;
    this.ret = this.reduced ? null : { pos: cam.position.clone(), quat: cam.quaternion.clone(), t: 0 };
  }

  /** Zoom the photo camera (degrees of vertical field of view, clamped 20–75). */
  setPhotoFov(f: number): void {
    const ph = this.photo;
    if (!ph) return;
    const v = clampFov(f);
    if (Math.abs(v - ph.fov) < 1e-3) return;
    ph.fov = v;
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
    this.onFov?.(v);
  }

  private updatePhoto(dt: number, floorY: (x: number, z: number) => number): void {
    const ph = this.photo!;
    const { x: ix, y: iy, run } = this.readInput();
    let lift = ph.lift;
    if (!this.paused) {
      if (LIFT_UP.some((k) => this.keys.has(k))) lift += 1;
      if (LIFT_DOWN.some((k) => this.keys.has(k))) lift -= 1;
    }
    lift = THREE.MathUtils.clamp(lift, -1, 1);
    // slower through a long lens (fine framing), faster with Shift / the stick at its edge
    const speed = (run ? 8.5 : 3.4) * THREE.MathUtils.clamp(ph.fov / 50, 0.35, 1.2);
    const fx = -Math.sin(ph.yaw), fz = -Math.cos(ph.yaw);
    const rx = Math.cos(ph.yaw), rz = -Math.sin(ph.yaw);
    const k = this.reduced ? 14 : 6;
    ph.vel.x = damp(ph.vel.x, (fx * iy + rx * ix) * speed, k, dt);
    ph.vel.z = damp(ph.vel.z, (fz * iy + rz * ix) * speed, k, dt);
    ph.vel.y = damp(ph.vel.y, lift * speed * 0.7, k, dt);
    ph.pos.addScaledVector(ph.vel, dt);
    if (this.walker) clampPhotoCam(ph.pos, this.walker, floorY, this.waterAt);
    this.camera.position.copy(ph.pos);
    this.camera.quaternion.setFromEuler(this.euler.set(ph.pitch, ph.yaw, 0, 'YXZ'));
    if (this.camera.fov !== ph.fov) { this.camera.fov = ph.fov; this.camera.updateProjectionMatrix(); }
    this.setNear(NEAR_CLOSE);
  }

  dispose(): void {
    this.releaseLock();
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
    this.listeners = [];
    this.keys.clear();
    this.onLock = null;
    this.onFov = null;
  }
}
