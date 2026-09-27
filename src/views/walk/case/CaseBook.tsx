// 案卷 in the quest book (after 奇遇录): the cases solved, with their grade and the day; a case still
// open, with how far it has come — counts only, nothing named; a case parked till daylight. Nothing
// shows before the case has ever been opened.
import { lang } from '../../../app/store';
import { play } from '../../../app/play';
import { Seal } from '../../quests/bits';
import { doneDate } from '../../quests/helpers';
import * as K from '../features/taoyuan/case';
import './case.css';

type T = (zh: string, en: string) => string;

export function CaseBook(props: { t: T }) {
  const { t } = props;
  const p = play.value;
  const f = p.flags;
  const solved = !!f[K.CASE_FLAGS.solved];
  const open = K.caseIsOpen(f);
  const parked = !!f[K.CASE_FLAGS.parked] && !open && !solved;
  if (!solved && !open && !parked) return null;
  const zh = lang.value === 'zh';
  const g = K.gradeOf(f);
  const day = p.done[K.DAY_KEY];
  const pr = K.progress(f);
  const rd = K.ready(f);
  return (
    <section class="qb-sec case-book" aria-labelledby="qb-case-h" id="anjuan">
      <header class="qb-h" id="qb-case-h">
        <h2 class={zh ? 'brush' : 'latin'}>{t('案卷', 'Casebook')}</h2>
        <span class="qb-h-count num">{solved ? '1 / 1' : '0 / 1'}</span>
        <span class="qb-h-rule" aria-hidden="true" />
      </header>
      <ul class="qb-qy">
        <li class={'qb-qy-card case-book-card' + (solved ? ' is-met' : '')}>
          <div class="qb-qy-seal">
            <Seal text={solved && g ? K.GRADE_NAME[g].zh : '案'} size={solved ? 54 : 46} earned={solved} />
          </div>
          <h3 class="qb-qy-name">
            <span class={zh ? 'brush' : 'latin'}>{t(K.CASE_TITLE.name.zh, K.CASE_TITLE.name.en)}</span>
            {zh && <small class="latin">{K.CASE_TITLE.name.en}</small>}
          </h3>
          <p class="qb-qy-meta">
            <span class="qb-qy-where">{t('桃源', 'The Peach Spring')}</span>
            <span aria-hidden="true"> · </span>
            {solved ? <span class="qb-qy-date">{day ? doneDate(day, lang.value) : t('已断', 'Judged')}</span>
              : parked ? <span>{t('悬而未决', 'Unresolved')}</span> : <span>{t('正在查', 'Under way')}</span>}
          </p>
          {solved && g ? (
            <>
              <blockquote class="qb-qy-note">
                {t(`${K.GRADE_NAME[g].zh}。两张过所，都在子正钤了印。`, `${K.GRADE_NAME[g].en}. Two passes were stamped at midnight after all.`)}
              </blockquote>
              <div class="qb-qy-foot">
                <span class="qb-qy-who"><i>{t('落花为证', 'The Petals Bear Witness')}</i></span>
                <span class="case-book-coins num">{t(`${K.GRADE_COINS[g]} 文`, `${K.GRADE_COINS[g]} coins`)}</span>
              </div>
            </>
          ) : parked ? (
            <p class="qb-qy-hint">{t('庭里的花，谁也不许扫——等你回去。', 'No one may sweep the courtyard — it is waiting for you to come back.')}</p>
          ) : (
            <>
              <ul class="case-book-tally" aria-label={t('进展', 'Progress')}>
                <li><b class="num">{pr.clues}</b><span>/12</span><small>{t('物证', 'evidence')}</small></li>
                <li><b class="num">{pr.words}</b><span>/6</span><small>{t('证词', 'testimony')}</small></li>
                <li><b class="num">{pr.broken}</b><small>{t('谎言已破', 'lies broken')}</small></li>
              </ul>
              <p class="qb-qy-hint">{rd.ok ? t('证据已足。去请秦守拙到庭。', 'Enough evidence: go and ask Qin Shouzhuo to gather everyone.') : t('子正未过，桃源的花还悬在半空。', 'Midnight holds in the Peach Spring; the petals still hang in the air.')}</p>
            </>
          )}
        </li>
      </ul>
    </section>
  );
}
