import { useEffect } from 'preact/hooks';
import { route, go, tabOf, type Route } from './router';
import { lang, state } from './store';
import { useT } from './i18n';
import { GardenView } from '../views/Garden';
import { FocusView } from '../views/Focus';
import { AlmanacView } from '../views/Almanac';
import { ScrollView } from '../views/Scroll';
import { SettingsView } from '../views/Settings';
import { GamesView } from '../views/Games';
import { SnakeView } from '../views/games/snake/SnakeView';
import { TicTacToeView } from '../views/games/tictactoe/TicTacToeView';
import { GomokuView } from '../views/games/gomoku/GomokuView';
import { WalkView } from '../views/walk/WalkView';
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
  const { theme, sound, volume } = state.value.settings;
  useEffect(() => {
    audio.setEnabled(sound);
    audio.setVolume(volume);
  }, [sound, volume]);
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
    </div>
  );
}

function tabZh(r: Route): string {
  const names: Partial<Record<Route, string>> = { garden: '园圃', focus: '一炷香', almanac: '时令', games: '游艺', scroll: '长卷', settings: '设置' };
  return names[r] ?? '';
}
