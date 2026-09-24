import { useT } from '../app/i18n';

export function SettingsView() {
  const t = useT();
  return <section style={{ padding: 24 }}><h1 class="brush">{t('Settings', 'Settings')}</h1></section>;
}
