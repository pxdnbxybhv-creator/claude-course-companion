// 案卷 · the casebook of 「花朝失印案」: the clue cards (a found one opens to its card; one not found is
// only a ？), the testimony cards (a broken lie struck through and sealed 破), 「问青鸟」 (the bluebird's
// notes, each new one counting against the grade), and pick mode — 「出示证物」 in a testimony opens the
// book to choose the card to show. A Sheet over the walk (WalkView pauses the world while it is open).
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { play } from '../../../app/play';
import { Sheet, Segmented } from '../../../ui/kit';
import * as K from '../features/taoyuan/case';
import { VILLAGERS } from '../features/taoyuan/folk';
import { askBird, caseSheet, closeCaseSheet, showEvidence, type CaseTab } from './state';
import './case.css';

type T = (zh: string, en: string) => string;
const L = (t: T, l: K.Line) => t(l.zh, l.en);
const NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

export function CaseSheet() {
  const t = useT();
  const s = caseSheet.value;
  const f = play.value.flags;
  const [tab, setTab] = useState<CaseTab>('clues');
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    if (!s) return;
    setTab(s.pick && s.tab === 'bird' ? 'clues' : s.tab);
    setOpenKey(s.focus ?? null);
  }, [s]);
  const open = s !== null;
  const pick = s?.pick ?? null;
  const pr = K.progress(f);
  const rd = K.ready(f);
  const solved = !!f[K.CASE_FLAGS.solved];
  const who = pick ? VILLAGERS[pick.who] : null;
  const opts: { value: CaseTab; label: string }[] = [
    { value: 'clues', label: t(`物证 ${pr.clues}/12`, `Evidence ${pr.clues}/12`) },
    { value: 'words', label: t(`证词 ${pr.words}/6`, `Testimony ${pr.words}/6`) },
  ];
  if (!pick) opts.push({ value: 'bird', label: t('青鸟', 'Bluebird') });
  return (
    <Sheet open={open} onClose={closeCaseSheet} title={t('案卷', 'Casebook')} label={t('案卷', 'Casebook')}>
      <div class={'case-sheet' + (pick ? ' is-pick' : '')}>
        {pick && who ? (
          <p class="case-pickline" role="status">
            <span class="case-pick-seal brush" aria-hidden="true">质</span>
            {t(`对质 · 向${who.zh}出示一件证物`, `Confront · show ${who.en} a piece of evidence`)}
          </p>
        ) : (
          <p class="case-lead">
            <b>{L(t, K.CASE_TITLE.name)}</b>
            <span>{solved ? t('已断', 'Judged') : rd.ok ? t('证据已足：可请秦守拙到庭。', 'Enough evidence: ask Qin Shouzhuo to gather everyone.') : t(`子正未过，花还悬着。尚缺 ${rd.missing} 件。`, `Midnight holds; the petals still hang. ${rd.missing} still missing.`)}</span>
          </p>
        )}
        <Segmented<CaseTab> value={tab} onChange={setTab} label={t('案卷', 'Casebook')} options={opts} />
        {pick && tab === 'clues' && pr.clues === 0 && <p class="case-empty">{t('手头还没有物证。', 'No evidence in hand yet.')}</p>}
        {tab === 'clues' && (
          <>
            <ul class="case-cards">
              {K.CLUES.filter((c) => f[K.clueFlag(c.key)]).map((c) => <ClueCard key={c.key} c={c} t={t} f={f} open={openKey === c.key} onToggle={() => setOpenKey(openKey === c.key ? null : c.key)} pick={!!pick} />)}
            </ul>
            {!pick && pr.clues < K.CLUES.length && (
              <ul class="case-unfound" aria-label={t('尚未寻得', 'Not yet found')}>
                {K.CLUES.filter((c) => !f[K.clueFlag(c.key)]).map((c) => <ClueCard key={c.key} c={c} t={t} f={f} open={false} onToggle={() => {}} pick={false} />)}
              </ul>
            )}
          </>
        )}
        {tab === 'words' && (
          <ul class="case-cards">
            {K.WITNESSES.map((w) => <WordCard key={w.key} w={w} t={t} f={f} pick={!!pick} />)}
          </ul>
        )}
        {tab === 'bird' && !pick && <Bird t={t} f={f} />}
        {pick && (
          <button type="button" class="btn case-nopick" onClick={closeCaseSheet}>{t('不出示', 'Show nothing')}</button>
        )}
      </div>
    </Sheet>
  );
}

function ClueCard(props: { c: K.Clue; t: T; f: Readonly<Record<string, true | undefined>>; open: boolean; onToggle(): void; pick: boolean }) {
  const { c, t, f } = props;
  const found = !!f[K.clueFlag(c.key)];
  const n = lang.value === 'zh' ? NUM[c.n] : String(c.n);
  if (!found) {
    // (in pick mode, only what is in hand is shown)
    if (props.pick) return null;
    return (
      <li class="case-card is-hidden">
        <span class="case-n" aria-hidden="true">{n}</span>
        <b class="case-q" aria-label={t(`第${c.n}件，未得`, `No. ${c.n}, not found`)}>？</b>
      </li>
    );
  }
  const adds = c.addenda.filter((a) => f[a.flag]);
  return (
    <li class={'case-card is-found' + (props.open ? ' is-open' : '')}>
      <div class="case-row">
        <button type="button" class="case-head" aria-expanded={props.open} onClick={props.onToggle}>
          <span class="case-n" aria-hidden="true">{n}</span>
          <b>{L(t, c.name)}</b>
          {!props.pick && <span class="case-stamp brush" aria-hidden="true">证</span>}
        </button>
        {props.pick && <button type="button" class="btn btn-seal case-show" onClick={() => showEvidence(c.key)}>{t('出示', 'Show')}</button>}
      </div>
      {props.open && (
        <div class="case-body">
          <p>{L(t, c.card)}</p>
          {c.key === 'zuji' && <Prints t={t} />}
          {adds.map((a) => <p class="case-add" key={a.flag}>{L(t, a.line)}</p>)}
        </div>
      )}
    </li>
  );
}

/** C5's table: the six sets of prints and their depths. */
function Prints(props: { t: T }) {
  const { t } = props;
  return (
    <table class="case-prints">
      <thead><tr><th>{t('足迹', 'Prints')}</th><th>{t('覆花', 'Cover')}</th></tr></thead>
      <tbody>
        {K.PRINTS.map((p) => (
          <tr key={p.key} class={p.kind === 'patched' ? 'is-key' : ''}>
            <td>{L(t, p.name)}{p.note.zh && <small>{L(t, p.note)}</small>}</td>
            <td class="num">{L(t, p.coverName)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WordCard(props: { w: K.Witness; t: T; f: Readonly<Record<string, true | undefined>>; pick: boolean }) {
  const { w, t, f } = props;
  const v = VILLAGERS[w.key];
  const heard = !!f[K.heardFlag(w.key)];
  const n = lang.value === 'zh' ? NUM[w.n] : String(w.n);
  if (!heard) {
    if (props.pick) return null;
    return (
      <li class="case-card is-hidden">
        <span class="case-n" aria-hidden="true">{n}</span>
        <b class="case-q">{t(`${v.zh}　？`, `${v.en}  ?`)}</b>
      </li>
    );
  }
  const stage = K.stageOf(w.key, f);
  const q = (l: K.Line) => (lang.value === 'zh' ? `「${l.zh}」` : `“${l.en}”`);
  const rows: { l: K.Line; struck?: boolean; truth?: boolean; add?: boolean }[] = [];
  if (w.key === 'xiaoman') {
    rows.push({ l: K.T6.testimony, truth: true });
    rows.push({ l: K.T6.pass });
  } else {
    rows.push({ l: w.opening[0], struck: stage > 0 });
    for (const l of w.opening.slice(1)) rows.push({ l });
    w.breaks.forEach((b, i) => {
      if (stage <= i) return;
      // (三娘's first break is her second lie)
      const lieAgain = w.key === 'sang' && i === 0;
      for (const l of b.says) rows.push({ l, struck: lieAgain && stage > 1, truth: !lieAgain });
    });
    if (stage >= w.breaks.length) for (const l of w.after) rows.push({ l, truth: true });
    if (w.key === 'sang' && f[K.addFlag('sang')]) rows.push({ l: K.TOOLS.rabbit.addendum, add: true });
  }
  const broken = w.breaks.length > 0 && stage > 0;
  return (
    <li class={'case-card is-found is-open case-word' + (broken ? ' is-broken' : '')}>
      <div class="case-row">
        <div class="case-head">
          <span class="case-n" aria-hidden="true">{n}</span>
          <b>{t(v.zh, v.en)}</b>
          <small>{L(t, w.where)}</small>
          {broken && <span class="case-stamp is-po brush" aria-label={t('谎言已破', 'A lie broken')}>破</span>}
        </div>
        {props.pick && <button type="button" class="btn btn-seal case-show" onClick={() => showEvidence(`T:${w.key}`)}>{t('出示', 'Show')}</button>}
      </div>
      <div class="case-body">
        {rows.map((r, i) => (
          <p key={i} class={(r.struck ? 'is-struck' : '') + (r.truth ? ' is-truth' : '') + (r.add ? ' case-add' : '')}>{r.add || r.l.zh.startsWith('（') ? L(t, r.l) : q(r.l)}</p>
        ))}
      </div>
    </li>
  );
}

function Bird(props: { t: T; f: Readonly<Record<string, true | undefined>> }) {
  const { t, f } = props;
  const [note, setNote] = useState<K.Hint | null>(null);
  const [seq, setSeq] = useState(0);
  const read = K.hintsRead(f);
  const asked = play.value.counters[K.COUNTERS.hint] ?? 0;
  const solved = !!f[K.CASE_FLAGS.solved];
  const next = K.nextHint(f);
  return (
    <div class="case-bird">
      <div class="case-bird-top">
        <button type="button" class="btn case-ask" disabled={solved} onClick={() => { setNote(askBird()); setSeq((n) => n + 1); }}>
          <BirdMark />
          {t('问青鸟', 'Ask the bluebird')}
        </button>
        <p class="case-bird-note">
          {next.fresh
            ? t(`每读一张新笺，评等便低一分。已问 ${asked} 次。`, `Each new note lowers the grade a little. Asked ${asked} so far.`)
            : t('这一张已读过，再看不算。', 'A note already read costs nothing.')}
        </p>
      </div>
      {note && (
        <div class="case-note is-new" key={seq} role="status">
          <BirdMark />
          <p>{L(t, note.line)}</p>
        </div>
      )}
      {read.length > 0 && (
        <ol class="case-notes" aria-label={t('读过的笺', 'Notes read')}>
          {read.filter((h) => !note || h.step !== note.step || h.tier !== note.tier).map((h) => (
            <li key={`${h.step}${h.tier}`}>
              <small>{L(t, K.HINT_STEP[h.step].name)} · {t(['', '一', '二', '三'][h.tier], String(h.tier))}</small>
              <span>{L(t, h.line)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** A little bluebird, in ink and blue. */
function BirdMark() {
  return (
    <svg class="case-birdmark" viewBox="0 0 32 24" width="28" height="21" aria-hidden="true">
      <path d="M3 15c4-1 7-5 12-5 4 0 6 2 8 4l6-2-4 4c-1 4-6 6-11 6-6 0-10-3-11-7z" fill="#3d6fb0" />
      <path d="M11 13c3-6 8-9 13-9-2 3-4 7-9 10z" fill="#2b4f82" />
      <circle cx="23" cy="14" r="1.1" fill="#1b1916" />
      <path d="M27 13l4-1-3 2z" fill="#e8b04a" />
    </svg>
  );
}
