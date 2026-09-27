// 落花为证 · the case in the valley (story bible §4). While it is open the valley holds 子正 (the story
// sets the clock; FX11: petals frozen in the air, the knee-high mist): here are the altar as it was
// found, a gold glint on every clue not yet found and a 「察」 prompt at its place (FX15 when found),
// 柳婆's spare tray for the incense test, the courtyard's prints under the petals (brushed in the
// 拂花 overlay, or lifted by 道童's wind), the six witnesses' testimonies through the story's talks
// (「出示证物」 opens the 案卷 in pick mode), 小满 found in the hollow, the judgement when the elder
// calls everyone to the courtyard (FX16), the grade and its coins, then B6 (the story's). Afterwards,
// the letter-writer's bonus with 石瞽. The companions' tools are case-tools.ts, lent through the 技.
//
// Every step saves itself in play flags (case.ts), so a world rebuilt, a reload or a way out mid-case
// comes back exactly where it was; the parked case (「且待天明」) resumes the same way.
import type * as T from 'three';
import type { Interactable, WorldCtx } from '../../types';
import { CHARACTER, type CharacterId } from '../../../../data/characters';
import { celebrations, earnFrom, flag, markDay, play, record } from '../../../../app/play';
import { feature, glowTexture, inked, reducedMotion } from '../kit';
import { merge, part } from '../geo';
import { Stagehand } from '../encounters/stage';
import { skillLoan } from '../skills';
import { brush as brushSound } from '../skills/sound';
import { taoyuan, type TaoyuanWorld } from './world';
import { engine } from './engine';
import { ANCHORS, CAVE, KNOLL, L, SHRINE, W, Y_T, standAt, streamAt, type AnchorName } from './places';
import { taoyuanHooks, type CaseHooks, type VillagerHandle, type VillagerKey } from './hooks';
import { VILLAGERS, metFlag, nameOf } from './folk';
import * as K from './case';
import { caseTools, type ToolWorld } from './case-tools';
import { caseHere, caseSheet, closeCaseSheet, openCaseSheet, pickEvidence } from '../../case/state';
import { brushCourtyard, type BrushSession } from '../../case/brush';

type XYZ = { x: number; y: number; z: number };
type Flags = Readonly<Record<string, true | undefined>>;
const flags = (): Flags => play.peek().flags;
const has = (k: string) => !!play.peek().flags[k];
const count = (k: string) => play.peek().counters[k] ?? 0;

/** A valley-local point, on what one stands on there (world). */
const at = (x: number, z: number, up = 0): XYZ => { const w = W(x, z); return { x: w.x, y: Y_T + standAt(x, z) + up, z: w.z }; };

/** Who speaks a line: a villager, the walker's companion, the bluebird, or nobody. */
type Speaker = VillagerKey | 'me' | 'bird' | 'narr';

class CaseStage extends Stagehand {
  constructor(ctx: WorldCtx, parent: T.Object3D) {
    super(ctx, parent, 'taoyuan:case', 'taoyuan-case', 'taoyuan-case');
  }
  hold(on: boolean): void {
    try { this.ctx.player.freeze(on); } catch { /* the world went */ }
  }
}

// where the walker stands, and everyone else, for the judgement (valley-local; the hall is north)
const COURT_WALKER = { x: 1.45, z: -19.3 };
const COURT_RING: [VillagerKey, number, number][] = [
  ['qin', 0.35, -21.75], ['sang', -1.45, -21.35], ['taoye', -2.65, -20.7], ['ruan', -3.2, -19.6], ['liupo', -2.75, -18.35],
  ['gegu', -1.25, -17.85], ['duer', 2.6, -18.3], ['ashu', 3.25, -19.3], ['guiniang', 3.0, -20.45], ['xiaoman', 2.2, -21.05], ['lusan', 1.35, -21.5],
];
/** 三娘's way home past 石瞽's porch (the wine on the lane: 大橘's nose, 嫦娥's moonlight). */
export const SANG_TRAIL: [number, number][] = [[-4.6, -21.2], [-7.2, -18.8], [-10.4, -15.6], [-12.8, -12.4], [-15.2, -7.2], [-17.6, -1.6], [-19.8, 2.2], [-22, 4.6], [-23.6, 7.6]];
/** Where 小满 goes once found: beside his mother at the square. */
const XIAOMAN_HOME = { x: -1.5, z: 4.1, face: { x: 0, z: 6 } };

interface SpareTray { light(on: boolean): void; splash(): void; remove(): void }
/** 柳婆's spare incense tray on the altar's right end: the powder, the pressed groove; lit, then splashed. */
function spareTray(TH: WorldCtx['THREE'], ctx: WorldCtx, parent: T.Object3D, splashed: boolean): SpareTray {
  const a = ANCHORS.spareTray;
  const S = 0.22;
  const tray = inked(ctx, merge(TH, [part(TH, new TH.BoxGeometry(S, 0.035, S), '#6b5a3c', { p: [0, 0.0175, 0] })]), { width: 0 });
  tray.position.set(a.x, a.y - 0.03, a.z);
  parent.add(tray);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const paint = (wet: boolean) => {
    g.fillStyle = '#d3cbbb';
    g.fillRect(0, 0, 128, 128);
    // the groove: a squared spiral pressed into the powder
    const path: [number, number][] = [[18, 110], [110, 110], [110, 18], [18, 18], [18, 88], [88, 88], [88, 40], [40, 40], [40, 66], [66, 66]];
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = '#6a5641';
    g.lineWidth = 7;
    g.beginPath();
    path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
    if (wet) {
      // a pinch burnt to ash at the start, and wine spattered over both sides of it
      g.strokeStyle = '#e6e2da';
      g.beginPath(); g.moveTo(18, 110); g.lineTo(52, 110); g.stroke();
      let sd = 7;
      const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      g.fillStyle = 'rgba(58, 28, 24, 0.75)';
      for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(22 + rnd() * 60, 96 + rnd() * 26, 2 + rnd() * 5, 1.5 + rnd() * 3, rnd() * 3, 0, Math.PI * 2); g.fill(); }
    }
  };
  paint(splashed);
  const tex = new TH.CanvasTexture(c);
  tex.colorSpace = TH.SRGBColorSpace;
  const bed = new TH.Mesh(new TH.PlaneGeometry(S * 0.9, S * 0.9).rotateX(-Math.PI / 2), new TH.MeshLambertMaterial({ map: tex }));
  bed.position.set(a.x, a.y + 0.006, a.z);
  parent.add(bed);
  // the lit pinch: a small warm glow at the groove's start (on the walker's side of the tray)
  const gtex = glowTexture(TH, 64, 0.2);
  const ember = new TH.Sprite(new TH.SpriteMaterial({ map: gtex, color: '#ff9a4a', transparent: true, opacity: 0.9, depthWrite: false, blending: TH.AdditiveBlending, fog: false }));
  ember.scale.setScalar(0.14);
  ember.position.set(a.x - S * 0.33, a.y + 0.02, a.z + S * 0.37);
  ember.visible = false;
  parent.add(ember);
  return {
    light(on) {
      ember.visible = on;
      if (on) { paint(false); tex.needsUpdate = true; }
    },
    splash() { ember.visible = false; paint(true); tex.needsUpdate = true; },
    remove() {
      for (const o of [tray, bed, ember]) o.removeFromParent();
      tray.geometry.dispose();
      bed.geometry.dispose();
      (bed.material as T.Material).dispose();
      (ember.material as T.Material).dispose();
      tex.dispose();
      gtex.dispose();
    },
  };
}

/** The quest book's celebration card is up (it pauses nothing: the story waits for it). */
function celebrationUp(): boolean {
  try { return !!document.querySelector('.cel-veil'); } catch { return false; }
}

/** The soles in the courtyard's atlas, side by side (toes toward the bottom: +z, the way they walk). */
const SOLE: K.Stamp['kind'][] = ['boot', 'clog', 'patched', 'sandal', 'cane'];
function soleAtlas(TH: WorldCtx['THREE']): T.CanvasTexture {
  const W0 = 64, H0 = 128;
  const c = document.createElement('canvas');
  c.width = W0 * 5;
  c.height = H0;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  const oval = (cx: number, cy: number, rx: number, ry: number) => { g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  SOLE.forEach((k, i) => {
    const x = i * W0 + W0 / 2;
    g.save();
    if (k === 'boot') { oval(x, 82, 20, 36); oval(x, 30, 15, 20); }
    else if (k === 'clog') { g.fillRect(x - 22, 78, 44, 22); g.fillRect(x - 22, 24, 44, 22); }
    else if (k === 'patched') { g.fillRect(x - 22, 78, 44, 22); oval(x, 34, 22, 12); }
    else if (k === 'sandal') {
      oval(x, 64, 21, 52);
      g.globalCompositeOperation = 'destination-out';
      for (let y = 22; y < 110; y += 11) g.fillRect(x - 24, y, 48, 3);
    } else oval(x, 64, 18, 18);
    g.restore();
  });
  const tex = new TH.CanvasTexture(c);
  tex.colorSpace = TH.SRGBColorSpace;
  return tex;
}

export const taoyuanCase = feature('taoyuan-case', (bag, ctx) => {
  const found = taoyuan(ctx);
  if (!found) return;
  const tv: TaoyuanWorld = found;
  const eng = engine(ctx);
  const st = new CaseStage(ctx, ctx.regionGroup('taoyuan'));
  bag.onDispose(() => st.dispose());
  const still = reducedMotion();
  const TH = ctx.THREE;

  /** An examination, a talk of the case's or the judgement is under way. */
  let busy = false;
  let judging = false;
  /** The brushing overlay, while open. */
  let brushing: BrushSession | null = null;

  // ───────────── lines

  const nameFor = (by: Speaker): K.Line => {
    if (by === 'narr') return { zh: '', en: '' };
    if (by === 'bird') return { zh: '青鸟', en: 'Bluebird' };
    if (by === 'me') { const c = CHARACTER[ctx.player.character]; return { zh: c?.zh ?? '', en: c?.en ?? '' }; }
    return nameOf(by, has(metFlag(by)));
  };
  /** One line; resolves with the choice (−1: closed, or the world went). */
  async function say(by: Speaker, l: K.Line, choices?: K.Line[]): Promise<number> {
    if (!st.alive) return -1;
    const n = nameFor(by);
    return ctx.hud.say({ nameZh: n.zh, nameEn: n.en, zh: l.zh, en: l.en, choices });
  }
  /** Lines in a row (a stage direction in （…） is nobody's). */
  async function lines(by: Speaker, ls: readonly K.Line[]): Promise<void> {
    for (const l of ls) { if (!st.alive) return; await say(l.zh.startsWith('（') ? 'narr' : by, l); }
  }
  const wait = (ms: number) => st.wait(ms);

  // ───────────── discoveries

  /** How much of the case is in hand (clues, testimonies heard and broken, 小满): a change resets the idle bird. */
  const discoveries = () => {
    const f = flags();
    return K.CASE_FLAG_LIST.filter((k) => k.startsWith('case:hz:c:') || k.startsWith('case:hz:h:') || k.startsWith('case:hz:t:')).filter((k) => f[k]).length + (f[K.CASE_FLAGS.found] ? 1 : 0);
  };
  let lastCount = discoveries();
  let idle = 0;

  /** A clue found: its flag, then FX15 (the ink blot, its name brushed, the red 「证」). */
  async function discover(k: K.ClueKey): Promise<void> {
    if (has(K.clueFlag(k))) return;
    flag(K.clueFlag(k));
    scene?.update();
    try { await tv.fx?.stamp(K.CLUE[k].name, { seal: '证' }); } catch { /* a nicety */ }
  }

  // ───────────── the altar as it was found, the prints, the prompts and glints

  let scene: ReturnType<typeof buildScene> | null = null;
  const wantScene = () => {
    const f = flags();
    return tv.built && (K.caseIsOpen(f) || (!!f[K.CASE_FLAGS.solved] && !f['ty:b6']));
  };

  function buildScene() {
    const group = new TH.Group();
    group.name = 'ty:case';
    ctx.regionGroup('taoyuan').add(group);
    const geos: T.BufferGeometry[] = [];
    const mats: T.Material[] = [];
    const offs: (() => void)[] = [];
    const fx = tv.fx!;

    // the shards before the altar (the cap set aside whole), the lacquer box open, its clay peeled
    const shards = (() => {
      const P: T.BufferGeometry[] = [];
      for (let i = 0; i < 8; i++) {
        const a = i * 0.83;
        P.push(part(TH, new TH.SphereGeometry(0.12, 6, 4, 0, 1.4, 0, 1.2), '#5e4330', { p: [Math.cos(a) * (0.18 + (i % 3) * 0.12), 0.03, Math.sin(a) * (0.14 + (i % 2) * 0.1)], r: [Math.PI / 2 + (i % 3) * 0.4, a, 0] }));
      }
      // the mud cap, lifted off whole and set aside
      P.push(part(TH, new TH.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#9b7a58', { p: [0.62, 0.0, 0.24], s: [1, 0.7, 1] }));
      // the stain: soaked into the joints, only its rim still damp
      P.push(part(TH, new TH.CircleGeometry(0.66, 20), '#3b2a22', { p: [0.05, 0.012, 0.02], r: [-Math.PI / 2, 0, 0] }));
      P.push(part(TH, new TH.RingGeometry(0.6, 0.7, 24), '#241812', { p: [0.05, 0.014, 0.02], r: [-Math.PI / 2, 0, 0] }));
      return merge(TH, P);
    })();
    geos.push(shards);
    const sh = inked(ctx, shards, { width: 0 });
    const s0 = ANCHORS.shards;
    sh.position.set(s0.x, s0.y, s0.z);
    group.add(sh);
    // (the altar anchors stand at the middle of its 10 cm top slab: what lies on it sits 5 cm higher)
    const TOP = 0.05;
    const a0 = ANCHORS.altar;
    const boxGeo = merge(TH, [
      part(TH, new TH.BoxGeometry(0.34, 0.14, 0.24), '#2a1a16', { p: [0, 0.07, 0] }),
      // the lid, set down before the box (clear of the incense seal to its right and the cup ring to its left)
      part(TH, new TH.BoxGeometry(0.34, 0.04, 0.24), '#7a1f1a', { p: [-0.05, 0.02, 0.28], r: [0, 0.25, 0] }),
      // the clay, peeled off in one neat piece, the elder's seal unbroken (beside the box's left end)
      part(TH, new TH.CylinderGeometry(0.05, 0.05, 0.02, 10), '#a88a64', { p: [-0.24, 0.01, -0.02] }),
    ]);
    geos.push(boxGeo);
    const box = inked(ctx, boxGeo, { width: 0 });
    box.position.set(a0.x - 0.25, a0.y + TOP, a0.z - 0.1);
    group.add(box);
    // the cup ring on the altar's left corner (altarLeft is 2 cm over the slab's middle: 3.5 cm more to its top)
    const ringGeo = merge(TH, [part(TH, new TH.RingGeometry(0.04, 0.06, 20), '#8a5a2a', { r: [-Math.PI / 2, 0, 0] })]);
    geos.push(ringGeo);
    const cup = inked(ctx, ringGeo, { width: 0 });
    const al = ANCHORS.altarLeft;
    cup.position.set(al.x, al.y + TOP - 0.02 + 0.005, al.z);
    group.add(cup);

    // the incense seal (FX10): burnt from the 戌 pin to 亥正 and dead there; soaked from 亥正 on
    const incense = fx.incenseSeal();
    incense.wet(incense.pins[4]);
    void incense.setProgress(incense.pins[4]);
    incense.ember(false);
    incense.smoke(false);
    offs.push(() => incense.remove());
    // 柳婆's spare tray (试香): a little tray of powder with its groove pressed, unlit (two draws, and a spark while tried)
    const spare = spareTray(TH, ctx, group, has(K.addFlag('xiang')));
    offs.push(() => spare.remove());

    // ── the prints under the petals: one draw for them all; each set as faint as its petals are deep
    const stamps = K.PRINTS.map((p) => ({ p, s: K.printStamps(p) }));
    const n = stamps.reduce((a, b) => a + b.s.length, 0);
    const blot = soleAtlas(TH);
    const pmat = new TH.ShaderMaterial({
      uniforms: { map: { value: blot }, color: { value: new TH.Color('#231a17') } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying float vA;
        // instanceColor: r the ink's strength, g which sole (of five, side by side in the atlas)
        void main() { vUv = vec2((uv.x + floor(instanceColor.g * 5.0 + 0.5)) / 5.0, uv.y); vA = instanceColor.r; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; uniform vec3 color; varying vec2 vUv; varying float vA;
        void main() { float a = texture2D(map, vUv).a * vA; if (a < 0.01) discard; gl_FragColor = vec4(color, a); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: TH.DoubleSide,
    });
    mats.push(pmat);
    const pgeo = new TH.PlaneGeometry(1, 1);
    pgeo.rotateX(-Math.PI / 2);
    geos.push(pgeo);
    const prints = new TH.InstancedMesh(pgeo, pmat, n);
    prints.name = 'ty:case:prints';
    const m4 = new TH.Matrix4(), q = new TH.Quaternion(), e = new TH.Euler(), v = new TH.Vector3(), sc = new TH.Vector3();
    const setOf: number[] = [];
    const glowPts: number[] = [];
    let i = 0;
    stamps.forEach(({ s }, si) => {
      for (const st of s) {
        const w = at(st.x, st.z, 0.018);
        e.set(0, st.a, 0);
        q.setFromEuler(e);
        const kw = st.kind === 'cane' ? 0.08 : 0.13, kl = st.kind === 'cane' ? 0.08 : st.kind === 'clog' || st.kind === 'patched' ? 0.25 : 0.29;
        m4.compose(v.set(w.x, w.y, w.z), q, sc.set(st.left ? -kw : kw, 1, kl));
        prints.setMatrixAt(i, m4);
        prints.setColorAt(i, new TH.Color(0, 0, 0));
        setOf.push(SOLE.indexOf(st.kind));
        void si;
        glowPts.push(w.x, w.y + 0.05, w.z);
        i++;
      }
    });
    prints.instanceMatrix.needsUpdate = true;
    group.add(prints);
    // 道童's wind: every print glows, the older the brighter (one draw, fading out)
    const gg = new TH.BufferGeometry();
    gg.setAttribute('position', new TH.Float32BufferAttribute(glowPts, 3));
    const gcol = new Float32Array(n * 3);
    let gi = 0;
    stamps.forEach(({ p, s }) => { const k = 0.25 + (p.cover / 5.5) * 0.75; for (let j = 0; j < s.length; j++) { gcol[gi++] = 1.0 * k; gcol[gi++] = 0.7 * k; gcol[gi++] = 0.34 * k; } });
    gg.setAttribute('color', new TH.Float32BufferAttribute(gcol, 3));
    geos.push(gg);
    const gtex = glowTexture(TH, 64, 0.1);
    const gmat = new TH.PointsMaterial({ map: gtex, size: 0.55, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: TH.AdditiveBlending, fog: false });
    mats.push(gmat);
    const glow = new TH.Points(gg, gmat);
    glow.name = 'ty:case:print-glow';
    glow.visible = false;
    group.add(glow);
    let glowT = -1;
    offs.push(ctx.onFrame((dt) => {
      if (glowT < 0) return;
      glowT += dt;
      const k = glowT < 0.8 ? glowT / 0.8 : glowT < 6 ? 1 : Math.max(0, 1 - (glowT - 6) / 3);
      gmat.opacity = k * 0.95;
      glow.visible = k > 0.001;
      if (k <= 0 && glowT > 6) glowT = -1;
    }));
    const paintPrints = () => {
      const f = flags();
      const seen = !!f[K.clueFlag('zuji')];
      let j = 0;
      const c = new TH.Color();
      stamps.forEach(({ p, s }) => {
        // (under their petals: the deeper the fainter; brushed or blown bare: plain)
        const a = seen ? 0.62 : Math.max(0.05, 0.4 * (1 - p.cover / 6.4));
        for (let k = 0; k < s.length; k++) { prints.setColorAt(j, c.setRGB(a, setOf[j] / 5, 0)); j++; }
      });
      if (prints.instanceColor) prints.instanceColor.needsUpdate = true;
    };
    paintPrints();

    // ── prompts at the clues' places; a gold glint on each not yet found
    const prompts = new Map<string, { i: Interactable; off: (() => void) | null }>();
    const glints = new Map<string, () => void>();
    const addPrompt = (id: string, anchor: XYZ, radius: number, label: () => K.Line, action: () => K.Line, act: () => void) => {
      const i: Interactable = {
        id, position: new TH.Vector3(anchor.x, anchor.y, anchor.z), radius,
        labelZh: '', labelEn: '', actionZh: '', actionEn: '', act,
      };
      const relabel = () => { const l = label(), a = action(); Object.assign(i, { labelZh: l.zh, labelEn: l.en, actionZh: a.zh, actionEn: a.en }); };
      relabel();
      prompts.set(id, { i, off: null });
      return relabel;
    };
    const relabels: (() => void)[] = [];
    // (the altar's four things stand close together: each prompt where one stands before it, a step apart)
    const STAND: Partial<Record<AnchorName, [number, number, number]>> = {
      shards: [0, -24.15, 0.55], incense: [0.08, -24.85, 0.5], altarLeft: [-0.78, -24.85, 0.55], spareTray: [0.82, -24.9, 0.5], register: [1.9, -24.55, 0.75],
    };
    const promptAt = (pl: AnchorName): { p: XYZ; r: number } => {
      const s = STAND[pl];
      const a = ANCHORS[pl];
      if (s) { const w = W(s[0], s[1]); return { p: { x: w.x, y: a.y, z: w.z }, r: s[2] }; }
      return { p: a, r: pl === 'courtyard' ? 2.6 : pl === 'stele' ? 1.3 : 1.1 };
    };
    for (const c of K.CLUES) {
      if (!c.at) continue;
      const places: AnchorName[] = c.key === 'bu' ? ['register', 'stele'] : [c.at];
      for (const pl of places) {
        const { p: a, r } = promptAt(pl);
        relabels.push(addPrompt(`case:${c.key}:${pl}`, a, r,
          () => (has(K.clueFlag(c.key)) ? c.name : pl === 'stele' ? { zh: '殿侧 · 石碑', en: 'Beside the hall · the stele' } : c.where),
          () => (has(K.clueFlag(c.key)) ? K.WORLD.again : c.key === 'zuji' ? K.WORLD.brush : K.WORLD.examine),
          () => { void examine(c.key); }));
      }
    }
    relabels.push(addPrompt('case:test', promptAt('spareTray').p, promptAt('spareTray').r, () => K.WORLD.testLabel, () => K.WORLD.test, () => { void tryIncense(spare); }));
    relabels.push(addPrompt('case:window', at(SHRINE.window.x, SHRINE.window.z + 0.55, 0.45), 1.0, () => K.TOOLS.swordsman.label, () => K.WORLD.examine, () => { void backWindow(); }));

    function update(): void {
      const f = flags();
      const open = K.caseIsOpen(f);
      const inside = tv.isInside();
      for (const [id, p] of prompts) {
        const want = open && inside;
        if (want && !p.off) p.off = ctx.addInteractable(p.i);
        else if (!want && p.off) { p.off(); p.off = null; }
        void id;
      }
      for (const r of relabels) r();
      for (const c of K.CLUES) {
        if (!c.at) continue;
        const want = open && !f[K.clueFlag(c.key)];
        const g = glints.get(c.key);
        if (want && !g) { const a = ANCHORS[c.at]; glints.set(c.key, fx.glint({ x: a.x, y: a.y + (c.at === 'courtyard' ? 0.35 : 0.22), z: a.z })); }
        else if (!want && g) { g(); glints.delete(c.key); }
      }
      paintPrints();
    }

    return {
      update,
      /** The incense as it was at 戌正 (lit, smoking) for the replay; or as it was found. */
      rewind(on: boolean): void {
        incense.wet(on ? null : incense.pins[4]);
        void incense.setProgress(on ? incense.pins[1] : incense.pins[4]);
        incense.ember(on);
        incense.smoke(on);
      },
      /** 道童's wind: the prints shine, the older the brighter. */
      windGlow(): void { glowT = 0; glow.visible = true; },
      spare,
      dispose(): void {
        for (const p of prompts.values()) p.off?.();
        prompts.clear();
        for (const g of glints.values()) g();
        glints.clear();
        for (const o of offs.splice(0)) { try { o(); } catch { /* gone */ } }
        group.removeFromParent();
        for (const g of geos) g.dispose();
        for (const m of mats) m.dispose();
        blot.dispose();
        gtex.dispose();
      },
    };
  }
  bag.onDispose(() => { scene?.dispose(); scene = null; });

  // ───────────── examining a clue (察)

  /**
   * 察: the view leans in over the thing, from just in front of the walker's eyes (their own body stays
   * behind the lens, and in a tight hall no wall comes between); `high` looks down from above instead.
   */
  function lookAt(a: XYZ, o: { high?: boolean } = {}): void {
    const p = ctx.player.position;
    let dx = a.x - p.x, dz = a.z - p.z;
    const n = Math.hypot(dx, dz) || 1;
    dx /= n; dz /= n;
    // (a thing on the floor at the walker's feet — the shards they stand among: looking steeply down from
    // the eyes only fills the frame with their own hem, so the view turns round and looks back from above
    // the far side, the walker standing at the edge of the spill, the shards before them)
    const floor = !o.high && a.y - p.y < 0.35;
    const to = o.high ? { x: a.x - dx * 3.4, y: a.y + 5.2, z: a.z - dz * 3.4 }
      : floor ? { x: a.x + dx * 1.45 - dz * 0.4, y: a.y + 2.75, z: a.z + dz * 1.45 + dx * 0.4 }
        : { x: p.x + dx * 0.38, y: p.y + 1.45, z: p.z + dz * 0.38 };
    const look = floor ? { x: a.x - dx * 0.25, y: a.y + 0.35, z: a.z - dz * 0.25 } : a;
    void eng.cinematic({ to, look, secs: still ? 0.01 : 0.8, hold: 90 });
  }

  /** Run one of the case's own moments with the world claimed (never two at once). */
  async function claimed(fn: () => Promise<void>, o: { freeze?: boolean } = {}): Promise<void> {
    if (busy || judging || !st.alive) return;
    if (!st.claim()) return;
    busy = true;
    if (o.freeze) st.hold(true);
    try {
      await fn();
    } catch (e) {
      console.error('[walk] taoyuan case', e);
    } finally {
      eng.endCinematic();
      if (o.freeze) st.hold(false);
      st.unclaim();
      busy = false;
      scene?.update();
    }
  }

  async function examine(k: K.ClueKey): Promise<void> {
    if (k === 'zuji' && !has(K.clueFlag('zuji'))) { await brushPetals(); return; }
    await claimed(async () => {
      const c = K.CLUE[k];
      const who = ctx.player.character;
      const again = has(K.clueFlag(k));
      if (c.at) lookAt(ANCHORS[c.at], { high: c.at === 'courtyard' });
      if (again) {
        await say('narr', c.card);
        for (const a of c.addenda) if (has(a.flag)) await say('narr', a.line);
        // (the seal left in the tray: it can be taken on a second look)
        if (k === 'can' && st.alive) await takeSeal();
        return;
      }
      switch (k) {
        case 'feng': {
          if (who === 'cat') { await say('me', { zh: '土味。', en: 'Dirt.' }); flag(K.addFlag('feng:cat')); }
          await say('narr', K.WORLD.sniff);
          await lines('duer', K.WORLD.duerSays);
          await discover('feng');
          if (who === 'poet') { await say('me', K.TOOLS.poet.taste); flag(K.addFlag('feng')); }
          return;
        }
        case 'hualou': {
          await say('narr', K.WORLD.basin);
          await say('gegu', K.WORLD.gegu);
          await discover('hualou');
          if (who === 'gardener') await say('me', { zh: '这种盆，我认得。', en: 'I know this kind of basin.' });
          await say('gegu', K.WORLD.gegu2);
          flag(K.addFlag('hualou'));
          return;
        }
        case 'beiyin': {
          if (who === 'cat') { await say('me', { zh: '甜的，不是酒。', en: 'Sweet. Not wine.' }); flag(K.addFlag('beiyin')); }
          await say('narr', c.card);
          await discover('beiyin');
          return;
        }
        case 'bu': {
          await say('narr', c.card);
          await discover('bu');
          if (who === 'scholar') { await say('narr', K.TOOLS.scholar.reads); await say('me', K.TOOLS.scholar.line); flag(K.addFlag('bu')); }
          return;
        }
        case 'can': {
          await say('narr', c.card);
          if (Math.hypot(ctx.player.position.x - W(-21.5, 8.9).x, ctx.player.position.z - W(-21.5, 8.9).z) < 9) await say('narr', K.WORLD.sangStill);
          await discover('can');
          if (who === 'gardener') { await say('me', { zh: '蚕不吃这角的叶子。', en: "The worms won't touch the leaves in that corner." }); flag(K.addFlag('can')); }
          await takeSeal();
          return;
        }
        default: {
          await say('narr', c.card);
          await discover(k);
        }
      }
    }, { freeze: true });
  }

  async function takeSeal(): Promise<void> {
    if (has(K.CASE_FLAGS.seal)) return;
    const k = await say('narr', K.WORLD.sealAsk, [K.WORLD.sealTake, K.WORLD.sealLeave]);
    if (k !== 0) return;
    flag(K.CASE_FLAGS.seal);
    await say('narr', K.WORLD.taken);
  }

  /** 柳婆's spare tray: light a pinch, splash wine on it from above — the ember dies, both sides spattered. */
  async function tryIncense(spare: SpareTray): Promise<void> {
    await claimed(async () => {
      lookAt(ANCHORS.spareTray);
      spare.light(true);
      await wait(still ? 300 : 1700);
      spare.splash();
      try { ctx.audio.knock(); } catch { /* muted */ }
      await wait(400);
      await say('narr', K.WORLD.testDo);
      const first = !has(K.addFlag('xiang'));
      flag(K.addFlag('xiang'));
      if (first) ctx.hud.toast(K.WORLD.testNote.zh, K.WORLD.testNote.en, 3600);
    }, { freeze: true });
  }

  /** The back window: ajar; for the swordsman, a child's handprints on the sill (toward the hollow). */
  async function backWindow(): Promise<void> {
    await claimed(async () => {
      lookAt(at(SHRINE.window.x, SHRINE.window.z, 1.1));
      if (ctx.player.character === 'swordsman' && !has(K.CASE_FLAGS.found)) {
        await say('me', K.TOOLS.swordsman.window);
        knollMark = true;
      } else {
        await say('narr', K.TOOLS.swordsman.plain);
      }
    }, { freeze: true });
  }

  // ───────────── C5: brushing the courtyard's petals

  async function brushPetals(): Promise<void> {
    await claimed(async () => {
      lookAt(ANCHORS.courtyard, { high: true });
      const s = brushCourtyard({ lang: ctx.lang, mount: (n) => ctx.hud.mount(n), reduced: still, sound: () => brushSound(0.35) });
      brushing = s;
      let ok = false;
      try { ok = await s.done; } finally { brushing = null; }
      if (!ok || !st.alive) return;
      await discover('zuji');
    }, { freeze: true });
  }

  /** 道童's wind in the courtyard: the petals lift, the prints shine, the clue is found. */
  async function windPrints(): Promise<void> {
    scene?.windGlow();
    await discover('zuji');
  }

  // ───────────── the witnesses (§4.4), through the story's talks

  const WITNESS_SET = new Set<string>(K.WITNESS_KEYS);

  async function breakLie(w: K.WitnessKey, b: K.Break): Promise<void> {
    await lines(w, b.says);
    flag(b.flag);
    try { await tv.fx?.stamp({ zh: `${VILLAGERS[w].zh} · ${K.WORLD.broken.zh}`, en: `${VILLAGERS[w].en} · ${K.WORLD.broken.en}` }, { seal: '破' }); } catch { /* a nicety */ }
    // the truth afterwards, once every lie of theirs is broken
    if (K.stageOf(w, flags()) >= K.WITNESS[w].breaks.length) await lines(w, K.WITNESS[w].after);
  }

  async function witnessTalk(w: K.WitnessKey, who: CharacterId): Promise<void> {
    if (w === 'xiaoman') { await xiaomanTalk(who); return; }
    const W0 = K.WITNESS[w];
    const first = !has(K.heardFlag(w));
    let said: K.Line[] = first ? W0.opening : K.statementNow(w, flags());
    // (all but the last line; the last carries the choices)
    for (let i = 0; i < said.length - 1; i++) { if (!st.alive) return; await say(said[i].zh.startsWith('（') ? 'narr' : w, said[i]); }
    if (first) flag(K.heardFlag(w));
    let last = said[said.length - 1];
    let lastBy: Speaker = last.zh.startsWith('（') ? 'narr' : w;
    // (a companion's aside, after what they say: the talk's choices then hang on it; none once 三娘 has nothing left to hide)
    if (w === 'sang' && (who === 'guan' || who === 'rabbit') && K.stageOf('sang', flags()) < W0.breaks.length) {
      await say(last.zh.startsWith('（') ? 'narr' : w, last);
      if (!st.alive) return;
      if (who === 'rabbit') flag(K.addFlag('sang'));
      last = who === 'guan' ? K.TOOLS.guan.sang : K.TOOLS.rabbit.sang;
      lastBy = 'narr';
    }
    for (let round = 0; round < 8 && st.alive; round++) {
      const f = flags();
      const stage = K.stageOf(w, f);
      const brk = W0.breaks[stage];
      type Opt = { l: K.Line; run: () => Promise<'again' | 'end'> };
      const opts: Opt[] = [];
      if (brk) opts.push({ l: K.WORLD.show, run: async () => {
        const ev = await pickEvidence(w);
        if (!st.alive || !ev) return 'end';
        const b = K.confront(w, ev, flags());
        if (!b) { last = K.NOT_MINE[w]; return 'again'; }
        await breakLie(w, b);
        return 'end';
      } });
      if (w === 'ruan' && !f[K.clueFlag('bitao')]) opts.push({ l: K.WORLD.sleeve, run: async () => {
        await say('narr', K.WORLD.collar);
        if (who === 'gardener') { await say('me', K.TOOLS.gardener.tree); flag(K.addFlag('bitao:tree')); }
        await discover('bitao');
        if (who === 'fisher') { await say('me', K.TOOLS.fisher.line); flag(K.addFlag('bitao')); }
        last = K.statementNow(w, flags()).slice(-1)[0];
        return 'again';
      } });
      if (w === 'duer' && !f[K.clueFlag('feng')]) opts.push({ l: K.WORLD.jars, run: async () => {
        await lines('duer', K.WORLD.duerSays);
        await discover('feng');
        if (who === 'poet') { await say('me', K.TOOLS.poet.taste); flag(K.addFlag('feng')); }
        last = K.statementNow(w, flags()).slice(-1)[0];
        return 'again';
      } });
      if (brk?.companions?.includes(who)) opts.push({ l: who === 'poet' ? K.TOOLS.poet.duer : { zh: '正气 · 关某在此', en: 'Righteousness · Guan is here' }, run: async () => {
        if (who === 'poet') await say('narr', K.TOOLS.poet.drank);
        else { await say('me', K.TOOLS.guan.duerAsk); await say('narr', K.TOOLS.guan.duer); }
        await breakLie(w, brk);
        return 'end';
      } });
      if (!opts.length) { await say(lastBy, last); return; }
      opts.push({ l: K.WORLD.bye, run: async () => 'end' });
      const k = await say(lastBy, last, opts.map((o) => o.l));
      lastBy = w;
      if (k < 0 || !st.alive) return;
      const r = await opts[k].run();
      if (r === 'end') return;
    }
  }

  /** T6: 小满 in the hollow — found (the testimony), or later, what he remembers. */
  async function xiaomanTalk(who: CharacterId): Promise<void> {
    if (has(K.CASE_FLAGS.found)) { await lines('xiaoman', K.WITNESS.xiaoman.after); return; }
    const k = await say('xiaoman', K.WITNESS.xiaoman.opening[0], K.T6.choices);
    // (✕: you leave him be; he is still there, asleep again, when you come back)
    if (k < 0 || !st.alive) return;
    if (k === 1) await say('xiaoman', K.T6.frantic);
    if (who === 'rabbit') await say('narr', { zh: '（玉兔挨着他坐下，他才不抖了。）', en: '(The Jade Rabbit sits down beside him, and he stops shaking.)' });
    await lines('xiaoman', K.T6.testimony);
    flag(K.heardFlag('xiaoman'));
    flag(K.CASE_FLAGS.found);
    knollMark = false;
    try { await tv.fx?.stamp({ zh: '寻得小满', en: 'Xiaoman Found' }, { seal: '证' }); } catch { /* a nicety */ }
    await say('xiaoman', K.T6.pass);
    await say('narr', K.T6.home);
  }

  /** 葛姑, while the petal clock is not yet read: she shows it in person. */
  async function geguTalk(who: CharacterId): Promise<void> {
    await say('gegu', K.WORLD.gegu);
    await discover('hualou');
    if (who === 'gardener') await say('me', { zh: '这种盆，我认得。', en: 'I know this kind of basin.' });
    await say('gegu', K.WORLD.gegu2);
    flag(K.addFlag('hualou'));
  }

  /** 鲁三 before 关公: a whole sentence (C7's addendum). */
  async function lusanTalk(): Promise<void> {
    await say('narr', K.TOOLS.guan.lusan);
    await say('lusan', { zh: '补得急，没上漆，走起来一齿响、一齿闷。', en: "I rushed it and didn't lacquer it — one tooth clicks, the other thuds." });
    flag(K.addFlag('buchi'));
    if (!has(K.clueFlag('buchi'))) await say('lusan', VILLAGERS.lusan.caseLine!);
  }

  /** 石瞽 after the case: the letter's writer (a bonus), and after a confession, his one word. */
  async function shiguTalk(who: CharacterId): Promise<void> {
    if (K.gradeOf(flags()) === 'zibai' && !has(K.CASE_FLAGS.zibaiSaid)) {
      await say('shigu', K.WRITER.zibai);
      flag(K.CASE_FLAGS.zibaiSaid);
      if (has(K.CASE_FLAGS.writer)) return;
    }
    if (has(K.CASE_FLAGS.writer)) return;
    if (who === 'musician') { await say('shigu', K.WRITER.musician); await say('shigu', K.WRITER.says); await writerFound(); return; }
    if (who === 'scholar' && !once.has('scholar-hand')) { once.add('scholar-hand'); await say('me', K.WRITER.scholar); }
    const chat = VILLAGERS.shigu.chat.filter((c) => !c.after);
    const day = Math.floor(ctx.env.date.getTime() / 86400000);
    let k = await say('shigu', chat[day % chat.length], [K.WRITER.ask, K.WRITER.listen]);
    if (k === 1 && st.alive) {
      // (he plays: a few cool notes, falling; then the question is still there to ask, or not)
      await playTune();
      if (!st.alive) return;
      k = await say('narr', K.WRITER.tune, [K.WRITER.ask, K.WORLD.bye]);
    }
    if (k !== 0 || !st.alive) return;
    await say('shigu', K.WRITER.says);
    await writerFound();
  }
  /** 石瞽's zither: a short falling phrase, the last note left to ring. */
  async function playTune(): Promise<void> {
    const phrase: [number, number][] = [[4, 0.5], [2, 0.42], [1, 0.46], [2, 0.4], [0, 0.5], [-1, 0.44], [0, 0.62]];
    for (const [i, [d, v]] of phrase.entries()) {
      if (!st.alive) return;
      try { ctx.audio.pluck(d, v); } catch { /* muted */ }
      await wait(i === phrase.length - 2 ? 620 : 420);
    }
    await wait(900);
  }
  async function writerFound(): Promise<void> {
    if (has(K.CASE_FLAGS.writer)) return;
    flag(K.CASE_FLAGS.writer);
    earnFrom('taoyuan', K.WRITER_COINS);
    await say('narr', K.WRITER.bird);
    const c = K.WRITER.coins(K.WRITER_COINS);
    ctx.hud.toast(c.zh, c.en, 3200);
  }

  // ───────────── the judgement (§4.8)

  const handle = (k: VillagerKey): VillagerHandle | null => { try { return taoyuanHooks.story?.villager(k) ?? null; } catch { return null; } };

  /** The judgement's shot: low among the petals, the lanterns and everyone in the ring. */
  const ringShot = () => {
    const cy = Y_T + standAt(0, -20);
    return { to: { ...W(-0.55, -18.0), y: cy + 0.7 }, look: { ...W(0.3, -21.6), y: cy + 1.6 } };
  };

  async function judge(): Promise<void> {
    if (judging || busy || !K.ready(flags()).ok || !K.caseIsOpen(flags()) || !tv.fx) return;
    if (!st.claim()) return;
    judging = true;
    closeCaseSheet();
    let grade: K.Grade | null = null;
    const placed: VillagerHandle[] = [];
    let ring: ReturnType<NonNullable<TaoyuanWorld['fx']>['lanternRing']> | null = null;
    let lit = 0;
    const lightTwo = () => { ring?.light(lit++); ring?.light(lit++); };
    try {
      st.hold(true);
      try { ctx.music.setTheme('quiet'); } catch { /* optional */ }
      await st.curtain(K.JUDGE.curtain.zh, K.JUDGE.curtain.en, () => {
        for (const [k, x, z] of COURT_RING) {
          const h = handle(k);
          if (!h) continue;
          const w = W(x, z), f0 = W(0, -19.8);
          h.place({ x: w.x, z: w.z, face: { x: f0.x, z: f0.z } });
          placed.push(h);
        }
        const c = W(COURT_WALKER.x, COURT_WALKER.z);
        ctx.player.teleport(c.x, c.z, Math.PI, Y_T + standAt(COURT_WALKER.x, COURT_WALKER.z));
        eng.faceView(Math.PI);
        tv.shrineDoor(true, true);
      }, still ? 300 : 700);
      if (!st.alive || !tv.isInside()) return;
      // FX16: the lanterns ring the courtyard; the camera low, among the petals
      ring = tv.fx.lanternRing({ at: ANCHORS.courtyard });
      void eng.cinematic({ ...ringShot(), secs: still ? 0.01 : 2.4, hold: 900 });
      await wait(900);
      await say('qin', K.JUDGE.open);
      let tally: K.Tally = { miss: count(K.COUNTERS.miss), q2miss: count(K.COUNTERS.q2miss) };
      for (const q of K.QUESTIONS) {
        if (has(K.qFlag(q.n))) { lightTwo(); continue; }
        for (;;) {
          if (!st.alive || !tv.isInside()) return;
          const k = await say('qin', q.ask, q.options);
          if (!st.alive || !tv.isInside()) return;
          if (k < 0) {
            // (Esc is never an answer: nobody is hurried, and the case can wait)
            const c = await say('narr', K.JUDGE.pause, K.JUDGE.pauseChoices);
            if (c === 1 || c < 0) { await say('qin', K.JUDGE.later); return; }
            continue;
          }
          const a = K.answer(q, k, tally);
          if (a.right) {
            try { ctx.audio.bell(); } catch { /* muted */ }
            lightTwo();
            flag(K.qFlag(q.n));
            for (const l of a.lines) await say(l.by, l);
            break;
          }
          record(K.COUNTERS.miss);
          if (q.n === 2) record(K.COUNTERS.q2miss);
          tally = a.tally;
          for (const l of a.lines) await say(l.by, l);
          if (a.confessed) {
            await say('sang', K.JUDGE.confess);
            lightTwo();
            flag(K.qFlag(q.n));
            break;
          }
          if (a.hint) await say('bird', a.hint);
        }
      }
      if (!st.alive || !tv.isInside()) return;
      // the truth, replayed in ink: three shots
      await say('qin', K.JUDGE.truth);
      const ghosts = tv.fx.inkGhosts([...K.GHOSTS], { figures: 3, perLine: still ? 2600 : 3600 });
      const per = (still ? 2600 : 3600) + 900;
      await wait(1100);
      for (const [si, s] of K.GHOST_SHOTS.entries()) {
        if (!st.alive) break;
        // (the second shot: the incense as it was then — burning at 戌正, its smoke rising straight)
        scene?.rewind(si === 1);
        const to = W(s.to[0], s.to[2]), lk = W(s.look[0], s.look[2]);
        void eng.cinematic({ to: { ...to, y: Y_T + standAt(s.to[0], s.to[2]) + s.to[1] }, look: { ...lk, y: Y_T + standAt(s.look[0], s.look[2]) + s.look[1] }, secs: still ? 0.01 : 1.6, hold: 60 });
        await wait(per);
      }
      await ghosts;
      scene?.rewind(false);
      if (!st.alive) return;
      // back to the lantern ring, low among the petals: the grade and its seal are given there (the view is
      // handed back only once the book's card has closed, in `finally`)
      void eng.cinematic({ ...ringShot(), secs: still ? 0.01 : 1.8, hold: 900 });
      await wait(still ? 200 : 1400);
      // the grade, its coins, the day, the record (all in play; B6 reads the grade)
      const miss = count(K.COUNTERS.miss), hints = count(K.COUNTERS.hint), q2 = count(K.COUNTERS.q2miss);
      grade = K.grade(miss, hints, q2 >= 3);
      if (!has(K.CASE_FLAGS.solved)) {
        flag(K.gradeFlag(grade));
        earnFrom('taoyuan', K.GRADE_COINS[grade]);
        markDay(K.DAY_KEY);
        flag(K.CASE_FLAGS.solved);
      }
      ring.lightAll();
      try { await tv.fx.stamp(K.GRADE_NAME[grade], { seal: '断' }); } catch { /* a nicety */ }
      const c = K.JUDGE.gradeLine(grade, K.GRADE_COINS[grade]);
      ctx.hud.toast(c.zh, c.en, 4200);
      // the seal 「明察」 is announced before the confession, not over it (the book's card, once closed)
      await wait(1100);
      for (let i = 0; i < 800 && st.alive && (celebrations.peek().length > 0 || celebrationUp()); i++) await wait(150);
    } catch (e) {
      console.error('[walk] taoyuan judgement', e);
    } finally {
      st.hold(false);
      eng.endCinematic();
      st.unclaim();
      judging = false;
      // (not judged after all: everyone back to where they were)
      if (!has(K.CASE_FLAGS.solved)) { for (const h of placed) { try { h.place(null); } catch { /* gone */ } } ring?.remove(); }
      else judgeRing = ring;
      scene?.update();
    }
    if (grade && has(K.CASE_FLAGS.solved)) {
      try { ctx.music.release(); } catch { /* optional */ }
      musicHeld = false;
      const s = taoyuanHooks.story;
      if (s) s.solved(grade);
    }
  }
  /** The lanterns stay lit through B6, and go with the night. */
  let judgeRing: { remove(): void } | null = null;

  // ───────────── the hooks the story asks

  const hooks: CaseHooks = {
    start: () => {
      idle = 0;
      lastCount = discoveries();
      sync();
      ctx.hud.toast('案卷已开：物证与证词，都记在「案卷」里。', 'The case is open: evidence and testimony go into the Casebook.', 4600);
    },
    talk: (k, who) => {
      const f = flags();
      if (K.caseIsOpen(f) && !judging) {
        if (WITNESS_SET.has(k)) return () => talkRun(() => witnessTalk(k as K.WitnessKey, who));
        if (k === 'gegu' && !f[K.clueFlag('hualou')]) return () => talkRun(() => geguTalk(who));
        if (k === 'lusan' && who === 'guan' && !f[K.addFlag('buchi')]) return () => talkRun(() => lusanTalk());
        return null;
      }
      if (f[K.CASE_FLAGS.solved] && k === 'shigu' && (!f[K.CASE_FLAGS.writer] || (K.gradeOf(f) === 'zibai' && !f[K.CASE_FLAGS.zibaiSaid]))) {
        return () => talkRun(() => shiguTalk(who));
      }
      return null;
    },
    ready: () => K.ready(flags()),
    judge: () => judge(),
  };
  /** A talk of the case's (the story holds the claim): nothing else of ours runs meanwhile. */
  async function talkRun(fn: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try { await fn(); } catch (e) { console.error('[walk] taoyuan case talk', e); } finally { busy = false; scene?.update(); }
  }
  taoyuanHooks.case = hooks;
  bag.onDispose(() => { if (taoyuanHooks.case === hooks) taoyuanHooks.case = null; });

  // ───────────── the companions' tools (lent through the 技)

  const toolWorld: ToolWorld = {
    ctx, tv,
    active: () => tv.isInside() && K.caseIsOpen(flags()) && !judging && !busy,
    flags,
    discover: (k) => discover(k),
    windPrints: () => windPrints(),
    targets: () => {
      const f = flags();
      const out: { key: string; at: XYZ; where: K.Line }[] = [];
      for (const c of K.CLUES) if (c.at && !f[K.clueFlag(c.key)]) out.push({ key: c.key, at: ANCHORS[c.at], where: c.where });
      if (!f[K.CASE_FLAGS.found]) out.push({ key: 'hollow', at: ANCHORS.hollow, where: K.TOOLS.painter.hollow });
      if (!f[K.clueFlag('bitao')]) { const h = handle('ruan'); if (h) out.push({ key: 'bitao', at: h.position(), where: K.CLUE.bitao.where }); }
      return out;
    },
    villagerAt: (k) => handle(k)?.position() ?? null,
    say: (by, l) => say(by, l),
    trail: SANG_TRAIL,
  };
  const tools = caseTools(toolWorld);
  skillLoan.current = tools;
  bag.onDispose(() => { if (skillLoan.current === tools) skillLoan.current = null; });

  // ───────────── the valley while the case is open: music, the bluebirds, 小满's way home, passives

  let musicHeld = false;
  let knollMark = false;
  let drone = 0;
  let snore = 0;
  let enteredAt = 0;
  const once = new Set<string>();
  bag.onDispose(tv.onEnter(() => { once.clear(); enteredAt = performance.now(); idle = 0; sync(); }));
  bag.onDispose(tv.onLeave(() => {
    caseHere.value = false;
    brushing?.close();
    if (caseSheet.peek()?.pick) closeCaseSheet();
    if (musicHeld) { try { ctx.music.release(); } catch { /* optional */ } musicHeld = false; }
    judgeRing?.remove();
    judgeRing = null;
    birds.idle?.remove();
    birds.idle = null;
  }));
  // (the sheet goes with the world, open or picking: it would come back by itself over the next one)
  bag.onDispose(() => { brushing?.close(); closeCaseSheet(); caseHere.value = false; if (musicHeld) { try { ctx.music.release(); } catch { /* gone */ } } });
  tv.onBuilt(() => sync());

  // small bluebirds: the idle nudge, the hint's marker on the knoll, the one on your shoulder
  const birds: { idle: Bird | null; knoll: Bird | null; shoulder: Bird | null } = { idle: null, knoll: null, shoulder: null };

  /** Once a second: the scene, the music, the idle nudge, 小满, the companions' passive sights. */
  function sync(): void {
    const f = flags();
    const inside = tv.isInside();
    if (caseHere.peek() !== inside) caseHere.value = inside;
    const open = K.caseIsOpen(f);
    if (wantScene() && !scene && tv.fx) scene = buildScene();
    else if (!wantScene() && scene) { scene.dispose(); scene = null; }
    scene?.update();
    if (judgeRing && (f['ty:b6'] || !inside)) { judgeRing.remove(); judgeRing = null; }
    if (!inside) return;
    const p = ctx.player.position;
    const l = L(p.x, p.z);
    const inCleft = l.z > CAVE.mouth - 0.5;
    // the held night's music: quiet, with a low pluck now and then and a drip (never in the cleft: the valley hushes it itself)
    if (open && !inCleft && !judging) {
      if (!musicHeld) { try { ctx.music.setTheme('quiet'); } catch { /* optional */ } musicHeld = true; }
      if (--drone <= 0) {
        drone = 6 + Math.floor(Math.random() * 6);
        try { if (Math.random() < 0.6) ctx.audio.pluck(-7, 0.16); else ctx.audio.pluck(9, 0.08); } catch { /* muted */ }
      }
    } else if (musicHeld && !open) {
      try { ctx.music.release(); } catch { /* optional */ }
      musicHeld = false;
    }
    // 小满, once found, goes to his mother (when you are not there to see him vanish) — only while the case
    // is open: the judgement puts him in the ring, B6 takes him over and sets him back on his own day, whose
    // dusk is spent in that very hollow
    if (open && f[K.CASE_FLAGS.found] && !judging) {
      const h = handle('xiaoman');
      if (h) {
        const hp = h.position(), hl = L(hp.x, hp.z);
        const atHollow = Math.hypot(hl.x - KNOLL.x, hl.z - KNOLL.z) < 3;
        if (atHollow && Math.hypot(l.x - hl.x, l.z - hl.z) > 14) {
          const w = W(XIAOMAN_HOME.x, XIAOMAN_HOME.z), fw = W(XIAOMAN_HOME.face.x, XIAOMAN_HOME.face.z);
          h.place({ x: w.x, z: w.z, face: fw });
        }
      }
    }
    // 小满 asleep in the hollow: a snore now and then, for whoever comes near (阮郎 thought it a badger)
    if (open && !f[K.CASE_FLAGS.found] && tv.fx) {
      const h = ANCHORS.hollow, hl = L(h.x, h.z);
      if (Math.hypot(l.x - hl.x, l.z - hl.z) < 13 && --snore <= 0) {
        snore = 4;
        tv.fx.words(K.WORLD.snore, { x: h.x + 0.2, y: h.y + 0.75, z: h.z + 0.3 }, { size: 0.3, life: 2.8, rise: 0.55, color: '#34384a' });
      }
    }
    // the idle bluebird: nothing new for four minutes → it perches on the next thing to find (free)
    const now = discoveries();
    if (now !== lastCount) { lastCount = now; idle = 0; birds.idle?.remove(); birds.idle = null; }
    else if (open && !busy && !judging && !ctx.player.isFrozen && !caseSheet.peek()) idle += 1;
    if (open && idle >= 240 && !birds.idle) {
      const tg = K.nextTarget(f);
      const a = tg === 'hollow' ? ANCHORS.hollow : tg ? ANCHORS[K.CLUE[tg].at ?? 'courtyard'] : null;
      if (a) { birds.idle = bird({ x: a.x, y: a.y + 0.45, z: a.z }); ctx.hud.toast(K.WORLD.idle.zh, K.WORLD.idle.en, 3600); }
    }
    if (!open && birds.idle) { birds.idle.remove(); birds.idle = null; }
    // the hint's third note on 小满 (or the swordsman's handprints): a bluebird waits on the knoll
    const wantKnoll = open && !f[K.CASE_FLAGS.found] && (!!f[K.hintFlag('find', 3)] || knollMark);
    if (wantKnoll && !birds.knoll) { const h = ANCHORS.hollow; birds.knoll = bird({ x: h.x + 0.2, y: h.y + 1.35, z: h.z + 0.1 }); }
    else if (!wantKnoll && birds.knoll) { birds.knoll.remove(); birds.knoll = null; }
    // 石瞽's bluebird rides on your shoulder, ever after the letter is owned to
    if (f[K.CASE_FLAGS.writer] && !birds.shoulder) birds.shoulder = bird(null);
    // 嫦娥's moonlight: the wine drops on the lane glint silver toward the silk room
    const moon = open && ctx.player.character === 'change' && !f[K.clueFlag('can')];
    moonDrops(moon);
    if (moon && !once.has('moon') && SANG_TRAIL.some(([x, z]) => Math.hypot(l.x - x, l.z - z) < 5)) { once.add('moon'); ctx.hud.toast(K.TOOLS.change.moon.zh, K.TOOLS.change.moon.en, 4600); }
    // 渔翁 by the stream: the white-edged petals come from the north-west
    if (open && ctx.player.character === 'fisher' && !once.has('fisher') && performance.now() - enteredAt > 4000 && streamAt(l.x, l.z).d < 2.4) {
      once.add('fisher');
      flag(K.addFlag('bitao'));
      ctx.hud.toast(K.TOOLS.fisher.stream.zh, K.TOOLS.fisher.stream.en, 4800);
    }
  }
  let acc = 0;
  bag.frame((dt) => {
    acc += dt;
    if (acc < 1) return;
    acc = 0;
    sync();
  });

  let drops: (() => void)[] = [];
  function moonDrops(on: boolean): void {
    if (on && !drops.length && tv.fx) {
      for (let i = 0; i < SANG_TRAIL.length - 1; i++) {
        const [x0, z0] = SANG_TRAIL[i], [x1, z1] = SANG_TRAIL[i + 1];
        for (const k of [0.3, 0.75]) drops.push(tv.fx.glint(at(x0 + (x1 - x0) * k, z0 + (z1 - z0) * k, 0.06), { color: 'silver' }));
      }
    } else if (!on && drops.length) { for (const d of drops) d(); drops = []; }
  }
  bag.onDispose(() => moonDrops(false));

  // ── a little bluebird (at a point, bobbing; or on the walker's shoulder when `at` is null)
  interface Bird { remove(): void }
  function bird(where: XYZ | null): Bird {
    const g = merge(TH, [
      part(TH, new TH.SphereGeometry(0.07, 8, 6), '#3d6fb0', { s: [1, 0.9, 1.4] }),
      part(TH, new TH.SphereGeometry(0.045, 8, 6), '#4f86c6', { p: [0, 0.05, 0.08] }),
      part(TH, new TH.ConeGeometry(0.02, 0.05, 4), '#e8b04a', { p: [0, 0.05, 0.14], r: [Math.PI / 2, 0, 0] }),
      part(TH, new TH.BoxGeometry(0.06, 0.01, 0.12), '#2b4f82', { p: [0, 0.01, -0.12] }),
    ]);
    const b = inked(ctx, g, { width: 0.006 });
    b.name = 'ty:case:bird';
    ctx.regionGroup('taoyuan').add(b);
    let t = Math.random() * 6;
    const off = ctx.onFrame((dt) => {
      t += dt;
      if (where) {
        b.position.set(where.x, where.y + (still ? 0 : Math.abs(Math.sin(t * 2.2)) * 0.05), where.z);
        b.rotation.y = Math.sin(t * 0.7) * 0.8;
      } else {
        const p = ctx.player.position, h = ctx.player.heading;
        const visible = tv.isInside() && ctx.cameraMode() !== 'first';
        b.visible = visible;
        b.position.set(p.x + Math.cos(h) * 0.2, p.y + 1.2 + (still ? 0 : Math.abs(Math.sin(t * 1.3)) * 0.02), p.z - Math.sin(h) * 0.2);
        b.rotation.y = h;
      }
    });
    let gone = false;
    const remove = () => { if (gone) return; gone = true; off(); b.removeFromParent(); g.dispose(); };
    bag.onDispose(remove);
    return { remove };
  }
  bag.onDispose(() => { birds.idle?.remove(); birds.knoll?.remove(); birds.shoulder?.remove(); });

  // ───────────── DEV: window.__tycase

  if (import.meta.env.DEV) {
    const w = window as unknown as { __tycase?: unknown };
    w.__tycase = {
      flags: () => Object.keys(flags()).filter((k) => k.startsWith('case:')),
      counters: () => Object.fromEntries(Object.entries(play.peek().counters).filter(([k]) => k.startsWith('case:'))),
      ready: () => K.ready(flags()),
      examine: (k: K.ClueKey) => examine(k),
      test: () => scene && tryIncense(scene.spare),
      talk: (k: VillagerKey) => { const t = hooks.talk(k, ctx.player.character); return t ? t() : null; },
      judge: () => judge(),
      busy: () => ({ busy, judging, brushing: !!brushing }),
      idle: (s?: number) => { if (typeof s === 'number') idle = s; return idle; },
      open: () => openCaseSheet(),
      scene: () => !!scene,
      targets: () => toolWorld.targets().map((t) => t.key),
      tools,
      cam: (to: [number, number, number], look: [number, number, number]) => {
        const a = W(to[0], to[2]), b = W(look[0], look[2]);
        return eng.cinematic({ to: { ...a, y: Y_T + standAt(to[0], to[2]) + to[1] }, look: { ...b, y: Y_T + standAt(look[0], look[2]) + look[1] }, secs: 0.01, hold: 20 });
      },
      goto: (a: AnchorName) => { const p = ANCHORS[a]; (window as unknown as { __walk?: { teleport(x: number, z: number, h?: number): void } }).__walk?.teleport(p.x + 0.9, p.z + 0.9); },
    };
    bag.onDispose(() => { if (w.__tycase) delete w.__tycase; });
  }
});

export const TAOYUAN_CASE_FEATURES = [taoyuanCase];
