// 水月幻镜 · 镜市, the old mirror-polisher's shop (GDD §7, §18.7): slots with prices and locks, the
// reroll, and the bottom tabs 兵器 (sell · 合铸 · class-set pips) · 行囊 · 属性. Every action is a
// pure logic call whose result the controller commits (saved at once). The UI only disables what
// ShopView says. Keys: 1–6 buy, L then a number locks, R rerolls, Enter starts the next wave.
import { useEffect, useRef, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { HAZARD_REG, type ItemId } from '../ids';
import type { RunSave, Tier, Unlocks } from '../types';
import { COMPANIONS, ITEMS } from '../data';
import { termLine, termName } from '../data/glossary';
import {
  buy, fmtBig, isBossWave, merge, noReroll, reroll, sell, sellPrice, shopView, shopW, toggleLock, wavePlan, weaponSlotsOf,
} from '../logic';
import { GearCard, useScreenKeys } from './Screens';
import { Icon } from './icons';
import { calmNow } from './prefs';
import { describeItem, describeWeapon } from './describe';
import { CharacterPanel, WhoChip } from './Panel';
import { panelView, tierWord } from './panelView';
import { bossName, nameOf, TIER_ROMAN, TIER_ZH, type T } from './text';

type Tab = 'who' | 'wpn' | 'bag';
/** The shop tab, remembered between the waves of one run (the Shop remounts every wave); a new run (or
 *  the tutorial's practice run, then a real one) opens on 人物 again. */
const shopTab = signal<{ seed: number; tab: Tab } | null>(null);
/** Desktop and landscape tablets: the 人物 panel is a column beside the shop, always open. */
const WIDE = '(min-width: 1100px)';
function useWide(): boolean {
  const q = () => { try { return matchMedia(WIDE).matches; } catch { return false; } };
  const [wide, setWide] = useState(q);
  useEffect(() => {
    let m: MediaQueryList | null = null;
    try { m = matchMedia(WIDE); } catch { return; }
    const on = () => setWide(m!.matches);
    m.addEventListener?.('change', on);
    return () => m?.removeEventListener?.('change', on);
  }, []);
  return wide;
}

export function Shop(props: {
  run: RunSave; unlocks: Unlocks; onRun: (r: RunSave, sfx?: 'buy' | 'reroll' | 'merge') => void; onNext: () => void; onLeave: () => void;
  baking: number | null; onPause: () => void;
  /** The WhoChip on a phone or tablet: Run opens the 人物 sheet. Without it the chip opens the 人物 tab. */
  onWho?: () => void;
}) {
  const t = useT();
  const { run } = props;
  const v = shopView(run);
  const wide = useWide();
  const kept: Tab = shopTab.value?.seed === run.seed ? shopTab.value.tab : 'who';
  const tab: Tab = wide && kept === 'who' ? 'wpn' : kept;
  const setTab = (x: Tab) => { shopTab.value = { seed: run.seed, tab: x }; };
  const [sel, setSel] = useState<number | null>(null);
  const lockNext = useRef(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const w = v.wave;
  const plan = wavePlan(run, w);

  const doBuy = (i: number) => {
    const r = buy(run, i);
    if (r) props.onRun(r, r.weapons.length === run.weapons.length && run.shop?.slots[i]?.kind === 'weapon' ? 'merge' : 'buy');
    return !!r;
  };
  const doReroll = () => { const r = reroll(run, props.unlocks); if (r) props.onRun(r, 'reroll'); return !!r; };
  const doLock = (i: number) => { if (!v.canLock) return false; props.onRun(toggleLock(run, i)); return true; };
  useScreenKeys((k) => {
    if (k === 'l') { lockNext.current = true; return true; }
    const n = /^[1-6]$/.test(k) ? Number(k) : 0;
    if (n) {
      const locking = lockNext.current;
      lockNext.current = false;
      return locking ? doLock(n - 1) : doBuy(n - 1);
    }
    lockNext.current = false;
    if (k === 'r') return doReroll();
    if (k === 'enter' && props.baking === null) { props.onNext(); return true; }
    return false;
  }, [run, props.baking]);

  const onChip = () => {
    if (wide) {
      const h = document.getElementById('mj-aside-h');
      if (h) { h.focus({ preventScroll: true }); h.scrollIntoView({ block: 'nearest' }); return; }
      props.onWho?.();
      return;
    }
    if (props.onWho) { props.onWho(); return; }
    setTab('who');
    tabsRef.current?.scrollIntoView({ block: 'start', behavior: calmNow() ? 'auto' : 'smooth' });
  };

  const boss = isBossWave(w) && plan.boss ? bossName(plan.boss.ids.includes('mirrorself') ? 'mirrorself' : plan.boss.twins ? 'twins' : plan.boss.ids[0], t) : null;
  const lng = lang.value === 'en' ? 'en' : 'zh';
  const tabs: [Tab, string][] = [['who', termName('panel', t)], ['wpn', t('兵器', 'Weapons')], ['bag', t('行囊', 'Pack')]];

  const main = (
    <div class="mj-shop-main">
      {v.preview && (v.preview.elites.length > 0 || v.preview.hazards.length > 0) && (
        <p class="mj-preview">
          <span class="mj-preview-tag">{t('棋士预见', 'Foresight')}</span>
          {v.preview.elites.map((id) => <span class="mj-preview-item"><Icon id={`elite:${id}`} px={22} /> {nameOf(id, t)}</span>)}
          {v.preview.hazards.map((id) => <span class="mj-preview-item">{t(HAZARD_REG.find((h) => h.id === id)!.zh, HAZARD_REG.find((h) => h.id === id)!.en)}</span>)}
          {!v.preview.elites.length && <span class="muted">{t(`没有${termName('elite', (z) => z)}`, 'no elites')}</span>}
        </p>
      )}
      {run.char === 'cat' ? <p class="mj-quip">{t('大橘在柜台上打盹。', 'Big Ginger naps on the counter.')}</p>
        : COMPANIONS[run.char].quip ? <p class="mj-quip">{t(COMPANIONS[run.char].quip!.zh, COMPANIONS[run.char].quip!.en)}</p> : null}

      <div class="mj-slots" role="list" data-tut="slots">
        {v.slots.map((s, i) => (
          <div class={'mj-slot' + (s.slot?.locked ? ' is-locked' : '')} role="listitem">
            {s.slot ? (
              <GearCard
                kind={s.slot.kind}
                id={s.slot.id}
                tier={s.slot.kind === 'weapon' ? s.slot.t : undefined}
                t={t}
                hotkey={String(i + 1)}
                onClick={() => doBuy(i)}
                disabled={!s.afford}
                tut={`slot:${i}`}
                run={run}
                label={t(`买 ${nameOf(s.slot.id, t)}，${s.price} 月华`, `Buy ${nameOf(s.slot.id, t)} for ${s.price} moonlight`)}
              >
                <div class="mj-price">
                  <span class={'num' + (run.moon < s.price ? ' is-short' : '')}><i class="mj-moon-dot" aria-hidden="true" />{s.price}</span>
                  {s.merges && <span class="mj-merge-tag" title={termLine('merge', t)}>{t('可合铸', 'merges')}</span>}
                  {s.slot.kind === 'item' && (run.items[s.slot.id] ?? 0) > 0 && <span class="mj-own">{t(`已有 ${run.items[s.slot.id]}`, `have ${run.items[s.slot.id]}`)}</span>}
                </div>
              </GearCard>
            ) : (
              <div class="mj-card mj-card-sold" data-tut={`slot:${i}`}><span class="brush">{t('已售', 'Sold')}</span></div>
            )}
            {s.slot && (
              <button
                type="button"
                class={'mj-lock' + (lng === 'en' ? ' is-en' : '')}
                data-tut={`lock:${i}`}
                aria-pressed={s.slot.locked}
                disabled={!v.canLock}
                onClick={() => doLock(i)}
                title={termLine('lock', t)}
                aria-label={s.slot.locked ? t('解锁', 'Unlock') : t('锁住（留到下一次商店）', 'Lock (keep it for the next shop)')}
              >{termName('lock', t)}</button>
            )}
          </div>
        ))}
      </div>

      <div class="mj-shop-bar">
        <button type="button" class="btn" data-tut="reroll" onClick={doReroll} disabled={!v.canReroll} title={termLine('reroll', t)}>
          {noReroll(run) ? t(`破釜沉舟：不能${termName('reroll', (z) => z)}`, 'No rerolls (Burn the Boats)') : v.freeRerolls > 0 ? t(`${termName('reroll', (z) => z)} · 免费 ×${v.freeRerolls}`, `Reroll · free ×${v.freeRerolls}`) : <>{termName('reroll', t)} <span class="mj-moon-cost num">{v.rerollCost}</span></>}
          <kbd class="mj-hotkey-inline">R</kbd>
        </button>
        <span class="muted mj-keys-hint">{t('1–6 购买 · L+数字 锁住 · R 刷新 · Enter 下一重 · C 人物', '1–6 buy · L+number lock · R reroll · Enter next · C character')}</span>
      </div>

      <div class="mj-tabs" role="tablist" data-tut="tabs" ref={tabsRef} aria-label={t('商店分页', 'Shop tabs')}>
        {tabs.filter(([id]) => !(wide && id === 'who')).map(([id, label]) => (
          <button
            type="button"
            role="tab"
            id={`mj-tab-${id}`}
            data-tut={`tab:${id}`}
            aria-selected={tab === id}
            aria-controls="mj-shop-tabpanel"
            class={'mj-tab' + (id === 'who' ? ' is-who' : '')}
            onClick={() => { setTab(id); setSel(null); }}
          >{id === 'who' && <span class="brush mj-tab-glyph" aria-hidden="true">人</span>}{label}</button>
        ))}
      </div>
      <div class="mj-tabpanel" role="tabpanel" id="mj-shop-tabpanel" aria-labelledby={`mj-tab-${tab}`}>
        {tab === 'who' && <CharacterPanel run={run} t={t} density="full" />}
        {tab === 'wpn' && <WeaponsTab run={run} sel={sel} setSel={setSel} onRun={props.onRun} t={t} />}
        {tab === 'bag' && <BagTab run={run} t={t} />}
      </div>
    </div>
  );

  return (
    <section class={'mj-shop' + (wide ? ' has-aside' : '')} aria-label={t('镜市', 'Mirror market')}>
      <header class="mj-shop-top" data-tut="shopTop">
        <WhoChip run={run} onClick={onChip} showName />
        <div class="mj-shop-moon" data-tut="moonTotal" title={termLine('moon', t)}><i class="mj-moon-dot" aria-hidden="true" /><b class="num">{fmtBig(Math.floor(run.moon), lng)}</b><span class="visually-hidden">{termName('moon', t)}</span></div>
        <div class="mj-shop-next">
          <span class="brush">{t(`第 ${w} 重`, `Wave ${w}`)}</span>
          <small>
            {boss ? t(`首领 · ${boss.name}`, `Boss · ${boss.name}`) : plan.kind === 'elite' ? t(`有${termName('elite', (z) => z)}`, 'elite wave') : plan.kind === 'horde' ? termName('horde', t) : t(`这一重 ${plan.len ?? 0} 秒`, `lasts ${plan.len ?? 0} s`)}
          </small>
        </div>
        <button type="button" class="btn btn-small btn-ghost" data-tut="leave" onClick={props.onLeave} title={termLine('leave', t)}>{termName('leave', t)}</button>
        <button type="button" class="btn btn-seal mj-next" data-tut="next" onClick={props.onNext} disabled={props.baking !== null}>
          {props.baking !== null ? t(`研墨 ${Math.round(props.baking * 100)}%`, `Ink ${Math.round(props.baking * 100)}%`) : termName('next', t)}
        </button>
      </header>
      {wide ? (
        <div class="mj-shop-body">
          {main}
          <aside class="mj-shop-aside" data-tut="aside" aria-labelledby="mj-aside-h">
            <CharacterPanel run={run} t={t} density="full" headingId="mj-aside-h" />
          </aside>
        </div>
      ) : main}
    </section>
  );
}

function WeaponsTab(props: { run: RunSave; sel: number | null; setSel: (i: number | null) => void; onRun: (r: RunSave, sfx?: 'merge') => void; t: T }) {
  const { run, t, sel } = props;
  const slots = weaponSlotsOf(run);
  const sets = panelView(run, null, t).sets;
  const w = run.weapons[sel ?? -1];
  const twin = w && sel !== null ? run.weapons.findIndex((x, j) => j !== sel && x.id === w.id && x.t === w.t) : -1;
  const d = w ? describeWeapon(w.id, w.t, t) : null;
  return (
    <div>
      <p class="mj-tabhint">{t('点一把兵器，看它做什么、卖掉或合铸。', 'Tap a weapon to see what it does, sell it or merge it.')}</p>
      <div class="mj-wslots">
        {Array.from({ length: 6 }, (_, i) => {
          const x = run.weapons[i];
          if (i >= slots) return <div class="mj-wslot is-closed" aria-hidden="true">{t('关', '—')}</div>;
          if (!x) return <div class="mj-wslot is-empty" aria-label={t('空位', 'empty slot')} />;
          return (
            <button type="button" data-tut={`wslot:${i}`} class={`mj-wslot tier-${x.t}` + (sel === i ? ' is-sel' : '')} onClick={() => props.setSel(sel === i ? null : i)} aria-label={t(`${nameOf(x.id, t)}，${tierWord(x.t, t)}`, `${nameOf(x.id, t)} ${TIER_ROMAN[x.t]}`)} aria-pressed={sel === i}>
              <Icon id={`wpn:${x.id}`} px={40} />
              <span class="mj-wslot-t num">{t(TIER_ZH[x.t], TIER_ROMAN[x.t])}</span>
            </button>
          );
        })}
      </div>
      {w && sel !== null && d && (
        <div class="mj-wdetail" data-tut="wdetail">
          <b>{nameOf(w.id, t)} <span class="muted">{t(tierWord(w.t, t), `${TIER_ROMAN[w.t]} · ${tierWord(w.t, t)}`)}</span></b>
          {d.head && <p class="mj-card-headline num"><span class="nw">{d.headParts[0]}</span> · <span class="nw">{d.headParts[1]}</span></p>}
          {d.scales && <p class="mj-card-scales"><span>{d.scales}</span></p>}
          <p class="mj-card-text">{d.body}</p>
          {d.t4 && <p class="mj-card-t4">{d.t4}</p>}
          <div class="mj-row-actions">
            <button type="button" class="btn btn-small" data-tut="sell" disabled={run.weapons.length <= 1} title={termLine('sell', t)} onClick={() => { props.onRun(sell(run, sel)); props.setSel(null); }}>
              {termName('sell', t)} <span class="mj-moon-cost num">+{sellPrice(run, w.id, w.t, shopW(run))}</span>
            </button>
            <button type="button" class="btn btn-small" data-tut="merge" disabled={twin < 0 || w.t >= 4} title={termLine('merge', t)} onClick={() => { const r = merge(run, Math.min(sel, twin), Math.max(sel, twin)); if (r) { props.onRun(r, 'merge'); props.setSel(null); } }}>
              {termName('merge', t)} {w.t < 4 && <span class="num">→ {t(tierWord((w.t + 1) as Tier, t), TIER_ROMAN[(w.t + 1) as Tier])}</span>}
            </button>
          </div>
          {w.t < 4 && twin < 0 && <p class="mj-small muted">{t(`再有一把${tierWord(w.t, t)}的${nameOf(w.id, t)}，就能合铸成更高一品。`, `One more ${nameOf(w.id, t)} ${TIER_ROMAN[w.t]} and you can merge them into the next tier.`)}</p>}
        </div>
      )}
      {sets.length > 0 && (
        <div class="mj-sets" data-tut="sets" aria-label={termName('set', t)}>
          <p class="mj-sets-h">{termName('set', t)} <span class="muted">{termLine('set', t)}</span></p>
          {sets.map((c) => (
            <div class={'mj-set' + (c.tier >= 0 ? ' is-on' : '')}>
              <span class="mj-set-name">{c.name}</span>
              <span class="mj-pips" aria-label={t(`${c.count} 把`, `${c.count}`)}>{[2, 4, 6].map((n) => <i class={c.count >= n ? 'is-on' : ''} />)}</span>
              <span class="num">{t(`${c.count} 把`, `${c.count}`)}</span>
              <span class="mj-set-text">
                {c.active && <span>{c.active}</span>}
                {c.next && <span class="muted">{c.active ? ' · ' : ''}{c.next}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BagTab(props: { run: RunSave; t: T }) {
  const { run, t } = props;
  const [open, setOpen] = useState<ItemId | null>(null);
  const ids = (Object.keys(run.items) as ItemId[]).filter((id) => (run.items[id] ?? 0) > 0).sort((a, b) => ITEMS[b].tier - ITEMS[a].tier);
  if (!ids.length) return <p class="muted mj-empty" data-tut="bag">{t('行囊还是空的。', 'Your pack is empty.')}</p>;
  return (
    <div data-tut="bag">
      <p class="mj-tabhint">{t('点一件道具，看它做什么。', 'Tap an item to see what it does.')}</p>
      <div class="mj-bag">
        {ids.map((id) => (
          <button type="button" class={`mj-bagitem tier-${ITEMS[id].tier}` + (open === id ? ' is-sel' : '')} onClick={() => setOpen(open === id ? null : id)} aria-label={`${nameOf(id, t)} ×${run.items[id]}`} aria-pressed={open === id}>
            <Icon id={`item:${id}`} px={36} />
            {(run.items[id] ?? 0) > 1 && <span class="mj-count num">×{run.items[id]}</span>}
          </button>
        ))}
      </div>
      {open && <p class="mj-card-text mj-bag-text"><b>{nameOf(open, t)}</b> · {describeItem(open, t).body}</p>}
    </div>
  );
}

/** Read-only build (pause sheet, results): weapons with tiers, then items with counts. */
export function BuildRow(props: { run: RunSave; t: T; px?: number }) {
  const { run, t } = props;
  const px = props.px ?? 32;
  const items = (Object.keys(run.items) as ItemId[]).filter((id) => (run.items[id] ?? 0) > 0);
  return (
    <div class="mj-build">
      <div class="mj-build-w">
        {run.weapons.map((x) => (
          <span class={`mj-build-slot tier-${x.t}`} title={`${nameOf(x.id, t)} ${t(tierWord(x.t, t), TIER_ROMAN[x.t])}`}>
            <Icon id={`wpn:${x.id}`} px={px} label={`${nameOf(x.id, t)} ${t(tierWord(x.t, t), TIER_ROMAN[x.t])}`} />
            <span class="num">{t(TIER_ZH[x.t], TIER_ROMAN[x.t])}</span>
          </span>
        ))}
      </div>
      {items.length > 0 && (
        <div class="mj-build-i">
          {items.map((id) => (
            <span class={`mj-build-slot tier-${ITEMS[id].tier}`} title={nameOf(id, t)}>
              <Icon id={`item:${id}`} px={px - 6} label={nameOf(id, t)} />
              {(run.items[id] ?? 0) > 1 && <span class="num">×{run.items[id]}</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

