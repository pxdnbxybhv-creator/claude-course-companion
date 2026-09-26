// The last step of every frame: the scene drawn to the screen through a colour grade — a light
// golden white balance, a gentle S-curve, vibrance in the mid-tones (never pushing yellow-greens to
// olive), a paper vignette and grain — so the painting reads as warm silk and xuan paper under
// daylight, and by night keeps its lanterns amber against an indigo dark with ink-brown shadows.
// The world calls grade.render() instead of renderer.render(); at 低 and on low-end phones at 中
// (or if its own render target fails) it just renders straight. The picture quality (quality.ts) picks
// how much it does: 中 is the grade as it always was; 高 multisamples always, adds FXAA where the
// samples are few and lays a finer grain; 身临其境 adds a soft bloom on what shines in the dark
// (lanterns, lit windows, the moon; the brightest whites by day, faintly) and a gentle depth of air —
// the far land a touch softer and paler, as a painter leaves the distance in a lighter, wetter wash.
// The depth of air reads the scene's depth, and three marks the scene draws among its own transparent
// things leave in the target's alpha what the depth cannot tell (see MARK_FS): the painted ranges and
// the far mist (drawn without depth, at the far plane) soften as the far land does, and what floats in
// front without writing depth — a speech bubble, a drifting verse, a petal — stays as crisp as it is.
//
// The scene goes into an 8-bit target that holds sRGB-encoded colour, exactly as the canvas does,
// so every wash, glow and translucent ink stroke blends as it did on the screen; the grade then
// reads it back and writes the canvas. (three.js only lets an "XR" render target take the output
// colour space, hence the flag below: it changes nothing else in WebGLRenderer 0.186.)
import * as THREE from 'three';
import { NO_REFLECT } from './pond';
import { gradeSampling, type QualityProfile } from './quality';

export interface Grade {
  /** Draw the scene to the screen (through the grade, if any). */
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** The canvas size changed (CSS pixels; the renderer's pixel ratio applies). */
  setSize(w: number, h: number): void;
  /** Night 0..1 and a warm tint of the hour, from the sky each frame. */
  setLight(o: { night: number; tint: THREE.Color }): void;
  dispose(): void;
}

/**
 * DEV: `window.__grab = true` copies the next finished frame into `window.__grabbed` (a PNG data URL);
 * `window.__gradeOff = true` shows the frame ungraded, for comparison; `window.__airView = true` shows
 * 身临其境's depth of air alone (white: as far as it goes; black: crisp).
 */
function grab(renderer: THREE.WebGLRenderer): void {
  const w = window as unknown as { __grab?: boolean; __grabbed?: string };
  if (!w.__grab) return;
  w.__grab = false;
  try { w.__grabbed = renderer.domElement.toDataURL('image/png'); } catch { w.__grabbed = ''; }
}

const VS = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Everything here works on sRGB-encoded values (as the eye sees them), 0..1.
// FXAA: a light edge smoothing (5 taps + 2 along the edge) where the scene target has no multisampling
// (high pixel ratios, where the canvas is made without antialias).
const FS = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uNight;
uniform float uGold;
uniform vec3 uHour;
#ifdef BLOOM
uniform sampler2D tBloomA;
uniform sampler2D tBloomB;
uniform float uBloom;
#endif
#ifdef DEPTH
uniform sampler2D tDepth;
uniform sampler2D tSoft;
uniform vec2 uClip;
uniform vec3 uAir;
uniform float uAirView;
#endif
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 scene() {
#ifdef FXAA
  vec2 px = 1.0 / uRes;
  vec3 rgbM = texture2D(tScene, vUv).rgb;
  vec3 rgbNW = texture2D(tScene, vUv + vec2(-1.0, -1.0) * px).rgb;
  vec3 rgbNE = texture2D(tScene, vUv + vec2(1.0, -1.0) * px).rgb;
  vec3 rgbSW = texture2D(tScene, vUv + vec2(-1.0, 1.0) * px).rgb;
  vec3 rgbSE = texture2D(tScene, vUv + vec2(1.0, 1.0) * px).rgb;
  float lM = luma(rgbM), lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.05, lMax * 0.125)) return rgbM; // no edge: the common case, one tap
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
  dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * px;
  vec3 a = 0.5 * (texture2D(tScene, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tScene, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tScene, vUv - dir * 0.5).rgb + texture2D(tScene, vUv + dir * 0.5).rgb);
  float lB = luma(b);
  return (lB < lMin || lB > lMax) ? a : b;
#else
  return texture2D(tScene, vUv).rgb;
#endif
}

void main() {
  vec3 c = scene();
  float n = uNight;
#ifdef DEPTH
  // 0. the depth of air: past ~35 m the land softens toward a half-size copy of itself and pales a
  //    little toward the haze. The marks' alpha (MARK_FS) says the rest: on the land, how much of the
  //    pixel is an overlay in front (a bubble, a verse, a petal: kept crisp); at the far plane, how
  //    much is the painted ranges and far mist (soft as the far land) rather than the sky itself (its
  //    stars and moon stay sharp) or something near drawn over it
  float zb = texture2D(tDepth, vUv).r;
  float mark = texture2D(tScene, vUv).a;
  float far;
  if (zb < 0.99999) {
    float zn = zb * 2.0 - 1.0;
    float dist = 2.0 * uClip.x * uClip.y / (uClip.y + uClip.x - zn * (uClip.y - uClip.x));
    far = smoothstep(32.0, 170.0, dist) * (1.0 - mark);
  } else {
    far = (1.0 - mark) * 0.85;
  }
  if (uAirView > 0.5) { gl_FragColor = vec4(vec3(far), 1.0); return; }
  if (far > 0.002) {
    vec3 soft = texture2D(tSoft, vUv).rgb;
    c = mix(c, soft, far * 0.62);
    c = mix(c, uAir, far * mix(0.07, 0.04, n));
  }
#endif
#ifdef BLOOM
  // 0b. what shines: screen-blended, so a glow never burns a highlight out
  vec3 b = (texture2D(tBloomA, vUv).rgb * 0.85 + texture2D(tBloomB, vUv).rgb * 1.1) * uBloom;
  c = 1.0 - (1.0 - c) * (1.0 - clamp(b, 0.0, 1.0));
#endif
  // uGold: the golden hours (dawn, dusk), when the sky's own light is already warm: grade less
  float gold = uGold * (1.0 - n);

  // 1. white balance: a touch of golden daylight (the lights carry most of the warmth); none by night
  vec3 wb = mix(vec3(1.016, 1.0, 0.985), vec3(1.0), max(n, gold * 0.6));
  c *= wb * uHour;

  // 2. split tone: shadows toward warm ink-brown (by night too, faintly, so the darks stay ink, not
  //    slate), highlights toward paper
  float l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  c += sh * mix(vec3(0.018, 0.008, -0.003), vec3(0.008, 0.004, 0.0), n);

  // 3. a gentle S-curve around the middle grey (a little more by night: moonlit tops, deep hollows)
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, mix(0.28, 0.24, n));

  // 4. vibrance in the mid-tones: dull colours gain, strong ones stay; paper whites and ink blacks
  //    stay as they are; yellow-greens (hue ~45-70) are left alone so a meadow never turns olive, and
  //    the golden hours get less (their light is saturated already)
  l = luma(c);
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float hue = 0.0;
  if (mx - mn > 1e-3) {
    if (mx == c.r) hue = mod((c.g - c.b) / (mx - mn), 6.0);
    else if (mx == c.g) hue = (c.b - c.r) / (mx - mn) + 2.0;
    else hue = (c.r - c.g) / (mx - mn) + 4.0;
  }
  hue *= 60.0;
  float yellow = 1.0 - smoothstep(10.0, 22.0, abs(hue - 57.0));
  float mid = clamp(4.0 * l * (1.0 - l), 0.0, 1.0);
  float lift = mix(0.3, 0.08, n) * (1.0 - 0.6 * gold) * mid * (1.0 - sat) * (1.0 - 0.8 * yellow);
  c = mix(vec3(l), c, 1.0 + lift);

  // 5. night: what is warm (lanterns, windows, fires) glows a little warmer and brighter
  float warm = clamp((c.r - c.b) * 2.4, 0.0, 1.0) * smoothstep(0.2, 0.7, c.r);
  c += n * warm * vec3(0.07, 0.03, -0.02);

  // 6. paper: a soft vignette of old silk at the edges (warm-dark by night, never blue), and a
  //    fibrous grain
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float v = smoothstep(0.35, 1.05, length(q) * mix(1.0, 1.08, n));
  c *= mix(vec3(1.0), mix(vec3(0.86, 0.8, 0.72), vec3(0.74, 0.68, 0.62), n), v * 0.55);
  vec2 fp = gl_FragCoord.xy;
  float g = hash(floor(fp)) - 0.5;
  float f = hash(floor(fp * vec2(0.06, 0.8))) - 0.5;
#ifdef FINE
  // finer: a lighter tooth, and fibres that cross (xuan paper's long fibres run every way)
  float f2 = hash(floor(fp * vec2(0.7, 0.045))) - 0.5;
  c += (g * 0.012 + f * 0.007 + f2 * 0.005) * (0.6 + 0.4 * (1.0 - l));
#else
  c += (g * 0.018 + f * 0.01) * (0.6 + 0.4 * (1.0 - l));
#endif

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

// The bloom's passes (身临其境 only): a half-size copy of the scene (also the depth of air's soft
// layer), then what shines, blurred at a quarter and an eighth of the size.
const DOWN_FS = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, -0.5)).rgb
    + texture2D(tSrc, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tSrc, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  gl_FragColor = vec4(c * 0.25, 1.0);
}`;
// A 9-tap gaussian along uDir (linear sampling: 5 fetches). With BRIGHT, each tap is first keyed to
// what shines: by night what is warm and lit (lanterns, windows, fires) and the moon's ivory; by day
// only the brightest whites, faintly (sunlit paper in the haze).
const BLUR_FS = /* glsl */`
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uDir;
uniform float uNight;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 key(vec3 c) {
#ifdef BRIGHT
  float l = luma(c);
  float warm = clamp((c.r - c.b) * 2.2, 0.0, 1.0);
  // lamplight is warm and lit (its hue does the choosing, so moonlit walls stay as they are); the
  // moon and the brightest whites glow a little whatever their hue
  float night = smoothstep(0.3, 0.78, l) * warm * warm * 0.95 + smoothstep(0.84, 0.98, l) * 0.45;
  float day = smoothstep(0.9, 1.0, l) * 0.3;
  return c * mix(day, night, uNight);
#else
  return c;
#endif
}
void main() {
  vec3 c = key(texture2D(tSrc, vUv).rgb) * 0.2270270270;
  c += key(texture2D(tSrc, vUv + uDir * 1.3846153846).rgb) * 0.3162162162;
  c += key(texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
  c += key(texture2D(tSrc, vUv + uDir * 3.2307692308).rgb) * 0.0702702703;
  c += key(texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

// The depth of air's marks: full-screen strokes drawn inside the scene's own pass, among its
// transparent things (by renderOrder), that leave the colour alone and write only the alpha of the
// scene target (which nothing else reads: the canvas is opaque):
//   -5.5  alpha := 0 everywhere          then the painted ranges (-5) and the far mist (-4) cover it
//   -3.5  alpha := 1 - alpha             at the far plane: 1 - what is far; whatever is drawn over
//                                        it later (a branch, a bubble) raises it again
//    3.5  alpha := 0 where there is land (depth < 1): overlays drawn after it (renderOrder >= 4:
//         bubbles, verses, particles) leave their own coverage there
// Everything drawn normally blends alpha as a' = a + alpha (1 - a), so the grade reads, per pixel,
// how far the far plane is, or how much of the land is hidden behind an overlay.
const MARK_VS = /* glsl */`
void main() { gl_Position = vec4(position.xy, 1.0, 1.0); }`;
const MARK_FS = /* glsl */`
void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }`;

function markMeshes(tri: THREE.BufferGeometry): THREE.Mesh[] {
  const mk = (order: number, invert: boolean, landOnly: boolean) => {
    const m = new THREE.ShaderMaterial({
      vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false,
      depthTest: landOnly, depthFunc: THREE.GreaterDepth, fog: false,
      blending: THREE.CustomBlending,
      // colour: untouched (0 · src + 1 · dst)
      blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.OneFactor,
      // alpha: 0, or 1 - dst
      blendEquationAlpha: invert ? THREE.SubtractEquation : THREE.AddEquation,
      blendSrcAlpha: invert ? THREE.OneFactor : THREE.ZeroFactor, blendDstAlpha: invert ? THREE.OneFactor : THREE.ZeroFactor,
    });
    const mesh = new THREE.Mesh(tri, m);
    mesh.name = 'grade:mark';
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    // the main view only (never the pond's mirror), never a shadow, never in anyone's raycast
    mesh.layers.set(NO_REFLECT);
    mesh.raycast = () => {};
    mesh.userData.noShadow = true;
    return mesh;
  };
  return [mk(-5.5, false, false), mk(-3.5, true, false), mk(3.5, false, true)];
}

export interface GradeOptions {
  /** 'off' renders straight; 'standard' is the grade as always; 'fine' and 'rich' as in quality.ts. */
  mode: QualityProfile['grade'];
  bloom?: boolean;
  depth?: boolean;
  reduced: boolean;
}

export function createGrade(renderer: THREE.WebGLRenderer, o: GradeOptions): Grade {
  const direct: Grade = {
    render: (scene, camera) => {
      renderer.render(scene, camera);
      if (import.meta.env.DEV) grab(renderer);
    },
    setSize: () => {},
    setLight: () => {},
    dispose: () => {},
  };
  if (o.mode === 'off') return direct;
  const gl = renderer.getContext();
  if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return direct;
  const rich = o.mode === 'rich';
  const useBloom = rich && !!o.bloom;
  const useDepth = rich && !!o.depth;

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  // 中: multisample at low pixel ratios (two samples on very large screens, to keep the memory in
  // bounds); at high ones the pixels are small and a light FXAA in the grade smooths the edges. This
  // does not depend on the canvas: its own antialias is wasted once every frame goes through here.
  const { samples, fxaa } = gradeSampling({ grade: o.mode }, renderer.getPixelRatio(), size.x * size.y);
  let rt: THREE.WebGLRenderTarget;
  const extra: THREE.WebGLRenderTarget[] = [];
  const target = (w: number, h: number) => {
    const t = new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      colorSpace: THREE.SRGBColorSpace,
    });
    // the same sRGB-encoded values as the scene target, stored plainly
    t.texture.internalFormat = 'RGBA8';
    (t as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;
    extra.push(t);
    return t;
  };
  try {
    rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples, colorSpace: THREE.SRGBColorSpace,
    });
    if (useDepth) {
      // the scene's depth, resolved from the multisampled buffer each frame, for the depth of air
      rt.depthTexture = new THREE.DepthTexture(Math.max(1, size.x), Math.max(1, size.y), THREE.UnsignedIntType);
    }
  } catch {
    return direct;
  }
  // sRGB-encoded values in a plain RGBA8 store: the shaders encode, the hardware does not
  rt.texture.internalFormat = 'RGBA8';
  (rt as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;

  const defines: Record<string, number> = {};
  if (fxaa) defines.FXAA = 1;
  if (o.mode !== 'standard') defines.FINE = 1;
  if (useBloom) defines.BLOOM = 1;
  if (useDepth) defines.DEPTH = 1;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
    defines,
    uniforms: {
      tScene: { value: rt.texture },
      uRes: { value: new THREE.Vector2(size.x, size.y) },
      uNight: { value: 0 },
      uGold: { value: 0 },
      uHour: { value: new THREE.Vector3(1, 1, 1) },
      tBloomA: { value: null },
      tBloomB: { value: null },
      uBloom: { value: 1 },
      tDepth: { value: rt.depthTexture ?? null },
      tSoft: { value: null },
      uClip: { value: new THREE.Vector2(0.1, 600) },
      uAir: { value: new THREE.Color('#e7e6d8') },
      uAirView: { value: 0 },
    },
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(tri, mat);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // --- the bloom and the depth of air (身临其境)
  let half: THREE.WebGLRenderTarget | null = null;
  const blur: THREE.WebGLRenderTarget[] = [];
  const passMats: THREE.ShaderMaterial[] = [];
  let downMat: THREE.ShaderMaterial | null = null;
  let brightMat: THREE.ShaderMaterial | null = null;
  let blurMat: THREE.ShaderMaterial | null = null;
  if (useBloom || useDepth) {
    half = target(size.x / 2, size.y / 2);
    downMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DOWN_FS, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: rt.texture }, uTexel: { value: new THREE.Vector2(1 / size.x, 1 / size.y) } } });
    passMats.push(downMat);
    mat.uniforms.tSoft.value = half.texture;
  }
  if (useBloom) {
    // quarter: [0] across, [1] down; eighth: [2] across, [3] down
    for (const k of [4, 4, 8, 8]) blur.push(target(size.x / k, size.y / k));
    brightMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, defines: { BRIGHT: 1 }, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uNight: { value: 0 } } });
    blurMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: BLUR_FS, depthTest: false, depthWrite: false, uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uNight: { value: 0 } } });
    passMats.push(brightMat, blurMat);
    mat.uniforms.tBloomA.value = blur[1].texture;
    mat.uniforms.tBloomB.value = blur[3].texture;
  }
  const marks = useDepth ? markMeshes(tri) : [];
  const pass = (m: THREE.ShaderMaterial, to: THREE.WebGLRenderTarget) => {
    quad.material = m;
    renderer.setRenderTarget(to);
    renderer.render(post, cam);
  };
  const blurPass = (m: THREE.ShaderMaterial, from: THREE.WebGLRenderTarget, to: THREE.WebGLRenderTarget, dx: number, dy: number) => {
    m.uniforms.tSrc.value = from.texture;
    (m.uniforms.uDir.value as THREE.Vector2).set(dx / from.width, dy / from.height);
    pass(m, to);
  };
  /** The half-size copy and the bloom chain, from the finished scene target. */
  const extras = () => {
    if (!half || !downMat) return;
    pass(downMat, half);
    if (!brightMat || !blurMat || blur.length < 4) return;
    blurPass(brightMat, half, blur[0], 1, 0);
    blurPass(blurMat, blur[0], blur[1], 0, 1);
    blurPass(blurMat, blur[1], blur[2], 1.4, 0);
    blurPass(blurMat, blur[2], blur[3], 0, 1.4);
  };

  let ok = true;
  let checked = false;
  const fit = () => {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h);
      (mat.uniforms.uRes.value as THREE.Vector2).set(w, h);
      if (half) half.setSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
      if (downMat) (downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / w, 1 / h);
      blur.forEach((b, i) => { const k = i < 2 ? 4 : 8; b.setSize(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k))); });
      checked = false; // a new size: check the target again before trusting it
    }
  };
  /** The grade's own target failed: render straight from now on. */
  const off = (e: unknown) => {
    if (import.meta.env.DEV) console.warn('[walk] colour grade off:', e);
    ok = false;
    for (const m of marks) m.removeFromParent();
    renderer.setRenderTarget(null);
    rt.depthTexture?.dispose();
    rt.dispose();
    for (const t of extra) t.dispose();
  };
  const hour = mat.uniforms.uHour.value as THREE.Vector3;

  return {
    render(scene, camera) {
      if (!ok || (import.meta.env.DEV && (window as unknown as { __gradeOff?: boolean }).__gradeOff)) { direct.render(scene, camera); return; }
      // 1. the grade's own target: if it cannot be used, the grade turns itself off for good
      try {
        fit();
        renderer.setRenderTarget(rt);
        if (!checked) {
          checked = true;
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('grade: framebuffer incomplete');
        }
      } catch (e) {
        off(e);
        direct.render(scene, camera);
        return;
      }
      // 2. the scene: an error here belongs to whatever drew it (a feature's onBeforeRender…), not
      //    to the grade — leave the screen as the target and let it through, as a plain render would
      if (marks.length && marks[0].parent !== scene) for (const m of marks) scene.add(m);
      try {
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(null);
      }
      // 3. the grade pass itself (after the bloom's and the depth's own passes, if any)
      try {
        if (half) {
          const pc = camera as THREE.PerspectiveCamera;
          if (pc.isPerspectiveCamera) (mat.uniforms.uClip.value as THREE.Vector2).set(pc.near, pc.far);
          const fog = scene.fog as THREE.Fog | null;
          if (fog) (mat.uniforms.uAir.value as THREE.Color).copy(fog.color).convertLinearToSRGB();
          if (import.meta.env.DEV) mat.uniforms.uAirView.value = (window as unknown as { __airView?: boolean }).__airView ? 1 : 0;
          extras();
          quad.material = mat;
          renderer.setRenderTarget(null);
        }
        renderer.render(post, cam);
      } catch (e) {
        quad.material = mat;
        off(e);
        renderer.render(scene, camera);
      }
      if (import.meta.env.DEV) grab(renderer);
    },
    setSize() {
      if (ok) fit();
    },
    setLight({ night, tint }) {
      mat.uniforms.uNight.value = night;
      if (brightMat) brightMat.uniforms.uNight.value = night;
      // the golden hours, read from the warmth of the light (blue against red: day 0.89, dawn 0.81,
      // dusk 0.71 in linear light): 0 by day … 1 at dusk
      const gold = Math.min(1, Math.max(0, (0.888 - tint.b / Math.max(tint.r, 1e-3)) / 0.182));
      mat.uniforms.uGold.value = gold;
      // the hour's own warmth (dawn rose, dusk gold) — gently, the lights already carry most of it
      const m = Math.max(tint.r, tint.g, tint.b, 1e-3);
      const k = 0.15 * (1 - night) * (1 - 0.5 * gold);
      hour.set(1 + k * (tint.r / m - 1), 1 + k * (tint.g / m - 1), 1 + k * (tint.b / m - 1));
      // the glow: faint by day (only the brightest whites), fuller once the lamps are lit
      mat.uniforms.uBloom.value = 0.5 + 0.95 * night;
    },
    dispose() {
      rt.depthTexture?.dispose();
      rt.dispose();
      for (const t of extra) t.dispose();
      mat.dispose();
      for (const m of passMats) m.dispose();
      for (const m of marks) { m.removeFromParent(); (m.material as THREE.Material).dispose(); }
      tri.dispose();
    },
  };
}
