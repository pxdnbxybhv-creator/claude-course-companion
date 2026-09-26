// Painted boards for the homestead: the name over the gate, plaques (匾额: gold brush letters on
// black lacquer) and couplets (对联: black ink on red paper, top to bottom), all in one texture.
// The top half holds eight horizontal boards (512 × 128), the bottom half sixteen vertical strips
// (64 × 512). Repainted only when the words change.
import type * as T from 'three';
import type { Three } from './brush';
import type { LabelKind } from '../catalog';
import { BRUSH_FONT, loadBrush } from '../../kit';

export const ATLAS = 1024;
const H_SLOTS = 8, V_SLOTS = 16;

export interface Board { kind: LabelKind; text: string }
/** uv rectangle [u0, v0, u1, v1] of a board (null when the atlas is full). */
export type UvRect = [number, number, number, number];

export class TextAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: T.CanvasTexture;
  private key = '';
  private g: CanvasRenderingContext2D;
  private fontsWanted = '';
  private disposed = false;

  constructor(THREE: Three) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = ATLAS;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  /** Paint the boards; returns each one's uv rectangle (same order). */
  paint(boards: Board[], onFonts?: () => void): (UvRect | null)[] {
    let h = 0, v = 0;
    const slots = boards.map((b) => (b.kind === 'plaque' || b.kind === 'name' ? (h < H_SLOTS ? { hz: true, i: h++ } : null) : (v < V_SLOTS ? { hz: false, i: v++ } : null)));
    const uv = slots.map((s): UvRect | null => {
      if (!s) return null;
      if (s.hz) {
        const x = (s.i % 2) * 512, y = Math.floor(s.i / 2) * 128;
        return [x / ATLAS, 1 - (y + 128) / ATLAS, (x + 512) / ATLAS, 1 - y / ATLAS];
      }
      const x = s.i * 64, y = 512;
      return [x / ATLAS, 1 - (y + 512) / ATLAS, (x + 64) / ATLAS, 1 - y / ATLAS];
    });
    const key = boards.map((b) => `${b.kind}:${b.text}`).join('|');
    if (key === this.key) return uv;
    this.key = key;
    const g = this.g;
    g.clearRect(0, 0, ATLAS, ATLAS);
    boards.forEach((b, k) => {
      const s = slots[k];
      if (!s) return;
      if (s.hz) this.board(b.text, (s.i % 2) * 512, Math.floor(s.i / 2) * 128);
      else this.strip(b.text, s.i * 64, 512);
    });
    this.texture.needsUpdate = true;
    // the brush face may still be on its way: paint again when it has come
    const chars = [...new Set(boards.map((b) => b.text).join(''))].join('');
    if (chars && chars !== this.fontsWanted) {
      this.fontsWanted = chars;
      loadBrush(chars).then(() => {
        if (this.disposed || this.key !== key) return;
        this.key = '';
        onFonts?.();
      });
    }
    return uv;
  }

  /** Gold letters on black lacquer, a gold border: 512 × 128. */
  private board(text: string, x: number, y: number): void {
    const g = this.g, W = 512, H = 128;
    const grd = g.createLinearGradient(x, y, x, y + H);
    grd.addColorStop(0, '#3a2e26'); grd.addColorStop(0.5, '#2a211b'); grd.addColorStop(1, '#221a15');
    g.fillStyle = grd;
    g.fillRect(x, y, W, H);
    g.strokeStyle = '#d9ad4a';
    g.lineWidth = 6;
    g.strokeRect(x + 7, y + 7, W - 14, H - 14);
    g.lineWidth = 1.5;
    g.strokeRect(x + 15, y + 15, W - 30, H - 30);
    const chars = [...text];
    if (!chars.length) return;
    const n = chars.length;
    const cell = Math.min(86, (W - 60) / n);
    g.fillStyle = '#e8c267';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(cell * 0.92)}px ${BRUSH_FONT}`;
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = 3;
    const x0 = x + W / 2 - (cell * n) / 2 + cell / 2;
    chars.forEach((ch, i) => g.fillText(ch, x0 + i * cell, y + H / 2 + 4));
    g.shadowBlur = 0;
  }

  /** Black ink on red paper, top to bottom: 64 × 512. */
  private strip(text: string, x: number, y: number): void {
    const g = this.g, W = 64, H = 512;
    g.fillStyle = '#b8392b';
    g.fillRect(x, y, W, H);
    // gold flecks in the paper
    g.fillStyle = 'rgba(232, 190, 90, 0.55)';
    for (let k = 0; k < 26; k++) {
      const u = ((k * 37) % 61) / 61, w = ((k * 53) % 97) / 97;
      g.fillRect(x + 4 + u * (W - 8), y + 6 + w * (H - 12), 2, 2);
    }
    const chars = [...text];
    if (!chars.length) return;
    const n = chars.length;
    const cell = Math.min(60, (H - 20) / n);
    g.fillStyle = '#1b1510';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${Math.round(Math.min(cell, W) * 0.86)}px ${BRUSH_FONT}`;
    const y0 = y + H / 2 - (cell * n) / 2 + cell / 2;
    chars.forEach((ch, i) => g.fillText(ch, x + W / 2, y0 + i * cell + 2));
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
  }
}
