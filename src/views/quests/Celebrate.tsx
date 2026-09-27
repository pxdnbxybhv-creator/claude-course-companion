// 贺 — announces a finished quest anywhere in the app. Watches play.celebrations; when a quest is
// done, a leaf of xuan paper bleeds in like ink dropped on paper: a new companion's portrait on a
// spreading wash (with 「与之同游」), or a seal slamming down with a wooden thud. Tap, Esc or ~6 s
// dismiss it; several finish at once → shown one after another. Renders nothing when idle.
// A companion who came in a letter (`gift:<letter id>`, e.g. 「初见礼 · 玉兔」) is announced the same way.
import { useEffect, useRef, useState } from 'preact/hooks';
import { celebrations, nextCelebration, questCoins, selectCharacter } from '../../app/play';
import { CoinIcon, fmtCoins } from '../../ui/coins';
import { go, route } from '../../app/router';
import { useT } from '../../app/i18n';
import { lang } from '../../app/store';
import { audio } from '../../audio/engine';
import { QUEST, type QuestDef } from '../../data/quests';
import { CHARACTER, type CharacterDef } from '../../data/characters';
import { LETTER } from '../../data/letters';
import { hashString, makeRng } from '../../core/rng';
import { Portrait, Seal } from './bits';
import { paintBloom, paintPaper, dprOf } from './paint';
import { albumRequest, sealLook } from './helpers';
import './celebrate.css';

const SHOW_MS = 6500;
const reducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const isVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
/** How long a card ignores taps on its buttons and backdrop: the tail of whatever tap finished the quest. */
const ARM_MS = 500;

// The open card's keyboard handler. Registered on window (capture) when this module loads, i.e.
// before any view's own capture listeners, so stopImmediatePropagation really keeps keys from the
// world behind the veil (movement, jump, E, the minigames' Esc).
let modalKeys: ((e: KeyboardEvent) => void) | null = null;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => modalKeys?.(e), true);

let seq = 0;

/** What a celebration id stands for: a quest, or a letter's gift (its coins came with the letter). */
interface Occasion { q: QuestDef; coins: number; letter?: { zh: string; en: string } }
function occasion(id: string): Occasion | null {
  if (QUEST[id]) return { q: QUEST[id], coins: questCoins(QUEST[id]) };
  if (!id.startsWith('gift:')) return null;
  const l = LETTER[id.slice(5)];
  const who = l?.attach?.character;
  if (!l || !who || !CHARACTER[who]) return null;
  const q: QuestDef = {
    id, zh: l.subject.zh, en: l.subject.en, descZh: '', descEn: '', hintZh: '', hintEn: '',
    goal: { kind: 'flag', key: `mail:${l.id}` }, reward: { character: who },
  };
  return { q, coins: Math.max(0, Math.floor(l.attach?.coins ?? 0)), letter: l.from };
}

export function Celebrate() {
  const pending = celebrations.value.length;
  const [cur, setCur] = useState<{ id: string; key: number } | null>(null);
  // a quest that finishes in a background tab (incense burning out) waits until the tab is seen
  const [visible, setVisible] = useState(isVisible);
  useEffect(() => {
    const on = () => setVisible(isVisible());
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  useEffect(() => {
    if (cur || !pending || !visible) return;
    // A breath first, so the moment that finished the quest (a solved puzzle, a caught fish) is seen.
    const tm = setTimeout(() => {
      let id = nextCelebration();
      while (id && !occasion(id)) id = nextCelebration();
      if (id) setCur({ id, key: ++seq });
    }, seq === 0 ? 700 : 450);
    return () => clearTimeout(tm);
  }, [cur, pending, visible]);
  const o = cur ? occasion(cur.id) : null;
  if (!cur || !o) return null;
  return <Card key={cur.key} q={o.q} coins={o.coins} letter={o.letter} onGone={() => setCur(null)} />;
}

function Card(props: { q: QuestDef; coins: number; letter?: { zh: string; en: string }; onGone: () => void }) {
  const { q, letter } = props;
  const t = useT();
  const zh = lang.value === 'zh';
  const reduced = useRef(reducedMotion()).current;
  const companion: CharacterDef | null = 'character' in q.reward ? CHARACTER[q.reward.character] ?? null : null;
  const sealText = 'seal' in q.reward ? q.reward.seal : null;
  const [out, setOut] = useState(false);
  const [stamped, setStamped] = useState(false);
  const [paused, setPaused] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLCanvasElement>(null);
  const bloom = useRef<HTMLCanvasElement>(null);
  const shownAt = useRef(0); // set when the card is first actually seen
  const armed = () => shownAt.current > 0 && performance.now() - shownAt.current >= ARM_MS;
  const closing = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => void timers.current.push(setTimeout(fn, ms));
  // things that must wait until the page is visible (the clock, the sounds)
  const onShown = useRef<(() => void)[]>([]);
  const whenVisible = (fn: () => void) => (isVisible() ? fn() : void onShown.current.push(fn));

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    setOut(true);
    later(props.onGone, reduced ? 160 : 420);
  };

  // auto-dismiss, paused while hovered / focused / the page is hidden
  const clock = useRef({ left: SHOW_MS, since: 0, tm: 0 as unknown as ReturnType<typeof setTimeout>, running: false });
  const held = useRef({ hover: false, focus: false });
  const resume = () => {
    const c = clock.current;
    if (c.running || closing.current || !isVisible() || held.current.hover || held.current.focus) return;
    c.running = true;
    c.since = performance.now();
    c.tm = setTimeout(close, Math.max(400, c.left));
    setPaused(false);
  };
  const pause = () => {
    const c = clock.current;
    if (!c.running) return;
    c.running = false;
    clearTimeout(c.tm);
    c.left -= performance.now() - c.since;
    setPaused(true);
  };

  useEffect(() => {
    const el = root.current;
    const prev = document.activeElement as HTMLElement | null;
    el?.focus({ preventScroll: true });
    const shown = () => {
      if (!shownAt.current) shownAt.current = performance.now();
      onShown.current.splice(0).forEach((fn) => fn());
      resume();
    };
    const onVis = () => (isVisible() ? shown() : pause());
    document.addEventListener('visibilitychange', onVis);
    if (isVisible()) shown();
    else setPaused(true);

    // a modal: keys stay with the card. Esc closes, Tab cycles its buttons, Enter/Space still press
    // the focused button (their default action), and nothing reaches the page or the world behind.
    // keyup passes, so a movement key held before the card opened is still released.
    const SCROLL = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'];
    modalKeys = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === 'Escape' || e.code === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const btns = [...(el?.querySelectorAll<HTMLButtonElement>('.cel-actions button') ?? [])];
        if (!btns.length) return;
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = i < 0 ? (e.shiftKey ? btns.length - 1 : 0) : (i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length;
        btns[next].focus();
        return;
      }
      const onButton = (e.target as HTMLElement | null)?.closest?.('.cel button');
      if (!onButton && SCROLL.includes(e.code)) e.preventDefault();
    };
    const mine = modalKeys;
    // sound: a guqin flourish for a new friend; a thud and a small chime for a seal (see the slam)
    if (companion) whenVisible(() => later(() => audio.chime(q.id === 'q-all' ? 21 : 7), reduced ? 60 : 380));
    return () => {
      if (modalKeys === mine) modalKeys = null;
      document.removeEventListener('visibilitychange', onVis);
      clearTimeout(clock.current.tm);
      timers.current.forEach(clearTimeout);
      onShown.current = [];
      if (prev && prev.isConnected && el && el.contains(document.activeElement)) prev.focus?.({ preventScroll: true });
    };
  }, []);

  // paint the paper leaf and the ink bloom — sized from layout (the bloom is still scaled down by its
  // entrance animation at this moment, so its bounding rect would be about a third of its size)
  useEffect(() => {
    const dpr = Math.min(2, dprOf());
    const pc = paper.current;
    if (pc) {
      pc.width = Math.max(1, Math.round((pc.offsetWidth || 360) * dpr));
      pc.height = Math.max(1, Math.round((pc.offsetHeight || 520) * dpr));
      try { paintPaper(pc, 41); } catch { /* the css paper colour shows */ }
    }
    const bc = bloom.current;
    if (bc) {
      bc.width = Math.max(1, Math.round((bc.offsetWidth || 300) * dpr));
      bc.height = Math.max(1, Math.round((bc.offsetHeight || 300) * dpr));
      try { paintBloom(bc, hashString(q.id), companion?.id === 'change' || companion?.id === 'rabbit'); } catch { /* no bloom */ }
    }
  }, []);

  const onStampReady = () => {
    whenVisible(() => {
      // let the paper bleed in before the seal comes down
      const wait = reduced ? 0 : Math.max(0, 520 - (performance.now() - shownAt.current));
      later(() => {
        setStamped(true);
        const impact = reduced ? 0 : 300;
        later(() => audio.knock(), impact);
        later(() => audio.chime(1), impact + 160);
      }, wait);
    });
  };

  const onBackdrop = (e: MouseEvent) => {
    // ignore the tail of whatever tap finished the quest
    if (!armed()) return;
    if ((e.target as HTMLElement).closest('button')) return;
    close();
  };

  const walk = (e: MouseEvent) => {
    e.stopPropagation();
    if (!armed()) return;
    if (!companion) return close();
    selectCharacter(companion.id);
    close();
    if (route.value !== 'walk') go('walk', e);
  };
  const album = (e: MouseEvent) => {
    e.stopPropagation();
    if (!armed()) return;
    close();
    if (route.value !== 'quests') {
      albumRequest.pending = true;
      go('quests', e);
    } else document.getElementById('album')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  const later2 = (e: MouseEvent) => {
    e.stopPropagation();
    if (!armed()) return;
    close();
  };
  const inLeaf = (n: EventTarget | null) => !!(n && leaf.current?.contains(n as Node));
  const onEnter = () => { held.current.hover = true; pause(); };
  const onLeave = () => { held.current.hover = false; resume(); };
  const onFocusIn = () => { held.current.focus = true; pause(); };
  const onFocusOut = (e: FocusEvent) => {
    if (inLeaf(e.relatedTarget)) return;
    held.current.focus = false;
    resume();
  };

  const petals = useRef(makePetals(q.id)).current;

  return (
    <div
      ref={root}
      class={'cel' + (out ? ' is-out' : '') + (reduced ? ' is-reduced' : '') + (paused ? ' is-paused' : '') + (stamped ? ' is-stamped' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cel-title"
      aria-describedby="cel-desc"
      tabIndex={-1}
      onClick={onBackdrop}
    >
      <div class="cel-veil" aria-hidden="true" />
      <div ref={leaf} class={'cel-leaf' + (companion ? ' is-companion' : ' is-seal')} onMouseEnter={onEnter} onMouseLeave={onLeave} onFocusIn={onFocusIn} onFocusOut={onFocusOut}>
        <canvas ref={paper} class="cel-paper" aria-hidden="true" />
        <div class="cel-frame" aria-hidden="true" />
        {companion && !reduced && (
          <div class="cel-petals" aria-hidden="true">
            {petals.map((p, i) => <i key={i} style={p} />)}
          </div>
        )}
        <p class="cel-kicker">{letter ? t(`来信 · ${letter.zh}`, `A letter · ${letter.en}`) : t('任务完成', 'Quest complete')}</p>
        <h2 id="cel-title" class={'cel-quest ' + (zh ? 'brush' : 'latin')}>
          {zh ? (letter && companion ? `「${q.zh} · ${companion.zh}」` : `「${q.zh}」`) : letter && companion ? `${q.en} · ${companion.en}` : q.en}
        </h2>

        {companion ? (
          <>
            <div class="cel-stage">
              <canvas ref={bloom} class="cel-bloom" aria-hidden="true" />
              <div class="cel-fan"><Portrait id={companion.id} locked={false} size={164} eager /></div>
            </div>
            <p class="cel-new">{t('新同伴', 'A new companion')}</p>
            <div class="cel-names">
              <span class={'cel-name ' + (zh ? 'brush' : 'latin')}>{zh ? companion.zh : companion.en}</span>
              <span class={'cel-name2 ' + (zh ? 'latin' : 'brush')}>{zh ? companion.en : companion.zh}</span>
            </div>
            <p class="cel-title">「{t(companion.titleZh, companion.titleEn)}」</p>
            <p id="cel-desc" class="cel-ability"><span aria-hidden="true">◈ </span>{t(companion.abilityZh, companion.abilityEn)}</p>
            {companion.skill && (
              <p class="cel-skill"><b aria-hidden="true">{companion.skill.glyph}</b>{t(`技 · ${companion.skill.zh}`, `Skill · ${companion.skill.en}`)}</p>
            )}
            {props.coins > 0 && (
              <p class="cel-coins"><CoinIcon size={16} />{letter ? t(`随信 ${fmtCoins(props.coins)} 文`, `${fmtCoins(props.coins)} coins enclosed`) : t(`赏钱 ${fmtCoins(props.coins)} 文`, `${fmtCoins(props.coins)} coins`)}</p>
            )}
            <div class="cel-actions">
              <button type="button" class="cel-btn is-seal" onClick={walk}>{t('与之同游', 'Walk together')}</button>
              <button type="button" class="cel-btn" onClick={later2}>{t('稍后', 'Later')}</button>
            </div>
          </>
        ) : (
          <>
            <div class="cel-stage is-seal">
              <div class="cel-stamp"><Seal text={sealText ?? '印'} size={128} earned onReady={onStampReady} /></div>
              <div class={'cel-ring is-' + sealLook(sealText ?? '印').shape} aria-hidden="true" />
            </div>
            <p id="cel-desc" class="cel-sealnote">
              {t(`得印「${sealText ?? ''}」，已收入印谱。`, `Seal earned: ${'seal' in q.reward ? q.reward.sealEn : ''}. Added to your album.`)}
            </p>
            <p class="cel-coins"><CoinIcon size={16} />{t(`赏钱 ${fmtCoins(props.coins)} 文`, `${fmtCoins(props.coins)} coins`)}</p>
            <div class="cel-actions">
              <button type="button" class="cel-btn is-seal" onClick={album}>{t('翻看印谱', 'Open the album')}</button>
              <button type="button" class="cel-btn" onClick={later2}>{t('好', 'OK')}</button>
            </div>
          </>
        )}
        <p class="cel-dismiss" aria-hidden="true">{t('轻触任意处关闭', 'Tap anywhere to close')}</p>
        <div class="cel-timer" aria-hidden="true"><i style={{ animationDuration: SHOW_MS + 'ms' }} /></div>
      </div>
    </div>
  );
}

/** A few rouge petals drifting across the leaf (deterministic per quest). */
function makePetals(id: string): Record<string, string>[] {
  const rng = makeRng(hashString('petals:' + id));
  return Array.from({ length: 9 }, () => ({
    left: `${Math.round(4 + rng() * 88)}%`,
    animationDelay: `${Math.round(500 + rng() * 2200)}ms`,
    animationDuration: `${Math.round(3200 + rng() * 2400)}ms`,
    '--drift': `${Math.round(-40 + rng() * 80)}px`,
    '--spin': `${Math.round(90 + rng() * 360)}deg`,
    '--s': (0.7 + rng() * 0.7).toFixed(2),
  }));
}
