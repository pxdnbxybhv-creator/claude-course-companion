// Before lighting: how long, what for, and what to listen to.
import { useState } from 'preact/hooks';
import type { AmbientKind } from '../../core/types';
import { activeHabits, state, today } from '../../app/store';
import { statsFor } from '../../core/habits';
import { PlantGlyph, Sheet } from '../../ui/kit';
import { revealStage } from './reveal';
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
    <div class={'fx-amb' + (props.compact ? ' is-compact' : '')} role="group" aria-label={t('环境声', 'Ambient sound')}>
      {AMBIENTS.map((a) => (
        <button
          aria-pressed={cur === a.kind}
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

const rank = (st: { doneToday: boolean; scheduledToday: boolean }) => (st.doneToday ? 2 : st.scheduledToday ? 0 : 1);

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
  const [habitId, setHabitId] = useState<string | null>(null);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const habits = activeHabits.value;
  const habit = habits.find((h) => h.id === habitId) ?? null;

  const chooseHabit = (id: string | null) => {
    const prev = habit;
    const next = habits.find((h) => h.id === id) ?? null;
    setHabitId(next ? next.id : null);
    setHabitsOpen(false);
    // The habit's name becomes the intention unless the user wrote their own.
    if (!intent.trim() || (prev && intent === prev.name)) setIntent(next ? next.name : '');
  };

  const go = (byKeyboard: boolean) => {
    revealStage({ blur: true });
    lightIncense(props.minutes, intent, byKeyboard, habit?.id);
  };

  return (
    <div class="fx-setup">
      <div class="fx-durs" role="group" aria-label={t('燃多久', 'How long')}>
        {PRESETS.map((p) => (
          <button aria-pressed={!customActive && props.minutes === p.m} class="fx-dur" onClick={() => pick(p.m)} aria-label={t(`${p.zh}，${p.m} 分钟`, `${p.m} minutes`)}>
            <span class="fx-dur-n num">{p.m}</span>
            <span class="fx-dur-l">{t(p.zh, p.en)}</span>
          </button>
        ))}
        <button
          aria-pressed={customActive}
          aria-label={t('自定时长', 'Custom length')}
          class="fx-dur"
          onClick={() => { setCustomOpen(true); setDraft(String(props.minutes)); }}
        >
          <span class="fx-dur-n num">{customActive ? props.minutes : '…'}</span>
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

      <div class="fx-intent-row">
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
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.isComposing) go(true); }}
        />
      </label>
      {habits.length > 0 && (
        <button
          class={'fx-habit-btn' + (habit ? ' is-set' : '')}
          onClick={() => setHabitsOpen(true)}
          aria-haspopup="dialog"
          aria-label={habit ? t(`为「${habit.name}」而燃，更改`, `For habit “${habit.name}” — change`) : t('为哪一株而燃', 'For which habit?')}
        >
          {habit ? <PlantGlyph kind={habit.plant} size={26} /> : <span class="fx-habit-glyph brush" aria-hidden="true">株</span>}
          <span class="fx-habit-cap" aria-hidden="true">{habit ? t('已系', 'linked') : t('系一株', 'habit')}</span>
        </button>
      )}
      </div>

      <Sheet open={habitsOpen} onClose={() => setHabitsOpen(false)} title={t('为哪一株而燃', 'For which habit?')} label={t('为哪一株而燃', 'For which habit?')}>
        <p class="fx-habit-note">{t('燃尽这炷香，便为它记下今日。', 'Burn this stick through and the habit is checked off for today.')}</p>
        <ul class="fx-habit-list">
          {habits
            .map((h) => ({ h, st: statsFor(h, state.value.checkins[h.id] ?? [], today.value) }))
            // Due and not yet done first; done today last.
            .sort((a, b) => rank(a.st) - rank(b.st))
            .map(({ h, st }) => {
            return (
              <li>
                <button class="fx-habit-row" aria-pressed={h.id === habitId} onClick={() => chooseHabit(h.id)}>
                  <PlantGlyph kind={h.plant} size={36} />
                  <span class="fx-habit-name">{h.name}</span>
                  <span class="fx-habit-state">
                    {st.doneToday ? t('今日已完成', 'done today') : st.scheduledToday ? t('今日待做', 'due today') : t('今日不必', 'not due')}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button class="fx-habit-row" aria-pressed={!habitId} onClick={() => chooseHabit(null)}>
              <span class="fx-habit-none brush" aria-hidden="true">无</span>
              <span class="fx-habit-name">{t('不系于习惯', 'No habit')}</span>
            </button>
          </li>
        </ul>
      </Sheet>

      <AmbientPicker />

      <button class="btn btn-seal fx-light" onClick={(e) => go(e.detail === 0)}>
        {t('燃香', 'Light the incense')}
      </button>
    </div>
  );
}
