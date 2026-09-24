// The check button: an ensō (圆相) — one breath of the brush. Empty it is a faint circle; done,
// the circle is painted in and its heart fills with ink.
import { useEffect, useRef, useState } from 'preact/hooks';

const CX = 24, CY = 24;

/** Outline of a hand-brushed ensō as an SVG path: thick loaded start, thinning dry end, open gap. */
function ensoPath(): string {
  const a0 = (118 * Math.PI) / 180;
  const sweep = (322 * Math.PI) / 180;
  const N = 56;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const a = a0 + sweep * u;
    const r = 17.2 + 0.55 * Math.sin(u * 6.1 + 0.4) + 0.9 * u;
    // Heavy at 起笔, swelling a little, then tapering as the ink runs out (收笔).
    const w = (u < 0.08 ? 3.2 + u * 22 : 4.9 - 3.6 * Math.pow((u - 0.08) / 0.92, 1.35)) * (1 + 0.06 * Math.sin(u * 23));
    const c = Math.cos(a), s = Math.sin(a);
    outer.push([CX + c * (r + w / 2), CY + s * (r + w / 2)]);
    inner.push([CX + c * (r - w / 2), CY + s * (r - w / 2)]);
  }
  const pts = [...outer, ...inner.reverse()];
  return 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L') + 'Z';
}

/** The same arc as a centre line, for the mask that "paints" the ensō in. */
function ensoSpine(): string {
  const a0 = (118 * Math.PI) / 180;
  const a1 = a0 + (326 * Math.PI) / 180;
  const r = 17.6;
  const p = (a: number) => `${(CX + Math.cos(a) * r).toFixed(2)} ${(CY + Math.sin(a) * r).toFixed(2)}`;
  const mid = (a0 + a1) / 2;
  return `M${p(a0)} A${r} ${r} 0 0 1 ${p(mid)} A${r} ${r} 0 0 1 ${p(a1)}`;
}

/** An ink blot with a slightly irregular edge, for the filled heart. */
function blotPath(): string {
  const N = 28;
  const pts: string[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = 12.4 + 0.7 * Math.sin(a * 3 + 1) + 0.45 * Math.sin(a * 7 + 2);
    pts.push(`${(CX + Math.cos(a) * r).toFixed(2)} ${(CY + Math.sin(a) * r).toFixed(2)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

const ENSO = ensoPath();
const SPINE = ensoSpine();
const BLOT = blotPath();
// A brushed tick in paper colour.
const TICK = 'M16.6 24.6 C18.4 25.6 20.2 27.4 21.6 29.6 C22 30.1 22.5 30.1 22.8 29.5 C25 25 27.9 21.3 31.9 18.2 C32.4 17.8 32 17.2 31.4 17.5 C27.4 19.6 24.4 22.9 22.2 26.4 C20.8 25.2 19 24.2 17.2 23.7 C16.5 23.5 16.1 24.2 16.6 24.6 Z';

let uidN = 0;

export function EnsoCheck(props: { done: boolean; onToggle: () => void; label: string; quiet?: boolean }) {
  const [id] = useState(() => `enso${++uidN}`);
  const [fresh, setFresh] = useState(false);
  const prev = useRef(props.done);
  useEffect(() => {
    if (props.done && !prev.current) {
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 900);
      prev.current = props.done;
      return () => clearTimeout(t);
    }
    prev.current = props.done;
  }, [props.done]);
  return (
    <button
      type="button"
      class={'enso' + (props.done ? ' is-done' : '') + (fresh ? ' is-fresh' : '') + (props.quiet ? ' is-quiet' : '')}
      aria-pressed={props.done}
      aria-label={props.label}
      onClick={(e) => {
        e.stopPropagation();
        props.onToggle();
      }}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
            <path class="enso-reveal" d={SPINE} pathLength={1} />
          </mask>
        </defs>
        <circle class="enso-ring" cx={CX} cy={CY} r={22} />
        <path class="enso-faint" d={ENSO} />
        <g class="enso-heart">
          <path class="enso-blot" d={BLOT} />
          <path class="enso-tick" d={TICK} />
        </g>
        <path class="enso-ink" d={ENSO} mask={`url(#${id})`} />
      </svg>
    </button>
  );
}
