import { useEffect } from 'preact/hooks';
import { route, go, type Route } from './router';
import { lang, state } from './store';
import { useT } from './i18n';
import { GardenView } from '../views/Garden';
import { FocusView } from '../views/Focus';
import { AlmanacView } from '../views/Almanac';
import { ScrollView } from '../views/Scroll';
import { SettingsView } from '../views/Settings';
import { ToastHost } from '../ui/kit';
import './app.css';

const TABS: { id: Route; glyph: string; en: string }[] = [
  { id: 'garden', glyph: '园', en: 'Garden' },
  { id: 'focus', glyph: '香', en: 'Focus' },
  { id: 'almanac', glyph: '历', en: 'Almanac' },
  { id: 'scroll', glyph: '卷', en: 'Scroll' },
];

export function App() {
  const t = useT();
  const r = route.value;
  const theme = state.value.settings.theme;
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
      </main>
      <nav class="tabbar" aria-label={t('主导航', 'Main')}>
        {TABS.map((tab) => (
          <button
            class={'tab' + (r === tab.id ? ' is-active' : '')}
            aria-current={r === tab.id ? 'page' : undefined}
            onClick={() => go(tab.id)}
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
  return { garden: '园圃', focus: '一炷香', almanac: '时令', scroll: '长卷', settings: '设置' }[r];
}
