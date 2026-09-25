// The last step of every frame: the scene drawn to the screen through a colour grade — a warm
// white balance, a gentle S-curve, a saturation lift in the mid-tones, a paper vignette and grain
// — so the painting reads as warm silk and xuan paper under daylight, and by night keeps its
// lanterns amber against an indigo dark. The world calls grade.render() instead of
// renderer.render(); on low-end devices (or if the render target fails) it just renders straight.
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
const FS = /* glsl */`
precision highp float;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform float uNight;
uniform vec3 uHour;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  float n = uNight;

  // 1. white balance: golden daylight; by night the lamp-lit stays amber (below)
  vec3 wb = mix(vec3(1.02, 1.0, 0.962), vec3(1.0), n);
  c *= wb * uHour;

  // 2. split tone: shadows toward warm ink-brown (indigo by night), highlights toward paper
  float l = luma(c);
  float sh = 1.0 - smoothstep(0.0, 0.55, l);
  c += sh * mix(vec3(0.02, 0.009, -0.004), vec3(-0.002, 0.0, 0.018), n);

  // 3. a gentle S-curve around the middle grey
  vec3 s = c * c * (3.0 - 2.0 * c);
  c = mix(c, s, mix(0.26, 0.18, n));

  // 4. more colour in the mid-tones (paper whites and ink blacks stay as they are)
  l = luma(c);
  float mid = clamp(4.0 * l * (1.0 - l), 0.0, 1.0);
  c = mix(vec3(l), c, 1.0 + mix(0.24, 0.06, n) * mid);

  // 5. night: what is warm (lanterns, windows, fires) glows a little warmer and brighter
  float warm = clamp((c.r - c.b) * 2.4, 0.0, 1.0) * smoothstep(0.2, 0.7, c.r);
  c += n * warm * vec3(0.07, 0.03, -0.02);

  // 6. paper: a soft vignette of old silk at the edges, and a fibrous grain
  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float v = smoothstep(0.35, 1.05, length(q) * mix(1.0, 1.08, n));
  c *= mix(vec3(1.0), mix(vec3(0.86, 0.8, 0.72), vec3(0.72, 0.72, 0.8), n), v * 0.55);
  vec2 px = gl_FragCoord.xy;
  float g = hash(floor(px)) - 0.5;
  float f = hash(floor(px * vec2(0.06, 0.8))) - 0.5;
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
  // multisample like the canvas would have (it is created with antialias only at low pixel ratios);
  // two samples on very large screens to keep the memory in bounds
  const aa = !!gl.getContextAttributes()?.antialias;
  const samples = aa ? (size.x * size.y > 2.6e6 ? 2 : 4) : 0;
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
    uniforms: {
      tScene: { value: rt.texture },
      uRes: { value: new THREE.Vector2(size.x, size.y) },
      uNight: { value: 0 },
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
    }
  };
  const hour = mat.uniforms.uHour.value as THREE.Vector3;

  return {
    render(scene, camera) {
      if (!ok || (import.meta.env.DEV && (window as unknown as { __gradeOff?: boolean }).__gradeOff)) { direct.render(scene, camera); return; }
      try {
        fit();
        renderer.setRenderTarget(rt);
        if (!checked) {
          checked = true;
          if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('grade: framebuffer incomplete');
        }
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.render(post, cam);
      } catch (e) {
        if (import.meta.env.DEV) console.warn('[walk] colour grade off:', e);
        ok = false;
        renderer.setRenderTarget(null);
        rt.dispose();
        renderer.render(scene, camera);
      }
      if (import.meta.env.DEV) grab(renderer);
    },
    setSize() {
      if (ok) fit();
    },
    setLight({ night, tint }) {
      mat.uniforms.uNight.value = night;
      // the hour's own warmth (dawn rose, dusk gold) — gently, the lights already carry most of it
      const m = Math.max(tint.r, tint.g, tint.b, 1e-3);
      const k = 0.25 * (1 - night);
      hour.set(1 + k * (tint.r / m - 1), 1 + k * (tint.g / m - 1), 1 + k * (tint.b / m - 1));
    },
    dispose() {
      rt.dispose();
      mat.dispose();
      tri.dispose();
    },
  };
}
