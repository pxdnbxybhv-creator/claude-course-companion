// A small paper card with one or two text fields (the homestead's name, a plaque's words, the two
// lines of a couplet). No window.prompt in a sandboxed frame: this is ours, mounted in the HUD.
import './build.css';
import type { WorldCtx } from '../../../types';

export interface Field { labelZh: string; labelEn: string; value: string; max: number; placeholder?: string }

/** Ask for words; resolves with the fields' values, or null when cancelled. */
export function askText(ctx: WorldCtx, o: { titleZh: string; titleEn: string; noteZh?: string; noteEn?: string; fields: Field[]; okZh?: string; okEn?: string }): Promise<string[] | null> {
  const t = (zh: string, en: string) => (ctx.lang === 'zh' ? zh : en);
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'hb-dlg-wrap';
    wrap.lang = ctx.lang;
    const form = document.createElement('form');
    form.className = 'hb-dlg';
    form.setAttribute('role', 'dialog');
    form.setAttribute('aria-modal', 'true');
    form.setAttribute('aria-label', t(o.titleZh, o.titleEn));
    const h = document.createElement('h3');
    h.className = 'hb-dlg-title';
    h.textContent = t(o.titleZh, o.titleEn);
    form.appendChild(h);
    if (o.noteZh) {
      const p = document.createElement('p');
      p.className = 'hb-dlg-note';
      p.textContent = t(o.noteZh, o.noteEn ?? o.noteZh);
      form.appendChild(p);
    }
    const inputs = o.fields.map((f) => {
      const lab = document.createElement('label');
      lab.className = 'hb-dlg-field';
      const s = document.createElement('span');
      s.textContent = t(f.labelZh, f.labelEn);
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = f.value;
      inp.maxLength = f.max;
      inp.placeholder = f.placeholder ?? '';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      lab.append(s, inp);
      form.appendChild(lab);
      return inp;
    });
    const row = document.createElement('div');
    row.className = 'hb-dlg-row';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'hb-pill is-quiet';
    cancel.textContent = t('取消', 'Cancel');
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'hb-pill is-ink';
    ok.textContent = t(o.okZh ?? '落款', o.okEn ?? 'Done');
    row.append(cancel, ok);
    form.appendChild(row);
    wrap.appendChild(form);
    let off: (() => void) | null = ctx.hud.mount(wrap);
    const done = (v: string[] | null) => {
      if (!off) return;
      off();
      off = null;
      window.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
      else e.stopPropagation(); // typing belongs to the card, not the walk or the builder
    };
    window.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => done(null));
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) done(null); });
    form.addEventListener('submit', (e) => { e.preventDefault(); done(inputs.map((i) => i.value.trim())); });
    requestAnimationFrame(() => { try { inputs[0]?.focus(); inputs[0]?.select(); } catch { /* ignore */ } });
  });
}
