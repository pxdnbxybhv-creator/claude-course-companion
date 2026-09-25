// The turntable in the character select: one small WebGLRenderer showing one companion at a
// time, idling (with its own little fidgets), now and then showing off its skill or another
// emote or walking on the spot, slowly turning (drag to turn it yourself, tap to see the skill).
// Loaded lazily (it imports three.js); dispose() frees everything.
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
  scholar: ['skill', 'bow', 'play', 'talk'], gardener: ['skill', 'water', 'wave'], fisher: ['skill', 'cast', 'bow'], musician: ['skill', 'bow', 'dance'],
  swordsman: ['skill', 'bow', 'dance'], taoist: ['skill', 'play', 'jump'], painter: ['skill', 'play', 'talk'], player: ['skill', 'play', 'bow'],
  cat: ['skill', 'dance', 'play', 'wave'], rabbit: ['skill', 'play', 'dance'], poet: ['skill', 'eat', 'dance'], guan: ['skill', 'bow', 'talk'], change: ['skill', 'play', 'dance'],
};
/** As in the world (world/player.ts EMOTE_DUR). */
const DUR: Partial<Record<EmoteKind, number>> = { eat: 2.1, bow: 1.7, jump: 0.95, wave: 1.9, water: 1.5, throw: 0.9, cast: 1.3, play: 2.8, skill: 1.6, talk: 2.2, pet: 1.8, build: 1.6, dance: 1.9, sleep: 3.2 };

export function createStage(canvas: HTMLCanvasElement, o: { reduced: boolean }): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff4e2', '#b89f80', 2.1));
  const sun = new THREE.DirectionalLight('#ffe9c8', 1.4);
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
  // reduced motion: the figure holds still (no breathing, no fluttering, no programme); it is
  // stepped and drawn only while something the viewer did is playing out (a drag, a choice)
  let settle = 0.2;
  // a little programme: idle, a showcase emote, idle, walk on the spot
  let cue = 0, cueT = 0;
  let emote: EmoteKind | null = null, emoteT = 0, emoteDur = 2.2, walking = false, showN = 0;
  const showcase = () => SHOWCASE[current ?? 'scholar'] ?? ['wave'];

  // frame what is really there: the figure plus its hair loops, hat, hover and long props (a
  // glaive, a rod), measured once it has settled into its idle pose. A long prop may widen the
  // view, but never shrink the figure below ~60% of the frame.
  const box = new THREE.Box3(), part = new THREE.Box3();
  const measure = (root: THREE.Object3D) => {
    box.makeEmpty();
    root.updateWorldMatrix(true, true);
    root.traverseVisible((ob) => {
      const m = ob as THREE.Mesh;
      if (!m.isMesh || ob.name === 'outline') return; // sprites (a glow) and ink hulls don't count
      m.geometry.computeBoundingBox();
      if (m.geometry.boundingBox) box.union(part.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld));
    });
  };
  const frame = (h: number) => {
    const top = box.isEmpty() ? h : Math.min(Math.max(box.max.y, h), h * 1.65);
    // small creatures are long rather than tall: frame at least 1.35 m so tails fit as they turn
    // (a tail swung toward the camera reaches low in the frame)
    const span = Math.max(top * 1.12 + 0.1, 1.35);
    const target = new THREE.Vector3(0, Math.min(span * 0.46, top * 0.5 + 0.2), 0);
    const d = (span * 0.5) / Math.tan((camera.fov * Math.PI) / 360) + 0.45;
    camera.position.set(0, target.y + span * 0.14, d);
    camera.lookAt(target);
    shadow.scale.setScalar(Math.max(0.9, h * 0.6));
  };

  const resize = () => {
    const w = canvas.clientWidth || 300, hh = canvas.clientHeight || 220;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    settle = 0.2;
  };

  const show = (id: CharacterId) => {
    if (id === current) return;
    current = id;
    if (model) { scene.remove(model.root); model.dispose(); }
    const f = FACTORIES[id];
    model = f(THREE, { palette: {}, reduced: o.reduced });
    scene.add(model.root);
    // settle into the idle pose before the first frame (and before measuring)
    model.root.rotation.y = Math.PI + yaw;
    const idle: MotionState = { speed: 0, running: false, grounded: true, vy: 0, emote: null, emoteT: 0, t, riding: false };
    for (let i = 0; i < 60; i++) { idle.t = o.reduced ? t : t + i / 30; model.update(1 / 30, idle); }
    if (!o.reduced) t += 2;
    measure(model.root);
    frame(model.height);
    pop = o.reduced ? 1 : 0;
    cue = 0; cueT = 3.4; emote = null; walking = false; showN = 0;
    settle = 0.2;
  };

  const doEmote = (k: EmoteKind) => { emote = k; emoteT = 0; emoteDur = DUR[k] ?? 2.2; settle = 0.2; walking = false; };

  // drag to turn; a tap (no drag) shows the skill
  let dragX: number | null = null;
  let tapX = 0, tapAt = 0;
  const down = (e: PointerEvent) => { dragX = e.clientX; tapX = e.clientX; tapAt = performance.now(); canvas.setPointerCapture?.(e.pointerId); };
  const move = (e: PointerEvent) => {
    if (dragX === null) return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    yaw += dx * 0.012;
    spinV = o.reduced ? 0 : dx * 0.6;
  };
  const up = (e: PointerEvent) => {
    const tap = dragX !== null && e.type === 'pointerup' && Math.abs(e.clientX - tapX) < 8 && performance.now() - tapAt < 450;
    dragX = null;
    if (tap && model) { doEmote('skill'); cue = 2; cueT = 0; }
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !visible) { last = now; return; }
    // (the first rAF stamp can precede the request: never step backwards)
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!model) return;
    if (o.reduced) {
      if (dragX !== null || emote) settle = 0.6;
      else if (settle <= 0) return; // nothing changes: the canvas keeps the last frame
      settle -= dt;
    } else t += dt;
    // the programme
    if (!o.reduced && !emote) {
      cueT += dt;
      const len = [5.2, 0, 2.4, 3.2][cue];
      if (cue === 1) { doEmote(showcase()[showN++ % showcase().length]); cue = 2; cueT = 0; }
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
    setVisible(v) { visible = v; settle = 0.2; },
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
