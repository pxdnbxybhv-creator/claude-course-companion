// Hash router: #garden, #focus, #almanac, #scroll, #settings, #games, #snake, #tictactoe, #gomoku, #walk
// (a leading slash, #/garden, is accepted too). Plain-token hashes survive being embedded in hosts
// that only pass through simple anchors.
//
// Navigation goes through `go()`, which wraps the change in an ink-bleed page transition
// (see ./transition.ts) spreading from the point the user tapped.
import { signal } from '@preact/signals';
import { transition, type Origin } from './transition';

export type Route = 'garden' | 'focus' | 'almanac' | 'scroll' | 'settings' | 'games' | 'snake' | 'tictactoe' | 'gomoku' | 'walk';
const ROUTES: Route[] = ['garden', 'focus', 'almanac', 'scroll', 'settings', 'games', 'snake', 'tictactoe', 'gomoku', 'walk'];

/** The games live under the 弈 tab. */
export const GAME_ROUTES: Route[] = ['snake', 'tictactoe', 'gomoku'];

/** Which tab a route belongs to (sub-pages light up their parent tab). */
export function tabOf(r: Route): Route {
  if (r === 'games' || GAME_ROUTES.includes(r)) return 'games';
  if (r === 'walk') return 'garden';
  return r;
}

function parse(): Route {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(h) ? (h as Route) : 'garden';
}

export const route = signal<Route>(parse());

if (typeof window !== 'undefined') {
  // Back/forward buttons: animate from the centre.
  window.addEventListener('hashchange', () => {
    const next = parse();
    if (next !== route.value) transition(() => void (route.value = next));
  });
}

/**
 * Navigate to a route. Pass the pointer event (or a point) that caused it so the ink spreads from
 * there; keyboard activation spreads from the centre.
 */
export function go(r: Route, from?: Origin | MouseEvent | PointerEvent | Event): void {
  if (route.value === r) return;
  transition(() => {
    route.value = r;
    // Keep the address bar in step without triggering a second transition.
    try {
      history.pushState(null, '', `#${r}`);
    } catch {
      location.hash = `#${r}`;
    }
  }, from);
}
