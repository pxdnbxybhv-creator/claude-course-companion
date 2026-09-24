// A poem for the season — set vertically, right to left, on wide screens; centred lines on phones.
import { pickPoem } from '../../data/poems';
import { hashString } from '../../core/rng';
import { useT } from '../../app/i18n';

/** Split a line at its punctuation into the phrases a calligrapher would write as columns. */
function phrases(lines: string[]): string[] {
  return lines.flatMap((l) => l.split(/[，。？！；：、,.?!;:]/).map((s) => s.trim()).filter(Boolean));
}

export function Poem(props: { dayKey: string; term: number }) {
  const t = useT();
  const poem = pickPoem({ term: props.term, salt: hashString(props.dayKey) });
  const cols = phrases(poem.lines);
  const credit = `${poem.dynasty} · ${poem.author}`;
  return (
    <section class="alm-card alm-poem" aria-labelledby="alm-poem-h">
      <h2 id="alm-poem-h" class="alm-h">
        <span>{t('应时一首', 'A poem for the season')}</span>
      </h2>
      <figure class="alm-poem-fig">
        {/* horizontal (phones) */}
        <blockquote class="alm-poem-h" lang="zh-CN">
          {poem.lines.map((l) => (
            <p>{l}</p>
          ))}
        </blockquote>
        {/* vertical (wide) — the same text, phrase per column, no punctuation, as it would be brushed */}
        <div class="alm-poem-v" lang="zh-CN" aria-hidden="true">
          {cols.map((c) => (
            <span class="alm-poem-col">{c}</span>
          ))}
          <span class="alm-poem-credit">
            {credit}
            <span class="alm-poem-title">《{poem.title}》</span>
          </span>
        </div>
        <figcaption class="alm-poem-cap">
          <span class="alm-poem-src" lang="zh-CN">
            {credit} <span class="alm-poem-title">《{poem.title}》</span>
          </span>
          <span class="alm-poem-en latin" lang="en">{poem.en}</span>
          <span class="alm-poem-by latin" lang="en">
            — {poem.authorEn}
          </span>
        </figcaption>
      </figure>
    </section>
  );
}
