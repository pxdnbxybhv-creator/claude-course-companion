// Tiny bilingual helper. Strings live next to the component that uses them:
//   const t = useT();  …  t('今日', 'Today')
// Reading `lang` inside render subscribes the component to language changes.
import { lang } from './store';

export function tr(zh: string, en: string): string {
  return lang.value === 'zh' ? zh : en;
}

export function useT(): (zh: string, en: string) => string {
  const l = lang.value;
  return (zh, en) => (l === 'zh' ? zh : en);
}
