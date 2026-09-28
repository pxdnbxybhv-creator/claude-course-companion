// A stand-in film (Builder I, spec §14 step 2) until Film.ts lands: it takes over at 3.9 s and runs
// a plain skip tail at 4.0 s — 「半亩」 over paper at the header's title, settling into it, the paper
// fading to the live garden — so the whole hand-off (the seen flag, the restores, the Welcome, the
// courier's 初见礼) is proven end to end. `window.__introStub = true` forces it for tests.
import type { FilmHandle, FilmModule, FilmPrep, FilmPrepOptions, FilmStart } from '../../app/intro';
import { gardenTargets } from '../../app/intro';

const TAIL = 2.5;

export function prepareFilm(_o: FilmPrepOptions): FilmPrep {
  return { takeoverReady: Promise.resolve(), nightReady: Promise.resolve(), probe: () => null, dispose() {} };
}

export function startFilm(_prep: FilmPrep, o: FilmStart): FilmHandle {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (t: number, f: () => void) => timers.push(setTimeout(f, Math.max(0, o.tapAt + t * 1000 - performance.now())));
  let layer: HTMLDivElement | null = null;
  let state: 'wait' | 'film' | 'tail' | 'done' = 'wait';
  const done = (r: 'end' | 'skip' | 'error') => {
    if (state === 'done') return;
    state = 'done';
    for (const t of timers) clearTimeout(t);
    o.onDone(r);
  };
  const tail = () => {
    if (state === 'tail' || state === 'done') return;
    state = 'tail';
    o.onPhase('tail');
    try {
      layer = document.createElement('div');
      layer.className = 'intro-stub';
      layer.style.cssText = 'position:absolute;inset:0;background:#f1e9d8;opacity:0';
      const title = document.createElement('div');
      title.className = 'brush';
      title.textContent = '半亩';
      const tgt = gardenTargets()?.title?.getBoundingClientRect();
      const k = 1.8;
      const x = tgt ? tgt.left : innerWidth * 0.06, y = tgt ? tgt.top + tgt.height / 2 : innerHeight * 0.08;
      title.style.cssText = `position:absolute;left:${x}px;top:${y - 17}px;font-size:34px;line-height:1;color:#1b1916;transform-origin:0 50%;transform:scale(${k})`;
      layer.appendChild(title);
      o.root.appendChild(layer);
      layer.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, fill: 'forwards' });
      title.animate([{ transform: `scale(${k})` }, { transform: 'scale(1)' }], { delay: 1600, duration: 900, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
      layer.animate([{ opacity: 1 }, { opacity: 0 }], { delay: 1600, duration: 900, fill: 'forwards' });
    } catch {
      /* the stub never blocks */
    }
    const t0 = performance.now();
    timers.push(setTimeout(() => o.onPhase('out'), 1600));
    timers.push(setTimeout(() => done('skip'), Math.max(0, TAIL * 1000 - (performance.now() - t0))));
  };
  at(3.9, () => {
    if (state !== 'wait') return;
    state = 'film';
    o.onPhase('film');
  });
  at(4.0, tail);
  return {
    skip() {
      if (state === 'tail') done('skip');
      else tail();
    },
    endNow() { done('skip'); },
    destroy() {
      for (const t of timers) clearTimeout(t);
      state = 'done';
      layer?.remove();
    },
    stageTap() {},
  };
}

export default { prepareFilm, startFilm } satisfies FilmModule;
