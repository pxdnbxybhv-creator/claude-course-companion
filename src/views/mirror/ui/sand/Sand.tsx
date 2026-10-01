// 水月幻镜 · m8 · the 模拟场's screens (sandbox.md §3, §4, §9, §10). SANDBOX owns it; one lazy chunk with
// session.ts. Setup: the page before the run (companion, map, 镜境, 镜誓, start wave, seed, 心镜, 心得, pool, the
// starting build, 月华, where you arrive). Dock: the 调 button, the banner and the four tabs 本局 · 敌人 · 工具 ·
// 数值表 (a bottom sheet on a phone, a 420 px side panel on a desktop). Death: the sandbox's death card.
// Nothing here pays, records or saves: it talks to the in-memory SandSession and the tuning layer only.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useT } from '../../../../app/i18n';
import { mirror } from '../../../../app/mirror';
import { todayKey } from '../../../../core/date';
import { hashString } from '../../../../core/rng';
import {
  AFFIX_REG, ARCHETYPE_REG, BOSS_REG, COMPANION_REG, DIFF_REG, ELITE_REG, HAZARD_REG, ITEM_REG, MAP_REG, MONSTER_REG, MUTATOR_REG, TERM_MOD_REG, TREASURE_REG, VOW_REG,
  WEAPON_REG, named, type AffixId, type BossId, type EliteId, type TermModId, type HazardId, type ItemId, type MonsterId, type MutatorId, type PassiveId, type SkillId, type TreasureId, type VowId,
  type WeaponId,
} from '../../ids';
import type { DiffIndex, RunSave, StatId, Tier, VowRanks, WClass } from '../../types';
import { COMPANIONS, HEAT_MAX, ITEMS, STAT_GROUPS, VOWS, WEAPONS } from '../../data';
import { cleanVows } from '../../logic/session';
import { changes, computeStats, fmtPath, heatOf, leaves, merge, openShop, setValue, valueOf, defaultOf, resetAll, TUNABLE, type Leaf, type Seg, type SheetRow } from '../../logic';
import { SAND_WAVE, clampWave, type SandBuild, type SandHeart, type SandMastery, type SandPool } from '../../sim/sandstart';
import { CD_XS, ENEMY_RANGE, MEASURE_SEC, TIME_SCALES, type EnemyKnobs, type SandSetup } from './session';
import { F_LABEL, leafLabel, rawKeys, searchTerms, SYNONYMS } from './labels';
import { describeItem, describePassive, describeSkill, describeWeapon } from '../describe';
import type { DeathProps, DockProps, PauseProps, SandUi } from './ui';
import { Sheet, toast } from '../../../../ui/kit';
import { applyDraft, applyImport, buildExport, checkImport, clearDraft, copyTuning, exportJson, fileName, isComputed, loadDraft, saveDraft, saveTuning, type ImportCheck } from './io';
import { lang } from '../../../../app/store';
import { CharacterPanel } from '../Panel';
import { Portrait } from '../icons';
import { className, nameOf, statName, TIER_ZH, TIER_EN, type T } from '../text';
import './sand.css';

// ───────────────────────────────────────────── small controls
function Chips<V extends string | number>(props: { value: V; options: readonly (readonly [V, string])[]; onPick: (v: V) => void; label: string }) {
  return (
    <div class="chip-row mj-sand-chips" role="group" aria-label={props.label}>
      {props.options.map(([v, text]) => <button type="button" class="chip" aria-pressed={props.value === v} onClick={() => props.onPick(v)}>{text}</button>)}
    </div>
  );
}
/** A number stepper: − [box] +, with a 「±」 key (iOS's decimal keypad has no minus). */
function Stepper(props: { value: number; step: number; onSet: (v: number) => void; label: string; min?: number; max?: number }) {
  const t = useT();
  const [text, setText] = useState(String(round4(props.value)));
  useEffect(() => { setText(String(round4(props.value))); }, [props.value]);
  const put = (v: number) => {
    if (!Number.isFinite(v)) return;
    const c = Math.max(props.min ?? -Infinity, Math.min(props.max ?? Infinity, v));
    props.onSet(round4(c));
  };
  // a long press on − or + repeats (the latest value is read through a ref, as each step re-renders)
  const now = useRef(props.value);
  now.current = props.value;
  const rep = useRef<{ t: ReturnType<typeof setTimeout> | null; i: ReturnType<typeof setInterval> | null; fired: boolean }>({ t: null, i: null, fired: false });
  const stop = () => { const r = rep.current; if (r.t) clearTimeout(r.t); if (r.i) clearInterval(r.i); r.t = r.i = null; };
  useEffect(() => stop, []);
  const hold = (dir: 1 | -1) => ({
    onPointerDown: () => { stop(); rep.current.fired = false; rep.current.t = setTimeout(() => { rep.current.fired = true; rep.current.i = setInterval(() => put(now.current + dir * props.step), 80); }, 420); },
    onPointerUp: stop, onPointerLeave: stop, onPointerCancel: stop,
    onClick: () => { if (rep.current.fired) { rep.current.fired = false; return; } put(now.current + dir * props.step); },
  });
  return (
    <span class="mj-sand-step">
      <button type="button" class="mj-sand-sbtn" aria-label={t(`${props.label} 减`, `${props.label} down`)} {...hold(-1)}>−</button>
      <input class="mj-sand-num num" inputMode="decimal" aria-label={props.label} value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onChange={() => put(Number(text))} onKeyDown={(e) => { if (e.key === 'Enter') put(Number(text)); }} />
      <button type="button" class="mj-sand-sbtn" aria-label={t(`${props.label} 正负`, `${props.label} sign`)} onClick={() => put(-props.value)}>±</button>
      <button type="button" class="mj-sand-sbtn" aria-label={t(`${props.label} 加`, `${props.label} up`)} {...hold(1)}>+</button>
    </span>
  );
}
const round4 = (v: number) => Math.round(v * 1e4) / 1e4;
const tierText = (k: Tier, t: T) => t(TIER_ZH[k], TIER_EN[k]);

// ───────────────────────────────────────────── 场前: the setup page
/** The last sandbox build of this tab (「上次的」). The per-device draft is kept elsewhere (export / import). */
let lastBuild: RunSave | null = null;
export function rememberBuild(r: RunSave | null): void { if (r) lastBuild = r; }

function freshSeed(): number {
  try { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]; } catch { return hashString(`${Date.now()}:${Math.random()}`); }
}

export function Setup(props: { onStart: (s: SandSetup) => void; onBack: () => void }) {
  const t = useT();
  const m = mirror.value;
  const def = (): SandSetup => ({
    char: m.lobby.char, map: m.lobby.map, diff: m.lobby.diff, vows: {}, wave: SAND_WAVE.def, seed: freshSeed(), heart: 'full', mastery: 'full',
    pool: 'all', build: 'bot', arch: COMPANIONS[m.lobby.char].leans[0], today: todayKey(), arrive: 'shop',
  });
  const [s, setS] = useState<SandSetup>(def);
  const [seedMode, setSeedMode] = useState<'random' | 'today' | 'typed'>('random');
  const [moonText, setMoonText] = useState('');
  const set = (p: Partial<SandSetup>) => setS((x) => ({ ...x, ...p }));
  const vow = (id: VowId, r: number) => {
    const v: VowRanks = { ...s.vows };
    const max = VOWS[id]?.ranks ?? 0;
    if (r > 0) v[id] = Math.max(0, Math.min(max, Math.round(r))); else delete v[id];
    // the 20 劫火 cap, as at the real 入镜 (the vow just raised gives way first)
    const order: VowRanks = {};
    for (const k of Object.keys(v) as VowId[]) if (k !== id) order[k] = v[k];
    if (v[id]) order[id] = v[id];
    set({ vows: cleanVows(order) });
  };
  const heat = heatOf(s.vows);
  const start = () => {
    const seed = seedMode === 'today' ? hashString(`sand:${todayKey()}`) >>> 0 : s.seed >>> 0;
    const moon = moonText.trim() === '' ? undefined : Math.max(0, Number(moonText) || 0);
    props.onStart({ ...s, seed, wave: clampWave(s.wave), moon, last: lastBuild, today: todayKey() });
  };
  const nTables = changes().length;
  // last visit's edits, kept on this device: offered once, never applied on their own
  const [draft, setDraft] = useState(() => { const d = loadDraft(); return d && d.changes.length && !changes().length ? d : null; });
  return (
    <section class="mj-sand-setup page" aria-label={t('模拟场', 'Sandbox')}>
      {draft && (
        <div class="card mj-lend-ribbon" role="note">
          <p>{t(`上次调的 ${draft.changes.length} 项还在，接着用？`, `Your ${draft.changes.length} changes from last time are still here. Use them?`)}</p>
          <div class="chip-row">
            <button type="button" class="btn btn-small btn-primary" onClick={() => { applyDraft(draft); noteText = draft.note ?? ''; setDraft(null); }}>{t('接着用', 'Use them')}</button>
            <button type="button" class="btn btn-small" onClick={() => { clearDraft(); setDraft(null); }}>{t('从默认开始', 'Start from defaults')}</button>
          </div>
        </div>
      )}
      <header class="topbar">
        <button type="button" class="btn btn-ghost btn-small" onClick={props.onBack}>← {t('镜前', 'Mirror')}</button>
      </header>
      <h1 class="brush mj-page-title">{t('模拟场', 'Sandbox')}</h1>
      <p class="mj-small muted">{t('这里打的局不收费、不结算、不记录，随便改。', 'Nothing here costs, pays or counts. Change anything.')}</p>

      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('同伴', 'Companion')}</span>
        <div class="mj-sand-strip" role="listbox" aria-label={t('同伴', 'Companion')}>
          {COMPANION_REG.map((c) => (
            <button type="button" role="option" aria-selected={s.char === c.id} class={'mj-sand-pick' + (s.char === c.id ? ' is-on' : '')} onClick={() => set({ char: c.id, arch: COMPANIONS[c.id].leans[0] })} title={nameOf(c.id, t)}>
              <Portrait id={c.id} size={40} />
              <small>{nameOf(c.id, t)}</small>
            </button>
          ))}
        </div>
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('地图', 'Map')}</span>
        <Chips value={s.map} label={t('地图', 'Map')} options={MAP_REG.map((x) => [x.id, t(x.zh, x.en)] as const)} onPick={(v) => set({ map: v })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('镜境', 'Difficulty')}</span>
        <Chips value={s.diff} label={t('镜境', 'Difficulty')} options={DIFF_REG.map((d, i) => [i as DiffIndex, t(d.zh, d.en)] as const)} onPick={(v) => set({ diff: v })} />
      </div>
      <details class="mj-sand-row mj-sand-vows">
        <summary><span class="mj-sand-label">{t('镜誓', 'Vows')}</span> <span class="num">{t(`劫火 ${heat}/${HEAT_MAX}`, `Heat ${heat}/${HEAT_MAX}`)}</span> <span aria-hidden="true">▸</span></summary>
        {VOW_REG.map((v) => (
          <div class="mj-sand-line"><span>{t(v.zh, v.en)}</span><Stepper label={t(v.zh, v.en)} value={s.vows[v.id] ?? 0} step={1} min={0} max={VOWS[v.id]?.ranks ?? 0} onSet={(r) => vow(v.id, r)} /></div>
        ))}
      </details>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('起始重数', 'Start at wave')}</span>
        <Stepper label={t('起始重数', 'Start at wave')} value={s.wave} step={1} min={SAND_WAVE.min} max={SAND_WAVE.max} onSet={(w) => set({ wave: clampWave(w) })} />
        <Chips value={s.wave} label={t('起始重数', 'Start at wave')} options={[1, 10, 20, 30, 40, 50].map((w) => [w, String(w)] as const)} onPick={(w) => set({ wave: w })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('种子', 'Seed')}</span>
        <Chips value={seedMode} label={t('种子', 'Seed')} options={[['random', t('随机', 'Random')], ['today', t('今日', "Today's")], ['typed', t('自填', 'Typed')]]} onPick={(v) => { setSeedMode(v); if (v === 'random') set({ seed: freshSeed() }); }} />
        {seedMode === 'typed' && <input class="mj-sand-num num" inputMode="numeric" aria-label={t('种子', 'Seed')} value={String(s.seed)} onInput={(e) => set({ seed: Math.max(0, Math.min(4294967295, Math.floor(Number((e.target as HTMLInputElement).value) || 0))) })} />}
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('心镜', 'Heart mirror')}</span>
        <Chips<SandHeart> value={s.heart} label={t('心镜', 'Heart mirror')} options={[['full', t('满阶', 'Full')], ['own', t('自有', 'Yours')], ['plain', t('素镜', 'Off')]]} onPick={(v) => set({ heart: v })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('心得', 'Mastery')}</span>
        <Chips<SandMastery> value={s.mastery} label={t('心得', 'Mastery')} options={[['full', t('满', 'Full')], ['own', t('自有', 'Yours')]]} onPick={(v) => set({ mastery: v })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('兵器道具', 'Weapons and items')}</span>
        <Chips<SandPool> value={s.pool} label={t('兵器道具', 'Weapons and items')} options={[['all', t('全开', 'All')], ['mine', t('我的解锁', 'Mine')]]} onPick={(v) => set({ pool: v })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('开局配装', 'Starting build')}</span>
        <Chips<SandBuild> value={s.build} label={t('开局配装', 'Starting build')} onPick={(v) => set({ build: v })} options={[
          ['bot', t('机器人', 'Bot')], ['bare', t('空手', 'Bare')],
          ...(m.active ? [['copy', t('照搬暂停的那一局', 'Copy my paused run')] as const] : []),
          ...(lastBuild ? [['last', t('上次的', 'Last one')] as const] : []),
        ]} />
        {s.build === 'bot' && (
          <select class="mj-sand-select" aria-label={t('流派', 'School')} value={s.arch} onChange={(e) => set({ arch: (e.target as HTMLSelectElement).value as SandSetup['arch'] })}>
            {ARCHETYPE_REG.map((a) => <option value={a.id}>{t(a.zh, a.en)}</option>)}
          </select>
        )}
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('月华', 'Moonlight')}</span>
        <input class="mj-sand-num num" inputMode="numeric" aria-label={t('月华', 'Moonlight')} placeholder={t('默认', 'default')} value={moonText} onInput={(e) => setMoonText((e.target as HTMLInputElement).value)} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('先到', 'Arrive at')}</span>
        <Chips value={s.arrive} label={t('先到', 'Arrive at')} options={[['shop', t('商店', 'The shop')], ['fight', t('直接开打', 'The fight')]]} onPick={(v) => set({ arrive: v })} />
      </div>
      <div class="mj-sand-row">
        <span class="mj-sand-label">{t('数值表', 'Tables')}</span>
        <span class="mj-small">{t(`改动 ${nTables} 项（进场后在「调 · 数值表」里改）`, `${nTables} changed (edit them in Tune · Tables once in)`)}</span>
        {nTables > 0 && <button type="button" class="btn btn-small" onClick={() => { resetAll(); setS({ ...s }); }}>{t('恢复默认', 'Reset')}</button>}
      </div>
      <div class="mj-sand-go">
        <button type="button" class="btn" onClick={() => { setS(def()); setSeedMode('random'); setMoonText(''); }}>{t('恢复默认', 'Defaults')}</button>
        <ImportButton onDone={() => setS((x) => ({ ...x }))} onSession={(f) => { setS((x) => setupFrom(f, x)); setSeedMode('typed'); }} />
        <button type="button" class="btn btn-primary" onClick={start}>{t('进场', 'Start')}</button>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────── the 调 dock
type Tab = 'run' | 'enemy' | 'tools' | 'tables';
/** The stepper's step per stat (sandbox.md §4.1). */
const STAT_STEP: Partial<Record<StatId, number>> = {
  hp: 10, armor: 1, dodge: 5, speed: 5, dmg: 5, aspd: 10, crit: 5, critDmg: 10, range: 10, area: 5, knock: 5, heal: 5, luck: 5, pickup: 10,
};
const isDesk = () => { try { return matchMedia('(min-width: 1000px)').matches; } catch { return false; } };

export function Dock(p: DockProps) {
  const t = useT();
  const [open, setOpen] = useState(() => isDesk());
  const [tab, setTab] = useState<Tab>('run');
  // a phone: 「边看边调」 keeps the wave playing with the sheet at 40 %; 「拉高」 takes the sheet to 92 %
  const [watch, setWatch] = useState(false);
  const [tall, setTall] = useState(false);
  // 工具 → 商店品质: the 数值表 opens on that search
  const [tq, setTq] = useState<{ q: string; n: number } | null>(null);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const toggle = (on = !open) => setOpen(on);
  // the phone sheet holds the wave while it is open (unless 边看边调); a restart or a new wave with it open is held too
  useEffect(() => { p.onHold(open && !watch && !isDesk() && p.midWave); }, [open, watch, p.midWave, p.run]);
  useEffect(() => () => p.onHold(false), []);
  // a desktop: the panel takes 420 px at the right and the arena keeps the rest (the engine follows its box)
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const runEl = box.current?.closest('.mj-run');
    runEl?.classList.toggle('mj-sand-docked', open && isDesk());
    return () => runEl?.classList.remove('mj-sand-docked');
  }, [open]);
  // keys: T the dock, G godmode, R restart, [ ] game speed (never while typing in a box)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'))) return;
      const k = e.key.toLowerCase();
      if (k === 't') { e.preventDefault(); toggle(); }
      else if (k === 'g') { e.preventDefault(); p.sess.setTools({ god: !p.sess.tools().god }); refresh(); }
      else if (k === 'r' && p.midWave) { e.preventDefault(); p.onRestart(); }
      else if (k === '[' || k === ']') {
        e.preventDefault();
        const i = TIME_SCALES.indexOf(p.sess.tools().timeScale);
        const j = Math.max(0, Math.min(TIME_SCALES.length - 1, i + (k === ']' ? 1 : -1)));
        p.sess.setTools({ timeScale: TIME_SCALES[j] });
        refresh();
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  });
  const n = changes().length + p.sess.sheet().length;
  return (
    <>
      <span ref={box} hidden />
      <div class="mj-sand-banner" role="status">{t('模拟场 · 不计入', 'Sandbox · not counted')}</div>
      <button type="button" class={'mj-sand-tune' + (open ? ' is-on' : '')} aria-expanded={open} aria-label={t('调', 'Tune')} title={t('调（T）', 'Tune (T)')} onClick={() => toggle()}>
        <span class="brush" aria-hidden="true">调</span>
      </button>
      {open && (
        <aside class={'mj-sand-dock' + (watch ? ' is-watch' : tall ? ' is-tall' : '')} aria-label={t('调', 'Tune')}>
          <div class="mj-sand-grip">
            <button type="button" class="mj-sand-grab" aria-label={tall ? t('放低', 'Lower') : t('拉高', 'Raise')} aria-pressed={tall} disabled={watch} onClick={() => setTall(!tall)}><span aria-hidden="true" /></button>
            <label class="mj-sand-watch"><input type="checkbox" checked={watch} onChange={(e) => setWatch((e.target as HTMLInputElement).checked)} /> {t('边看边调', 'Tune while playing')}</label>
          </div>
          <div class="mj-sand-tabs" role="tablist">
            {([['run', t('本局', 'Run')], ['enemy', t('敌人', 'Enemies')], ['tools', t('工具', 'Tools')], ['tables', t('数值表', 'Tables')]] as const).map(([id, text]) => (
              <button type="button" role="tab" aria-selected={tab === id} class={'mj-sand-tab' + (tab === id ? ' is-on' : '')} onClick={() => setTab(id)}>{text}</button>
            ))}
            <button type="button" class="mj-sand-tab mj-sand-close" aria-label={t('收起', 'Close')} onClick={() => toggle(false)}>✕</button>
          </div>
          <div class="mj-sand-body" key={tab}>
            {tab === 'run' && <RunTab {...p} onChanged={refresh} />}
            {tab === 'enemy' && <EnemyTab {...p} onChanged={refresh} />}
            {tab === 'tools' && <ToolsTab {...p} onChanged={refresh} onTables={(q) => { setTq({ q, n: (tq?.n ?? 0) + 1 }); setTab('tables'); }} onPlay={() => { if (!isDesk() && !watch) setOpen(false); }} />}
            {tab === 'tables' && <TablesTab key={tq?.n ?? 0} q0={tq?.q} onChanged={refresh} onSearchFocus={() => { if (!watch && !tall) setTall(true); }} />}
          </div>
          <div class="mj-sand-foot">
            <button type="button" class="btn btn-small" disabled={n === 0} onClick={() => { resetAll(); p.sess.setSheet([]); if (!p.midWave) p.onRun(p.sess.run()); refresh(); }}>{t('撤销全部', 'Undo all')}</button>
            <button type="button" class="btn btn-small" disabled={!p.midWave} onClick={p.onRestart}>{t('重开此重', 'Restart wave')}</button>
            <ExportButton sess={p.sess} n={n} />
          </div>
        </aside>
      )}
    </>
  );
}

type TabProps = DockProps & { onChanged: () => void };

/** 本局: the 26 stats (add or set), 月华 and level, weapons and items. */
function RunTab(p: TabProps) {
  const t = useT();
  const [q, setQ] = useState('');
  const rows = p.sess.sheet();
  const run = p.sess.run();
  const live = p.midWave ? p.engine()?.world.stats ?? null : null;
  const now = live ?? computeStats(run);
  const bare = computeStats({ ...run, sand: undefined });
  const rowOf = (id: StatId) => rows.find((r) => r.id === id);
  const put = (id: StatId, mode: SheetRow['mode'], v: number | null) => {
    const next = rows.filter((r) => r.id !== id);
    if (v !== null && !(mode === 'add' && v === 0)) next.push({ id, mode, v });
    p.sess.setSheet(next);
    if (!p.midWave) p.onRun(p.sess.run());
    p.onChanged();
  };
  const match = (id: StatId) => {
    const s = q.trim();
    if (!s) return true;
    if (SYNONYMS[s] === id) return true;
    return statName(id, (zh) => zh).includes(s) || statName(id, (_z, en) => en).toLowerCase().includes(s.toLowerCase()) || id.toLowerCase().includes(s.toLowerCase());
  };
  const change = (fn: (r: RunSave) => RunSave) => {
    p.sess.patch(fn);
    if (!p.midWave) p.onRun(p.sess.run());
    p.onChanged();
  };
  return (
    <div class="mj-sand-tabbody">
      <input class="mj-sand-search" type="search" placeholder={t('搜：攻速、气血、移速……', 'Search: attack speed, HP …')} aria-label={t('搜属性', 'Search stats')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {STAT_GROUPS.map((g) => {
        const ids = g.stats.filter(match);
        if (!ids.length) return null;
        return (
          <section class="mj-sand-group">
            <h3 class="mj-sand-h">{t(g.zh, g.en)}</h3>
            {ids.map((id) => {
              const r = rowOf(id);
              const mode = r?.mode ?? 'add';
              return (
                <div class="mj-sand-stat">
                  <div class="mj-sand-stat-head">
                    <b>{statName(id, t)}</b>
                    <span class="mj-sand-badge">{t('即时', 'Live')}</span>
                    <span class="chip-row mj-sand-mode">
                      <button type="button" class="chip" aria-pressed={mode === 'add'} onClick={() => put(id, 'add', r && r.mode === 'add' ? r.v : 0)}>{t('加减', 'Add')}</button>
                      <button type="button" class="chip" aria-pressed={mode === 'set'} onClick={() => put(id, 'set', r && r.mode === 'set' ? r.v : round4(bare[id]))}>{t('设为', 'Set')}</button>
                    </span>
                    <Stepper label={statName(id, t)} value={r?.v ?? 0} step={STAT_STEP[id] ?? 1} onSet={(v) => put(id, mode, v)} />
                  </div>
                  <small class="mj-small muted">{t(`现在 ${round4(now[id])}（底子 ${round4(bare[id])} · 本局 ${r ? (r.mode === 'set' ? '=' : '') + r.v : 0}）`, `Now ${round4(now[id])} (base ${round4(bare[id])} · this run ${r ? (r.mode === 'set' ? '=' : '') + r.v : 0})`)}</small>
                  {r && id !== 'curse' && (
                    <button type="button" class="btn btn-small mj-sand-bake" title={t('本局的加减变成数值表里同伴的底子，会随文件导出', "Turns this run's change into the companion's own number in the tables (exported)")} onClick={() => {
                      const path = p.sess.bake(id);
                      if (path) { toast(t(`已写进同伴底子：${path}`, `Now the companion's base: ${path}`)); if (!p.midWave) p.onRun(p.sess.run()); p.onChanged(); }
                    }}>{t('写进同伴底子', "Make it the companion's base")}</button>
                  )}
                </div>
              );
            })}
          </section>
        );
      })}
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t('月华与等级', 'Moonlight and level')}</h3>
        <div class="mj-sand-line"><span>{t('月华', 'Moonlight')}</span><Stepper label={t('月华', 'Moonlight')} value={Math.round(run.moon)} step={100} min={0} onSet={(v) => {
          change((r) => ({ ...r, moon: Math.max(0, v) }));
          const W = p.engine()?.world;
          if (W && p.midWave) W.moonHeld = Math.max(0, v);
        }} /></div>
        <div class="mj-sand-line"><span>{t('等级', 'Level')}</span><span class="num">{run.lvl}</span>
          <button type="button" class="btn btn-small" disabled={p.midWave} onClick={() => change((r) => ({ ...r, lvl: r.lvl + 1, stats: { ...r.stats, hp: (r.stats.hp ?? 0) + 1 }, pending: { ...r.pending, cards: r.pending.cards + 1 } }))}>{t('升一级', 'Level up')}</button>
        </div>
        {p.midWave && <p class="mj-small muted">{t('下面几项在两重之间改（打的时候引擎自己记着）。', 'The numbers below change between waves (the engine keeps its own during one).')}</p>}
        {([
          ['store', '蓄月', 'Moon store', 50], ['harvest', '收成', 'Harvest', 1], ['xp', '经验', 'XP', 10], ['drunk', '醉', 'Drunk', 1],
          ...(run.char === 'cat' ? [['lives', '大橘的命', "Big Ginger's lives", 1] as const] : []),
        ] as const).map(([k, zh, en, step]) => (
          <div class="mj-sand-line"><span>{t(zh, en)}</span>
            {p.midWave ? <span class="num">{Math.round(run[k])}</span>
              : <Stepper label={t(zh, en)} value={Math.round(run[k] * 100) / 100} step={step} min={0} onSet={(v) => change((r) => ({ ...r, [k]: Math.max(0, v) }))} />}
          </div>
        ))}
      </section>
      <WeaponsEdit {...p} change={change} />
      <ItemsEdit {...p} change={change} />
    </div>
  );
}

function WeaponsEdit(p: TabProps & { change: (fn: (r: RunSave) => RunSave) => void }) {
  const t = useT();
  const run = p.sess.run();
  const [add, setAdd] = useState<WeaponId>(WEAPON_REG[0].id);
  const [tier, setTier] = useState<Tier>(1);
  const tiers: Tier[] = [1, 2, 3, 4];
  const max = COMPANIONS[run.char].slots;
  const [wq, setWq] = useState('');
  const wl = wq.trim().toLowerCase();
  const byClass = useMemo(() => {
    const g = new Map<string, { id: WeaponId; zh: string; en: string }[]>();
    for (const w of WEAPON_REG) {
      if (wl && !(w.zh.includes(wq.trim()) || w.en.toLowerCase().includes(wl) || w.id.includes(wl))) continue;
      const c = WEAPONS[w.id]?.classes[0] ?? 'sword';
      if (!g.has(c)) g.set(c, []);
      g.get(c)!.push(w);
    }
    return [...g];
  }, [wq]);
  const twin = (i: number) => run.weapons.findIndex((x, k) => k !== i && x.id === run.weapons[i].id && x.t === run.weapons[i].t);
  return (
    <section class="mj-sand-group">
      <h3 class="mj-sand-h">{t(`兵器（${run.weapons.length}/${max}）`, `Weapons (${run.weapons.length}/${max})`)}</h3>
      {p.midWave && <p class="mj-small muted">{t('改兵器、道具要重开此重才生效。', 'Weapon and item changes need a restart of the wave.')}</p>}
      {run.weapons.map((w, i) => (
        <div class="mj-sand-line">
          <span>{nameOf(w.id, t)}</span>
          <select class="mj-sand-select" aria-label={t('品质', 'Tier')} value={w.t} onChange={(e) => p.change((r) => ({ ...r, weapons: r.weapons.map((x, k) => (k === i ? { ...x, t: Number((e.target as HTMLSelectElement).value) as Tier } : x)) }))}>
            {tiers.map((k) => <option value={k}>{tierText(k, t)}</option>)}
          </select>
          <button type="button" class="btn btn-small" disabled={run.weapons.length <= 1} onClick={() => p.change((r) => ({ ...r, weapons: r.weapons.filter((_, k) => k !== i) }))}>{t('拿掉', 'Remove')}</button>
          {twin(i) > i && w.t < 4 && <button type="button" class="btn btn-small" onClick={() => p.change((r) => merge(r, i, twin(i)) ?? r)}>{t('合铸', 'Merge')}</button>}
        </div>
      ))}
      <input class="mj-sand-search" type="search" placeholder={t('搜兵器', 'Search weapons')} aria-label={t('搜兵器', 'Search weapons')} value={wq} onInput={(e) => setWq((e.target as HTMLInputElement).value)} />
      <div class="mj-sand-line">
        <select class="mj-sand-select" aria-label={t('兵器', 'Weapon')} value={add} onChange={(e) => setAdd((e.target as HTMLSelectElement).value as WeaponId)}>
          {byClass.map(([c, ws]) => (
            <optgroup label={className(c as WClass, t)}>{ws.map((w) => <option value={w.id}>{t(w.zh, w.en)}</option>)}</optgroup>
          ))}
        </select>
        <select class="mj-sand-select" aria-label={t('品质', 'Tier')} value={tier} onChange={(e) => setTier(Number((e.target as HTMLSelectElement).value) as Tier)}>
          {tiers.map((k) => <option value={k}>{tierText(k, t)}</option>)}
        </select>
        <button type="button" class="btn btn-small" disabled={run.weapons.length >= max} onClick={() => p.change((r) => ({ ...r, weapons: [...r.weapons, { id: add, t: tier }].slice(0, max) }))}>{t('加上', 'Add')}</button>
      </div>
      {p.midWave && <button type="button" class="btn btn-small btn-primary" onClick={p.onRestart}>{t('应用并重开此重', 'Apply and restart the wave')}</button>}
    </section>
  );
}

function ItemsEdit(p: TabProps & { change: (fn: (r: RunSave) => RunSave) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const run = p.sess.run();
  const held = (id: ItemId) => run.items[id] ?? 0;
  const s = q.trim().toLowerCase();
  const found = ITEM_REG.filter((it) => !s || it.zh.includes(q.trim()) || it.en.toLowerCase().includes(s) || it.id.includes(s))
    .sort((a, b) => held(b.id) - held(a.id));
  const list = found.slice(0, s ? 80 : 30);
  const more = found.length - list.length;
  const setN = (id: ItemId, n: number) => p.change((r) => {
    const items = { ...r.items };
    if (n > 0) items[id] = Math.round(n); else delete items[id];
    return { ...r, items };
  });
  return (
    <section class="mj-sand-group">
      <h3 class="mj-sand-h">{t(`道具（${ITEM_REG.length} 种）`, `Items (${ITEM_REG.length})`)}</h3>
      <input class="mj-sand-search" type="search" placeholder={t('搜道具', 'Search items')} aria-label={t('搜道具', 'Search items')} value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      {list.map((it) => (
        <div class="mj-sand-line">
          <span>{t(it.zh, it.en)} <small class="muted">{tierText(ITEMS[it.id].tier as Tier, t)}{ITEMS[it.id].max ? ` · ≤${ITEMS[it.id].max}` : ''}</small></span>
          <Stepper label={t(it.zh, it.en)} value={held(it.id)} step={1} min={0} onSet={(n) => setN(it.id, n)} />
        </div>
      ))}
      {more > 0 && <p class="mj-small muted">{t(`还有 ${more} 种，搜名字`, `${more} more: search by name`)}</p>}
    </section>
  );
}

/** 敌人: the knobs, spawns and 清场 (session state, never data). */
function EnemyTab(p: TabProps) {
  const t = useT();
  const k = p.sess.enemy();
  const dev = p.sess.dev();
  const [mon, setMon] = useState<MonsterId>(MONSTER_REG[0].id);
  const [count, setCount] = useState(5);
  const [elite, setElite] = useState<EliteId>(ELITE_REG[0].id);
  const [aff, setAff] = useState<[AffixId | '', AffixId | '']>(['', '']);
  const [tre, setTre] = useState<TreasureId>(TREASURE_REG[0].id);
  const [boss, setBoss] = useState<BossId | 'twins' | 'mirrorself'>(BOSS_REG[0].id);
  const [phase, setPhase] = useState(0);
  const [daoxuan, setDaoxuan] = useState(false);
  const [haz, setHaz] = useState<HazardId>(HAZARD_REG[0].id);
  const [mut, setMut] = useState<MutatorId>(MUTATOR_REG[0].id);
  const [mutX, setMutX] = useState(1);
  const [term, setTerm] = useState<TermModId>(TERM_MOD_REG[0].id);
  const [clockS, setClockS] = useState(90);
  const knob = (key: keyof EnemyKnobs, zh: string, en: string) => (
    <div class="mj-sand-line">
      <span>{t(zh, en)} <small class="mj-sand-badge">{key === 'density' ? t('下一重', 'Next wave') : t('新刷出的', 'New spawns')}</small></span>
      <Stepper label={t(zh, en)} value={k[key]} step={0.1} min={ENEMY_RANGE[key][0]} max={ENEMY_RANGE[key][1]} onSet={(v) => { p.sess.setEnemy({ [key]: v }); p.onChanged(); }} />
    </div>
  );
  const live = p.midWave && !!dev;
  const bosses = live ? dev!.content.bosses() : [];
  const sel = <V extends string>(label: string, value: V, opts: readonly { id: V; zh: string; en: string }[], on: (v: V) => void, none?: string) => (
    <select class="mj-sand-select" aria-label={label} value={value} onChange={(e) => on((e.target as HTMLSelectElement).value as V)}>
      {none !== undefined && <option value="">{none}</option>}
      {opts.map((x) => <option value={x.id}>{t(x.zh, x.en)}</option>)}
    </select>
  );
  return (
    <div class="mj-sand-tabbody">
      <section class="mj-sand-group">
        {knob('hp', '敌血 ×', 'Enemy HP ×')}
        {knob('dmg', '敌伤 ×', 'Enemy damage ×')}
        {knob('spd', '敌速 ×', 'Enemy speed ×')}
        {knob('density', '数量 ×', 'Enemy count ×')}
        <p class="mj-small muted">{t('这几个旋钮只在模拟场里用，导出时写成「场次」备注；要改真正的敌人数值，去「数值表」的怪物、镜境、公式。', 'These knobs are for the sandbox only (exported as context). To change the real enemy numbers, use Tables: Monsters, Difficulty, Formula.')}</p>
      </section>
      {!live && <p class="mj-small muted">{t('放怪、首领、机关要在打的时候用。', 'Spawning works during a wave.')}</p>}
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t('放怪', 'Spawn')} <small class="mj-sand-badge">{t('即时', 'Live')}</small></h3>
        <div class="mj-sand-line">
          {sel(t('小怪', 'Monster'), mon, MONSTER_REG, setMon)}
          <Stepper label={t('数量', 'Count')} value={count} step={1} min={1} max={50} onSet={setCount} />
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.core.spawn(mon, count)}>{t('放小怪', 'Spawn')}</button>
        </div>
        <div class="mj-sand-line">
          {sel(t('精英', 'Elite'), elite, ELITE_REG, setElite)}
          {sel(t('镜印一', 'Mark 1'), aff[0], AFFIX_REG, (v) => setAff([v, aff[1]]), t('无镜印', 'No mark'))}
          {sel(t('镜印二', 'Mark 2'), aff[1], AFFIX_REG, (v) => setAff([aff[0], v]), t('无镜印', 'No mark'))}
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.content.elite(elite, aff.filter((a): a is AffixId => !!a))}>{t('放一只精英', 'Spawn an elite')}</button>
        </div>
        <div class="mj-sand-line">
          {sel(t('宝怪', 'Treasure'), tre, TREASURE_REG, setTre)}
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.content.treasure(tre)}>{t('放宝怪', 'Spawn a treasure')}</button>
        </div>
        <button type="button" class="btn btn-small" disabled={!live} onClick={() => { const n = p.sess.clearField(); toast(t(`清掉 ${n} 只`, `${n} cleared`)); }}>{t('清场', 'Clear the field')}</button>
      </section>
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t('首领', 'Bosses')}</h3>
        <div class="mj-sand-line">
          {sel(t('首领', 'Boss'), boss, [...BOSS_REG, { id: 'twins' as const, zh: '双生', en: 'The Twins' }, { id: 'mirrorself' as const, zh: '镜主', en: 'The Mirror Self' }], setBoss)}
          <Chips value={phase} label={t('从第几阶段', 'From phase')} options={[0, 1, 2, 3].map((x) => [x, t(`阶段 ${x}`, `Phase ${x}`)] as const)} onPick={setPhase} />
          <label class="mj-sand-watch"><input type="checkbox" checked={daoxuan} onChange={(e) => setDaoxuan((e.target as HTMLInputElement).checked)} /> {t('倒悬', 'Inverted')}</label>
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => { void dev?.content.boss(boss, phase, { daoxuan }).then((ok) => { const r = ok ? p.engine()?.world.run ?? null : null; if (r) p.sess.adopt(r); p.sess.started(); p.onChanged(); }); }}>{t('打这个首领', 'Fight this boss')}</button>
        </div>
        {bosses.length > 0 && (
          <>
            <ul class="mj-sand-log">{bosses.map((b) => <li class="num">{t(`${nameOf(b.id, t)} · 阶段 ${b.phase} · 血 ${Math.round(b.hp * 100)}% · 狂暴 ${b.enrage}`, `${nameOf(b.id, t)} · phase ${b.phase} · HP ${Math.round(b.hp * 100)}% · enrage ${b.enrage}`)}</li>)}</ul>
            <div class="mj-sand-line">
              <span>{t('转阶段', 'Force phase')}</span>
              <Chips value={-1} label={t('转阶段', 'Force phase')} options={[0, 1, 2, 3].map((x) => [x, String(x)] as const)} onPick={(x) => { dev?.content.phase(x); p.onChanged(); }} />
            </div>
            <div class="mj-sand-line">
              <span>{t('狂暴计时（秒）', 'Enrage clock (s)')}</span>
              <Stepper label={t('狂暴计时', 'Enrage clock')} value={clockS} step={10} min={0} onSet={setClockS} />
              <button type="button" class="btn btn-small" onClick={() => { dev?.content.fightTime(clockS); p.onChanged(); }}>{t('拨到', 'Set')}</button>
            </div>
          </>
        )}
      </section>
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t('机关 · 镜蚀 · 节气', 'Hazards · mutators · terms')} <small class="mj-sand-badge">{t('即时', 'Live')}</small></h3>
        <div class="mj-sand-line">
          {sel(t('机关', 'Hazard'), haz, HAZARD_REG, setHaz)}
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.content.hazard(haz)}>{t('放机关', 'Start a hazard')}</button>
        </div>
        <div class="mj-sand-line">
          {sel(t('镜蚀', 'Mutator'), mut, MUTATOR_REG, setMut)}
          <Chips value={mutX} label={t('强度', 'Strength')} options={[[0.5, '×0.5'], [1, '×1'], [2, '×2']]} onPick={setMutX} />
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.content.mutator(mut, mutX)}>{t('放镜蚀', 'Start a mutator')}</button>
        </div>
        <div class="mj-sand-line">
          {sel(t('节气', 'Solar term'), term, TERM_MOD_REG, setTerm)}
          <button type="button" class="btn btn-small" disabled={!live} onClick={() => dev?.content.term(term)}>{t('放节气', 'Start a solar term')}</button>
        </div>
      </section>
    </div>
  );
}

/** 工具: godmode, heal, cooldown ×, game speed, damage numbers, 测 DPS, restart / win / jump, the shop, rerolls, 月华. */
function ToolsTab(p: TabProps & { onTables: (q: string) => void; onPlay: () => void }) {
  const t = useT();
  const tl = p.sess.tools();
  const [jump, setJump] = useState(Math.min(SAND_WAVE.max, p.sess.run().wave + 1));
  const set = (x: Parameters<typeof p.sess.setTools>[0]) => { p.sess.setTools(x); p.onChanged(); };
  const toWave = (w: number) => {
    const r = p.sess.patch((x) => ({ ...x, wave: clampWave(w) - 1, inWave: null, shop: null }));
    p.onBetween(openShop(r, p.sess.unlocks()));
  };
  const giveMoon = (n: number) => {
    const r = p.sess.patch((x) => ({ ...x, moon: x.moon + n }));
    const W = p.engine()?.world;
    if (W && p.midWave) W.moonHeld += n;
    if (!p.midWave) p.onRun(r);
    p.onChanged();
  };
  // 测 DPS: the countdown ticks on screen while the window is open
  const left = p.sess.measuring();
  useEffect(() => {
    if (left === null) return;
    const id = setInterval(p.onChanged, 250);
    return () => clearInterval(id);
  }, [left === null]);
  const ms = p.sess.measures();
  const last = ms[ms.length - 1];
  return (
    <div class="mj-sand-tabbody">
      <section class="mj-sand-group">
        <div class="mj-sand-line"><span>{t('无敌（G）', 'Godmode (G)')}</span><Chips value={tl.god ? 1 : 0} label={t('无敌', 'Godmode')} options={[[1, t('开', 'On')], [0, t('关', 'Off')]]} onPick={(v) => set({ god: v === 1 })} /></div>
        <div class="mj-sand-line"><span>{t('技能冷却 ×', 'Skill cooldown ×')}</span><Chips value={tl.cdX} label={t('技能冷却', 'Skill cooldown')} options={CD_XS.map((x) => [x, String(x)] as const)} onPick={(v) => set({ cdX: v })} /></div>
        <div class="mj-sand-line"><span>{t('快慢（[ ]）', 'Game speed ([ ])')}</span><Chips value={tl.timeScale} label={t('快慢', 'Game speed')} options={TIME_SCALES.map((x) => [x, `×${x}`] as const)} onPick={(v) => set({ timeScale: v })} /></div>
        <div class="mj-sand-line"><span>{t('伤害数字', 'Damage numbers')}</span><Chips value={tl.nums ?? -1} label={t('伤害数字', 'Damage numbers')} options={[[-1, t('照设置', 'As set')], [0, t('关', 'Off')], [1, t('暴击', 'Crits')], [2, t('全部', 'All')]]} onPick={(v) => set({ nums: v === -1 ? null : (v as 0 | 1 | 2) })} /></div>
        <div class="mj-sand-actions">
          <button type="button" class="btn btn-small" disabled={!p.midWave} onClick={() => { p.sess.heal(); p.onChanged(); }}>{t('回满', 'Full heal')}</button>
          <button type="button" class="btn btn-small" disabled={!p.midWave} onClick={p.onRestart}>{t('重开此重（R）', 'Restart this wave (R)')}</button>
          {/* a phone's open sheet holds the wave: it closes so the win plays out */}
          <button type="button" class="btn btn-small" disabled={!p.midWave} onClick={() => { p.sess.winWave(); p.onPlay(); }}>{t('算作过关', 'Win this wave')}</button>
        </div>
      </section>
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t(`测 DPS（${MEASURE_SEC} 秒）`, `Measure DPS (${MEASURE_SEC}s)`)}</h3>
        <div class="mj-sand-line">
          <button type="button" class="btn btn-small" disabled={!p.midWave || left !== null} onClick={() => { if (p.sess.measure()) p.onChanged(); }}>
            {left !== null ? t(`在测……还剩 ${Math.ceil(left)} 秒`, `Measuring… ${Math.ceil(left)}s left`) : t('开始测', 'Start')}
          </button>
        </div>
        {last && (
          <div class="mj-small num mj-sand-measure">
            <p>{t(`第 ${last.wave} 重 · ${last.sec} 秒 · 每秒 ${last.dps} · 造成 ${last.dealt} · 受伤 ${last.taken} · 击杀 ${last.kills}`, `Wave ${last.wave} · ${last.sec}s · ${last.dps}/s · dealt ${last.dealt} · took ${last.taken} · ${last.kills} kills`)}</p>
            <ol class="mj-sand-top">{last.by.slice(0, 6).map(([id, v]) => <li><span>{nameOf(id, t)}</span><span>{t(`${v}/秒`, `${v}/s`)}</span></li>)}</ol>
          </div>
        )}
      </section>
      <section class="mj-sand-group">
        <div class="mj-sand-line">
          <span>{t('跳到第几重', 'Jump to wave')}</span>
          <Stepper label={t('跳到第几重', 'Jump to wave')} value={jump} step={1} min={SAND_WAVE.min} max={SAND_WAVE.max} onSet={setJump} />
          <button type="button" class="btn btn-small" onClick={() => toWave(jump)}>{t('跳', 'Go')}</button>
        </div>
        <div class="mj-sand-actions">
          <button type="button" class="btn btn-small" onClick={() => toWave(p.sess.run().wave + 1)}>{t('现在开店', 'Open the shop')}</button>
          <button type="button" class="btn btn-small" disabled={p.midWave || !p.sess.run().shop} onClick={() => p.onRun(p.sess.patch((r) => ({ ...r, shop: r.shop ? { ...r.shop, free: 999 } : null })))}>{t('刷新免费', 'Free rerolls')}</button>
          <button type="button" class="btn btn-small" onClick={() => p.onTables('shopOdds')}>{t('商店品质', 'Shop odds')}</button>
          <button type="button" class="btn btn-small" onClick={() => p.onTables('itemOdds')}>{t('道具品质', 'Item odds')}</button>
        </div>
        <div class="mj-sand-actions">
          <button type="button" class="btn btn-small" onClick={() => giveMoon(100)}>{t('给月华 +100', 'Moonlight +100')}</button>
          <button type="button" class="btn btn-small" onClick={() => giveMoon(1000)}>{t('给月华 +1000', 'Moonlight +1000')}</button>
        </div>
      </section>
      <section class="mj-sand-group">
        <h3 class="mj-sand-h">{t('记录', 'Log')}</h3>
        <WaveLog sess={p.sess} />
      </section>
    </div>
  );
}

/** 数值表: every number of the 24 tables — browse group → entity → rows, or search a name, an id or a path. */
const FLAT_TABLES = new Set(['F', 'CLAMP', 'BASE_STATS', 'MASTERY', 'CARD_STATS']);
const BADGE: Record<Leaf['badge'], readonly [string, string]> = {
  live: ['即时', 'Live'], spawn: ['新刷出的', 'New spawns'], wave: ['下一重', 'Next wave'], shop: ['下一家店', 'Next shop'], run: ['新开局', 'New run'], none: ['此处看不出', 'Not felt here'],
};
/** A row of the list: one leaf, or a short number array shown as one row of boxes (凡 灵 仙 神; an odds row's 5). */
type TRow = { kind: 'one'; l: Leaf } | { kind: 'arr'; parent: string; segs: readonly Seg[]; items: Leaf[] };
function groupRows(list: readonly Leaf[]): TRow[] {
  const out: TRow[] = [];
  for (let i = 0; i < list.length;) {
    const l = list[i];
    const last = l.segs[l.segs.length - 1];
    if (typeof last === 'number' && last === 0 && l.kind === 'number') {
      const parent = l.segs.slice(0, -1);
      const key = fmtPath(parent);
      const items: Leaf[] = [l];
      let j = i + 1;
      while (j < list.length && items.length < 6) {
        const m = list[j];
        const ml = m.segs[m.segs.length - 1];
        if (m.kind !== 'number' || ml !== items.length || m.segs.length !== l.segs.length || fmtPath(m.segs.slice(0, -1)) !== key) break;
        items.push(m);
        j++;
      }
      const whole = valueOf(key);
      if (items.length >= 2 && Array.isArray(whole) && whole.length === items.length) { out.push({ kind: 'arr', parent: key, segs: parent, items }); i = j; continue; }
    }
    out.push({ kind: 'one', l });
    i++;
  }
  return out;
}
/** The entity's own in-game text, for keys the tables have no word for (sandbox.md §4.4). */
function describeOf(segs: readonly Seg[], t: T): string | null {
  const id = segs[1];
  if (typeof id !== 'string') return null;
  try {
    if (segs[0] === 'WEAPONS' && id in WEAPONS) { const d = describeWeapon(id as WeaponId, 1, t); return `${d.head} · ${d.body}`; }
    if (segs[0] === 'ITEMS' && id in ITEMS) return describeItem(id as ItemId, t).body;
    if (segs[0] === 'SKILLS') return describeSkill(id as SkillId, t).body;
    if (segs[0] === 'PASSIVES') return describePassive(id as PassiveId, t).body;
  } catch { /* an edit the text's slots can't read */ }
  return null;
}
const wave = (tb: string, k: string) => (row: number) => { const v = valueOf(`${tb}.${k}[${row}][0]`); return typeof v === 'number' ? v : undefined; };
const lastPart = (s: string) => { const i = s.lastIndexOf(' · '); return i < 0 ? s : s.slice(i + 3); };
const headPart = (s: string) => { const i = s.lastIndexOf(' · '); return i < 0 ? s : s.slice(0, i); };

function TablesTab(props: { onChanged: () => void; q0?: string; onSearchFocus?: () => void }) {
  const t = useT();
  const [q, setQ] = useState(props.q0 ?? '');
  const [only, setOnly] = useState(false);
  const [table, setTable] = useState<string | null>(null);
  const [ent, setEnt] = useState<string | null>(null);
  const all = leaves();
  const ch = changes();
  const terms = searchTerms(q).map((x) => x.toLowerCase());
  const s = terms[0] ?? '';
  const search = useRef<HTMLInputElement>(null);
  // a desktop: 「/」 focuses the search (never while typing in a box)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.key !== '/' || (el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'))) return;
      e.preventDefault();
      search.current?.focus();
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
  const [more, list]: [number, Leaf[]] = useMemo(() => {
    if (only) return [0, ch.map((c) => all.find((l) => l.path === c.path)).filter((x): x is Leaf => !!x)];
    if (s) {
      const out: Leaf[] = [];
      let extra = 0;
      for (const l of all) {
        const e = typeof l.segs[1] === 'string' ? named(l.segs[1] as string) : undefined;
        const zh = leafLabel(l.segs, (a) => a), en = leafLabel(l.segs, (_a, b) => b).toLowerCase();
        const hit = terms.some((x) => l.path.toLowerCase().includes(x) || zh.includes(x) || en.includes(x) || (e && (e.zh.includes(x) || e.en.toLowerCase().includes(x))));
        if (!hit) continue;
        if (out.length < 200) out.push(l); else extra++;
      }
      return [extra, out];
    }
    if (table && ent !== null) return [0, all.filter((l) => l.segs[0] === table && String(l.segs[1]) === ent)];
    return [0, []];
  }, [q, only, table, ent, ch.length]);
  // the entities (or, for F and the flat tables, the top keys) of the open table
  const ents = useMemo(() => {
    if (!table) return [];
    const seen = new Set<string>();
    for (const l of all) if (l.segs[0] === table) seen.add(String(l.segs[1]));
    return [...seen];
  }, [table]);
  const rows = useMemo(() => groupRows(list), [list]);
  const browsing = !s && !only;
  const entDesc = browsing && table && ent !== null ? describeOf([table, ent], t) : null;
  const shownDesc = new Set<string>();
  return (
    <div class="mj-sand-tabbody">
      {/* the search stays at the top while the results scroll (a phone's keyboard leaves little room); the file bar and the note sit below */}
      <div class="mj-sand-find">
        <input ref={search} class="mj-sand-search" type="search" placeholder={t('搜：名字、编号或路径（青锋剑、幸运、F.priceSlope）', 'Search: a name, an id or a path (/)')} aria-label={t('搜数值', 'Search the tables')} value={q} onFocus={() => props.onSearchFocus?.()} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        <Chips value={only ? 1 : 0} label={t('只看改过的', 'Changed only')} options={[[0, t('全部', 'All')], [1, t(`改过的 ${ch.length}`, `Changed ${ch.length}`)]]} onPick={(v) => setOnly(v === 1)} />
      </div>
      {browsing && (
        <nav class="mj-sand-browse" aria-label={t('分组', 'Groups')}>
          {table && <button type="button" class="btn btn-small" onClick={() => { if (ent !== null) setEnt(null); else setTable(null); }}>← {ent !== null ? t('回到分组', 'Back to the group') : t('回到全部', 'All groups')}</button>}
          {!table && (
            <div class="chip-row mj-sand-chips">
              {TUNABLE.map((tb) => <button type="button" class="chip" onClick={() => { setTable(tb.id); setEnt(null); }}>{t(tb.zh, tb.en)}</button>)}
            </div>
          )}
          {table && ent === null && (
            <div class="chip-row mj-sand-chips">
              {ents.map((k) => {
                const e = FLAT_TABLES.has(table) ? null : named(k);
                const label = table === 'F' ? (F_LABEL[k] ? t(F_LABEL[k][0], F_LABEL[k][1]) : k) : e ? t(e.zh, e.en) : leafLabel([table, k], t).split(' · ').pop() ?? k;
                return <button type="button" class="chip" title={k} onClick={() => setEnt(k)}>{label}</button>;
              })}
            </div>
          )}
          {entDesc && <p class="mj-small mj-sand-desc">{entDesc}</p>}
        </nav>
      )}
      {rows.map((r) => {
        if (r.kind === 'arr') return <ArrRow r={r} onChanged={props.onChanged} />;
        const l = r.l;
        const raw = rawKeys(l.segs);
        const dk = `${String(l.segs[0])}.${String(l.segs[1])}`;
        const desc = raw.length && !entDesc && !shownDesc.has(dk) ? describeOf(l.segs, t) : null;
        if (desc) shownDesc.add(dk);
        return <LeafRow l={l} desc={desc} onChanged={props.onChanged} />;
      })}
      {more > 0 && <p class="mj-small muted">{t(`还有 ${more} 条，搜得再细一点`, `${more} more: narrow the search`)}</p>}
      {!only && !s && !table && <p class="mj-small muted">{t(`共 ${all.length} 个数：点一组，或者直接搜。`, `${all.length} numbers in all: open a group, or search.`)}</p>}
      <div class="mj-sand-files">
        <IoBar onChanged={props.onChanged} />
        <p class="mj-small muted">{t('入镜费、返照钱、复活价这些钱数不在这里调；要改请直接告诉我。', "Fees, pay and the revive price aren't tuned here; tell me directly.")}</p>
      </div>
    </div>
  );
}
/** The chips a row carries: when it bites, shared with N places, a formula in the source. */
function LeafChips(props: { ls: readonly Leaf[] }) {
  const t = useT();
  const l = props.ls[0];
  const aliases = props.ls.flatMap((x) => x.aliases);
  const n = props.ls.reduce((m, x) => Math.max(m, x.aliases.length), 0);
  return (
    <>
      <span class="mj-sand-badge">{t(BADGE[l.badge][0], BADGE[l.badge][1])}</span>
      {n > 0 && <span class="mj-sand-badge" title={aliases.join('\n')}>{t(`共用 · ${n + 1} 处`, `Shared · ${n + 1} places`)}</span>}
      {props.ls.some((x) => isComputed(x.path)) && <span class="mj-sand-badge">{t('源里是算式', 'A formula in the source')}</span>}
      {props.ls.some((x) => x.ro) && <span class="mj-sand-badge">🔒 {t('结构字段，不能改', 'Structural, not editable')}</span>}
    </>
  );
}
function LeafRow(props: { l: Leaf; desc: string | null; onChanged: () => void }) {
  const t = useT();
  const l = props.l;
  const v = valueOf(l.path);
  const d = defaultOf(l.path);
  const put = (x: number | boolean | null) => { setValue(l.path, x); props.onChanged(); };
  return (
    <div class={'mj-sand-leaf' + (Object.is(v, d) ? '' : ' is-changed')}>
      <div class="mj-sand-leaf-head">
        <b>{leafLabel(l.segs, t, wave(String(l.segs[0]), String(l.segs[1])))}</b>
        <LeafChips ls={[l]} />
        <code class="mj-sand-path">{l.path}</code>
      </div>
      {props.desc && <p class="mj-small mj-sand-desc">{props.desc}</p>}
      <div class="mj-sand-line">
        <small class="muted">{t(`默认 ${String(d)}`, `default ${String(d)}`)}</small>
        {l.ro ? null
          : l.kind === 'boolean'
            ? <Chips value={v ? 1 : 0} label={l.path} options={[[1, t('是', 'Yes')], [0, t('否', 'No')]]} onPick={(x) => put(x === 1)} />
            : <Stepper label={l.path} value={Number(v)} step={stepOf(Number(d), l.int)} onSet={(x) => put(x)} />}
        {!Object.is(v, d) && <button type="button" class="btn btn-small" onClick={() => put(null)}>{t('还原', 'Default')}</button>}
      </div>
      <OddsSum segs={l.segs} onChanged={props.onChanged} />
    </div>
  );
}
/** A per-tier array (dmg: [14, 22, 36, 58]) or an odds row: one row, a box each (凡 灵 仙 神; I–IV in English). */
function ArrRow(props: { r: Extract<TRow, { kind: 'arr' }>; onChanged: () => void }) {
  const t = useT();
  const { r } = props;
  const w = wave(String(r.segs[0]), String(r.segs[1]));
  const changed = r.items.some((l) => !Object.is(valueOf(l.path), defaultOf(l.path)));
  const head = headPart(leafLabel(r.items[0].segs, t, w));
  return (
    <div class={'mj-sand-leaf' + (changed ? ' is-changed' : '')}>
      <div class="mj-sand-leaf-head">
        <b>{head}</b>
        <LeafChips ls={r.items} />
        <code class="mj-sand-path">{r.parent}</code>
      </div>
      <div class="mj-sand-boxes" style={{ gridTemplateColumns: `repeat(${r.items.length}, minmax(0, 1fr))` }}>
        {r.items.map((l) => {
          const v = Number(valueOf(l.path));
          const d = defaultOf(l.path);
          const sub = lastPart(leafLabel(l.segs, t, w));
          return (
            <label class={'mj-sand-box' + (Object.is(valueOf(l.path), d) ? '' : ' is-changed')} title={`${l.path} · ${t('默认', 'default')} ${String(d)}`}>
              <small>{sub}</small>
              <BoxInput value={v} ro={l.ro} label={`${head} · ${sub}`} onSet={(x) => { setValue(l.path, x); props.onChanged(); }} />
              <small class="muted">{Object.is(valueOf(l.path), d) ? '' : t(`原 ${String(d)}`, `was ${String(d)}`)}</small>
            </label>
          );
        })}
      </div>
      {changed && <button type="button" class="btn btn-small" onClick={() => { for (const l of r.items) setValue(l.path, null); props.onChanged(); }}>{t('这一行还原', 'Reset this row')}</button>}
      <OddsSum segs={r.items[1]?.segs ?? r.items[0].segs} onChanged={props.onChanged} />
    </div>
  );
}
/** A compact number box (the per-tier rows): typed, Enter or leaving the box sets it; 「±」 lives in the stepper rows. */
function BoxInput(props: { value: number; ro: boolean; label: string; onSet: (v: number) => void }) {
  const [text, setText] = useState(String(round4(props.value)));
  useEffect(() => { setText(String(round4(props.value))); }, [props.value]);
  const put = () => { const v = Number(text); if (Number.isFinite(v) && v !== props.value) props.onSet(round4(v)); else setText(String(round4(props.value))); };
  return <input class="mj-sand-num num" inputMode="decimal" readOnly={props.ro} aria-label={props.label} value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} onChange={put} onKeyDown={(e) => { if (e.key === 'Enter') put(); }} />;
}
/** An odds row (F.shopOdds[k] / F.itemOdds[k]): its four tiers must add up to 100; 「补在凡上」 puts the rest into 凡. */
function OddsSum(props: { segs: readonly Seg[]; onChanged: () => void }) {
  const t = useT();
  const s = props.segs;
  if (!(s[0] === 'F' && (s[1] === 'shopOdds' || s[1] === 'itemOdds') && s[3] === 1 && typeof s[2] === 'number')) return null;
  const row = `F.${String(s[1])}[${s[2]}]`;
  const vals = [1, 2, 3, 4].map((i) => Number(valueOf(`${row}[${i}]`)) || 0);
  const sum = Math.round(vals.reduce((a, b) => a + b, 0) * 1000) / 1000;
  if (sum === 100) return null;
  return (
    <p class="mj-small mj-lend-num">
      {t(`合计 ${sum}，不是 100`, `Adds up to ${sum}, not 100`)}{' '}
      <button type="button" class="btn btn-small" onClick={() => { setValue(`${row}[1]`, Math.max(0, vals[0] + 100 - sum)); props.onChanged(); }}>{t('补在凡上', 'Fill with Common')}</button>
    </p>
  );
}
/** 1 for whole numbers, else 5 % of the value rounded to one significant figure. */
function stepOf(v: number, int: boolean): number {
  if (int || (Number.isInteger(v) && Math.abs(v) >= 1)) return 1;
  const x = Math.abs(v) * 0.05;
  if (!(x > 0)) return 0.01;
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  return Math.round(x / p) * p;
}

// ───────────────────────────────────────────── export, copy, import (sandbox.md §7.2)
/** The owner's note for the file (kept for the tab's life, and in the draft). */
let noteText = '';
/** Keep this visit's edits on the device (MirrorView calls it as the sandbox closes). */
export function keepDraft(): void { saveDraft(noteText); }
function ExportButton(props: { sess: DockProps['sess'] | null; n: number }) {
  const t = useT();
  const [copy, setCopy] = useState<string | null>(null);
  const go = async () => {
    const name = fileName();
    const json = exportJson(buildExport({ note: noteText, lang: lang.value === 'en' ? 'en' : 'zh', sess: props.sess }));
    saveDraft(noteText);
    const r = await saveTuning(name, json);
    if (r === 'saved') toast(t(`已保存 ${name}`, `Saved ${name}`));
    else if (r === 'copy') setCopy(json);
    else if (r === 'download') toast(t('已开始下载；若无反应，请改用「复制」', 'Download started. If nothing happens, use Copy'), 3600);
  };
  return (
    <>
      <button type="button" class="btn btn-small btn-primary mj-sand-export" disabled={props.n === 0} onClick={() => void go()}>{t(`导出 ${props.n} 项`, `Export ${props.n}`)}</button>
      <CopySheet text={copy} onClose={() => setCopy(null)} />
    </>
  );
}
function CopySheet(props: { text: string | null; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (props.text) setTimeout(() => ref.current?.select(), 60); }, [props.text]);
  return (
    <Sheet open={props.text !== null} onClose={props.onClose} title={t('复制调参', 'Copy the tuning')}>
      <p class="mj-small">{t('这里存不了文件：全选复制下面的文字，发给我就行。', "Files can't be saved here: copy the text below and send it to me.")}</p>
      <textarea class="mj-sand-copy" ref={ref} readOnly value={props.text ?? ''} aria-label={t('调参文字', 'Tuning text')} />
      <button type="button" class="btn btn-primary" onClick={() => { ref.current?.select(); void copyTuning(props.text ?? '').then((ok) => ok && toast(t('调参已复制', 'Tuning copied'))); }}>{t('复制', 'Copy')}</button>
    </Sheet>
  );
}
/** 「连场前一起套用」: a file's `session` back onto the setup page (each field checked; anything unknown keeps the page's). */
function setupFrom(f: Record<string, unknown>, cur: SandSetup): SandSetup {
  const pick = <V,>(v: unknown, ok: (x: unknown) => x is V, d: V): V => (ok(v) ? v : d);
  const inReg = (reg: readonly { id: string }[]) => (x: unknown): x is never => typeof x === 'string' && reg.some((r) => r.id === x);
  const oneOf = <V extends string>(xs: readonly V[]) => (x: unknown): x is V => typeof x === 'string' && (xs as readonly string[]).includes(x);
  const char = pick(f.char, inReg(COMPANION_REG), cur.char) as SandSetup['char'];
  const vows = f.vows && typeof f.vows === 'object' ? cleanVows(f.vows as VowRanks) : cur.vows;
  return {
    ...cur, char, map: pick(f.map, inReg(MAP_REG), cur.map) as SandSetup['map'],
    diff: (typeof f.diff === 'number' && f.diff >= 0 && f.diff < DIFF_REG.length ? Math.floor(f.diff) : cur.diff) as DiffIndex,
    vows, wave: typeof f.wave === 'number' ? clampWave(f.wave) : cur.wave,
    seed: typeof f.seed === 'number' && Number.isFinite(f.seed) ? f.seed >>> 0 : cur.seed,
    heart: pick(f.heart, oneOf<SandHeart>(['full', 'own', 'plain']), cur.heart),
    mastery: pick(f.mastery, oneOf<SandMastery>(['full', 'own']), cur.mastery),
    pool: pick(f.pool, oneOf<SandPool>(['all', 'mine']), cur.pool),
    build: pick(f.build, oneOf<SandBuild>(['bot', 'bare']), 'bot'),
    arch: pick(f.arch, inReg(ARCHETYPE_REG), COMPANIONS[char].leans[0]) as SandSetup['arch'],
  };
}
function ImportButton(props: { onDone: () => void; onSession?: (f: Record<string, unknown>) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" class="btn" onClick={() => setOpen(true)}>{t('导入调参文件', 'Import a tuning file')}</button>
      <ImportSheet open={open} onClose={() => setOpen(false)} onDone={props.onDone} onSession={props.onSession} />
    </>
  );
}
function ImportSheet(props: { open: boolean; onClose: () => void; onDone: () => void; onSession?: (f: Record<string, unknown>) => void }) {
  const t = useT();
  const [text, setText] = useState('');
  const [res, setRes] = useState<ImportCheck | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const check = (s: string) => {
    const r = checkImport(s);
    if (!r.ok) { toast(t('这不是模拟场的调参文件', "That isn't a sandbox tuning file")); setRes(null); return; }
    setRes(r);
  };
  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try { const s = await f.text(); setText(s); check(s); } catch { toast(t('读取文件失败', "Couldn't read the file")); }
  };
  const close = () => { setRes(null); setText(''); props.onClose(); };
  return (
    <Sheet open={props.open} onClose={close} title={t('导入调参文件', 'Import a tuning file')}>
      <input ref={file} type="file" accept="application/json,.json,text/plain" hidden onChange={(e) => void onFile(e)} />
      <div class="mj-sand-actions">
        <button type="button" class="btn" onClick={() => file.current?.click()}>{t('选文件', 'Choose a file')}</button>
      </div>
      <textarea class="mj-sand-copy" placeholder={t('或者把文字粘贴在这里', 'Or paste the text here')} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} aria-label={t('粘贴', 'Paste')} />
      <div class="mj-sand-actions">
        <button type="button" class="btn" disabled={!text.trim()} onClick={() => check(text)}>{t('看看', 'Check')}</button>
      </div>
      {res && res.ok && (
        <>
          <p class="mj-small">{t(`文件里有 ${res.usable.length + res.missing.length + res.stale.length + res.ro.length + res.bad.length} 项改动：可用 ${res.usable.length} 项；找不到 ${res.missing.length} 项；底值已变 ${res.stale.length} 项`, `The file has ${res.usable.length + res.missing.length + res.stale.length + res.ro.length + res.bad.length} changes: ${res.usable.length} usable, ${res.missing.length} not found, ${res.stale.length} whose default has changed`)}{res.ro.length > 0 && t(`；不能改 ${res.ro.length} 项`, `, ${res.ro.length} that can't be changed`)}{res.bad.length > 0 && t(`；数值不对 ${res.bad.length} 项`, `, ${res.bad.length} with a wrong value`)}</p>
          {res.file.note && <p class="mj-small muted">{res.file.note}</p>}
          <div class="mj-sand-actions">
            <button type="button" class="btn btn-primary" disabled={!res.usable.length} onClick={() => { const n = applyImport(res.usable); toast(t(`已套用 ${n} 项`, `${n} applied`)); props.onDone(); close(); }}>{t('套用', 'Apply')}</button>
            {props.onSession && res.file.session && (
              <button type="button" class="btn" onClick={() => { const n = applyImport(res.usable); props.onSession!(res.file.session!); toast(t(`已套用 ${n} 项，场前也照文件摆好了`, `${n} applied, and the setup follows the file`)); props.onDone(); close(); }}>{t('连场前一起套用', 'Apply with its setup')}</button>
            )}
            <button type="button" class="btn" onClick={close}>{t('取消', 'Cancel')}</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
/** The 数值表 tab's head: the note for the file, copy and import. */
function IoBar(props: { onChanged: () => void }) {
  const t = useT();
  const [note, setNote] = useState(noteText);
  const [copy, setCopy] = useState<string | null>(null);
  const doCopy = async () => {
    const json = exportJson(buildExport({ note: noteText, lang: lang.value === 'en' ? 'en' : 'zh' }));
    if (await copyTuning(json)) toast(t('调参已复制', 'Tuning copied')); else setCopy(json);
  };
  return (
    <section class="mj-sand-group">
      <input class="mj-sand-search" placeholder={t('给我留句话（改这些是想试什么）', 'A note for me (what you were testing)')} aria-label={t('留言', 'Note')} value={note} onInput={(e) => { noteText = (e.target as HTMLInputElement).value; setNote(noteText); }} />
      <div class="mj-sand-actions">
        <button type="button" class="btn btn-small" onClick={() => void doCopy()}>{t('复制', 'Copy')}</button>
        <ImportButton onDone={props.onChanged} />
      </div>
      <CopySheet text={copy} onClose={() => setCopy(null)} />
    </section>
  );
}

// ───────────────────────────────────────────── the death card
/** Hurt sources with no name of their own (a stray shot, a status, an arena hazard). */
const HURT_WORDS: Readonly<Record<string, readonly [string, string]>> = {
  shot: ['远程的弹', 'a shot'], hazard: ['场地机关', 'an arena hazard'], burn: ['灼烧', 'burning'], bleed: ['流血', 'bleeding'],
  boss: ['首领', 'a boss'], enemy: ['敌人', 'an enemy'], status: ['异常状态', 'a status'],
};
export function Death(p: DeathProps) {
  const t = useT();
  const d = p.sess.lastDeath();
  const [log, setLog] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => { first.current?.focus({ preventScroll: true }); }, []);
  // a fall the session did not record (it can't happen any more, but the card must never strand you): the bare card
  if (!d) {
    return (
      <div class="mj-sand-death card" role="dialog" aria-label={t('倒下了', 'You fell')}>
        <p class="brush mj-sand-death-title">{t('倒下了', 'You fell')}</p>
        <div class="mj-sand-actions">
          <button type="button" class="btn btn-primary" ref={first} onClick={p.onBack}>{t('回场前', 'Back to setup')}</button>
          {p.sess.before() && <button type="button" class="btn" onClick={p.onReplay}>{t('重打此重', 'Replay wave')}</button>}
        </div>
      </div>
    );
  }
  const src = (k: string) => {
    const [id, dot] = k.split(' ');
    const w = HURT_WORDS[id];
    return (w ? t(w[0], w[1]) : nameOf(id, t)) + (dot ? t('（持续）', ' (over time)') : '');
  };
  return (
    <div class="mj-sand-death card" role="dialog" aria-label={t('倒下了', 'You fell')}>
      <p class="brush mj-sand-death-title">{t(`倒在第 ${d.wave} 重 · ${d.t} 秒`, `Fell on wave ${d.wave} · ${d.t}s`)}</p>
      {d.top.length > 0 && (
        <ol class="mj-sand-top">
          {d.top.map(([k, v]) => <li><span>{src(k)}</span><span class="num">{v}</span></li>)}
        </ol>
      )}
      <div class="mj-sand-actions">
        <button type="button" class="btn btn-primary" ref={first} onClick={p.onReplay}>{t('重打此重', 'Replay wave')}</button>
        <button type="button" class="btn" onClick={p.onBack}>{t('回场前', 'Back to setup')}</button>
        <button type="button" class="btn" aria-expanded={log} onClick={() => setLog(!log)}>{t('看记录', 'Log')}</button>
      </div>
      {log && <WaveLog sess={p.sess} />}
    </div>
  );
}
function WaveLog(props: { sess: DeathProps['sess'] }) {
  const t = useT();
  const L = props.sess.log();
  const M = props.sess.measures();
  if (!L.length && !M.length) return <p class="mj-small muted">{t('还没有记录。', 'Nothing logged yet.')}</p>;
  const end = (e: string) => (e === 'won' ? t('过', 'won') : e === 'died' ? t('倒', 'fell') : t('跳过', 'skipped'));
  return (
    <ul class="mj-sand-log">
      {L.map((x) => <li class="num">{t(`第 ${x.wave} 重 · ${end(x.end)} · ${x.t} 秒 · 剩 ${x.hpLeft}/${x.hpMax} 气血 · 受伤 ${x.taken} · 击杀 ${x.kills} · 最强兵器每秒 ${x.topDps} · 改动 ${x.edits}`, `Wave ${x.wave} · ${end(x.end)} · ${x.t}s · ${x.hpLeft}/${x.hpMax} HP · took ${x.taken} · ${x.kills} kills · top weapon ${x.topDps}/s · ${x.edits} edits`)}</li>)}
      {M.map((x) => <li class="num">{t(`测 DPS · 第 ${x.wave} 重 · ${x.sec} 秒 · 每秒 ${x.dps} · 受伤 ${x.taken} · 击杀 ${x.kills}`, `DPS · wave ${x.wave} · ${x.sec}s · ${x.dps}/s · took ${x.taken} · ${x.kills} kills`)}</li>)}
    </ul>
  );
}

// ───────────────────────────────────────────── the pause sheet
export function Pause(p: PauseProps) {
  const t = useT();
  const title = t('暂停 · 模拟场', 'Paused · sandbox');
  return (
    <Sheet open={p.open} onClose={p.onResume} title={title} label={title}>
      <div class="mj-pausebody">
        <button type="button" class="btn btn-primary mj-big mj-wide" onClick={p.onResume}>{t('继续', 'Resume')}</button>
        <CharacterPanel run={p.run} t={t} density="compact" live={p.midWave ? p.live : null} />
        <div class="mj-row-actions mj-pause-exits">
          <button type="button" class="btn" onClick={p.onBack}>{t('回场前', 'Back to setup')}<small class="muted"> · {t('不计入，不结算', 'nothing counts or settles')}</small></button>
        </div>
      </div>
    </Sheet>
  );
}

/** What RunView mounts (MirrorView hands it in with the chunk). */
export const SAND_UI: SandUi = { Dock, Death, Pause };
