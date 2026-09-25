// 家园 · the homestead on its ground: the lawn, the fence and gate (./base.ts), and everything the
// owner has placed (app/home.ts items), baked per thing (./brush.ts) and merged into a handful of
// meshes by material (./mats.ts) — a full plot stays at about twenty draws. It reacts to the home
// signal: only the things that changed are baked again, then the arrays are merged (next frame, so
// a burst of changes costs one rebuild). Things are solid (colliders), floors are walkable (decks),
// and some can be used: benches, the pavilion and the stone table (sit, play), the swing (ride),
// the well, the vegetable plot (water, harvest), plaques and couplets (write on them).
import type * as T from 'three';
import { effect } from '@preact/signals';
import type { WorldCtx } from '../../../types';
import { home, placeItem, type HomeItem } from '../../../../../app/home';
import { flag, play } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { diffDays } from '../../../../../core/date';
import { hashString } from '../../../../../core/rng';
import { registerDeck, segmentDeck } from '../../../regions/water-decks';
import { NIGHT_SHADE } from '../../../regions/water-kit';
import { reducedMotion } from '../../kit';
import { GRID, KIND, PLOT_X0, PLOT_Z0, STARTER, cellsOf, coupletLines, footprint, growStage, itemPose, itemText, type HomeKind } from '../catalog';
import { HOME_PLOT } from '../../../map';
import { BUCKETS, bake, mergeChunks, mergeLines, type Baked, type Chunk, type LineChunk, type Three, type WorldLabel } from './brush';
import { homeMats, type HomeMats } from './mats';
import { TextAtlas, type Board } from './atlas';
import { buildBase, lawnGeometry, paintLawn } from './base';
import { HomeUses } from './use';

interface Entry {
  uid: string;
  sig: string;
  slot: number;
  item: HomeItem;
  baked: Baked;
  offs: (() => void)[];
}

const stages = new WeakMap<WorldCtx, HomeStage>();
/** The homestead stage of a world (the build mode and the homestead's life find it here). */
export const stageOf = (ctx: WorldCtx): HomeStage | undefined => stages.get(ctx);

export class HomeStage {
  readonly THREE: Three;
  readonly group: T.Group;
  readonly mats: HomeMats;
  readonly grad: T.DataTexture;
  readonly atlas: TextAtlas;
  readonly uses: HomeUses;
  /** Mean ground height of the plot. */
  plotY = 0;
  private entries = new Map<string, Entry>();
  private slots = new Map<string, number>();
  private nextSlot = 1;
  private hidden: string | null = null;
  private forceMerge = true;
  private lastName = '';
  private dirty = true;
  private offs: (() => void)[] = [];
  private wetOffs: (() => void)[] = [];
  private meshes: { solid: T.Mesh; soft: T.Mesh; softHull: T.Mesh; glow: T.Mesh; glowHull: T.Mesh; water: T.Mesh; lines: T.LineSegments; text: T.Mesh; halos: T.Points; smoke: T.Points };
  private base: Baked | null = null;
  private baseObjs: T.Object3D[] = [];
  private lawn: T.Mesh | null = null;
  private owned = new Set<{ dispose(): void }>();
  private smokeMat: T.ShaderMaterial;
  private haloMat: T.PointsMaterial;
  night = 0;
  private first = true;
  private nightC: T.Color;
  private time = 0;
  private reduced = reducedMotion();
  private listeners = new Set<() => void>();
  disposed = false;

  constructor(readonly ctx: WorldCtx) {
    const THREE = (this.THREE = ctx.THREE);
    this.group = ctx.regionGroup('home');
    const data = new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
    this.grad = this.own(new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat));
    this.grad.minFilter = this.grad.magFilter = THREE.NearestFilter;
    this.grad.generateMipmaps = false;
    this.grad.needsUpdate = true;
    this.mats = homeMats(THREE, this.grad, NIGHT_SHADE);
    this.nightC = new THREE.Color(NIGHT_SHADE);
    this.atlas = new TextAtlas(THREE);
    this.mats.text.map = this.atlas.texture;
    this.mats.text.needsUpdate = true;
    const empty = () => new THREE.BufferGeometry();
    const mk = <O extends T.Object3D>(o: O, name: string): O => { o.name = name; o.frustumCulled = false; this.group.add(o); return o; };
    this.haloMat = new THREE.PointsMaterial({ size: 1.5, map: this.own(glowTexture(THREE)), color: '#ffb86b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    this.smokeMat = smokeMaterial(THREE);
    this.meshes = {
      solid: mk(new THREE.Mesh(empty(), this.mats.solid), 'home:solid'),
      soft: mk(new THREE.Mesh(empty(), this.mats.soft), 'home:soft'),
      softHull: mk(new THREE.Mesh(empty(), this.mats.hull), 'home:soft-ink'),
      glow: mk(new THREE.Mesh(empty(), this.mats.glow), 'home:glow'),
      glowHull: mk(new THREE.Mesh(empty(), this.mats.hull), 'home:glow-ink'),
      water: mk(new THREE.Mesh(empty(), this.mats.water), 'home:water'),
      lines: mk(new THREE.LineSegments(empty(), this.mats.lines), 'home:ink'),
      text: mk(new THREE.Mesh(empty(), this.mats.text), 'home:boards'),
      halos: mk(new THREE.Points(empty(), this.haloMat), 'home:halos'),
      smoke: mk(new THREE.Points(empty(), this.smokeMat), 'home:smoke'),
    };
    this.meshes.softHull.raycast = () => {};
    this.meshes.glowHull.raycast = () => {};
    this.meshes.halos.renderOrder = 3;
    this.meshes.smoke.renderOrder = 3;
    this.uses = new HomeUses(this);
    stages.set(ctx, this);
  }

  private own<D extends { dispose(): void }>(d: D): D { this.owned.add(d); return d; }

  /** Lay the ground, the fence and the gate; place the starter things; follow the home signal. */
  build(): void {
    const { ctx, THREE } = this;
    const gy = (x: number, z: number) => ctx.groundY(x, z);
    let sum = 0, n = 0;
    for (let a = 1; a < GRID; a += 2) for (let b = 1; b < GRID; b += 2) { sum += gy(PLOT_X0 + a + 0.5, PLOT_Z0 + b + 0.5); n++; }
    this.plotY = sum / n;

    // the lawn
    const lawnTex = this.own(new THREE.CanvasTexture(paintLawn()));
    lawnTex.colorSpace = THREE.SRGBColorSpace;
    lawnTex.anisotropy = 4;
    const lawnMat = this.own(new THREE.MeshToonMaterial({ color: '#ffffff', map: lawnTex, gradientMap: this.grad, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    const lawnGeo = this.own(lawnGeometry(THREE, gy));
    this.lawn = new THREE.Mesh(lawnGeo, lawnMat);
    this.lawn.name = 'home:lawn';
    this.group.add(this.lawn);

    // the bones: fence, gate, slabs, the old tree (static meshes, built once)
    this.base = bake(THREE, { build: (b) => buildBase(b, gy) }, { text: '', stage: 0 }, 11, { x: 0, y: 0, z: 0, heading: 0 }, 0);
    const bb = this.base.buckets;
    const addStatic = (ch: Chunk | null, mat: T.Material, name: string, hull = false) => {
      if (!ch) return;
      const g = this.own(mergeChunks(THREE, [ch])!);
      const m = new THREE.Mesh(g, mat);
      m.name = name;
      this.group.add(m);
      this.baseObjs.push(m);
      if (hull) { const h = new THREE.Mesh(g, this.mats.hull); h.name = name + '-ink'; h.raycast = () => {}; this.group.add(h); this.baseObjs.push(h); }
    };
    addStatic(bb.solid, this.mats.solid, 'home:fence');
    addStatic(bb.soft, this.mats.soft, 'home:verge', true);
    addStatic(bb.glow, this.mats.glow, 'home:gate-lamps', true);
    if (this.base.lines) {
      const l = new THREE.LineSegments(this.own(mergeLines(THREE, [this.base.lines])!), this.mats.lines);
      l.name = 'home:fence-ink';
      this.group.add(l);
      this.baseObjs.push(l);
    }
    for (const c of this.base.colliders) this.offs.push(ctx.addCollider(c));
    // the gate-house is a landmark: seen from afar
    for (const o of this.baseObjs) if (o.name === 'home:fence') o.userData.landmark = true;

    // the first visit: a cottage and a vegetable plot already stand
    if (!play.value.flags['home:starter']) {
      if (!home.value.items.length) {
        for (const [kind, i, j, rot] of STARTER) {
          const uid = placeItem(kind, i, j, rot);
          if (uid && KIND[kind]?.use === 'farm') this.uses.sow(uid, -1);
        }
      }
      flag('home:starter');
    }

    // only the things and the name matter here (pets and residents change often: not our business)
    let lastItems: unknown = null, lastName = '', lastDay = '';
    this.offs.push(effect(() => {
      const h = home.value, d = today.value;
      if (h.items === lastItems && h.name === lastName && d === lastDay) return;
      lastItems = h.items; lastName = h.name; lastDay = d;
      this.dirty = true;
    }));
    this.offs.push(ctx.onFrame((dt, t) => this.frame(dt, t)));
    const onBloom = (e: Event) => this.uses.bloom((e as CustomEvent<{ x: number; z: number; r?: number }>).detail);
    window.addEventListener('banmu:bloom', onBloom);
    this.offs.push(() => window.removeEventListener('banmu:bloom', onBloom));
    this.rebuild();
  }

  /** Called after each rebuild (the build mode refreshes its picking). */
  onRebuild(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /** Leave one thing out of the plot (it is being moved in the build mode); null puts it back. */
  hide(uid: string | null): void {
    if (this.hidden === uid) return;
    this.hidden = uid;
    this.dirty = true;
    this.forceMerge = true;
  }

  /** Rebuild now (not next frame). */
  flush(): void {
    if (this.dirty) this.rebuild();
  }

  /** The baked thing (its world bounds, seats…) or undefined. */
  entry(uid: string): { item: HomeItem; baked: Baked; slot: number } | undefined {
    return this.entries.get(uid);
  }
  allEntries(): IterableIterator<{ uid: string; item: HomeItem; baked: Baked; slot: number }> {
    return this.entries.values();
  }

  /** Ground height under a thing's centre (its base). */
  baseY(it: Pick<HomeItem, 'kind' | 'i' | 'j' | 'rot'>): number {
    const p = itemPose(it);
    // the lowest of centre and corners, so nothing floats on a slope (plinths reach down)
    const f = footprint(KIND[it.kind] ?? { w: 1, d: 1 }, it.rot);
    let y = this.ctx.groundY(p.x, p.z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) y = Math.min(y, this.ctx.groundY(p.x + (dx * f.w) / 2.4, p.z + (dz * f.d) / 2.4));
    return y;
  }

  /** Bake a kind for show (the ghost, a thumbnail) at a pose. */
  bakeShow(kind: HomeKind, text: string, stage: number, pose: { x: number; y: number; z: number; heading: number }, edges = false): Baked {
    return bake(this.THREE, kind, { text: text || kind.defaultText || '', stage }, hashString(kind.id + ':show'), pose, 0, edges);
  }

  private slotOf(uid: string): number {
    let s = this.slots.get(uid);
    if (s === undefined) { s = this.nextSlot++; this.slots.set(uid, s); }
    return s;
  }

  private sig(it: HomeItem, stage: number, day: string): string {
    const g = it.grow;
    return `${it.kind}|${it.i}|${it.j}|${it.rot}|${itemText(it)}|${stage}|${g?.wet === day ? 1 : 0}${g?.reaped === day ? 1 : 0}`;
  }

  private rebuild(): void {
    this.dirty = false;
    const { ctx, THREE } = this;
    const day = today.value;
    const items = home.value.items;
    const seen = new Set<string>();
    let changed = this.forceMerge;
    this.forceMerge = false;
    for (const it of items) {
      const kind = KIND[it.kind];
      if (!kind || it.uid === this.hidden) continue;
      seen.add(it.uid);
      const stage = kind.use === 'farm' ? growStage(it, day, diffDays) : 0;
      const sig = this.sig(it, stage, day);
      const old = this.entries.get(it.uid);
      if (old && old.sig === sig) { old.item = it; continue; }
      changed = true;
      if (old) this.release(old);
      const p = itemPose(it);
      const slot = this.slotOf(it.uid);
      const baked = bake(THREE, kind, { text: itemText(it), stage }, hashString(it.uid), { x: p.x, y: this.baseY(it), z: p.z, heading: p.heading }, slot);
      const e: Entry = { uid: it.uid, sig, slot, item: it, baked, offs: [] };
      for (const c of baked.colliders) e.offs.push(ctx.addCollider(c));
      baked.floors.forEach((f, k) => e.offs.push(registerDeck(segmentDeck(`home:${it.uid}:${k}`, f.a, f.b, f.hw, f.y))));
      const act = this.uses.interactable(e);
      if (act) e.offs.push(ctx.addInteractable(act));
      this.entries.set(it.uid, e);
    }
    for (const [uid, e] of this.entries) if (!seen.has(uid)) { this.release(e); this.entries.delete(uid); changed = true; }
    this.wet(items);
    const name = home.value.name || '半亩山居';
    if (name !== this.lastName) { this.lastName = name; changed = true; }
    if (!changed) return;

    // merge
    const list = [...this.entries.values()];
    const chunks = (b: (typeof BUCKETS)[number]) => list.map((e) => e.baked.buckets[b]).filter((c): c is Chunk => !!c);
    const swap = (o: T.Mesh | T.LineSegments | T.Points, g: T.BufferGeometry | null) => {
      o.geometry.dispose();
      o.geometry = g ?? new THREE.BufferGeometry();
      o.visible = !!g;
    };
    const M = this.meshes;
    swap(M.solid, mergeChunks(THREE, chunks('solid')));
    const soft = mergeChunks(THREE, chunks('soft'));
    swap(M.soft, soft);
    M.softHull.geometry = M.soft.geometry;
    M.softHull.visible = !!soft;
    const glow = mergeChunks(THREE, chunks('glow'));
    swap(M.glow, glow);
    M.glowHull.geometry = M.glow.geometry;
    M.glowHull.visible = !!glow;
    swap(M.water, mergeChunks(THREE, chunks('water')));
    swap(M.lines, mergeLines(THREE, list.map((e) => e.baked.lines).filter((c): c is LineChunk => !!c)));

    // boards: the gate's name, then each thing's words
    const labels: { l: WorldLabel; text: string }[] = [];
    for (const l of this.base?.labels ?? []) labels.push({ l, text: name });
    for (const e of list.sort((a, b) => a.slot - b.slot)) {
      for (const l of e.baked.labels) {
        const t = itemText(e.item);
        const [r, lft] = coupletLines(t);
        labels.push({ l, text: l.kind === 'couplet-r' ? r : l.kind === 'couplet-l' ? lft : t });
      }
    }
    this.boards(labels);

    // night halos and chimney smoke
    const lights = [...(this.base?.lights ?? []), ...list.flatMap((e) => e.baked.lights)];
    const hp = new Float32Array(lights.length * 3);
    lights.forEach((l, k) => hp.set([l[0], l[1], l[2]], k * 3));
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    swap(M.halos, lights.length ? hg : null);
    const smokes = list.flatMap((e) => e.baked.smokes);
    const PUFFS = 7;
    const sp = new Float32Array(smokes.length * PUFFS * 3), ss = new Float32Array(smokes.length * PUFFS);
    smokes.forEach((s, k) => { for (let q = 0; q < PUFFS; q++) { sp.set(s, (k * PUFFS + q) * 3); ss[k * PUFFS + q] = q / PUFFS + k * 0.137; } });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    swap(M.smoke, smokes.length ? sg : null);
    for (const fn of this.listeners) { try { fn(); } catch (err) { console.warn('[home] rebuild listener', err); } }
  }

  private boardsKey = '';
  private boardList: { l: WorldLabel; text: string }[] = [];
  private boards(labels: { l: WorldLabel; text: string }[]): void {
    this.boardList = labels;
    const key = labels.map((b) => b.text + b.l.c.flat().map((v) => v.toFixed(2)).join(',')).join('|');
    if (key === this.boardsKey && this.meshes.text.visible) return;
    this.boardsKey = key;
    this.paintBoards();
  }
  private paintBoards(): void {
    const { THREE } = this;
    const labels = this.boardList;
    const uv = this.atlas.paint(labels.map((b): Board => ({ kind: b.l.kind, text: b.text })), () => { if (!this.disposed) this.paintBoards(); });
    const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
    labels.forEach(({ l }, k) => {
      const r = uv[k];
      if (!r) return;
      const base = pos.length / 3;
      for (const c of l.c) pos.push(c[0], c[1], c[2]);
      for (let q = 0; q < 4; q++) nor.push(l.n[0], l.n[1], l.n[2]);
      uvs.push(r[0], r[1], r[2], r[1], r[2], r[3], r[0], r[3]);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    this.meshes.text.geometry.dispose();
    this.meshes.text.geometry = g;
    this.meshes.text.visible = pos.length > 0;
  }

  /** Water is not for walking: the pond cells not under a bridge are solid. */
  private wet(items: HomeItem[]): void {
    for (const f of this.wetOffs.splice(0)) f();
    const dry = new Set<number>();
    for (const it of items) {
      const k = KIND[it.kind];
      if (!k?.over || it.uid === this.hidden) continue;
      for (const [a, b] of cellsOf(k, it.i, it.j, it.rot)) dry.add(a * 1000 + b);
    }
    for (const it of items) {
      const k = KIND[it.kind];
      if (!k?.wet || it.uid === this.hidden) continue;
      for (const [a, b] of cellsOf(k, it.i, it.j, it.rot)) {
        if (dry.has(a * 1000 + b)) continue;
        this.wetOffs.push(this.ctx.addCollider({ x: PLOT_X0 + a + 0.5, z: PLOT_Z0 + b + 0.5, r: 0.6, h: 0.3 }));
      }
    }
  }

  private release(e: Entry): void {
    for (const f of e.offs.splice(0)) { try { f(); } catch { /* gone */ } }
    this.uses.released(e.uid);
  }

  private frame(dt: number, t: number): void {
    if (this.dirty) this.rebuild();
    this.time = this.reduced ? 0 : t;
    this.mats.U.uTime.value = this.time;
    const want = this.ctx.sky.isNight() ? 1 : 0;
    const n = this.first ? want : this.night + (want - this.night) * (1 - Math.exp(-1.6 * Math.min(dt, 0.1)));
    if (Math.abs(n - this.night) > 1e-4 || this.first) {
      this.first = false;
      this.night = n;
      this.mats.setNight(n);
      (this.lawn?.material as T.MeshToonMaterial | undefined)?.color.set('#ffffff').lerp(this.nightC, n);
      this.haloMat.opacity = 0.85 * n;
      this.meshes.halos.visible = n > 0.02 && this.meshes.halos.geometry.attributes.position !== undefined;
      this.smokeMat.uniforms.uNight.value = n;
    }
    this.smokeMat.uniforms.uTime.value = this.reduced ? 3 : t;
    const cam = this.ctx.camera, r = this.ctx.renderer;
    this.smokeMat.uniforms.uPx.value = (r.domElement.height || 800) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    this.uses.frame(dt, t);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    stages.delete(this.ctx);
    this.uses.dispose();
    for (const e of this.entries.values()) this.release(e);
    this.entries.clear();
    for (const f of this.wetOffs.splice(0)) f();
    for (const f of this.offs.splice(0).reverse()) { try { f(); } catch { /* gone */ } }
    for (const o of Object.values(this.meshes)) {
      o.removeFromParent();
      if (o !== this.meshes.softHull && o !== this.meshes.glowHull) o.geometry.dispose();
    }
    for (const o of this.baseObjs) o.removeFromParent();
    this.lawn?.removeFromParent();
    this.mats.dispose();
    this.atlas.dispose();
    this.smokeMat.dispose();
    this.haloMat.dispose();
    for (const d of this.owned) { try { d.dispose(); } catch { /* gone */ } }
    this.owned.clear();
    this.listeners.clear();
  }
}

/** The centre of the plot at ground level. */
export const PLOT_CENTRE = { x: HOME_PLOT.x, z: HOME_PLOT.z };

function glowTexture(THREE: Three): T.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.14)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chimney smoke: soft puffs that rise, drift and fade (one draw for every chimney). */
function smokeMaterial(THREE: Three): T.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 800 }, uNight: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uPx;
      attribute float aSeed;
      varying float vA;
      void main() {
        float life = fract(uTime * 0.09 + aSeed);
        vec3 p = position + vec3(life * 0.9 + sin(aSeed * 40.0 + uTime * 0.6) * 0.18 * life, life * 3.4, cos(aSeed * 23.0 + uTime * 0.4) * 0.25 * life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.35 + life * 1.5) * uPx / max(0.5, -mv.z);
        vA = (1.0 - life) * smoothstep(0.0, 0.15, life);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uNight;
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float d = length(q);
        float a = smoothstep(0.5, 0.12, d) * vA * mix(0.42, 0.22, uNight);
        vec3 c = mix(vec3(0.93, 0.9, 0.84), vec3(0.55, 0.55, 0.62), uNight);
        gl_FragColor = vec4(c, a);
      }`,
  });
}
