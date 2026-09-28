// 水月幻镜 · 人物, the character panel (mirror3 d-panel §3, CONTRACTS §4): who you are, the four numbers
// that keep you alive as big tiles in plain words, what your 镜技 and 天性 do, each weapon's damage per
// second, your class sets, your items, then the other stats grouped, with every tile and row opening one
// plain line on a tap (or a hover). One component in three densities: 'full' (the shop, the 人物 sheet),
// 'compact' (the pause sheet, mid-wave) and 'card' (read-only recaps). Numbers come from panelView.ts;
// words from the glossary and describe.ts. It never imports tutorial code: the coach finds its targets by
// their data-tut attributes and reads the ARIA state (aria-expanded) after a click.
import type { ComponentChildren } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { mirror } from '../../../app/mirror';
import { Sheet } from '../../../ui/kit';
import { COMPANION_REG, PASSIVE_REG, SKILL_REG } from '../ids';
import type { HudState, RunSave } from '../types';
import { COMPANIONS } from '../data';
import { termLine, termName } from '../data/glossary';
import { fmtBig } from '../logic';
import { describeItem, describePassive, describeSkill } from './describe';
import { Icon, Portrait } from './icons';
import { calmNow } from './prefs';
import { companionView, panelBase, panelView, type DeltaChip, type PanelBase, type PanelView, type TileView } from './panelView';
import type { CharacterId } from '../types';
import type { T } from './text';

export type Density = 'full' | 'compact' | 'card';

let uid = 0;
const useIds = (): string => useMemo(() => `mjcp${++uid}`, []);
const coarse = (): boolean => { try { return matchMedia('(pointer: coarse)').matches; } catch { return true; } };
const TIER_SEAL = ['', '凡', '灵', '仙', '神'] as const;

/** A small ⓘ button that opens one plain line below its row. */
function InfoToggle(props: { open: boolean; onToggle: () => void; controls: string; label: string }) {
  return (
    <button type="button" class="mj-cp-info" aria-expanded={props.open} aria-controls={props.controls} aria-label={props.label} onClick={props.onToggle}>
      <span aria-hidden="true">ⓘ</span>
    </button>
  );
}
function Delta(props: { d: DeltaChip | null }) {
  if (!props.d) return null;
  return <span class={`mj-cp-delta is-${props.d.tone}`}><span aria-hidden="true">{props.d.text}</span><span class="visually-hidden">{props.d.aria}</span></span>;
}

/** The four body tiles (2×2 at every width); a tap opens the tile's plain line under the grid. */
function Tiles(props: { tiles: TileView[]; live?: HudState | null; t: T; id: string; dots?: number[]; small?: boolean }) {
  const { t } = props;
  const [open, setOpen] = useState<string | null>(null);
  const live = props.live;
  return (
    <div class="mj-cp-tilewrap" data-tut="panelTiles">
      <div class={'mj-cp-tiles' + (props.small ? ' is-small' : '')}>
        {props.tiles.map((x, i) => {
          const isHp = x.id === 'hp';
          const value = isHp && live ? `${Math.ceil(Math.max(0, live.hp))} / ${Math.round(Math.max(1, live.hpMax))}` : x.value;
          const aria = `${x.label}：${x.word ? x.word + ' ' : ''}${value}，${x.sub}`;
          return (
            <button
              type="button"
              class={`mj-tile is-${x.id} is-${x.tone}` + (open === x.id ? ' is-open' : '')}
              data-tut={`tile:${x.id}`}
              aria-expanded={open === x.id}
              aria-controls={`${props.id}-tg`}
              aria-label={t(aria, `${x.label}: ${x.word ? x.word + ' ' : ''}${value}, ${x.sub}`)}
              title={x.gloss}
              onClick={() => setOpen(open === x.id ? null : x.id)}
            >
              <span class="mj-tile-label" aria-hidden="true">{x.label}</span>
              <span class="mj-tile-value" aria-hidden="true">
                {x.word && <span class="mj-tile-word">{x.word}</span>}
                <b class="num">{value}</b>
                <Delta d={x.delta} />
              </span>
              {isHp && live && <i class="mj-tile-bar" aria-hidden="true"><b style={{ width: `${Math.max(0, Math.min(100, (live.hp / Math.max(1, live.hpMax)) * 100))}%` }} /></i>}
              <span class="mj-tile-sub" aria-hidden="true">{x.sub}</span>
              {props.dots && (
                <span class="mj-tile-dots" aria-hidden="true">{[1, 2, 3, 4, 5].map((k) => <i class={k <= props.dots![i] ? 'is-on' : ''} />)}</span>
              )}
            </button>
          );
        })}
      </div>
      <p id={`${props.id}-tg`} class="mj-cp-gloss" hidden={!open} aria-live="polite">
        {open && <><b>{props.tiles.find((x) => x.id === open)?.label}</b>{t('：', ': ')}{props.tiles.find((x) => x.id === open)?.gloss}</>}
      </p>
    </div>
  );
}

/** The select sheet's body tiles for a companion, each with 1–5 dots against the other twelve. */
export function CompanionTiles(props: { char: CharacterId; t: T }) {
  const id = useIds();
  const v = companionView(props.char, props.t);
  return (
    <div class="mj-cp is-card">
      <Tiles tiles={v.tiles} t={props.t} id={id} dots={v.tiles.map((x) => x.dots)} small />
      {v.extra && <p class="mj-cp-extra">{props.t('另有：', 'Also: ')}{v.extra}</p>}
    </div>
  );
}

/** The companion's 镜技 and 天性 in plain words. */
export function SkillNature(props: { run: Pick<RunSave, 'char'>; live?: HudState | null; t: T; compact: boolean; id: string }) {
  const { t, run } = props;
  const C = COMPANIONS[run.char];
  const reg = SKILL_REG.find((s) => s.id === C.skill);
  const preg = PASSIVE_REG.find((s) => s.id === C.passive);
  const sk = describeSkill(C.skill, t);
  const pa = describePassive(C.passive, t);
  const [more, setMore] = useState(false);
  const glyph = reg?.glyph ?? '技';
  const left = mirror.value.settings.left;
  const how = coarse()
    ? t(`点${left ? '左' : '右'}下角的「${glyph}」就放；按住拖动能自己瞄准，拖回按钮上就取消。`, `Tap the skill button (bottom ${left ? 'left' : 'right'}); drag from it to aim, drag back to cancel.`)
    : t('按 Q 或空格就放。', 'Press Q or Space.');
  const gist = sk.gist || sk.body;
  const cost = pa.cost && !/^无|^None/.test(pa.cost) ? pa.cost : t('没有', 'none');
  return (
    <div class="mj-cp-sec mj-cp-sn">
      <div class="mj-cp-skill" data-tut="panelSkill" id={`${props.id}-skill`}>
        <span class="mj-cp-glyph brush" aria-hidden="true">{glyph}</span>
        <div class="mj-cp-sn-main">
          <p class="mj-cp-sn-head">
            <span class="mj-cp-kicker">{termName('skill', t)}</span>
            <b>{reg ? t(reg.zh, reg.en) : ''}</b>
            <span class="mj-cp-sn-cd">
              {props.live ? (props.live.skillCd > 0.001 ? t('还在冷却', 'Cooling down') : t('现在能放', 'Ready')) : t(`每 ${sk.cd} 秒一次`, `every ${sk.cd} s`)}
            </span>
          </p>
          <p class="mj-cp-sn-line">{gist}</p>
          {!props.compact && <p class="mj-cp-sn-how">{how}</p>}
          {sk.gist && sk.body && sk.body !== sk.gist && (
            <>
              <button type="button" class="mj-cp-more" aria-expanded={more} aria-controls={`${props.id}-skmore`} onClick={() => setMore(!more)}>{more ? t('收起', 'Less') : t('详细', 'Details')}</button>
              <p id={`${props.id}-skmore`} class="mj-cp-sn-line mj-cp-detail" hidden={!more}>{sk.body}</p>
            </>
          )}
        </div>
      </div>
      <div class="mj-cp-nature" data-tut="panelNature">
        <p class="mj-cp-sn-head">
          <span class="mj-cp-kicker">{termName('passive', t)}</span>
          <b>{preg ? t(preg.zh, preg.en) : ''}</b>
        </p>
        <p class="mj-cp-sn-line">{pa.gist || pa.body}</p>
        <p class="mj-cp-cost"><span class="mj-cp-costtag">{termName('cost', t)}</span>{cost}</p>
      </div>
    </div>
  );
}

/** Mid-wave only: what the HUD's marks mean right now. */
function Now(props: { live: HudState; t: T }) {
  const { live, t } = props;
  const rows: [string, string][] = [];
  if (live.drunk !== null) rows.push([t(`醉意 ${Math.round(live.drunk)}`, `Drunk ${Math.round(live.drunk)}`), termLine('drunk', t)]);
  if (live.moonPhase !== null) rows.push([termName('moonPhase', t), termLine('moonPhase', t)]);
  if (live.lives !== null) rows.push([t(`九命：还剩 ${live.lives} 次`, `Lives: ${live.lives} left`), termLine('lives', t)]);
  if (live.curse > 0) rows.push([t(`劫数 ${live.curse}`, `Curse ${live.curse}`), termLine('curse', t)]);
  if (live.shield > 0) rows.push([t(`护盾 ${Math.round(live.shield)}`, `Shield ${Math.round(live.shield)}`), termLine('shield', t)]);
  if (!rows.length) return null;
  return (
    <div class="mj-cp-sec mj-cp-now" data-tut="panelNow">
      <h3 class="mj-cp-h">{t('此刻', 'Right now')}</h3>
      <ul class="mj-cp-marks">{rows.map(([a, b]) => <li><b>{a}</b><span>{b}</span></li>)}</ul>
    </div>
  );
}

/** 「和上一重比」: at most five chips, then 更多. */
function Strip(props: { chips: DeltaChip[]; t: T; id: string }) {
  const { t } = props;
  const [all, setAll] = useState(false);
  if (!props.chips.length) return null;
  const shown = all ? props.chips : props.chips.slice(0, 5);
  return (
    <div class="mj-cp-sec mj-cp-strip" data-tut="panelDelta">
      <span class="mj-cp-strip-h">{t('和上一重比', 'Since last wave')}</span>
      <ul class="mj-cp-chips" id={`${props.id}-strip`}>
        {shown.map((c) => <li class={`mj-cp-chip is-${c.tone}`}>{c.text}</li>)}
      </ul>
      {props.chips.length > 5 && (
        <button type="button" class="mj-cp-more" aria-expanded={all} aria-controls={`${props.id}-strip`} onClick={() => setAll(!all)}>
          {all ? t('收起', 'Less') : t(`更多（${props.chips.length - 5}）`, `More (${props.chips.length - 5})`)}
        </button>
      )}
    </div>
  );
}

function Weapons(props: { v: PanelView; t: T; compact: boolean; id: string }) {
  const { v, t } = props;
  const [open, setOpen] = useState<number | null>(null);
  const [info, setInfo] = useState(false);
  const lng = lang.value === 'en' ? 'en' : 'zh';
  return (
    <div class="mj-cp-sec mj-cp-weapons" data-tut="panelWeapons">
      <div class="mj-cp-sechead">
        <h3 class="mj-cp-h">{t('兵器', 'Weapons')} <span class="mj-cp-count num">{v.weapons.length} / {v.slots}</span></h3>
        <span class="mj-cp-colhead">
          {termName('dps', t)}
          <InfoToggle open={info} onToggle={() => setInfo(!info)} controls={`${props.id}-dps`} label={t('每秒伤害是怎么算的', 'How damage per second is worked out')} />
        </span>
      </div>
      <p id={`${props.id}-dps`} class="mj-cp-gloss" hidden={!info}>{termLine('dps', t)}{t('连击、穿透、弹射、燃烧都没算，拿来比较自己的兵器就好。', ' Combos, pierce, bounces and burns are left out: use it to compare your own weapons.')}</p>
      {!v.weapons.length && <p class="mj-cp-empty">{t('还没有兵器。', 'No weapons yet.')}</p>}
      <ul class="mj-cp-wlist">
        {v.weapons.map((w) => {
          const isOpen = open === w.i;
          const dps = fmtBig(Math.round(w.dps), lng);
          return (
            <li class={`mj-cp-w tier-${w.t}` + (isOpen ? ' is-open' : '')}>
              <button
                type="button"
                class="mj-cp-wrow"
                aria-expanded={props.compact ? undefined : isOpen}
                aria-controls={props.compact ? undefined : `${props.id}-w${w.i}`}
                aria-label={t(`${w.name}，${w.tierWord}，每秒伤害约 ${dps}，${w.line}`, `${w.name} ${w.roman}, about ${dps} damage per second, ${w.line}`)}
                onClick={props.compact ? undefined : () => setOpen(isOpen ? null : w.i)}
                disabled={props.compact}
              >
                <Icon id={`wpn:${w.id}`} px={props.compact ? 26 : 32} />
                <span class="mj-cp-wname" aria-hidden="true">
                  <b>{w.name}</b>
                  <span class="mj-cp-wtier">
                    <span class={`mj-tierseal tier-${w.t}`}>{TIER_SEAL[w.t]}</span>
                    {t(w.tierWord, `${w.roman} · ${w.tierWord}`)}
                    {!props.compact && <span class="mj-cp-wcls"> · {w.classes}</span>}
                  </span>
                  {!props.compact && <span class="mj-cp-wline">{w.line}</span>}
                </span>
                <span class="mj-cp-dps" aria-hidden="true">
                  <b class="num">{dps}</b>
                  <small>{t('每秒', '/ s')}</small>
                  <Delta d={w.delta} />
                </span>
              </button>
              {!props.compact && (
                <div id={`${props.id}-w${w.i}`} class="mj-cp-wmore" hidden={!isOpen}>
                  <p>{w.body}</p>
                  {w.t4 && <p class="mj-card-t4">{w.t4}</p>}
                  <ul>{w.detail.map((d) => <li>{d}</li>)}</ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sets(props: { v: PanelView; t: T; id: string; compact: boolean }) {
  const { v, t } = props;
  const [info, setInfo] = useState(false);
  if (!v.sets.length) return null;
  return (
    <div class="mj-cp-sec mj-cp-sets" data-tut="panelSets">
      <div class="mj-cp-sechead">
        <h3 class="mj-cp-h">{termName('set', t)}</h3>
        <InfoToggle open={info} onToggle={() => setInfo(!info)} controls={`${props.id}-set`} label={t('套装是什么', 'What sets are')} />
      </div>
      <p id={`${props.id}-set`} class="mj-cp-gloss" hidden={!info}>{termLine('set', t)}</p>
      <ul class="mj-cp-setlist">
        {v.sets.filter((s) => !props.compact || s.tier >= 0).map((s) => (
          <li class={'mj-cp-set' + (s.tier >= 0 ? ' is-on' : '')}>
            <p class="mj-cp-sethead">
              <b>{s.name}</b>
              <span class="mj-cp-pips" aria-hidden="true">
                {[0, 1, 2].map((g) => <span class="mj-cp-pipgroup">{[0, 1].map((k) => <i class={s.count > g * 2 + k ? 'is-on' : ''} />)}</span>)}
              </span>
              <span class="num">{t(`${s.count} 件`, `${s.count}`)}</span>
              {s.tier >= 0 && <span class="mj-cp-on">{t('生效中', 'active')}</span>}
            </p>
            {s.active && <p class="mj-cp-setline">{s.active}</p>}
            {!props.compact && s.next && <p class="mj-cp-setnext">{s.next}</p>}
            {!props.compact && s.tier >= 2 && <p class="mj-cp-setnext">{t('已凑满', 'complete')}</p>}
            {s.dugu && <p class="mj-cp-setnext">{t('独孤九剑：只带这一把，算 6 把', 'Lone Sword: carrying only this one counts as 6')}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Items(props: { v: PanelView; t: T; id: string }) {
  const { v, t } = props;
  const [open, setOpen] = useState<string | null>(null);
  if (!v.items.length) return null;
  const sel = v.items.find((x) => x.id === open);
  return (
    <div class="mj-cp-sec mj-cp-items" data-tut="panelItems">
      <h3 class="mj-cp-h">{t('随身道具', 'Items')} <span class="mj-cp-count num">{v.items.reduce((n, x) => n + x.n, 0)}</span></h3>
      <ul class="mj-cp-ichips">
        {v.items.map((x) => (
          <li>
            <button type="button" class={`mj-cp-ichip tier-${x.tier}`} aria-expanded={open === x.id} aria-controls={`${props.id}-item`} onClick={() => setOpen(open === x.id ? null : x.id)}>
              <Icon id={`item:${x.id}`} px={24} />
              <span>{x.name}</span>
              {x.n > 1 && <span class="num">×{x.n}</span>}
            </button>
          </li>
        ))}
      </ul>
      <p id={`${props.id}-item`} class="mj-cp-gloss" hidden={!sel}>{sel && <><b>{sel.name}</b>{t('：', ': ')}{describeItem(sel.id, t).body}</>}</p>
    </div>
  );
}

function Stats(props: { v: PanelView; t: T; id: string; startOpen: boolean }) {
  const { v, t } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [folded, setFolded] = useState(true);
  const [shown, setShown] = useState(props.startOpen);
  if (!shown) {
    return (
      <div class="mj-cp-sec" data-tut="panelStats">
        <button type="button" class="btn btn-small mj-cp-all" aria-expanded={false} onClick={() => setShown(true)}>{t('看全部属性 ▾', 'All stats ▾')}</button>
      </div>
    );
  }
  return (
    <div class="mj-cp-sec mj-cp-stats" data-tut="panelStats">
      {v.groups.map((g) => {
        const rows = folded ? g.rows : [...g.rows, ...g.folded];
        if (!rows.length) return null;
        return (
          <div class="mj-cp-group">
            <h3 class="mj-cp-h" title={g.gloss}>{g.label} <small class="mj-cp-ggloss">{g.gloss}</small></h3>
            <ul class="mj-cp-rows">
              {rows.map((r) => {
                const key = `${r.id}`;
                const isOpen = open === key;
                return (
                  <li class={isOpen ? 'is-open' : ''}>
                    <button
                      type="button"
                      class={`mj-cp-row is-${r.tone}`}
                      aria-expanded={isOpen}
                      aria-controls={`${props.id}-r-${r.id}`}
                      title={r.gloss}
                      onClick={() => setOpen(isOpen ? null : key)}
                    >
                      <span class="mj-cp-rlabel">{r.label}</span>
                      <span class="mj-cp-rval"><b class="num">{r.value}</b><Delta d={r.delta && r.delta.text !== r.value ? r.delta : null} /></span>
                      {r.tag && <span class="mj-cp-rtag">{r.tag}</span>}
                    </button>
                    <p id={`${props.id}-r-${r.id}`} class="mj-cp-gloss mj-cp-rgloss" hidden={!isOpen}>{r.gloss}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {v.hiddenCount > 0 && (
        <button type="button" class="mj-cp-more" aria-expanded={!folded} onClick={() => setFolded(!folded)}>
          {folded ? t(`另有 ${v.hiddenCount} 项还没加过（点开看）`, `${v.hiddenCount} more unchanged (show)`) : t('收起没加过的', 'Hide the unchanged ones')}
        </button>
      )}
    </div>
  );
}

/**
 * The 人物 panel. `live`: the last HUD push (mid-wave: live HP, the skill's readiness, the marks).
 * `base`: the sheet before the wave just won (the change strip); omitted = read from this device.
 */
export function CharacterPanel(props: { run: RunSave; t: T; density: Density; live?: HudState | null; base?: PanelBase | null; headingId?: string; children?: ComponentChildren }) {
  const { run, t, density } = props;
  const id = useIds();
  const base = props.base === undefined ? panelBase(run) : props.base;
  const v = panelView(run, base, t);
  const compact = density !== 'full';
  const C = COMPANIONS[run.char];
  const reg = SKILL_REG.find((s) => s.id === C.skill);
  const level = props.live?.level ?? run.lvl;
  const hid = props.headingId ?? `${id}-h`;
  const wave = run.inWave ?? run.wave + 1;
  return (
    <section class={`mj-cp is-${density}`} data-tut="panel" data-density={density} aria-labelledby={hid}>
      <header class="mj-cp-who">
        <Portrait id={run.char} size={density === 'full' ? 64 : 48} />
        <div class="mj-cp-whomain">
          <h2 class="mj-cp-name brush" id={hid} tabIndex={-1}>{t(nameZh(run.char), nameEn(run.char))}</h2>
          <p class="mj-cp-wholine">
            {density === 'card'
              ? t(`${level} 级 · ${v.slots} 个兵器位`, `level ${level} · ${v.slots} weapon slots`)
              : t(`第 ${wave} 重 · ${level} 级 · ${v.slots} 个兵器位`, `wave ${wave} · level ${level} · ${v.slots} weapon slots`)}
          </p>
        </div>
        {reg && (
          <a class="mj-cp-seal brush" href={`#${id}-skill`} aria-label={t(`镜技：${reg.zh}`, `Skill: ${reg.en}`)} onClick={(e) => { e.preventDefault(); document.getElementById(`${id}-skill`)?.scrollIntoView({ block: 'nearest', behavior: calmNow() ? 'auto' : 'smooth' }); }}>{reg.glyph}</a>
        )}
      </header>
      {props.live && <Now live={props.live} t={t} />}
      {v.delta && density !== 'card' && <Strip chips={v.delta} t={t} id={id} />}
      <Tiles tiles={v.tiles} live={props.live} t={t} id={id} small={compact} />
      <SkillNature run={run} live={props.live} t={t} compact={compact} id={id} />
      <Weapons v={v} t={t} compact={compact} id={id} />
      <Sets v={v} t={t} id={id} compact={compact} />
      <Items v={v} t={t} id={id} />
      <Stats v={v} t={t} id={id} startOpen={density === 'full'} />
      {props.children}
    </section>
  );
}
const nameZh = (c: string) => COMPANION_REG.find((x) => x.id === c)?.zh ?? c;
const nameEn = (c: string) => COMPANION_REG.find((x) => x.id === c)?.en ?? c;

/** The 人物 sheet: the full panel over whatever screen is up (the shop, level-up cards …). */
export function WhoSheet(props: { open: boolean; run: RunSave; onClose: () => void; live?: HudState | null }) {
  const t = useT();
  return (
    <Sheet open={props.open} onClose={props.onClose} title={termName('panel', t)} label={termName('panel', t)}>
      <div class="mj-whosheet">
        {props.open && <CharacterPanel run={props.run} t={t} density="full" live={props.live ?? null} />}
      </div>
    </Sheet>
  );
}

/** The shop header's portrait chip: one tap to 人物. */
export function WhoChip(props: { run: RunSave; onClick: () => void; showName: boolean }) {
  const t = useT();
  const name = t(nameZh(props.run.char), nameEn(props.run.char));
  return (
    <button
      type="button"
      class="mj-whochip"
      data-tut="who"
      onClick={props.onClick}
      aria-label={t(`${termName('panel', t)}：${name}。打开人物面板`, `${termName('panel', t)}: ${name}. Open the character panel`)}
    >
      <span class="mj-whochip-face"><Portrait id={props.run.char} size={36} /></span>
      {props.showName && <span class="mj-whochip-name">{name}</span>}
    </button>
  );
}
