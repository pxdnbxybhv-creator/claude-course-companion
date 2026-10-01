// 水月幻镜 · round 8, HIDDEN (build plan §4.H, hidden.md §2.8, §7): one short run each for the hidden three on the
// real engine with the skilled bot's verb policies (sim/realbal.ts verbStep), from wave 30 (godmode before it):
// no engine errors, and the policy used the verb (越女 catches, 山鬼 snaps some taut vines, 后羿 mostly 正中).
import { describe, expect, it } from 'vitest';
import { playReal } from '../src/views/mirror/sim/realbal';

const from30 = { maxWave: 31, godTo: 30, level: 'skilled' as const, zones: true };

describe('m8 hidden · the bot uses the verbs', () => {
  it('越女 (月湖): catches, some 精', () => {
    const r = playReal({ seed: 1, char: 'yuenv', map: 'lake', ...from30 });
    expect(r.errors).toBe(0);
    expect(r.hidden!.catches).toBeGreaterThan(0);
    expect(r.hidden!.perfect).toBeGreaterThan(0);
  }, 120000);

  it('山鬼 (墨林): binds and snaps, some taut', () => {
    const r = playReal({ seed: 1, char: 'shangui', map: 'forest', ...from30 });
    expect(r.errors).toBe(0);
    expect(r.hidden!.binds).toBeGreaterThan(0);
    expect(r.hidden!.snaps).toBeGreaterThan(0);
    expect(r.hidden!.taut).toBeGreaterThan(0);
  }, 120000);

  it('后羿 (广寒): looses, and more than half are 正中', () => {
    const r = playReal({ seed: 1, char: 'houyi', map: 'palace', ...from30 });
    expect(r.errors).toBe(0);
    const h = r.hidden!;
    expect(h.looses).toBeGreaterThan(0);
    expect(h.sweet / h.looses).toBeGreaterThan(0.5);
  }, 120000);

  it('the 13 carry no verb tally', () => {
    const r = playReal({ seed: 1, char: 'scholar', map: 'lake', maxWave: 2 });
    expect(r.hidden).toBeUndefined();
  }, 60000);
});
