// 营造 · the build mode. The camera rises over the plot (three-quarters from above, turnable by
// quarters), a grid is laid on the lawn, and a sheet of things slides up. Pick one and its ghost
// follows your finger, the mouse or the arrow keys — green where it fits, red where it does not;
// turn it, set it down (the coins are paid first). Tap a thing already standing to move, turn or
// sell it back (half its price), or write on it; undo the last step; name the homestead.
// Touch: drag the ghost, tap the ground to send it there, drag elsewhere to pan, pinch to zoom.
// Keys: arrows / WASD move, R turns, Enter sets down, Delete sells, V turns the view, Ctrl+Z undoes,
// Esc steps back (and leaves).
import type * as T from 'three';
import { signal } from '@preact/signals';
import { h, render } from 'preact';
import { reducedMotion, type Bag } from '../../kit';
import { home, moveItem, placeItem, removeItem, restoreItem, setHomeName, setItemText, HOME_LIMITS, type HomeItem } from '../../../../../app/home';
import { flag, play, record, refund, spend } from '../../../../../app/play';
import { begin, end, modalOpen } from '../../minigames/ui';
import { rustle } from '../../sfx';
import { GATE_CELLS, GRID, KIND, PLOT_X0, PLOT_Z0, canWalkOut, fits, footprint, itemPose, onPlot, resale, type FitReason, type HomeCat, type Rot } from '../catalog';
import { flatGeometry } from './brush';
import { askText } from './dialog';
import { makeThumbs } from './thumbs';
import type { HomeStage } from './stage';
import { BuildUI } from './ui';

export type Mode = 'browse' | 'place' | 'select' | 'move';
export interface UIState {
  mode: Mode;
  cat: HomeCat;
  /** The kind being placed, or the picked thing's kind. */
  kind: string | null;
  sel: string | null;
  fit: FitReason | 'poor';
  undo: number;
  /** Bumped when thumbnails arrive. */
  thumbs: number;
  touch: boolean;
}

type Undo =
  | { t: 'place'; uid: string; price: number }
  | { t: 'move'; uid: string; i: number; j: number; rot: Rot }
  | { t: 'sell'; item: HomeItem; got: number }
  | { t: 'name'; prev: string }
  | { t: 'text'; uid: string; prev: string };

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const PITCH = 0.98;

export class BuildMode {
  readonly ui = signal<UIState>({ mode: 'browse', cat: 'house', kind: null, sel: null, fit: 'ok', undo: 0, thumbs: 0, touch: false });
  active = false;
  private offs: (() => void)[] = [];
  private root: HTMLDivElement | null = null;
  private undoStack: Undo[] = [];
  // the camera
  private tx = 0; private tz = 0; private d = 24; private yaw = 0; private yawNow = 0;
  private camPos: T.Vector3;
  private look: T.Vector3;
  private dy = 0;
  private sheetH = 0;
  private frameN = 0;
  // the ghost
  private gi = 0; private gj = 0; private rot: Rot = 0; private text = '';
  private lastDir: [number, number] = [1, 0];
  private ghostKey = '';
  private ghost: T.Mesh;
  private ghostMat: T.MeshToonMaterial;
  private foot: T.Mesh;
  private footLine: T.LineSegments;
  private footMat: T.MeshBasicMaterial;
  private grid: T.Object3D | null = null;
  private ray: T.Raycaster;
  private plane: T.Plane;
  private tmp: T.Vector3;
  private offThumbs: (() => void) | null = null;
  // pointers
  private ptrs = new Map<number, { x: number; y: number; x0: number; y0: number; moved: boolean; ghost: boolean; type: string }>();
  private pinch = 0;
  private reduced = reducedMotion();

  constructor(private bag: Bag, private stage: HomeStage) {
    const THREE = bag.ctx.THREE;
    this.camPos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();
    this.ghostMat = bag.own(new THREE.MeshToonMaterial({ vertexColors: true, transparent: true, opacity: 0.8, gradientMap: stage.grad, color: '#ffffff' }));
    this.ghost = bag.add(new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat));
    this.ghost.visible = false;
    this.ghost.renderOrder = 4;
    this.footMat = bag.own(new THREE.MeshBasicMaterial({ color: '#7fbf6a', transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide }));
    const pg = bag.own(new THREE.PlaneGeometry(1, 1));
    pg.rotateX(-Math.PI / 2);
    this.foot = bag.add(new THREE.Mesh(pg, this.footMat));
    this.foot.visible = false;
    this.foot.renderOrder = 3;
    this.footLine = new THREE.LineSegments(bag.own(new THREE.EdgesGeometry(pg)), bag.own(new THREE.LineBasicMaterial({ color: '#2a211b', transparent: true, opacity: 0.8 })));
    this.foot.add(this.footLine);
    bag.frame((dt) => this.frame(dt));
    bag.onDispose(() => this.exit());
  }

  private get ctx() { return this.bag.ctx; }
  t(zh: string, en: string): string { return this.ctx.lang === 'zh' ? zh : en; }
  get lang(): 'zh' | 'en' { return this.ctx.lang; }

  private set(p: Partial<UIState>): void { this.ui.value = { ...this.ui.value, ...p }; }

  // ───────────────────────────── in and out

  enter(): void {
    if (this.active) return;
    const ctx = this.ctx, pl = ctx.player;
    if (pl.isFrozen || modalOpen()) return;
    if (!begin(ctx, 'home-build')) { ctx.hud.toast('手头的事还没完。', 'Finish what you are doing first.'); return; }
    this.active = true;
    pl.freeze(true);
    pl.emote('build');
    // the whole plot in view to begin with
    const portrait = innerHeight > innerWidth;
    this.d = portrait ? 31 : 25;
    this.tx = PLOT_X0 + GRID / 2;
    this.tz = PLOT_Z0 + GRID / 2 + 1;
    this.yaw = this.yawNow = 0;
    this.camPos.copy(ctx.camera.position);
    this.look.copy(pl.position);
    this.plane.constant = -this.stage.plotY;
    this.makeGrid();
    // the overlay
    const root = document.createElement('div');
    root.className = 'hb is-building';
    root.lang = ctx.lang;
    this.root = root;
    const unmount = ctx.hud.mount(root);
    render(h(BuildUI, { ctrl: this }), root);
    this.offs.push(() => { render(null, root); unmount(); this.root = null; });
    // input
    const host = ctx.renderer.domElement.parentElement ?? ctx.renderer.domElement;
    const on = (t: EventTarget, type: string, fn: (e: Event) => void, o?: AddEventListenerOptions) => {
      t.addEventListener(type, fn, o);
      this.offs.push(() => t.removeEventListener(type, fn, o));
    };
    on(host, 'pointerdown', (e) => this.onDown(e as PointerEvent), { capture: true });
    on(window, 'pointermove', (e) => this.onMove(e as PointerEvent), { capture: true });
    on(window, 'pointerup', (e) => this.onUp(e as PointerEvent), { capture: true });
    on(window, 'pointercancel', (e) => this.onUp(e as PointerEvent, true), { capture: true });
    on(host, 'wheel', (e) => this.onWheel(e as WheelEvent), { capture: true, passive: false });
    on(window, 'keydown', (e) => this.onKey(e as KeyboardEvent), { capture: true });
    const touch = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
    this.undoStack = [];
    this.set({ mode: 'browse', kind: null, sel: null, undo: 0, touch });
    this.offThumbs = makeThumbs(this.stage, () => this.set({ thumbs: this.ui.value.thumbs + 1 }));
    ctx.hud.toast('营造：选一样东西，放到地里。', 'Build: pick something and set it on the plot.', 3000);
  }

  exit(): void {
    if (!this.active) return;
    this.active = false;
    const ctx = this.ctx, pl = ctx.player;
    if (this.ui.value.mode === 'move') this.stage.hide(null);
    this.offThumbs?.();
    this.offThumbs = null;
    for (const f of this.offs.splice(0).reverse()) { try { f(); } catch { /* gone */ } }
    this.ptrs.clear();
    this.ghost.visible = false;
    this.foot.visible = false;
    if (this.grid) { this.bag.drop(this.grid); this.grid = null; }
    ctx.camera.clearViewOffset();
    ctx.camera.updateProjectionMatrix();
    pl.freeze(false);
    this.unstick();
    end(ctx, 'home-build');
  }

  /**
   * Something may now stand where the walker was — a pond under their feet, a house built round
   * them: if they can no longer walk out through the gate, they step out to it.
   */
  private unstick(): void {
    this.stage.flush();
    const p = this.ctx.player.position;
    if (!onPlot(p.x, p.z) || canWalkOut(this.stage.circles(), p.x, p.z)) return;
    const [gi, gj] = GATE_CELLS[1];
    this.ctx.player.teleport(PLOT_X0 + gi + 0.5, PLOT_Z0 + gj, -Math.PI / 2);
  }

  // ───────────────────────────── modes

  /** A shelf tab. */
  tab(cat: HomeCat): void { this.set({ cat }); }

  /** Pick a kind from the sheet: its ghost appears in the middle of the view. */
  pick(kind: string): void {
    const k = KIND[kind];
    if (!k) return;
    if (this.ui.value.mode === 'move') this.stage.hide(null);
    this.rot = 0;
    this.text = '';
    const f = footprint(k, this.rot);
    this.gi = clamp(Math.round(this.tx - PLOT_X0 - f.w / 2), 0, GRID - f.w);
    this.gj = clamp(Math.round(this.tz - PLOT_Z0 - f.d / 2), 0, GRID - f.d);
    this.set({ mode: 'place', kind, sel: null });
    // nudge to the nearest free spot close by
    if (!this.fitNow().ok) this.seekFree();
    this.refresh();
  }

  /** Back one step: placing / picked → the sheet; the sheet → leave. */
  back(): void {
    const m = this.ui.value.mode;
    if (m === 'move') { this.stage.hide(null); this.set({ mode: 'select' }); this.refresh(); return; }
    if (m === 'place' || m === 'select') { this.set({ mode: 'browse', kind: null, sel: null }); this.refresh(); return; }
    this.exit();
  }

  private select(uid: string | null): void {
    const it = uid ? home.value.items.find((x) => x.uid === uid) : undefined;
    if (!it) { this.set({ mode: 'browse', sel: null, kind: null }); this.refresh(); return; }
    this.set({ mode: 'select', sel: it.uid, kind: it.kind });
    this.refresh();
    rustle(0.2);
  }

  /** The picked thing: move it (its ghost follows you). */
  startMove(): void {
    const it = this.selItem();
    if (!it) return;
    this.gi = it.i; this.gj = it.j; this.rot = it.rot; this.text = it.text ?? '';
    this.stage.hide(it.uid);
    this.set({ mode: 'move', kind: it.kind });
    this.refresh();
  }

  /** Turn the ghost, or the picked thing where it stands (about its centre). */
  turn(): void {
    const m = this.ui.value.mode;
    if (m === 'place' || m === 'move') {
      const k = KIND[this.ui.value.kind ?? ''];
      if (!k) return;
      const before = footprint(k, this.rot);
      const cx = this.gi + before.w / 2, cz = this.gj + before.d / 2;
      this.rot = ((this.rot + 1) % 4) as Rot;
      const f = footprint(k, this.rot);
      this.gi = clamp(Math.round(cx - f.w / 2), 0, GRID - f.w);
      this.gj = clamp(Math.round(cz - f.d / 2), 0, GRID - f.d);
      this.refresh();
      return;
    }
    const it = this.selItem();
    if (!it) return;
    const k = KIND[it.kind];
    const before = footprint(k, it.rot);
    const cx = it.i + before.w / 2, cz = it.j + before.d / 2;
    const rot = ((it.rot + 1) % 4) as Rot;
    const f = footprint(k, rot);
    const i = clamp(Math.round(cx - f.w / 2), 0, GRID - f.w), j = clamp(Math.round(cz - f.d / 2), 0, GRID - f.d);
    if (!fits(home.value.items, it.kind, i, j, rot, it.uid).ok) { this.ctx.hud.toast('这里转不开身。', 'No room to turn it here.'); return; }
    this.push({ t: 'move', uid: it.uid, i: it.i, j: it.j, rot: it.rot });
    moveItem(it.uid, i, j, rot);
    this.ctx.audio.knock();
    this.refresh();
  }

  /** Set the ghost down (placing: pay first), or finish a move. */
  confirm(): void {
    const s = this.ui.value;
    const k = KIND[s.kind ?? ''];
    if (!k) return;
    const fit = this.fitNow();
    if (!fit.ok) { this.nope(fit.reason); return; }
    const ctx = this.ctx;
    if (s.mode === 'move' && s.sel) {
      const it = this.selItem();
      if (it) this.push({ t: 'move', uid: it.uid, i: it.i, j: it.j, rot: it.rot });
      moveItem(s.sel, this.gi, this.gj, this.rot);
      this.stage.hide(null);
      this.set({ mode: 'select' });
      ctx.audio.knock();
      ctx.player.emote('build');
      this.refresh();
      return;
    }
    if (s.mode !== 'place') return;
    if (home.value.items.length >= HOME_LIMITS.items) { ctx.hud.toast('地里放不下更多了。', 'The plot cannot hold any more.'); return; }
    if (!spend(k.price)) { this.nope('poor'); return; }
    const uid = placeItem(k.id, this.gi, this.gj, this.rot, this.text || undefined);
    if (!uid) { refund(k.price); return; }
    if (k.use === 'farm') this.stage.uses.sow(uid);
    this.push({ t: 'place', uid, price: k.price });
    ctx.audio.knock();
    if (k.cat === 'garden' || k.cat === 'farm') rustle(0.4);
    ctx.player.emote('build');
    record('home:build');
    flag('home:built');
    const big = k.cat === 'house' || k.id === 'pavilion';
    if (big) ctx.hud.toast(`${k.zh}落成了。`, `The ${k.en.toLowerCase()} is up.`, 2600);
    // small things are laid in runs (a fence, a path): the ghost steps on
    if (k.w * k.d <= 2) {
      const f = footprint(k, this.rot);
      const [dx, dz] = this.lastDir;
      this.gi = clamp(this.gi + dx * f.w, 0, GRID - f.w);
      this.gj = clamp(this.gj + dz * f.d, 0, GRID - f.d);
    }
    // the ghost never waits on top of what was just set down: on to the nearest free spot
    if (!fits(home.value.items, k.id, this.gi, this.gj, this.rot).ok) this.seekFree();
    this.refresh();
  }

  /** Sell the picked thing back (half its price). */
  sell(): void {
    const it = this.selItem();
    if (!it) return;
    const k = KIND[it.kind];
    const got = resale(k?.price ?? 0);
    if (!removeItem(it.uid)) return;
    if (got) refund(got);
    this.push({ t: 'sell', item: it, got });
    rustle(0.5);
    this.ctx.hud.toast(got ? `拆了${k?.zh ?? ''}，收回 ${got} 文。（可撤回）` : `拆了${k?.zh ?? ''}。（可撤回）`, got ? `Sold back for ${got} coins. (Undo to keep it.)` : 'Taken down. (Undo to keep it.)', 2600);
    this.set({ mode: 'browse', sel: null, kind: null });
    this.refresh();
  }

  /** Write on the picked thing (a plaque, couplets). */
  async write(): Promise<void> {
    const it = this.selItem();
    if (!it) return;
    const prev = it.text ?? '';
    if (await this.stage.uses.write(it.uid)) this.push({ t: 'text', uid: it.uid, prev });
    this.refresh();
  }

  /** Name the homestead (the plaque over the gate). */
  async rename(): Promise<void> {
    const prev = home.value.name;
    const v = await askText(this.ctx, {
      titleZh: '题园名', titleEn: 'Name your homestead', noteZh: '题在门楼的匾上。', noteEn: 'It goes on the plaque over the gate.',
      fields: [{ labelZh: '园名', labelEn: 'Name', value: prev || '半亩山居', max: HOME_LIMITS.name }],
    });
    if (v === null || v[0] === prev) return;
    setHomeName(v[0]);
    this.push({ t: 'name', prev });
    record('home:name');
    this.ctx.hud.toast(`门匾换成了「${v[0] || '半亩山居'}」。`, `The gate now reads “${v[0] || '半亩山居'}”.`, 2400);
  }

  /** Turn the view a quarter. */
  turnView(): void { this.yaw += Math.PI / 2; }

  undo(): void {
    const u = this.undoStack.pop();
    this.set({ undo: this.undoStack.length });
    if (!u) return;
    const ctx = this.ctx;
    const gone = () => ctx.hud.toast('那样东西已经不在了。', 'That thing is no longer there.', 1800);
    switch (u.t) {
      // coins come back only for a thing that was really taken away
      case 'place': if (removeItem(u.uid)) refund(u.price); else { gone(); return; } break;
      case 'move': moveItem(u.uid, u.i, u.j, u.rot); break;
      case 'sell': {
        if (home.value.items.some((x) => x.uid === u.item.uid)) break;
        if (u.got && !spend(u.got)) {
          // keep the step: it can be undone once there are coins enough
          this.push(u);
          ctx.hud.toast('铜钱不够赎回了。', 'Not enough coins to buy it back.');
          return;
        }
        // back exactly as it was: the same uid (older steps name it), its words, its season
        if (!fits(home.value.items, u.item.kind, u.item.i, u.item.j, u.item.rot).ok || !restoreItem(u.item)) { if (u.got) refund(u.got); gone(); return; }
        break;
      }
      case 'name': setHomeName(u.prev); break;
      case 'text': setItemText(u.uid, u.prev); break;
    }
    if (this.ui.value.mode === 'select' && !this.selItem()) this.set({ mode: 'browse', sel: null, kind: null });
    ctx.audio.pluck(2, 0.4);
    ctx.hud.toast('撤回了一步。', 'Undone.', 1400);
    this.refresh();
  }

  private push(u: Undo): void {
    this.undoStack.push(u);
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.set({ undo: this.undoStack.length });
  }

  selItem(): HomeItem | undefined {
    const uid = this.ui.value.sel;
    return uid ? home.value.items.find((x) => x.uid === uid) : undefined;
  }

  private nope(r: FitReason | 'poor'): void {
    const m: Record<string, [string, string]> = {
      bounds: ['出了地界了。', 'That is off the plot.'],
      gate: ['门口要留一条路。', 'Keep the way in at the gate clear.'],
      overlap: ['那里已经有东西了。', 'Something already stands there.'],
      poor: ['铜钱不够。做些差事、收收菜再来。', 'Not enough coins. Run errands or harvest, then come back.'],
      unknown: ['……', '…'],
    };
    const [zh, en] = m[r] ?? m.unknown;
    this.ctx.hud.toast(zh, en, 2200);
  }

  // ───────────────────────────── the ghost

  private fitNow(): { ok: boolean; reason: FitReason | 'poor' } {
    const s = this.ui.value;
    const k = KIND[s.kind ?? ''];
    if (!k) return { ok: false, reason: 'unknown' };
    const f = fits(home.value.items, k.id, this.gi, this.gj, this.rot, s.mode === 'move' ? s.sel ?? undefined : undefined);
    if (!f.ok) return f;
    if (s.mode === 'place' && play.value.coins < k.price) return { ok: false, reason: 'poor' };
    return f;
  }

  /** The nearest free spot around the ghost (a spiral of cells). */
  private seekFree(): void {
    const s = this.ui.value;
    const k = KIND[s.kind ?? ''];
    if (!k) return;
    const f = footprint(k, this.rot);
    const i0 = this.gi, j0 = this.gj;
    for (let r = 1; r < GRID; r++) {
      for (let a = -r; a <= r; a++) for (const [di, dj] of [[a, -r], [a, r], [-r, a], [r, a]]) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i + f.w > GRID || j + f.d > GRID) continue;
        if (fits(home.value.items, k.id, i, j, this.rot).ok) { this.gi = i; this.gj = j; return; }
      }
    }
  }

  /** Move the ghost by whole cells, in the view's own directions. */
  nudge(right: number, down: number): void {
    const s = this.ui.value;
    const k = KIND[s.kind ?? ''];
    const q = ((Math.round(this.yaw / (Math.PI / 2)) % 4) + 4) % 4;
    // screen right / down → grid (i, j) for the four views
    const R: [number, number][] = [[1, 0], [0, -1], [-1, 0], [0, 1]];
    const D: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const di = R[q][0] * right + D[q][0] * down, dj = R[q][1] * right + D[q][1] * down;
    if (s.mode === 'place' || s.mode === 'move') {
      if (!k) return;
      const f = footprint(k, this.rot);
      this.gi = clamp(this.gi + di, 0, GRID - f.w);
      this.gj = clamp(this.gj + dj, 0, GRID - f.d);
      if (di || dj) this.lastDir = [Math.sign(di), Math.sign(dj)];
      this.refresh();
    } else {
      this.tx = clamp(this.tx + di * 1.5, PLOT_X0, PLOT_X0 + GRID);
      this.tz = clamp(this.tz + dj * 1.5, PLOT_Z0, PLOT_Z0 + GRID);
    }
  }

  /** Update the ghost, its footprint, the selection mark and the fit shown in the bar. */
  refresh(): void {
    const s = this.ui.value;
    const THREE = this.ctx.THREE;
    const placing = s.mode === 'place' || s.mode === 'move';
    const k = KIND[s.kind ?? ''];
    if (placing && k) {
      const key = `${k.id}|${this.rot}|${this.text}`;
      if (key !== this.ghostKey) {
        this.ghostKey = key;
        const b = this.stage.bakeShow(k, this.text, 3, { x: 0, y: 0, z: 0, heading: (this.rot * Math.PI) / 2 });
        this.ghost.geometry.dispose();
        this.ghost.geometry = flatGeometry(THREE, b) ?? new THREE.BufferGeometry();
      }
      const f = footprint(k, this.rot);
      const y = this.stage.baseY({ kind: k.id, i: this.gi, j: this.gj, rot: this.rot });
      const cx = PLOT_X0 + this.gi + f.w / 2, cz = PLOT_Z0 + this.gj + f.d / 2;
      this.ghost.position.set(cx, y + 0.02, cz);
      this.ghost.visible = true;
      this.foot.position.set(cx, y + 0.07, cz);
      this.foot.scale.set(f.w, 1, f.d);
      this.foot.visible = true;
      const fit = this.fitNow();
      this.footMat.color.set(fit.ok ? '#6fb85a' : '#d8553f');
      this.ghostMat.color.set(fit.ok ? '#f2fff0' : '#ffb4a6');
      this.set({ fit: fit.reason });
      // keep the ghost in view
      const dx = cx - this.tx, dz = cz - this.tz, lim = this.d * 0.28;
      if (Math.abs(dx) > lim) this.tx += dx - Math.sign(dx) * lim;
      if (Math.abs(dz) > lim) this.tz += dz - Math.sign(dz) * lim;
      return;
    }
    this.ghost.visible = false;
    const it = s.mode === 'select' ? this.selItem() : undefined;
    if (it) {
      const p = itemPose(it);
      this.foot.position.set(p.x, this.stage.baseY(it) + 0.07, p.z);
      this.foot.scale.set(p.w, 1, p.d);
      this.footMat.color.set('#e6ab36');
      this.foot.visible = true;
    } else this.foot.visible = false;
  }

  private makeGrid(): void {
    const THREE = this.ctx.THREE;
    const gy = (x: number, z: number) => this.ctx.groundY(x, z) + 0.06;
    const pos: number[] = [];
    for (let a = 0; a <= GRID; a++) {
      for (let b = 0; b < GRID; b++) {
        const x = PLOT_X0 + a, z0 = PLOT_Z0 + b, z1 = z0 + 1;
        pos.push(x, gy(x, z0), z0, x, gy(x, z1), z1);
        const zz = PLOT_Z0 + a, x0 = PLOT_X0 + b, x1 = x0 + 1;
        pos.push(x0, gy(x0, zz), zz, x1, gy(x1, zz), zz);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2a211b', transparent: true, opacity: 0.24, depthWrite: false }));
    grid.renderOrder = 2;
    // the way in at the gate stays clear: a pale red wash over those cells
    const [i0, j0] = GATE_CELLS[0];
    const i1 = Math.max(...GATE_CELLS.map((c) => c[0])) + 1, j1 = Math.max(...GATE_CELLS.map((c) => c[1])) + 1;
    const pg = new THREE.PlaneGeometry(i1 - i0, j1 - j0);
    pg.rotateX(-Math.PI / 2);
    const gate = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: '#d8553f', transparent: true, opacity: 0.16, depthWrite: false }));
    const gx = PLOT_X0 + (i0 + i1) / 2, gz = PLOT_Z0 + (j0 + j1) / 2;
    gate.position.set(gx, gy(gx, gz) + 0.01, gz);
    grid.add(gate);
    this.grid = this.bag.add(grid);
  }

  // ───────────────────────────── the camera

  private frame(dt: number): void {
    if (!this.active) return;
    const cam = this.ctx.camera;
    this.frameN++;
    if (this.frameN % 10 === 0 && this.root) {
      const panel = this.root.querySelector('.hb-sheet, .hb-bar') as HTMLElement | null;
      this.sheetH = panel ? panel.getBoundingClientRect().height : 0;
    }
    const k = 1 - Math.exp(-7 * Math.min(dt, 0.1));
    this.yawNow += (this.yaw - this.yawNow) * k;
    const cp = Math.cos(PITCH), sp = Math.sin(PITCH);
    const y0 = this.stage.plotY;
    const want = this.tmp.set(this.tx + Math.sin(this.yawNow) * cp * this.d, y0 + sp * this.d, this.tz + Math.cos(this.yawNow) * cp * this.d);
    this.camPos.lerp(want, k);
    this.look.x += (this.tx - this.look.x) * k;
    this.look.y += (y0 - this.look.y) * k;
    this.look.z += (this.tz - this.look.z) * k;
    cam.position.copy(this.camPos);
    cam.lookAt(this.look);
    cam.updateMatrixWorld();
    // the sheet covers the bottom: shift the picture up by half of it
    const el = this.ctx.renderer.domElement;
    const W = el.clientWidth || 1, H = el.clientHeight || 1;
    const dyWant = Math.min(this.sheetH, H * 0.5) / 2;
    this.dy += (dyWant - this.dy) * k;
    cam.setViewOffset(W, H, 0, this.dy, W, H);
    // a gentle breath on the ghost
    const t = this.reduced ? 0 : performance.now() / 1000;
    this.ghostMat.opacity = this.ui.value.fit === 'ok' ? 0.78 + Math.sin(t * 3) * 0.08 : 0.62;
  }

  // ───────────────────────────── pointers and keys

  private groundAt(cx: number, cy: number): { x: number; z: number } | null {
    const el = this.ctx.renderer.domElement;
    const r = el.getBoundingClientRect();
    const THREE = this.ctx.THREE;
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(ndc, this.ctx.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.tmp);
    return hit ? { x: hit.x, z: hit.z } : null;
  }

  /** The ghost's anchor cell with its footprint centred on a ground point. */
  private ghostTo(x: number, z: number): void {
    const k = KIND[this.ui.value.kind ?? ''];
    if (!k) return;
    const f = footprint(k, this.rot);
    const i = clamp(Math.round(x - PLOT_X0 - f.w / 2), 0, GRID - f.w), j = clamp(Math.round(z - PLOT_Z0 - f.d / 2), 0, GRID - f.d);
    if (i !== this.gi || j !== this.gj) {
      if (i !== this.gi) this.lastDir = [Math.sign(i - this.gi), 0];
      else this.lastDir = [0, Math.sign(j - this.gj)];
      this.gi = i; this.gj = j;
      this.refresh();
    }
  }

  private onGhost(x: number, z: number): boolean {
    const k = KIND[this.ui.value.kind ?? ''];
    if (!k || !this.ghost.visible) return false;
    const f = footprint(k, this.rot);
    const cx = PLOT_X0 + this.gi + f.w / 2, cz = PLOT_Z0 + this.gj + f.d / 2;
    return Math.abs(x - cx) < f.w / 2 + 0.8 && Math.abs(z - cz) < f.d / 2 + 0.8;
  }

  private onDown(e: PointerEvent): void {
    if (e.target !== this.ctx.renderer.domElement) return;
    e.stopPropagation();
    e.preventDefault();
    const g = this.groundAt(e.clientX, e.clientY);
    const placing = this.ui.value.mode === 'place' || this.ui.value.mode === 'move';
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, ghost: placing && !!g && e.pointerType !== 'mouse' && this.onGhost(g.x, g.z), type: e.pointerType });
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      for (const p of this.ptrs.values()) { p.ghost = false; p.moved = true; }
    }
  }

  private onMove(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) {
      // the mouse hovering: the ghost follows it
      if (e.pointerType === 'mouse' && e.target === this.ctx.renderer.domElement && !e.buttons && (this.ui.value.mode === 'place' || this.ui.value.mode === 'move')) {
        const g = this.groundAt(e.clientX, e.clientY);
        if (g) this.ghostTo(g.x, g.z);
      }
      return;
    }
    e.stopPropagation();
    const px = p.x, py = p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 0 && d > 0) this.d = clamp(this.d * (this.pinch / d), 8, 42);
      this.pinch = d;
      return;
    }
    if (!p.moved && Math.hypot(p.x - p.x0, p.y - p.y0) > 7) p.moved = true;
    if (!p.moved) return;
    if (p.ghost) {
      const g = this.groundAt(e.clientX, e.clientY);
      if (g) this.ghostTo(g.x, g.z);
      return;
    }
    // pan: the ground under the finger stays under the finger
    const a = this.groundAt(px, py), b = this.groundAt(e.clientX, e.clientY);
    if (a && b) {
      this.tx = clamp(this.tx + (a.x - b.x), PLOT_X0 - 2, PLOT_X0 + GRID + 2);
      this.tz = clamp(this.tz + (a.z - b.z), PLOT_Z0 - 2, PLOT_Z0 + GRID + 2);
    }
  }

  private onUp(e: PointerEvent, cancel = false): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    e.stopPropagation();
    if (this.ptrs.size < 2) this.pinch = 0;
    if (cancel || p.moved || this.ptrs.size) return;
    // a tap
    const g = this.groundAt(e.clientX, e.clientY);
    const m = this.ui.value.mode;
    if (m === 'place' || m === 'move') {
      if (!g) return;
      const was = [this.gi, this.gj];
      this.ghostTo(g.x, g.z);
      // with a mouse a click sets it down; a finger taps the ghost again (or 置) to set it down
      if (p.type === 'mouse' || (p.ghost && was[0] === this.gi && was[1] === this.gj)) this.confirm();
      return;
    }
    this.select(this.pickAt(e.clientX, e.clientY));
  }

  /** The thing under a screen point: the nearest box the ray hits, else whatever covers the cell below. */
  private pickAt(cx: number, cy: number): string | null {
    this.groundAt(cx, cy);
    const r = this.ray.ray;
    let best: string | null = null, bt = Infinity;
    for (const e of this.stage.allEntries()) {
      const b = e.baked.box;
      const t = rayBox(r.origin, r.direction, b.x0 - 0.1, b.y0 - 0.1, b.z0 - 0.1, b.x1 + 0.1, b.y1 + 0.1, b.z1 + 0.1);
      if (t !== null && t < bt) {
        // prefer small things standing in front of big ones: shrink the distance by size a little
        bt = t; best = e.item.uid;
      }
    }
    return best;
  }

  private onWheel(e: WheelEvent): void {
    if (e.target !== this.ctx.renderer.domElement) return;
    e.preventDefault();
    e.stopPropagation();
    this.d = clamp(this.d * Math.exp(e.deltaY * 0.0012), 8, 42);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.active || e.altKey) return;
    if (document.querySelector('.hb-dlg-wrap, .walk-card-wrap, .walk-say-wrap, .walk-map-wrap')) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
    const onButton = !!tgt && (tgt.tagName === 'BUTTON' || !!tgt.closest?.('button'));
    const code = e.code;
    const s = this.ui.value;
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    if ((e.ctrlKey || e.metaKey) && code === 'KeyZ') { eat(); this.undo(); return; }
    if (e.ctrlKey || e.metaKey) return;
    switch (code) {
      case 'Escape': eat(); this.back(); return;
      case 'ArrowLeft': case 'KeyA': eat(); this.nudge(-1, 0); return;
      case 'ArrowRight': case 'KeyD': eat(); this.nudge(1, 0); return;
      case 'ArrowUp': case 'KeyW': eat(); this.nudge(0, -1); return;
      case 'ArrowDown': case 'KeyS': eat(); this.nudge(0, 1); return;
      case 'KeyR': eat(); this.turn(); return;
      case 'KeyV': eat(); this.turnView(); return;
      case 'KeyZ': eat(); this.undo(); return;
      case 'KeyB': eat(); this.exit(); return;
      // M moves the picked thing; it never opens the map over the build mode
      case 'KeyM': eat(); if (s.mode === 'select') this.startMove(); return;
      case 'Delete': case 'Backspace': if (s.mode === 'select') { eat(); this.sell(); } return;
      case 'Enter': case 'NumpadEnter': case 'Space': case 'KeyE':
        if (onButton && code !== 'KeyE') return;
        if (s.mode === 'place' || s.mode === 'move') { eat(); this.confirm(); }
        else if (code !== 'Space') eat();
        return;
      case 'KeyQ': case 'KeyF': eat(); return; // no skills or jumps while building
    }
  }
}

/** Ray–box slab test: distance along the ray, or null. */
function rayBox(o: T.Vector3, d: T.Vector3, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = -Infinity, tmax = Infinity;
  const axes: [number, number, number, number][] = [[o.x, d.x, x0, x1], [o.y, d.y, y0, y1], [o.z, d.z, z0, z1]];
  for (const [p, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) return null; continue; }
    let a = (lo - p) / v, b = (hi - p) / v;
    if (a > b) [a, b] = [b, a];
    tmin = Math.max(tmin, a);
    tmax = Math.min(tmax, b);
    if (tmin > tmax) return null;
  }
  return tmax < 0 ? null : Math.max(0, tmin);
}
