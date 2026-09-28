// 水月幻镜 · the between-wave screens (GDD §18.5–6, §18.8, §3): 书生's starting pick, level-up cards,
// 镜奁 crates, 镜心, the 「第 N 重」 ready screen and the boss's entrance card. Each takes the run and
// hands back the next one; the controller commits it. Keys: 1–5 pick, R reroll, Enter/Space go (held
// keys don't repeat; a focused button answers Enter / Space itself).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { COMPANION_REG, MAP_REG, SKILL_REG, type ItemId, type WeaponId } from '../ids';
import type { BossEvent, LevelCard, RunSave, Tier, Unlocks } from '../types';
import { ITEMS, WEAPONS } from '../data';
import { clsKey, termLine, termName, termOf } from '../data/glossary';
import {
  cardsView, crateItem, heartOffer, isBossWave, meltValue, pickCard, pickHeart, pickStart, rerollCards, resolveCrate, wavePlan,
} from '../logic';
import { Icon, Seal } from './icons';
import { describeItem, describeWeapon } from './describe';
import { levelPreview, statDeltaText, tierWord } from './panelView';
import { bossName, nameOf, screenKeyGate, statName, TIER_ROMAN, TIER_ZH, type T } from './text';

const sheetOpen = () => typeof document !== 'undefined' && !!document.querySelector('.sheet-backdrop');

/**
 * Keys for a between-wave screen (ignored while a sheet is open). `on` returns true when it acted: the
 * key is then consumed, so a button that happens to hold focus doesn't click as well. Held keys don't
 * repeat, and Enter / Space on a focused button are left to that button (screenKeyGate).
 */
export function useScreenKeys(on: (key: string, e: KeyboardEvent) => boolean | void, deps: unknown[]) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const g = screenKeyGate(e, sheetOpen());
      if (g === 'swallow') { e.preventDefault(); return; }
      if (g === 'offer' && on(e.key.toLowerCase(), e) === true) e.preventDefault();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, deps);
}
/** Digit keys 1…n → index 0…n−1, else −1. */
const digit = (k: string, n: number) => (/^[1-9]$/.test(k) && Number(k) <= n ? Number(k) - 1 : -1);

/** A weapon or item card: icon, name, tier seal, then what it does in plain words (describe.ts): the
 *  head line (「伤害 10 · 0.9 秒一剑」), what it scales with, the rules line, and the 神品 line at IV. */
export function GearCard(props: {
  kind: 'weapon' | 'item'; id: WeaponId | ItemId; tier?: Tier; px?: number; t: T; children?: ComponentChildren; class?: string;
  onClick?: () => void; disabled?: boolean; label?: string; hotkey?: string; tut?: string;
}) {
  const { t } = props;
  const isW = props.kind === 'weapon';
  const tier = (isW ? props.tier ?? 1 : ITEMS[props.id as ItemId].tier) as Tier;
  const name = nameOf(props.id, t);
  const wd = isW ? describeWeapon(props.id as WeaponId, tier, t) : null;
  const idesc = isW ? null : describeItem(props.id as ItemId, t);
  const classes = isW ? WEAPONS[props.id as WeaponId].classes : [];
  const tags = isW ? [] : ITEMS[props.id as ItemId].tags;
  const Tag = props.onClick ? 'button' : 'div';
  return (
    <Tag
      type={props.onClick ? 'button' : undefined}
      class={`mj-card tier-${tier} ${props.class ?? ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      data-tut={props.tut}
    >
      {props.hotkey && <kbd class="mj-hotkey" aria-hidden="true">{props.hotkey}</kbd>}
      <div class="mj-card-head">
        <Icon id={`${isW ? 'wpn' : 'item'}:${props.id}`} px={props.px ?? 44} />
        <div class="mj-card-title">
          <b class="mj-card-name">{name}{isW && lang.value === 'en' && <span class="mj-tierroman num"> {TIER_ROMAN[tier]}</span>}</b>
          <span class="mj-card-tier">
            <span class="visually-hidden">{tierWord(tier, t)} · </span>
            {isW ? classes.map((c) => termName(clsKey(c), t)).join(' · ') : tags.length ? t('适合：', 'suits: ') + tags.map((c) => termName(clsKey(c), t)).join(' · ') : ''}
          </span>
        </div>
        <span class={`mj-tierseal tier-${tier}`} aria-hidden="true" title={tierWord(tier, t)}>{TIER_ZH[tier]}</span>
      </div>
      {wd?.head && <p class="mj-card-headline num">{wd.head}</p>}
      {wd?.scales && <p class="mj-card-scales"><span>{wd.scales}</span></p>}
      <p class="mj-card-text">{wd ? wd.body : idesc!.body}</p>
      {wd?.t4 && <p class="mj-card-t4">{wd.t4}</p>}
      {props.children}
    </Tag>
  );
}

/** A framed between-wave panel over the dimmed arena. */
export function Panel(props: { title: ComponentChildren; sub?: ComponentChildren; children: ComponentChildren; onPause?: () => void; class?: string }) {
  const t = useT();
  return (
    <section class={'mj-panel ' + (props.class ?? '')} aria-label={typeof props.title === 'string' ? props.title : undefined}>
      <header class="mj-panel-head">
        <h2 class="brush">{props.title}</h2>
        {props.sub && <p class="mj-panel-sub">{props.sub}</p>}
        {props.onPause && <button type="button" class="mj-pause mj-pause-panel" onClick={props.onPause} aria-label={t('暂停', 'Pause')}>‖</button>}
      </header>
      {props.children}
    </section>
  );
}

// ───────────────────────────────────────────── 书生's (or mastery 3) starting pick
export function StartPick(props: { run: RunSave; onRun: (r: RunSave) => void; onPause: () => void }) {
  const t = useT();
  const opts = props.run.pending.start ?? [];
  useScreenKeys((k) => { const i = digit(k, opts.length); if (i < 0) return false; props.onRun(pickStart(props.run, opts[i])); return true; }, [props.run]);
  return (
    <Panel title={t('择器', 'Choose a weapon')} sub={t('开打之前，先挑一把顺手的兵器。', 'Before the first wave, pick the weapon you like.')} onPause={props.onPause}>
      <div class="mj-cards">
        {opts.map((id, i) => (
          <GearCard kind="weapon" id={id} tier={1} t={t} hotkey={String(i + 1)} onClick={() => props.onRun(pickStart(props.run, id))} px={52} tut={`startCard:${i}`} />
        ))}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── level-up cards
export function Cards(props: {
  run: RunSave; onRun: (r: RunSave) => void; onPause: () => void;
  /** The 人物 button: opens the 人物 sheet. */
  onWho?: () => void;
  /** @deprecated the old name of onWho (until Run.tsx switches). */
  onStats?: () => void;
}) {
  const t = useT();
  const v = cardsView(props.run);
  const pick = (i: number) => { if (!v?.cards[i]) return false; props.onRun(pickCard(props.run, i)); return true; };
  const reroll = () => { const r = rerollCards(props.run); if (r) props.onRun(r); return !!r; };
  useScreenKeys((k) => (k === 'r' ? reroll() : pick(digit(k, 9))), [props.run]);
  if (!v) return null;
  const onWho = props.onWho ?? props.onStats;
  return (
    <Panel
      title={t(`升 · 第 ${v.level} 级`, `Level ${v.level}`)}
      sub={v.left > 1 ? t(`还有 ${v.left} 次升级可挑`, `${v.left} level-ups to choose`) : t('挑一张，加成这一局一直有效', 'Pick one; it lasts the whole run')}
      onPause={props.onPause}
    >
      <div class="mj-cards mj-cards-lv" data-tut="cards">
        {v.cards.map((c: LevelCard, i) => {
          const val = statDeltaText(c.stat, c.v);
          const pv = levelPreview(props.run, c.stat, c.v, t);
          return (
            <button
              type="button"
              class={`mj-card mj-lvcard tier-${c.tier}`}
              data-tut={`card:${i}`}
              onClick={() => pick(i)}
              aria-label={`${i + 1}. ${statName(c.stat, t)} ${val} · ${pv.line} · ${tierWord(c.tier, t)}`}
              title={termLine(c.stat, t)}
            >
              <kbd class="mj-hotkey" aria-hidden="true">{i + 1}</kbd>
              <span class="mj-lvglyph brush" aria-hidden="true">{termOf(c.stat).icon ?? termOf('level').icon ?? '升'}</span>
              <b class="mj-lvval num" aria-hidden="true">{val}</b>
              <span class="mj-lvname" aria-hidden="true">{statName(c.stat, t)}</span>
              <span class="mj-lvnow num" aria-hidden="true">{pv.line}</span>
              <span class={`mj-tierseal tier-${c.tier}`} aria-hidden="true">{TIER_ZH[c.tier]}</span>
            </button>
          );
        })}
      </div>
      <div class="mj-row-actions">
        <button type="button" class="btn btn-small" data-tut="cardReroll" onClick={reroll} disabled={props.run.moon < v.rerollCost}>
          {termName('reroll', t)} <span class="mj-moon-cost num">{v.rerollCost}</span> <kbd class="mj-hotkey-inline">R</kbd>
        </button>
        <span class="mj-have">{termName('moon', t)} <b class="num">{Math.floor(props.run.moon)}</b></span>
        {onWho && <button type="button" class="btn btn-small mj-cardwho" data-tut="cardWho" onClick={onWho}><span class="brush" aria-hidden="true">人</span> {termName('panel', t)}</button>}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── 镜奁
export function Crate(props: { run: RunSave; unlocks: Unlocks; onRun: (r: RunSave) => void; onPause: () => void }) {
  const t = useT();
  const id = crateItem(props.run, props.unlocks);
  const melt = meltValue(props.run, id);
  const keep = () => props.onRun(resolveCrate(props.run, true, props.unlocks));
  const sell = () => props.onRun(resolveCrate(props.run, false, props.unlocks));
  useScreenKeys((k) => {
    if (k === '1' || k === 'enter' || k === ' ') { keep(); return true; }
    if (k === '2') { sell(); return true; }
    return false;
  }, [props.run]);
  return (
    <Panel title={termName('crate', t)} sub={props.run.pending.crates > 1 ? t(`一共 ${props.run.pending.crates} 个`, `${props.run.pending.crates} to open`) : undefined} onPause={props.onPause}>
      <div class="mj-crate">
        <GearCard kind="item" id={id} t={t} px={64} class="mj-crate-card" tut="crateCard" />
        <div class="mj-row-actions">
          <button type="button" class="btn btn-primary mj-big" data-tut="crateKeep" onClick={keep} title={termLine('keep', t)}>
            <span class="brush" aria-hidden="true">收</span> {termName('keep', t)} <kbd class="mj-hotkey-inline">1</kbd>
          </button>
          <button type="button" class="btn mj-big" data-tut="crateMelt" onClick={sell} title={termLine('melt', t)} aria-label={t(`${termName('melt', t)}，得 ${melt} 月华`, `Melt it for ${melt} moonlight`)}>
            <span class="brush" aria-hidden="true">化</span> {termName('melt', t)} <span class="mj-moon-cost num">+{melt}</span> <kbd class="mj-hotkey-inline">2</kbd>
          </button>
        </div>
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── 镜心
export function HeartPick(props: { run: RunSave; unlocks: Unlocks; onRun: (r: RunSave) => void; onPause: () => void }) {
  const t = useT();
  const opts = heartOffer(props.run, props.unlocks);
  const pick = (i: number) => { if (!opts[i]) return false; props.onRun(pickHeart(props.run, i, props.unlocks)); return true; };
  useScreenKeys((k) => pick(digit(k, opts.length)), [props.run]);
  const src = props.run.pending.hearts[0];
  return (
    <Panel
      title={t('镜心', 'Mirror heart')}
      sub={src === 'flower' ? t('镜中花开了：挑一件。', 'The mirror flower opens: take one.') : t('首领倒了：挑一件。下一重开始时满血，还送一次免费刷新。', 'The boss fell: take one. You start the next wave at full HP, with a free reroll.')}
      onPause={props.onPause}
    >
      <div class="mj-cards">
        {opts.map((id, i) => <GearCard kind="item" id={id} t={t} px={56} hotkey={String(i + 1)} onClick={() => pick(i)} tut={`heartCard:${i}`} />)}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── ready: 「第 N 重」
export function Ready(props: { run: RunSave; onGo: () => void; onPause: () => void; baking: number | null }) {
  const t = useT();
  const w = props.run.wave + 1;
  const plan = wavePlan(props.run, w);
  const c = COMPANION_REG.find((x) => x.id === props.run.char)!;
  const sk = SKILL_REG.find((s) => s.char === props.run.char)!;
  useScreenKeys((k) => { if ((k !== 'enter' && k !== ' ') || props.baking !== null) return false; props.onGo(); return true; }, [props.run, props.onGo, props.baking]);
  const boss = plan.boss ? bossName(plan.boss.ids.includes('mirrorself') ? 'mirrorself' : plan.boss.twins ? 'twins' : plan.boss.ids[0], t) : null;
  return (
    <div class="mj-ready" role="group" aria-label={t(`第 ${w} 重`, `Wave ${w}`)}>
      <button type="button" class="mj-pause mj-pause-panel" onClick={props.onPause} aria-label={t('暂停', 'Pause')}>‖</button>
      <p class="mj-ready-map">{t(MAP_REG.find((m) => m.id === props.run.map)!.title, MAP_REG.find((m) => m.id === props.run.map)!.titleEn)}</p>
      <h2 class="mj-ready-title brush">{t(`第 ${w} 重`, `Wave ${w}`)}</h2>
      {boss ? (
        <p class="mj-ready-kind is-boss"><Seal text="首" size={22} /> {boss.name} · <i>{boss.verse}</i></p>
      ) : plan.kind === 'elite' ? (
        <p class="mj-ready-kind">{t(`这一重有${termName('elite', (z) => z)}`, 'Elites this wave')}</p>
      ) : plan.kind === 'horde' ? (
        <p class="mj-ready-kind">{t('群魔蜂拥', 'A horde')}</p>
      ) : w === 1 ? (
        <p class="mj-ready-kind">{t(`${c.zh}入镜 · 镜技「${sk.zh}」`, `${c.en} steps in · skill “${sk.en}”`)}</p>
      ) : null}
      {props.run.inWave === null && props.run.interruptions > 0 && w === props.run.wave + 1 && (
        <p class="mj-ready-note">{t(`这一重已经中断过 ${props.run.interruptions}/3 次`, `Interrupted ${props.run.interruptions}/3 times`)}</p>
      )}
      <button type="button" class="btn btn-seal mj-big mj-go" data-tut="go" onClick={props.onGo} disabled={props.baking !== null}>
        {props.baking !== null ? t(`研墨 ${Math.round(props.baking * 100)}%`, `Grinding ink ${Math.round(props.baking * 100)}%`) : termName('go', t)}
      </button>
      <p class="mj-ready-keys">{t('移动：摇杆 / WASD · 镜技：技 / Q · 暂停：Esc', 'Move: stick / WASD · Skill: glyph button / Q · Pause: Esc')}</p>
      {isBossWave(w) && <p class="mj-ready-note">{t('首领这一重不计时，打倒首领就过。', 'Boss waves have no timer: beat the boss to win.')}</p>}
    </div>
  );
}

// ───────────────────────────────────────────── the boss's entrance card (1.5 s, skippable)
/**
 * The boss's name card. Without `tip` it closes itself after 1.5 s (a tap skips). With a `tip` (the
 * tutorial's first boss, a first-time tip) it stays until its `go` button, which fires onDone.
 */
export function BossCard(props: { ev: BossEvent & { kind: 'intro' }; onDone: () => void; tip?: { line: string; go: string } | null }) {
  const t = useT();
  const b = bossName(props.ev.id, t);
  const zh = bossName(props.ev.id, (z) => z).name;
  const [gone, setGone] = useState(false);
  const tip = props.tip ?? null;
  useEffect(() => {
    if (tip) return;
    const k = setTimeout(() => { setGone(true); props.onDone(); }, 1500);
    return () => clearTimeout(k);
  }, [!!tip]);
  if (gone) return null;
  const done = () => { setGone(true); props.onDone(); };
  if (tip) {
    return (
      <div class="mj-bosscard is-tip" data-tut="bossCard" role="dialog" aria-label={b.name}>
        <Seal text={zh.slice(0, 4)} size={64} class="mj-bosscard-seal" label={b.name} />
        <h2 class="brush">{b.name}</h2>
        <p class="mj-bosscard-verse">{b.verse}</p>
        <p class="mj-bosscard-tip">{tip.line}</p>
        <button type="button" class="btn btn-seal mj-big" data-tut="bossGo" onClick={done}>{tip.go}</button>
      </div>
    );
  }
  return (
    <button type="button" class="mj-bosscard" data-tut="bossCard" onClick={done} aria-label={t(`${b.name}，轻触继续`, `${b.name}, tap to continue`)}>
      <Seal text={zh.slice(0, 4)} size={64} class="mj-bosscard-seal" label={b.name} />
      <h2 class="brush">{b.name}</h2>
      <p class="mj-bosscard-verse">{b.verse}</p>
    </button>
  );
}
