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
  const cols = clauses(lines);
  let k = 0;
  const en = props.lang === 'en';
  const caption = en ? (props.short ? firstClause(p.en) : firstSentence(p.en)) : '';
  return (
    <div class={cls + (en ? ' is-en' : '')} aria-live="polite" aria-label={en ? `${caption} — ${p.authorEn}` : lines.join('') + ' —' + p.author}>
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
      {en && (
        <p class="inscription-en" aria-hidden="true" style={{ animationDelay: `${k * 55 + 200}ms` }}>
          {caption} <span class="inscription-by">— {p.authorEn}</span>
        </p>
      )}
    </div>
  );
}

/** The English for the first couplet: its first sentence (cut at a semicolon only if very long). */
function firstSentence(s: string): string {
  const m = s.match(/^.*?[.!?](?=\s|$)/);
  let out = (m ? m[0] : s).trim();
  if (out.length > 130 && out.includes(';')) out = out.slice(0, out.indexOf(';')) + '.';
  return out;
}

/** The briefest English for a passing check-in poem: its first clause. */
function firstClause(s: string): string {
  const one = firstSentence(s);
  const i = one.search(/[;:—]/);
  return i > 18 ? one.slice(0, i).trim() + '.' : one;
}
