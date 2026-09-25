// The turntable in the character select: one small WebGLRenderer showing one companion at a
// time, idling, now and then waving or bowing or walking on the spot, slowly turning (drag to
// turn it yourself). Loaded lazily (it imports three.js); dispose() frees everything.
import * as THREE from 'three';
import type { CharacterId } from '../../../data/characters';
import type { EmoteKind } from '../types';
import { FACTORIES } from './index';
import type { CharacterModel, MotionState } from './types';

export interface Stage {
  show(id: CharacterId): void;
  /** Play an emote now (e.g. a bow when chosen). */
  emote(kind: EmoteKind): void;
  resize(): void;
  /** Stop drawing while the stage is covered (e.g. a locked companion is shown as a portrait). */
  setVisible(v: boolean): void;
  dispose(): void;
}

const SHOWCASE: Partial<Record<CharacterId, EmoteKind[]>> = {
  scholar: ['bow', 'play', 'wave'], gardener: ['water', 'wave'], fisher: ['cast', 'bow'], musician: ['play', 'bow'],
  swordsman: ['bow', 'throw'], taoist: ['play', 'jump', 'wave'], painter: ['play', 'wave'], player: ['play', 'bow'],
  cat: ['bow', 'wave', 'play'], rabbit: ['play', 'wave', 'eat'], poet: ['eat', 'wave'], guan: ['bow', 'wave'], change: ['play', 'wave'],
};

export function createStage(canvas: HTMLCanvasElement, o: { reduced: boolean }): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fbf8f1', '#b0a898', 2.25));
  const sun = new THREE.DirectionalLight('#fff8ec', 1.25);
  sun.position.set(3, 6, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 50);

  // a soft ink shadow under the feet
  const sc = document.createElement('canvas');
  sc.width = sc.height = 64;
  const sg = sc.getContext('2d');
  if (sg) {
    const grd = sg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(27,25,22,0.32)'); grd.addColorStop(0.6, 'rgba(27,25,22,0.12)'); grd.addColorStop(1, 'rgba(27,25,22,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 64, 64);
  }
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.002;
  scene.add(shadow);

  let model: CharacterModel | null = null;
  let visible = true;
  let current: CharacterId | null = null;
  let yaw = 0.5, spinV = 0;
  let t = 0, last = performance.now(), raf = 0;
  let pop = 1;
  // a little programme: idle, a showcase emote, idle, walk on the spot
  let cue = 0, cueT = 0;
  let emote: EmoteKind | null = null, emoteT = 0, emoteDur = 2.2, walking = false;
  const showcase = () => SHOWCASE[current ?? 'scholar'] ?? ['wave'];

  const frame = (h: number) => {
    // small creatures are long rather than tall: frame at least a metre so tails fit
    const hf = Math.max(h, 1.1);
    const target = new THREE.Vector3(0, Math.max(h * 0.5, hf * 0.36), 0);
    const d = (hf * 0.62) / Math.tan((camera.fov * Math.PI) / 360) + 0.4;
    camera.position.set(0, hf * 0.6, d);
    camera.lookAt(target);
    shadow.scale.setScalar(Math.max(0.9, h * 0.6));
  };

  const resize = () => {
    const w = canvas.clientWidth || 300, hh = canvas.clientHeight || 220;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
  };

  const show = (id: CharacterId) => {
    if (id === current) return;
    current = id;
    if (model) { scene.remove(model.root); model.dispose(); }
    const f = FACTORIES[id];
    model = f(THREE, { palette: {} });
    scene.add(model.root);
    frame(model.height);
    pop = o.reduced ? 1 : 0;
    cue = 0; cueT = 0; emote = null; walking = false;
  };

  const doEmote = (k: EmoteKind) => { emote = k; emoteT = 0; emoteDur = k === 'play' ? 3 : 2.2; };

  // drag to turn
  let dragX: number | null = null;
  const down = (e: PointerEvent) => { dragX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    yaw += dx * 0.012;
    spinV = dx * 0.6;
  };
  const up = () => { dragX = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !visible) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    if (!model) return;
    // the programme
    if (!o.reduced && !emote) {
      cueT += dt;
      const len = [3, 0, 2.2, 3.2][cue];
      if (cue === 1) { doEmote(showcase()[Math.floor(t) % showcase().length]); cue = 2; cueT = 0; }
      else if (cueT > len) { cue = (cue + 1) % 4; cueT = 0; walking = cue === 3; }
    }
    if (emote) { emoteT += dt / emoteDur; if (emoteT >= 1) { emote = null; emoteT = 0; } }
    if (dragX === null) {
      spinV *= Math.exp(-dt * 3);
      yaw += (o.reduced ? 0 : 0.28) * dt + spinV * dt;
    }
    model.root.rotation.y = Math.PI + yaw;
    if (pop < 1) { pop = Math.min(1, pop + dt * 4); const k = 1 - Math.pow(1 - pop, 3); model.root.scale.setScalar(0.86 + 0.14 * k); }
    const s: MotionState = {
      speed: walking ? 1.5 : 0, running: false, grounded: true, vy: 0,
      emote, emoteT, t, riding: false,
    };
    model.update(dt, s);
    renderer.render(scene, camera);
  };

  resize();
  raf = requestAnimationFrame(loop);

  return {
    show,
    emote: (k) => doEmote(k),
    resize,
    setVisible(v) { visible = v; },
    dispose() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      if (model) { scene.remove(model.root); model.dispose(); model = null; }
      shadowGeo.dispose(); shadowMat.dispose(); shadowTex.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
