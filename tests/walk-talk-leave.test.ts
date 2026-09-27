// ✕ 离开 (or Esc) ends a talk with one of the folk: nothing more is said, and a story beat cut short is
// not told (its flag, its day and its reward wait for another talk). The name, once heard, stays heard.
import { beforeEach, describe, expect, it } from 'vitest';
import { CHARACTERS, type CharacterId } from '../src/data/characters';
import { emptyPlay, play } from '../src/app/play';
import { FOLK, metFlag, planTalk, type Folk } from '../src/views/walk/features/npcs/folk';
import { converse, stallFolk, talkState } from '../src/views/walk/features/npcs/talk';
import type { WorldCtx } from '../src/views/walk/types';

/** A world whose dialogue box answers each line from `answers` (then ▸, 0), and remembers what was said. */
function stub(who: CharacterId, answers: number[]) {
  const said: string[] = [];
  const ctx = {
    player: { character: who },
    hud: {
      say: async (o: { zh: string }) => { said.push(o.zh); return answers.length ? answers.shift()! : 0; },
      toast: () => {},
      showCard: () => {},
    },
    onFrame: () => () => {},
  } as unknown as WorldCtx;
  return { ctx, said };
}

/** Someone met for the first time who tells a story beat at once (an introduction, then the beat's lines). */
function firstBeat(): { x: Folk; who: CharacterId; night: boolean } {
  for (const night of [false, true]) {
    for (const x of FOLK) {
      for (const { id: who } of CHARACTERS) {
        const p = planTalk(x, who, talkState(night));
        if (p.intro && p.beat && p.lines.length >= 1) return { x, who, night };
      }
    }
  }
  throw new Error('no one tells a beat on first meeting');
}

const arcFlags = (id: string) => Object.keys(play.value.flags).filter((k) => k.startsWith(`arc:${id}:`));

describe('leaving a talk part-way', () => {
  beforeEach(() => { play.value = emptyPlay(); });

  it('✕ on the introduction: one line, the name heard, no beat told', async () => {
    const { x, who, night } = firstBeat();
    const { ctx, said } = stub(who, [-1]);
    const r = await converse(ctx, x, { night });
    expect(r).toBeNull();
    expect(said).toHaveLength(1);
    expect(play.value.flags[metFlag(x.id)]).toBe(true);
    expect(arcFlags(x.id)).toEqual([]);
    expect(play.value.coins).toBe(emptyPlay().coins);
  });

  it('Esc on the beat’s first line: nothing after it, and the beat waits for the next talk', async () => {
    const { x, who, night } = firstBeat();
    const { ctx, said } = stub(who, [0, -1]);
    expect(await converse(ctx, x, { night })).toBeNull();
    expect(said).toHaveLength(2);
    expect(arcFlags(x.id)).toEqual([]);
    // (the next talk tells the same beat, from its first line)
    const again = planTalk(x, who, talkState(night));
    expect(again.intro).toBeNull();
    expect(again.beat).not.toBeNull();
  });

  it('heard to the end, the beat is told', async () => {
    const { x, who, night } = firstBeat();
    const { ctx } = stub(who, []);
    expect(await converse(ctx, x, { night })).toBe(true);
    expect(arcFlags(x.id).length).toBe(1);
  });

  it('a stall-keeper’s story left part-way says so (their usual talk does not follow)', async () => {
    const sf = stallFolk('n.peddler');
    const { ctx, said } = stub('scholar', [-1]);
    const r = await sf.story(ctx, false);
    expect(said).toHaveLength(1);
    expect(r).toBeNull();
    expect(arcFlags('n.peddler')).toEqual([]);
  });
});
