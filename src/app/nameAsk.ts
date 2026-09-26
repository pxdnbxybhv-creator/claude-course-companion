// Asking the player's name outside the 初见礼 letter (the 桃源 elder asks at B2 if it is still blank).
// The sheet itself is NameSheet in src/views/mail/MailHost.tsx, mounted once (App.tsx); it saves
// the name (setSettings({ playerName: cleanName(v) })) and answers the request.
import { signal } from '@preact/signals';
import type { NameScope } from './name';

/** The open name request (null when none): its prompt, where it is asked, and how it resolves. */
export const nameAsk = signal<null | { promptZh: string; promptEn: string; scope: NameScope; resolve(name: string): void }>(null);

/** Where the player stands when a request gives no scope (入画 provides it: inside 桃源, 'valley'). */
let whereNow: () => NameScope = () => 'world';
/** 入画: tell the name sheet where the player is, so an empty name reads 客 in the valley. Returns the undo. */
export function provideNameScope(fn: () => NameScope): () => void {
  whereNow = fn;
  return () => { if (whereNow === fn) whereNow = () => 'world'; };
}

/** How many name sheets are mounted (MailHost registers one); with none, a request answers '' at once. */
let hosts = 0;
/** MailHost: a sheet that can answer name requests is on the page. Returns the unregister. */
export function registerNameHost(): () => void {
  hosts++;
  let live = true;
  return () => {
    if (!live) return;
    live = false;
    hosts--;
    // nobody left to answer an open request: it ends with no name given
    if (!hosts) nameAsk.value?.resolve('');
  };
}

/**
 * Open the name sheet; resolves with the cleaned name that was saved, or '' if the player chose to
 * give none (「山野之人，无名无号」: the default is kept, 园主 outside the valley and 客 inside).
 * `scope` (the field's placeholder) defaults to where the player stands: 'valley' inside 桃源.
 * A request still open is answered '' first. With no sheet mounted (tests), resolves '' at once.
 */
export function askName(promptZh = '敢问尊姓大名？', promptEn = 'May I ask your name?', scope?: NameScope): Promise<string> {
  nameAsk.value?.resolve('');
  let where: NameScope = 'world';
  try { where = scope ?? whereNow(); } catch { /* the world is gone: the garden's default */ }
  return new Promise((resolve) => {
    let done = false;
    const req = {
      promptZh,
      promptEn,
      scope: where,
      resolve: (n: string) => {
        if (done) return;
        done = true;
        if (nameAsk.value === req) nameAsk.value = null;
        resolve(n);
      },
    };
    nameAsk.value = req;
    if (!hosts) queueMicrotask(() => req.resolve(''));
  });
}
