// While the stick burns: the remaining time, the intention, pause / put out.
import { useState } from 'preact/hooks';
import { useT } from '../../app/i18n';
import { Sheet } from '../../ui/kit';
import { active, answerNotify, extinguish, notifyAsk, now, togglePause } from './session';
import { cnRemaining, elapsedMs, enRemaining, formatClock, remainingMs } from './timer';
import { AmbientPicker } from './Setup';

export function Burning() {
  const t = useT();
  const s = active.value;
  const n = now.value;
  const [confirm, setConfirm] = useState(false);
  if (!s) return null;
  const rem = remainingMs(s, n);
  const paused = s.pausedAt !== null;
  const burnedMin = Math.floor(elapsedMs(s, n) / 60_000);
  const clock = formatClock(rem);
  const reading = t(cnRemaining(rem), enRemaining(rem));

  return (
    <div class={'fx-burning' + (paused ? ' is-paused' : '')}>
      <div class="fx-clock" role="timer" aria-label={`${clock} · ${reading}` + (paused ? t('（已暂停）', ' (paused)') : '')}>
        <div class="fx-time num" aria-hidden="true">{clock}</div>
        <div class="fx-reading" aria-hidden="true">
          {paused ? t('香已暂熄 · 静候片刻', 'Paused — the ember rests') : reading}
        </div>
        {s.intent && (
          <div class="fx-for">{t(`此香为「${s.intent}」而燃`, `For: ${s.intent}`)}</div>
        )}
      </div>

      <div class="fx-actions">
        <button class={'btn ' + (paused ? 'btn-primary' : '')} onClick={togglePause} aria-pressed={paused}>
          {paused ? t('继续', 'Resume') : t('暂停', 'Pause')}
        </button>
        <button class="btn btn-ghost fx-out" onClick={() => setConfirm(true)}>{t('熄灭', 'Put out')}</button>
      </div>

      <AmbientPicker compact />

      {notifyAsk.value && (
        <div class="fx-ask" role="note">
          <p>{t('香燃尽时，要轻声提醒你吗？', 'Shall I let you know when the incense burns out?')}</p>
          <div class="fx-ask-btns">
            <button class="btn btn-small" onClick={() => answerNotify(true)}>{t('好', 'Yes, please')}</button>
            <button class="btn btn-small btn-ghost" onClick={() => answerNotify(false)}>{t('不必', 'No thanks')}</button>
          </div>
        </div>
      )}

      <Sheet open={confirm} onClose={() => setConfirm(false)} label={t('熄灭这炷香？', 'Put out this incense?')} title={t('熄灭这炷香？', 'Put out this incense?')}>
        <p class="fx-confirm-body">
          {t(
            `已燃 ${burnedMin} 分钟，还剩 ${Math.ceil(rem / 60_000)} 分钟。熄灭后，这炷香记为未燃尽。`,
            `${burnedMin} of ${s.minutes} minutes burned. It will be logged as unfinished.`,
          )}
        </p>
        <div class="fx-confirm-btns">
          <button class="btn btn-primary" onClick={() => setConfirm(false)} autoFocus>{t('继续燃', 'Keep burning')}</button>
          <button class="btn fx-out" onClick={() => { setConfirm(false); extinguish(); }}>{t('熄灭', 'Put it out')}</button>
        </div>
      </Sheet>
    </div>
  );
}
