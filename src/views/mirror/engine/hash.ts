// 水月幻镜 · the enemy spatial hash (GDD §24.3): 64 u cells over the arena's bounds, rebuilt every
// step with a counting sort into flat typed arrays. No allocation after construction.

export const CELL = 64;

export class SpatialHash {
  readonly cols: number;
  readonly rows: number;
  private readonly x0: number;
  private readonly y0: number;
  /** cellStart[c] .. cellStart[c+1] indexes `items` for cell c. */
  readonly start: Int32Array;
  private readonly count: Int32Array;
  readonly items: Int32Array;
  private readonly cellOf: Int32Array;

  constructor(minX: number, minY: number, maxX: number, maxY: number, cap: number, margin = 256) {
    this.x0 = minX - margin;
    this.y0 = minY - margin;
    this.cols = Math.max(1, Math.ceil((maxX - minX + 2 * margin) / CELL));
    this.rows = Math.max(1, Math.ceil((maxY - minY + 2 * margin) / CELL));
    const n = this.cols * this.rows;
    this.start = new Int32Array(n + 1);
    this.count = new Int32Array(n);
    this.items = new Int32Array(cap);
    this.cellOf = new Int32Array(cap);
  }

  cell(x: number, y: number): number {
    let cx = Math.floor((x - this.x0) / CELL), cy = Math.floor((y - this.y0) / CELL);
    if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  /** Rebuild from the live slots: `live(i)` true for slots to index, positions from xs/ys. */
  build(n: number, alive: Uint8Array, xs: Float32Array, ys: Float32Array, skip?: Uint8Array): void {
    const count = this.count, start = this.start, cellOf = this.cellOf;
    count.fill(0);
    for (let i = 0; i < n; i++) {
      if (!alive[i] || (skip && skip[i])) { cellOf[i] = -1; continue; }
      const c = this.cell(xs[i], ys[i]);
      cellOf[i] = c;
      count[c]++;
    }
    let acc = 0;
    for (let c = 0; c < count.length; c++) { start[c] = acc; acc += count[c]; count[c] = start[c]; }
    start[count.length] = acc;
    for (let i = 0; i < n; i++) {
      const c = cellOf[i];
      if (c >= 0) this.items[count[c]++] = i;
    }
  }

  /**
   * Candidate slots in the cells overlapping (x, y) ± r, written into `out` from `at`; returns the
   * new end. The caller checks distances. Allocation-free.
   */
  gather(x: number, y: number, r: number, out: Int32Array, at = 0): number {
    let cx0 = Math.floor((x - r - this.x0) / CELL), cx1 = Math.floor((x + r - this.x0) / CELL);
    let cy0 = Math.floor((y - r - this.y0) / CELL), cy1 = Math.floor((y + r - this.y0) / CELL);
    if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0;
    if (cx1 >= this.cols) cx1 = this.cols - 1; if (cy1 >= this.rows) cy1 = this.rows - 1;
    const start = this.start, items = this.items, lim = out.length;
    let n = at;
    for (let cy = cy0; cy <= cy1; cy++) {
      const row = cy * this.cols;
      for (let cx = cx0; cx <= cx1; cx++) {
        const c = row + cx;
        for (let k = start[c], e = start[c + 1]; k < e && n < lim; k++) out[n++] = items[k];
      }
    }
    return n;
  }

  /**
   * The cell rectangle overlapping (x, y) ± r, written into out = [cx0, cx1, cy0, cy1]; loop
   * `for cy, for cx: for k in start[c]..start[c+1]: items[k]` with c = cy·cols + cx. Allocation-free.
   */
  bounds(x: number, y: number, r: number, out: Int32Array): void {
    let cx0 = Math.floor((x - r - this.x0) / CELL), cx1 = Math.floor((x + r - this.x0) / CELL);
    let cy0 = Math.floor((y - r - this.y0) / CELL), cy1 = Math.floor((y + r - this.y0) / CELL);
    if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0;
    if (cx1 >= this.cols) cx1 = this.cols - 1; if (cy1 >= this.rows) cy1 = this.rows - 1;
    out[0] = cx0; out[1] = cx1; out[2] = cy0; out[3] = cy1;
  }
}
