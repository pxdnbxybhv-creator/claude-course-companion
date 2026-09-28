// 水月幻镜 · the fee ritual (GDD §2, §18.3) and 研墨. Paid: two strings of coins drop into the pond and
// a ripple opens the glass. Free: the old polisher breathes on the bronze, 「今日头一照，老朽请了」, a
// moon-glint. The tutorial: the same glint with the polisher's offer to walk you through. 0.8 s, a tap
// skips it. Then the inkstone grinds while the sprites bake, with tips.
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { LINES, backWave } from '../tutor/lines';
import { F, PAY } from '../data';

export function Ritual(props: { kind: 'paid' | 'free' | 'tutor'; onDone: () => void; reduced: boolean }) {
  const t = useT();
  useEffect(() => {
    const k = setTimeout(props.onDone, props.kind === 'tutor' ? (props.reduced ? 1200 : 1800) : props.reduced ? 250 : 800);
    return () => clearTimeout(k);
  }, []);
  return (
    <button type="button" class={`mj-ritual is-${props.kind === 'tutor' ? 'free' : props.kind}`} onClick={props.onDone} aria-label={t('轻触跳过', 'Tap to skip')}>
      <span class="mj-ritual-pond" aria-hidden="true">
        <i class="mj-ritual-ripple" /><i class="mj-ritual-ripple is-2" />
        {props.kind === 'paid' ? (
          <>
            <span class="mj-ritual-string is-a">{Array.from({ length: 5 }, () => <i class="coin-icon" />)}</span>
            <span class="mj-ritual-string is-b">{Array.from({ length: 5 }, () => <i class="coin-icon" />)}</span>
          </>
        ) : <i class="mj-ritual-glint" />}
      </span>
      <span class={'mj-ritual-line' + (props.kind === 'tutor' ? '' : ' brush')}>
        {props.kind === 'tutor' ? t(LINES.ritual.base.zh, LINES.ritual.base.en) : props.kind === 'free' ? t('今日头一照，老朽请了。', 'The first look today is on me.') : t('投钱入镜', 'Coins into the mirror')}
      </span>
    </button>
  );
}

/** The inkstone's tips, in plain words; numbers from data. */
const TIPS: readonly [string, string][] = [
  [`打过第 ${backWave()} 重，入镜钱就回本了。`, `Clear wave ${backWave()} and the fee has paid for itself.`],
  ['两把同名、同品阶的兵器，能合铸成更强的一把。', 'Two identical weapons of the same tier merge into a stronger one.'],
  ['锁住的货会留到下一次商店，价钱按那时的算。', 'A locked item waits for the next shop, at that shop’s price.'],
  ['地上没捡完的月华会存起来，下一重每捡一颗，多给一颗。', 'Moonlight left on the ground is saved: next wave, each pickup gives one more.'],
  ['圆形方孔的才是真铜钱；月华换不了钱。', 'Only round coins with a square hole are real money; moonlight never is.'],
  ['朱红色就是危险：敌人的弹丸是白心、红边。', 'Red means danger: enemy shots have a white core and a red rim.'],
  ['地上的红色填满时，攻击就落下来了。', 'When the red on the ground fills up, the blow lands.'],
  ['随时可以暂离，回来接着打，不用再交钱。', 'Step away any time; coming back is always free.'],
  ['首领那一重不计时，打倒首领就过了。', 'Boss waves have no timer: beat the boss to clear them.'],
  ['每天第一局免费：结算的镜钱减半，铜钱照常掉。', 'The first run each day is free: half the settled coins, dropped coins as usual.'],
  ['同一类兵器带够 2 把就有套装加成，4 把、6 把更强。', 'Two weapons of one class start a set bonus; four and six make it stronger.'],
  [`护甲越高，挨打时少受得越多：护甲 ${F.armorK} 时少受一半。`, `The more armour, the less each hit takes: at ${F.armorK} armour, half.`],
  ['镜鉴里的每一页，见得越多，画得越满。', 'Every codex page fills in the more you meet it.'],
  [`福缘只让铜钱多掉一点，最多多 ${Math.round((PAY.luckCap / PAY.luckDiv) * 100)}%。`, `Luck only nudges coin drops, at most ${Math.round((PAY.luckCap / PAY.luckDiv) * 100)}% more.`],
];

/** The inkstone bar while sprites bake (progress 0..1), with a rotating tip. */
export function Bake(props: { progress: number; label?: string }) {
  const t = useT();
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  useEffect(() => {
    const k = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 3200);
    return () => clearInterval(k);
  }, []);
  const p = Math.max(0, Math.min(1, props.progress));
  return (
    <div class="mj-bake" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)} aria-label={t('研墨', 'Grinding ink')}>
      <p class="mj-bake-title brush">{props.label ?? t('研墨…', 'Grinding ink…')}</p>
      <div class="mj-bake-stone" aria-hidden="true">
        <i class="mj-bake-ink" style={{ transform: `scaleX(${p})` }} />
        <i class="mj-bake-stick" style={{ left: `${p * 100}%` }} />
      </div>
      <p class="mj-bake-tip">{t(TIPS[tip][0], TIPS[tip][1])}</p>
    </div>
  );
}
