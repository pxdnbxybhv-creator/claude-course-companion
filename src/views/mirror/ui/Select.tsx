// 水月幻镜 · companion select (GDD §18.2, mirror3 d-panel §4.6): on a phone a one-row strip of portraits
// (locked ones are pale 「未」 silhouettes with how to earn them in 入画) with the chosen companion's card
// under it, visible without scrolling, and the pick button stuck to the sheet's foot; on a desktop the grid
// sits beside the card. The card leads with one plain line, then the four body tiles (with dots against the
// other twelve), the starting weapon, the 镜技 and 天性 in plain words, what they are good at, mastery.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror } from '../../../app/mirror';
import { CHARACTER } from '../../../data/characters';
import { isHidden, type CharacterId, type HiddenId } from '../types';
import { charTag, masteryView, openOf } from '../logic/session';
import { HIDDEN_UI, companionTiles, sealedView } from './hiddenText';
import { charTagText } from './sand/overlay';
import { QUEST } from '../../../data/quests';
import { LETTER } from '../../../data/letters';
import { Sheet } from '../../../ui/kit';
import { ARCHETYPE_REG, DIFF_REG } from '../ids';
import { COMPANIONS, PASSIVES } from '../data';
import { termLine, termName } from '../data/glossary';
import { masteryLevel } from '../logic';
import { archLine, companionGist, describePassive, describeWeapon } from './describe';
import { Icon, Portrait, Seal } from './icons';
import { CompanionTiles, SkillNature } from './Panel';
import { nameOf, type T } from './text';

/** How a locked companion is earned in the main game (入画). */
export function howToEarn(id: CharacterId, t: T): string {
  // m8: a hidden companion is not the app's: CHARACTER is never read for one
  const def = isHidden(id) ? undefined : CHARACTER[id];
  if (!def) return '';
  if (def.unlock === 'gift') {
    const l = def.letter ? LETTER[def.letter] : undefined;
    return t(`随书信「${l?.subject.zh ?? '来信'}」而来：拆信收下`, `Comes with the letter “${l?.subject.en ?? 'a letter'}”: open it and accept`);
  }
  const q = QUEST[def.unlock];
  return q ? t(`入画任务「${q.zh}」：${q.hintZh}`, `Quest “${q.en}” in the painting: ${q.hintEn}`) : '';
}

/**
 * The companion sheet. `enters`: its button starts a run (the 今日镜 sheet: 「以书生入镜」); without it the
 * button only chooses (the lobby's selector: 「选定书生」), since no run starts there.
 */
export function CompanionSheet(props: {
  open: boolean; current: CharacterId; onPick: (id: CharacterId) => void; onClose: () => void; only?: readonly CharacterId[]; enters?: boolean;
}) {
  const t = useT();
  const [focus, setFocus] = useState<CharacterId>(props.current);
  const [info, setInfo] = useState<'mastery' | 'seals' | string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  // m8 (cr/S-hidden #1): who is open is openOf(m).chars (earned, the app's roster, or the code). A hidden companion
  // shows on the grid once open, or as a sealed 「？」 tile once any map's deepest reaches 30 (hidden.md §2.3)
  const open = openOf(mirror.value).chars;
  const list = companionTiles(mirror.value, t, props.only);
  const sealed = (id: CharacterId) => isHidden(id) && !open.includes(id);
  const f = list.some((c) => c.id === focus) ? focus : list[0].id;
  // the focused portrait scrolls into the middle of the phone strip
  useEffect(() => {
    if (!props.open) return;
    const el = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    try { el?.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch { /* old engines */ }
    setInfo(null);
  }, [f, props.open]);
  if (!props.open) return null;
  const has = open.includes(f);
  const tag = charTagText(charTag(mirror.value, f), t);
  const c = COMPANIONS[f];
  const m = mirror.value;
  // m8 (ask C): the 心得 the next run takes; while the code lends it, 10 with the own level beside it (as on the 心得 page)
  const mv = masteryView(m, f);
  const lvl = mv.lent ? mv.level : masteryLevel(m.mastery[f] ?? 0);
  const bestWave = Object.entries(m.bests).filter(([k]) => k.startsWith(f + '|')).reduce((a, [, b]) => Math.max(a, b?.wave ?? 0), 0);
  const gist = companionGist(f, t) || describePassive(c.passive, t).gist;
  const toggle = (k: string) => setInfo(info === k ? null : k);
  const start = c.start === 'choice' ? null : describeWeapon(c.start, 1, t);
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('同伴', 'Companions')} label={t('选择同伴', 'Choose a companion')}>
      <div class="mj-select">
        <div class="mj-select-grid" role="listbox" aria-label={t('同伴', 'Companions')} ref={strip}>
          {list.map((x) => {
            const ok = x.open;
            if (x.sealed) return (
              <button
                type="button"
                role="option"
                aria-selected={x.id === f}
                class={'mj-select-tile is-locked is-sealed' + (x.id === f ? ' is-focus' : '')}
                onClick={() => setFocus(x.id)}
                aria-label={x.label}
              >
                <Portrait id={x.id} size={56} veiled />
                <span class="mj-select-name">{x.name}</span>
              </button>
            );
            return (
              <button
                type="button"
                role="option"
                aria-selected={x.id === f}
                class={'mj-select-tile' + (x.id === f ? ' is-focus' : '') + (ok ? '' : ' is-locked') + (x.id === props.current ? ' is-current' : '')}
                onClick={() => setFocus(x.id)}
                onDblClick={() => ok && props.onPick(x.id)}
                aria-label={x.label}
              >
                <Portrait id={x.id} size={56} locked={!ok} />
                <span class="mj-select-name">{x.name}</span>
              </button>
            );
          })}
        </div>
        {sealed(f) ? <SealedPane id={f as HiddenId} t={t} /> : <div class="mj-select-detail">
          <div class="mj-select-head">
            <Portrait id={f} size={84} locked={!has} />
            <div>
              <h3 class="brush">{nameOf(f, t)}</h3>
              {tag && <p class="mj-select-meta"><span class="mj-tag">{tag}</span></p>}
              <p class="mj-select-meta">
                {mv.lent
                  ? <span><span class="mj-lend-num">{t(`${termName('mastery', t)} ${lvl} 级（测试码）`, `${termName('mastery', t)} ${lvl} (test code)`)}</span>{t(` · 自有 ${mv.own} 级`, ` · yours ${mv.own}`)}</span>
                  : <span>{t(`${termName('mastery', t)} ${lvl} 级`, `${termName('mastery', t)} ${lvl}`)}</span>}
                <button type="button" class="mj-cp-info" aria-expanded={info === 'mastery'} aria-controls="mj-sel-info" aria-label={t('心得是什么', 'What mastery is')} onClick={() => toggle('mastery')}><span aria-hidden="true">ⓘ</span></button>
                {bestWave > 0 && <span class="muted">{t(` · 最远到第 ${bestWave} 重`, ` · deepest wave ${bestWave}`)}</span>}
              </p>
              <div class="mj-seals-row">
                <span class="mj-seals-label">{t('照破印', 'Clear seals')}</span>
                {DIFF_REG.map((d, i) => (
                  m.seals[`${f}|${i}` as keyof typeof m.seals]
                    ? <Seal text={d.zh.slice(0, 2)} size={22} label={t(`${d.zh}已照破`, `${d.en} cleared`)} />
                    : <span class="mj-seal-empty" title={t(d.zh, d.en)} role="img" aria-label={t(`${d.zh}还没照破`, `${d.en} not cleared`)} />
                ))}
                <button type="button" class="mj-cp-info" aria-expanded={info === 'seals'} aria-controls="mj-sel-info" aria-label={t('照破印是什么', 'What clear seals are')} onClick={() => toggle('seals')}><span aria-hidden="true">ⓘ</span></button>
              </div>
            </div>
          </div>
          <p id="mj-sel-info" class="mj-cp-gloss" hidden={info !== 'mastery' && info !== 'seals'}>
            {info === 'mastery' && <>{termLine('mastery', t)}{c.alt !== 'more' ? t(`心得 3 级起，开局可以改带${nameOf(c.alt, t)}。`, ` From mastery 3 you may start with ${nameOf(c.alt, t)} instead.`) : ''}</>}
            {info === 'seals' && t('每个镜境用他打通一次（打过第 30 重），就盖一个印。', 'Each difficulty cleared with this companion (past wave 30) stamps one seal.')}
          </p>
          {!has && <p class="mj-howto"><span class="mj-tag">{t('还没结伴', 'Locked')}</span>{howToEarn(f, t)}</p>}
          {gist && <p class="mj-select-gist">{gist}</p>}
          <CompanionTiles char={f} t={t} />
          <div class="mj-select-block">
            <p class="mj-select-kicker">{t('开局兵器', 'Starting weapon')}</p>
            {c.start === 'choice' ? (
              <p class="mj-select-line">{t(`开局自己挑一把：从已解锁的兵器里随机给出 ${PASSIVES.bolan.p.choices} 把，挑一把带上。`, `He picks his own: ${PASSIVES.bolan.p.choices} unlocked weapons are offered and he takes one.`)}</p>
            ) : (
              <div class="mj-select-weapon">
                <Icon id={`wpn:${c.start}`} px={28} />
                <div>
                  <b>{nameOf(c.start, t)}</b>{start?.scales ? <span class="mj-card-scales"><span>{start.scales}</span></span> : null}
                  <p class="mj-select-line">{start?.body}</p>
                </div>
              </div>
            )}
          </div>
          <SkillNature run={{ char: f }} t={t} compact={false} id={`mjsel-${f}`} />
          <div class="mj-select-block">
            <p class="mj-select-kicker">{t('擅长的打法', 'Good at')}</p>
            <div class="chip-row mj-leans">
              {c.leans.map((a) => {
                const r = ARCHETYPE_REG.find((x) => x.id === a)!;
                const line = archLine(a, t);
                return line
                  ? <button type="button" class="chip" aria-expanded={info === a} aria-controls="mj-sel-lean" onClick={() => toggle(a)}>{t(r.zh, r.en)}</button>
                  : <span class="chip">{t(r.zh, r.en)}</span>;
              })}
            </div>
            <p id="mj-sel-lean" class="mj-cp-gloss" hidden={!c.leans.some((a) => a === info)}>{c.leans.includes(info as never) ? archLine(info as never, t) : ''}</p>
          </div>
          {c.quip && <p class="mj-quip">{t(c.quip.zh, c.quip.en)}</p>}
        </div>}
        <div class="mj-select-foot">
          <button type="button" class="btn btn-primary mj-wide" disabled={!has} onClick={() => props.onPick(f)}>
            {!has
              ? (sealed(f) ? t(HIDDEN_UI.notYet.zh, HIDDEN_UI.notYet.en) : t('还没结伴', 'Not yet a companion'))
              : props.enters
                ? t(`以${nameOf(f, (z) => z)}入镜`, `Enter as ${nameOf(f, (_z, e) => e)}`)
                : t(`选定${nameOf(f, (z) => z)}`, `Choose ${nameOf(f, (_z, e) => e)}`)}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** A sealed hidden companion's pane (hidden.md §2.3): no gist, kit, weapon or leans until it is earned. */
function SealedPane(props: { id: HiddenId; t: T }) {
  const v = sealedView(mirror.value, props.id, props.t);
  return (
    <div class="mj-select-detail mj-hid-pane">
      <div class="mj-select-head">
        <Portrait id={props.id} size={84} veiled />
        <div>
          <h3 class="brush">{v.head}</h3>
          <p class="mj-select-meta"><Seal text={v.seal} size={28} style="zhu" label={v.sealWord} /></p>
        </div>
      </div>
      <p class="mj-howto"><span class="mj-tag">{v.button}</span>{v.hint}</p>
      <p class="mj-hid-flavour">{v.flavour}</p>
      <p class="mj-select-line muted">{v.deepest}</p>
    </div>
  );
}
