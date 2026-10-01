// 水月幻镜 · m8 · the test code's overlays on the lobby pages (chars.md §4.4, sandbox.md §8). SANDBOX owns it.
// The 心镜 / 心得 ribbon with its 「按满阶 / 按自有」 switch, the small 「测」 seal and the companion tag line.
// No screen reads codeActive itself: these go through logic/session.ts (codeOn, lendOn, charTag).
import { useT } from '../../../../app/i18n';
import { codeOn, lendOn, setLendOn } from '../../logic/session';
import { Seal } from '../icons';
import type { T } from '../text';
import './lend.css';

/** The companion tile's line under the name while the code opens it (charTag → 'code'). */
export function charTagText(tag: 'code' | null, t: T): string {
  return tag === 'code' ? t('测试码开启', 'Opened by test code') : '';
}

/**
 * The ribbon at the top of the 心镜 and 心得 pages while the code is on, with the switch 「按满阶 / 按自有」
 * (what the next 入镜 takes; a paused run keeps its own). Renders nothing without the code.
 */
export function CodeRibbon(props: { page: 'heart' | 'mastery' }) {
  const t = useT();
  if (!codeOn()) return null;
  const on = lendOn.value;
  const what = props.page === 'heart' ? t('心镜', 'the heart mirror') : t('心得', 'mastery');
  return (
    <div class="card mj-lend-ribbon" role="note">
      <Seal text="测" size={26} label={t('测试码', 'Test code')} />
      <p>
        {on
          ? t(`测试码开着：${what}按满阶算，你攒下的不变。`, `Test code on: ${what} counts as full; what you earned is kept.`)
          : t(`测试码开着：这次按你自有的${what}算。`, `Test code on: your own ${what} counts this time.`)}
        <span class="mj-lend-note">{t('只管下一次入镜；暂停着的那一局不受影响。', 'This sets the next run only; a paused run keeps its own.')}</span>
      </p>
      <div class="chip-row mj-lend-switch" role="group" aria-label={t('测试码代填', 'Lent by the test code')}>
        <button type="button" class="chip" aria-pressed={on} onClick={() => setLendOn(true)}>{t('按满阶', 'Full ranks')}</button>
        <button type="button" class="chip" aria-pressed={!on} onClick={() => setLendOn(false)}>{t('按自有', 'Your ranks')}</button>
      </div>
    </div>
  );
}

/** The small 「测」 seal beside a lent value (the lobby glass, the 心得 tiles). */
export function LendSeal(props: { size?: number }) {
  const t = useT();
  return <span class="mj-lend-seal"><Seal text="测" size={props.size ?? 16} label={t('测试码代填', 'Lent by the test code')} /></span>;
}
