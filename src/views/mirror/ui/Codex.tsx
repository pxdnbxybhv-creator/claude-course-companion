// 水月幻镜 · 镜鉴, the codex (GDD §17.5): 185 pages in tabs (兵器 道具 妖魅 首领 同伴 地图 流派) plus
// the 72 候签 album. Each page is painted in three stages — 见 an outline, 识 half the wash, 精 the
// whole painting — and opens to its verse, live numbers and your own tallies. Locked gear shows the
// deed that opens it, as a hint.
import { useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror } from '../../../app/mirror';
import { Sheet } from '../../../ui/kit';
import { pentadText } from '../../../data/terms';
import { TERMS } from '../../../data/terms';
import {
  ARCHETYPE_REG, BOSS_REG, ELITE_REG, HAZARD_REG, MAP_REG, MONSTER_REG, TREASURE_REG, lockOf, DEED_REG,
  type ArchetypeId, type BossId, type ItemId, type MapId, type MonsterId, type WeaponId,
} from '../ids';
import type { CharacterId, CodexKey, CodexStage } from '../types';
import { ARCHETYPES, COMPANIONS, ITEMS, MAPS, MONSTERS, WEAPONS, SKILLS, PASSIVES } from '../data';
import { deedProgress, unlocksOf } from '../logic';
import { Icon, Portrait } from './icons';
import { className, CODEX_TABS, codexKeys, fmtInt, nameOf, pageAtlas, pageId, STAGE_EN, STAGE_ZH, tierName, TIER_ROMAN, type CodexTab, type T } from './text';
import { codexTab, rememberCodexTab } from './prefs';

export function Codex() {
  const t = useT();
  const m = mirror.value;
  const [tab, setTabState] = useState<CodexTab>(() => (CODEX_TABS.some((x) => x.id === codexTab()) ? (codexTab() as CodexTab) : 'wpn'));
  const setTab = (x: CodexTab) => { setTabState(x); rememberCodexTab(x); };
  const [open, setOpen] = useState<CodexKey | null>(null);
  const keys = codexKeys(tab);
  const stageOf = (k: CodexKey): CodexStage => (m.codex[k] ?? 0) as CodexStage;
  const allKeys = CODEX_TABS.filter((x) => x.id !== 'slip').flatMap((x) => codexKeys(x.id));
  const seen = allKeys.filter((k) => stageOf(k) >= 1).length;
  const known = allKeys.filter((k) => stageOf(k) >= 2).length;
  const master = allKeys.filter((k) => stageOf(k) >= 3).length;
  const slips = Object.keys(m.slips).length;

  return (
    <section class="mj-codex" aria-label={t('镜鉴', 'Codex')}>
      <h1 class="brush mj-page-title">{t('镜鉴', 'Codex')}</h1>
      <p class="muted mj-small">{t(`见 ${seen} · 识 ${known} · 精 ${master} / ${allKeys.length} 页 · 候签 ${slips}/72`, `seen ${seen} · known ${known} · mastered ${master} of ${allKeys.length} · slips ${slips}/72`)}</p>
      <div class="mj-tabs mj-codex-tabs" role="tablist">
        {CODEX_TABS.map((x) => <button type="button" role="tab" class="mj-tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}>{t(x.zh, x.en)}</button>)}
      </div>
      {tab === 'slip' ? (
        <SlipAlbum t={t} slips={m.slips} />
      ) : (
        <div class="mj-pages" role="list">
          {keys.map((k) => {
            const s = stageOf(k);
            const atlas = pageAtlas(k);
            const id = pageId(k);
            return (
              <button type="button" role="listitem" class={`mj-page stage-${s}`} onClick={() => setOpen(k)} aria-label={s ? `${nameOf(id, t)} · ${t(STAGE_ZH[s], STAGE_EN[s])}` : t('未见', 'unseen')}>
                <span class="mj-page-art">
                  {atlas ? (k.startsWith('char:') ? <Portrait id={id} size={52} locked={s === 0} /> : <Icon id={atlas} px={52} />) : <span class="mj-page-glyph brush">{nameOf(id, (z) => z).slice(0, 1)}</span>}
                </span>
                <span class="mj-page-name">{s ? nameOf(id, t) : '？'}</span>
                {s >= 1 && <span class={`mj-page-stage s${s}`} aria-hidden="true">{STAGE_ZH[s]}</span>}
              </button>
            );
          })}
        </div>
      )}
      <Sheet open={open !== null} onClose={() => setOpen(null)} title={open ? (stageOf(open) ? nameOf(pageId(open), t) : t('未见之页', 'An unseen page')) : ''}>
        {open && <PageView k={open} stage={stageOf(open)} t={t} />}
      </Sheet>
    </section>
  );
}

function PageView(props: { k: CodexKey; stage: CodexStage; t: T }) {
  const { k, stage, t } = props;
  const m = mirror.value;
  const kind = k.slice(0, k.indexOf(':'));
  const id = pageId(k);
  const atlas = pageAtlas(k);
  const tally = (key: string) => m.tally[key as keyof typeof m.tally] ?? 0;
  const u = unlocksOf(m);
  const deed = (kind === 'wpn' || kind === 'item') ? lockOf(id as WeaponId | ItemId) : undefined;
  const locked = deed && !(kind === 'wpn' ? u.weapons.has(id as WeaponId) : u.items.has(id as ItemId));
  const d = deed ? DEED_REG.find((x) => x.id === deed)! : null;
  const prog = deed ? deedProgress(m, deed) : null;
  return (
    <div class={`mj-pageview stage-${stage}`}>
      <div class="mj-pageview-art">
        {atlas ? (k.startsWith('char:') ? <Portrait id={id} size={120} locked={stage === 0} /> : <Icon id={atlas} px={120} />) : <span class="mj-page-glyph is-big brush">{nameOf(id, (z) => z).slice(0, 1)}</span>}
        <span class="mj-stage-word">{t(STAGE_ZH[stage], STAGE_EN[stage])}</span>
      </div>
      {locked && d && prog && (
        <p class="mj-howto"><span class="mj-tag">{t('镜缘', 'Deed')}</span>{t(d.zh, d.en)} · {d.look} <span class="num">({fmtInt(prog.value)}/{fmtInt(prog.goal)})</span></p>
      )}
      {stage === 0 ? (
        <p class="muted">{t('此页尚在雾中。遇见它，页上才有墨。', 'This page is still in mist: meet it and the ink comes.')}</p>
      ) : (
        <PageBody kind={kind} id={id} stage={stage} t={t} tally={tally} />
      )}
      <p class="muted mj-small">{t('见 · 遇见；识 · 击破十回、买过或用过；精 · 击破百回、持之照破或以之照破。', 'Seen: met. Known: 10 kills, bought or played. Mastered: 100 kills, or a clear holding it or as them.')}</p>
    </div>
  );
}

function PageBody(props: { kind: string; id: string; stage: CodexStage; t: T; tally: (k: string) => number }) {
  const { kind, id, t, tally } = props;
  switch (kind) {
    case 'wpn': {
      const w = WEAPONS[id as WeaponId];
      return (
        <div>
          <p class="mj-small">{w.classes.map((c) => className(c, t)).join(' · ')} · {t(`冷却 ${w.cd} s · 射程 ${w.range} u`, `cooldown ${w.cd} s · range ${w.range} u`)}</p>
          <p class="mj-small">{t('伤害', 'Damage')} {w.dmg.map((x, i) => `${TIER_ROMAN[i + 1]} ${x}`).join(' · ')}</p>
          <p>{t(w.text.zh, w.text.en)}</p>
          <p class="mj-small"><b>{t('神', 'IV')}</b> {t(w.t4.zh, w.t4.en)}</p>
          {w.verse && <p class="mj-verse brush">{t(w.verse.zh, w.verse.en)}</p>}
          <p class="mj-small muted">{t(`持之照破 ${tally(`hold:${id}`)} 回`, `held in ${tally(`hold:${id}`)} clears`)}</p>
        </div>
      );
    }
    case 'item': {
      const it = ITEMS[id as ItemId];
      return (
        <div>
          <p class="mj-small">{tierName(it.tier, t)}{it.tags.length ? ' · ' + it.tags.map((c) => className(c, t)).join(' · ') : ''}{it.max ? t(` · 至多 ${it.max}`, ` · max ${it.max}`) : ''}</p>
          <p>{t(it.text.zh, it.text.en)}</p>
          {it.verse && <p class="mj-verse brush">{t(it.verse.zh, it.verse.en)}</p>}
          <p class="mj-small muted">{t(`持之照破 ${tally(`hold:${id}`)} 回`, `held in ${tally(`hold:${id}`)} clears`)}</p>
        </div>
      );
    }
    case 'mon': case 'elite': case 'trs': {
      const mon = MONSTERS[id as MonsterId];
      const reg = [...MONSTER_REG, ...ELITE_REG, ...TREASURE_REG].find((x) => x.id === id);
      return (
        <div>
          {mon && <p class="mj-small">{mon.map === 'all' ? t('诸图', 'every map') : nameOf(mon.map, t)} · {t(`第 ${mon.from} 重起`, `from wave ${mon.from}`)}</p>}
          {reg && <p class="mj-small muted" lang="en">{reg.look}</p>}
          <p>{t(`击破 ${fmtInt(tally(`kill:${id}`))}`, `Killed ${fmtInt(tally(`kill:${id}`))}`)}</p>
        </div>
      );
    }
    case 'boss': {
      const b = BOSS_REG.find((x) => x.id === id)!;
      return (
        <div>
          <p class="mj-verse brush">{t(b.verse, b.verseEn)}</p>
          <p class="mj-small">{nameOf(b.map, t)} · {t(`第 ${b.wave} 重`, `wave ${b.wave}`)}</p>
          <ol class="mj-phases">{b.phases.map((p) => <li>{t(p.zh, p.en)}</li>)}</ol>
          <p>{t(`击破 ${fmtInt(tally(`kill:${id as BossId}`))}`, `Defeated ${fmtInt(tally(`kill:${id}`))}`)}</p>
        </div>
      );
    }
    case 'char': {
      const c = COMPANIONS[id as CharacterId];
      const sk = SKILLS[c.skill];
      const pa = PASSIVES[c.passive];
      return (
        <div>
          <p><b>{nameOf(c.skill, t)}</b> · {t(sk.text.zh, sk.text.en)}</p>
          <p><b>{nameOf(c.passive, t)}</b> · {t(pa.text.zh, pa.text.en)}</p>
          {c.verse && props.stage >= 2 && <p class="mj-verse brush">{t(c.verse.zh, c.verse.en)}</p>}
          <p class="mj-small muted">{t(`入镜 ${tally(`play:${id}`)} 回 · 照破 ${tally(`win:${id}`)} 回`, `${tally(`play:${id}`)} runs · ${tally(`win:${id}`)} clears`)}</p>
        </div>
      );
    }
    case 'map': {
      const mp = MAPS[id as MapId];
      const reg = MAP_REG.find((x) => x.id === id)!;
      return (
        <div>
          <p class="mj-verse brush">{t(reg.title, reg.titleEn)}</p>
          <p class="mj-small">{t('首领', 'Bosses')}: {mp.bosses.map((b) => nameOf(b, t)).join(' · ')}</p>
          <p class="mj-small">{t('天象', 'Hazards')}: {mp.hazards.map((h) => { const r = HAZARD_REG.find((x) => x.id === h)!; return t(r.zh, r.en); }).join(' · ')}</p>
          <p class="mj-small">{t(`镜钱 ×${mp.pay}`, `pay ×${mp.pay}`)}</p>
        </div>
      );
    }
    case 'arch': {
      const a = ARCHETYPES[id as ArchetypeId];
      const reg = ARCHETYPE_REG.find((x) => x.id === id)!;
      return (
        <div>
          <p lang="en" class="mj-small muted">{reg.look}</p>
          {a.weapons.length > 0 && <p class="mj-archrow">{a.weapons.map((w) => <Icon id={`wpn:${w}`} px={30} label={nameOf(w, t)} />)}</p>}
          <p class="mj-archrow">{a.keys.map((w) => <Icon id={`item:${w}`} px={26} label={nameOf(w, t)} />)}</p>
          {a.capstone && <p class="mj-small">{t('压卷', 'Capstone')}: {nameOf(a.capstone, t)}</p>}
          <p class="mj-small">{t('宜', 'Suits')}: {a.flagship.map((c) => nameOf(c, t)).join(' · ')}</p>
        </div>
      );
    }
    default:
      return null;
  }
}

function SlipAlbum(props: { t: T; slips: Record<number, string> }) {
  const { t } = props;
  return (
    <div class="mj-slips" role="list">
      {Array.from({ length: 72 }, (_, i) => {
        const term = TERMS[Math.floor(i / 3)];
        const p = pentadText(Math.floor(i / 3), i % 3);
        const got = props.slips[i];
        return (
          <div role="listitem" class={'mj-slip' + (got ? ' is-got' : '')} title={got ? `${p.zh} · ${got}` : undefined} aria-label={got ? `${p.zh} · ${got}` : t('未得', 'not yet')}>
            <span class="mj-slip-term">{term ? t(term.zh, term.en) : ''}</span>
            <span class="mj-slip-name brush">{got ? t(p.zh, p.en) : '　'}</span>
            {got && <span class="mj-slip-date num">{got.slice(5)}</span>}
          </div>
        );
      })}
    </div>
  );
}

