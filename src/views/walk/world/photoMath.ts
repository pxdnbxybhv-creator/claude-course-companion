// The arithmetic of the camera modes, kept free of three.js and the DOM so it can be tested:
// where the free photo camera may go, how far it may zoom, how large a photograph is taken, the
// first-person head-bob, and when a pose held for the camera is at its fullest.

export interface V3 { x: number; y: number; z: number }

/** How far the photo camera may wander from the walker (m). */
export const PHOTO_RADIUS = 60;
/** Clearance above the ground or the water (m). */
export const PHOTO_CLEAR = 0.3;
/** How high above the walker's feet it may rise (m). */
export const PHOTO_CEILING = 40;
/** The zoom range (vertical field of view, degrees). */
export const FOV_MIN = 20;
export const FOV_MAX = 75;
/** First person: how far up or down one may look (±80°). */
export const LOOK_LIMIT = (80 * Math.PI) / 180;
/** The photo camera tilts a little further (±85°). */
export const PHOTO_PITCH_LIMIT = (85 * Math.PI) / 180;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clampFov = (f: number) => (Number.isFinite(f) ? clamp(f, FOV_MIN, FOV_MAX) : 50);

/**
 * Keep the free camera within reach of the walker (a sphere round the walker's middle), under a
 * ceiling, above the ground and never inside the water. Mutates `p` and returns it.
 */
export function clampPhotoCam(
  p: V3,
  walker: V3,
  groundY: (x: number, z: number) => number,
  waterY: (x: number, z: number) => number | null,
  radius = PHOTO_RADIUS,
): V3 {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) { p.x = walker.x; p.y = walker.y + 1.6; p.z = walker.z + 3; }
  const cx = walker.x, cy = walker.y + 1, cz = walker.z;
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  const d = Math.hypot(dx, dy, dz);
  if (d > radius) {
    const k = radius / d;
    p.x = cx + dx * k; p.y = cy + dy * k; p.z = cz + dz * k;
  }
  if (p.y > walker.y + PHOTO_CEILING) p.y = walker.y + PHOTO_CEILING;
  const g = groundY(p.x, p.z);
  const w = waterY(p.x, p.z);
  const floor = Math.max(Number.isFinite(g) ? g : walker.y, w ?? -Infinity) + PHOTO_CLEAR;
  if (p.y < floor) p.y = floor;
  return p;
}

/**
 * A fence for the free camera inside a pocket valley (桃源): within `r` of the centre (x, z) and no
 * higher than `yMax`, so it never looks over the ring of hills into the void beyond. Mutates `p`.
 */
export function fenceDisc(p: V3, c: { x: number; z: number }, r: number, yMax: number): V3 {
  const dx = p.x - c.x, dz = p.z - c.z;
  const d = Math.hypot(dx, dz);
  if (d > r) { p.x = c.x + (dx / d) * r; p.z = c.z + (dz / d) * r; }
  if (p.y > yMax) p.y = yMax;
  return p;
}

/**
 * The pixel ratio to render a photograph at: its long side near `longSide` pixels, within the GPU's
 * largest surface (`maxDim`), and never below the ratio the screen already uses (so a photo is never
 * softer or smaller than the view). The pixel budget bounds only what a photograph adds beyond the
 * live frame: the screen's own ratio is already drawn every frame, so it is kept (within `maxDim`).
 */
export function captureRatio(cssW: number, cssH: number, pr: number, longSide: number, maxDim: number, maxPixels: number): number {
  const w = Math.max(1, cssW), h = Math.max(1, cssH);
  const long = Math.max(w, h);
  const gpu = maxDim / long;
  const want = Math.min(longSide / long, gpu, Math.sqrt(maxPixels / (w * h)));
  const r = Math.max(want, Math.min(pr, gpu));
  return Math.max(0.5, Math.floor(r * 100) / 100);
}

/** The photograph's long side (px) for each picture quality. */
export const PHOTO_LONG_SIDE = { low: 1600, medium: 2048, high: 2560, ultra: 3072 } as const;

/**
 * A walker's head-bob in first person: one dip per footfall (phase advances by π a step) and a
 * sway from foot to foot. Returns metres (x across the view, y up).
 */
export function headBob(phase: number, amp: number): { x: number; y: number } {
  return { x: Math.sin(phase) * amp * 0.45, y: Math.sin(phase * 2) * amp };
}

/** How much the head bobs at a pace (m/s): nothing standing, more when running. */
export function bobAmp(speed: number, running: boolean): number {
  if (speed < 0.25) return 0;
  const walk = Math.min(1, speed / 1.6) * 0.026;
  return running ? Math.min(0.042, walk + (speed - 1.6) * 0.006) : walk;
}

/** The poses offered for a photograph. */
export const PHOTO_POSES = ['wave', 'bow', 'dance', 'skill', 'sit', 'sleep', 'talk'] as const;
export type PhotoPose = (typeof PHOTO_POSES)[number];

/** The emotes' lengths (s), as the walker plays them (world/player.ts EMOTE_DUR). */
const POSE_SECONDS: Record<PhotoPose, number> = { wave: 1.9, bow: 1.7, dance: 1.9, skill: 1.6, sit: 2.5, sleep: 3.2, talk: 2.2 };
/** Where in each emote the pose is at its fullest (a bow at its deepest, a wave with the arm up). */
const POSE_PEAK: Record<PhotoPose, number> = { wave: 0.5, bow: 0.42, dance: 0.5, skill: 0.5, sit: 0.55, sleep: 0.6, talk: 0.45 };

/** Seconds into an emote at which a held pose stops (定格). */
export function posePeak(kind: PhotoPose): number {
  return POSE_SECONDS[kind] * POSE_PEAK[kind];
}

/** Yaw and pitch (YXZ, radians) of a view direction; pitch positive looks up. */
export function yawPitchOf(dx: number, dy: number, dz: number): { yaw: number; pitch: number } {
  const h = Math.hypot(dx, dz);
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, h || 1e-9) };
}

/** The unit view direction for a yaw and pitch (the inverse of yawPitchOf). */
export function dirOf(yaw: number, pitch: number): V3 {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** An eased step 0..1 (smoothstep), for blending two camera poses. */
export const ease = (t: number) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };

/** The most pixels one photograph may be rendered at (the grade's targets grow with it). */
export const PHOTO_BUDGET = { touch: 3.6e6, desk: 5.2e6 } as const;
