// 水月幻镜 · 镜市, the old mirror-polisher's shop (GDD §7, §18.7): slots with prices and locks, the
// reroll, and the bottom tabs 兵器 (sell · 合铸 · class-set pips) · 行囊 · 属性. Every action is a
// pure logic call whose result the controller commits (saved at once). The UI only disables what
// ShopView says. Keys: 1–6 buy, L then a number locks, R rerolls, Enter starts the next wave.
import { useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { HAZARD_REG, type ItemId } from '../ids';
import type { RunSave, StatId, Stats, Tier, Unlocks, WClass } from '../types';
import { COMPANIONS, ITEMS, WEAPONS, WCLASSES, STAT_IDS } from '../data';
import {
  armorReduction, buy, classCounts, computeStats, cooldown, dodgeCapOf, fmtBig, isBossWave, maxHp, merge, moveSpeed, noReroll,
  pickupRadius, reroll, sell, sellPrice, setTiers, shopView, shopW, tierCd, toggleLock, wavePlan, weaponHit, weaponSlotsOf,
} from '../logic';
import { GearCard, useScreenKeys } from './Screens';
import { Icon } from './icons';
import { bossName, className, fmtStatValue, nameOf, statName, TIER_ROMAN, type T } from './text';

type Tab = 'wpn' | 'bag' | 'stats';

export function Shop(props: {
  run: RunSave; unlocks: Unlocks; onRun: (r: RunSave, sfx?: 'buy' | 'reroll' | 'merge') => void; onNext: () => void; onLeave: () => void;
  baking: number | null; onPause: () => void;
}) {
  const t = useT();
  const { run } = props;
  const v = shopView(run);
  const [tab, setTab] = useState<Tab>('wpn');
  const [sel, setSel] = useState<number | null>(null);
  const lockNext = useRef(false);
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

  const boss = isBossWave(w) && plan.boss ? bossName(plan.boss.ids.includes('mirrorself') ? 'mirrorself' : plan.boss.twins ? 'twins' : plan.boss.ids[0], t) : null;
  const lng = lang.value === 'en' ? 'en' : 'zh';

  return (
    <section class="mj-shop" aria-label={t('镜市', 'Mirror market')}>
      <header class="mj-shop-top">
        <div class="mj-shop-moon"><i class="mj-moon-dot" aria-hidden="true" /><b class="num">{fmtBig(Math.floor(run.moon), lng)}</b><span class="visually-hidden">{t('月华', 'Moonlight')}</span></div>
        <div class="mj-shop-next">
          <span class="brush">{t(`第 ${w} 重`, `Wave ${w}`)}</span>
          <small>
            {boss ? t(`首领 · ${boss.name}`, `Boss · ${boss.name}`) : plan.kind === 'elite' ? t('精怪之重', 'elite wave') : plan.kind === 'horde' ? t('群魔之重', 'horde wave') : t(`${plan.len ?? 0} 秒`, `${plan.len ?? 0} s`)}
          </small>
        </div>
        <button type="button" class="btn btn-small btn-ghost" onClick={props.onLeave} title={t('存档离开，不花钱', 'Save and leave, free')}>{t('暂离', 'Step away')}</button>
        <button type="button" class="btn btn-seal mj-next" onClick={props.onNext} disabled={props.baking !== null}>
          {props.baking !== null ? t(`研墨 ${Math.round(props.baking * 100)}%`, `Ink ${Math.round(props.baking * 100)}%`) : t('下一重', 'Next wave')}
        </button>
      </header>
      {v.preview && (v.preview.elites.length > 0 || v.preview.hazards.length > 0) && (
        <p class="mj-preview">
          <span class="mj-preview-tag">{t('棋士预见', 'Foresight')}</span>
          {v.preview.elites.map((id) => <span class="mj-preview-item"><Icon id={`elite:${id}`} px={22} /> {nameOf(id, t)}</span>)}
          {v.preview.hazards.map((id) => <span class="mj-preview-item">{t(HAZARD_REG.find((h) => h.id === id)!.zh, HAZARD_REG.find((h) => h.id === id)!.en)}</span>)}
          {!v.preview.elites.length && <span class="muted">{t('无精怪', 'no elites')}</span>}
        </p>
      )}
      {run.char === 'cat' ? <p class="mj-quip">{t('大橘在柜台上打盹。', 'Big Ginger naps on the counter.')}</p>
        : COMPANIONS[run.char].quip ? <p class="mj-quip">{t(COMPANIONS[run.char].quip!.zh, COMPANIONS[run.char].quip!.en)}</p> : null}

      <div class="mj-slots" role="list">
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
                label={t(`买 ${nameOf(s.slot.id, t)}，${s.price} 月华`, `Buy ${nameOf(s.slot.id, t)} for ${s.price} moonlight`)}
              >
                <div class="mj-price">
                  <span class={'num' + (run.moon < s.price ? ' is-short' : '')}><i class="mj-moon-dot" aria-hidden="true" />{s.price}</span>
                  {s.merges && <span class="mj-merge-tag">{t('合', 'merge')}</span>}
                  {s.slot.kind === 'item' && (run.items[s.slot.id] ?? 0) > 0 && <span class="mj-own">{t(`已有 ${run.items[s.slot.id]}`, `have ${run.items[s.slot.id]}`)}</span>}
                </div>
              </GearCard>
            ) : (
              <div class="mj-card mj-card-sold"><span class="brush">{t('已售', 'Sold')}</span></div>
            )}
            {s.slot && (
              <button
                type="button"
                class="mj-lock"
                aria-pressed={s.slot.locked}
                disabled={!v.canLock}
                onClick={() => doLock(i)}
                aria-label={s.slot.locked ? t('解锁', 'Unlock') : t('锁定（留到下一重）', 'Lock (keep for the next shop)')}
              >{s.slot.locked ? '锁' : '锁'}</button>
            )}
          </div>
        ))}
      </div>

      <div class="mj-shop-bar">
        <button type="button" class="btn" onClick={doReroll} disabled={!v.canReroll}>
          {noReroll(run) ? t('破釜沉舟：不可重抽', 'No rerolls (破釜沉舟)') : v.freeRerolls > 0 ? t(`重抽 · 免费 ×${v.freeRerolls}`, `Reroll · free ×${v.freeRerolls}`) : <>{t('重抽', 'Reroll')} <span class="mj-moon-cost num">{v.rerollCost}</span></>}
          <kbd class="mj-hotkey-inline">R</kbd>
        </button>
        <span class="muted mj-keys-hint">{t('1–6 购买 · L+数字 锁定 · Enter 下一重', '1–6 buy · L+number lock · Enter next')}</span>
      </div>

      <div class="mj-tabs" role="tablist">
        {([['wpn', t('兵器', 'Weapons')], ['bag', t('行囊', 'Pack')], ['stats', t('属性', 'Stats')]] as const).map(([id, label]) => (
          <button type="button" role="tab" aria-selected={tab === id} class="mj-tab" onClick={() => { setTab(id); setSel(null); }}>{label}</button>
        ))}
      </div>
      <div class="mj-tabpanel" role="tabpanel">
        {tab === 'wpn' && <WeaponsTab run={run} sel={sel} setSel={setSel} onRun={props.onRun} t={t} />}
        {tab === 'bag' && <BagTab run={run} t={t} />}
        {tab === 'stats' && <StatsPanel run={run} t={t} />}
      </div>
    </section>
  );
}

function WeaponsTab(props: { run: RunSave; sel: number | null; setSel: (i: number | null) => void; onRun: (r: RunSave, sfx?: 'merge') => void; t: T }) {
  const { run, t, sel } = props;
  const slots = weaponSlotsOf(run);
  const cnt = classCounts(run);
  const tiers = setTiers(run);
  const w = run.weapons[sel ?? -1];
  const twin = w && sel !== null ? run.weapons.findIndex((x, j) => j !== sel && x.id === w.id && x.t === w.t) : -1;
  return (
    <div>
      <div class="mj-wslots">
        {Array.from({ length: 6 }, (_, i) => {
          const x = run.weapons[i];
          if (i >= slots) return <div class="mj-wslot is-closed" aria-hidden="true">{t('关', '—')}</div>;
          if (!x) return <div class="mj-wslot is-empty" aria-label={t('空槽', 'empty slot')} />;
          return (
            <button type="button" class={`mj-wslot tier-${x.t}` + (sel === i ? ' is-sel' : '')} onClick={() => props.setSel(sel === i ? null : i)} aria-label={`${nameOf(x.id, t)} ${TIER_ROMAN[x.t]}`} aria-pressed={sel === i}>
              <Icon id={`wpn:${x.id}`} px={40} />
              <span class="mj-wslot-t num">{TIER_ROMAN[x.t]}</span>
            </button>
          );
        })}
      </div>
      {w && sel !== null && (
        <div class="mj-wdetail">
          <b>{nameOf(w.id, t)} {TIER_ROMAN[w.t]}</b>
          <p class="mj-card-text">{t(WEAPONS[w.id].text.zh, WEAPONS[w.id].text.en)}</p>
          <div class="mj-row-actions">
            <button type="button" class="btn btn-small" disabled={run.weapons.length <= 1} onClick={() => { props.onRun(sell(run, sel)); props.setSel(null); }}>
              {t('卖', 'Sell')} <span class="mj-moon-cost num">+{sellPrice(run, w.id, w.t, shopW(run))}</span>
            </button>
            <button type="button" class="btn btn-small" disabled={twin < 0 || w.t >= 4} onClick={() => { const r = merge(run, Math.min(sel, twin), Math.max(sel, twin)); if (r) { props.onRun(r, 'merge'); props.setSel(null); } }}>
              {t('合铸', 'Merge')} {w.t < 4 && <span class="num">→ {TIER_ROMAN[(w.t + 1) as Tier]}</span>}
            </button>
          </div>
        </div>
      )}
      <div class="mj-sets" aria-label={t('类别套装', 'Class sets')}>
        {WCLASSES.filter((c) => (cnt[c] ?? 0) > 0).map((c: WClass) => (
          <span class={'mj-set' + ((tiers[c] ?? -1) >= 0 && (cnt[c] ?? 0) >= 2 ? ' is-on' : '')}>
            {className(c, t)}
            <span class="mj-pips" aria-label={`${cnt[c]}`}>{[2, 4, 6].map((n) => <i class={(cnt[c] ?? 0) >= n ? 'is-on' : ''} />)}</span>
            <span class="num">{cnt[c]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function BagTab(props: { run: RunSave; t: T }) {
  const { run, t } = props;
  const [open, setOpen] = useState<ItemId | null>(null);
  const ids = (Object.keys(run.items) as ItemId[]).filter((id) => (run.items[id] ?? 0) > 0).sort((a, b) => ITEMS[b].tier - ITEMS[a].tier);
  if (!ids.length) return <p class="muted mj-empty">{t('行囊尚空。', 'Your pack is empty.')}</p>;
  return (
    <div>
      <div class="mj-bag">
        {ids.map((id) => (
          <button type="button" class={`mj-bagitem tier-${ITEMS[id].tier}` + (open === id ? ' is-sel' : '')} onClick={() => setOpen(open === id ? null : id)} aria-label={`${nameOf(id, t)} ×${run.items[id]}`} aria-pressed={open === id}>
            <Icon id={`item:${id}`} px={36} />
            {(run.items[id] ?? 0) > 1 && <span class="mj-count num">×{run.items[id]}</span>}
          </button>
        ))}
      </div>
      {open && <p class="mj-card-text mj-bag-text"><b>{nameOf(open, t)}</b> · {t(ITEMS[open].text.zh, ITEMS[open].text.en)}</p>}
    </div>
  );
}

/** Every stat, the derived numbers (减伤, dodge chance, pickup radius, speed) and each weapon's DPS. */
export function StatsPanel(props: { run: RunSave; t: T }) {
  const { run, t } = props;
  const s: Stats = computeStats(run);
  const cap = dodgeCapOf(run);
  const rows: { k: string; v: string; hint?: string }[] = [
    { k: t('减伤', 'Damage reduction'), v: `${armorReduction(s.armor)}%` },
    { k: t('闪避率', 'Dodge chance'), v: `${Math.round(Math.min(s.dodge, cap))}%`, hint: t(`上限 ${cap}%`, `cap ${cap}%`) },
    { k: t('拾取半径', 'Pickup radius'), v: `${Math.round(pickupRadius(s))} u` },
    { k: t('移速', 'Move speed'), v: `${Math.round(moveSpeed(s))} u/s` },
  ];
  return (
    <div class="mj-stats">
      <dl class="mj-statgrid">
        <div class="mj-stat is-hp"><dt>{statName('hp', t)}</dt><dd class="num">{maxHp(s)}</dd></div>
        {STAT_IDS.filter((id: StatId) => id !== 'hp').map((id) => (
          <div class={'mj-stat' + (s[id] < 0 ? ' is-neg' : s[id] > 0 ? ' is-pos' : '')}><dt>{statName(id, t)}</dt><dd class="num">{fmtStatValue(id, s[id])}</dd></div>
        ))}
      </dl>
      <dl class="mj-statgrid mj-derived">
        {rows.map((r) => <div class="mj-stat"><dt>{r.k}</dt><dd class="num">{r.v}{r.hint && <small> {r.hint}</small>}</dd></div>)}
      </dl>
      {run.weapons.length > 0 && (
        <table class="mj-dps">
          <caption>{t('兵器每秒伤害（约）', 'Weapon damage per second (approx.)')}</caption>
          <tbody>
            {run.weapons.map((x) => {
              const def = WEAPONS[x.id];
              const h = weaponHit(run, s, x.id, x.t);
              const half = def.kind === 'paint' || def.kind === 'turret' || def.kind === 'mine';
              const cd = cooldown(tierCd(def, x.t), s.aspd, half);
              const dps = (h.raw * h.mult * (1 + h.crit * (h.critM - 1))) / cd;
              return (
                <tr>
                  <th scope="row"><Icon id={`wpn:${x.id}`} px={22} /> {nameOf(x.id, t)} <span class="num">{TIER_ROMAN[x.t]}</span></th>
                  <td class="num">{fmtBig(Math.round(dps), lang.value === 'en' ? 'en' : 'zh')}</td>
                  <td class="num muted">{cd.toFixed(2)} s</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="muted mj-stats-note">{t(`${nameOf(run.char, t)} · ${COMPANIONS[run.char].slots} 兵器槽`, `${nameOf(run.char, t)} · ${COMPANIONS[run.char].slots} weapon slots`)}</p>
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
          <span class={`mj-build-slot tier-${x.t}`} title={`${nameOf(x.id, t)} ${TIER_ROMAN[x.t]}`}>
            <Icon id={`wpn:${x.id}`} px={px} label={`${nameOf(x.id, t)} ${TIER_ROMAN[x.t]}`} />
            <span class="num">{TIER_ROMAN[x.t]}</span>
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

