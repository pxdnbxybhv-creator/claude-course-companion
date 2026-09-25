// 弈 · 游艺 — the games hall: walk into the painting, or play a quiet game.
import { useEffect, useRef } from 'preact/hooks';
import { go, type Route } from '../app/router';
import { useT } from '../app/i18n';
import { lang } from '../app/store';
import * as gomoku from './games/gomoku/preview';
import * as tictactoe from './games/tictactoe/preview';
import * as snake from './games/snake/preview';
import * as walk from './walk/preview';
import './games/games.css';
import './games/hall.css';

interface Card {
  route: Route;
  glyph: string;
  zh: string;
  en: string;
  descZh: string;
  descEn: string;
  preview: { paintPreview(c: HTMLCanvasElement): void; statLine(l: 'zh' | 'en'): string | null };
  wide?: boolean;
}

const CARDS: Card[] = [
  { route: 'walk', glyph: '画', zh: '入画', en: 'Into the Painting', descZh: '走进你的园子，四处看看。逢年过节，园中另有惊喜。', descEn: 'Step inside your garden and wander. On festival days, something special is waiting.', preview: walk, wide: true },
  { route: 'gomoku', glyph: '弈', zh: '五子棋', en: 'Gomoku', descZh: '纵横十五路，与人或与机器对弈。', descEn: 'Five in a row on a 15×15 board — against a friend or the machine.', preview: gomoku },
  { route: 'tictactoe', glyph: '井', zh: '井字棋', en: 'Tic-tac-toe', descZh: '三横三竖，圈叉之间。', descEn: 'Three by three, circles and crosses.', preview: tictactoe },
  { route: 'snake', glyph: '蛇', zh: '贪吃蛇', en: 'Snake', descZh: '一笔长蛇，衔梅而行。', descEn: 'One long brushstroke, gathering plum blossoms.', preview: snake },
];

function Preview(props: { card: Card }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const paint = () => {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      try {
        props.card.preview.paintPreview(c);
      } catch (e) {
        console.warn('[games] preview failed', e);
      }
    };
    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(c);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} class="hall-preview" aria-hidden="true" />;
}

export function GamesView() {
  const t = useT();
  const l = lang.value;
  return (
    <section class="page hall">
      <header class="hall-head">
        <h1 class="brush">{t('游艺', 'Play')}</h1>
        <p class="hall-lead muted">{t('闲来对弈，偶一游之。', 'A few quiet games for idle moments.')}</p>
      </header>
      <div class="hall-grid">
        {CARDS.map((c) => {
          const stat = c.preview.statLine(l);
          return (
            <button type="button" class={'hall-card' + (c.wide ? ' is-wide' : '')} onClick={(e) => go(c.route, e)}>
              <Preview card={c} />
              <span class="hall-glyph brush" aria-hidden="true">{c.glyph}</span>
              <span class="hall-text">
                <span class={'hall-name ' + (l === 'zh' ? 'brush' : 'latin')}>{l === 'zh' ? c.zh : c.en}</span>
                <span class="hall-desc">{l === 'zh' ? c.descZh : c.descEn}</span>
                {stat && <span class="hall-stat">{stat}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
