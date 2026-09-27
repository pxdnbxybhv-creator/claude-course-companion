// 食单 · the valley's menu book (spec §3.9): a page for each of the seventeen dishes — tasted, its
// painted top, the cook's seal, where and when it is served, the taste note, how many times eaten, the
// day of the first taste and who you first ate it with; untasted, an ink silhouette and a hint in the
// cook's voice — the six games' bests and seals, and the 特写 setting. A Sheet over the walk (WalkView
// pauses the world while it is open), and the chip that opens it in the valley.
//
// Owner: F (food).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { lang, today } from '../../../app/store';
import { play } from '../../../app/play';
import { Sheet, Segmented } from '../../../ui/kit';
import { Portrait } from '../../quests/bits';
import { enqueuePaint } from '../../quests/paint';
import { doneDate } from '../../quests/helpers';
import { CHARACTERS, type CharacterId } from '../../../data/characters';
import { TYXI_GAMES } from '../../games/economy';
import { pickDaily } from '../features/npcs/logic';
import { VILLAGERS } from '../features/taoyuan/folk';
import { COOKS, DISHES, GAME_SEAL, SHIDAN, seasonHint, seasonWait } from '../features/taoyuan/life/food';
import {
  EAT_PREFIX, GAME_IDS, SEASON_DISHES, YEAR_DISHES, ZHIWEI_TARGET, ateKey, bestGentleKey, bestKey, eatKey, sealKey,
} from '../features/taoyuan/life/keys';
import { seasonAt } from '../features/taoyuan/life/table-logic';
import { thumbCached, thumbOf } from '../features/taoyuan/life/paint';
import type { DishId, GameId, Line } from '../features/taoyuan/life/types';
import { closeShidan, gameDay, lifeHere, openShidan, pvSetting, setPvSetting, shidanSheet, type PvSetting, type ShidanTab } from './state';
import './shidan.css';

type T = (zh: string, en: string) => string;
type Flags = Readonly<Record<string, true | undefined>>;
const L = (t: T, l: Line) => t(l.zh, l.en);
const COLS = 4;

/** 知味: every dish tasted counts (the quest counts the same flags), shown up to 12. */
export function zhiweiCount(f: Flags): number {
  return Object.keys(f).filter((k) => k.startsWith(EAT_PREFIX) && f[k]).length;
}

// ───────────────────────────── the chip (WalkView shows it in the 案卷 chip's slot)

/** 「食 · 食单」: in the valley, while everyday life is open and the case is not. */
export function ShidanChip(props: { disabled?: boolean }) {
  const t = useT();
  if (!lifeHere.value) return null;
  const n = Math.min(ZHIWEI_TARGET, zhiweiCount(play.value.flags));
  return (
    <button type="button" class="walk-case-chip sd-chip" disabled={props.disabled} aria-haspopup="dialog"
      onClick={(e) => { (e.currentTarget as HTMLElement).blur(); openShidan(); }}
      aria-label={t(`食单 · 知味 ${n}/12`, `Menu book · tastes ${n}/12`)}>
      <span class="brush" aria-hidden="true">食</span>
      <span class="case-chip-label">{t('食单', 'Menu book')}</span>
      <small aria-hidden="true">{n}/12</small>
    </button>
  );
}

// ───────────────────────────── the sheet

export function ShidanSheet() {
  const t = useT();
  const tab = shidanSheet.value;
  const open = tab !== null;
  const f = play.value.flags;
  const n = Math.min(ZHIWEI_TARGET, zhiweiCount(f));
  return (
    <Sheet open={open} onClose={closeShidan} title={L(t, SHIDAN.title)} label={L(t, SHIDAN.title)}>
      <div class="sd-sheet">
        <p class="sd-count num">{L(t, SHIDAN.count(n))}</p>
        <Segmented<ShidanTab> value={tab ?? 'dishes'} onChange={(v) => openShidan(v)} label={L(t, SHIDAN.title)} options={[
          { value: 'dishes', label: L(t, SHIDAN.tabDishes) },
          { value: 'games', label: L(t, SHIDAN.tabGames) },
          { value: 'set', label: L(t, SHIDAN.tabSet) },
        ]} />
        {tab === 'dishes' && <Dishes t={t} f={f} />}
        {tab === 'games' && <Games t={t} />}
        {tab === 'set' && <Setting t={t} f={f} />}
      </div>
    </Sheet>
  );
}

// ───────────────────────────── 食单 · the seventeen pages

function Dishes(props: { t: T; f: Flags }) {
  const { t, f } = props;
  const [openId, setOpenId] = useState<DishId | null>(null);
  const season = useMemo(() => seasonAt(new Date()), [today.value]);
  const grid = (ids: readonly DishId[], label?: Line) => {
    const at = openId ? ids.indexOf(openId) : -1;
    // (the open page spans the grid, right after the row of its tile)
    const rowEnd = at < 0 ? -1 : Math.min(ids.length - 1, Math.floor(at / COLS) * COLS + COLS - 1);
    const out = [];
    for (let i = 0; i < ids.length; i++) {
      const d = ids[i];
      out.push(<Tile key={d} d={d} t={t} f={f} open={openId === d} season={season} onToggle={() => setOpenId(openId === d ? null : d)} />);
      if (i === rowEnd && openId) out.push(<Page key={`p:${openId}`} d={openId} t={t} f={f} season={season} />);
    }
    return (
      <section class="sd-sec">
        {label && <h3 class="sd-sec-h">{L(t, label)}</h3>}
        <ul class="sd-grid" role="list">{out}</ul>
      </section>
    );
  };
  return (
    <div class="sd-dishes">
      {grid(YEAR_DISHES)}
      {grid(SEASON_DISHES, SHIDAN.seasonRow)}
    </div>
  );
}

function Tile(props: { d: DishId; t: T; f: Flags; open: boolean; season: string; onToggle(): void }) {
  const { d, t, f } = props;
  const dish = DISHES[d];
  const tasted = !!f[eatKey(d)];
  const wait = dish.season && !tasted && dish.season !== props.season;
  return (
    <li class={'sd-tile' + (tasted ? ' is-tasted' : ' is-blank') + (props.open ? ' is-open' : '')}>
      <button type="button" class="sd-tile-btn" aria-expanded={props.open} onClick={props.onToggle}
        aria-label={tasted ? t(dish.zh, dish.en) : t(`${dish.zh} · 还没尝过`, `${dish.en} · not tasted yet`)}>
        <span class="sd-thumb"><Thumb d={d} /></span>
        <span class="sd-tile-name">{tasted || !wait ? t(dish.zh, dish.en) : L(t, seasonWait(dish.season!))}</span>
        {tasted && <span class="sd-tile-seal brush" aria-hidden="true">{COOKS[dish.cook].seal}</span>}
      </button>
    </li>
  );
}

/** A dish's painted top at 160 px, painted through the quest book's paint queue (a few a frame). */
function Thumb(props: { d: DishId }) {
  const [src, setSrc] = useState(() => thumbCached(props.d) ?? '');
  useEffect(() => {
    const hit = thumbCached(props.d);
    if (hit) { setSrc(hit); return; }
    return enqueuePaint(() => setSrc(thumbOf(props.d)));
  }, [props.d]);
  return src ? <img src={src} alt="" width={160} height={160} decoding="async" /> : <i class="sd-thumb-wait" aria-hidden="true" />;
}

/** Who you first ate it with (flag tyl:with:<dish>:<companion>). */
function firstWith(f: Flags, d: DishId): CharacterId | null {
  for (const c of CHARACTERS) if (f[`tyl:with:${d}:${c.id}`]) return c.id;
  return null;
}

function Page(props: { d: DishId; t: T; f: Flags; season: string }) {
  const { d, t, f } = props;
  const p = play.value;
  const dish = DISHES[d];
  const cook = VILLAGERS[dish.cook];
  const tasted = !!f[eatKey(d)];
  if (!tasted) {
    const wait = dish.season && dish.season !== props.season;
    const hint = wait ? seasonHint(dish.season!) : d === 'taocha' && !f['case:hz:solved'] && dish.hintLocked ? dish.hintLocked : dish.hint;
    // (a seasonal page waiting for its season names nothing; the others say what they are)
    return (
      <li class="sd-page is-blank" aria-live="polite">
        <span class="sd-page-thumb"><Thumb d={d} /></span>
        <div class="sd-page-body">
          <h4 class={lang.value === 'zh' ? 'brush' : 'latin'}>{wait ? L(t, seasonWait(dish.season!)) : t(dish.zh, dish.en)}</h4>
          <p class="sd-page-meta">{L(t, SHIDAN.untasted)}</p>
          <blockquote class="sd-hint"><b>{t(cook.zh, cook.en)}</b>{lang.value === 'zh' ? `「${hint.zh}」` : `“${hint.en}”`}</blockquote>
        </div>
      </li>
    );
  }
  const times = p.counters[ateKey(d)] ?? 1;
  const day = p.done[eatKey(d)];
  const who = firstWith(f, d);
  const c = who ? CHARACTERS.find((x) => x.id === who) : null;
  return (
    <li class="sd-page is-tasted" aria-live="polite">
      <span class="sd-page-thumb"><Thumb d={d} /></span>
      <div class="sd-page-body">
        <h4>
          <span class={lang.value === 'zh' ? 'brush' : 'latin'}>{t(dish.zh, dish.en)}</span>
          <span class="sd-seal brush" aria-label={t(`${cook.zh}做的`, `Made by ${cook.en}`)}>{COOKS[dish.cook].seal}</span>
        </h4>
        <p class="sd-page-meta">{L(t, dish.where)}</p>
        <p class="sd-note">{lang.value === 'zh' ? `「${dish.note.zh}」` : `“${dish.note.en}”`}</p>
        <p class="sd-page-foot">
          <span class="num">{L(t, SHIDAN.times(times))}</span>
          {day && <span>{L(t, SHIDAN.firstOn)} · {doneDate(day, lang.value)}</span>}
          {c && (
            <span class="sd-with" title={t(`头一回同${c.zh}一起吃`, `First eaten as ${c.en}`)}>
              {L(t, SHIDAN.with)} <Portrait id={c.id} locked={false} size={26} class="sd-with-face" /> {t(c.zh, c.en)}
            </span>
          )}
        </p>
      </div>
    </li>
  );
}

// ───────────────────────────── 六戏 · the games' bests and seals

function Games(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const day = today.value;
  const info = gameDay.value;
  const yueOf = (g: GameId) => (info ? !!info(g, day)?.yue : pickDaily(GAME_IDS, day, 'tyl:yue') === g);
  return (
    <ul class="sd-games" role="list">
      {GAME_IDS.map((g) => {
        const sealed = !!p.flags[sealKey(g)];
        const best = p.best[bestKey(g)] ?? 0;
        const gentle = p.best[bestGentleKey(g)] ?? 0;
        const twist = info?.(g, day)?.twist ?? null;
        const yue = yueOf(g);
        return (
          <li key={g} class={'sd-game' + (sealed ? ' is-sealed' : '')}>
            <span class={'sd-game-seal brush' + (sealed ? '' : ' is-empty')} aria-label={sealed ? L(t, SHIDAN.sealed) : L(t, SHIDAN.unsealed)}>{sealed ? GAME_SEAL[g] : ''}</span>
            <div class="sd-game-body">
              <b>{t(TYXI_GAMES[g].zh, TYXI_GAMES[g].en)}{yue && <span class="sd-yue">{L(t, SHIDAN.yue)}</span>}</b>
              <small>
                {best || gentle
                  ? <>{L(t, SHIDAN.best)} <span class="num">{best}</span>{gentle > 0 && <> · {L(t, SHIDAN.gentle)} <span class="num">{gentle}</span></>}</>
                  : L(t, SHIDAN.none)}
              </small>
              {twist && <small class="sd-twist">{L(t, SHIDAN.twist)} · {L(t, twist)}</small>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ───────────────────────────── 设 · the 特写 setting

function Setting(props: { t: T; f: Flags }) {
  const { t, f } = props;
  const cur = pvSetting(f);
  const opts: { v: PvSetting; name: Line; note: Line }[] = [
    { v: 'all', name: SHIDAN.pvAll, note: SHIDAN.pvAllNote },
    { v: 'first', name: SHIDAN.pvFirst, note: SHIDAN.pvFirstNote },
    { v: 'off', name: SHIDAN.pvOff, note: SHIDAN.pvOffNote },
  ];
  return (
    <fieldset class="sd-set">
      <legend>{L(t, SHIDAN.pv)}</legend>
      {opts.map((o) => (
        <label key={o.v} class={'sd-opt' + (cur === o.v ? ' is-on' : '')}>
          <input type="radio" name="sd-pv" value={o.v} checked={cur === o.v} onChange={() => setPvSetting(o.v)} />
          <span class="sd-opt-name">{L(t, o.name)}</span>
          <small>{L(t, o.note)}</small>
        </label>
      ))}
    </fieldset>
  );
}

/** (for WalkView's pause list) The sheet is open. */
export const shidanOpen = (): boolean => shidanSheet.value !== null;
