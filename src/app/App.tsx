import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { route, go, tabOf, type Route } from './router';
import { lang, state } from './store';
import { useT } from './i18n';
import { GardenView } from '../views/Garden';
import { FocusView } from '../views/Focus';
import { AlmanacView } from '../views/Almanac';
import { ScrollView } from '../views/Scroll';
import { SettingsView } from '../views/Settings';
import { GamesView } from '../views/Games';
import { Celebrate } from '../views/quests/Celebrate';
import { music } from '../audio/music';
import { active } from '../views/focus/session';
import type { MusicTheme } from '../views/walk/map';

/** Load a page's code the first time it is opened (games and the 3D walk are large). */
function lazyView(load: () => Promise<{ default: ComponentType }>) {
  let Comp: ComponentType | null = null;
  let pending: Promise<void> | null = null;
  const fetch = () => (pending ??= load().then((m) => { Comp = m.default; }));
  function LazyView() {
    const [, setReady] = useState(0);
    useEffect(() => {
      if (!Comp) void fetch().then(() => setReady((n) => n + 1));
    }, []);
    return Comp ? <Comp /> : <div class="view-loading brush" aria-busy="true">研墨…</div>;
  }
  LazyView.prefetch = fetch;
  return LazyView;
}

const SnakeView = lazyView(() => import('../views/games/snake/SnakeView'));
const TicTacToeView = lazyView(() => import('../views/games/tictactoe/TicTacToeView'));
const GomokuView = lazyView(() => import('../views/games/gomoku/GomokuView'));
const XiangqiView = lazyView(() => import('../views/games/xiangqi/XiangqiView'));
const KlotskiView = lazyView(() => import('../views/games/klotski/KlotskiView'));
const TangramView = lazyView(() => import('../views/games/tangram/TangramView'));
const FeihuaView = lazyView(() => import('../views/games/feihua/FeihuaView'));
const QuestsView = lazyView(() => import('../views/quests/QuestsView'));
const WalkView = lazyView(() => import('../views/walk/WalkView'));

/** Background music by page; the 3D walk picks its own themes by region. */
function themeFor(r: Route): MusicTheme | null | 'walk' {
  if (r === 'walk') return 'walk';
  if (r === 'focus') return null; // the incense has its own ambience
  if (r === 'games' || r === 'quests' || ['snake', 'tictactoe', 'gomoku', 'xiangqi', 'klotski', 'tangram', 'feihua'].includes(r)) return 'hall';
  return 'garden';
}
import { ToastHost } from '../ui/kit';
import { audio } from '../audio/engine';
import './app.css';

const TABS: { id: Route; glyph: string; en: string }[] = [
  { id: 'garden', glyph: '园', en: 'Garden' },
  { id: 'focus', glyph: '香', en: 'Focus' },
  { id: 'almanac', glyph: '历', en: 'Almanac' },
  { id: 'games', glyph: '弈', en: 'Play' },
  { id: 'scroll', glyph: '卷', en: 'Scroll' },
];

export function App() {
  const t = useT();
  const r = route.value;
  const { theme, sound, volume, music: musicOn, musicVolume } = state.value.settings;
  useEffect(() => {
    audio.setEnabled(sound);
    audio.setVolume(volume);
  }, [sound, volume]);
  useEffect(() => {
    music.setEnabled(musicOn);
    music.setVolume(musicVolume);
  }, [musicOn, musicVolume]);
  // while a stick burns with its own ambience (rain, a stream…), the music gives way to it
  const burning = active.value !== null && active.value.pausedAt === null && state.value.settings.ambient !== 'none';
  useEffect(() => {
    const th = themeFor(r);
    if (th !== 'walk') music.setTheme(burning ? null : th);
  }, [r, burning]);
  useEffect(() => {
    // Warm up the games' code while the visitor is looking at the garden.
    const t = setTimeout(() => { void GomokuView.prefetch(); void SnakeView.prefetch(); }, 6000);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // Browsers (iOS especially) only allow audio after a gesture: unlock on the first touches.
    const unlock = () => { if (state.value.settings.sound) void audio.unlock(); };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en';
  }, [lang.value]);
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'auto') el.removeAttribute('data-theme');
    else el.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div class="shell" data-route={r}>
      <main class="view" key={r}>
        {r === 'garden' && <GardenView />}
        {r === 'focus' && <FocusView />}
        {r === 'almanac' && <AlmanacView />}
        {r === 'scroll' && <ScrollView />}
        {r === 'settings' && <SettingsView />}
        {r === 'games' && <GamesView />}
        {r === 'snake' && <SnakeView />}
        {r === 'tictactoe' && <TicTacToeView />}
        {r === 'gomoku' && <GomokuView />}
        {r === 'xiangqi' && <XiangqiView />}
        {r === 'klotski' && <KlotskiView />}
        {r === 'tangram' && <TangramView />}
        {r === 'feihua' && <FeihuaView />}
        {r === 'quests' && <QuestsView />}
        {r === 'walk' && <WalkView />}
      </main>
      <nav class="tabbar" aria-label={t('主导航', 'Main')}>
        {TABS.map((tab) => (
          <button
            class={'tab' + (tabOf(r) === tab.id ? ' is-active' : '')}
            aria-current={tabOf(r) === tab.id ? 'page' : undefined}
            onClick={(e) => go(tab.id, e)}
          >
            <span class="tab-glyph brush" aria-hidden="true">{tab.glyph}</span>
            <span class="tab-label">{t(tabZh(tab.id), tab.en)}</span>
          </button>
        ))}
      </nav>
      <ToastHost />
      <Celebrate />
    </div>
  );
}

function tabZh(r: Route): string {
  const names: Partial<Record<Route, string>> = { garden: '园圃', focus: '一炷香', almanac: '时令', games: '游艺', scroll: '长卷', settings: '设置' };
  return names[r] ?? '';
}
