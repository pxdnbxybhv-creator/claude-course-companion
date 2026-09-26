// 信 · the mailbox, mounted once beside the toasts (App.tsx), so the garden's 信 button and 入画's
// 信 chip open the same sheet: the box (newest first) or one letter — a 八行笺 on xuan paper, written
// top to bottom in Chinese, the sender's seal at its foot, and what it carries laid beside it with
// one 「收下」. The 初见礼 also asks your name. MailHost also answers askName() (the name sheet) and
// announces a letter that has just come (「驿使送来一封信」), once the welcome is behind you.
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../app/i18n';
import { lang as langSig, setSettings, state, today } from '../../app/store';
import { play, isUnlockedIn } from '../../app/play';
import { arrivals, claimLetter, closeMail, deliverDue, hasGift, mail, mailUi, openMail, type MailEntry } from '../../app/mail';
import { fillName, playerName, type NameScope } from '../../app/name';
import { nameAsk, registerNameHost } from '../../app/nameAsk';
import { cleanName } from '../../core/names';
import type { Lang } from '../../core/types';
import { LETTER, type LetterDef } from '../../data/letters';
import { CHARACTER } from '../../data/characters';
import { Sheet, toast } from '../../ui/kit';
import { CoinIcon, coinToast, fmtCoins } from '../../ui/coins';
import { Portrait, Seal } from '../quests/bits';
import { dprOf, paintPaper } from '../quests/paint';
import { NameField } from './NameField';
import { letterDate, pickPs, splitLetter } from './letter';
import './mail.css';

export function MailHost() {
  const ui = mailUi.value;
  const ask = nameAsk.value;
  useEffect(() => registerNameHost(), []);
  // a new day while the app stays open: the letters that come "the next day" come now
  const day = today.value;
  useEffect(() => { deliverDue(); }, [day]);
  useAnnouncer(ui !== null || ask !== null);
  return (
    <>
      <MailSheet ui={ui} />
      {ask && <NameSheet key={ask.promptZh + ask.promptEn} />}
    </>
  );
}

// ------------------------------------------------------------------------------------ the courier

/** 「驿使送来一封信」 with 拆信, for letters that came while the app was open (held while the welcome shows). */
function useAnnouncer(busy: boolean) {
  const t = useT();
  const a = arrivals.value;
  const s = state.value;
  const welcomed = s.onboarded || s.habits.length > 0;
  useEffect(() => {
    if (!a.length || !welcomed || busy) return;
    const tm = setTimeout(() => {
      const ids = arrivals.peek().filter((id) => mail.peek().box.some((e) => e.id === id && !e.read));
      arrivals.value = [];
      if (!ids.length) return;
      const one = ids.length === 1 ? ids[0] : undefined;
      const from = one ? LETTER[one]?.from : undefined;
      toast(
        ids.length > 1
          ? t(`驿使送来 ${ids.length} 封信`, `A courier brings you ${ids.length} letters`)
          : t(`驿使送来一封信${from ? ` · ${from.zh}` : ''}`, `A courier brings you a letter${from ? ` · ${from.en}` : ''}`),
        { ms: 7000, action: { label: t('拆信', 'Open'), run: () => openMail(one) } },
      );
    }, 1400);
    return () => clearTimeout(tm);
  }, [a, welcomed, busy]);
}

// ------------------------------------------------------------------------------------ the sheet

function MailSheet(props: { ui: null | string }) {
  const t = useT();
  const ui = props.ui;
  const letter = ui && ui !== 'list' ? LETTER[ui] : undefined;
  const entry = letter ? mail.value.box.find((e) => e.id === letter.id) : undefined;
  const open = ui !== null;
  const title = letter && entry ? t(letter.subject.zh, letter.subject.en) : t('书信', 'Letters');
  return (
    <Sheet open={open} onClose={closeMail} title={title} label={title}>
      {letter && entry ? <LetterView l={letter} entry={entry} /> : <BoxView />}
    </Sheet>
  );
}

function BoxView() {
  const t = useT();
  const lang = langSig.value;
  const p = play.value;
  const box = [...mail.value.box].sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1));
  if (!box.length) {
    return <p class="mail-empty muted">{t('信匣里还空着。', 'No letters yet.')}</p>;
  }
  return (
    <ul class="mail-box" aria-label={t('来信', 'Letters')}>
      {box.map((e) => {
        const l = LETTER[e.id];
        if (!l) return null;
        const waiting = hasGift(l) && !p.flags[`mail:${l.id}`];
        return (
          <li key={e.id}>
            <button type="button" class={'mail-item' + (e.read ? '' : ' is-unread')} onClick={() => openMail(e.id)}>
              <Envelope glyph={l.seal} />
              <span class="mail-item-text">
                <span class="mail-item-from">{t(l.from.zh, l.from.en)}</span>
                <span class="mail-item-subject">{t(l.subject.zh, l.subject.en)}</span>
              </span>
              <span class="mail-item-side">
                <span class="mail-item-date num">{letterDate(e.at, lang)}</span>
                {waiting ? (
                  <span class="mail-item-tag is-gift">{t('有附', 'Enclosed')}</span>
                ) : hasGift(l) ? (
                  <span class="mail-item-tag">{t('已收', 'Taken')}</span>
                ) : null}
              </span>
              {!e.read && <i class="mail-dot" aria-label={t('未拆', 'Unread')} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A small envelope: a red-framed window down its middle and the sender's seal. */
function Envelope(props: { glyph?: string }) {
  return (
    <span class="mail-env" aria-hidden="true">
      <i class="mail-env-window" />
      {props.glyph && <b class="mail-env-seal brush">{props.glyph}</b>}
    </span>
  );
}

// ------------------------------------------------------------------------------------ one letter

function LetterView(props: { l: LetterDef; entry: MailEntry }) {
  const { l, entry } = props;
  const t = useT();
  const lang = langSig.value;
  const p = play.value;
  const isClaimed = !!p.flags[`mail:${l.id}`];
  const gift = hasGift(l);
  const scope: NameScope = l.scope ?? 'world';
  const [draft, setDraft] = useState(playerName.value);
  const asking = !!l.askName && !isClaimed;
  // while the 初见礼 is being answered, the salutation follows what is typed
  const name = asking ? cleanName(draft) : playerName.value;
  const fill = (s: string) => fillName(s, lang, scope, name);
  const parts = splitLetter(t(l.body.zh, l.body.en), lang);
  const ps = pickPs(l, p.flags);
  const busy = useRef(false);

  const back = mail.value.box.length > 1;
  const take = () => {
    if (busy.current || isClaimed) return;
    busy.current = true;
    try {
      if (l.askName) {
        const clean = cleanName(draft);
        if (clean !== state.value.settings.playerName) setSettings({ playerName: clean });
      }
      const r = claimLetter(l.id);
      if (r !== 'ok') return;
      closeMail();
      const coins = Math.floor(l.attach?.coins ?? 0);
      if (coins > 0) coinToast(coins, { note: t(`随信 · ${l.from.zh}`, `Enclosed · ${l.from.en}`) });
      const item = l.attach?.item;
      if (item) setTimeout(() => toast(t(`收下「${item.zh}」`, `Kept: ${item.en}`)), coins > 0 ? 700 : 0);
    } finally {
      busy.current = false;
    }
  };

  return (
    <div class={'mail-letter' + (lang === 'zh' ? ' is-zh' : ' is-en')}>
      <div class="mail-letter-head">
        {back && (
          <button type="button" class="mail-back" onClick={() => openMail()}>
            <span aria-hidden="true">‹ </span>{t('信匣', 'All letters')}
          </button>
        )}
        <span class="mail-letter-meta">
          {t(l.from.zh, l.from.en)}<span aria-hidden="true"> · </span><span class="num">{letterDate(entry.at, lang)}</span>
        </span>
      </div>

      <Paper lang={lang} parts={parts} fill={fill} seal={l.seal} />

      {l.note && <p class="mail-note">{t(l.note.zh, l.note.en)}</p>}
      {ps && <p class="mail-ps">{fill(t(ps.zh, ps.en))}</p>}

      {l.attach && (l.attach.coins || l.attach.character || l.attach.item) ? (
        <Enclosed l={l} taken={isClaimed} />
      ) : null}

      {asking && (
        <NameField
          id="mail-name"
          value={draft}
          label={t('足下如何称呼？', 'What shall I call you?')}
          hint={t('可留空，便称「园主」；日后在设置 · 名号里可改。', 'You may leave it blank (“friend”) and change it later in Settings.')}
          onDraft={setDraft}
          onEnter={take}
        />
      )}

      <div class="mail-actions">
        {gift && !isClaimed ? (
          <button type="button" class="btn btn-seal mail-take" onClick={take}>{t('收下', 'Accept')}</button>
        ) : gift ? (
          <span class="mail-taken"><b class="brush" aria-hidden="true">收</b>{t('已收', 'Accepted')}</span>
        ) : (
          <button type="button" class="btn mail-fold" onClick={() => (back ? openMail() : closeMail())}>{t('折好', 'Fold it away')}</button>
        )}
      </div>
    </div>
  );
}

/** The 八行笺: red rules on xuan paper, the Chinese written in columns from the right. */
function Paper(props: { lang: Lang; parts: ReturnType<typeof splitLetter>; fill(s: string): string; seal?: string }) {
  const { parts, fill } = props;
  const zh = props.lang === 'zh';
  const bg = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const text = fill(parts.salute) + fill(parts.body) + fill(parts.sign);
  // paint the paper once it has a size
  useEffect(() => {
    const c = bg.current, w = wrap.current;
    if (!c || !w) return;
    let last = '';
    const paint = () => {
      const r = w.getBoundingClientRect();
      const dpr = Math.min(2, dprOf());
      const k = `${Math.round(r.width)}x${Math.round(r.height)}`;
      if (!r.width || !r.height || k === last) return;
      last = k;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      try { paintPaper(c, 57); } catch { /* the css paper colour shows */ }
    };
    paint();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(paint) : null;
    ro?.observe(w);
    return () => ro?.disconnect();
  }, []);
  // columns: grow the page (a little at a time) until every column fits across it, up to a limit;
  // past that it scrolls sideways, from the right, as a hand scroll does
  useLayoutEffect(() => {
    const el = box.current;
    if (!zh || !el) return;
    const fit = () => {
      const max = Math.max(300, Math.min(640, window.innerHeight * 0.74));
      let h = Math.min(max, 320);
      el.style.height = h + 'px';
      while (el.scrollWidth > el.clientWidth + 1 && h < max) {
        h = Math.min(max, h + 28);
        el.style.height = h + 'px';
      }
    };
    fit();
    const fonts = document.fonts;
    fonts?.ready?.then(fit).catch(() => {});
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [zh, text]);
  return (
    <div class={'mail-paper' + (zh ? ' is-vertical' : '')} ref={wrap}>
      <canvas ref={bg} class="mail-paper-bg" aria-hidden="true" />
      <div class="mail-paper-text" ref={box} tabIndex={zh ? 0 : undefined} lang={zh ? 'zh-CN' : 'en'}>
        {parts.salute && <p class="mail-salute">{fill(parts.salute)}</p>}
        <p class="mail-body">{fill(parts.body)}</p>
        {/* the sender's seal under the signature (or at the foot of an unsigned letter) */}
        {(parts.sign || props.seal) && (
          <p class="mail-sign">
            {parts.sign && <span>{zh ? '——' : '— '}{fill(parts.sign)}</span>}
            {props.seal && <Seal text={props.seal} size={30} earned class="mail-paper-seal" />}
          </p>
        )}
      </div>
    </div>
  );
}

/** What the letter carries, as cards: the coins, the companion, the keepsake. */
function Enclosed(props: { l: LetterDef; taken: boolean }) {
  const t = useT();
  const a = props.l.attach ?? {};
  const p = play.value;
  const who = a.character ? CHARACTER[a.character] : undefined;
  const walking = !!who && isUnlockedIn(p, who.id);
  const KIND: Record<string, [string, string, string]> = { clue: ['证', '线索', 'A clue'], seal: ['印', '印', 'A seal'], keep: ['珍', '信物', 'A keepsake'] };
  return (
    <div class={'mail-enclosed' + (props.taken ? ' is-taken' : '')}>
      <p class="mail-enclosed-k">{props.taken ? t('随信之物 · 已收', 'Enclosed · accepted') : t('随信附上', 'Enclosed')}</p>
      <ul>
        {a.coins ? (
          <li class="mail-att is-coins">
            <span class="mail-att-art" aria-hidden="true"><CoinIcon size={30} /></span>
            <span class="mail-att-text">
              <b class="num">{fmtCoins(a.coins)}</b><small>{t('文 · 铜钱', 'coins')}</small>
            </span>
          </li>
        ) : null}
        {who ? (
          <li class="mail-att is-who">
            <span class="mail-att-art is-fan"><Portrait id={who.id} locked={false} size={48} eager /></span>
            <span class="mail-att-text">
              <b>{t(who.zh, who.en)}</b>
              <small>{props.taken ? t('已与你同行', 'walking with you') : walking ? t('已同行', 'already with you') : t('随信同来', 'comes with the letter')}</small>
            </span>
          </li>
        ) : null}
        {a.item ? (
          <li class="mail-att is-item">
            <span class="mail-att-art is-glyph brush" aria-hidden="true">{KIND[a.item.kind]?.[0] ?? '物'}</span>
            <span class="mail-att-text">
              <b>{t(a.item.zh, a.item.en)}</b>
              <small>{t(KIND[a.item.kind]?.[1] ?? '', KIND[a.item.kind]?.[2] ?? '')}</small>
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------------------------ askName

/** 「敢问尊姓大名？」 — the name sheet a story opens with askName(). Saving resolves with the name; 山野之人 with ''. */
function NameSheet() {
  const t = useT();
  const ask = nameAsk.value;
  const [draft, setDraft] = useState(playerName.value);
  if (!ask) return null;
  const save = () => {
    const clean = cleanName(draft);
    if (clean !== state.value.settings.playerName) setSettings({ playerName: clean });
    ask.resolve(clean);
  };
  const none = () => ask.resolve('');
  return (
    <Sheet open onClose={none} title={t('名号', 'Your name')} label={t('名号', 'Your name')}>
      <div class="mail-ask">
        <p class="mail-ask-prompt">{t(ask.promptZh, ask.promptEn)}</p>
        <NameField id="ask-name" value={draft} label={t('如何称呼', 'Your name')} onDraft={setDraft} onEnter={save} autoFocus />
        <div class="mail-ask-actions">
          <button type="button" class="btn btn-primary" onClick={save} disabled={!cleanName(draft)}>{t('就这样称呼', 'Call me that')}</button>
          <button type="button" class="btn btn-ghost" onClick={none}>{t('山野之人，无名无号', 'Just a traveller — no name')}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** The 信 mark with its unread dot (the garden's button and 入画's chip). */
export function MailGlyph() {
  const n = mail.value.box.filter((e) => !e.read).length;
  return (
    <>
      <span class="brush" aria-hidden="true">信</span>
      {n > 0 && <i class="mail-unread-dot" aria-hidden="true" />}
    </>
  );
}

/** 「信」 or 「信 · 1 封未拆」 for a 信 button's label. */
export function mailLabel(t: (zh: string, en: string) => string): string {
  const n = mail.value.box.filter((e) => !e.read).length;
  return n > 0 ? t(`信 · ${n} 封未拆`, `Letters · ${n} unread`) : t('信', 'Letters');
}
