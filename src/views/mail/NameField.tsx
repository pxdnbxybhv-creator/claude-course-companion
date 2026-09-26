// 名号 · the one field where the player writes what they are called: in the 初见礼 letter, in the
// name sheet (askName) and in Settings. IME-safe: nothing is cleaned or cut while a composition is
// open (pinyin, kana…), only when it ends, on blur, or on commit. No maxLength (an IME would be
// cut off mid-word): the count shows instead, and cleanName keeps the first twelve on commit.
// The name is drawn in the text face (WenKai), never in the brush.
import { useEffect, useRef } from 'preact/hooks';
import { useT } from '../../app/i18n';
import { NAME_MAX } from '../../core/names';

export function NameField(props: {
  id: string;
  value: string;
  label: string;
  hint?: string;
  /** Every keystroke (the raw text, composition included). */
  onDraft(v: string): void;
  /** Settled text: after a keystroke outside a composition, when one ends, and on blur (`final`). */
  onCommit?(v: string, final: boolean): void;
  /** Enter, outside a composition. */
  onEnter?(): void;
  autoFocus?: boolean;
  class?: string;
}) {
  const t = useT();
  const composing = useRef(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!props.autoFocus) return;
    // after the sheet's own focus (it focuses itself when it opens)
    const tm = setTimeout(() => ref.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(tm);
  }, []);
  const typed = Array.from(props.value.trim()).length;
  const over = typed > NAME_MAX;
  return (
    <label class={'field mail-name' + (props.class ? ' ' + props.class : '')}>
      <span>{props.label}</span>
      <span class="mail-name-row">
        <input
          ref={ref}
          id={props.id}
          type="text"
          value={props.value}
          placeholder={t('园主', 'friend')}
          autocomplete="off"
          autocapitalize="words"
          spellcheck={false}
          enterKeyHint="done"
          aria-describedby={props.hint ? `${props.id}-hint` : undefined}
          onInput={(e) => {
            const v = e.currentTarget.value;
            props.onDraft(v);
            if (!composing.current) props.onCommit?.(v, false);
          }}
          onCompositionStart={() => (composing.current = true)}
          onCompositionEnd={(e) => {
            composing.current = false;
            const v = e.currentTarget.value;
            props.onDraft(v);
            props.onCommit?.(v, false);
          }}
          onBlur={(e) => { if (!composing.current) props.onCommit?.(e.currentTarget.value, true); }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.isComposing || composing.current || e.keyCode === 229) return;
            e.preventDefault();
            props.onEnter?.();
          }}
        />
        <small class={'mail-name-count num' + (over ? ' is-over' : '')} aria-hidden="true">{Math.min(typed, 99)}/{NAME_MAX}</small>
      </span>
      {props.hint && <small id={`${props.id}-hint`} class="mail-name-hint">{props.hint}</small>}
    </label>
  );
}
