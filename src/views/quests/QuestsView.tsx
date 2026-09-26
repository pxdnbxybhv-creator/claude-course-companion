// 任务簿 · Quest Book — the purse (钱囊: what's in it, what came in today and from where, and
// what coins are for), today's three errands, the companions' gallery (who you can walk the
// painting as, their skills, and what brings the others), every quest with its progress or its
// stamp and its coins, the seal album (印谱) and the book of chance encounters (奇遇录).
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { GameShell } from '../games/GameShell';
import { useT } from '../../app/i18n';
import { go } from '../../app/router';
import { lang, state as appState, today } from '../../app/store';
import {
  CHECKIN_COINS, ERRAND_COINS, ERRANDS_ALL_COINS, INCENSE_COINS, daily, encounterMet, play, questCoins, questTarget, questValue, selectCharacter,
} from '../../app/play';
import { CHARACTERS, CHARACTER, type CharacterDef } from '../../data/characters';
import { QUEST, QUESTS, type QuestDef } from '../../data/quests';
import { LETTER } from '../../data/letters';
import { openMail } from '../../app/mail';
import { ENCOUNTERS, type EncounterDef } from '../../data/encounters';
import { REGION } from '../walk/map';
import { CharacterSelect } from '../walk/characters/Select';
import { CoinBadge, CoinIcon, fmtCoins } from '../../ui/coins';
import { BrushBar, PaperPage, Portrait, Seal, Tally } from './bits';
import {
  COMPANION_QUESTS, SEAL_QUESTS, albumRequest, cnCount, companionCount, dayHeading, doneDate, encounterDay, isUnlocked,
  OTHER_SOURCES, ledgerToday, namedSources, routeForKey, routeForQuest, sealCount, stampText,
} from './helpers';
import { GAMES_PAY_LEAST, GAMES_PAY_TOP } from '../games/economy';
import './quests.css';

type T = (zh: string, en: string) => string;

export function QuestsView() {
  const t = useT();
  const p = play.value;
  const n = companionCount(p);
  const s = sealCount(p);
  const [cast, setCast] = useState(false);
  useEffect(() => {
    if (!albumRequest.pending) return;
    albumRequest.pending = false;
    // after the page transition has settled (it scrolls to the top)
    const tm = setTimeout(() => {
      const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
      document.getElementById('album')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }, 450);
    return () => clearTimeout(tm);
  }, []);
  return (
    <GameShell
      class="qb"
      titleZh="任务簿"
      titleEn="Quest Book"
      subtitle={t(`同伴 ${n}/${CHARACTERS.length} · 印 ${s}/${SEAL_QUESTS.length}`, `Companions ${n}/${CHARACTERS.length} · Seals ${s}/${SEAL_QUESTS.length}`)}
    >
      <Purse t={t} />
      <Daily t={t} />
      <Companions t={t} onCast={() => setCast(true)} />
      <Quests t={t} />
      <Album t={t} />
      <Encounters t={t} />
      <p class="qb-colophon" aria-hidden="true">
        <span class="brush">半亩</span>
        <span>{t('做事，交友，盖印。', 'Do things. Make friends. Collect seals.')}</span>
      </p>
      <CharacterSelect open={cast} onClose={() => setCast(false)} />
    </GameShell>
  );
}
export default QuestsView;

function SectionHead(props: { t: T; zh: string; en: string; count?: string; note?: string; action?: ComponentChildren }) {
  const zh = lang.value === 'zh';
  return (
    <header class="qb-h">
      <h2 class={zh ? 'brush' : 'latin'}>{zh ? props.zh : props.en}</h2>
      {props.count && <span class="qb-h-count num">{props.count}</span>}
      {props.note && <span class="qb-h-note">{props.note}</span>}
      <span class="qb-h-rule" aria-hidden="true" />
      {props.action}
    </header>
  );
}

// ------------------------------------------------------------------------------------ 日课

function Daily(props: { t: T }) {
  const { t } = props;
  const items = daily.value;
  const all = items.length > 0 && items.every((i) => i.done);
  const doneN = items.filter((i) => i.done).length;
  const l = lang.value;
  return (
    <section class="qb-sec qb-daily-sec" aria-labelledby="qb-daily-h">
      <div class={'qb-daily' + (all ? ' is-all' : '')}>
        <div class="qb-daily-head">
          <h2 id="qb-daily-h" class={l === 'zh' ? 'brush' : 'latin'}>{t('今日日课', "Today's errands")}</h2>
          <span class="qb-daily-day">{dayHeading(today.value, l)}</span>
          <span class="qb-daily-n num" aria-label={t(`已完成 ${doneN} 件，共 ${items.length} 件`, `${doneN} of ${items.length} done`)}>{doneN}<i>/</i>{items.length}</span>
        </div>
        <ol class="qb-errands">
          {items.map((it) => {
            const r = routeForKey(it.def.key);
            return (
              <li key={it.def.key} class={'qb-errand' + (it.done ? ' is-done' : '')}>
                <Tally value={it.value} target={it.def.target} done={it.done} />
                <span class="qb-errand-name">
                  {t(it.def.zh, it.def.en)}
                  <CoinChip n={ERRAND_COINS} got={it.done} t={t} />
                </span>
                <span class="qb-errand-n num">{it.value}/{it.def.target}</span>
                {!it.done && r ? (
                  <button type="button" class="qb-go" onClick={(e) => go(r, e)} aria-label={t(`前往：${it.def.zh}`, `Go: ${it.def.en}`)}>
                    <span aria-hidden="true">›</span>
                  </button>
                ) : <span class="qb-go-pad" aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
        <p class="qb-daily-foot">
          {all ? (
            <>
              <Seal text="毕" size={30} earned class="qb-daily-seal" />
              <span>
                {t('今日三事已毕，明日再来。', 'All three done — come back tomorrow.')}
                <span class="qb-foot-coins">{t(`共得 ${ERRAND_COINS * 3 + ERRANDS_ALL_COINS} 文`, `${ERRAND_COINS * 3 + ERRANDS_ALL_COINS} coins in all`)}</span>
              </span>
            </>
          ) : (
            <span>
              {t('每日三件小事，子夜更新；做完不做，皆随心意。', 'Three small things a day, renewed at midnight. Entirely optional.')}
              <span class="qb-foot-coins"><CoinIcon size={12} />{t(`三件皆毕，另赏 ${ERRANDS_ALL_COINS} 文`, `All three: ${ERRANDS_ALL_COINS} more`)}</span>
            </span>
          )}
        </p>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------ 同伴

function progressOf(q: QuestDef) {
  const target = questTarget(q);
  const value = Math.min(target, questValue(q, play.value, appState.value, today.value));
  return { value, target, frac: target ? value / target : 0 };
}

function Companions(props: { t: T; onCast: () => void }) {
  const { t } = props;
  const p = play.value;
  const current = CHARACTER[p.character] ?? CHARACTERS[0];
  const others = CHARACTERS.filter((c) => c.id !== current.id);
  const n = companionCount(p);
  return (
    <section class="qb-sec" aria-labelledby="qb-comp-h">
      <div id="qb-comp-h">
        <SectionHead t={t} zh="同伴" en="Companions" count={`${n} / ${CHARACTERS.length}`}
          action={<button type="button" class="btn btn-small qb-cast-btn" onClick={props.onCast}>{t('立体观之', 'View in 3D')}</button>} />
      </div>
      <div class="qb-gallery">
        <Hero c={current} t={t} />
        {others.map((c) => <CompanionCard key={c.id} c={c} t={t} />)}
      </div>
    </section>
  );
}

function Names(props: { c: CharacterDef; big?: boolean }) {
  const { c } = props;
  const zh = lang.value === 'zh';
  return (
    <div class={'qb-names' + (props.big ? ' is-big' : '')}>
      {zh ? (
        <><span class="qb-zh">{c.zh}</span><span class="qb-en">{c.en}</span></>
      ) : (
        <><span class="qb-en is-primary">{c.en}</span><span class="qb-zh is-small">{c.zh}</span></>
      )}
    </div>
  );
}

function walkAs(c: CharacterDef, e: Event) {
  if (selectCharacter(c.id)) go('walk', e);
}

function Hero(props: { c: CharacterDef; t: T }) {
  const { c, t } = props;
  return (
    <article class="qb-hero" aria-label={t(`同游中：${c.zh}`, `Walking as ${c.en}`)}>
      <div class="qb-hero-fan">
        <Portrait id={c.id} locked={false} size={188} class="qb-hero-portrait" />
      </div>
      <div class="qb-hero-text">
        <span class="qb-tag is-current">{t('同游中', 'Walking as')}</span>
        <Names c={c} big />
        <p class="qb-title">「{t(c.titleZh, c.titleEn)}」</p>
        <p class="qb-desc">{t(c.descZh, c.descEn)}</p>
        <p class="qb-ability"><span class="qb-ab-mark" aria-hidden="true">◈</span>{t(c.abilityZh, c.abilityEn)}</p>
        <Skill c={c} t={t} long />
        <button type="button" class="btn btn-primary qb-hero-go" onClick={(e) => walkAs(c, e)}>{t('入画', 'Into the painting')}</button>
      </div>
    </article>
  );
}

/** A companion a letter brings: 「初见礼 · 在信中」. */
function giftLine(c: CharacterDef, t: T): string {
  const l = c.letter ? LETTER[c.letter] : undefined;
  return t(`${l?.subject.zh ?? '书信'} · 在信中`, `${l?.subject.en ?? 'A letter'} · in your letters`);
}

function CompanionCard(props: { c: CharacterDef; t: T }) {
  const { c, t } = props;
  const p = play.value;
  const open = isUnlocked(c.id, p);
  const q = c.unlock !== 'default' ? QUEST[c.unlock] : undefined;
  const prog = q && !open ? progressOf(q) : null;
  return (
    <article class={'qb-comp' + (open ? '' : ' is-locked')}>
      <Portrait id={c.id} locked={!open} size={112} />
      <Names c={c} />
      <p class="qb-title">「{t(c.titleZh, c.titleEn)}」</p>
      {open ? (
        <>
          <p class="qb-ability"><span class="qb-ab-mark" aria-hidden="true">◈</span>{t(c.abilityZh, c.abilityEn)}</p>
          <Skill c={c} t={t} />
          <button type="button" class="btn btn-small qb-comp-go" onClick={(e) => walkAs(c, e)}>{t('入画同游', 'Walk as them')}</button>
        </>
      ) : q && prog ? (
        <div class="qb-lock">
          <Skill c={c} t={t} locked />
          <p class="qb-lock-q"><span class="qb-lock-mark" aria-hidden="true">约</span>{t(q.zh, q.en)}</p>
          <p class="qb-lock-desc">{t(q.descZh, q.descEn)}</p>
          <div class="qb-prog">
            <BrushBar seed={q.id} frac={prog.frac} label={t(`进度 ${prog.value}/${prog.target}`, `Progress ${prog.value} of ${prog.target}`)} />
            <span class="qb-prog-n num">{prog.value}/{prog.target}</span>
          </div>
          <p class="qb-hint">{t(q.hintZh, q.hintEn)}</p>
        </div>
      ) : c.unlock === 'gift' ? (
        <div class="qb-lock">
          <Skill c={c} t={t} locked />
          <p class="qb-lock-q"><span class="qb-lock-mark" aria-hidden="true">信</span>{giftLine(c, t)}</p>
          <p class="qb-lock-desc">{t('随一封信而来：拆开信匣里的来信，收下便是。', 'Comes with a letter: open it in your letters and accept it.')}</p>
          <button type="button" class="btn btn-small qb-comp-go" onClick={() => openMail(c.letter)}>{t('拆信', 'Open the letter')}</button>
        </div>
      ) : null}
    </article>
  );
}

// ------------------------------------------------------------------------------------ 任务

function Quests(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const dc = COMPANION_QUESTS.filter((q) => p.done[q.id]).length;
  const ds = SEAL_QUESTS.filter((q) => p.done[q.id]).length;
  return (
    <section class="qb-sec" aria-labelledby="qb-q-h">
      <div id="qb-q-h"><SectionHead t={t} zh="任务" en="Quests" count={`${dc + ds} / ${QUESTS.length}`} /></div>
      <h3 class="qb-group"><span>{t('同伴之约', 'Companion quests')}</span><i class="num">{dc}/{COMPANION_QUESTS.length}</i></h3>
      <ul class="qb-quests">{COMPANION_QUESTS.map((q) => <QuestItem key={q.id} q={q} t={t} />)}</ul>
      <h3 class="qb-group"><span>{t('印章之约', 'Seal quests')}</span><i class="num">{ds}/{SEAL_QUESTS.length}</i></h3>
      <ul class="qb-quests">{SEAL_QUESTS.map((q) => <QuestItem key={q.id} q={q} t={t} />)}</ul>
    </section>
  );
}

function QuestItem(props: { q: QuestDef; t: T }) {
  const { q, t } = props;
  const p = play.value;
  const doneOn = p.done[q.id];
  const prog = progressOf(q);
  const r = routeForQuest(q);
  const l = lang.value;
  const reward = 'character' in q.reward ? CHARACTER[q.reward.character] : null;
  return (
    <li class={'qb-quest' + (doneOn ? ' is-done' : '')}>
      <div class="qb-q-main">
        <h4 class="qb-q-name">
          <span class={l === 'zh' ? 'brush' : 'latin'}>{t(q.zh, q.en)}</span>
          {l === 'zh' && <small class="latin">{q.en}</small>}
        </h4>
        <p class="qb-q-desc">{t(q.descZh, q.descEn)}</p>
        <div class="qb-q-meta">
          <p class="qb-q-reward">
            {reward ? (
              <>
                {doneOn ? <Portrait id={reward.id} locked={false} size={22} class="qb-q-mini" /> : <span class="qb-q-mini is-empty" aria-hidden="true">?</span>}
                {t(`得同伴 · ${reward.zh}`, `Companion · ${reward.en}`)}
              </>
            ) : 'seal' in q.reward ? (
              <><span class="qb-q-sealmark" aria-hidden="true">印</span>{t(`得印 · ${q.reward.seal}`, `Seal · ${q.reward.sealEn}`)}</>
            ) : null}
            <CoinChip n={questCoins(q)} got={!!doneOn} t={t} />
          </p>
          {!doneOn && (
            // the bar and its count wrap as one
            <span class="qb-q-prog">
              <BrushBar seed={q.id} frac={prog.frac} label={t(`进度 ${prog.value}/${prog.target}`, `Progress ${prog.value} of ${prog.target}`)} />
              <span class="qb-prog-n num">{prog.value}/{prog.target}</span>
            </span>
          )}
        </div>
        {doneOn ? (
          <p class="qb-q-date">{t(`${doneDate(doneOn, 'zh')} 完成`, `Finished ${doneDate(doneOn, 'en')}`)}</p>
        ) : (
          <p class="qb-hint">
            <span>{t(q.hintZh, q.hintEn)}</span>
            {r && (
              <button type="button" class="qb-q-go" onClick={(e) => go(r, e)}>{t('前往', 'Go')}<span aria-hidden="true"> ›</span></button>
            )}
          </p>
        )}
      </div>
      {doneOn && (
        <div class="qb-q-stamp" title={t('已完成', 'Done')}>
          <Seal text={stampText(q)} size={58} earned />
        </div>
      )}
    </li>
  );
}

// ------------------------------------------------------------------------------------ 印谱

function Album(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const s = sealCount(p);
  const l = lang.value;
  return (
    <section class="qb-sec" aria-labelledby="qb-album-h" id="album">
      <div id="qb-album-h"><SectionHead t={t} zh="印谱" en="Seal album" count={`${s} / ${SEAL_QUESTS.length}`} /></div>
      <PaperPage seed={23} class="qb-album">
        <div class="qb-album-frame" aria-hidden="true" />
        <div class="qb-album-title" aria-hidden="true">
          <span class="brush">半亩印谱</span>
          <small>{l === 'zh' ? `已得${cnCount(s)}方` : `${s} of ${SEAL_QUESTS.length}`}</small>
        </div>
        <ul class="qb-album-grid">
          {SEAL_QUESTS.map((q) => {
            const earned = !!p.done[q.id];
            const text = 'seal' in q.reward ? q.reward.seal : stampText(q);
            const en = 'seal' in q.reward ? q.reward.sealEn : '';
            return (
              <li key={q.id} class={'qb-album-item' + (earned ? ' is-earned' : '')}>
                <Seal text={text} size={76} earned={earned} />
                <span class="qb-album-cap">
                  <b>{l === 'zh' ? text : en}</b>
                  <i>{earned ? t(q.zh, q.en) : t('未得 · ' + q.zh, 'Not yet · ' + q.en)}</i>
                </span>
              </li>
            );
          })}
        </ul>
      </PaperPage>
    </section>
  );
}

// ------------------------------------------------------------------------------------ bits

/** A reward in coins: 「+30」 before, 「已得 30」 after. */
function CoinChip(props: { n: number; got: boolean; t: T }) {
  const { n, got, t } = props;
  return (
    <span class={'qb-coinchip num' + (got ? ' is-got' : '')}>
      <CoinIcon size={12} />
      <span aria-hidden="true">{got ? t(`已得 ${fmtCoins(n)}`, `${fmtCoins(n)} ✓`) : `+${fmtCoins(n)}`}</span>
      <span class="visually-hidden">{got ? t(`已得 ${n} 文`, `${n} coins earned`) : t(`奖 ${n} 文`, `Reward: ${n} coins`)}</span>
    </span>
  );
}

/** A companion's active skill (技): its glyph, its name, and (long) what it does. */
function Skill(props: { c: CharacterDef; t: T; long?: boolean; locked?: boolean }) {
  const { c, t } = props;
  const k = c.skill;
  if (!k) return null;
  return (
    <p class={'qb-skill' + (props.long ? ' is-long' : '') + (props.locked ? ' is-locked' : '')}>
      <span class="qb-skill-glyph" aria-hidden="true">{k.glyph}</span>
      <span class="qb-skill-text">
        <b>{t(`技 · ${k.zh}`, `Skill · ${k.en}`)}</b>
        {props.long && <span>{t(k.descZh, k.descEn)}</span>}
      </span>
    </p>
  );
}

// ------------------------------------------------------------------------------------ 钱囊

/** 半亩通宝: a bronze cash coin on a cinnabar cord, read top-bottom-right-left like 开元通宝. */
function CoinArt() {
  return (
    <svg class="qb-coinart" viewBox="0 0 100 124" aria-hidden="true">
      <defs>
        <radialGradient id="qbCoinG" cx="38%" cy="32%" r="75%">
          <stop offset="0" stop-color="#f0d38c" />
          <stop offset="0.45" stop-color="#c79a45" />
          <stop offset="1" stop-color="#7d5620" />
        </radialGradient>
      </defs>
      {/* the cord: behind the coin and through its hole, knotted below with a small tassel */}
      <path class="qb-coinart-cord" d="M50 0 V92" />
      <path class="qb-coinart-coin" fill-rule="evenodd" d="M10 50a40 40 0 1 0 80 0a40 40 0 1 0-80 0Z M41 41h18v18h-18Z" />
      <circle class="qb-coinart-rim" cx="50" cy="50" r="36.5" />
      <rect class="qb-coinart-rim" x="37.5" y="37.5" width="25" height="25" rx="1" />
      <g class="qb-coinart-patina">
        <circle cx="27" cy="66" r="4.5" /><circle cx="31" cy="70" r="2.6" /><circle cx="72" cy="28" r="3.2" /><circle cx="76" cy="62" r="1.8" />
      </g>
      <g class="qb-coinart-glyphs">
        <text x="50" y="26.5">半</text>
        <text x="50" y="74">亩</text>
        <text x="74" y="50.5">通</text>
        <text x="26" y="50.5">宝</text>
      </g>
      <path class="qb-coinart-knot" d="M50 90c-5 0-7 4-4 7s8 3 8 0-2-7-4-7Z" />
      <path class="qb-coinart-tassel" d="M47 97 L44 122 M50 98 V123 M53 97 L56 122" />
    </svg>
  );
}

function Purse(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const l = lang.value;
  const { rows, total } = ledgerToday(p, today.value);
  const qMin = Math.min(...QUESTS.map(questCoins)), qMax = Math.max(...QUESTS.map(questCoins));
  const eMin = Math.min(...ENCOUNTERS.map((e) => e.coins)), eMax = Math.max(...ENCOUNTERS.map((e) => e.coins));
  const sources: [string, string, string][] = [
    ['日课', 'Errands', `${ERRAND_COINS}`],
    ['任务', 'Quests', `${qMin}–${qMax}`],
    ['奇遇', 'Encounters', `${eMin}–${eMax}`],
    ['游艺', 'Games', `${GAMES_PAY_LEAST}–${GAMES_PAY_TOP}`],
    ['打卡', 'Check-ins', `${CHECKIN_COINS}`],
    ['燃香', 'Incense', `${INCENSE_COINS}`],
    ...namedSources(p),
    ...OTHER_SOURCES,
  ];
  return (
    <section class="qb-sec qb-purse-sec" aria-labelledby="qb-purse-h">
      <div class={'qb-purse' + (l === 'en' ? ' is-en' : '')}>
        <div class="qb-purse-top">
          <CoinArt />
          <div class="qb-purse-main">
            <h2 id="qb-purse-h" class={l === 'zh' ? 'brush' : 'latin'}>{t('钱囊', 'Purse')}</h2>
            <p class="qb-purse-n">
              <CoinBadge size={24} />
              <span class="qb-purse-unit">{t('文', 'coins')}</span>
            </p>
            <p class={'qb-purse-today' + (total > 0 ? ' is-up' : '')}>
              {total > 0 ? t(`今日进账 +${fmtCoins(total)} 文`, `Today +${fmtCoins(total)}`) : t('今日尚无进账', 'Nothing in yet today')}
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <ul class="qb-ledger" aria-label={t('今日进账', "Today's takings")}>
            {rows.map((r) => (
              <li key={r.key} class={r.hintZh ? 'has-hint' : undefined}>
                <span>{t(r.zh, r.en)}{r.hintZh && <small class="qb-ledger-hint">{t(r.hintZh, r.hintEn ?? '')}</small>}</span>
                <b class="num">+{fmtCoins(r.coins)}</b>
              </li>
            ))}
          </ul>
        )}
        <div class="qb-purse-ways">
          <div class="qb-way">
            <span class="qb-way-mark" aria-hidden="true">来</span>
            <div class="qb-way-body">
              <p class="qb-way-k">{t('钱从何来', 'Where coins come from')}</p>
              <ul class="qb-sources">
                {sources.map(([zh, en, n]) => (
                  <li key={zh}><span>{t(zh, en)}</span><b class="num">{n}</b></li>
                ))}
              </ul>
              <p class="qb-way-note">
                {t('同一种游戏，每日头几回全额，此后减半、再减半；明日复原。', 'Each game pays in full for its first few rounds a day, then half, then a quarter — and again in full tomorrow.')}
              </p>
            </div>
          </div>
          <div class="qb-way">
            <span class="qb-way-mark is-to" aria-hidden="true">去</span>
            <div class="qb-way-body">
              <p class="qb-way-k">{t('钱往何处', 'What coins are for')}</p>
              <p class="qb-way-text">
                {t('家园——起屋、围篱、栽花、开菜畦，养猫犬鱼鹤，请人来住；也可在水乡摊上买些小玩意。',
                  'The homestead: raise a house, a fence, flowers and vegetable beds; keep pets; invite folk to live there. The water-town stalls sell small things too.')}
              </p>
              <button type="button" class="qb-q-go qb-way-go" onClick={(e) => go('walk', e)}>
                {t('入画 · 家园在园西', 'Into the painting · the homestead lies west of the garden')}<span aria-hidden="true"> ›</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------ 奇遇录

function Encounters(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const met = ENCOUNTERS.filter((e) => encounterMet(p, e.id));
  const unmet = ENCOUNTERS.filter((e) => !encounterMet(p, e.id));
  // the most recent first (those with a day on record), then in the book's order
  met.sort((a, b) => (encounterDay(p, b.id) ?? '').localeCompare(encounterDay(p, a.id) ?? ''));
  return (
    <section class="qb-sec" aria-labelledby="qb-qy-h" id="qiyu">
      <div id="qb-qy-h">
        <SectionHead t={t} zh="奇遇录" en="Chance encounters" count={`${met.length} / ${ENCOUNTERS.length}`} />
      </div>
      <p class="qb-qy-lead">
        {t('画中另有些奇遇：在对的时辰、对的地方才会发生；换个同伴去，往往别有一番。',
          'The painting holds a few chance encounters: they happen only at the right hour in the right place — and often play out differently with a different companion.')}
      </p>
      <ul class="qb-qy">
        {met.map((e) => <EncounterCard key={e.id} e={e} met t={t} />)}
        {unmet.map((e) => <EncounterCard key={e.id} e={e} met={false} t={t} />)}
      </ul>
    </section>
  );
}

function EncounterCard(props: { e: EncounterDef; met: boolean; t: T }) {
  const { e, met, t } = props;
  const p = play.value;
  const l = lang.value;
  const where = e.region === 'any' ? t('处处', 'Anywhere') : t(REGION[e.region]?.zh ?? '', REGION[e.region]?.en ?? '');
  const day = met ? encounterDay(p, e.id) : undefined;
  const special = e.special.map((id) => CHARACTER[id]).filter(Boolean);
  return (
    <li class={'qb-qy-card' + (met ? ' is-met' : '')}>
      <div class="qb-qy-seal">
        <Seal text={e.zh} size={met ? 54 : 46} earned={met} />
      </div>
      <h3 class="qb-qy-name">
        <span class={l === 'zh' ? 'brush' : 'latin'}>{t(e.zh, e.en)}</span>
        {l === 'zh' && <small class="latin">{e.en}</small>}
      </h3>
      <p class="qb-qy-meta">
        <span class="qb-qy-where">{where}</span>
        <span aria-hidden="true"> · </span>
        {met ? <span class="qb-qy-date">{day ? doneDate(day, l) : t('已遇', 'Met')}</span> : <span>{t('未遇', 'Not yet')}</span>}
      </p>
      {met ? (
        <blockquote class="qb-qy-note">{t(e.noteZh, e.noteEn)}</blockquote>
      ) : (
        <p class="qb-qy-hint">{t(e.hintZh, e.hintEn)}</p>
      )}
      <div class="qb-qy-foot">
        {special.length > 0 && (
          <span class="qb-qy-who">
            <i>{t('另有际遇', 'Plays out differently for')}</i>
            {special.map((c) => <b key={c.id}>{t(c.zh, c.en)}</b>)}
          </span>
        )}
        <CoinChip n={e.coins} got={met} t={t} />
      </div>
    </li>
  );
}
