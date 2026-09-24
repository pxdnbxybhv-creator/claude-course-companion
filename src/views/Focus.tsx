import { useT } from '../app/i18n';

export function FocusView() {
  const t = useT();
  return <section style={{ padding: 24 }}><h1 class="brush">{t('Focus', 'Focus')}</h1></section>;
}
