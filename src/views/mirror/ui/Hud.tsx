// 水月幻镜 · the in-wave HUD (GDD §18.4) and the touch controls (§19). The HUD is written through refs
// at the engine's ≈8 Hz push, never through Preact state per frame. The stick floats wherever the
// thumb lands in the left 60% (mirrored when left-handed); the 72 px 技 button casts on a tap,
// aims on a drag and cancels when dragged back; with 手瞄 on a touch screen the other side is an aim stick.
import { useEffect, useRef } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { armorReduction, fmtBig } from '../logic';
import { COMPANION_REG, SKILL_REG, type SkillId } from '../ids';
import type { CharacterId, Engine, HudState } from '../types';
import { termLine, termName } from '../data/glossary';
import { Portrait } from './icons';
import { bossName, fmtClock, skillDrag, stickSettle, stickVector, STICK_R } from './text';

/** The HUD's armour line names what is reduced: 「少受伤 6%」 (a bare 「少受 6%」 has no noun here). */
const hudArmour = (r: number, t: (zh: string, en: string) => string) => (r >= 0 ? t(`少受伤 ${r}%`, `${r}% less damage`) : t(`多受伤 ${-r}%`, `${-r}% more damage`));

export interface HudApi {
  push(s: HudState): void;
  /** The last push (the pause sheet's 「此刻」: live HP, the skill's readiness, the marks). */
  last(): HudState | null;
  levelUp(level: number): void;
  crate(total: number): void;
  coin(sleeve: number): void;
}

const RING = 2 * Math.PI * 31;

/** An attribute value with its quotes escaped (the marks are written as HTML at the push rate). */
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function Hud(props: {
  api: { current: HudApi | null }; onPause: () => void; wave: number; skill: SkillId; showSleeve: boolean; armor: number;
  /** The companion (the portrait); defaults to the skill's owner. */
  char?: CharacterId;
  /** The portrait button: Run passes pause, and the pause sheet opens on 人物. Defaults to onPause. */
  onWho?: () => void;
}) {
  const t = useT();
  const root = useRef<HTMLDivElement>(null);
  const hpBar = useRef<HTMLElement>(null);
  const hpText = useRef<HTMLElement>(null);
  const shield = useRef<HTMLElement>(null);
  const moon = useRef<HTMLElement>(null);
  const sleeve = useRef<HTMLElement>(null);
  const sleeveN = useRef<HTMLElement>(null);
  const xp = useRef<HTMLElement>(null);
  const lvl = useRef<HTMLElement>(null);
  const waveEl = useRef<HTMLElement>(null);
  const timer = useRef<HTMLElement>(null);
  const boss = useRef<HTMLDivElement>(null);
  const bossBar = useRef<HTMLElement>(null);
  const bossLabel = useRef<HTMLElement>(null);
  const marks = useRef<HTMLDivElement>(null);
  const crates = useRef<HTMLElement>(null);
  const last = useRef({ hp: '', moon: -1, time: '', lvl: -1, boss: '', marks: '' });
  const lastState = useRef<HudState | null>(null);
  const char: CharacterId = props.char ?? (SKILL_REG.find((x) => x.id === props.skill)?.char as CharacterId | undefined) ?? 'scholar';
  const who = COMPANION_REG.find((c) => c.id === char);

  useEffect(() => {
    const lng = () => (lang.value === 'en' ? 'en' : 'zh');
    props.api.current = {
      last() { return lastState.current; },
      push(s) {
        lastState.current = s;
        const L = last.current;
        const hpMax = Math.max(1, s.hpMax);
        const frac = Math.max(0, Math.min(1, s.hp / hpMax));
        if (hpBar.current) hpBar.current.style.transform = `scaleX(${frac})`;
        if (shield.current) shield.current.style.transform = `scaleX(${Math.max(0, Math.min(1, s.shield / hpMax))})`;
        const hpT = `${Math.ceil(Math.max(0, s.hp))} / ${Math.round(hpMax)}`;
        if (hpText.current && hpT !== L.hp) { hpText.current.textContent = hpT; L.hp = hpT; }
        const m = Math.floor(s.moon);
        if (moon.current && m !== L.moon) { moon.current.textContent = fmtBig(m, lng()); L.moon = m; }
        if (sleeve.current) {
          sleeve.current.hidden = !s.showSleeve;
          if (sleeveN.current) sleeveN.current.textContent = String(s.sleeve);
        }
        if (xp.current) xp.current.style.transform = `scaleX(${Math.max(0, Math.min(1, s.xp / Math.max(1, s.xpNext)))})`;
        if (lvl.current && s.level !== L.lvl) { lvl.current.textContent = String(s.level); L.lvl = s.level; }
        const tm = s.time === null ? '' : fmtClock(s.time);
        if (timer.current && tm !== L.time) {
          timer.current.textContent = tm;
          timer.current.classList.toggle('is-last', s.time !== null && s.time <= 3.05);
          L.time = tm;
        }
        if (waveEl.current) waveEl.current.textContent = t(`第 ${s.wave} 重`, `Wave ${s.wave}`);
        if (boss.current) {
          boss.current.hidden = !s.boss;
          if (s.boss) {
            if (bossBar.current) bossBar.current.style.transform = `scaleX(${Math.max(0, Math.min(1, s.boss.hp))})`;
            const key = `${s.boss.id}|${s.boss.phase}`;
            if (bossLabel.current && key !== L.boss) { bossLabel.current.textContent = bossName(s.boss.id, t).name; L.boss = key; }
          }
        }
        const mk = [
          s.drunk !== null ? `醉${Math.round(s.drunk)}` : '',
          s.moonPhase !== null ? `月${s.moonPhase}` : '',
          s.lives !== null ? `命${s.lives}` : '',
          s.curse > 0 ? `劫${s.curse}` : '',
        ].join('|');
        if (marks.current && mk !== L.marks) {
          L.marks = mk;
          const parts: string[] = [];
          const mark = (cls: string, label: string, line: string, body: string, style = '') =>
            `<span class="mj-mark${cls}" role="img" aria-label="${attr(`${label}：${line}`)}" title="${attr(line)}"${style}><span aria-hidden="true">${body}</span></span>`;
          if (s.drunk !== null) parts.push(mark('', t(`醉意 ${Math.round(s.drunk)}`, `Drunk ${Math.round(s.drunk)}`), termLine('drunk', t), t(`醉 <b>${Math.round(s.drunk)}</b>`, `Drunk <b>${Math.round(s.drunk)}</b>`)));
          if (s.moonPhase !== null) parts.push(mark(' mj-moonphase', termName('moonPhase', t), termLine('moonPhase', t), `<i class="mj-phase" style="--k:${Math.abs(4 - Math.max(0, Math.min(7, s.moonPhase | 0))) / 4}"></i>`, ` style="--ph:${s.moonPhase}"`));
          if (s.lives !== null) parts.push(mark('', t(`九命 ${s.lives}`, `Lives ${s.lives}`), termLine('lives', t), t(`命 <b>${s.lives}</b>`, `Lives <b>${s.lives}</b>`)));
          if (s.curse > 0) parts.push(mark(' mj-curse', t(`劫数 ${s.curse}`, `Curse ${s.curse}`), termLine('curse', t), t(`劫 <b>${s.curse}</b>`, `Curse <b>${s.curse}</b>`)));
          marks.current.innerHTML = parts.join('');
        }
        root.current?.classList.toggle('is-low', s.lowHp);
        root.current?.classList.toggle('is-beat', s.beat);
        root.current?.classList.toggle('mj-dark', !!s.dark);
        const ring = root.current?.parentElement?.querySelector<SVGCircleElement>('.mj-skill-ring');
        if (ring) ring.style.strokeDashoffset = String(RING * Math.max(0, Math.min(1, s.skillCd)));
        const btn = root.current?.parentElement?.querySelector<HTMLElement>('.mj-skill');
        if (btn) { btn.classList.toggle('is-cd', s.skillCd > 0.001); btn.classList.toggle('is-active', s.skillActive); }
      },
      levelUp(level) {
        if (lvl.current) { lvl.current.textContent = String(level); last.current.lvl = level; }
        const el = root.current?.querySelector('.mj-lvbadge');
        el?.classList.remove('is-flash');
        void (el as HTMLElement | null)?.offsetWidth;
        el?.classList.add('is-flash');
      },
      crate(total) {
        if (crates.current) { crates.current.hidden = total <= 0; crates.current.textContent = t(`奁 ${total}`, `Caskets ${total}`); }
      },
      coin(n) {
        if (sleeve.current) sleeve.current.hidden = false;
        if (sleeveN.current) sleeveN.current.textContent = String(n);
        sleeve.current?.classList.remove('is-ring');
        void sleeve.current?.offsetWidth;
        sleeve.current?.classList.add('is-ring');
      },
    };
    return () => { props.api.current = null; };
  }, []);

  const whoLabel = t(`${termName('panel', t)}（会暂停）`, `${termName('panel', t)} (pauses the game)`);
  return (
    <div class="mj-hud" ref={root}>
      <div class="mj-hud-tl">
        <button type="button" class="mj-who" data-tut="who" onClick={props.onWho ?? props.onPause} aria-label={who ? `${whoLabel} · ${t(who.zh, who.en)}` : whoLabel} title={whoLabel}>
          <Portrait id={char} size={36} class="mj-who-face" />
          <span class="mj-lvbadge num" data-tut="lvl" aria-hidden="true"><b ref={lvl} /></span>
        </button>
        <div class="mj-hud-stack">
          <div class="mj-hp" data-tut="hp" role="img" aria-label={termName('hp', t)}>
            <i class="mj-hp-fill" ref={hpBar} />
            <i class="mj-hp-shield" ref={shield} />
            <b class="mj-hp-text num" ref={hpText} />
          </div>
          <div class="mj-hud-row">
            <span class="mj-armor" title={termLine('armor', t)}>{hudArmour(armorReduction(props.armor), t)}</span>
            <span class="mj-moon" data-tut="moon"><i class="mj-moon-dot" aria-hidden="true" /><b class="num" ref={moon} /><span class="visually-hidden">{termName('moon', t)}</span></span>
            <span class="mj-sleeve" data-tut="sleeve" ref={sleeve} hidden={!props.showSleeve} title={termLine('sleeve', t)}>
              <i class="coin-icon" style={{ width: '13px', height: '13px' }} aria-hidden="true" /><b class="num" ref={sleeveN}>0</b>
            </span>
          </div>
          <div class="mj-xp" data-tut="xp" role="img" aria-label={termName('xp', t)}><i ref={xp} /></div>
          <span class="mj-crates" data-tut="crates" ref={crates} title={termLine('crate', t)} hidden />
        </div>
      </div>
      <div class="mj-hud-tc">
        <span class="mj-wave brush" data-tut="wave" ref={waveEl}>{t(`第 ${props.wave} 重`, `Wave ${props.wave}`)}</span>
        <span class="mj-timer brush num" data-tut="timer" ref={timer} aria-live="off" />
        <div class="mj-boss" ref={boss} hidden>
          <span class="mj-boss-name brush" ref={bossLabel} />
          <div class="mj-boss-bar"><i ref={bossBar} /></div>
        </div>
      </div>
      <div class="mj-hud-tr">
        <div class="mj-marks" data-tut="marks" ref={marks} />
        <button type="button" class="mj-pause" data-tut="pause" onClick={props.onPause} aria-label={termName('pause', t)}>‖</button>
      </div>
    </div>
  );
}

/** The touch layer: floating stick, 技 button, and (手瞄) an aim stick. Desktop mouse moves feed cursor(). */
export function Controls(props: { engine: () => Engine | null; left: boolean; manualAim: boolean; skill: SkillId; skillLive?: boolean; enabled: boolean }) {
  const t = useT();
  const layer = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const aimBase = useRef<HTMLDivElement>(null);
  const aimKnob = useRef<HTMLDivElement>(null);
  const skillBtn = useRef<HTMLButtonElement>(null);
  const aimLine = useRef<HTMLDivElement>(null);
  const opts = useRef(props);
  opts.current = props;
  const glyph = SKILL_REG.find((s) => s.id === props.skill)?.glyph ?? '技';

  useEffect(() => {
    const el = layer.current!;
    let stick: { id: number; x: number; y: number; t0: number } | null = null;
    let aim: { id: number; x: number; y: number } | null = null;
    const show = (b: HTMLDivElement | null, k: HTMLDivElement | null, x: number, y: number, kx: number, ky: number, on: boolean) => {
      if (!b || !k) return;
      b.style.opacity = on ? '1' : '0';
      b.style.transform = `translate(${x - STICK_R}px, ${y - STICK_R}px)`;
      k.style.transform = `translate(${kx}px, ${ky}px)`;
    };
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
    };
    const down = (e: PointerEvent) => {
      if (!opts.current.enabled) return;
      if ((e.target as HTMLElement).closest('button, .mj-hud-tr, .mj-hud-tc')) return;
      const p = local(e);
      const inStick = opts.current.left ? p.x > p.w * 0.4 : p.x < p.w * 0.6;
      if (inStick && !stick) {
        stick = { id: e.pointerId, x: p.x, y: p.y, t0: e.timeStamp };
        try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
        show(base.current, knob.current, p.x, p.y, 0, 0, true);
        e.preventDefault();
      } else if (!inStick && opts.current.manualAim && e.pointerType !== 'mouse' && !aim) {
        aim = { id: e.pointerId, x: p.x, y: p.y };
        try { el.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
        show(aimBase.current, aimKnob.current, p.x, p.y, 0, 0, true);
        e.preventDefault();
      }
    };
    const move = (e: PointerEvent) => {
      const p = local(e);
      const eng = opts.current.engine();
      if (e.pointerType === 'mouse') eng?.input.cursor(p.x, p.y);
      if (stick && e.pointerId === stick.id) {
        // the pad's settle in the first 100 ms moves the base; a thumb past the rim drags it along
        stickSettle(stick, p.x, p.y, e.timeStamp);
        const v = stickVector(p.x - stick.x, p.y - stick.y);
        eng?.input.move(v.x, v.y);
        show(base.current, knob.current, stick.x, stick.y, v.knobX, v.knobY, true);
      } else if (aim && e.pointerId === aim.id) {
        const v = stickVector(p.x - aim.x, p.y - aim.y);
        eng?.input.aim(v.x, v.y);
        show(aimBase.current, aimKnob.current, aim.x, aim.y, v.knobX, v.knobY, true);
      }
    };
    const up = (e: PointerEvent) => {
      const eng = opts.current.engine();
      if (stick && e.pointerId === stick.id) {
        stick = null;
        eng?.input.move(0, 0);
        show(base.current, knob.current, 0, 0, 0, 0, false);
      } else if (aim && e.pointerId === aim.id) {
        aim = null;
        eng?.input.aim(0, 0);
        show(aimBase.current, aimKnob.current, 0, 0, 0, 0, false);
      }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      opts.current.engine()?.input.move(0, 0);
    };
  }, []);

  // the 技 button: tap = auto-target; drag = aim (the ghost reticle follows); dragged back = cancel
  useEffect(() => {
    const b = skillBtn.current!;
    let drag: { id: number; x: number; y: number; far: boolean } | null = null;
    const line = (on: boolean, x = 0, y = 0) => {
      const l = aimLine.current;
      if (!l) return;
      l.style.opacity = on ? '1' : '0';
      if (on) l.style.transform = `rotate(${Math.atan2(y, x)}rad)`;
    };
    const down = (e: PointerEvent) => {
      if (!opts.current.enabled) return;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, far: false };
      try { b.setPointerCapture(e.pointerId); } catch { /* old */ }
      b.classList.add('is-held');
      e.preventDefault();
      e.stopPropagation();
    };
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = skillDrag(e.clientX - drag.x, e.clientY - drag.y);
      const eng = opts.current.engine();
      if (d.aim) { drag.far = true; eng?.skillPreview({ kind: 'dir', x: d.x, y: d.y }); line(true, d.x, d.y); }
      else { eng?.skillPreview(null); line(false); }
    };
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = skillDrag(e.clientX - drag.x, e.clientY - drag.y);
      const eng = opts.current.engine();
      eng?.skillPreview(null);
      if (e.type === 'pointerup') {
        if (d.aim) eng?.skill({ kind: 'dir', x: d.x, y: d.y });
        else if (!drag.far) eng?.skill({ kind: 'auto' });
      }
      drag = null;
      line(false);
      b.classList.remove('is-held');
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    return () => {
      b.removeEventListener('pointerdown', down);
      b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div class={'mj-controls' + (props.left ? ' is-left' : '')} ref={layer}>
      <div class="mj-stick" ref={base} aria-hidden="true"><div class="mj-stick-knob" ref={knob} /></div>
      <div class="mj-stick mj-aimstick" ref={aimBase} aria-hidden="true"><div class="mj-stick-knob" ref={aimKnob} /></div>
      <button
        type="button"
        class={'mj-skill brush' + (props.skillLive === false ? ' is-off' : '')}
        data-tut="skill"
        ref={skillBtn}
        aria-disabled={props.skillLive === false ? 'true' : undefined}
        aria-label={t(`镜技「${SKILL_REG.find((s) => s.id === props.skill)?.zh ?? ''}」（Q / 空格）`, `Mirror skill ${SKILL_REG.find((s) => s.id === props.skill)?.en ?? ''} (Q / Space)`)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); opts.current.engine()?.skill({ kind: 'auto' }); } }}
      >
        <svg viewBox="0 0 72 72" aria-hidden="true">
          <circle class="mj-skill-track" cx="36" cy="36" r="31" />
          <circle class="mj-skill-ring" cx="36" cy="36" r="31" style={{ strokeDasharray: RING, strokeDashoffset: 0 }} />
        </svg>
        <span>{glyph}</span>
        <div class="mj-skill-aim" ref={aimLine} aria-hidden="true" />
      </button>
    </div>
  );
}
