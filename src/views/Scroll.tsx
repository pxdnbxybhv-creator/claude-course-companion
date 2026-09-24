import { useT } from '../app/i18n';

export function ScrollView() {
  const t = useT();
  return <section style={{ padding: 24 }}><h1 class="brush">{t('Scroll', 'Scroll')}</h1></section>;
}
