// 园圃 — the home screen: the living ink garden, today's habits, one line for the day.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DateKey, Habit } from '../core/types';
import { addDays, diffDays, isValidKey } from '../core/date';
import { isScheduled, statsFor, type HabitStats } from '../core/habits';
import { hashString } from '../core/rng';
import { pickPoem, POEMS, type Poem } from '../data/poems';
import { audio } from '../audio/engine';
import { useT } from '../app/i18n';
import { go } from '../app/router';
import { demoState } from '../app/demo';
import { activeHabits, editHabit, deleteHabit, emptyState, hasUserData, lang, replaceState, setNote, setOnboarded, state, today, toggleCheckin } from '../app/store';
import { PlantGlyph, toast } from '../ui/kit';
import { GardenScene, type GardenPlant } from './garden/scene';
import { sceneEnv, todayLine } from './garden/env';
import { EnsoCheck } from './garden/Enso';
import { Inscription } from './garden/Inscription';
import { HabitDetail, HabitEditor, Welcome } from './garden/Sheets';
import './garden/garden.css';

// Dev / README screenshots: /?demo=1#garden seeds the demo garden once (&lang=en for English),
// /?demo=0#garden shows an empty, already-welcomed garden. The flag is stripped after use.
// Outside development it never touches a garden that already holds the visitor's own data.
(function applyDemoFlag() {
  try {
    const q = new URLSearchParams(location.search);
    const flag = q.get('demo');
    if (flag !== '1' && flag !== '0') return;
    const own = hasUserData() && !state.value.habits.every((h) => h.id.startsWith('demo'));
    if (own && !import.meta.env.DEV) return;
    const l = q.get('lang');
    const lng = l === 'en' || l === 'zh' ? l : state.value.settings.lang;
    if (flag === '1') seedDemo(today.value, lng);
    else replaceState({ ...emptyState(), settings: { ...state.value.settings, lang: lng }, onboarded: true });
    q.delete('demo');
    q.delete('lang');
    const qs = q.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
  } catch { /* not in a browser */ }
})();

/** Plant the demo garden, keeping the visitor's own settings (theme, sound, seal). */
function seedDemo(day: DateKey, lng: 'zh' | 'en'): void {
  const cur = state.value.settings;
  const demo = demoState(day, lng);
  replaceState({ ...demo, settings: { ...cur, lang: lng, sealName: cur.sealName || demo.settings.sealName } });
}

type SheetState = { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'detail'; id: string } | null;

function useClock(ms = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function GardenView() {
  const t = useT();
  const s = state.value;
  const day = today.value;
  const habits = activeHabits.value;
  const now = useClock();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [welcome, setWelcome] = useState(() => !s.onboarded && s.habits.length === 0);
  const [poem, setPoem] = useState<{ poem: Poem; side: 'left' | 'right'; key: number } | null>(null);
  const [openSide, setOpenSide] = useState<'left' | 'right'>('right');
  const sceneRef = useRef<GardenScene | null>(null);

  const plants: GardenPlant[] = useMemo(
    () => habits.map((h) => ({ habit: h, stats: statsFor(h, s.checkins[h.id] ?? [], day) })),
    [habits, s.checkins, day],
  );
  const clarity = plants.length ? plants.reduce((a, p) => a + p.stats.freshness, 0) / plants.length : 0.92;
  const env = useMemo(() => sceneEnv(now, clarity, s.settings.location), [now.getTime(), clarity, s.settings.location]);
  const line = useMemo(() => todayLine(now), [day, now.getHours()]);

  useEffect(() => {
    if (!poem) return;
    const id = setTimeout(() => setPoem(null), 4600);
    return () => clearTimeout(id);
  }, [poem?.key]);

  const scheduled = plants.filter((p) => p.stats.scheduledToday);
  const resting = plants.filter((p) => !p.stats.scheduledToday);
  const doneCount = scheduled.filter((p) => p.stats.doneToday).length;

  const onToggle = (p: GardenPlant) => {
    void audio.unlock();
    const done = toggleCheckin(p.habit.id);
    if (done) {
      sceneRef.current?.celebrate(p.habit.id);
      const streak = p.stats.streak + (p.stats.scheduledToday ? 1 : 0);
      if (state.value.settings.sound) audio.chime(streak);
      try { navigator.vibrate?.(12); } catch { /* unsupported */ }
      const cs = state.value.checkins;
      const due = activeHabits.value.filter((h) => isScheduled(h, day));
      if (p.stats.scheduledToday && due.length > 1 && due.every((h) => (cs[h.id] ?? []).includes(day))) {
        setTimeout(() => toast(t('今日功课圆满。园中无事，且听风声。', 'All done for today. Nothing left but the wind.'), 3600), 900);
      }
      const chosen = pickPoem({ plant: p.habit.plant, salt: hashString(day + p.habit.id) });
      // Written into the emptiest part of the sky, away from the plant.
      const side = sceneRef.current?.poemSide(p.habit.id) ?? openSide;
      setPoem({ poem: chosen, side, key: Date.now() });
    } else {
      toast(t(`已取消《${p.habit.name}》今日的记录`, `Unmarked “${p.habit.name}” for today`), {
        action: { label: t('撤销', 'Undo'), run: () => toggleCheckin(p.habit.id, day) },
      });
    }
  };

  const openDetail = (id: string) => {
    setSheet({ kind: 'detail', id });
    if (state.value.settings.sound) {
      void audio.unlock();
      const i = habits.findIndex((h) => h.id === id);
      audio.pluck(i % 5, 0.5);
    }
  };

  const sheetHabit = sheet && sheet.kind !== 'add' ? s.habits.find((h) => h.id === sheet.id) : undefined;
  const sheetStats = sheetHabit ? statsFor(sheetHabit, s.checkins[sheetHabit.id] ?? [], day) : undefined;
  const empty = habits.length === 0;
  const archived = s.habits.filter((h) => h.archived);

  const finishWelcome = () => {
    setOnboarded();
    setWelcome(false);
  };

  return (
    <section class="garden" aria-label={t('园圃', 'Garden')}>
      <header class="garden-top">
        <div class="garden-title">
          <h1 class="brush">半亩</h1>
          <p class="garden-date">
            {line.festivalZh && <span class="garden-fest">{t(line.festivalZh, line.festivalEn ?? line.festivalZh)}</span>}
            <span>{t(line.zh, line.en)}</span>
          </p>
        </div>
        <button class="btn btn-ghost btn-icon garden-settings" onClick={() => go('settings')} aria-label={t('设置', 'Settings')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 7.2c3.2-.4 9.4-.3 16 .1M4.2 12.1c5.1-.3 10.3-.2 15.6.2M4 17c4.2-.3 11-.2 16 .1" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="15.5" cy="7.3" r="1.9" fill="var(--paper)" stroke="currentColor" stroke-width="1.5" />
            <circle cx="8.5" cy="12.2" r="1.9" fill="var(--paper)" stroke="currentColor" stroke-width="1.5" />
            <circle cx="13" cy="17.1" r="1.9" fill="var(--paper)" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </button>
      </header>

      <GardenStage
        plants={plants}
        env={env}
        sceneRef={sceneRef}
        onPick={openDetail}
        onOpenSide={setOpenSide}
        overlay={
          <>
            {empty && <Inscription poem={POEMS[0]} lang={lang.value} side={openSide} seal={null} />}
            {poem && <Inscription key={poem.key} poem={poem.poem} lang={lang.value} side={poem.side} short transient />}
          </>
        }
      />

      <div class="page garden-page">
        {empty ? (
          <div class="garden-empty">
            <p class="garden-empty-lead">{t('这半亩地还空着。种下一个习惯，看它一笔一笔长起来。', 'This half-acre is still bare. Plant a habit and watch it grow, stroke by stroke.')}</p>
            <div class="garden-empty-actions">
              <button class="btn btn-primary" onClick={() => setSheet({ kind: 'add' })}>{t('种下第一株', 'Plant a habit')}</button>
              {!hasUserData() && (
                <button class="btn" onClick={() => { seedDemo(day, lang.value); toast(t('示例园子已种好，可随时在设置中清空', 'Demo garden planted — reset it any time in Settings')); }}>
                  {t('看看示例园子', 'Explore a demo garden')}
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            <h2 class="section-title">
              <span>{t('今日', 'Today')}</span>
              <span class="spacer" />
              {scheduled.length > 0 && (doneCount === scheduled.length ? (
                <span class="garden-count is-complete" aria-label={t('今日已圆满', 'All done today')}>
                  <span class="brush">{t('圆满', 'All done')}</span>
                </span>
              ) : (
                <span class="garden-count num" aria-label={t(`已完成 ${doneCount} / ${scheduled.length}`, `${doneCount} of ${scheduled.length} done`)}>
                  {doneCount} / {scheduled.length}
                </span>
              ))}
            </h2>
            {scheduled.length > 0 && Object.values(state.value.checkins).every((d) => d.length === 0) && (
              <p class="garden-first-hint muted">{t('轻点右侧的圆相，记下今天。', 'Tap the circle on the right to mark today done.')}</p>
            )}
            {scheduled.length === 0 && <p class="garden-rest-all muted">{t('今日园中无事，且听风声。', 'Nothing is due today. Listen to the wind.')}</p>}
            <ul class="hlist">
              {scheduled.map((p) => (
                <HabitRow key={p.habit.id} p={p} days={s.checkins[p.habit.id] ?? []} today={day} onOpen={() => openDetail(p.habit.id)} onToggle={() => onToggle(p)} />
              ))}
            </ul>
            {resting.length > 0 && (
              <>
                <h3 class="garden-subtitle">{t('今日休憩', 'Resting today')}</h3>
                <ul class="hlist is-resting">
                  {resting.map((p) => (
                    <HabitRow key={p.habit.id} p={p} days={s.checkins[p.habit.id] ?? []} today={day} onOpen={() => openDetail(p.habit.id)} onToggle={() => onToggle(p)} quiet />
                  ))}
                </ul>
              </>
            )}
            <button class="btn btn-ghost garden-add" onClick={() => setSheet({ kind: 'add' })}>
              <span class="garden-add-plus" aria-hidden="true">＋</span>
              {t('再种一株', 'Plant another habit')}
            </button>
          </>
        )}

        <DayNote day={day} />

        <PondLine clarity={clarity} empty={empty} />

        {archived.length > 0 && <Archived habits={archived} />}
      </div>

      <HabitEditor
        open={sheet?.kind === 'add' || sheet?.kind === 'edit'}
        habit={sheet?.kind === 'edit' ? sheetHabit : undefined}
        onClose={() => setSheet(null)}
        onSaved={(id, created) => {
          if (created) {
            toast(t('种下了。每做一次，它便多长几笔。', 'Planted. Each time you do it, it grows a few brushstrokes.'));
            setTimeout(() => sceneRef.current?.focusPlant(id), 120);
          }
        }}
      />
      <HabitDetail
        open={sheet?.kind === 'detail' && !!sheetHabit}
        habit={sheetHabit}
        stats={sheetStats}
        days={sheetHabit ? s.checkins[sheetHabit.id] ?? [] : []}
        today={day}
        onClose={() => setSheet(null)}
        onEdit={() => sheetHabit && setSheet({ kind: 'edit', id: sheetHabit.id })}
      />
      <Welcome
        open={welcome && !sheet}
        onClose={finishWelcome}
        onPlant={() => { finishWelcome(); setSheet({ kind: 'add' }); }}
        onDemo={() => { setWelcome(false); seedDemo(day, lang.value); }}
      />
    </section>
  );
}

// ------------------------------------------------------------------------------------ the painting

function GardenStage(props: {
  plants: GardenPlant[];
  env: ReturnType<typeof sceneEnv>;
  sceneRef: { current: GardenScene | null };
  onPick: (id: string) => void;
  onOpenSide: (side: 'left' | 'right') => void;
  overlay: preact.ComponentChildren;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [pannable, setPannable] = useState(false);
  const pick = useRef(props.onPick);
  pick.current = props.onPick;

  useEffect(() => {
    const c = ref.current!;
    const scene = new GardenScene(c, props.env);
    scene.onPick = (id) => pick.current(id);
    scene.onPannable = setPannable;
    scene.onBackdrop = () => props.onOpenSide(scene.poemSide());
    scene.setPlants(props.plants);
    props.sceneRef.current = scene;
    return () => {
      scene.destroy();
      props.sceneRef.current = null;
    };
  }, []);
  useEffect(() => { props.sceneRef.current?.setPlants(props.plants); }, [props.plants]);
  useEffect(() => { props.sceneRef.current?.setEnv(props.env); }, [props.env]);

  const names = props.plants.map((p) => p.habit.name).join(t('、', ', '));
  const label = props.plants.length
    ? t(`水墨园圃，${props.plants.length} 株：${names}。`, `Ink garden with ${props.plants.length} plants: ${names}.`) + (pannable ? t('可左右拖动长卷。', ' Drag or use arrow keys to unroll the scroll.') : '')
    : t('一方空园，远山与池塘。', 'An empty garden: distant hills and a pond.');

  return (
    <div class="garden-stage">
      <div class="garden-mount">
        <canvas
          ref={ref}
          class="garden-canvas"
          role="img"
          aria-label={label}
          tabIndex={pannable ? 0 : -1}
          onKeyDown={(e) => {
            const sc = props.sceneRef.current;
            if (!sc) return;
            if (e.key === 'ArrowRight') { sc.panBy(0.5); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { sc.panBy(-0.5); e.preventDefault(); }
            else if (e.key === 'Home') { sc.panTo(0); e.preventDefault(); }
            else if (e.key === 'End') { sc.panTo(1e9); e.preventDefault(); }
          }}
        />
        {props.overlay}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ rows

function HabitRow(props: { p: GardenPlant; days: DateKey[]; today: DateKey; onOpen: () => void; onToggle: () => void; quiet?: boolean }) {
  const t = useT();
  const { habit: h, stats: st } = props.p;
  return (
    <li class={'hrow' + (props.quiet ? ' is-quiet' : '') + (st.doneToday ? ' is-done' : '')}>
      <button class="hrow-main" onClick={props.onOpen} aria-label={t(`${h.name}，查看详情`, `${h.name}, details`)}>
        <PlantGlyph kind={h.plant} size={40} />
        <span class="hrow-text">
          <span class="hrow-name">{h.name}</span>
          <span class="hrow-sub">
            <StreakText stats={st} days={props.days} today={props.today} />
            <WeekDots habit={h} days={props.days} today={props.today} />
          </span>
        </span>
      </button>
      <EnsoCheck
        done={st.doneToday}
        quiet={props.quiet}
        onToggle={props.onToggle}
        label={st.doneToday ? t(`${h.name}：今日已完成，点按撤销`, `${h.name}: done today — tap to undo`) : t(`完成「${h.name}」`, `Mark “${h.name}” done`)}
      />
    </li>
  );
}

function StreakText(props: { stats: HabitStats; days: DateKey[]; today: DateKey }) {
  const t = useT();
  const st = props.stats;
  if (st.streak > 0) return <span class="hrow-streak">{t(`连续 ${st.streak} 日`, `${st.streak}-day streak`)}</span>;
  if (st.done === 0) return <span class="hrow-streak">{t('新种下', 'Just planted')}</span>;
  let last: DateKey | undefined;
  for (const d of props.days) if (d <= props.today) last = d;
  const ago = last ? diffDays(last, props.today) : 0;
  if (ago <= 2) return <span class="hrow-streak">{t('重新起笔', 'Pick up the brush again')}</span>;
  return <span class="hrow-streak">{t(`${ago} 日前 · 重新起笔`, `Last done ${ago} days ago`)}</span>;
}

function WeekDots(props: { habit: Habit; days: DateKey[]; today: DateKey }) {
  const t = useT();
  const set = new Set(props.days);
  const dots = [];
  let n = 0;
  for (let i = 6; i >= 0; i--) {
    const d = addDays(props.today, -i);
    const done = set.has(d);
    if (done) n++;
    const sched = isScheduled(props.habit, d) && d >= props.habit.createdAt;
    const cls = done ? 'is-done' : i === 0 ? 'is-today' : sched ? 'is-missed' : 'is-rest';
    dots.push(<i class={cls} />);
  }
  return <span class="wdots" role="img" aria-label={t(`近七日完成 ${n} 次`, `${n} of the last 7 days`)}>{dots}</span>;
}

// ------------------------------------------------------------------------------------ note & pond

function DayNote(props: { day: DateKey }) {
  const t = useT();
  const saved = state.value.notes[props.day] ?? '';
  const [text, setText] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const inputRef = useRef<HTMLInputElement>(null);
  // Follow the stored note (new day, demo seeded, backup imported) unless the user is typing.
  useEffect(() => {
    if (document.activeElement !== inputRef.current) setText(saved);
  }, [props.day, saved]);
  const [ack, setAck] = useState(0);
  useEffect(() => {
    if (!ack) return;
    const id = setTimeout(() => setAck(0), 1800);
    return () => clearTimeout(id);
  }, [ack]);
  const flush = (v: string) => {
    clearTimeout(timer.current);
    if (v !== (state.value.notes[props.day] ?? '')) {
      setNote(props.day, v);
      if (v.trim()) setAck(Date.now());
    }
  };
  const recent = useMemo(() => {
    for (let i = 1; i <= 7; i++) {
      const k = addDays(props.day, -i);
      const n = isValidKey(k) ? state.value.notes[k] : undefined;
      if (n) return { i, n };
    }
    return null;
  }, [props.day, state.value.notes]);
  const ago = (i: number) => (i === 1 ? t('昨日', 'Yesterday') : i === 2 ? t('前日', 'Two days ago') : t(`${i} 日前`, `${i} days ago`));
  return (
    <div class="daynote">
      <div class="daynote-head">
        <label class="daynote-label" for="daynote">{t('今日一句', 'A line for today')}</label>
        <span class={'daynote-ack' + (ack ? ' is-on' : '')} aria-live="polite">{ack ? t('已记下', 'Kept') : ''}</span>
      </div>
      <input
        ref={inputRef}
        id="daynote"
        class="input daynote-input"
        value={text}
        maxLength={280}
        placeholder={t('写下今天的一句话…', 'One line about today…')}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setText(v);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => flush(v), 500);
        }}
        onBlur={() => flush(text)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        enterKeyHint="done"
      />
      {recent && <p class="daynote-recent"><span>{ago(recent.i)}</span>{recent.n}</p>}
    </div>
  );
}

function PondLine(props: { clarity: number; empty: boolean }) {
  const t = useT();
  const pct = Math.round(props.clarity * 100);
  if (props.empty) return <p class="pondline">{t('半亩方塘一鉴开，天光云影共徘徊', 'A half-acre pond opens like a mirror')}</p>;
  const [zh, en, zh2, en2] = pct >= 80
    ? ['池水清澈', 'The pond is clear', '为有源头活水来', 'fresh water flows in from the source']
    : pct >= 55
      ? ['池水微澜', 'The pond is a little clouded', '问渠那得清如许', 'how does water stay so clear?']
      : ['池水渐浊', 'The pond is growing murky', '源头活水，从今日来', 'the fresh water starts with today'];
  return (
    <p class="pondline">
      <span>{t(zh, en)} <span class="num">{pct}%</span></span>
      <span class="pondline-sep" aria-hidden="true">·</span>
      <span>{t(zh2, en2)}</span>
    </p>
  );
}

function Archived(props: { habits: Habit[] }) {
  const t = useT();
  const [confirm, setConfirm] = useState<string | null>(null);
  useEffect(() => {
    if (!confirm) return;
    const id = setTimeout(() => setConfirm(null), 4000);
    return () => clearTimeout(id);
  }, [confirm]);
  return (
    <details class="archived">
      <summary>{t(`画匣 · 已归档 ${props.habits.length}`, `Archived (${props.habits.length})`)}</summary>
      <ul>
        {props.habits.map((h) => (
          <li class="row">
            <PlantGlyph kind={h.plant} size={32} />
            <span class="row-main row-title">{h.name}</span>
            <button class="btn btn-small" onClick={() => editHabit(h.id, { archived: false })}>{t('移回园中', 'Restore')}</button>
            <button
              class={'btn btn-small btn-ghost' + (confirm === h.id ? ' is-danger' : '')}
              onClick={() => (confirm === h.id ? deleteHabit(h.id) : setConfirm(h.id))}
            >
              {confirm === h.id ? t('确认删除', 'Confirm') : t('删除', 'Delete')}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
