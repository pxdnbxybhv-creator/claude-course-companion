// Asking the player's name outside the 初见礼 letter (the 桃源 elder asks at B2 if it is still blank).
// The mail builder mounts the sheet (MailHost) and replaces this stub's body; the signature stays.
import { signal } from '@preact/signals';

/** The open name request (null when none): its prompt, and how it resolves. */
export const nameAsk = signal<null | { promptZh: string; promptEn: string; resolve(name: string): void }>(null);

/**
 * Open the name sheet; resolves with the cleaned name that was saved, or '' if the player chose to
 * give none (the default is kept). Until the sheet is mounted, resolves '' at once.
 */
export function askName(promptZh = '敢问尊姓大名？', promptEn = 'May I ask your name?'): Promise<string> {
  return new Promise((resolve) => {
    nameAsk.value = { promptZh, promptEn, resolve: (n) => { nameAsk.value = null; resolve(n); } };
    // stub: nothing renders the sheet yet
    queueMicrotask(() => nameAsk.value?.resolve(''));
  });
}
