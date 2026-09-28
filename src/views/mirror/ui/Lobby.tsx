// 水月幻镜 · the lobby (GDD §18.1): the bronze mirror with the chosen companion, the selectors (map,
// 镜境, 镜誓), the 「入镜」 fee button (今日免费 seal · 20 文 · 还差 N 文 · 续镜 · 已付), or — while a run
// is paused — its card with 续镜 and 弃镜; the day's status line with the ⓘ rules, the 今日镜 card
// and the footer (镜鉴 · 镜碑 · 心镜 · 心得 · 设置 · 初 教程); a player with history gets the tutorial's
// one-time ribbon above the status line.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror, storageOk } from '../../../app/mirror';
import { coins, play, unlocked } from '../../../app/play';
import { todayKey } from '../../../core/date';
import type { CharacterId } from '../../../data/characters';
import { Sheet } from '../../../ui/kit';
import { CoinBadge } from '../../../ui/coins';
import { DIFF_REG, MAP_REG, MUTATOR_REG, TERM_MOD_REG, VOW_REG, type MapId, type VowId } from '../ids';
import type { DiffIndex, MirrorMeta, VowRanks } from '../types';
import { DIFFS, HEAT_MAX, MAPS, PAY, VOWS } from '../data';
import { dailySpec, endlessBossesOf, entryQuote, gross, heatOf, lobbyStatus, masteryLevel, quoteNow, strengthOf } from '../logic';
import { termName } from '../data/glossary';
import { diffLine, mutatorLine, vowLine } from './describe';
import { TutorRibbon } from './Tutorial';
import { tutorOf } from './tips';
import { newerSave, openOf, setLobby } from '../logic/session';
import { Icon, Portrait, Seal } from './icons';
import { CompanionSheet } from './Select';
import { Confirm } from './Pause';
import { daysBetween, nameOf, payTable, rateWord, TERM_TEXT, waitedSince, type T } from './text';
import { lastPlayed } from './prefs';
import { pentadText } from '../../../data/terms';

export type LobbyPage = 'codex' | 'records' | 'heart' | 'mastery' | 'settings';

export function Lobby(props: {
  onEnter: (o: { daily: boolean; char?: CharacterId }) => void; onResume: () => void; onAbandon: () => void; onPage: (p: LobbyPage) => void;
  /** 「初 · 教程」: the practice run. */
  onTutorial?: () => void;
  /** The tutorial's one-time ribbon (a player with history), and its close. */
  ribbon?: boolean;
  onRibbonClose?: () => void;
  /** After the tutorial's 「去入镜」: the entry button rings once (it never enters by itself). */
  ring?: boolean;
  onRung?: () => void;
}) {
  const t = useT();
  const m = mirror.value;
  const today = todayKey();
  const q = entryQuote(m, coins.value, play.value.counters['mirror:paid'] ?? 0, today);
  const st = lobbyStatus(m, today);
  const [sel, setSel] = useState(false);
  const [vows, setVows] = useState(false);
  const [rules, setRules] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [daily, setDaily] = useState(false);
  const run = m.active;
  const newer = newerSave();
  const char = run ? run.char : m.lobby.char;
  const map = run ? run.map : m.lobby.map;
  const rim = m.rim ?? MAPS[map].rim;
  const lvl = masteryLevel(m.mastery[char] ?? 0);
  const heat = heatOf(m.lobby.vows);

  return (
    <div class="mj-lobby page">
      <header class="topbar">
        <div class="topbar-title">
          <h1 class="brush">{t('幻镜', 'Mirror')}</h1>
          <span class="topbar-sub">{t('水月幻镜', 'The Mirror of Water and Moon')}{m.title ? ' · ' + titleName(m.title, t) : ''}</span>
        </div>
        <CoinBadge />
      </header>
      {!storageOk.value && <p class="mj-warn" role="alert">{t('此处不能存档，关页即失。', 'Nothing can be saved here: closing the page loses the run.')}</p>}

      <button type="button" class={`mj-glass rim-${rim}` + (run ? ' is-frozen' : '')} onClick={() => !run && setSel(true)} aria-label={run ? t(`${nameOf(char, t)}，镜中候着`, `${nameOf(char, t)} waits in the mirror`) : t(`同伴：${nameOf(char, t)}，轻触更换`, `Companion: ${nameOf(char, t)}; tap to change`)}>
        <span class="mj-glass-moon" aria-hidden="true" />
        <span class="mj-glass-ripple" aria-hidden="true" /><span class="mj-glass-ripple is-2" aria-hidden="true" />
        <Portrait id={char} size={148} class="mj-glass-portrait" />
        <span class="mj-glass-name brush">{nameOf(char, t)}</span>
        <span class="mj-glass-sub">{t(`心得 ${lvl} 级`, `Mastery ${lvl}`)}</span>
      </button>

      {newer ? (
        <div class="card mj-runcard"><p>{t('此局存于新版，请刷新页面。', 'This run was saved by a newer version: please reload the page.')}</p></div>
      ) : run ? (
        <RunCard m={m} t={t} freeLeft={st.freeLeft} onResume={props.onResume} onGiveUp={() => setGiveUp(true)} />
      ) : (
        <>
          <div class="mj-maps" role="radiogroup" aria-label={t('地图', 'Map')}>
            {MAP_REG.map((x, i) => {
              const open = i < openOf(m).mapsOpen;
              const u = MAPS[x.id].unlock;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={m.lobby.map === x.id}
                  disabled={!open}
                  class={`mj-map map-${x.id}` + (m.lobby.map === x.id ? ' is-on' : '') + (open ? '' : ' is-locked')}
                  onClick={() => setLobby({ map: x.id as MapId })}
                >
                  <b class="brush">{t(x.zh, x.en)}</b>
                  <span>{open ? t(x.title, x.titleEn) : t('未启', 'Sealed')}</span>
                  {!open && u && <small>{t(`破${MAP_REG.find((y) => y.id === u.map)!.zh}第 ${u.wave} 重首领`, `Beat the wave-${u.wave} boss of ${MAP_REG.find((y) => y.id === u.map)!.en}`)}</small>}
                </button>
              );
            })}
          </div>
          <div class="mj-diffs" role="radiogroup" aria-label={t('镜境', 'Difficulty')}>
            {DIFF_REG.map((d, i) => {
              const open = i <= openOf(m).diffMax;
              const u = DIFFS[i].unlock;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={m.lobby.diff === i}
                  disabled={!open}
                  class={'mj-diff' + (m.lobby.diff === i ? ' is-on' : '')}
                  onClick={() => setLobby({ diff: i as DiffIndex })}
                  title={open ? `${t(d.zh, d.en)} · ×${DIFFS[i].pay}` : u ? t(`${DIFF_REG[u.diff].zh}到第 ${u.wave} 重开启`, `Reach wave ${u.wave} on ${DIFF_REG[u.diff].en}`) : ''}
                >
                  <span class="brush">{d.zh}</span>
                  <small>{open ? t(`×${DIFFS[i].pay}`, d.en) : t('未启', 'sealed')}</small>
                </button>
              );
            })}
          </div>
          <p class="mj-small muted mj-diff-line">{t(DIFF_REG[m.lobby.diff].zh, DIFF_REG[m.lobby.diff].en)}{t('：', ': ')}{diffLine(m.lobby.diff, t)}</p>
          <div class="mj-lobby-row">
            <button type="button" class="btn btn-small" onClick={() => setVows(true)}>{t(`镜誓 · ${termName('heat', t)} ${heat}`, `Vows · ${termName('heat', t)} ${heat}`)}</button>
            {m.heart.plain && <span class="chip" aria-label={t('素镜：心镜不生效', 'Plain mirror: Heart mirror off')}>{t('素镜', 'Plain')}</span>}
          </div>
          <EntryButton q={q} t={t} onEnter={() => props.onEnter({ daily: false })} ring={!!props.ring} onRung={props.onRung} />
        </>
      )}

      {props.ribbon && props.onTutorial && <TutorRibbon onGo={props.onTutorial} onClose={() => props.onRibbonClose?.()} />}
      <p class="mj-status">
        <span>{t(`今天已打 ${st.runs} 局`, `${st.runs} run${st.runs === 1 ? '' : 's'} today`)}</span>
        <span>{t('下一局：', 'next run: ')}{rateWord(st.nextRate, st.freeLeft, t)}</span>
        <span>{t(`今天结算 ${st.paid}/${st.ceiling} 文`, `paid today ${st.paid}/${st.ceiling}`)}</span>
        <span>{t(`铜钱 ${st.drops}/${st.dropCap}`, `coins ${st.drops}/${st.dropCap}`)}</span>
        <button type="button" class="mj-info" onClick={() => setRules(true)} aria-label={t('规则', 'How pay works')}>ⓘ</button>
      </p>
      {st.rest && <p class="mj-rest">{t('今天已经打了三局，去园子里走走吧。', 'Three runs today: take a walk in the garden.')}</p>}

      {!run && !newer && <DailyCard m={m} t={t} onOpen={() => setDaily(true)} canEnter={!q.paused && (q.free || q.unusedTicket || q.short === 0)} />}

      <nav class={'mj-footer' + (props.onTutorial ? ' has-tut' : '')} aria-label={t('镜中诸物', 'Mirror pages')}>
        {([['codex', '镜鉴', 'Codex', '鉴'], ['records', '镜碑', 'Records', '碑'], ['heart', '心镜', 'Heart', '心'], ['mastery', '心得', 'Mastery', '得'], ['settings', '设置', 'Settings', '设']] as const).map(([id, zh, en, g]) => (
          <button type="button" class="mj-footer-btn" onClick={() => props.onPage(id)}><span class="brush" aria-hidden="true">{g}</span>{t(zh, en)}</button>
        ))}
        {props.onTutorial && (
          <button type="button" class="mj-footer-btn" data-tut="lobbyTutorial" onClick={props.onTutorial} title={termName('tutorial', t)} aria-label={termName('tutorial', t) + (!tutorOf(m).offered ? t('（新）', ' (new)') : '')}>
            <span class="brush" aria-hidden="true">初</span>{termName('tutorial', t)}
            {!tutorOf(m).offered && <i class="mj-tut-dot" aria-hidden="true" />}
          </button>
        )}
      </nav>

      <CompanionSheet open={sel} current={m.lobby.char} onClose={() => setSel(false)} onPick={(id) => { setLobby({ char: id }); setSel(false); }} />
      <VowSheet open={vows} onClose={() => setVows(false)} />
      <RulesSheet open={rules} onClose={() => setRules(false)} />
      {run && (
        <Confirm open={giveUp} title={t('弃镜', 'Give up the run')} yes={t('弃镜', 'Give it up')} danger onYes={() => { setGiveUp(false); props.onAbandon(); }} onNo={() => setGiveUp(false)}>
          <p class="mj-confirm-big brush">{t(`放弃这一局就算倒下：按已过 ${run.wave} 重结算，约 ${quoteNow(m, run, today)} 文`, `Giving up counts as going down: you're paid for ${run.wave} waves, about ${quoteNow(m, run, today)} coins`)}</p>
        </Confirm>
      )}
      {daily && (
        <CompanionSheet
          open={daily}
          current={dailySpec(today, m, unlocked.value).chars[0]}
          only={dailySpec(today, m, unlocked.value).chars}
          enters
          onClose={() => setDaily(false)}
          onPick={(id) => { setDaily(false); props.onEnter({ daily: true, char: id }); }}
        />
      )}
    </div>
  );
}

function titleName(id: string, t: T): string {
  if (id.startsWith('rujing:')) return t(`${nameOf(id.slice(7), (z) => z)}·入镜`, `${nameOf(id.slice(7), (_z, e) => e)} · Entered`);
  if (id.startsWith('xian:')) return t(`${nameOf(id.slice(5), (z) => z)}·镜中仙`, `${nameOf(id.slice(5), (_z, e) => e)} · Mirror Immortal`);
  return nameOf(id, t);
}
export { titleName };

function EntryButton(props: { q: ReturnType<typeof entryQuote>; t: T; onEnter: () => void; ring?: boolean; onRung?: () => void }) {
  const { q, t } = props;
  // after the tutorial's 「去入镜」 the entry button takes focus and rings once (a tap still decides)
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.ring) return;
    const b = box.current?.querySelector<HTMLButtonElement>('.mj-enter');
    b?.focus({ preventScroll: true });
    try { box.current?.scrollIntoView({ block: 'center' }); } catch { /* old engines */ }
    const k = setTimeout(() => props.onRung?.(), 2400);
    return () => clearTimeout(k);
  }, [props.ring]);
  const rung = props.ring ? ' mj-tut-rung' : '';
  if (q.unusedTicket) {
    return (
      <div class={'mj-entry' + rung} ref={box}>
        <button type="button" class="btn btn-seal mj-enter" onClick={props.onEnter}><span class="brush">{t('续镜 · 已付', 'Enter · already paid')}</span></button>
        <p class="mj-entry-note">{t('上次付了钱却没能入镜，这一局不再收钱。', 'Last time the fee was paid but the run never began: this one is on the house.')}</p>
      </div>
    );
  }
  if (q.free) {
    return (
      <div class={'mj-entry' + rung} ref={box}>
        <button type="button" class="btn btn-seal mj-enter is-free" onClick={props.onEnter}>
          <span class="brush">{t('入镜', 'Enter')}</span>
          <Seal text="今日免费" size={46} class="mj-free-seal" color="#c0412f" label={t('今日免费', 'Free today')} />
        </button>
        <p class="mj-entry-note">{t('免费这局：结算的钱减半，捡到的铜钱照拿', 'Free run: half the payout; coins you pick up are yours as usual')}</p>
      </div>
    );
  }
  return (
    <div class={'mj-entry' + rung} ref={box}>
      <button type="button" class="btn btn-seal mj-enter" onClick={props.onEnter} disabled={q.short > 0}>
        {q.short > 0 ? <span>{t(`还差 ${q.short} 文`, `${q.short} coins short`)}</span> : <><span class="brush">{t('入镜', 'Enter')}</span><CoinBadge value={q.fee} /></>}
      </button>
      <p class="mj-entry-note">{t(`这一局：${rateWord(q.rate, false, t)}`, `this run: ${rateWord(q.rate, false, t)}`)}</p>
    </div>
  );
}

function RunCard(props: { m: MirrorMeta; t: T; freeLeft: boolean; onResume: () => void; onGiveUp: () => void }) {
  const { m, t } = props;
  const run = m.active!;
  const today = todayKey();
  const X = quoteNow(m, run, today);
  const since = waitedSince(lastPlayed(run.seed), run.startedDay);
  const waited = daysBetween(since, today);
  return (
    <div class="card mj-runcard">
      <p class="mj-runcard-head">
        <b class="brush">{nameOf(run.char, t)}</b> · {nameOf(run.map, t)} · {t(DIFF_REG[run.diff].zh, DIFF_REG[run.diff].en)}
        {run.heat > 0 && <> · {termName('heat', t)} {run.heat}</>}
        {run.daily && <> · {t('今日镜', 'Daily')}</>}
      </p>
      <p class="mj-runcard-wave brush">{t(`第 ${run.wave + 1} 重`, `Wave ${run.wave + 1}`)}</p>
      <p class="mj-runcard-line">{t(`已过 ${run.wave} 重 · 现在倒下约得 ${X} 文 · 这局已捡 ${run.coins} 文`, `${run.wave} cleared · going down now pays about ${X} · ${run.coins} coins picked up this run`)}</p>
      {waited >= 7 && <p class="mj-runcard-wait">{t(`镜中人已候 ${waited} 日`, `Waiting in the mirror for ${waited} days`)}</p>}
      {run.interruptions > 0 && <p class="muted mj-small">{t(`中断 ${run.interruptions}/3`, `interrupted ${run.interruptions}/3`)}</p>}
      <button type="button" class="btn btn-seal mj-enter" onClick={props.onResume}><span class="brush">{t('续镜', 'Return')}</span></button>
      {props.freeLeft && <p class="mj-free-kept"><Seal text="免费" size={20} /> {t('今天的免费局 · 留给下一局', 'Today’s free run waits for your next one')}</p>}
      <button type="button" class="btn btn-small btn-ghost mj-danger" onClick={props.onGiveUp}>{t('弃镜', 'Give up the run')}</button>
    </div>
  );
}

function DailyCard(props: { m: MirrorMeta; t: T; onOpen: () => void; canEnter: boolean }) {
  const { m, t } = props;
  const today = todayKey();
  const spec = dailySpec(today, m, unlocked.value);
  const term = TERM_MOD_REG.find((x) => x.id === spec.term)!;
  const mut = MUTATOR_REG.find((x) => x.id === spec.mutator)!;
  const tIdx = Math.floor(spec.slip / 3);
  const slip = pentadText(tIdx, spec.slip % 3);
  const got = !!m.slips[spec.slip];
  const tenTaken = m.daily.day === today && m.daily.bonus;
  return (
    <section class="card mj-daily" aria-label={t('今日镜', 'Today’s mirror')}>
      <header class="mj-daily-head">
        <h2 class="brush">{t('今日镜', 'Today’s mirror')}</h2>
        <span class="muted">{nameOf(spec.map, t)} · {t('照影', 'Reflection')}</span>
      </header>
      <div class="mj-daily-faces">
        {spec.chars.map((c) => <Portrait id={c} size={48} />)}
        <span class="mj-daily-boon" title={nameOf(spec.boon, t)}><Icon id={`item:${spec.boon}`} px={34} /></span>
      </div>
      <p class="mj-small"><b>{t(term.zh, term.en)}</b> · {t(TERM_TEXT[spec.term][0], TERM_TEXT[spec.term][1])}</p>
      <p class="mj-small muted">{t(`${termName('mutator', t)}「${mut.zh}」减半：`, `${termName('mutator', t)} “${mut.en}” at half strength: `)}{mutatorLine(spec.mutator, strengthOf(spec.mutator, 0.5), t)}</p>
      <p class="mj-small">
        {got ? t(`候签「${slip.zh}」已得`, `Pentad slip “${slip.en}” collected`) : t(`第十重得候签「${slip.zh}」`, `Wave 10: the slip “${slip.en}”`)}
        {!tenTaken && <> · <b>{t('第二十重 · 必落当十', 'wave 20 · a 10-coin piece for sure')}</b></>}
      </p>
      <button type="button" class="btn btn-small" onClick={props.onOpen} disabled={!props.canEnter}>{t('入今日镜', 'Enter today’s mirror')}</button>
    </section>
  );
}

function VowSheet(props: { open: boolean; onClose: () => void }) {
  const t = useT();
  const v: VowRanks = mirror.value.lobby.vows;
  const heat = heatOf(v);
  const bump = (id: VowId, d: number) => {
    const r = Math.max(0, Math.min(VOWS[id].ranks, (v[id] ?? 0) + d));
    const next = { ...v, [id]: r };
    if (heatOf(next) > HEAT_MAX) return;
    setLobby({ vows: next });
  };
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t(`镜誓 · ${termName('heat', t)} ${heat}/${HEAT_MAX}`, `Vows · ${termName('heat', t)} ${heat}/${HEAT_MAX}`)}>
      <p class="muted mj-small">{t(
        `每立一层誓，${termName('heat', t)}就高一点。每 1 点${termName('heat', t)}：结算的镜钱多 ${Math.round(PAY.heatPer * 100)}%，镜屑多 10%。${termName('heat', t)}到 5、10、15、20 时打过第 30 重，各得一枚誓印。`,
        `Each rank raises the ${termName('heat', t)}. Every point: ${Math.round(PAY.heatPer * 100)}% more coins when the run is settled and 10% more shards. Clear wave 30 at 5, 10, 15 or 20 ${termName('heat', t)} for a vow seal.`,
      )}</p>
      <div class="mj-vows">
        {VOW_REG.map((x) => {
          const r = v[x.id] ?? 0;
          const d = VOWS[x.id];
          return (
            <div class="row mj-vow">
              <div class="row-main">
                <div class="row-title">{t(x.zh, x.en)} <span class="muted num">{r}/{d.ranks}</span></div>
                <div class="row-sub">{vowLine(x.id, t)} · {t(`每层 +${d.heat} ${termName('heat', t)}`, `+${d.heat} ${termName('heat', t)} a rank`)}</div>
              </div>
              <button type="button" class="btn btn-small btn-icon" onClick={() => bump(x.id, -1)} disabled={r <= 0} aria-label={t(`减一重${x.zh}`, `One less ${x.en}`)}>−</button>
              <button type="button" class="btn btn-small btn-icon" onClick={() => bump(x.id, 1)} disabled={r >= d.ranks || heat + d.heat > HEAT_MAX} aria-label={t(`加一重${x.zh}`, `One more ${x.en}`)}>+</button>
            </div>
          );
        })}
      </div>
      <button type="button" class="btn btn-ghost" onClick={() => setLobby({ vows: {} })} disabled={heat === 0}>{t('全部取消', 'Clear all vows')}</button>
    </Sheet>
  );
}

/** ⓘ: GDD §16 in plain words, and what each depth pays. */
function RulesSheet(props: { open: boolean; onClose: () => void }) {
  const t = useT();
  const rows = payTable((W) => gross(W, 1, 'lake', 0, endlessBossesOf(W)));
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('镜钱规矩', 'How the mirror pays')}>
      <div class="mj-rules">
        <p class="mj-rules-lead brush">{t('过第十重，镜钱回本。', 'Clear wave 10 and the fee comes back.')}</p>
        <ul>
          <li>{t(`入镜一次 ${PAY.FEE} 文，一直打到倒下为止。每天第一局免费（返照钱减半，铜钱照常掉）。`, `A run costs ${PAY.FEE} coins and lasts until you go down. The first run each day is free (half the payout; coins drop as usual).`)}</li>
          <li>{t('随时可以暂离，回来接着打不再收钱；打到一半离开，回来这一重要重打。', 'Step away any time; coming back is always free. Leave mid-wave and that wave replays.')}</li>
          <li>{t(`倒下时按打过了几重结算「返照钱」，一局最多 ${PAY.RUN_CAP} 文。`, `When you go down you are paid by the waves you cleared: at most ${PAY.RUN_CAP} a run.`)}</li>
          <li>{t('同一天里：第一局 ×½，第二、三局全额，第四、五局 ×½，之后 ×¼。', 'In one day: the 1st run ×½, the 2nd and 3rd in full, the 4th and 5th ×½, then ×¼.')}</li>
          <li>{t(`打怪偶尔会掉真铜钱，打完这一重才进钱袋；一局最多 ${PAY.COIN_RUN} 文，一天最多 ${PAY.COIN_DAY} 文。`, `Real coins sometimes drop; they reach your purse when the wave is won: at most ${PAY.COIN_RUN} a run and ${PAY.COIN_DAY} a day.`)}</li>
          <li>{t(`一天从镜中最多拿 ${PAY.CEIL} 文（返照钱、铜钱、首次奖励加起来）。超过以后，一局最多只退回本钱。`, `The mirror pays at most ${PAY.CEIL} a day in all. Past that, a run can only hand its own fee back.`)}</li>
          <li>{t('第一次打倒每位首领 +10；每张图的每个难度第一次通关 +20。', 'First kill of each boss +10; first clear of each map on each difficulty +20.')}</li>
          <li>{t('月华、镜屑、心得都不换钱。福缘只让铜钱多掉一点。', 'Moonlight, shards and mastery never turn into money. Luck only nudges coin drops.')}</li>
        </ul>
        <table class="mj-paytable">
          <caption>{t('照影 · 月湖 · 全额 · 无誓', 'Reflection · Moon Lake · full rate · no vows')}</caption>
          <thead><tr><th>{t('已过', 'Cleared')}</th><th>{t('返照钱', 'Pay')}</th><th>{t('净得', 'Net')}</th></tr></thead>
          <tbody>
            {rows.map((r) => <tr><td class="num">{r.W}</td><td class="num">{r.pay}</td><td class="num">{r.pay - PAY.FEE >= 0 ? '+' : '−'}{Math.abs(r.pay - PAY.FEE)}</td></tr>)}
          </tbody>
        </table>
        <p class="muted mj-small">{t(`另有一路拾得的铜钱。镜境、地图、${termName('heat', t)}各有加成。`, `Plus the coins picked up along the way. Difficulty, map and ${termName('heat', t)} add to it.`)}</p>
      </div>
    </Sheet>
  );
}

