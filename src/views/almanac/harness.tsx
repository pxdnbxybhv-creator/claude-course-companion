// DEV-only harness for the almanac view (the app shell may be mid-edit by others). Not built.
import { render } from 'preact';
import '../../styles/fonts.css';
import '../../styles/tokens.css';
import '../../styles/base.css';
import '../../app/app.css';
import { AlmanacView } from '../Almanac';
import { MoonCanvas } from './Today';
import { ToastHost } from '../../ui/kit';
import { lang, setSettings } from '../../app/store';

const q = new URLSearchParams(location.search);
if (q.get('lang') === 'en' || q.get('lang') === 'zh') setSettings({ lang: q.get('lang') as 'en' | 'zh' });
if (q.get('loc')) { const [lat, lon] = q.get('loc')!.split(',').map(Number); setSettings({ location: { lat, lon, label: '上海' } }); }
document.documentElement.lang = lang.value === 'zh' ? 'zh-CN' : 'en';
const moons = q.has('moons');
render(moons ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 16, background: 'var(--paper-2)' }}>{[0.02, 0.08, 0.15, 0.25, 0.35, 0.45, 0.5, 0.6, 0.75, 0.85, 0.95].map((p) => <MoonCanvas phase={p} size={110} label={String(p)} />)}</div> : <div class="shell"><main class="view"><AlmanacView /></main><ToastHost /></div>, document.getElementById('app')!);
if (q.get('scroll')) setTimeout(() => window.scrollTo(0, Number(q.get('scroll'))), 200);
if (q.get('click')) setTimeout(() => document.querySelector(q.get('click')!)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), 300);
