// The frame every game page shares: a way back to the games hall, a title, and an actions slot.
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { go } from '../../app/router';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { watchErrands } from './purse';
import './games.css';

export function GameShell(props: {
  titleZh: string;
  titleEn: string;
  /** One quiet line under the title (score, turn, level…). */
  subtitle?: ComponentChildren;
  /** Buttons on the right of the header (new game, settings…). */
  actions?: ComponentChildren;
  children: ComponentChildren;
  /** Extra class on the page element. */
  class?: string;
}) {
  const t = useT();
  const zh = lang.value === 'zh';
  // today's errands a game finishes pay into the purse: say so
  useEffect(watchErrands, []);
  return (
    <section class={'game-page' + (props.class ? ' ' + props.class : '')}>
      <header class="game-head">
        <button type="button" class="game-back" onClick={(e) => go('games', e)} aria-label={t('返回游艺', 'Back to games')}>
          <span aria-hidden="true">‹</span>
          <span class="game-back-label">{t('游艺', 'Play')}</span>
        </button>
        <div class="game-title">
          <h1 class={zh ? 'brush' : 'latin'}>{zh ? props.titleZh : props.titleEn}</h1>
          {props.subtitle !== undefined && <div class="game-sub">{props.subtitle}</div>}
        </div>
        <div class="game-actions">{props.actions}</div>
      </header>
      <div class="game-body">{props.children}</div>
    </section>
  );
}
