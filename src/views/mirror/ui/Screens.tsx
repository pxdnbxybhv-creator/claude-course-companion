// 水月幻镜 · the between-wave screens (GDD §18.5–6, §18.8, §3): 书生's starting pick, level-up cards,
// 镜奁 crates, 镜心, the 「第 N 重」 ready screen and the boss's entrance card. Each takes the run and
// hands back the next one; the controller commits it. Keys: 1–5 pick, R reroll, Enter/Space go (held
// keys don't repeat; a focused button answers Enter / Space itself).
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useT } from '../../../app/i18n';
import { COMPANION_REG, MAP_REG, SKILL_REG, type ItemId, type WeaponId } from '../ids';
import type { BossEvent, LevelCard, RunSave, StatId, Tier, Unlocks } from '../types';
import { ITEMS, WEAPONS } from '../data';
import {
  cardsView, crateItem, heartOffer, isBossWave, meltValue, pickCard, pickHeart, pickStart, rerollCards, resolveCrate, wavePlan,
} from '../logic';
import { Icon, Seal } from './icons';
import { bossName, className, fmtStat, nameOf, screenKeyGate, statName, tierName, TIER_ROMAN, TIER_ZH, type T } from './text';

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

/** A weapon or item card: icon, name, tier seal, what it does, tags. */
export function GearCard(props: {
  kind: 'weapon' | 'item'; id: WeaponId | ItemId; tier?: Tier; px?: number; t: T; children?: ComponentChildren; class?: string;
  onClick?: () => void; disabled?: boolean; label?: string; hotkey?: string;
}) {
  const { t } = props;
  const isW = props.kind === 'weapon';
  const tier = (isW ? props.tier ?? 1 : ITEMS[props.id as ItemId].tier) as Tier;
  const name = nameOf(props.id, t);
  const text = isW ? WEAPONS[props.id as WeaponId].text : ITEMS[props.id as ItemId].text;
  const tags = isW ? WEAPONS[props.id as WeaponId].classes : ITEMS[props.id as ItemId].tags;
  const Tag = props.onClick ? 'button' : 'div';
  return (
    <Tag
      type={props.onClick ? 'button' : undefined}
      class={`mj-card tier-${tier} ${props.class ?? ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
    >
      {props.hotkey && <kbd class="mj-hotkey" aria-hidden="true">{props.hotkey}</kbd>}
      <div class="mj-card-head">
        <Icon id={`${isW ? 'wpn' : 'item'}:${props.id}`} px={props.px ?? 44} />
        <div class="mj-card-title">
          <b class="mj-card-name">{name}{isW && <span class="mj-tierroman num"> {TIER_ROMAN[tier]}</span>}</b>
          <span class="mj-card-tier">{tierName(tier, t)}{tags.length ? ' · ' + tags.map((c) => className(c, t)).join(' ') : ''}</span>
        </div>
        <span class={`mj-tierseal tier-${tier}`} aria-hidden="true">{TIER_ZH[tier]}</span>
      </div>
      <p class="mj-card-text">{t(text.zh, text.en)}</p>
      {isW && tier === 4 && <p class="mj-card-t4">{t(WEAPONS[props.id as WeaponId].t4.zh, WEAPONS[props.id as WeaponId].t4.en)}</p>}
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
    <Panel title={t('择器', 'Choose a weapon')} sub={t('入镜之前，先挑一件趁手的。', 'Before the first wave, take the one that fits your hand.')} onPause={props.onPause}>
      <div class="mj-cards">
        {opts.map((id, i) => (
          <GearCard kind="weapon" id={id} tier={1} t={t} hotkey={String(i + 1)} onClick={() => props.onRun(pickStart(props.run, id))} px={52} />
        ))}
      </div>
    </Panel>
  );
}

// ───────────────────────────────────────────── level-up cards
const CARD_GLYPH: Partial<Record<StatId, string>> = {
  hp: '血', regen: '气', steal: '噬', dmg: '伤', melee: '近', ranged: '远', elem: '行', spirit: '化', aspd: '速', crit: '暴',
  range: '射', armor: '甲', dodge: '避', speed: '身', luck: '福', harvest: '收',
};
export function Cards(props: { run: RunSave; onRun: (r: RunSave) => void; onPause: () => void; onStats: () => void }) {
  const t = useT();
  const v = cardsView(props.run);
  const pick = (i: number) => { if (!v?.cards[i]) return false; props.onRun(pickCard(props.run, i)); return true; };
  const reroll = () => { const r = rerollCards(props.run); if (r) props.onRun(r); return !!r; };
  useScreenKeys((k) => (k === 'r' ? reroll() : pick(digit(k, 9))), [props.run]);
  if (!v) return null;
  return (
    <Panel
      title={t(`升 · 第 ${v.level} 级`, `Level ${v.level}`)}
      sub={v.left > 1 ? t(`尚有 ${v.left} 次升级待选`, `${v.left} level-ups to choose`) : t('择一项，永久加成', 'Pick one; it lasts the run')}
      onPause={props.onPause}
    >
      <div class="mj-cards mj-cards-lv">
        {v.cards.map((c: LevelCard, i) => (
          <button type="button" class={`mj-card mj-lvcard tier-${c.tier}`} onClick={() => pick(i)} aria-label={`${i + 1}. ${fmtStat(c.stat, c.v, t)} · ${tierName(c.tier, t)}`}>
            <kbd class="mj-hotkey" aria-hidden="true">{i + 1}</kbd>
            <span class="mj-lvglyph brush" aria-hidden="true">{CARD_GLYPH[c.stat] ?? '升'}</span>
            <b class="mj-lvval num">{fmtStat(c.stat, c.v, t).split(' ')[0]}</b>
            <span class="mj-lvname">{statName(c.stat, t)}</span>
            <span class={`mj-tierseal tier-${c.tier}`} aria-hidden="true">{TIER_ZH[c.tier]}</span>
          </button>
        ))}
      </div>
      <div class="mj-row-actions">
        <button type="button" class="btn btn-small" onClick={reroll} disabled={props.run.moon < v.rerollCost}>
          {t('重抽', 'Reroll')} <span class="mj-moon-cost num">{v.rerollCost}</span> <kbd class="mj-hotkey-inline">R</kbd>
        </button>
        <span class="mj-have">{t('月华', 'Moonlight')} <b class="num">{Math.floor(props.run.moon)}</b></span>
        <button type="button" class="btn btn-small btn-ghost" onClick={props.onStats}>{t('属性', 'Stats')}</button>
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
    <Panel title={t('镜奁', 'Mirror casket')} sub={props.run.pending.crates > 1 ? t(`共 ${props.run.pending.crates} 只`, `${props.run.pending.crates} to open`) : undefined} onPause={props.onPause}>
      <div class="mj-crate">
        <GearCard kind="item" id={id} t={t} px={64} class="mj-crate-card" />
        <div class="mj-row-actions">
          <button type="button" class="btn btn-primary mj-big" onClick={keep}><span class="brush">收</span> {t('收下', 'Keep')} <kbd class="mj-hotkey-inline">1</kbd></button>
          <button type="button" class="btn mj-big" onClick={sell}><span class="brush">化</span> <span class="mj-moon-cost num">+{melt}</span> <kbd class="mj-hotkey-inline">2</kbd></button>
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
      sub={src === 'flower' ? t('镜中花开，择其一', 'The mirror flower opens: take one') : t('首领已破，择一件仙神之物；下一重满血，再送一次重抽', 'The boss fell: take one; you start the next wave at full HP, with a free reroll')}
      onPause={props.onPause}
    >
      <div class="mj-cards">
        {opts.map((id, i) => <GearCard kind="item" id={id} t={t} px={56} hotkey={String(i + 1)} onClick={() => pick(i)} />)}
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
        <p class="mj-ready-kind">{t('精怪出没', 'Elites abroad')}</p>
      ) : plan.kind === 'horde' ? (
        <p class="mj-ready-kind">{t('群魔蜂拥', 'A horde')}</p>
      ) : w === 1 ? (
        <p class="mj-ready-kind">{t(`${c.zh}入镜 · 镜技「${sk.zh}」`, `${c.en} steps in · skill “${sk.en}”`)}</p>
      ) : null}
      {props.run.inWave === null && props.run.interruptions > 0 && w === props.run.wave + 1 && (
        <p class="mj-ready-note">{t(`此重曾中断 ${props.run.interruptions}/3 次`, `Interrupted ${props.run.interruptions}/3 times`)}</p>
      )}
      <button type="button" class="btn btn-seal mj-big mj-go" onClick={props.onGo} disabled={props.baking !== null}>
        {props.baking !== null ? t(`研墨 ${Math.round(props.baking * 100)}%`, `Grinding ink ${Math.round(props.baking * 100)}%`) : t('入此重', 'Begin')}
      </button>
      <p class="mj-ready-keys">{t('移动：摇杆 / WASD · 镜技：技 / Q · 暂停：Esc', 'Move: stick / WASD · Skill: 技 / Q · Pause: Esc')}</p>
      {isBossWave(w) && <p class="mj-ready-note">{t('首领之重不计时；首领倒下即破。', 'Boss waves are untimed; the wave falls with the boss.')}</p>}
    </div>
  );
}

// ───────────────────────────────────────────── the boss's entrance card (1.5 s, skippable)
export function BossCard(props: { ev: BossEvent & { kind: 'intro' }; onDone: () => void }) {
  const t = useT();
  const b = bossName(props.ev.id, t);
  const zh = bossName(props.ev.id, (z) => z).name;
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const k = setTimeout(() => { setGone(true); props.onDone(); }, 1500);
    return () => clearTimeout(k);
  }, []);
  if (gone) return null;
  return (
    <button type="button" class="mj-bosscard" onClick={() => { setGone(true); props.onDone(); }} aria-label={t(`${b.name}，轻触继续`, `${b.name}, tap to continue`)}>
      <Seal text={zh.slice(0, 4)} size={64} class="mj-bosscard-seal" label={b.name} />
      <h2 class="brush">{b.name}</h2>
      <p class="mj-bosscard-verse">{b.verse}</p>
    </button>
  );
}
