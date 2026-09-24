// 香尽 — the stick has burned through: a poem, and what today has held.
import { state, today } from '../../app/store';
import { useT } from '../../app/i18n';
import { pickPoem } from '../../data/poems';
import { Sheet } from '../../ui/kit';
import { completion, dismissCompletion } from './session';
import { recentDays } from './stats';
import { clockOf } from './stats';

export function DoneSheet(props: { onAgain: () => void }) {
  const t = useT();
  const zh = t('zh', 'en') === 'zh';
  const c = completion.value;
  if (!c) return null;
  const s = c.session;
  const poem = pickPoem({ theme: 'focus', salt: s.start >>> 0 });
  const d = recentDays(state.value.focus, today.value, 1)[0];
  const vertical = zh && poem.lines.length <= 2 && poem.lines.every((l) => l.length <= 16);

  return (
    <Sheet open onClose={dismissCompletion} label={t('一炷香已燃尽', 'The incense has burned out')}>
      <div class="fx-done">
        <div class="fx-done-head">
          <span class="fx-done-glyph brush" aria-hidden="true">香尽</span>
          <h2 class="fx-done-title">
            {c.live ? t('一炷香已燃尽', 'The incense has burned out') : t('离开时，一炷香已燃尽', 'It burned out while you were away')}
          </h2>
          <p class="fx-done-sub">
            <span class="num">{s.minutes}</span> {t('分钟', 'minutes')}
            {s.intent && <> · {t(`此香为「${s.intent}」而燃`, `for “${s.intent}”`)}</>}
            {!c.live && <> · {t('燃尽于', 'at')} <span class="num">{clockOf(c.finishedAt)}</span></>}
          </p>
        </div>

        <figure class={'fx-poem' + (vertical ? ' is-vertical' : '')}>
          <blockquote lang="zh">
            {poem.lines.map((l) => <p>{l}</p>)}
          </blockquote>
          <figcaption>
            <span lang="zh">{poem.dynasty} · {poem.author}《{poem.title}》</span>
          </figcaption>
          {!zh && <p class="fx-poem-en">{poem.en} <span class="fx-poem-by">— {poem.authorEn}</span></p>}
        </figure>

        <p class="fx-done-today">
          {t(`今日已燃 ${d.count} 炷 · ${d.minutes} 分钟`, `Today: ${d.count} stick${d.count === 1 ? '' : 's'} · ${d.minutes} minutes`)}
        </p>

        <div class="fx-done-btns">
          <button class="btn btn-primary" onClick={dismissCompletion} autoFocus>{t('好', 'Done')}</button>
          <button class="btn" onClick={() => { dismissCompletion(); props.onAgain(); }}>{t('再燃一炷', 'Light another')}</button>
        </div>
      </div>
    </Sheet>
  );
}
