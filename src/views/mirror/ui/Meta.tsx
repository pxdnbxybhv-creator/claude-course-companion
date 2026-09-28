// 水月幻镜 · the lobby's quiet pages (GDD §17.2–17.6, §18.12): 镜碑 (records, bests, the 78-seal board,
// vow seals, titles and rims), 心镜 (8 petal pairs: tap to choose a face, buy ranks with 镜屑; 素镜),
// 心得 (mastery per companion and what each level brings) and the mirror's settings.
import { useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror, storageOk } from '../../../app/mirror';
import { unlocked } from '../../../app/play';
import { Toggle } from '../../../ui/kit';
import { COMPANION_REG, DIFF_REG, HEART_REG, MAP_REG, RECORD_REG, RIM_REG, TITLE_REG, type HeartFaceId, type RecordId } from '../ids';
import type { CharacterId, TitleId } from '../types';
import { COMPANIONS, HEART, MASTERY } from '../data';
import { heartCost, masteryLevel } from '../logic';
import { heartBuy, heartPick, setPlain, setRim, setTitle } from '../logic/session';
import { Portrait, Seal } from './icons';
import { SettingsRows } from './Pause';
import { fmtInt, fmtMinutes, HEART_TEXT, nameOf } from './text';
import { titleName } from './Lobby';
import { termName } from '../data/glossary';
import { titleLine } from './describe';
import { TutorSettings } from './Tutorial';

// ───────────────────────────────────────────── 镜碑
export function RecordsPage() {
  const t = useT();
  const m = mirror.value;
  const recVal = (id: RecordId) => {
    const v = m.records[id];
    if (v === undefined) return '—';
    return id === 'fastestClear' ? fmtMinutes(v, t) : fmtInt(v);
  };
  const bests = Object.entries(m.bests)
    .map(([k, b]) => ({ k, b: b! }))
    .sort((a, b) => b.b.wave - a.b.wave)
    .slice(0, 24);
  const chars = COMPANION_REG.map((c) => c.id);
  return (
    <section class="mj-meta" aria-label={t('镜碑', 'Records')}>
      <h1 class="brush mj-page-title">{t('镜碑', 'Records')}</h1>
      <dl class="mj-statgrid mj-records">
        {RECORD_REG.map((r) => <div class="mj-stat"><dt>{t(r.zh, r.en)}</dt><dd class="num">{recVal(r.id)}</dd></div>)}
      </dl>
      <h2 class="mj-h3">{t('照破印', 'Breakthrough seals')}</h2>
      <div class="mj-sealboard" role="table" aria-label={t('同伴 × 镜境', 'Companions × difficulties')}>
        <div class="mj-sealboard-row is-head" role="row">
          <span role="columnheader" />
          {DIFF_REG.map((d) => <span role="columnheader" class="brush">{d.zh.slice(0, 1)}</span>)}
        </div>
        {chars.map((c) => (
          <div class="mj-sealboard-row" role="row">
            <span role="rowheader" class="mj-sealboard-name">{nameOf(c, t)}</span>
            {DIFF_REG.map((d, i) => (
              <span role="cell" class="mj-sealboard-cell">
                {m.seals[`${c}|${i}` as keyof typeof m.seals] ? <Seal text={d.zh} size={24} label={t(`${d.zh}照破`, `${d.en} cleared`)} /> : <i class="mj-seal-empty" aria-label={t('未', 'not yet')} />}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p class="mj-small">
        {t('誓印', 'Vow seals')}: {[5, 10, 15, 20].map((n) => (m.seals[`vow|${n}` as keyof typeof m.seals] ? <Seal text={`誓${n}`} size={26} label={t(`${termName('heat', t)} ${n} 照破`, `cleared at ${termName('heat', t)} ${n}`)} /> : <span class="mj-seal-empty is-round" title={String(n)} />))}
      </p>

      <h2 class="mj-h3">{t('名号', 'Titles')}</h2>
      <div class="chip-row">
        <button type="button" class="chip" aria-pressed={m.title === null} onClick={() => setTitle(null)}>{t('不显', 'None')}</button>
        {m.titles.map((ti: TitleId) => <button type="button" class="chip" aria-pressed={m.title === ti} onClick={() => setTitle(ti)}>{titleName(ti, t)}</button>)}
      </div>
      <ul class="mj-titles-todo">
        {TITLE_REG.filter((x) => !m.titles.includes(x.id)).map((x) => <li class="muted mj-small">{t(x.zh, x.en)} · {titleLine(x.id, t)}</li>)}
      </ul>

      <h2 class="mj-h3">{t('镜框', 'Mirror rims')}</h2>
      <div class="chip-row">
        <button type="button" class="chip" aria-pressed={m.rim === null} onClick={() => setRim(null)}>{t('随图', 'By map')}</button>
        {RIM_REG.filter((r) => m.rims.includes(r.id)).map((r) => <button type="button" class="chip" aria-pressed={m.rim === r.id} onClick={() => setRim(r.id)}>{t(r.zh, r.en)}</button>)}
      </div>
      {m.rims.length === 0 && <p class="muted mj-small">{t('镜鉴一章尽「识」，得一镜框。', 'Bring a whole codex chapter to “known” for a rim.')}</p>}

      {bests.length > 0 && (
        <>
          <h2 class="mj-h3">{t('各镜最深', 'Deepest by mirror')}</h2>
          <table class="mj-bests">
            <tbody>
              {bests.map(({ k, b }) => {
                const [c, mp, d, h, p] = k.split('|');
                return (
                  <tr>
                    <th scope="row">{nameOf(c, t)} · {t(MAP_REG.find((x) => x.id === mp)?.zh ?? mp, MAP_REG.find((x) => x.id === mp)?.en ?? mp)} · {t(DIFF_REG[Number(d)]?.zh ?? '', DIFF_REG[Number(d)]?.en ?? '')}{Number(h) > 0 ? ` · ${termName('heat', t)} ${h}` : ''}{p ? t(' · 素镜', ' · plain') : ''}</th>
                    <td class="num">{t(`第 ${b.wave} 重`, `wave ${b.wave}`)}</td>
                    <td class="num muted">{b.at}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ───────────────────────────────────────────── 心镜
export function HeartMirror() {
  const t = useT();
  const m = mirror.value;
  const [sel, setSel] = useState<HeartFaceId | null>(null);
  const pairs = [1, 2, 3, 4, 5, 6, 7, 8];
  const face = sel ? HEART_REG.find((f) => f.id === sel)! : null;
  const rank = (id: HeartFaceId) => m.heart.ranks[id] ?? 0;
  const cost = sel ? heartCost(m, sel) : null;
  const active = (id: HeartFaceId) => { const f = HEART_REG.find((x) => x.id === id)!; return (m.heart.pick[f.pair] ?? 'A') === f.side; };
  return (
    <section class="mj-meta" aria-label={t('心镜', 'Heart mirror')}>
      <h1 class="brush mj-page-title">{t('心镜', 'Heart mirror')}</h1>
      <p class="mj-small">{t(`镜屑 ${fmtInt(m.dust)} · 每对只一面生效，入镜之间可换。`, `Shards ${fmtInt(m.dust)} · one face of each pair is in force; switch between runs.`)}</p>
      <div class={'mj-heart' + (m.heart.plain ? ' is-plain' : '')}>
        {pairs.map((p, i) => {
          const [a, b] = HEART_REG.filter((f) => f.pair === p);
          const ang = (i / 8) * 360;
          return (
            <div class="mj-petalpair" style={{ transform: `rotate(${ang}deg) translateY(-118px) rotate(${-ang}deg)` }}>
              {[a, b].map((f) => (
                <button
                  type="button"
                  class={'mj-petal' + (active(f.id) ? ' is-on' : '') + (sel === f.id ? ' is-sel' : '')}
                  onClick={() => setSel(f.id)}
                  aria-pressed={sel === f.id}
                  aria-label={`${t(f.zh, f.en)} · ${rank(f.id)}/${HEART[f.id].costs.length}${active(f.id) ? t('（生效）', ' (in force)') : ''}`}
                >
                  <span class="brush">{f.zh.slice(0, 1)}</span>
                  <i class="mj-petal-ranks">{HEART[f.id].costs.map((_, k) => <b class={k < rank(f.id) ? 'is-on' : ''} />)}</i>
                </button>
              ))}
            </div>
          );
        })}
        <span class="mj-heart-core brush" aria-hidden="true">心</span>
      </div>
      {face && (
        <div class="card mj-heart-detail">
          <b class="brush">{t(face.zh, face.en)}</b> <span class="muted">{t(`第 ${face.pair} 对 · ${face.side} 面`, `pair ${face.pair} · face ${face.side}`)}</span>
          <p class="mj-small">{t(HEART_TEXT[face.id][0], HEART_TEXT[face.id][1])}</p>
          <p class="mj-small num">{t(`阶 ${rank(face.id)}/${HEART[face.id].costs.length}`, `rank ${rank(face.id)}/${HEART[face.id].costs.length}`)}</p>
          <div class="mj-row-actions">
            <button type="button" class="btn btn-small" disabled={active(face.id)} onClick={() => heartPick(face.pair, face.side)}>{active(face.id) ? t('已用此面', 'In force') : t('改用此面', 'Use this face')}</button>
            <button type="button" class="btn btn-small btn-primary" disabled={cost === null || m.dust < cost} onClick={() => heartBuy(face.id)}>
              {cost === null ? t('已满', 'Full') : t(`升一阶 · ${cost} 镜屑`, `Rank up · ${cost} shards`)}
            </button>
          </div>
        </div>
      )}
      <div class="row">
        <div class="row-main"><div class="row-title">{t('素镜', 'Plain mirror')}</div><div class="row-sub">{t('心镜不生效，另记镜碑，镜屑 +20%。', 'Heart faces off, own records, +20% shards.')}</div></div>
        <Toggle checked={m.heart.plain} onChange={setPlain} label={t('素镜', 'Plain mirror')} />
      </div>
      <p class="muted mj-small">{t('心镜只在入镜时生效；已经在打、暂停着的那一局不受影响。', 'The heart mirror is read when you enter; a paused run keeps its own.')}</p>
    </section>
  );
}

// ───────────────────────────────────────────── 心得
const REWARDS: readonly [string, string][] = [
  ['名号「入镜」', 'The title “Entered”'], ['镜鉴页上的镜中诗', 'Their mirror verse in the codex'], ['第二种起手兵器', 'A second starting weapon'],
  ['白描墨法', 'The 白描 ink style'], ['☆ 别传（待续）', '☆ Alternate skill (coming)'], ['画像镜框', 'A portrait frame'], ['泼墨墨法', 'The 泼墨 ink style'],
  ['镜前吟诗', 'A spoken verse in the lobby'], ['金碧墨法', 'The 金碧 ink style'], ['金箔画像 · 镜中仙', 'Gold-leaf portrait · Mirror Immortal'],
];
export function MasteryPage() {
  const t = useT();
  const m = mirror.value;
  const [focus, setFocus] = useState<CharacterId>(m.lobby.char);
  const xp = m.mastery[focus] ?? 0;
  const lvl = masteryLevel(xp);
  const next = MASTERY[lvl] ?? null;
  const prev = lvl > 0 ? MASTERY[lvl - 1] : 0;
  const open = unlocked.value;
  return (
    <section class="mj-meta" aria-label={t('心得', 'Mastery')}>
      <h1 class="brush mj-page-title">{t('心得', 'Mastery')}</h1>
      <div class="mj-mastery-grid" role="listbox" aria-label={t('同伴', 'Companions')}>
        {COMPANION_REG.map((c) => (
          <button type="button" role="option" aria-selected={focus === c.id} class={'mj-select-tile' + (focus === c.id ? ' is-focus' : '')} onClick={() => setFocus(c.id)}>
            <Portrait id={c.id} size={44} locked={!open.includes(c.id)} />
            <span class="num">{masteryLevel(m.mastery[c.id] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div class="card">
        <b class="brush">{nameOf(focus, t)}</b> <span class="muted">{t(`心得 ${lvl} 级 · ${xp} 点`, `mastery ${lvl} · ${xp} xp`)}</span>
        <i class="mj-bar"><b style={{ width: `${next ? ((xp - prev) / (next - prev)) * 100 : 100}%` }} /></i>
        <p class="muted mj-small">{next ? t(`距 ${lvl + 1} 级尚差 ${next - xp} 点（每照：已过重数 + 首领×5 + 照破 20）`, `${next - xp} to level ${lvl + 1} (per run: waves + 5 a boss + 20 for a clear)`) : t('心得已满。', 'Mastery complete.')}</p>
        {COMPANIONS[focus].alt !== 'more' && <p class="mj-small">{t(`三级：可以 ${nameOf(COMPANIONS[focus].alt as string, t)} 起手`, `Level 3: start with ${nameOf(COMPANIONS[focus].alt as string, t)}`)}</p>}
        <ol class="mj-rewards">
          {REWARDS.map(([zh, en], i) => <li class={i < lvl ? 'is-got' : ''}><span class="num">{i + 1}</span> {t(zh, en)}</li>)}
        </ol>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────── settings
export function SettingsPage(props: { onTutorial?: () => void } = {}) {
  const t = useT();
  return (
    <section class="mj-meta" aria-label={t('设置', 'Settings')}>
      <h1 class="brush mj-page-title">{t('设置', 'Settings')}</h1>
      {!storageOk.value && <p class="mj-warn" role="alert">{t('此处不能存档，关页即失。', 'Nothing can be saved here: closing the page loses the run.')}</p>}
      <SettingsRows />
      {props.onTutorial && <TutorSettings onReplay={props.onTutorial} />}
      <p class="muted mj-small">{t('音量、音乐与主题随半亩的「设置」。', 'Volume, music and theme follow Half-Acre’s Settings.')}</p>
    </section>
  );
}
