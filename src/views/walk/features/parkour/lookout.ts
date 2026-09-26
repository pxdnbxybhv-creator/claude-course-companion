// 登高望远 · a hidden lookout on the west edge of Plum Ridge: climb the stones to the flat rock and
// look out over the drop. Once a day the view is worth a poem (a card) and a purse of coins.
import type { WorldCtx } from '../../types';
import { earn, flag, play, record } from '../../../../app/play';
import { today } from '../../../../app/store';
import { hashString } from '../../../../core/rng';
import type { Bag } from '../kit';
import { LOOKOUT } from './sites';
import * as snd from './sound';

export const LOOKOUT_COINS = 20;

const POEMS: { title: string; titleEn: string; zh: string; en: string }[] = [
  {
    title: '王之涣《登鹳雀楼》', titleEn: 'Wang Zhihuan, “On the Stork Tower”',
    zh: '白日依山尽，黄河入海流。\n欲穷千里目，更上一层楼。',
    en: 'The white sun sets behind the hills; the Yellow River flows into the sea.\nTo see a thousand li further, climb one more storey.',
  },
  {
    title: '杜甫《望岳》', titleEn: 'Du Fu, “Gazing at the Mountain”',
    zh: '荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。',
    en: 'Layered clouds stir my breast; I strain my eyes after homing birds.\nOne day I will stand on the very top, and every mountain will look small.',
  },
  {
    title: '王安石《登飞来峰》', titleEn: 'Wang Anshi, “Climbing Feilai Peak”',
    zh: '飞来山上千寻塔，闻说鸡鸣见日升。\n不畏浮云遮望眼，自缘身在最高层。',
    en: 'A tower a thousand fathoms high on Feilai Peak; at cockcrow, they say, you see the sun rise.\nI do not fear the drifting clouds that hide the view — I stand above them.',
  },
];

/** The lookout: an interactable that appears only while you stand on the top rock. */
export function buildLookout(bag: Bag, ctx: WorldCtx): void {
  const { THREE } = ctx;
  const P = ctx.player;
  const top = ctx.groundY(LOOKOUT.x, LOOKOUT.z);
  let off: (() => void) | null = null;
  const seenToday = () => {
    const p = play.peek();
    return p.daily.day === today.peek() && (p.daily.counts.lookout ?? 0) > 0;
  };
  const poem = POEMS[Math.abs(hashString(`lookout:${today.peek()}`)) % POEMS.length];
  const act = () => {
    const first = !seenToday();
    record('lookout');
    flag('lookout');
    if (first) { earn(LOOKOUT_COINS); snd.coin(ctx.audio, 3); }
    // swing the camera out over the view for a moment
    try { ctx.frameCamera(LOOKOUT.x - 26, LOOKOUT.z - 9, top + 3, 2.6); } catch { /* a nicety */ }
    ctx.hud.showCard({
      titleZh: '登高望远', titleEn: 'Climb High, See Far',
      bodyZh: `${poem.zh}\n—— ${poem.title}${first ? `\n\n今日登临，赏铜钱 ${LOOKOUT_COINS}。` : ''}`,
      bodyEn: `${poem.en}\n— ${poem.titleEn}${first ? `\n\nFirst climb today: ${LOOKOUT_COINS} coins.` : ''}`,
      seal: '望',
    });
  };
  bag.onDispose(() => { off?.(); off = null; });
  bag.frame(() => {
    const p = P.position;
    const on = Math.hypot(p.x - LOOKOUT.x, p.z - LOOKOUT.z) < 1.3 && p.y > top - 0.25 && P.grounded;
    if (on && !off) {
      off = ctx.addInteractable({
        id: 'parkour:lookout',
        position: new THREE.Vector3(LOOKOUT.x, top, LOOKOUT.z),
        radius: 1.6,
        labelZh: '登高望远', labelEn: 'Lookout',
        actionZh: '远眺', actionEn: 'Look out',
        act,
      });
    } else if (!on && off) {
      off();
      off = null;
    }
  });
}
