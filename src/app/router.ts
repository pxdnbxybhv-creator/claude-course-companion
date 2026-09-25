// Hash router: #garden, #focus, #almanac, #scroll, #settings (a leading slash, #/garden, is accepted too).
// Plain-token hashes survive being embedded in hosts that only pass through simple anchors.
import { signal } from '@preact/signals';

export type Route = 'garden' | 'focus' | 'almanac' | 'scroll' | 'settings';
const ROUTES: Route[] = ['garden', 'focus', 'almanac', 'scroll', 'settings'];

function parse(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'garden';
}

export const route = signal<Route>(parse());

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => (route.value = parse()));
}

export function go(r: Route): void {
  if (route.value === r) return;
  location.hash = `#${r}`;
}
