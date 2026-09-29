// 水月幻镜 · the tutorial on screen (d-tutorial §1.4, §2, §3; mirror3 CONTRACTS §5): the coach overlay
// (bubble, gold ring, brush stroke or 「在这」 tag, dim, ghost stick and keycaps, the foe card, the mini
// foe scroll, the whisper lane), the two brains that feed it (the tutorial's step machine and the
// real runs' first-time tips), the end card, the first-visit offer and ribbon, and the 设置 rows.
// Coach ink is gold with an ink hairline, never vermilion (vermilion means danger). The coach finds
// its targets by [data-tut] and hears taps on them with one capture-phase listener, so the panel and
// shop files never import any of this.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { mirror } from '../../../app/mirror';
import { Sheet, Toggle, toast } from '../../../ui/kit';
import { ITEMS } from '../data';
import { ELITE_REG, ITEM_REG, WEAPON_REG } from '../ids';
import { termName } from '../data/glossary';
import { crateItem, meltValue } from '../logic';
import { resetTips, setMirrorSettings, setTutor } from '../logic/session';
import type { RunSave, TutorTipId, Unlocks } from '../types';
import type { RunEvent, RunScreen } from '../tutor/events';
import { BUTTONS, END, LINES, OFFER, SETTINGS, TIPS, fillSlots, lineSlots, resolveLine, type Line, type LineId, type Say, type SlotVal, type TipLineId } from '../tutor/lines';
import { initTut, reduce, view, type TutState, type Whisper } from '../tutor/machine';
import { mergeLeft, swordSlot, type TutorSession } from '../tutor/session';
import { Seal } from './icons';
import { calmNow } from './prefs';
import { STICK_R } from './text';
import { markTip, primerDue, tipDue, tipsOn, tutorOf } from './tips';
import './tutorial.css';

// ───────────────────────────────────────────── what the overlay draws
export interface CoachBubble {
  key: string;
  text: string;
  sub?: string;
  mode: 'bubble' | 'hold';
  targets: readonly string[];
  btn?: string;
  foe?: { name: string; seal: string; tag: string } | null;
  tag?: boolean;
  ghost?: 'stick' | 'keys' | null;
}
export interface CoachWhisper { key: number; text: string; target?: string; then?: string; thenAt?: number; dur: number }

/** A brain turns run events into what the coach shows. */
export interface CoachBrain {
  bubble: CoachBubble | null;
  whisper: CoachWhisper | null;
  foeHp: number | null;
  /** Returns true when the engine should hold for this event's line. */
  event(ev: RunEvent): boolean;
  ok(): void;
  /** UI seconds while the coach is visible and nothing holds. */
  tick(dt: number): void;
  subscribe(fn: () => void): () => void;
}

type Input = 'touch' | 'keys';
/** The input the lines speak of: touch on a coarse pointer, else keys; the first real input decides. */
let inputMode: Input | null = null;
function currentInput(): Input {
  if (inputMode) return inputMode;
  try { return matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys'; } catch { return 'keys'; }
}
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'q', ' ']);
function watchInput(): () => void {
  const pd = (e: PointerEvent) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') inputMode = 'touch'; };
  const kd = (e: KeyboardEvent) => { if (MOVE_KEYS.has(e.key.toLowerCase())) inputMode = 'keys'; };
  window.addEventListener('pointerdown', pd, true);
  window.addEventListener('keydown', kd, true);
  return () => { window.removeEventListener('pointerdown', pd, true); window.removeEventListener('keydown', kd, true); };
}
const L = () => (lang.value === 'en' ? 'en' : 'zh') as 'zh' | 'en';
/** The shop's wide layout (Shop.tsx WIDE): 人物 is a column beside the shop, always open. */
const wideNow = () => { try { return matchMedia('(min-width: 1100px)').matches; } catch { return false; } };
const say = (x: Say) => x[L()];

class Base {
  bubble: CoachBubble | null = null;
  whisper: CoachWhisper | null = null;
  foeHp: number | null = null;
  protected queue: CoachWhisper[] = [];
  protected wT = 0;
  protected seq = 1;
  private subs = new Set<() => void>();
  subscribe(fn: () => void) { this.subs.add(fn); return () => { this.subs.delete(fn); }; }
  protected changed() { for (const f of this.subs) { try { f(); } catch { /* a view's */ } } }
  protected pushWhisper(w: Omit<CoachWhisper, 'key'>, max = 3) {
    const x = { ...w, key: this.seq++ };
    if (!this.whisper) { this.whisper = x; this.wT = 0; this.changed(); return; }
    this.queue.push(x);
    while (this.queue.length > max) this.queue.shift();
  }
  /** Drop the whisper on screen and any queued (a new between-wave step starts clean). */
  protected clearWhispers() {
    this.queue = [];
    if (this.whisper) { this.whisper = null; this.wT = 0; this.changed(); }
  }
  protected tickWhisper(dt: number) {
    // a hold's reader is busy with the hold: the whisper beside it waits too
    if (!this.whisper || this.bubble?.mode === 'hold') return;
    this.wT += dt;
    if (this.wT >= this.whisper.dur) {
      this.whisper = this.queue.shift() ?? null;
      this.wT = 0;
      this.changed();
    }
  }
}

// ───────────────────────────────────────────── the tutorial's brain
export class TutorBrain extends Base implements CoachBrain {
  st: TutState = initTut();
  private lastKey = '';
  private text = '';
  constructor(private sess: TutorSession, private o: { left: () => boolean; onRun: (r: RunSave) => void; onCloseWho: () => void; unlocks: Unlocks }) { super(); }
  private slots(run: RunSave): Record<string, SlotVal> {
    const extra: Record<string, SlotVal> = {};
    if (run.pending.crates > 0) { try { extra.meltN = meltValue(run, crateItem(run, this.o.unlocks)); } catch { /* none */ } }
    const sword = swordSlot(run);
    if (sword >= 0) extra.n0 = sword + 1;
    const lock = this.lockSlot(run);
    if (lock >= 0) {
      const s = run.shop!.slots[lock]!;
      extra.n2 = lock + 1;
      extra.i2 = nameSay(s.id);
    }
    return extra;
  }
  /** H5's slot: 草鞋 in the third slot, else the first slot still for sale. */
  private lockSlot(run: RunSave): number {
    const sl = run.shop?.slots ?? [];
    if (sl[2]) return 2;
    return sl.findIndex((x) => !!x);
  }
  private line(id: LineId): string {
    const run = this.sess.run();
    return resolveLine(LINES[id] as Line, { lang: L(), input: currentInput(), left: this.o.left(), slots: lineSlots(this.slots(run)) });
  }
  private refresh() {
    const v = view(this.st);
    if (!v) {
      if (this.bubble) { this.bubble = null; this.lastKey = ''; this.changed(); }
      return;
    }
    let targets = v.target;
    if (v.id === 'H5') { const k = this.lockSlot(this.sess.run()); targets = k >= 0 ? [`lock:${k}`] : []; }
    // H2 points at the 青锋剑 itself: a reroll may have moved it
    else if (v.id === 'H2') { const k = swordSlot(this.sess.run()); targets = k >= 0 ? [`slot:${k}`] : []; }
    // H7 on a wide screen: 人物 is already a column, the line says so
    const lineId: LineId = v.id === 'H7' && !v.nudged && wideNow() ? 'H7w' : v.line;
    const key = `${v.id}|${lineId}|${targets.join()}`;
    if (key !== this.lastKey) { this.text = this.line(lineId); this.lastKey = key; }
    const inp = currentInput();
    const b: CoachBubble = {
      key: v.id, text: this.text, mode: v.mode, targets, tag: v.tag,
      btn: v.btn ? say(BUTTONS[v.btn]) : undefined,
      foe: v.foe ? { name: nameSay('whitesnake')[L()], seal: nameSay('whitesnake').zh, tag: termName('elite', (z, e) => (L() === 'en' ? e : z)) } : null,
      ghost: v.id === 'W1' ? (inp === 'touch' ? 'stick' : 'keys') : null,
    };
    const same = this.bubble && this.bubble.key === b.key && this.bubble.text === b.text && this.bubble.targets.join() === b.targets.join();
    if (!same) { this.bubble = b; this.changed(); }
    if (v.id === 'H3a') {
      // 兵器 already open (a wide screen has no 人物 tab): the step is done before it is read
      requestAnimationFrame(() => {
        if (this.st.step !== 'H3a') return;
        const tab = document.querySelector('[data-tut="tab:wpn"]');
        const open = tab ? tab.getAttribute('aria-selected') === 'true' : !!document.querySelector('[data-tut="wslot:0"]');
        if (open) this.event({ k: 'ui', tut: 'tab:wpn', selected: true });
      });
    }
  }
  private apply(o: ReturnType<typeof reduce>, prevStep: string | null) {
    this.st = o.state;
    // between waves a new step starts clean: what was said for the last one is stale now
    const wave = this.st.phase === 'w1' || this.st.phase === 'w2' || this.st.phase === 'w3';
    if (!wave && this.st.step !== prevStep && this.st.step !== null) this.clearWhispers();
    const keys = currentInput() === 'keys';
    for (const w of o.whispers) {
      if (w.line === 'D3c' && keys) continue; // the drag-to-aim line is for the touch button only
      this.pushWhisper(this.toWhisper(w));
    }
    if (o.grant) {
      const n = this.sess.grant();
      if (n > 0) { this.o.onRun(this.sess.run()); this.pushWhisper(this.toWhisper({ line: 'H2b', dur: 4.5 })); }
    }
    // the second sword was rerolled away or never bought: the merge lesson can't happen, skip it
    if (this.st.phase === 'shop1' && !this.st.done.includes('H3') && !mergeLeft(this.sess.run(), this.st.done.includes('H2'))) {
      const before = this.st.step;
      this.st = reduce(this.st, { k: 'noMerge' }).state;
      if (this.st.step !== before) this.clearWhispers();
    }
    if (prevStep === 'H7b' && this.st.step !== 'H7b') this.o.onCloseWho();
    const fh = this.st.foeHp;
    if (fh !== this.foeHp) { this.foeHp = fh; this.changed(); }
    this.refresh();
  }
  private toWhisper(w: Whisper): Omit<CoachWhisper, 'key'> {
    return { text: this.line(w.line), target: w.target, then: w.then, thenAt: w.thenAt, dur: w.dur };
  }
  event(ev: RunEvent): boolean {
    const prev = this.st.step;
    const o = reduce(this.st, ev);
    if (ev.k === 'hud' && o.state === this.st && !o.whispers.length) return false;
    this.apply(o, prev);
    return o.hold;
  }
  ok() { const prev = this.st.step; this.apply(reduce(this.st, { k: 'ok' }), prev); }
  tick(dt: number) {
    this.tickWhisper(dt);
    const prev = this.st.step, n0 = this.st.nudged;
    const o = reduce(this.st, { k: 'tick', dt });
    if (o.state.step === prev && o.state.nudged === n0 && !o.grant && !o.whispers.length) { this.st = o.state; return; }
    this.apply(o, prev);
  }
}
/** A weapon's, item's or foe's name in both languages. */
function nameSay(id: string): Say {
  const n = [...WEAPON_REG, ...ITEM_REG, ...ELITE_REG].find((x) => x.id === id);
  return n ? { zh: n.zh, en: n.en } : { zh: id, en: id };
}

// ───────────────────────────────────────────── the real runs' first-time tips
export class TipsBrain extends Base implements CoachBrain {
  private screenNow: RunScreen | null = null;
  private waveT = 0;
  private since = 99;
  private lowHp = false;
  private crateId: string | null = null;
  constructor(private o: { run: () => RunSave; unlocks: Unlocks; busy: () => boolean }) { super(); }
  private text(id: TipLineId, extra: Record<string, SlotVal> = {}): string {
    return resolveLine(TIPS[id] as Line, { lang: L(), input: currentInput(), left: false, slots: lineSlots(extra) });
  }
  private due(id: TutorTipId): boolean { return tipDue(mirror.value, id); }
  /** An in-wave whisper: never in a wave's first 2 s, never over a hold or sheet, 8 s apart, one queued. */
  private wave(id: TutorTipId, line: TipLineId, target?: string) {
    if (!this.due(id)) return;
    if (this.waveT < 2 || this.o.busy() || this.since < 8) { if (!this.queue.length) this.pending = { id, line, target }; return; }
    markTip(id);
    this.since = 0;
    this.pushWhisper({ text: this.text(line), target, dur: 5 }, 1);
  }
  private pending: { id: TutorTipId; line: TipLineId; target?: string } | null = null;
  private card(id: TutorTipId, text: string, targets: string[], sub?: string) {
    markTip(id);
    this.bubble = { key: id, text, sub, mode: 'hold', targets, btn: say(BUTTONS.ok) };
    this.changed();
  }
  /** The boss card's own tip line (BossCard `tip`), once. */
  bossTip(): { line: string; go: string } | null {
    if (!this.due('boss')) return null;
    markTip('boss');
    return { line: this.text('boss'), go: say(BUTTONS.go) };
  }
  event(ev: RunEvent): boolean {
    if (!tipsOn(mirror.value)) return false;
    switch (ev.k) {
      case 'screen': {
        this.screenNow = ev.s;
        if (this.bubble) { this.bubble = null; this.changed(); }
        if (ev.s === 'wave') { this.waveT = 0; this.since = 99; this.lowHp = false; }
        const run = this.o.run();
        if (ev.s === 'crate' && this.due('crateOpen')) {
          let melt = 0;
          try { const id = crateItem(run, this.o.unlocks); melt = meltValue(run, id); this.crateId = id; } catch { /* none */ }
          this.card('crateOpen', this.text('crateOpen', { meltN: melt }), ['crateKeep', 'crateMelt']);
        } else if (ev.s === 'cards' && primerDue(mirror.value, 'cards')) this.card('cards', this.text('cards'), ['cards']);
        else if (ev.s === 'shop' && primerDue(mirror.value, 'shop')) this.card('shop', this.text('shop'), ['slots']);
        // the first 镜宝 (a boss fell): what it is and where it went, once
        else if (ev.s === 'shop' && this.due('relic') && Object.entries(run.items).some(([id, n]) => (n ?? 0) > 0 && !!ITEMS[id as keyof typeof ITEMS]?.relic)) this.card('relic', this.text('relic'), ['tab:bag']);
        if (!this.bubble) this.curseCheck();
        break;
      }
      case 'act': if (!this.bubble) this.curseCheck(); break;
      case 'crate': if (ev.total >= 1) this.wave('crate', 'crate', 'crates'); break;
      case 'cue': if (ev.key === 'elite') this.wave('elite', 'elite'); break;
      case 'hud': {
        const low = ev.s.lowHp;
        if (low && !this.lowHp && this.waveT >= 3) this.wave('lowHp', 'lowHp', 'hp');
        this.lowHp = low;
        break;
      }
      default: break;
    }
    return false;
  }
  /** A card with 劫数 on screen for the first time (a shop slot, the casket, a 镜心 choice). */
  private curseCheck() {
    if (!this.due('curse')) return;
    const run = this.o.run();
    let target: string | null = null;
    if (this.screenNow === 'shop') {
      const i = (run.shop?.slots ?? []).findIndex((x) => x?.kind === 'item' && (ITEMS[x.id].curse ?? 0) > 0);
      if (i >= 0) target = `slot:${i}`;
    } else if (this.screenNow === 'crate') {
      let id = this.crateId;
      try { id = crateItem(run, this.o.unlocks); } catch { /* none */ }
      if (id && (ITEMS[id as keyof typeof ITEMS]?.curse ?? 0) > 0) target = 'crateCard';
    }
    if (!target) return;
    this.card('curse', this.text('curse'), [target], this.text('curseSmall'));
  }
  ok() { if (this.bubble) { this.bubble = null; this.changed(); this.curseCheck(); } }
  tick(dt: number) {
    this.tickWhisper(dt);
    if (this.screenNow === 'wave') {
      this.waveT += dt;
      this.since += dt;
      const p = this.pending;
      if (p && !this.whisper && this.waveT >= 2 && this.since >= 8 && !this.o.busy()) { this.pending = null; this.wave(p.id, p.line, p.target); }
    }
  }
}

// ───────────────────────────────────────────── the overlay
interface Rect { x: number; y: number; w: number; h: number }
function findTarget(tut: string): Element | null {
  const all = Array.from(document.querySelectorAll(`[data-tut="${CSS.escape ? CSS.escape(tut) : tut}"]`));
  const vis = all.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  return vis.find((el) => !!el.closest('.sheet')) ?? vis[0] ?? null;
}
function rectOf(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/**
 * The overlay. `inWave`: bubbles take the top lane and never dim; between waves the lane is the one
 * farther from the target, the target is scrolled into view once, and a hold dims around it.
 */
export function Coach(props: { brain: CoachBrain; inWave: boolean; left: boolean; hidden: boolean; onOk: () => void }) {
  const t = useT();
  const { brain } = props;
  const [, setN] = useState(0);
  useEffect(() => brain.subscribe(() => setN((n) => n + 1)), [brain]);
  useEffect(() => watchInput(), []);
  const root = useRef<HTMLDivElement>(null);
  const lane = useRef<HTMLDivElement>(null);
  const bubbleEl = useRef<HTMLDivElement>(null);
  const rings = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const wring = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const tagEl = useRef<HTMLSpanElement>(null);
  const dims = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const okBtn = useRef<HTMLButtonElement>(null);
  const b = props.hidden ? null : brain.bubble;
  const w = props.hidden ? null : brain.whisper;
  const hold = !!b && b.mode === 'hold';
  const calm = calmNow();
  const wStart = useRef(0);
  useEffect(() => { wStart.current = performance.now(); }, [w?.key]);

  // a tap on any [data-tut] target (capture phase), ARIA state read on the next frame
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tut]') as HTMLElement | null;
      if (!el || el.closest('.mj-tut')) return;
      const tut = el.getAttribute('data-tut') ?? '';
      requestAnimationFrame(() => {
        const a = (n: string) => { const v = el.getAttribute(n); return v === null ? undefined : v === 'true'; };
        brain.event({ k: 'ui', tut, selected: a('aria-selected'), pressed: a('aria-pressed'), expanded: a('aria-expanded') });
      });
    };
    document.addEventListener('click', on, true);
    return () => document.removeEventListener('click', on, true);
  }, [brain]);

  // UI seconds for nudges, skips and whispers (not while hidden or held)
  useEffect(() => {
    let last = performance.now();
    const k = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      // whispers run on; a hold's own clock waits (the machine ignores ticks on a hold)
      if (!props.hidden) brain.tick(dt);
    }, 100);
    return () => clearInterval(k);
  }, [brain, props.hidden]);

  // a hold: its button takes focus; Enter presses it; other keys wait (Esc still pauses)
  useEffect(() => {
    if (!hold) return;
    const f = requestAnimationFrame(() => okBtn.current?.focus({ preventScroll: true }));
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'escape') return;
      if (k === 'enter' || k === ' ') { e.preventDefault(); e.stopPropagation(); props.onOk(); return; }
      if (k.length === 1 || k.startsWith('arrow')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('keydown', kd, true);
    return () => { cancelAnimationFrame(f); window.removeEventListener('keydown', kd, true); };
  }, [hold, b?.key]);

  // scroll a between-wave target into view once, before the bubble settles
  useEffect(() => {
    if (!b || props.inWave || !b.targets.length) return;
    const el = findTarget(b.targets[0]);
    try { el?.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' }); } catch { /* old engines */ }
  }, [b?.key, b?.targets.join()]);

  // layout: rings, lane, stroke, tag, dim — measured every frame while something points
  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      // nothing to point at: hide once and stop (a real wave pays no per-frame cost); the effect runs
      // again as soon as a bubble or a whisper appears
      if (b || w) raf = requestAnimationFrame(place);
      const vw = window.innerWidth, vh = window.innerHeight;
      const tgs = b?.targets ?? [];
      const rs: (Rect | null)[] = [rectOf(tgs[0] ? findTarget(tgs[0]) : null), rectOf(tgs[1] ? findTarget(tgs[1]) : null)];
      rings.forEach((r, i) => {
        const el = r.current;
        if (!el) return;
        const x = rs[i];
        if (!x) { el.style.display = 'none'; return; }
        el.style.display = 'block';
        el.style.transform = `translate(${x.x - 6}px, ${x.y - 6}px)`;
        el.style.width = `${x.w + 12}px`;
        el.style.height = `${x.h + 12}px`;
      });
      // the whisper's target ring
      let wx: Rect | null = null;
      if (w?.target && !hold) {
        const at = w.then && w.thenAt !== undefined && (performance.now() - wStart.current) / 1000 >= w.thenAt ? w.then : w.target;
        wx = rectOf(findTarget(at));
      }
      const wr = wring.current;
      if (wr) {
        if (!wx) wr.style.display = 'none';
        else { wr.style.display = 'block'; wr.style.transform = `translate(${wx.x - 6}px, ${wx.y - 6}px)`; wr.style.width = `${wx.w + 12}px`; wr.style.height = `${wx.h + 12}px`; }
      }
      // the lane: in a wave always the top; between waves the one farther from the target
      const ln = lane.current;
      const main = rs[0];
      if (ln) {
        const top = props.inWave || !main || main.y + main.h / 2 > vh / 2;
        ln.classList.toggle('is-top', top);
        ln.classList.toggle('is-bottom', !top);
      }
      // the stroke from the bubble to the ring, or the 「在这」 tag for a far target
      const bb = rectOf(bubbleEl.current);
      const p = path.current, tg = tagEl.current;
      if (p && tg) {
        if (!bb || !main) { p.style.display = 'none'; tg.style.display = 'none'; }
        else {
          const cx = main.x + main.w / 2, cy = main.y + main.h / 2;
          const below = cy > bb.y + bb.h;
          const sx = Math.max(bb.x + 16, Math.min(bb.x + bb.w - 16, cx));
          const sy = below ? bb.y + bb.h : bb.y;
          const ex = cx, ey = below ? main.y - 8 : main.y + main.h + 8;
          const dist = Math.abs(ey - sy);
          const far = b?.tag || dist > vh * 0.45;
          if (far) {
            p.style.display = 'none';
            tg.style.display = 'block';
            const tx = Math.max(16, Math.min(vw - 16 - tg.offsetWidth, main.x + main.w / 2 - tg.offsetWidth / 2));
            const ty = main.y > 40 ? main.y - 12 - tg.offsetHeight : main.y + main.h + 12;
            tg.style.transform = `translate(${tx}px, ${ty}px)`;
          } else if (dist < 24 || (cy >= bb.y && cy <= bb.y + bb.h)) {
            p.style.display = 'none'; tg.style.display = 'none';
          } else {
            tg.style.display = 'none';
            p.style.display = 'block';
            const mx = (sx + ex) / 2 + (ex > sx ? -1 : 1) * Math.min(40, Math.abs(ex - sx) * 0.25);
            const my = (sy + ey) / 2;
            p.setAttribute('d', `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`);
          }
        }
      }
      // the dim around the target (between waves, holds only)
      const dimOn = hold && !props.inWave && !!main;
      const [d0, d1, d2, d3] = dims.map((d) => d.current);
      if (d0 && d1 && d2 && d3) {
        for (const d of [d0, d1, d2, d3]) d.style.display = dimOn ? 'block' : 'none';
        if (dimOn && main) {
          const x0 = Math.max(0, main.x - 6), y0 = Math.max(0, main.y - 6), x1 = Math.min(vw, main.x + main.w + 6), y1 = Math.min(vh, main.y + main.h + 6);
          Object.assign(d0.style, { left: '0px', top: '0px', width: `${vw}px`, height: `${y0}px` });
          Object.assign(d1.style, { left: '0px', top: `${y1}px`, width: `${vw}px`, height: `${Math.max(0, vh - y1)}px` });
          Object.assign(d2.style, { left: '0px', top: `${y0}px`, width: `${x0}px`, height: `${Math.max(0, y1 - y0)}px` });
          Object.assign(d3.style, { left: `${x1}px`, top: `${y0}px`, width: `${Math.max(0, vw - x1)}px`, height: `${Math.max(0, y1 - y0)}px` });
        }
      }
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [b?.key, b?.targets.join(), w?.key, props.inWave, hold]);

  const foe = b?.foe ?? null;
  return (
    <div class={'mj-tut mj-coach' + (hold ? ' is-hold' : '') + (props.inWave ? ' is-wave' : ' is-between') + (calm ? ' is-calm' : '')} ref={root} aria-hidden={!b && !w ? 'true' : undefined}>
      {hold && <div class="mj-tut-block" />}
      {dims.map((d) => <div class="mj-tut-dim" ref={d} />)}
      <svg class="mj-tut-stroke" aria-hidden="true"><path ref={path} /></svg>
      {rings.map((r, i) => <div class={'mj-tut-ring' + (b?.key && i === 0 ? ' is-main' : '')} ref={r} key={`r${i}${b?.key ?? ''}`} aria-hidden="true" />)}
      <div class="mj-tut-ring is-whisper" ref={wring} aria-hidden="true" />
      <span class="mj-tut-tag" ref={tagEl} aria-hidden="true">{say(BUTTONS.here)}</span>
      {b?.ghost === 'stick' && <GhostStick left={props.left} calm={calm} />}
      {b && foe && hold ? (
        <div class="mj-tut-foe" role="dialog" aria-label={foe.name} aria-describedby="mj-tut-foe-text" data-step={b.key}>
          <div class="mj-tut-foe-card">
            <Seal text={foe.seal} size={64} label={foe.name} />
            <h2 class="brush">{foe.name}</h2>
            <span class="mj-tut-foetag">{foe.tag}</span>
            <p id="mj-tut-foe-text">{b.text}</p>
            <button type="button" class="btn btn-primary mj-big mj-tut-ok" ref={okBtn} onClick={props.onOk}>{b.btn}</button>
          </div>
        </div>
      ) : null}
      <div class="mj-tut-lane" ref={lane}>
        {b && !(foe && hold) && (
          <div class={'mj-tut-bubble' + (hold ? ' is-hold' : '')} ref={bubbleEl} key={b.key} data-step={b.key} role={hold ? 'dialog' : 'note'} aria-live={hold ? undefined : 'polite'} aria-label={hold ? t('提示', 'Tip') : undefined} aria-describedby={hold ? (b.sub ? 'mj-tut-text mj-tut-sub' : 'mj-tut-text') : undefined}>
            <p class="mj-tut-text" id="mj-tut-text">{b.text}</p>
            {b.sub && <p class="mj-tut-sub" id="mj-tut-sub">{b.sub}</p>}
            {b.ghost === 'keys' && <KeyCaps />}
            {hold && b.btn && <button type="button" class="btn btn-primary mj-tut-ok" ref={okBtn} onClick={props.onOk}>{b.btn}</button>}
          </div>
        )}
        {w && <p class="mj-tut-whisper" key={w.key} role="status" aria-live="polite">{w.text}</p>}
      </div>
      {props.inWave && brain.foeHp !== null && (
        <div class="mj-tut-foebar" aria-hidden="true"><i style={{ transform: `scaleX(${Math.max(0, Math.min(1, brain.foeHp))})` }} /></div>
      )}
    </div>
  );
}

function GhostStick(props: { left: boolean; calm: boolean }) {
  return (
    <div class={'mj-tut-ghost' + (props.left ? ' is-left' : '') + (props.calm ? ' is-calm' : '')} style={{ width: `${STICK_R * 2}px`, height: `${STICK_R * 2}px` }} aria-hidden="true">
      <i class="mj-tut-ghost-knob" />
      {props.calm && <b class="mj-tut-ghost-arrow">→</b>}
    </div>
  );
}
function KeyCaps() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const map: Record<string, string> = { w: 'w', a: 'a', s: 's', d: 'd', arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd' };
    const kd = (e: KeyboardEvent) => { const k = map[e.key.toLowerCase()]; if (k) setOn((o) => (o[k] ? o : { ...o, [k]: true })); };
    const ku = (e: KeyboardEvent) => { const k = map[e.key.toLowerCase()]; if (k) setOn((o) => ({ ...o, [k]: false })); };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);
  return (
    <div class="mj-tut-keys" aria-hidden="true">
      <span />{(['w'] as const).map((k) => <kbd class={on[k] ? 'is-on' : ''}>{k.toUpperCase()}</kbd>)}<span />
      {(['a', 's', 'd'] as const).map((k) => <kbd class={on[k] ? 'is-on' : ''}>{k.toUpperCase()}</kbd>)}
    </div>
  );
}

// ───────────────────────────────────────────── the end card
export function TutorEnd(props: { onEnter: () => void; onLobby: () => void }) {
  const t = useT();
  useEffect(() => { setTutor({ done: true }); }, []);
  const slots = lineSlots();
  const f = (x: Say) => fillSlots(x[L()], slots, L());
  const go = useRef<HTMLButtonElement>(null);
  useEffect(() => { go.current?.focus({ preventScroll: true }); }, []);
  return (
    <div class="mj-tut mj-tut-end" role="group" aria-labelledby="mj-tut-end-h">
      <h2 class="brush mj-tut-end-title" id="mj-tut-end-h">{say(END.title)}</h2>
      <p class="mj-tut-end-sub">{say(END.sub)}</p>
      <ul class="mj-tut-end-lines">
        {END.lines.map((x) => <li>{f(x)}</li>)}
      </ul>
      <div class="mj-row-actions mj-tut-end-actions">
        <button type="button" class="btn btn-seal mj-big" ref={go} onClick={props.onEnter}>{say(END.enter)}</button>
        <button type="button" class="btn mj-big" onClick={props.onLobby}>{say(END.back)}</button>
      </div>
      <p class="muted mj-small">{f(END.foot)}</p>
      <span class="visually-hidden">{t('教程完成', 'Tutorial complete')}</span>
    </div>
  );
}

// ───────────────────────────────────────────── the offer (newcomer) and the ribbon (existing player)
export function TutorOffer(props: { open: boolean; onYes: () => void; onNo: () => void }) {
  const slots = lineSlots();
  const close = (yes: boolean) => { setTutor({ offered: true }); (yes ? props.onYes : props.onNo)(); };
  return (
    <Sheet open={props.open} onClose={() => close(false)} title={say(OFFER.title)} label={say(OFFER.title)}>
      <div class="mj-tut mj-tut-offer">
        <p>{say(OFFER.body)}</p>
        <div class="mj-row-actions">
          <button type="button" class="btn btn-primary mj-big" onClick={() => close(true)}>{say(OFFER.yes)}</button>
          <button type="button" class="btn btn-ghost" onClick={() => close(false)}>{say(OFFER.no)}</button>
        </div>
        <p class="muted mj-small">{fillSlots(say(OFFER.note), slots, L())}</p>
      </div>
    </Sheet>
  );
}
export function TutorRibbon(props: { onGo: () => void; onClose: () => void }) {
  return (
    <div class="mj-tut mj-tut-ribbon card" role="note">
      <span class="brush mj-tut-ribbon-glyph" aria-hidden="true">初</span>
      <p>{say(OFFER.ribbon)}</p>
      <button type="button" class="btn btn-small btn-primary" onClick={() => { setTutor({ offered: true }); props.onGo(); }}>{say(OFFER.ribbonGo)}</button>
      <button type="button" class="btn btn-small btn-ghost btn-icon" aria-label={say(OFFER.close)} onClick={() => { setTutor({ offered: true }); props.onClose(); }}>✕</button>
    </div>
  );
}

// ───────────────────────────────────────────── 设置
export function TutorSettings(props: { onReplay: () => void }) {
  const m = mirror.value;
  const on = tipsOn(m);
  const any = Object.keys(tutorOf(m).tips).length > 0;
  return (
    <div class="mj-tut mj-tut-settings">
      <div class="row">
        <div class="row-main"><div class="row-title">{say(SETTINGS.tips)}</div><div class="row-sub">{say(SETTINGS.tipsSub)}</div></div>
        <Toggle checked={on} onChange={(v) => setMirrorSettings({ tips: v })} label={say(SETTINGS.tips)} />
      </div>
      <button type="button" class="row mj-tut-row" disabled={!any} onClick={() => { resetTips(); toast(say(SETTINGS.resetDone), 2400); }}>
        <div class="row-main"><div class="row-title">{say(SETTINGS.reset)}</div><div class="row-sub">{say(SETTINGS.resetSub)}</div></div>
      </button>
      <button type="button" class="row mj-tut-row" onClick={props.onReplay}>
        <div class="row-main"><div class="row-title"><span class="brush" aria-hidden="true">初</span> {say(SETTINGS.replay)}</div><div class="row-sub">{say(SETTINGS.replaySub)}</div></div>
      </button>
    </div>
  );
}
