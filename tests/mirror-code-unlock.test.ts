// The owner's code opens every 镜境 and every map in the mirror's lobby — and nothing else about
// the mirror changes (pay, bonuses and records follow the ordinary rules).
import { describe, expect, it, beforeEach } from 'vitest';
import { play, emptyPlay, redeemCode, revokeCode, _acceptCodeForTests } from '../src/app/play';
import { openOf } from '../src/views/mirror/logic/session';
import { DIFF_REG } from '../src/views/mirror/ids';

describe('the mirror under the owner code', () => {
  beforeEach(() => {
    play.value = emptyPlay();
  });

  it('offers only what was earned without the code', () => {
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toEqual({ diffMax: 1, mapsOpen: 1 });
  });

  it('opens every difficulty and map while the code is active, and closes them again when it is taken back', () => {
    _acceptCodeForTests('TESTING');
    expect(redeemCode('TESTING')).toBe('ok');
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toEqual({ diffMax: DIFF_REG.length - 1, mapsOpen: 3 });
    revokeCode();
    expect(openOf({ diffMax: 1, mapsOpen: 1 })).toEqual({ diffMax: 1, mapsOpen: 1 });
  });
});
