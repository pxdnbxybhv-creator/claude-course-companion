// Talking with the folk (see folk.ts): the introduction the first time (a name given, the prompt from
// then on reads 「title·name」), an old acquaintance's greeting, a story beat or the day's line — and
// what a story brings (coins as 乡邻 income, a card, a letter, a day marked for a letter to come).
import type { Interactable, WorldCtx } from '../../types';
import { CHARACTER } from '../../../../data/characters';
import { earnFrom, flag, markDay, play, record } from '../../../../app/play';
import { deliver } from '../../../../app/mail';
import { today } from '../../../../app/store';
import type { Line } from './logic';
import { arcDayKey, folkLabel, folkName, folkOf, metFlag, planTalk, talkKey, type Card, type DLine, type Folk, type TalkPlan, type TalkState } from './folk';
import { busy } from '../minigames/ui';
import * as snd from './sound';

/** Coins from the folk count as their own income row (src:npcs). */
export const NPC_SOURCE = 'npcs';

export function talkState(night: boolean): TalkState {
  const p = play.value;
  return { flags: p.flags, counters: p.counters, daily: p.daily, day: today.value, night };
}

export function isMet(id: string): boolean {
  return !!play.value.flags[metFlag(id)];
}

/**
 * Say `lines` as `name` (a companion's own lines under the companion's name; replies to choices).
 * False as soon as the walker leaves (✕ 离开 or Esc: a line answered −1): nothing more is said.
 */
export async function sayLines(ctx: WorldCtx, name: Line, lines: readonly DLine[]): Promise<boolean> {
  for (const l of lines) {
    if (l.by === 'me') {
      const c = CHARACTER[ctx.player.character];
      if (await ctx.hud.say({ nameZh: c.zh, nameEn: c.en, zh: l.zh, en: l.en }) < 0) return false;
      continue;
    }
    const k = await ctx.hud.say({ nameZh: name.zh, nameEn: name.en, zh: l.zh, en: l.en, choices: l.choices });
    if (k < 0) return false;
    const r = l.replies?.[k];
    if (r && await ctx.hud.say({ nameZh: name.zh, nameEn: name.en, zh: r.zh, en: r.en }) < 0) return false;
  }
  return true;
}

const COIN_TOAST_MS = 1800;

/**
 * A keepsake card, shown once the talk it came from is over — a stall-keeper goes on to their usual
 * business after a story, and their dialogue must not cover it — and once the coins' toast has gone
 * (it sits where the card's title is). Timed by the world's own frames: if the walk is left meanwhile,
 * the frames stop and the card is not shown over something else.
 */
function cardWhenFree(ctx: WorldCtx, card: Card, waitMs: number): void {
  let waited = 0, check = 0;
  let off = () => {};
  off = ctx.onFrame((dt) => {
    waited += dt * 1000;
    if (waited < waitMs || (check -= dt) > 0) return;
    check = 0.2;
    const open = typeof document !== 'undefined' && !!document.querySelector('.walk-say-wrap, .walk-card-wrap, .walk-toast');
    if (busy(ctx) || open) return;
    off();
    ctx.hud.showCard(card);
  });
}

/** A beat told: its flag, one beat a day with this person, and what it brings. */
function settle(ctx: WorldCtx, x: Folk, beat: NonNullable<TalkPlan['beat']>): void {
  flag(beat.flag);
  record(arcDayKey(x.id));
  const r = beat.reward;
  if (!r) return;
  if (r.mark) markDay(r.mark);
  if (r.coins) {
    earnFrom(NPC_SOURCE, r.coins);
    snd.coins();
    ctx.hud.toast(`+${r.coins} 文`, `+${r.coins} coins`, COIN_TOAST_MS);
  }
  if (r.mail) deliver(r.mail);
  if (r.card) cardWhenFree(ctx, r.card, r.coins ? COIN_TOAST_MS + 150 : 250);
}

export interface ConverseOpts {
  night: boolean;
  /** Called once the name is known (after the introduction): relabel the prompt. */
  onMet?: () => void;
  /** Only the introduction and a story beat (the stall-keepers have their own talk after). */
  storyOnly?: boolean;
}

/**
 * One talk with `x`. Resolves true if a story beat was told, false if not, null if the walker left
 * part-way (✕ 离开 or Esc): the rest goes unsaid, and a beat cut short is not told (it waits for
 * another talk). The name, once heard, stays heard.
 */
export async function converse(ctx: WorldCtx, x: Folk, o: ConverseOpts): Promise<boolean | null> {
  const plan = planTalk(x, ctx.player.character, talkState(o.night));
  record(talkKey(x.id));
  let met = isMet(x.id);
  if (plan.intro) {
    const on = await sayLines(ctx, folkName(x, false), [plan.intro]);
    flag(metFlag(x.id));
    met = true;
    o.onMet?.();
    if (!on) return null;
  }
  const name = folkName(x, met);
  if (plan.regular && !await sayLines(ctx, name, [plan.regular])) return null;
  if (o.storyOnly && !plan.beat) return false;
  if (plan.lines.length && !await sayLines(ctx, name, plan.lines)) return null;
  if (plan.beat) { settle(ctx, x, plan.beat); return true; }
  return false;
}

/**
 * A stall-keeper's name, story and prompt (people.ts, ../minigames/npcs.ts). `name()` is what their
 * dialogue shows now (the epithet until met); `story()` tells the introduction and today's beat of
 * their small story, if any, before their usual talk; `prompt(i)` keeps the label in step.
 */
export function stallFolk(id: string) {
  const x = folkOf(id)!;
  let prompt: Interactable | null = null;
  const relabel = () => {
    if (!prompt) return;
    const l = folkLabel(x, isMet(id));
    prompt.labelZh = l.zh; prompt.labelEn = l.en;
  };
  return {
    folk: x,
    name: (): { zh: string; en: string } => folkName(x, isMet(id)),
    /** The same, read when used (a talk's name that changes once you are introduced). */
    nameRef: {
      get zh() { return folkName(x, isMet(id)).zh; },
      get en() { return folkName(x, isMet(id)).en; },
      /** A proper name (not an epithet): English reads “Give it to Sun Qi”, not “to the Sun Qi”. */
      get proper() { return isMet(id); },
    },
    /** The prompt's label now (set once when building the interactable). */
    label: (): Line => folkLabel(x, isMet(id)),
    prompt(i: Interactable): Interactable { prompt = i; relabel(); return i; },
    /**
     * The introduction (first time) and today's story beat, if any: true if a beat was told; null if
     * the walker left part-way (✕ 离开 or Esc), and then their usual talk should not follow either.
     */
    story: (ctx: WorldCtx, night = false): Promise<boolean | null> => {
      const told = converse(ctx, x, { night, storyOnly: true, onMet: relabel });
      return told.finally(relabel);
    },
  };
}
