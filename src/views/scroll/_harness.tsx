// TEMPORARY visual harness (deleted before hand-off).
import { render } from 'preact';
import '../../styles/fonts.css';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../app/app.css';
import { ScrollView } from '../Scroll';
import { SettingsView } from '../Settings';
import { ToastHost } from '../../ui/kit';
import { state } from '../../app/store';

export function mount(which: 'scroll' | 'settings') {
  document.body.removeAttribute('data-lab');
  document.body.innerHTML = '<div id="app"></div>';
  const th = state.value.settings.theme;
  if (th !== 'auto') document.documentElement.setAttribute('data-theme', th);
  document.documentElement.lang = state.value.settings.lang === 'zh' ? 'zh-CN' : 'en';
  render(
    <div class="shell">
      <main class="view">{which === 'scroll' ? <ScrollView /> : <SettingsView />}</main>
      <nav class="tabbar"><button class="tab"><span class="tab-glyph brush">园</span><span class="tab-label">园圃</span></button><button class="tab is-active"><span class="tab-glyph brush">卷</span><span class="tab-label">长卷</span></button></nav>
      <ToastHost />
    </div>,
    document.getElementById('app')!,
  );
}
