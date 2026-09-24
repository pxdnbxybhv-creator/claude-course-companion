// Before lighting: how long, what for, and what to listen to.
import { useState } from 'preact/hooks';
import type { AmbientKind } from '../../core/types';
import { state } from '../../app/store';
import { useT } from '../../app/i18n';
import { chooseAmbient, lightIncense } from './session';
import { MAX_MINUTES, MIN_MINUTES, clampMinutes, INTENT_MAX } from './timer';

const PRESETS: { m: number; zh: string; en: string }[] = [
  { m: 15, zh: '一刻', en: 'quarter' },
  { m: 30, zh: '一炷香', en: 'a stick' },
  { m: 45, zh: '三刻', en: '¾ hour' },
  { m: 60, zh: '半个时辰', en: 'hour' },
];

export const AMBIENTS: { kind: AmbientKind; glyph: string; zh: string; en: string }[] = [
  { kind: 'none', glyph: '无', zh: '无声', en: 'Silence' },
  { kind: 'rain', glyph: '雨', zh: '夜雨', en: 'Rain' },
  { kind: 'stream', glyph: '溪', zh: '山溪', en: 'Stream' },
  { kind: 'pines', glyph: '松', zh: '松风', en: 'Pines' },
  { kind: 'qin', glyph: '琴', zh: '琴音', en: 'Guqin' },
];

export function AmbientPicker(props: { compact?: boolean }) {
  const t = useT();
  const cur = state.value.settings.ambient;
  return (
    <div class={'fx-amb' + (props.compact ? ' is-compact' : '')} role="radiogroup" aria-label={t('环境声', 'Ambient sound')}>
      {AMBIENTS.map((a) => (
        <button
          role="radio"
          aria-checked={cur === a.kind}
          class="fx-amb-btn"
          onClick={() => chooseAmbient(a.kind)}
          aria-label={t(a.zh, a.en)}
          title={t(a.zh, a.en)}
        >
          <span class="fx-amb-glyph brush" aria-hidden="true">{a.glyph}</span>
          <span class="fx-amb-cap" aria-hidden="true">{t(a.zh, a.en)}</span>
        </button>
      ))}
    </div>
  );
}

export function Setup(props: { minutes: number; onMinutes: (m: number) => void }) {
  const t = useT();
  const [intent, setIntent] = useState('');
  const isPreset = PRESETS.some((p) => p.m === props.minutes);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [draft, setDraft] = useState(String(props.minutes));
  const customActive = customOpen || !isPreset;

  const pick = (m: number) => {
    setCustomOpen(false);
    props.onMinutes(m);
  };
  const commitDraft = (v: string) => {
    setDraft(v);
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) props.onMinutes(clampMinutes(n));
  };
  const step = (d: number) => {
    const m = clampMinutes(props.minutes + d);
    props.onMinutes(m);
    setDraft(String(m));
  };
  const go = () => lightIncense(props.minutes, intent);

  return (
    <div class="fx-setup">
      <div class="fx-durs" role="radiogroup" aria-label={t('燃多久', 'How long')}>
        {PRESETS.map((p) => (
          <button role="radio" aria-checked={!customActive && props.minutes === p.m} class="fx-dur" onClick={() => pick(p.m)}>
            <span class="fx-dur-n num">{p.m}</span>
            <span class="fx-dur-l">{t(p.zh, p.en)}</span>
          </button>
        ))}
        <button
          role="radio"
          aria-checked={customActive}
          class="fx-dur"
          onClick={() => { setCustomOpen(true); setDraft(String(props.minutes)); }}
        >
          <span class="fx-dur-n num">{customActive ? props.minutes : '·'}</span>
          <span class="fx-dur-l">{t('自定', 'custom')}</span>
        </button>
      </div>

      {customActive && (
        <div class="fx-custom">
          <button class="btn btn-icon fx-step" onClick={() => step(props.minutes > 10 ? -5 : -1)} aria-label={t('少一些', 'Less')} disabled={props.minutes <= MIN_MINUTES}>−</button>
          <label class="fx-custom-field">
            <input
              class="num"
              type="number"
              inputMode="numeric"
              min={MIN_MINUTES}
              max={MAX_MINUTES}
              value={draft}
              aria-label={t('分钟（1–180）', 'Minutes (1–180)')}
              onInput={(e) => commitDraft((e.target as HTMLInputElement).value)}
              onBlur={() => setDraft(String(props.minutes))}
            />
            <span>{t('分钟', 'min')}</span>
          </label>
          <button class="btn btn-icon fx-step" onClick={() => step(props.minutes >= 10 ? 5 : 1)} aria-label={t('多一些', 'More')} disabled={props.minutes >= MAX_MINUTES}>+</button>
        </div>
      )}

      <label class="fx-intent">
        <span class="visually-hidden">{t('此香为何而燃', 'What is this incense for?')}</span>
        <input
          class="input"
          type="text"
          maxLength={INTENT_MAX}
          enterKeyHint="go"
          placeholder={t('此香为何而燃', 'What is this incense for?')}
          value={intent}
          onInput={(e) => setIntent((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) go(); }}
        />
      </label>

      <AmbientPicker />

      <button class="btn btn-primary fx-light" onClick={go}>
        <span class="fx-light-glyph brush" aria-hidden="true">燃</span>
        {t('燃香', 'Light the incense')}
      </button>
    </div>
  );
}
