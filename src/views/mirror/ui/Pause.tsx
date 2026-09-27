// 水月幻镜 · pause (GDD §18.9): resume, settings, the build so far, 暂离 and 弃镜. Mid-wave 暂离 warns
// first (「此重将重来 · 第 k/3 次」); 弃镜 always confirms with what 镜碎 would pay now. No confirm():
// every question is a Sheet.
import type { ComponentChildren } from 'preact';
import { useT } from '../../../app/i18n';
import { mirror } from '../../../app/mirror';
import { setSettings, state } from '../../../app/store';
import { todayKey } from '../../../core/date';
import { Sheet, Toggle } from '../../../ui/kit';
import { quoteNow } from '../logic';
import { setMirrorSettings } from '../logic/session';
import type { MirrorSettings, RunSave } from '../types';
import { BuildRow } from './Shop';
import { calmPref, osReduced, setCalm } from './prefs';

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
  return (
    <div class="mj-settings">
      <VolumeRow title={t('音效', 'Sound effects')} value={app.volume} on={app.sound} offNote={t('音效已关（设置）', 'off in Settings')} onInput={(v) => setSettings({ volume: v })} />
      <VolumeRow title={t('乐声', 'Music volume')} value={app.musicVolume} on={app.music} offNote={t('背景乐已关（设置）', 'off in Settings')} onInput={(v) => setSettings({ musicVolume: v })} />
      {seg(t('瞄准', 'Aim'), s.aim, [['auto', t('自动', 'Auto')], ['manual', t('手瞄', 'Manual')]], (v) => set({ aim: v }))}
      {seg(t('伤害数字', 'Damage numbers'), s.nums, [[0, t('关', 'Off')], [1, t('暴击', 'Crits')], [2, t('全部', 'All')]], (v) => set({ nums: v }))}
      <div class="row">
        <div class="row-main"><div class="row-title">{t('震屏', 'Screen shake')}</div><div class="row-sub">{t('减少动态时总是关闭', 'Always off with reduced motion')}</div></div>
        <Switch checked={s.shake && !calm} disabled={calm} onChange={(v) => set({ shake: v })} label={t('震屏', 'Screen shake')} />
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
}) {
  const t = useT();
  const { run } = props;
  const X = quoteNow(mirror.value, run, todayKey());
  const k = run.interruptions + 1;
  return (
    <>
      <Sheet open={props.open && props.confirm === null} onClose={props.onResume} title={t('镜中暂歇', 'Paused')} label={t('暂停', 'Pause')}>
        <div class="mj-pausebody">
          <button type="button" class="btn btn-primary mj-big mj-wide" onClick={props.onResume}>{t('继续', 'Resume')}</button>
          <h3 class="mj-h3">{t('此照行装', 'Your build')}</h3>
          <BuildRow run={run} t={t} px={30} />
          <h3 class="mj-h3">{t('设置', 'Settings')}</h3>
          <SettingsRows onChange={props.onSettings} />
          <div class="mj-row-actions mj-pause-exits">
            <button type="button" class="btn" onClick={() => (props.midWave ? props.setConfirm('leave') : props.onLeave())}>
              {t('暂离', 'Step away')}{!props.midWave && <small class="muted"> · {t('存档，不花钱', 'saved, free')}</small>}
            </button>
            <button type="button" class="btn btn-ghost mj-danger" onClick={() => props.setConfirm('abandon')}>{t('弃镜', 'Give up the run')}</button>
          </div>
        </div>
      </Sheet>
      <Confirm
        open={props.open && props.confirm === 'leave'}
        title={t('暂离', 'Step away')}
        yes={t('暂离', 'Step away')}
        onYes={props.onLeave}
        onNo={() => props.setConfirm(null)}
      >
        <p class="mj-confirm-big brush">{t(`此重将重来 · 第 ${k}/3 次`, `This wave will replay · ${k} of 3`)}</p>
        <p>{t('此重未破，回来时从这一重之前重新开始；袖中铜钱不计，届时照样再落。第三次中断即以镜碎结算。', 'The wave is not won: you will replay it from just before; coins picked up now are not banked, and fall again. A third interruption settles the run as broken.')}</p>
      </Confirm>
      <Confirm
        open={props.open && props.confirm === 'abandon'}
        title={t('弃镜', 'Give up the run')}
        yes={t('弃镜', 'Give it up')}
        danger
        onYes={props.onAbandon}
        onNo={() => props.setConfirm(null)}
      >
        <p class="mj-confirm-big brush">{t(`弃镜即镜碎：结算已过 ${run.wave} 重，约 ${X} 文`, `Giving up breaks the glass: settle ${run.wave} waves, about ${X} coins`)}</p>
        {props.midWave && <p>{t('此重未破，不计；袖中铜钱随镜沉池。', 'This wave is not won and does not count; the coins in your sleeve sink with the glass.')}</p>}
      </Confirm>
    </>
  );
}
