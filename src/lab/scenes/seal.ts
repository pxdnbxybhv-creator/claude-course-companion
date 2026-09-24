// /lab.html?scene=seal&size=120&wear=0.5&texts=半,半亩,一炷香,半亩方塘&seed=
// Rows: bai / zhu square, round & oval leisure seals; each at `size` and at 24 px.
import { makeSeal, sealReady, type SealOptions } from '../../ink/seal';
import { fillPaper } from '../../ink/paper';

export default async function (canvas: HTMLCanvasElement, p: URLSearchParams) {
  const size = Number(p.get('size') ?? 120);
  const wear = p.has('wear') ? Number(p.get('wear')) : undefined;
  const seed = p.has('seed') ? Number(p.get('seed')) : undefined;
  const texts = (p.get('texts') ?? '半,半亩,一炷香,半亩方塘').split(',');
  const small = Number(p.get('small') ?? 24);
  await sealReady(texts.join(''));
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const W = canvas.width / dpr, H = canvas.height / dpr;
  fillPaper(ctx, W, H);

  const rows: { label: string; o: Partial<SealOptions>; texts: string[] }[] = [
    { label: 'bai square', o: { style: 'bai' }, texts },
    { label: 'zhu square', o: { style: 'zhu' }, texts },
    { label: 'bai round / oval', o: { style: 'bai', shape: 'round' }, texts: texts.slice(0, 2) },
    { label: 'zhu oval', o: { style: 'zhu', shape: 'oval' }, texts: texts.slice(0, 3) },
  ];
  const gap = 18;
  const rowH = size + gap + 12;
  ctx.font = '12px system-ui';
  let total = 0, count = 0;
  rows.forEach((row, ri) => {
    const y = 16 + ri * rowH;
    let x = 16;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillText(row.label, x, y + size + 12);
    row.texts.forEach((t, ti) => {
      const shape = ri === 2 && ti === 1 ? 'oval' : row.o.shape;
      const t0 = performance.now();
      const big = makeSeal(t, { size, dpr, wear, seed, ...row.o, shape });
      total += performance.now() - t0; count++;
      ctx.drawImage(big, x, y, size, size);
      const sm = makeSeal(t, { size: small, dpr, wear, seed, ...row.o, shape });
      ctx.drawImage(sm, x + size + 8, y + size - small, small, small);
      x += size + small + 8 + gap;
    });
  });
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillText(`makeSeal ${size}px @${dpr}x: ${(total / count).toFixed(1)} ms avg`, 16, H - 12);
}
