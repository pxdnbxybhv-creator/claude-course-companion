// 名号 at render time: `{名}` in any line, card, toast, bubble or letter becomes what the player is
// called. The lines themselves never hold the name, so a rename shows at once everywhere.
import { computed } from '@preact/signals';
import type { Lang } from '../core/types';
import { state } from './store';

/** The player's chosen name ('' when none). */
export const playerName = computed(() => state.value.settings.playerName ?? '');

/** Where a line is spoken: in 桃源 the villagers do not know you keep a garden, so they say 客. */
export type NameScope = 'world' | 'valley';

/** What to call the player: the chosen name, or the default for the scope. */
export function displayName(lang: Lang, scope: NameScope = 'world', name = playerName.value): string {
  if (name) return name;
  if (scope === 'valley') return lang === 'en' ? 'guest' : '客';
  return lang === 'en' ? 'friend' : '园主';
}

/** Fill `{名}` in a line (English: a default name opening a sentence is capitalised). */
export function fillName(s: string, lang: Lang, scope: NameScope = 'world', name = playerName.value): string {
  if (!s || s.indexOf('{名}') < 0) return s;
  const n = displayName(lang, scope, name);
  if (lang !== 'en' || name) return s.split('{名}').join(n);
  // a default name at the start of a line or a sentence takes a capital ("Guest: …", "… . Friend")
  const cap = n.charAt(0).toUpperCase() + n.slice(1);
  return s.replace(/\{名\}/g, (_m, at: number) => (/(^\s*|[.!?…—"“「]\s*)$/.test(s.slice(0, at)) ? cap : n));
}
