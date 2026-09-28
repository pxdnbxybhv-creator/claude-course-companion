// 开篇 · the film's words on screen (spec §5): captions in the caption band (the gate's shared
// classes in gate.css), the quotes as vertical brush columns inked one glyph per 0.17 s, the page's
// labels, and S12's title, seal, date and colophon. Every line is also mirrored into the card's
// aria-live region with its full punctuation and attribution. Driven per frame from film time, so
// seeking, holds and resumes need nothing special; opacity and transform only.
import type { Cut } from '../../app/intro';
import { COLUMN_PITCH, END_SHIFT, TEXT, columnPx, layoutFor, type Txt } from './shots';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

/** `next`: the next caption's first in-time (the band holds one caption at a time). */
interface CapEl { txt: Txt; p: HTMLElement; lines: HTMLElement[]; next: number }
interface ColEl { txt: Txt; box: HTMLElement; glyphs: HTMLElement[][]; by: HTMLElement | null }

export interface CaptionOpts {
  cut: Cut;
  w: number;
  h: number;
  reduced: boolean;
  /** The line C22 shows (skyLine) and the date D (todayLine), filled at run time. */
  sky: string;
  date: string;
}

/** Where a vertical column sits (css px of the viewport) and its glyph size. */
function colGeo(id: string, w: number, h: number, n: number): { x: number[]; y0: number; size: number; by: { x: number; y: number; px: number } } {
  const { cls, mix } = layoutFor(w, h);
  const P = mix < 0.5;
  const shortL = cls === 'shortL';
  // portrait: the columns start below the 「声」/「略过」 chips (44 px at 12 px from the top)
  const clear = (y: number) => (P ? Math.max(y, 64) : y);
  if (id === 'Q1') {
    const size = columnPx(P ? 30 : 32, n, w, h);
    return { x: [(P ? 0.8 : 0.79) * w], y0: clear((shortL ? 0.06 : P ? 0.05 : 0.07) * h), size, by: { x: (P ? 0.71 : 0.76) * w, y: (P ? 0.24 : 0.19) * h, px: P ? 12 : 13 } };
  }
  if (id === 'Q3') {
    const size = columnPx(P ? 28 : 32, n, w, h);
    const xs = P ? [0.8 * w, 0.7 * w] : [0.9 * w, 0.84 * w];
    const y0 = P ? Math.max(0.08 * h, 72) : (shortL ? 0.06 : 0.1) * h;
    const px = P ? 12 : 13;
    // the by-line stands ≥ 10 px clear of the answer column (its vertical box is ~1.6 em wide)
    return { x: xs, y0, size, by: { x: xs[1] - size / 2 - 10 - 1.1 * px, y: y0 + size * 3.2, px } };
  }
  // L1: WenKai 17 px, a vertical label
  return { x: [(P ? 0.05 : 0.86) * w], y0: clear((P ? 0.05 : 0.07) * h), size: Math.min(17, (0.35 * h) / 16), by: { x: 0, y: 0, px: 0 } };
}

export class Captions {
  private caps: CapEl[] = [];
  private cols: ColEl[] = [];
  private band: HTMLElement;
  private capBox: HTMLElement;
  private said = new Set<string>();
  private live: HTMLElement | null;
  private reduced: boolean;

  constructor(slot: HTMLElement, stage: HTMLElement, o: CaptionOpts) {
    this.reduced = o.reduced;
    const doc = slot.ownerDocument;
    this.live = slot.closest('.intro-film')?.querySelector<HTMLElement>('.intro-live') ?? null;
    this.band = doc.createElement('div');
    this.band.className = 'intro-capband';
    this.band.setAttribute('aria-hidden', 'true');
    this.capBox = doc.createElement('div');
    this.capBox.className = 'intro-caps';
    this.capBox.setAttribute('aria-hidden', 'true');
    slot.append(this.band, this.capBox);
    for (const txt of TEXT[o.cut]) {
      if (txt.id === 'C1' || txt.id === 'slip' || txt.id === 'T' || txt.id === 'D' || txt.id === 'K') continue; // the gate's C1; the canvas's slip; S12's own
      if (txt.kind === 'cap') {
        const p = doc.createElement('p');
        p.className = 'intro-cap intro-fcap';
        const lines = txt.lines.map((l) => {
          const s = doc.createElement('span');
          s.className = 'intro-cap-line';
          s.textContent = txt.live === 'sky' ? o.sky : l.zh;
          p.append(s);
          return s;
        });
        p.style.display = 'none';
        this.capBox.append(p);
        this.caps.push({ txt, p, lines, next: Infinity });
      } else {
        const g = colGeo(txt.id, o.w, o.h, [...txt.lines[0].zh].length);
        const box = doc.createElement('div');
        box.className = txt.kind === 'quote' ? 'intro-quote' : 'intro-label';
        box.setAttribute('aria-hidden', 'true');
        const glyphs = txt.lines.map((l, i) => {
          const col = doc.createElement('div');
          col.className = txt.kind === 'quote' ? 'intro-col brush' : 'intro-col intro-col-label';
          col.style.cssText = `left:${g.x[i] - g.size / 2}px;top:${g.y0}px;font-size:${g.size}px;line-height:${COLUMN_PITCH}`;
          const cs = [...l.zh].filter((c) => txt.kind !== 'quote' || /[\u3400-\u9fff]/.test(c)).map((c) => {
            const s = doc.createElement('span');
            s.textContent = c;
            if (c === ' ') s.style.height = '0.4em';
            col.append(s);
            return s;
          });
          box.append(col);
          return cs;
        });
        let by: HTMLElement | null = null;
        if (txt.by) {
          by = doc.createElement('div');
          by.className = 'intro-by';
          by.textContent = txt.by;
          by.style.cssText = `left:${g.by.x - g.by.px / 2}px;top:${g.by.y}px;font-size:${g.by.px}px`;
          box.append(by);
        }
        box.style.opacity = '0';
        stage.append(box);
        this.cols.push({ txt, box, glyphs, by });
      }
    }
    for (const c of this.caps) {
      const a0 = c.txt.lines[0].at;
      for (const d of this.caps) if (d.txt.lines[0].at > a0) c.next = Math.min(c.next, d.txt.lines[0].at);
    }
  }

  /** Per frame: which lines are up, how far each column has inked. */
  update(t: number): void {
    const fade = this.reduced ? 0.6 : 0.35;
    let anyCap = 0;
    for (const c of this.caps) {
      const a0 = c.txt.lines[0].at;
      // the fade-out is over by the next caption's in-time: two captions never share the band
      const fo = Math.min(fade, Math.max(0.05, c.next - c.txt.out));
      const on = t >= a0 - 0.01 && t < c.txt.out + fo;
      if (!on) { if (c.p.style.display !== 'none') c.p.style.display = 'none'; continue; }
      c.p.style.display = '';
      const out = 1 - span(t, c.txt.out, c.txt.out + fo);
      anyCap = Math.max(anyCap, Math.min(span(t, a0, a0 + fade), out));
      c.txt.lines.forEach((l, i) => {
        const u = span(t, l.at, l.at + fade) * out;
        const el = c.lines[i];
        el.style.opacity = u.toFixed(3);
        el.style.transform = this.reduced || u >= 1 ? 'none' : `translateY(${((1 - span(t, l.at, l.at + fade)) * 4).toFixed(2)}px)`;
        if (t >= l.at) this.say(`${c.txt.id}:${i}`, c.lines[i].textContent ?? l.zh);
      });
    }
    this.band.style.opacity = anyCap.toFixed(3);
    for (const col of this.cols) {
      const a0 = col.txt.lines[0].at;
      const up = t >= a0 - 0.01 && t < col.txt.out + fade;
      col.box.style.display = up ? '' : 'none';
      if (!up) continue;
      const out = 1 - span(t, col.txt.out - (col.txt.id === 'L1' ? 0.3 : 0), col.txt.out + (col.txt.id === 'L1' ? 0 : fade));
      col.box.style.opacity = out.toFixed(3);
      col.txt.lines.forEach((l, i) => {
        col.glyphs[i].forEach((s, k) => {
          const at = col.txt.kind === 'quote' && !this.reduced ? l.at + k * 0.17 : l.at;
          const u = span(t, at, at + (col.txt.kind === 'quote' ? 0.22 : 0.6));
          // 15.5: 「半亩」 in Q1 takes a second pass of ink
          const named = col.txt.id === 'Q1' && k < 2 && t >= 15.5 ? span(t, 15.5, 15.8) : 0;
          s.style.opacity = (u * (0.86 + 0.14 * named)).toFixed(3);
          if (named > 0) s.style.textShadow = `0 0 ${(named * 1).toFixed(2)}px rgba(27,25,22,.8)`;
        });
      });
      if (col.by) col.by.style.opacity = span(t, col.txt.lines[col.txt.lines.length - 1].at + 0.9, col.txt.lines[col.txt.lines.length - 1].at + 1.5).toFixed(3);
      if (t >= a0) this.say(col.txt.id, col.txt.aria ?? col.txt.lines.map((l) => l.zh).join(''));
    }
  }

  private say(key: string, text: string): void {
    if (this.said.has(key) || !this.live) return;
    this.said.add(key);
    this.live.textContent = text;
  }

  /** Tell the live region something the film shows outside the captions (S12's date and colophon). */
  announce(key: string, text: string): void {
    this.say(key, text);
  }

  destroy(): void {
    this.band.remove();
    this.capBox.remove();
    for (const c of this.cols) c.box.remove();
  }
}

// ---------------------------------------------------------------------------------------------- S12's words

/** The settle animates these properties only (tests pin it: no clipping, no layout). */
export const SETTLE_PROPS = ['transform', 'opacity'] as const;

export interface EndTargets {
  /** The header's h1 rect (viewport), or null: the title fades in place near the top left. */
  title: DOMRect | null;
  date: DOMRect | null;
  /** The canvas rect (viewport) the painting lands in. */
  rect: { x: number; y: number; w: number; h: number };
  mail: DOMRect | null;
}

/**
 * 「半亩」 brushing in where the header's title is (at k × 34 px), the square seal just right of 亩,
 * today's date on .garden-date's rect, and the colophon at the painting's bottom right; the settle
 * scales the title into the h1 and fades the rest (transform and opacity only).
 */
/** env(safe-area-inset-top) in px (0 where unsupported). */
function safeTop(doc: Document): number {
  try {
    const d = doc.createElement('div');
    d.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none';
    doc.body.append(d);
    const v = d.getBoundingClientRect().height;
    d.remove();
    return Number.isFinite(v) ? v : 0;
  } catch { return 0; }
}

export class EndWords {
  private title: HTMLElement;
  private glyphs: HTMLElement[];
  private seal: HTMLCanvasElement | null = null;
  private date: HTMLElement;
  private colo: HTMLElement;
  private ring: HTMLElement | null = null;
  private k: number;
  private shift: number;
  /** Where the enlarged title (and its seal) sits before the settle, off the h1's own place: clear of the
   *  frame's top edge and of the 「声」/「略过」 chips; the settle carries it home (transform only). */
  private off = { x: 0, y: 0 };
  /** The date's offset from its final place (.garden-date) to just under the enlarged title. */
  private doff = { x: 0, y: 0 };

  constructor(private slot: HTMLElement, private tg: EndTargets, o: { cut: Cut; w: number; h: number; date: string; colophon: string; seal: HTMLCanvasElement | null; english: boolean }) {
    const doc = slot.ownerDocument;
    this.shift = END_SHIFT[o.cut];
    const P = layoutFor(o.w, o.h).mix < 0.5;
    this.k = Math.max(1.6, Math.min(2.4, (0.16 * Math.min(o.w, o.h)) / 34));
    const tr = tg.title ?? new DOMRect(16, 20, 68, 34);
    this.title = doc.createElement('div');
    this.title.className = 'intro-title brush';
    this.title.setAttribute('aria-hidden', 'true');
    this.title.style.cssText = `left:${tr.left}px;top:${tr.top + tr.height / 2 - 17}px;font-size:34px;line-height:34px;transform-origin:0 50%;transform:scale(${this.k})`;
    // the enlarged box: left tr.left, vertical centre on the h1's, 2 glyphs of 34·k
    const cy = tr.top + tr.height / 2, half = 17 * this.k, bw = 2 * 34 * this.k;
    this.off.y = Math.max(0, 6 + safeTop(doc) - (cy - half));
    const chips = Array.from(slot.closest('.intro-film')?.querySelectorAll<HTMLElement>('.intro-chip') ?? []).map((c) => c.getBoundingClientRect());
    for (const c of chips) {
      const top = cy - half + this.off.y, bottom = cy + half + this.off.y;
      const left = tr.left + this.off.x;
      if (c.width <= 0 || c.bottom <= top || c.top >= bottom || c.right <= left || c.left >= left + bw + 64) continue;
      // a chip on the left pushes the title right past it; on the right it is left alone (the seal stays clear below)
      if (c.left < left + bw / 2) this.off.x = Math.max(this.off.x, c.right + 6 - tr.left);
    }
    this.glyphs = ['半', '亩'].map((c) => {
      const s = doc.createElement('span');
      s.textContent = c;
      s.style.opacity = '0';
      this.title.append(s);
      return s;
    });
    if (o.seal) {
      const c = o.seal;
      const size = P ? 44 : 56;
      c.className = 'intro-seal';
      // just right of 亩, on the h1's baseline, at the title's scale
      c.style.cssText = `left:${tr.left + 2 * 34 * this.k + 6}px;top:${tr.top + tr.height / 2 + 17 * this.k - size}px;width:${size}px;height:${size}px;opacity:0`;
      this.seal = c;
    }
    const dr = tg.date;
    this.date = doc.createElement('div');
    this.date.className = 'intro-date';
    this.date.textContent = o.date;
    this.date.setAttribute('aria-hidden', 'true');
    this.date.style.cssText = dr ? `left:${dr.left}px;top:${dr.top}px;opacity:0` : `left:${tr.left}px;top:${tr.bottom + 34 * this.k * 0.4}px;opacity:0`;
    // before the settle the date sits just under the enlarged title's bottom-left, never through its strokes
    const dx0 = dr ? dr.left : tr.left, dy0 = dr ? dr.top : tr.bottom + 34 * this.k * 0.4;
    this.doff = { x: tr.left + this.off.x + 2 - dx0, y: cy + half + this.off.y + 6 - dy0 };
    if (this.doff.y < 0) this.doff.y = 0;
    this.colo = doc.createElement('div');
    this.colo.className = 'intro-colophon';
    this.colo.textContent = o.colophon;
    this.colo.setAttribute('aria-hidden', 'true');
    const r = tg.rect;
    this.colo.style.cssText = `right:${Math.max(8, o.w - (r.x + r.w) + r.w * 0.04)}px;bottom:${Math.max(8, o.h - (r.y + r.h) + r.h * 0.04)}px;font-size:${P ? 13 : 15}px;opacity:0`;
    slot.append(this.title, this.date, this.colo);
    if (this.seal) slot.append(this.seal);
  }

  /** t in full-cut times (the short cut is shifted by −15.2 s). */
  update(tFilm: number): void {
    const t = tFilm - this.shift;
    const settle = span(t, 82.2, 83.1);
    const e = settle < 0.5 ? 2 * settle * settle : 1 - Math.pow(-2 * settle + 2, 2) / 2;
    this.glyphs.forEach((g, i) => { g.style.opacity = span(t, 80.2 + i * 0.4, 80.6 + i * 0.4).toFixed(3); });
    const s = this.k + (1 - this.k) * e;
    const ox = this.off.x * (1 - e), oy = this.off.y * (1 - e);
    this.title.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px) scale(${s.toFixed(4)})`;
    this.date.style.transform = `translate(${(this.doff.x * (1 - e)).toFixed(2)}px,${(this.doff.y * (1 - e)).toFixed(2)}px)`;
    this.title.style.opacity = (1 - span(t, 82.9, 83.1)).toFixed(3);
    if (this.seal) {
      const u = span(t, 81.5, 81.68);
      const sc = 1.25 - 0.25 * (1 - Math.pow(1 - u, 3));
      this.seal.style.opacity = (u > 0 ? Math.min(1, 0.3 + u) * (1 - e) : 0).toFixed(3);
      this.seal.style.transform = `translate(${ox.toFixed(2)}px,${oy.toFixed(2)}px) scale(${sc.toFixed(3)}) rotate(${(2 * u).toFixed(2)}deg)`;
    }
    this.date.style.opacity = (span(t, 81.6, 82.1) * (1 - span(t, 82.6, 83.1))).toFixed(3);
    this.colo.style.opacity = (0.8 * span(t, 81.7, 82.2)).toFixed(3);
  }

  /** The DOM ring that pulses once round the mailbox button (84.0–84.4). */
  pulse(): void {
    const m = this.tg.mail;
    if (!m || this.ring) return;
    const d = this.slot.ownerDocument.createElement('div');
    d.className = 'intro-mailring';
    d.style.cssText = `left:${m.left + m.width / 2 - 22}px;top:${m.top + m.height / 2 - 22}px`;
    this.slot.append(d);
    this.ring = d;
    try { d.animate([{ transform: 'scale(.6)', opacity: 0.8 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 400, fill: 'forwards' }); } catch { d.style.opacity = '0'; }
  }

  destroy(): void {
    this.title.remove(); this.date.remove(); this.colo.remove(); this.seal?.remove(); this.ring?.remove();
  }
}
