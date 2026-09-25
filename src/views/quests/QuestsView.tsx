// 任务簿 · Quest Book — today's three errands, the companions' gallery (who you can walk the
// painting as, and what brings the others), every quest with its progress or its stamp, and the
// seal album (印谱) of the seals you have earned.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { GameShell } from '../games/GameShell';
import { useT } from '../../app/i18n';
import { go } from '../../app/router';
import { lang, state as appState, today } from '../../app/store';
import { daily, play, questTarget, questValue, selectCharacter } from '../../app/play';
import { CHARACTERS, CHARACTER, type CharacterDef } from '../../data/characters';
import { QUEST, QUESTS, type QuestDef } from '../../data/quests';
import { CharacterSelect } from '../walk/characters/Select';
import { BrushBar, PaperPage, Portrait, Seal, Tally } from './bits';
import {
  COMPANION_QUESTS, SEAL_QUESTS, albumRequest, cnCount, companionCount, dayHeading, doneDate, isUnlocked, questsDone,
  routeForKey, routeForQuest, sealCount, stampText,
} from './helpers';
import './quests.css';

type T = (zh: string, en: string) => string;

export function QuestsView() {
  const t = useT();
  const p = play.value;
  const n = companionCount(p);
  const s = sealCount(p);
  const d = questsDone(p);
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
      subtitle={t(`同伴 ${n}/${CHARACTERS.length} · 印 ${s}/${SEAL_QUESTS.length} · 已成 ${d}/${QUESTS.length}`, `Companions ${n}/${CHARACTERS.length} · Seals ${s}/${SEAL_QUESTS.length}`)}
    >
      <Daily t={t} />
      <Companions t={t} onCast={() => setCast(true)} />
      <Quests t={t} />
      <Album t={t} />
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
              <li class={'qb-errand' + (it.done ? ' is-done' : '')}>
                <Tally value={it.value} target={it.def.target} done={it.done} />
                <span class="qb-errand-name">{t(it.def.zh, it.def.en)}</span>
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
              <span>{t('今日三事已毕，明日再来。', 'All three done — come back tomorrow.')}</span>
            </>
          ) : (
            <span>{t('每日三件小事，子夜更新；做完不做，皆随心意。', 'Three small things a day, renewed at midnight. Entirely optional.')}</span>
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
        {others.map((c) => <CompanionCard c={c} t={t} />)}
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
        <button type="button" class="btn btn-primary qb-hero-go" onClick={(e) => walkAs(c, e)}>{t('入画', 'Into the painting')}</button>
      </div>
    </article>
  );
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
          <button type="button" class="btn btn-small qb-comp-go" onClick={(e) => walkAs(c, e)}>{t('入画同游', 'Walk as them')}</button>
        </>
      ) : q && prog ? (
        <div class="qb-lock">
          <p class="qb-lock-q"><span class="qb-lock-mark" aria-hidden="true">约</span>{t(q.zh, q.en)}</p>
          <p class="qb-lock-desc">{t(q.descZh, q.descEn)}</p>
          <div class="qb-prog">
            <BrushBar seed={q.id} frac={prog.frac} label={t(`进度 ${prog.value}/${prog.target}`, `Progress ${prog.value} of ${prog.target}`)} />
            <span class="qb-prog-n num">{prog.value}/{prog.target}</span>
          </div>
          <p class="qb-hint">{t(q.hintZh, q.hintEn)}</p>
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
      <ul class="qb-quests">{COMPANION_QUESTS.map((q) => <QuestItem q={q} t={t} />)}</ul>
      <h3 class="qb-group"><span>{t('印章之约', 'Seal quests')}</span><i class="num">{ds}/{SEAL_QUESTS.length}</i></h3>
      <ul class="qb-quests">{SEAL_QUESTS.map((q) => <QuestItem q={q} t={t} />)}</ul>
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
          </p>
          {!doneOn && (
            <>
              <BrushBar seed={q.id} frac={prog.frac} label={t(`进度 ${prog.value}/${prog.target}`, `Progress ${prog.value} of ${prog.target}`)} />
              <span class="qb-prog-n num">{prog.value}/{prog.target}</span>
            </>
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
              <li class={'qb-album-item' + (earned ? ' is-earned' : '')}>
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
