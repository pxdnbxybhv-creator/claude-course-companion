// 水月幻镜 · the fee ritual (GDD §2, §18.3) and 研墨. Paid: two strings of coins drop into the pond and
// a ripple opens the glass. Free: the old polisher breathes on the bronze, 「今日头一照，老朽请了」, a
// moon-glint. The tutorial: the same glint with the polisher's offer to walk you through. 0.8 s, a tap
// skips it. Then the inkstone grinds while the sprites bake, with tips.
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../../../app/i18n';
import { LINES } from '../tutor/lines';

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

const TIPS: readonly [string, string][] = [
  ['过第十重，镜钱回本。', 'Clear wave 10 and the fee comes back.'],
  ['两件同名同阶的兵器可以合铸成更高一阶。', 'Two copies of a weapon at the same tier merge into the next tier.'],
  ['锁住的货位留到下一重，按新价出售。', 'A locked slot waits for the next shop, at the new price.'],
  ['地上剩下的月华会存入蓄月，下一重每拾一颗多得一颗。', 'Moonlight left on the ground goes into the store: each pickup next wave draws one more.'],
  ['只有真正的铜钱才是圆形方孔；月华从不换钱。', 'Only real coins are round with a square hole; moonlight never turns into money.'],
  ['朱红色的才是危险：敌人的弹丸白心朱边。', 'Only danger is vermilion: enemy shots have a white core and a red rim.'],
  ['湿墨填满预警之处，便是攻击落下之时。', 'When the wet ink fills a warning, the blow lands.'],
  ['暂离随时可以，续镜永远免费。', 'You may step away any time; coming back is always free.'],
  ['首领之重不计时，首领倒下即破。', 'Boss waves are untimed; the wave falls with the boss.'],
  ['每日头一照免费，返照减半，铜钱照常。', 'The first run each day is free: half the reflected coins, coins as usual.'],
  ['两件同类兵器起，类别套装生效；四件、六件更强。', 'Two weapons of a class start its set bonus; four and six grow it.'],
  ['护甲按 15/(15+甲) 减伤，越高越稳。', 'Armour cuts damage by 15/(15+armour).'],
  ['镜鉴里的每一页，见得越多，画得越满。', 'Every codex page fills in the more you meet it.'],
  ['福缘只让铜钱多掉一点，至多一倍半。', 'Luck only nudges coin drops, at most ×1.5.'],
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
