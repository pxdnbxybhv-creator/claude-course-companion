import { useT } from '../app/i18n';

export function GardenView() {
  const t = useT();
  return <section style={{ padding: 24 }}><h1 class="brush">{t('Garden', 'Garden')}</h1></section>;
}
