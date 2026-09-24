import { useT } from '../app/i18n';

export function AlmanacView() {
  const t = useT();
  return <section style={{ padding: 24 }}><h1 class="brush">{t('Almanac', 'Almanac')}</h1></section>;
}
