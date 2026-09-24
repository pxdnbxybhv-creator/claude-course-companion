// The garden's sheets: plant / edit a habit, a habit's own page, and the first-run welcome.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { DateKey, Habit, PlantKind } from '../../core/types';
import { PLANT_KINDS } from '../../core/types';
import { addDays, fromKey, weekday, cnNumber } from '../../core/date';
import { FULL_BLOOM_DAYS, growthFor, isScheduled, type HabitStats } from '../../core/habits';
import { hashString } from '../../core/rng';
import { PLANT_INFO } from '../../ink/plants';
import { makeSeal } from '../../ink/seal';
import { POEMS } from '../../data/poems';
import { Sheet, Segmented, toast } from '../../ui/kit';
import { useT } from '../../app/i18n';
import { addHabit, deleteHabit, editHabit, state, toggleCheckin } from '../../app/store';
import { PlantPainting, PlantThumb } from './PlantArt';
import { clauses } from './Inscription';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ------------------------------------------------------------------------------------ add / edit

export function HabitEditor(props: { open: boolean; habit?: Habit; onClose: () => void; onSaved?: (id: string, created: boolean) => void }) {
  const t = useT();
  const h = props.habit;
  const [name, setName] = useState(h?.name ?? '');
  const [plant, setPlant] = useState<PlantKind>(h?.plant ?? 'orchid');
  const [custom, setCustom] = useState(!!(h?.days && h.days.length && h.days.length < 7));
  const [days, setDays] = useState<number[]>(h?.days && h.days.length ? h.days : [1, 2, 3, 4, 5]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!props.open) return;
    setName(h?.name ?? '');
    setPlant(h?.plant ?? suggestPlant());
    setCustom(!!(h?.days && h.days.length && h.days.length < 7));
    setDays(h?.days && h.days.length ? h.days : [1, 2, 3, 4, 5]);
    setConfirmDelete(false);
    const id = setTimeout(() => { if (!h) inputRef.current?.focus(); }, 380);
    return () => clearTimeout(id);
  }, [props.open, h?.id]);

  useEffect(() => {
    if (!confirmDelete) return;
    const id = setTimeout(() => setConfirmDelete(false), 4000);
    return () => clearTimeout(id);
  }, [confirmDelete]);

  const valid = name.trim().length > 0 && (!custom || days.length > 0);
  const submit = () => {
    if (!valid) return;
    const sched = custom && days.length < 7 ? [...days].sort() : undefined;
    if (h) {
      editHabit(h.id, { name: name.trim().slice(0, 40), plant, days: sched });
      props.onSaved?.(h.id, false);
    } else {
      const nh = addHabit({ name, plant, days: sched });
      props.onSaved?.(nh.id, true);
    }
    props.onClose();
  };

  return (
    <Sheet open={props.open} onClose={props.onClose} title={h ? t('修剪', 'Edit habit') : t('种一株', 'Plant a habit')} label={h ? t('编辑习惯', 'Edit habit') : t('新习惯', 'New habit')}>
      <form class="editor" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label class="field">
          <span>{t('习惯', 'Habit')}</span>
          <input
            ref={inputRef}
            value={name}
            maxLength={40}
            placeholder={t('例如：晨读半小时', 'e.g. Read for 30 minutes')}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            enterKeyHint="done"
            autoComplete="off"
          />
        </label>

        <div class="field">
          <span id="plant-label">{t('种什么', 'Grow it as')}</span>
          <div class="plant-cards" role="radiogroup" aria-labelledby="plant-label">
            {PLANT_KINDS.map((k) => {
              const info = PLANT_INFO[k];
              const on = plant === k;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  class={'plant-card' + (on ? ' is-on' : '')}
                  onClick={() => setPlant(k)}
                  onKeyDown={(e) => {
                    const i = PLANT_KINDS.indexOf(k);
                    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
                    if (!d) return;
                    e.preventDefault();
                    const nk = PLANT_KINDS[(i + d + PLANT_KINDS.length) % PLANT_KINDS.length];
                    setPlant(nk);
                    const btns = (e.currentTarget as HTMLElement).parentElement?.querySelectorAll('button');
                    (btns?.[PLANT_KINDS.indexOf(nk)] as HTMLElement | undefined)?.focus();
                  }}
                  tabIndex={on ? 0 : -1}
                >
                  <PlantThumb kind={k} w={92} h={86} />
                  <span class="plant-card-name">
                    <span class="brush">{info.zh}</span>
                    {t('', ' ' + info.en)}
                  </span>
                  <span class="plant-card-virtue">{t(info.virtueZh, info.virtueEn)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div class="field">
          <span>{t('何时', 'When')}</span>
          <Segmented
            label={t('频率', 'Schedule')}
            value={custom ? 'some' : 'every'}
            onChange={(v) => setCustom(v === 'some')}
            options={[{ value: 'every', label: t('每天', 'Every day') }, { value: 'some', label: t('选几天', 'Some days') }]}
          />
          {custom && (
            <div class="chip-row weekday-chips" role="group" aria-label={t('星期', 'Weekdays')}>
              {WEEK_ORDER.map((d) => (
                <button
                  type="button"
                  class="chip"
                  aria-pressed={days.includes(d)}
                  onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                >
                  {t('周' + WD_ZH[d], WD_EN[d])}
                </button>
              ))}
            </div>
          )}
        </div>

        <div class="editor-actions">
          <button type="submit" class="btn btn-primary editor-go" disabled={!valid}>
            {h ? t('保存', 'Save') : t('种下', 'Plant')}
          </button>
        </div>

        {h && (
          <div class="editor-danger">
            <button type="button" class="btn btn-ghost btn-small" onClick={() => { editHabit(h.id, { archived: true }); toast(t(`「${h.name}」已收入画匣`, `“${h.name}” archived`)); props.onClose(); }}>
              {t('归档', 'Archive')}
            </button>
            <button
              type="button"
              class={'btn btn-ghost btn-small' + (confirmDelete ? ' is-danger' : '')}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                deleteHabit(h.id);
                toast(t('已删除', 'Deleted'));
                props.onClose();
              }}
            >
              {confirmDelete ? t('再点一次，连同记录一并删除', 'Tap again to delete it and its history') : t('删除', 'Delete')}
            </button>
          </div>
        )}
      </form>
    </Sheet>
  );
}

/** Offer the plant the garden has least of. */
function suggestPlant(): PlantKind {
  const used = new Map<PlantKind, number>();
  for (const h of state.value.habits) if (!h.archived) used.set(h.plant, (used.get(h.plant) ?? 0) + 1);
  let best: PlantKind = 'orchid', n = Infinity;
  for (const k of ['orchid', 'bamboo', 'plum', 'chrysanthemum', 'lotus', 'pine'] as PlantKind[]) {
    const c = used.get(k) ?? 0;
    if (c < n) { n = c; best = k; }
  }
  return best;
}

// ------------------------------------------------------------------------------------ habit detail

function SealMark(props: { text: string; size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const s = makeSeal(props.text, { size: props.size, dpr, style: 'bai', seed: hashString(props.text) });
    c.width = s.width; c.height = s.height;
    c.getContext('2d')!.drawImage(s, 0, 0);
  }, [props.text, props.size]);
  return <canvas ref={ref} class="seal-mark" style={{ width: props.size, height: props.size }} aria-hidden="true" />;
}

export function HabitDetail(props: { open: boolean; habit?: Habit; stats?: HabitStats; days: DateKey[]; today: DateKey; onClose: () => void; onEdit: () => void }) {
  const t = useT();
  const h = props.habit, st = props.stats;
  const [w, setW] = useState(320);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.open) return;
    const el = box.current;
    if (el) setW(Math.min(420, Math.max(240, Math.round(el.getBoundingClientRect().width))));
  }, [props.open]);
  if (!h || !st) return <Sheet open={false} onClose={props.onClose}>{null}</Sheet>;
  const info = PLANT_INFO[h.plant];
  const bloomTop = growthFor(FULL_BLOOM_DAYS) - 0.06;
  const bloom = Math.min(100, Math.round(((st.growth - 0.06) / bloomTop) * 100));
  const toGo = Math.max(0, FULL_BLOOM_DAYS - st.done);
  const seal = state.value.settings.sealName || '半亩';
  const vigor = Math.round((0.4 + 0.6 * st.freshness) * 10) / 10;
  const schedule = !h.days || !h.days.length || h.days.length === 7
    ? t('每天', 'Every day')
    : WEEK_ORDER.filter((d) => h.days!.includes(d)).map((d) => t(WD_ZH[d], WD_EN[d])).join(t('、', ', '));
  return (
    <Sheet open={props.open} onClose={props.onClose} title={h.name} label={h.name}>
      <div class="detail" ref={box}>
        <div class="detail-art">
          <PlantPainting kind={h.plant} seed={h.seed} growth={st.growth} vigor={vigor} w={w} h={Math.round(w * 0.72)} />
          <div class="detail-colophon" aria-hidden="true">
            <span class="vertical">{info.zh}·{info.virtueZh}</span>
            <SealMark text={seal} size={22} />
          </div>
        </div>
        <p class="detail-kind muted">
          {t(`${info.zh} · ${info.virtueZh} · ${schedule}`, `${info.en} — ${info.virtueEn} · ${schedule}`)}
        </p>

        <dl class="stats">
          <div><dt>{t('连续', 'Streak')}</dt><dd><span class="num">{st.streak}</span><small>{t('日', st.streak === 1 ? 'day' : 'days')}</small></dd></div>
          <div><dt>{t('最长', 'Best')}</dt><dd><span class="num">{st.best}</span><small>{t('日', st.best === 1 ? 'day' : 'days')}</small></dd></div>
          <div><dt>{t('累计', 'Total')}</dt><dd><span class="num">{st.done}</span><small>{t('次', 'times')}</small></dd></div>
          <div><dt>{t('鲜活', 'Fresh')}</dt><dd><span class="num">{Math.round(st.freshness * 100)}</span><small>%</small></dd></div>
        </dl>

        <div class="bloom" role="img" aria-label={t(`距盛放 ${bloom}%`, `${bloom}% to full bloom`)}>
          <div class="bloom-bar"><span style={{ width: `${bloom}%` }} /></div>
          <p class="bloom-text">
            {bloom >= 100
              ? t('已然盛放。此后每一笔，都是余韵。', 'In full bloom. Every stroke from here is an encore.')
              : t(`距盛放 ${bloom}% · 约再 ${toGo} 次`, `${bloom}% to full bloom · about ${toGo} more`)}
          </p>
        </div>

        <InkCalendar habit={h} days={props.days} today={props.today} />

        <div class="detail-actions">
          <button class="btn" onClick={props.onEdit}>{t('修剪', 'Edit')}</button>
          <button class="btn btn-ghost" onClick={() => { editHabit(h.id, { archived: true }); toast(t(`「${h.name}」已收入画匣`, `“${h.name}” archived`)); props.onClose(); }}>{t('归档', 'Archive')}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** 16 weeks of ink dots, Monday-first. Tap a past day to fill it in (or clear it). */
function InkCalendar(props: { habit: Habit; days: DateKey[]; today: DateKey }) {
  const t = useT();
  const h = props.habit;
  const WEEKS = 16;
  const set = useMemo(() => new Set(props.days), [props.days]);
  const mondayOffset = (weekday(props.today) + 6) % 7;
  const start = addDays(props.today, -mondayOffset - (WEEKS - 1) * 7);
  const cols: { key: DateKey; label?: string }[][] = [];
  let lastMonth = -1;
  const monthLabels: (string | null)[] = [];
  for (let c = 0; c < WEEKS; c++) {
    const col: { key: DateKey }[] = [];
    for (let r = 0; r < 7; r++) col.push({ key: addDays(start, c * 7 + r) });
    const m = fromKey(col[0].key).getMonth();
    monthLabels.push(m !== lastMonth ? t(cnNumber(m + 1) + '月', fromKey(col[0].key).toLocaleString('en', { month: 'short' })) : null);
    lastMonth = m;
    cols.push(col);
  }
  const doneIn = props.days.filter((d) => d >= start && d <= props.today).length;
  return (
    <div class="inkcal">
      <div class="inkcal-head">
        <span>{t('十六周', 'Sixteen weeks')}</span>
        <span class="muted">{t(`${doneIn} 次 · 点选往日可补记`, `${doneIn} done · tap a past day to fill it in`)}</span>
      </div>
      <div class="inkcal-grid" style={{ gridTemplateColumns: `18px repeat(${WEEKS}, 1fr)` }}>
        <span />
        {monthLabels.map((m) => <span class="inkcal-month">{m ?? ''}</span>)}
        {[0, 1, 2, 3, 4, 5, 6].map((r) => (
          <>
            <span class="inkcal-wd">{r % 2 === 0 ? t(WD_ZH[WEEK_ORDER[r]], WD_EN[WEEK_ORDER[r]][0]) : ''}</span>
            {cols.map((col) => {
              const k = col[r].key;
              if (k > props.today) return <span class="inkcal-cell is-future" />;
              const done = set.has(k);
              const sched = isScheduled(h, k);
              const before = k < h.createdAt;
              const hv = hashString(k);
              const size = 46 + (hv % 17);
              const cls = 'inkcal-cell' + (done ? ' is-done' : sched && !before ? ' is-missed' : ' is-rest') + (k === props.today ? ' is-today' : '');
              const d = fromKey(k);
              const label = t(`${d.getMonth() + 1}月${d.getDate()}日 ${done ? '已完成' : '未完成'}`, `${d.toLocaleDateString('en', { month: 'short', day: 'numeric' })} ${done ? 'done' : 'not done'}`);
              return (
                <button
                  type="button"
                  class={cls}
                  aria-pressed={done}
                  aria-label={label}
                  title={label}
                  onClick={() => toggleCheckin(h.id, k)}
                >
                  <i style={done ? { width: `${size}%`, height: `${size}%`, opacity: 0.72 + (hv % 25) / 100, borderRadius: `${46 + (hv % 9)}% ${50 - (hv % 7)}% ${48 + (hv % 5)}% ${52 - (hv % 8)}%` } : undefined} />
                </button>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------ welcome

export function Welcome(props: { open: boolean; onClose: () => void; onPlant: () => void; onDemo: () => void }) {
  const t = useT();
  const poem = POEMS[0];
  const cols = clauses(poem.lines);
  return (
    <Sheet open={props.open} onClose={props.onClose} label={t('欢迎', 'Welcome')}>
      <div class="welcome">
        <div class="welcome-poem" aria-label={poem.lines.join('')}>
          <div class="welcome-cols" aria-hidden="true">
            {cols.map((c) => <span class="vertical">{c}</span>)}
            <span class="vertical welcome-by">{poem.dynasty}·{poem.author}</span>
          </div>
          <h2 class="brush welcome-title">半亩<span class="latin">{t('', 'Half-Acre')}</span></h2>
        </div>
        {t('', poem.en) && <p class="welcome-en latin">{poem.en}</p>}
        <ol class="welcome-steps">
          <li><b class="brush">种</b><span>{t('每个习惯是一株植物：梅、兰、竹、菊、松、荷。', 'Each habit is a plant — plum, orchid, bamboo, chrysanthemum, pine or lotus.')}</span></li>
          <li><b class="brush">长</b><span>{t('每做一次，它便多长几笔；约六十六次，花开满枝。', 'Each time you do it, it grows a few brushstrokes. In about 66 days it is in full bloom.')}</span></li>
          <li><b class="brush">照</b><span>{t('池水映着园子。常来照料，水便清澈。', 'The pond reflects your care: tend your garden and the water stays clear.')}</span></li>
        </ol>
        <div class="welcome-actions">
          <button class="btn btn-primary" onClick={props.onPlant}>{t('种下第一株', 'Plant a habit')}</button>
          <button class="btn" onClick={props.onDemo}>{t('看看示例园子', 'Explore a demo garden')}</button>
        </div>
      </div>
    </Sheet>
  );
}
