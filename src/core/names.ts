// 名号 · what the player is called. Pure (store.ts sanitises with it; the letter and Settings clean
// what is typed with it). The name is always drawn in the text face, never brushed.

/** Longest name, in code points (a surrogate pair counts once). */
export const NAME_MAX = 12;

// controls (C0, DEL, C1), bidi embeddings / overrides / isolates, zero-width characters and BOM,
// and the characters that would break a {名} template or look like markup
// eslint-disable-next-line no-control-regex
const STRIP = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿{}<>]/g;

/** A name as it may be kept: NFC, stripped of controls and markup, spaces collapsed, at most NAME_MAX code points. */
export function cleanName(raw: string): string {
  const s = String(raw ?? '').normalize('NFC').replace(STRIP, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, NAME_MAX).join('').trim();
}
