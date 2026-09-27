// 水月幻镜 · companion select (GDD §18.2): a 13-portrait grid (locked ones are pale 「未」 silhouettes
// with how to earn them in 入画), and a detail pane: body bars, starting weapon (and its mastery-3
// alternative), 镜技, 天性 with its cost, leans, the six 照破印, mastery and bests.
import { useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { mirror } from '../../../app/mirror';
import { unlocked } from '../../../app/play';
import { CHARACTER, type CharacterId } from '../../../data/characters';
import { QUEST } from '../../../data/quests';
import { LETTER } from '../../../data/letters';
import { Sheet } from '../../../ui/kit';
import { ARCHETYPE_REG, COMPANION_REG, DIFF_REG, PASSIVE_REG, SKILL_REG } from '../ids';
import { COMPANIONS, PASSIVES, SKILLS } from '../data';
import { masteryLevel } from '../logic';
import { Icon, Portrait, Seal } from './icons';
import { nameOf, type T } from './text';

const MAX = { hp: Math.max(...COMPANION_REG.map((c) => COMPANIONS[c.id].hp)), armor: 6, speed: 30 };

/** How a locked companion is earned in the main game (入画). */
export function howToEarn(id: CharacterId, t: T): string {
  const def = CHARACTER[id];
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
  const open = unlocked.value;
  const list = props.only ? COMPANION_REG.filter((c) => props.only!.includes(c.id)) : COMPANION_REG;
  if (!props.open) return null;
  const f = list.some((c) => c.id === focus) ? focus : list[0].id;
  const has = open.includes(f);
  const c = COMPANIONS[f];
  const sk = SKILLS[c.skill];
  const pa = PASSIVES[c.passive];
  const skName = SKILL_REG.find((s) => s.id === c.skill)!;
  const paName = PASSIVE_REG.find((s) => s.id === c.passive)!;
  const m = mirror.value;
  const lvl = masteryLevel(m.mastery[f] ?? 0);
  const bestWave = Object.entries(m.bests).filter(([k]) => k.startsWith(f + '|')).reduce((a, [, b]) => Math.max(a, b?.wave ?? 0), 0);
  const bar = (label: string, v: number, max: number, shown: string) => (
    <div class="mj-bar-row"><span>{label}</span><i class="mj-bar"><b style={{ width: `${Math.max(4, Math.min(100, (v / max) * 100))}%` }} /></i><span class="num">{shown}</span></div>
  );
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('同伴', 'Companions')} label={t('选择同伴', 'Choose a companion')}>
      <div class="mj-select">
        <div class="mj-select-grid" role="listbox" aria-label={t('同伴', 'Companions')}>
          {list.map((x) => {
            const ok = open.includes(x.id);
            return (
              <button
                type="button"
                role="option"
                aria-selected={x.id === f}
                class={'mj-select-tile' + (x.id === f ? ' is-focus' : '') + (ok ? '' : ' is-locked') + (x.id === props.current ? ' is-current' : '')}
                onClick={() => setFocus(x.id)}
                onDblClick={() => ok && props.onPick(x.id)}
                aria-label={ok ? t(x.zh, x.en) : t(`${x.zh}，未结伴`, `${x.en}, locked`)}
              >
                <Portrait id={x.id} size={56} locked={!ok} />
                <span class="mj-select-name">{t(x.zh, x.en)}</span>
              </button>
            );
          })}
        </div>
        <div class="mj-select-detail">
          <div class="mj-select-head">
            <Portrait id={f} size={84} locked={!has} />
            <div>
              <h3 class="brush">{nameOf(f, t)}</h3>
              <p class="muted">{t(`心得 ${lvl} 级`, `Mastery ${lvl}`)}{bestWave > 0 ? t(` · 最深第 ${bestWave} 重`, ` · deepest wave ${bestWave}`) : ''}</p>
              <div class="mj-seals-row" aria-label={t('照破印', 'Breakthrough seals')}>
                {DIFF_REG.map((d, i) => (
                  m.seals[`${f}|${i}` as keyof typeof m.seals]
                    ? <Seal text={d.zh.slice(0, 2)} size={22} label={t(`${d.zh}照破`, `${d.en} cleared`)} />
                    : <span class="mj-seal-empty" title={t(d.zh, d.en)} aria-label={t(`${d.zh}未照破`, `${d.en} not cleared`)} />
                ))}
              </div>
            </div>
          </div>
          {!has && <p class="mj-howto"><span class="mj-tag">{t('未结伴', 'Locked')}</span>{howToEarn(f, t)}</p>}
          {bar(t('气血', 'HP'), c.hp, MAX.hp, String(c.hp))}
          {bar(t('护甲', 'Armour'), c.armor + 2, MAX.armor + 2, String(c.armor))}
          {bar(t('身法', 'Speed'), c.speed + 15, MAX.speed + 15, `${c.speed >= 0 ? '+' : ''}${c.speed}%`)}
          {c.dodge > 0 && <p class="muted mj-small">{t(`闪避 ${c.dodge}%`, `Dodge ${c.dodge}%`)}</p>}
          <p class="mj-select-line">
            <span class="mj-tag">{t('初器', 'Start')}</span>
            {c.start === 'choice' ? t('三选一（未锁兵器随机）', 'one of three open weapons') : <><Icon id={`wpn:${c.start}`} px={22} /> {nameOf(c.start, t)}</>}
            {c.alt !== 'more' && <span class="muted"> · {t(`心得三级可换 ${nameOf(c.alt, t)}`, `mastery 3: ${nameOf(c.alt, t)}`)}</span>}
          </p>
          <p class="mj-select-line">
            <span class="mj-tag mj-tag-skill brush">{skName.glyph}</span>
            <b>{t(skName.zh, skName.en)}</b> <span class="muted num">{sk.cd} s</span>
            <br /><span class="mj-small">{t(sk.text.zh, sk.text.en)}</span>
          </p>
          <p class="mj-select-line">
            <span class="mj-tag">{t('天性', 'Nature')}</span>
            <b>{t(paName.zh, paName.en)}</b>
            <br /><span class="mj-small">{t(pa.text.zh, pa.text.en)}</span>
            <br /><span class="mj-small mj-cost">{t('代价：', 'Cost: ')}{t(pa.cost.zh, pa.cost.en)}</span>
          </p>
          <div class="chip-row mj-leans">
            {c.leans.map((a) => { const r = ARCHETYPE_REG.find((x) => x.id === a)!; return <span class="chip">{t(r.zh, r.en)}</span>; })}
          </div>
          {c.quip && <p class="mj-quip">{t(c.quip.zh, c.quip.en)}</p>}
          <button type="button" class="btn btn-primary mj-wide" disabled={!has} onClick={() => props.onPick(f)}>
            {!has
              ? t('尚未结伴', 'Not yet a companion')
              : props.enters
                ? t(`以${nameOf(f, (z) => z)}入镜`, `Enter as ${nameOf(f, (_z, e) => e)}`)
                : t(`选定${nameOf(f, (z) => z)}`, `Choose ${nameOf(f, (_z, e) => e)}`)}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
