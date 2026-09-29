// 水月幻镜 · pause (GDD §18.9): resume, settings, the build so far, 暂离 and 弃镜. Mid-wave 暂离 warns
// first (「这一重要重打 · 第 k/3 次」); 弃镜 always confirms with what 镜碎 would pay now. No confirm():
// every question is a Sheet.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror } from '../../../app/mirror';
import { setSettings, state } from '../../../app/store';
import { todayKey } from '../../../core/date';
import { Sheet, Toggle } from '../../../ui/kit';
import { quoteNow } from '../logic';
import { setMirrorSettings } from '../logic/session';
import type { HudState, MirrorSettings, RunSave } from '../types';
import { termName } from '../data/glossary';
import { CharacterPanel } from './Panel';
import { calmPref, osReduced, setCalm } from './prefs';
import { signal } from '@preact/signals';
import { setVibrate } from '../engine/feel';

/** 震动 (this device's haptic ticks: an 8 ms tick when you are hurt, elite kills and the 镜技 at most once a
 *  second, boss blows — never ordinary crits): a per-device convenience, on by default. */
const VIBE_KEY = 'banmu.mirror.vibe';
const vibePref = signal<boolean>((() => { try { return localStorage.getItem(VIBE_KEY) !== '0'; } catch { return true; } })());
setVibrate(vibePref.value);
function setVibe(on: boolean): void {
  vibePref.value = on;
  setVibrate(on);
  try { localStorage.setItem(VIBE_KEY, on ? '1' : '0'); } catch { /* storage unavailable */ }
}

/** A yes / no question in a sheet. */
export function Confirm(props: {
  open: boolean; title: string; children: ComponentChildren; yes: string; no?: string; danger?: boolean; onYes: () => void; onNo: () => void;
}) {
  const t = useT();
  return (
    <Sheet open={props.open} onClose={props.onNo} title={props.title} label={props.title}>
      <div class="mj-confirm">
        {props.children}
        <div class="mj-row-actions">
          <button type="button" class={'btn ' + (props.danger ? 'btn-seal' : 'btn-primary')} onClick={props.onYes}>{props.yes}</button>
          <button type="button" class="btn btn-ghost" onClick={props.onNo}>{props.no ?? t('再想想', 'Not now')}</button>
        </div>
      </div>
    </Sheet>
  );
}

/** The kit's Toggle, but one that can be held off (a setting that another one overrides). */
function Switch(props: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" class="toggle" role="switch" aria-checked={props.checked} aria-label={props.label} disabled={props.disabled} onClick={() => props.onChange(!props.checked)} />;
}

/** A 0–100 % slider row for one of the app's volumes (the same values as 设置 · 声音). */
function VolumeRow(props: { title: string; value: number; on: boolean; offNote: string; onInput: (v: number) => void }) {
  const pct = Math.round(props.value * 100);
  return (
    <label class={'row mj-vol' + (props.on ? '' : ' is-off')}>
      <div class="row-main"><div class="row-title">{props.title}</div><div class="row-sub num">{props.on ? `${pct}%` : props.offNote}</div></div>
      <input
        class="mj-range"
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={!props.on}
        aria-label={props.title}
        aria-valuetext={`${pct}%`}
        onInput={(e) => props.onInput(Number(e.currentTarget.value) / 100)}
      />
    </label>
  );
}

/** 视野's three sizes (EngineSettings.view; missing = 中), each with its one plain line. */
type View = NonNullable<MirrorSettings['view']>;
export const VIEW_OPTS: readonly { v: View; zh: string; en: string; lineZh: string; lineEn: string }[] = [
  { v: 'near', zh: '近', en: 'Near', lineZh: '人物大，看得近（旧视野）', lineEn: 'Bigger figures, closer view (the old one)' },
  { v: 'mid', zh: '中', en: 'Middle', lineZh: '看得更远，远处的敌人也在画面里（推荐）', lineEn: 'See farther; enemies stay on screen (recommended)' },
  { v: 'far', zh: '远', en: 'Far', lineZh: '看得最远，人物更小', lineEn: 'See the most; smaller figures' },
];
/** The view in use: the saved one, or 中. */
export const viewNow = (s: Pick<MirrorSettings, 'view'>): View => (s.view === 'near' || s.view === 'far' ? s.view : 'mid');

/** The mirror's own settings (shared by the pause sheet and the lobby), with the app's two volumes. */
export function SettingsRows(props: { onChange?: (p: Partial<MirrorSettings>) => void }) {
  const t = useT();
  const s = mirror.value.settings;
  const app = state.value.settings;
  const os = osReduced();
  const calm = calmPref.value || os;
  const set = (p: Partial<MirrorSettings>) => { setMirrorSettings(p); props.onChange?.(p); };
  const seg = <V extends string | number>(label: string, value: V, opts: [V, string][], on: (v: V) => void) => (
    <div class="row">
      <div class="row-main"><div class="row-title">{label}</div></div>
      <div class="seg" role="group" aria-label={label}>
        {opts.map(([v, l]) => <button type="button" aria-pressed={v === value} onClick={() => on(v)}>{l}</button>)}
      </div>
    </div>
  );
  const view = viewNow(s);
  const viewOpt = VIEW_OPTS.find((o) => o.v === view)!;
  return (
    <div class="mj-settings">
      <div class="row mj-view-row">
        <div class="mj-view-head">
          <div class="row-title">{t('视野', 'View')}</div>
          <div class="seg" role="group" aria-label={t('视野', 'View')}>
            {VIEW_OPTS.map((o) => (
              <button type="button" data-view={o.v} aria-pressed={o.v === view} title={t(o.lineZh, o.lineEn)} onClick={() => set({ view: o.v })}>{t(o.zh, o.en)}</button>
            ))}
          </div>
        </div>
        <div class="row-sub">{t(`${viewOpt.zh}：${viewOpt.lineZh}`, `${viewOpt.en}: ${viewOpt.lineEn}`)}</div>
        <div class="row-sub mj-view-hint">{t('看不到远处射来的攻击时，调到「中」或「远」。', 'If attacks come from off the screen, pick Middle or Far.')}</div>
      </div>
      <VolumeRow title={t('音效', 'Sound effects')} value={app.volume} on={app.sound} offNote={t('音效已关（设置）', 'off in Settings')} onInput={(v) => setSettings({ volume: v })} />
      <VolumeRow title={t('乐声', 'Music volume')} value={app.musicVolume} on={app.music} offNote={t('背景乐已关（设置）', 'off in Settings')} onInput={(v) => setSettings({ musicVolume: v })} />
      {seg(t('瞄准', 'Aim'), s.aim, [['auto', t('自动', 'Auto')], ['manual', t('手瞄', 'Manual')]], (v) => set({ aim: v }))}
      {seg(t('伤害数字', 'Damage numbers'), s.nums, [[0, t('关', 'Off')], [1, t('暴击', 'Crits')], [2, t('全部', 'All')]], (v) => set({ nums: v }))}
      <div class="row">
        <div class="row-main"><div class="row-title">{t('震动', 'Vibration')}</div><div class="row-sub">{t('受击、击破精英与首领时手机轻震', 'A light buzz when you are hit, and on elite kills and boss blows (phones)')}</div></div>
        <Toggle checked={vibePref.value} onChange={setVibe} label={t('震动', 'Vibration')} />
      </div>
      <div class="row">
        <div class="row-main">
          <div class="row-title">{t('减少动态', 'Reduce motion')}</div>
          <div class="row-sub">{os ? t('系统已开启', 'On in your system settings') : t('少些闪动、震动与过场', 'Fewer flashes, shakes and transitions')}</div>
        </div>
        <Switch checked={calm} disabled={os} onChange={(v) => { setCalm(v); props.onChange?.({}); }} label={t('减少动态', 'Reduce motion')} />
      </div>
      <div class="row">
        <div class="row-main"><div class="row-title">{t('左手', 'Left-handed')}</div><div class="row-sub">{t('摇杆在右，技在左', 'Stick on the right, skill on the left')}</div></div>
        <Toggle checked={s.left} onChange={(v) => set({ left: v })} label={t('左手', 'Left-handed')} />
      </div>
      {seg(t('画质', 'Quality'), s.quality, [['auto', t('自动', 'Auto')], ['low', t('低', 'Low')], ['mid', t('中', 'Mid')], ['high', t('高', 'High')]], (v) => set({ quality: v }))}
      <p class="muted mj-settings-note">{t('画质在下一次入镜时生效；音量与「设置」相通。', 'Quality applies from the next time you enter; the volumes are the same as in Settings.')}</p>
    </div>
  );
}

export function PauseSheet(props: {
  open: boolean; run: RunSave; midWave: boolean; onResume: () => void; onLeave: () => void; onAbandon: () => void;
  onSettings: (p: Partial<MirrorSettings>) => void; confirm: 'leave' | 'abandon' | null; setConfirm: (c: 'leave' | 'abandon' | null) => void;
  /** Mid-wave: the HUD's last push (live HP, the skill, the marks) for the 人物 view. */
  live?: HudState | null;
  /** The tutorial's practice run: 「暂停 · 练习」, and one 「离开教程」 in place of 暂离 / 弃镜. */
  practice?: boolean;
}) {
  const t = useT();
  const { run } = props;
  const X = quoteNow(mirror.value, run, todayKey());
  const k = run.interruptions + 1;
  // every opening starts on 人物 (the HUD portrait and the 人物 key both land here)
  const [seg, setSeg] = useState<'who' | 'settings'>('who');
  useEffect(() => { if (props.open) setSeg('who'); }, [props.open]);
  const segs: ['who' | 'settings', string][] = [['who', termName('panel', t)], ['settings', t('设置', 'Settings')]];
  const onSegKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const next = seg === 'who' ? 'settings' : 'who';
    setSeg(next);
    (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-tut="seg:${next}"]`)?.focus();
  };
  const title = props.practice ? t('暂停 · 练习', 'Paused · practice') : termName('pause', t);
  return (
    <>
      <Sheet open={props.open && props.confirm === null} onClose={props.onResume} title={title} label={title}>
        <div class="mj-pausebody">
          <button type="button" class="btn btn-primary mj-big mj-wide" data-tut="resume" onClick={props.onResume}>{t('继续', 'Resume')}</button>
          <div class="seg mj-pause-seg" role="group" aria-label={t('暂停时看什么', 'Show')} onKeyDown={onSegKey}>
            {segs.map(([id, label]) => (
              <button type="button" data-tut={`seg:${id}`} aria-pressed={seg === id} onClick={() => setSeg(id)}>{label}</button>
            ))}
          </div>
          {seg === 'who'
            ? <CharacterPanel run={run} t={t} density="compact" live={props.midWave ? props.live ?? null : null} />
            : <SettingsRows onChange={props.onSettings} />}
          {props.practice ? (
            <div class="mj-row-actions mj-pause-exits" data-tut="pauseExit">
              <button type="button" class="btn" data-tut="leaveTutor" onClick={() => props.setConfirm('leave')}>{t('离开教程', 'Leave the tutorial')}</button>
            </div>
          ) : (
            <div class="mj-row-actions mj-pause-exits" data-tut="pauseExit">
              <button type="button" class="btn" onClick={() => (props.midWave ? props.setConfirm('leave') : props.onLeave())}>
                {termName('leave', t)}{!props.midWave && <small class="muted"> · {t('存档，不花钱', 'saved, free')}</small>}
              </button>
              <button type="button" class="btn btn-ghost mj-danger" onClick={() => props.setConfirm('abandon')}>{t('弃镜', 'Give up the run')}</button>
            </div>
          )}
        </div>
      </Sheet>
      {props.practice && (
        <Confirm
          open={props.open && props.confirm === 'leave'}
          title={t('离开教程', 'Leave the tutorial')}
          yes={t('离开', 'Leave')}
          onYes={props.onLeave}
          onNo={() => props.setConfirm(null)}
        >
          <p>{t('离开后，镜前点「教程」随时可以再来。', 'You can come back any time: tap Tutorial in front of the mirror.')}</p>
        </Confirm>
      )}
      <Confirm
        open={props.open && !props.practice && props.confirm === 'leave'}
        title={t('暂离', 'Step away')}
        yes={t('暂离', 'Step away')}
        onYes={props.onLeave}
        onNo={() => props.setConfirm(null)}
      >
        <p class="mj-confirm-big">{t(`这一重要重打 · 第 ${k}/3 次`, `This wave will replay · ${k} of 3`)}</p>
        <p>{t('这一重还没打完：回来时从这一重开头重新打。这一重捡的铜钱先不算，重打时还会再掉。中断到第三次，这一局就直接结算。', 'The wave is not won: you will replay it from the start. Coins picked up in it are not kept, and drop again. A third interruption ends the run.')}</p>
      </Confirm>
      <Confirm
        open={props.open && props.confirm === 'abandon'}
        title={t('弃镜', 'Give up the run')}
        yes={t('弃镜', 'Give it up')}
        danger
        onYes={props.onAbandon}
        onNo={() => props.setConfirm(null)}
      >
        <p class="mj-confirm-big">{t(`放弃这一局：按打完的 ${run.wave} 重结算，大约 ${X} 文`, `Give up the run: it is settled on ${run.wave} waves won, about ${X} coins`)}</p>
        {props.midWave && <p>{t('正在打的这一重不算，这一重捡的铜钱也会丢掉。', 'The wave in progress does not count, and the coins picked up in it are lost.')}</p>}
      </Confirm>
    </>
  );
}
