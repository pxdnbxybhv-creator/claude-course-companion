// Digits inside Chinese text are set in the Latin face (WenKai's figures read as typewriter).
import type { ComponentChildren } from 'preact';

export function Nums(props: { children: string }): ComponentChildren {
  const parts = props.children.split(/(\d+(?:[:./]\d+)*)/);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <span class="alm-n">{p}</span> : p))}
    </>
  );
}
