// 题款 — a poem written into the empty sky of the painting. Chinese goes in vertical columns read
// right to left (punctuation dropped, as on a painting); English as a short italic block.
import type { Poem } from '../../data/poems';

/** Split a poem line into clauses at full-width punctuation: 「半亩方塘一鉴开，天光云影共徘徊。」→ 2 columns. */
export function clauses(lines: string[]): string[] {
  return lines
    .flatMap((l) => l.split(/[，。！？；、,.!?;：:]/))
    .map((s) => s.replace(/[《》「」“”"'\s]/g, ''))
    .filter(Boolean);
}

export function Inscription(props: {
  poem: Poem;
  lang: 'zh' | 'en';
  /** Which side of the sky: the side away from the plant being celebrated. */
  side: 'left' | 'right';
  /** Only the first line (a couplet) — for the brief check-in poem. */
  short?: boolean;
  /** Fade in, hold, fade out (ms total), or stay. */
  transient?: boolean;
  seal?: string | null;
}) {
  const p = props.poem;
  const lines = props.short ? p.lines.slice(0, 1) : p.lines;
  const cls = 'inscription' + (props.side === 'left' ? ' is-left' : ' is-right') + (props.transient ? ' is-transient' : '');
  if (props.lang === 'en') {
    const en = props.short ? firstSentence(p.en) : p.en;
    return (
      <div class={cls + ' is-en'} aria-live="polite">
        <p class="inscription-en">{en}</p>
        <p class="inscription-by">— {p.authorEn}</p>
      </div>
    );
  }
  const cols = clauses(lines);
  let k = 0;
  return (
    <div class={cls} aria-live="polite" aria-label={lines.join('') + ' —' + p.author}>
      <div class="inscription-cols" aria-hidden="true">
        {cols.map((c) => (
          <span class="inscription-col">
            {[...c].map((ch) => (
              <span class="ch" style={{ animationDelay: `${(k++ * 55).toFixed(0)}ms` }}>{ch}</span>
            ))}
          </span>
        ))}
        <span class="inscription-col inscription-by-zh">
          <span class="ch" style={{ animationDelay: `${k * 55 + 120}ms` }}>{p.dynasty}·{p.author}</span>
        </span>
      </div>
    </div>
  );
}

function firstSentence(s: string): string {
  const m = s.match(/^.*?[.;!?](\s|$)/);
  const out = (m ? m[0] : s).trim();
  return out.length < 24 && s.length > out.length ? s.split(/(?<=[.;!?])\s/).slice(0, 2).join(' ') : out;
}
