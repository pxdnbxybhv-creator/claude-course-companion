// Two paper cards for the homestead, drawn with Preact into the walk's HUD layer: the naming card (a
// brush title, a field, suggested names to tap) and the household ledger 家园簿 (your pets and
// people: feed, walk together, rename, rehome, dismiss; adopt and hire). While a card is up the
// walker stands still and the keys belong to the card.
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { WorldCtx } from '../../../types';
import { home, HOME_LIMITS } from '../../../../../app/home';
import { play } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { CoinIcon, fmtCoins } from '../../../../../ui/coins';
import { KIND } from '../catalog';
import '../../../../../ui/coins.css';
import './life.css';
import { adoptCheck, FOOD_PRICE, hearts, isRole, isSpecies, nextTrick, ROLE_DEF, ROLES, routineAt, SPECIES, SPECIES_DEF, tricksFor, type Activity, type Role, type Species } from './logic';

type T = (zh: string, en: string) => string;
const tFor = (ctx: WorldCtx): T => (zh, en) => (ctx.lang === 'zh' ? zh : en);

const open = new Set<() => void>();

/** Close every card still up (the world is going away). */
export function closeAllCards(): void {
  for (const c of [...open]) c();
}

/** Mount a card; returns a closer. The walker is held still meanwhile. */
function mountCard(ctx: WorldCtx, node: (close: () => void) => preact.VNode): () => void {
  const host = document.createElement('div');
  host.lang = ctx.lang === 'zh' ? 'zh' : 'en';
  const wasFrozen = ctx.player.isFrozen;
  if (!wasFrozen) ctx.player.freeze(true);
  let off: (() => void) | null = ctx.hud.mount(host);
  const close = () => {
    if (!off) return;
    open.delete(close);
    render(null, host);
    off();
    off = null;
    if (!wasFrozen) ctx.player.freeze(false);
  };
  open.add(close);
  render(node(close), host);
  return close;
}

function Coin() {
  return <i class="coin-icon" aria-hidden="true" />;
}

function Love(props: { love: number }) {
  const n = hearts(props.love);
  return <span class="hl-love" aria-label={`${props.love}/100`}>{[0, 1, 2, 3, 4].map((i) => <i key={i} class={i < n ? 'is-on' : ''} />)}</span>;
}

// ───────────────────────────── the naming card ─────────────────────────────

export interface NameOpts {
  glyph: string;
  titleZh: string;
  titleEn: string;
  noteZh?: string;
  noteEn?: string;
  value?: string;
  suggestions: string[];
}

function NameCard(props: { ctx: WorldCtx; o: NameOpts; done: (v: string | null) => void }) {
  const { ctx, o, done } = props;
  const t = tFor(ctx);
  const [v, setV] = useState(o.value ?? '');
  const [page, setPage] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const per = 6;
  const pages = Math.max(1, Math.ceil(o.suggestions.length / per));
  const chips = o.suggestions.slice((page % pages) * per, (page % pages) * per + per);
  useEffect(() => { setTimeout(() => input.current?.focus(), 60); }, []);
  const ok = () => { const s = v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, HOME_LIMITS.name); if (s) done(s); else input.current?.focus(); };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); ok(); }
    if (e.key === 'Escape') { e.preventDefault(); done(null); }
  };
  return (
    <div class="hl-wrap" role="dialog" aria-modal="true" aria-label={t(o.titleZh, o.titleEn)} onKeyDown={onKey} onClick={(e) => e.target === e.currentTarget && done(null)}>
      <div class="hl-card hl-name-card">
        <div class="hl-head">
          <span class="hl-seal">{o.glyph}</span>
          <div class="hl-title">
            <h2 class={ctx.lang === 'zh' ? '' : 'latin'}>{t(o.titleZh, o.titleEn)}</h2>
            {o.noteZh && <p>{t(o.noteZh, o.noteEn ?? '')}</p>}
          </div>
        </div>
        <div class="hl-name-body">
          <input
            ref={input}
            class="hl-input"
            type="text"
            maxLength={HOME_LIMITS.name}
            value={v}
            placeholder={t('写个名字', 'A name')}
            enterKeyHint="done"
            autoComplete="off"
            onInput={(e) => setV((e.currentTarget as HTMLInputElement).value)}
          />
          {chips.length > 0 && (
            <div class="hl-chips">
              {chips.map((n) => <button type="button" key={n} class={'hl-chip' + (v === n ? ' is-on' : '')} onClick={() => setV(n)}>{n}</button>)}
              {pages > 1 && <button type="button" class="hl-chip" onClick={() => setPage(page + 1)}>{t('换一批', 'More')}</button>}
            </div>
          )}
          <div class="hl-foot">
            <button type="button" class="hl-btn" onClick={() => done(null)}>{t('算了', 'Cancel')}</button>
            <button type="button" class="hl-btn is-red" onClick={ok} disabled={!v.trim()}>{t('就叫这个', 'Name it')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ask for a name (the suggestions are tappable). Resolves with the name, or null if cancelled. */
export function nameCard(ctx: WorldCtx, o: NameOpts): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const close = mountCard(ctx, (closeIt) => <NameCard ctx={ctx} o={o} done={(v) => { if (settled) return; settled = true; closeIt(); resolve(v); }} />);
    void close;
  });
}

// ───────────────────────────── the ledger ─────────────────────────────

export interface LedgerApi {
  feed(uid: string): void;
  follow(uid: string): void;
  renamePet(uid: string): Promise<void>;
  rehome(uid: string): void;
  renameResident(uid: string): Promise<void>;
  dismiss(uid: string): void;
  adopt(species: Species): Promise<unknown>;
  hire(role: Role): Promise<unknown>;
  /** The hour the world shows (for what the residents are doing now). */
  hour(): number;
}

type Tab = 'pets' | 'people' | 'adopt' | 'hire';

const ACT: Record<Activity, [string, string]> = {
  sweep: ['在扫院子', 'sweeping the yard'], report: ['在记账', 'keeping the books'], cook: ['在做饭', 'cooking'], eat: ['在吃饭', 'having a meal'],
  wash: ['在池边洗菜', 'washing greens by the pond'], tend: ['在侍弄花圃', 'tending the beds'], water: ['在浇水', 'watering'], read: ['在读书', 'reading'],
  play: ['在院里玩', 'playing in the yard'], flute: ['在练笛', 'practising the flute'], guard: ['在门口站岗', 'on guard at the gate'], patrol: ['在巡夜', 'on night watch'],
  rest: ['在歇息', 'resting'], chat: ['在院里闲聊', 'chatting in the yard'], away: ['出门赶集去了', 'out at the market'], sleep: ['睡下了', 'asleep'],
};

function Ledger(props: { ctx: WorldCtx; api: LedgerApi; close: () => void; start: Tab }) {
  const { ctx, api, close } = props;
  const t = tFor(ctx);
  const [tab, setTab] = useState<Tab>(props.start);
  const [confirm, setConfirm] = useState('');
  const h = home.value;
  const coins = play.value.coins;
  const day = today.value;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.hl-name-card')) { e.preventDefault(); e.stopPropagation(); close(); } };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);
  const title = h.name ? `「${h.name}」` : t('家园簿', 'Household Ledger');
  const tabs: [Tab, string, string, number | null][] = [
    ['pets', '宠物', 'Pets', h.pets.length],
    ['people', '家人', 'Household', h.residents.length],
    ['adopt', '领养', 'Adopt', null],
    ['hire', '招人', 'Hire', null],
  ];
  const guard = (id: string, fn: () => void) => () => {
    if (confirm === id) { setConfirm(''); fn(); } else setConfirm(id);
  };
  const hour = api.hour();

  let body: preact.VNode;
  if (tab === 'pets') {
    body = h.pets.length ? (
      <div>
        {h.pets.map((p) => {
          const d = isSpecies(p.species) ? SPECIES_DEF[p.species] : null;
          const fed = p.fed === day;
          const known = tricksFor(p.species, p.love);
          const next = nextTrick(p.species, p.love);
          return (
            <div class="hl-row" key={p.uid}>
              <span class="hl-seal is-small is-jade">{d?.glyph ?? '宠'}</span>
              <div class="hl-row-main">
                <div class="hl-name">{p.name || d?.zh}<small>{t(d?.zh ?? '', d?.en ?? '')}{p.follow ? t(' · 随你出门中', ' · out with you') : ''}</small></div>
                <div class="hl-meta">
                  <Love love={p.love} />
                  {fed ? t('今日已喂', 'fed today') : <b>{t('还饿着', 'hungry')}</b>}
                  {known.length > 0 && <span> · {t('会', 'knows')} {known.map((k) => t(k.zh, k.en)).join(t('、', ', '))}</span>}
                  {next && <span> · {t(`亲密到 ${next.love} 学会${next.zh}`, `learns “${next.en}” at ${next.love}`)}</span>}
                </div>
              </div>
              <div class="hl-acts">
                <button type="button" class="hl-btn" disabled={fed || coins < FOOD_PRICE} onClick={() => api.feed(p.uid)}>{t('喂食', 'Feed')} <Coin />{FOOD_PRICE}</button>
                {d?.follows !== false && <button type="button" class={'hl-btn' + (p.follow ? ' is-on' : '')} onClick={() => api.follow(p.uid)}>{p.follow ? t('让它回家', 'Send home') : t('带它出门', 'Take along')}</button>}
                <button type="button" class="hl-btn" onClick={() => api.renamePet(p.uid)}>{t('改名', 'Rename')}</button>
                <button type="button" class={'hl-btn' + (confirm === p.uid ? ' is-red' : ' is-warn')} onClick={guard(p.uid, () => api.rehome(p.uid))}>{confirm === p.uid ? t('真的送走？', 'Really?') : t('送养', 'Rehome')}</button>
              </div>
            </div>
          );
        })}
      </div>
    ) : <p class="hl-empty">{t('还没有宠物。\n先在家园里建个窝，再去「领养」看看。', 'No pets yet.\nBuild a pet home, then have a look under “Adopt”.')}</p>;
  } else if (tab === 'people') {
    body = h.residents.length ? (
      <div>
        {h.residents.map((m) => {
          const r = isRole(m.role) ? ROLE_DEF[m.role] : null;
          const slot = routineAt(m.role, hour);
          return (
            <div class="hl-row" key={m.uid}>
              <span class="hl-seal is-small is-indigo">{r?.glyph ?? '人'}</span>
              <div class="hl-row-main">
                <div class="hl-name">{m.name}<small>{t(r?.zh ?? '', r?.en ?? '')}</small></div>
                <div class="hl-meta">{t(`此刻${ACT[slot.act][0]}`, `Now ${ACT[slot.act][1]}`)} · {t(`${m.since} 来的`, `since ${m.since}`)}</div>
              </div>
              <div class="hl-acts">
                <button type="button" class="hl-btn" onClick={() => api.renameResident(m.uid)}>{t('改名', 'Rename')}</button>
                <button type="button" class={'hl-btn' + (confirm === m.uid ? ' is-red' : ' is-warn')} onClick={guard(m.uid, () => api.dismiss(m.uid))}>{confirm === m.uid ? t('真的辞退？', 'Really?') : t('辞退', 'Dismiss')}</button>
              </div>
            </div>
          );
        })}
      </div>
    ) : <p class="hl-empty">{t('家里还只有你一个人。\n去「招人」贴张告示吧。', 'Nobody lives here but you.\nPost a notice under “Hire”.')}</p>;
  } else if (tab === 'adopt') {
    body = (
      <div>
        <p class="hl-note">{t(`每种宠物都要先在家园里建好它的窝（在「营造」的宠居里）。鹤与锦鲤住${KIND.pond?.zh ?? '水池'}。`, `Every pet needs its own home built first (under Pet homes in Build). The crane and the koi live in a ${(KIND.pond?.en ?? 'pond').toLowerCase()}.`)}</p>
        {SPECIES.map((d) => {
          const chk = adoptCheck(d.id, h.items, h.pets, { coins, limit: HOME_LIMITS.pets });
          const why = chk.block === 'house' ? t(`需要${d.houseZh}`, `needs a ${d.houseEn}`) : chk.block === 'full' ? t(`${d.houseZh}已满`, `${d.houseEn} full`) : chk.block === 'limit' ? t('养不下了', 'no room') : chk.block === 'coins' ? t('铜钱不够', 'not enough coins') : '';
          return (
            <div class="hl-row" key={d.id}>
              <span class="hl-seal is-small is-gold">{d.glyph}</span>
              <div class="hl-row-main">
                <div class="hl-name">{t(d.zh, d.en)}<small>{t(`住${d.houseZh} · ${chk.count}/${chk.capacity}`, `lives in a ${d.houseEn} · ${chk.count}/${chk.capacity}`)}</small></div>
                <div class="hl-meta">{t(d.traitZh, d.traitEn)}</div>
              </div>
              <div class="hl-acts">
                <button type="button" class={'hl-btn' + (chk.ok ? ' is-ink' : '')} disabled={!chk.ok} onClick={() => api.adopt(d.id)}>{chk.ok ? t('领养', 'Adopt') : why} <Coin />{d.price}</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    body = (
      <div>
        {ROLES.map((r) => {
          const have = h.residents.find((m) => m.role === r.id);
          return (
            <div class="hl-row" key={r.id}>
              <span class="hl-seal is-small is-indigo">{r.glyph}</span>
              <div class="hl-row-main">
                <div class="hl-name">{t(r.zh, r.en)}{have && <small>{t(`已有 · ${have.name}`, `hired · ${have.name}`)}</small>}</div>
                <div class="hl-meta">{t(r.descZh, r.descEn)}</div>
              </div>
              <div class="hl-acts">
                <button type="button" class={'hl-btn' + (!have && coins >= r.price ? ' is-ink' : '')} disabled={!!have || coins < r.price || h.residents.length >= HOME_LIMITS.residents} onClick={() => api.hire(r.id)}>{have ? t('已雇', 'Hired') : t('雇用', 'Hire')} <Coin />{r.price}</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div class="hl-wrap" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="hl-card">
        <div class="hl-head">
          <span class="hl-seal">家</span>
          <div class="hl-title">
            <h2 class={ctx.lang === 'zh' ? '' : 'latin'}>{title}</h2>
            <p><span class="hl-purse"><CoinIcon size={15} />{fmtCoins(coins)}</span></p>
          </div>
          <button type="button" class="hl-x" onClick={close} aria-label={t('合上', 'Close')}>×</button>
        </div>
        <div class="hl-tabs" role="tablist">
          {tabs.map(([id, zh, en, n]) => (
            <button type="button" role="tab" aria-selected={tab === id} key={id} class={'hl-tab' + (tab === id ? ' is-on' : '')} onClick={() => { setTab(id); setConfirm(''); }}>
              {t(zh, en)}{n !== null && <small>{n}</small>}
            </button>
          ))}
        </div>
        <div class="hl-body">{body}</div>
      </div>
    </div>
  );
}

/** Open the household ledger (家园簿). */
export function openLedger(ctx: WorldCtx, api: LedgerApi, start: Tab = 'pets'): () => void {
  return mountCard(ctx, (close) => <Ledger ctx={ctx} api={api} close={close} start={start} />);
}

export type { Tab as LedgerTab };
