// The check button: an ensō (圆相) — one breath of the brush. Empty it is a faint circle; done,
// the circle is painted in and its heart fills with ink.
import { useEffect, useRef, useState } from 'preact/hooks';
import { BLOT, CX, CY, ENSO, SPINE, TICK } from './enso-paths';

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
