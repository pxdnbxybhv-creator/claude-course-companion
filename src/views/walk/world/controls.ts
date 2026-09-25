// Input and the third-person camera. Keyboard (WASD / arrows, Shift, Space, E / Enter), a virtual
// joystick fed by the HUD, drag to orbit, wheel / pinch to zoom.
import * as THREE from 'three';
import { damp, dampAngle } from './kit';

export interface InputState {
  /** Joystick vector from the HUD: x right, y forward, length ≤ 1. */
  stickX: number;
  stickY: number;
  stickRun: boolean;
  jumpQueued: boolean;
  actQueued: boolean;
}

/** The painted plants are upright flats: looking down on them from much above ~37° flattens them. */
const MAX_PITCH = 0.65;

export class Controls {
  readonly input: InputState = { stickX: 0, stickY: 0, stickRun: false, jumpQueued: false, actQueued: false };
  private keys = new Set<string>();
  yaw = 0;
  pitch = 0.24;
  dist = 5.6;
  private lastDrag = -10;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch = 0;
  private target = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = [];
  /** Set by the world while a card or sheet is open: movement keys are ignored. */
  paused = false;
  private clock = 0;

  constructor(el: HTMLElement, private camera: THREE.PerspectiveCamera, heading: number, private reduced: boolean) {
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
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (this.pointers.size === 2) this.pinch = this.pinchDist();
    }) as EventListener);
    on(el, 'pointermove', ((e: PointerEvent) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size >= 2) {
        const d = this.pinchDist();
        if (this.pinch > 0 && d > 0) this.dist = THREE.MathUtils.clamp(this.dist * (this.pinch / d), 2.4, 11);
        this.pinch = d;
        return;
      }
      const k = e.pointerType === 'touch' ? 0.009 : 0.006;
      this.yaw -= dx * k;
      this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k * 0.7, 0.04, MAX_PITCH);
      this.lastDrag = this.clock;
    }) as EventListener);
    const up = ((e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = this.pointers.size >= 2 ? this.pinchDist() : 0;
    }) as EventListener;
    on(el, 'pointerup', up);
    on(el, 'pointercancel', up);
    on(el, 'wheel', ((e: WheelEvent) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.0012), 2.4, 11);
    }) as EventListener, { passive: false });
    on(el, 'contextmenu', ((e: Event) => e.preventDefault()) as EventListener);
  }

  private pinchDist(): number {
    const ps = [...this.pointers.values()];
    if (ps.length < 2) return 0;
    return Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.closest?.('.sheet'))) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    const movement = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    if (movement.includes(code)) {
      if (down) this.keys.add(code); else this.keys.delete(code);
      if (code.startsWith('Arrow')) e.preventDefault();
      return;
    }
    if (!down || e.repeat) return;
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
    }
  }

  /** The raw, camera-relative intent of the last move(): x strafe, y forward (−1..1). */
  readonly intent = { x: 0, y: 0, run: false };

  /** The move vector in world space, and whether to run. */
  move(): { x: number; z: number; run: boolean } {
    let ix = this.input.stickX, iy = this.input.stickY;
    let run = this.input.stickRun;
    if (!this.paused) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) iy += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) iy -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) ix += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) ix -= 1;
      if (k.has('ShiftLeft') || k.has('ShiftRight')) run = true;
    } else {
      ix = 0; iy = 0;
    }
    const m = Math.hypot(ix, iy);
    if (m > 1) { ix /= m; iy /= m; }
    this.intent.x = ix; this.intent.y = iy; this.intent.run = run;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    return { x: fx * iy + rx * ix, z: fz * iy + rz * ix, run };
  }

  get moving(): boolean {
    return Math.hypot(this.input.stickX, this.input.stickY) > 0.1 || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => this.keys.has(k));
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
    this.frameYaw = d(a) < d(b) ? a : b;
    this.frameUntil = this.clock + secs;
  }

  /** Optional: fraction (0..1] of the way from the target to the camera that is not blocked by a wall. */
  occlusion: ((tx: number, ty: number, tz: number, cx: number, cy: number, cz: number) => number) | null = null;

  update(dt: number, player: THREE.Vector3, heading: number, speed: number, floorY: (x: number, z: number) => number, snap = false): void {
    this.clock += dt;
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
    // ease the camera round behind a walking player unless the user is steering it
    const stick = Math.hypot(this.input.stickX, this.input.stickY);
    const keysForward = this.keys.has('KeyW') || this.keys.has('ArrowUp') || this.input.stickY > 0.3;
    if (speed > 0.4 && this.clock - this.lastDrag > 1.6 && (keysForward || stick > 0.3)) {
      const want = heading + Math.PI;
      this.yaw = dampAngle(this.yaw, want, 0.9 * Math.min(1, speed / 2), dt);
    }

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cam = this.camera.position;
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
    if (snap) cam.set(x, y, z);
    else {
      cam.x = damp(cam.x, x, rate, dt);
      cam.y = damp(cam.y, y, rate, dt);
      cam.z = damp(cam.z, z, rate, dt);
    }
    this.camera.lookAt(this.target);
  }

  dispose(): void {
    for (const [t, type, fn, o] of this.listeners) t.removeEventListener(type, fn, o);
    this.listeners = [];
    this.keys.clear();
  }
}
