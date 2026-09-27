// 水月幻镜 · the quest book's purse lists the mirror among 「钱从何来」, with a range that follows PAY.
import { describe, expect, it } from 'vitest';
import { OTHER_SOURCES } from '../src/views/quests/helpers';
import { PAY } from '../src/views/mirror/data/meta';

describe('mirror in the purse', () => {
  it('「钱从何来」 names 幻镜 with a run\'s most: 返照钱 cap + 铜钱 a run', () => {
    const row = OTHER_SOURCES.find((r) => r[0] === '幻镜');
    expect(row).toBeDefined();
    expect(row![1]).toBe('Mirror');
    expect(row![2]).toBe(`1–${PAY.RUN_CAP + PAY.COIN_RUN}`);
  });
});
