// /lab.html?scene=characters — the cast of 入画 side by side.
//   &pose=walk|run|idle|air|<EmoteKind>   what they all do (default walk)
//   &only=cat&poses=idle,walk,run,air,eat,bow,…   one character in many poses
//   &u=0.5          emote progress for a still
//   &night=1        the night light
//   &ui=portraits   the painted portraits (unlocked row, locked row)
//   &ui=select      the character-select sheet
import * as THREE from 'three';
import { CHARACTERS, type CharacterId } from '../../data/characters';
import { FACTORIES, paintPortrait } from '../../views/walk/characters';
import type { CharacterModel, MotionState } from '../../views/walk/characters/types';
import type { EmoteKind } from '../../views/walk/types';

const EMOTES: EmoteKind[] = ['eat', 'bow', 'jump', 'wave', 'throw', 'cast', 'row', 'sit', 'play', 'water'];

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const ui = p.get('ui');
  if (ui === 'portraits') return portraits(canvas);
  if (ui === 'select') return select(canvas);

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr, Hh = canvas.height / dpr;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, Hh, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const night = p.get('night') === '1';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(night ? '#2a3140' : '#efe9dc');
  scene.add(new THREE.HemisphereLight(night ? '#cfd8e8' : '#fbf8f1', night ? '#8f98a8' : '#b0a898', night ? 2.75 : 2.25));
  const sun = new THREE.DirectionalLight(night ? '#e2e9f6' : '#fff8ec', night ? 0.8 : 1.25);
  sun.position.set(4, 8, 6);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 20), new THREE.MeshBasicMaterial({ color: night ? '#394150' : '#e4dccb' }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const only = p.get('only') as CharacterId | null;
  const poseList = (p.get('poses') ?? '').split(',').filter(Boolean);
  // &mix=scholar:play,gardener:water,…  any characters in any poses
  const mixList = (p.get('mix') ?? '').split(',').filter(Boolean).map((x) => x.split(':') as [CharacterId, string]);
  const ids = mixList.length ? mixList.map((m) => m[0]) : only ? poseList.map(() => only) : CHARACTERS.map((c) => c.id);
  const poses = mixList.length ? mixList.map((m) => m[1]) : only ? poseList : ids.map(() => p.get('pose') ?? 'walk');
  const gap = only || mixList.length ? 1.25 : 1.05;
  const models: { m: CharacterModel; pose: string }[] = [];
  ids.forEach((id, i) => {
    const f = FACTORIES[id];
    if (!f) return;
    const m = f(THREE, { palette: {} });
    m.root.position.set((i - (ids.length - 1) / 2) * gap, 0, 0);
    m.root.rotation.y = Math.PI + Number(p.get('yaw') ?? 0.55);
    scene.add(m.root);
    models.push({ m, pose: poses[i] });
  });
  const span = ids.length * gap;
  const camera = new THREE.PerspectiveCamera(22, W / Hh, 0.1, 200);
  const dist = Math.max(6, (span / 2) / Math.tan((22 * Math.PI) / 360) / (W / Hh) * 1.02);
  camera.position.set(0, 1.4 + dist * 0.12, dist);
  camera.lookAt(0, 0.8, 0);

  const u0 = p.get('u');
  let t = 0;
  const step = (dt: number) => {
    t += dt;
    for (const { m, pose } of models) {
      const s: MotionState = { speed: 0, running: false, grounded: true, vy: 0, emote: null, emoteT: 0, t, riding: false };
      if (pose === 'walk') s.speed = 2.1;
      else if (pose === 'run') { s.speed = 4.3; s.running = true; }
      else if (pose === 'air') { s.grounded = false; s.vy = Math.sin(t * 2) * 3; }
      else if ((EMOTES as string[]).includes(pose)) {
        s.emote = pose as EmoteKind;
        s.emoteT = u0 ? Number(u0) : (t % 2.2) / 2.2;
        if (pose === 'row' || pose === 'sit') s.riding = true;
      }
      m.update(dt, s);
    }
  };
  // warm up so the stills are mid-motion
  for (let i = 0; i < 90; i++) step(1 / 60);
  renderer.render(scene, camera);
  let last = performance.now();
  const loop = (now: number) => {
    step(Math.min(0.05, (now - last) / 1000));
    last = now;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (window as unknown as { __chars: unknown }).__chars = { models, scene, renderer };
}

function portraits(canvas: HTMLCanvasElement) {
  canvas.style.display = 'none';
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:grid;grid-template-columns:repeat(' + (new URLSearchParams(location.search).get('cols') ?? '13') + ',1fr);gap:8px;padding:12px;background:#f1e9d8';
  document.body.appendChild(wrap);
  for (const locked of [false, true]) {
    for (const c of CHARACTERS) {
      const cv = document.createElement('canvas');
      cv.width = 200; cv.height = 240;
      cv.style.cssText = 'width:100%;height:auto;background:#f4eee0;border:1px solid rgba(0,0,0,.1);border-radius:6px';
      paintPortrait(cv, c.id, locked);
      wrap.appendChild(cv);
    }
  }
}

async function select(canvas: HTMLCanvasElement) {
  canvas.style.display = 'none';
  // a few companions already met (q-water → gardener, q-cat → cat, q-klotski → guan …)
  try {
    const done: Record<string, string> = { 'q-water': '2026-09-01', 'q-cat': '2026-09-02', 'q-klotski': '2026-09-03', 'q-feihua': '2026-09-04', 'q-mooncake': '2026-09-05' };
    localStorage.setItem('banmu.play.v1', JSON.stringify({ v: 1, character: 'gardener', counters: { fish: 3, water: 7 }, best: {}, flags: {}, done, daily: { day: '', picks: [], counts: {}, visited: [] } }));
  } catch { /* private mode */ }
  const [{ h, render }, { CharacterSelect }] = await Promise.all([import('preact'), import('../../views/walk/characters/Select')]);
  await import('../../styles/tokens.css');
  await import('../../styles/base.css');
  await import('../../ui/ui.css');
  const host = document.createElement('div');
  document.body.appendChild(host);
  render(h(CharacterSelect, { open: true, onClose: () => {} }), host);
  await new Promise((r) => setTimeout(r, 2500));
}
