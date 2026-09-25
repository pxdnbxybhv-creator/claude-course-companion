// The last step of every frame: the scene drawn to the screen through a colour grade — a light
// golden white balance, a gentle S-curve, vibrance in the mid-tones (never pushing yellow-greens to
// olive), a paper vignette and grain — so the painting reads as warm silk and xuan paper under
// daylight, and by night keeps its lanterns amber against an indigo dark with ink-brown shadows.
// The world calls grade.render() instead of renderer.render(); on low-end devices (or if its own
// render target fails) it just renders straight.
//
// The scene goes into an 8-bit target that holds sRGB-encoded colour, exactly as the canvas does,
// so every wash, glow and translucent ink stroke blends as it did on the screen; the grade then
// reads it back and writes the canvas. (three.js only lets an "XR" render target take the output
// colour space, hence the flag below: it changes nothing else in WebGLRenderer 0.186.)
import * as THREE from 'three';

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
 * `window.__gradeOff = true` shows the frame ungraded, for comparison.
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
  c += (g * 0.018 + f * 0.01) * (0.6 + 0.4 * (1.0 - l));

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export function createGrade(renderer: THREE.WebGLRenderer, o: { lowEnd: boolean; reduced: boolean }): Grade {
  const direct: Grade = {
    render: (scene, camera) => {
      renderer.render(scene, camera);
      if (import.meta.env.DEV) grab(renderer);
    },
    setSize: () => {},
    setLight: () => {},
    dispose: () => {},
  };
  if (o.lowEnd) return direct;
  const gl = renderer.getContext();
  if (!(typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)) return direct;

  const size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  // multisample at low pixel ratios (two samples on very large screens, to keep the memory in
  // bounds); at high ones the pixels are small and a light FXAA in the grade smooths the edges. This
  // does not depend on the canvas: its own antialias is wasted once every frame goes through here.
  const samples = renderer.getPixelRatio() < 1.6 ? (size.x * size.y > 2.6e6 ? 2 : 4) : 0;
  let rt: THREE.WebGLRenderTarget;
  try {
    rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      samples, colorSpace: THREE.SRGBColorSpace,
    });
  } catch {
    return direct;
  }
  // sRGB-encoded values in a plain RGBA8 store: the shaders encode, the hardware does not
  rt.texture.internalFormat = 'RGBA8';
  (rt as THREE.WebGLRenderTarget & { isXRRenderTarget: boolean }).isXRRenderTarget = true;

  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: FS, depthTest: false, depthWrite: false,
    defines: samples ? {} : { FXAA: 1 },
    uniforms: {
      tScene: { value: rt.texture },
      uRes: { value: new THREE.Vector2(size.x, size.y) },
      uNight: { value: 0 },
      uGold: { value: 0 },
      uHour: { value: new THREE.Vector3(1, 1, 1) },
    },
  });
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const quad = new THREE.Mesh(tri, mat);
  quad.frustumCulled = false;
  const post = new THREE.Scene();
  post.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let ok = true;
  let checked = false;
  const fit = () => {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(1, size.x), h = Math.max(1, size.y);
    if (rt.width !== w || rt.height !== h) {
      rt.setSize(w, h);
      (mat.uniforms.uRes.value as THREE.Vector2).set(w, h);
      checked = false; // a new size: check the target again before trusting it
    }
  };
  /** The grade's own target failed: render straight from now on. */
  const off = (e: unknown) => {
    if (import.meta.env.DEV) console.warn('[walk] colour grade off:', e);
    ok = false;
    renderer.setRenderTarget(null);
    rt.dispose();
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
      try {
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(null);
      }
      // 3. the grade pass itself
      try {
        renderer.render(post, cam);
      } catch (e) {
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
      // the golden hours, read from the warmth of the light (blue against red: day 0.89, dawn 0.81,
      // dusk 0.71 in linear light): 0 by day … 1 at dusk
      const gold = Math.min(1, Math.max(0, (0.888 - tint.b / Math.max(tint.r, 1e-3)) / 0.182));
      mat.uniforms.uGold.value = gold;
      // the hour's own warmth (dawn rose, dusk gold) — gently, the lights already carry most of it
      const m = Math.max(tint.r, tint.g, tint.b, 1e-3);
      const k = 0.15 * (1 - night) * (1 - 0.5 * gold);
      hour.set(1 + k * (tint.r / m - 1), 1 + k * (tint.g / m - 1), 1 + k * (tint.b / m - 1));
    },
    dispose() {
      rt.dispose();
      mat.dispose();
      tri.dispose();
    },
  };
}
