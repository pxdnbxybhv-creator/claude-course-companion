// 桃源 · 二期: 踩曲 · Treading the yeast (spec §5.1). 杜二 at the 曲池 before the brewery, 晨 and 昼.
// A DOM strip (no draws): two lanes (左 右) rising to a hit line; 跺 is both at once, 碾 a hold. The
// clock is the audio clock (sound.now(), a monotonic clock with the sound off) minus this device's
// calibration (localStorage 'tyl.qu.lag', the median of eight claps along with 杜二); the game plays
// with the sound off — the lanes carry everything. Blocks 2 and 3 each hold a 喊号: 杜二 calls a bar
// (his footprints flash in the ghost lane), and you answer it from memory on blank blots.
//
// Owner: G.
import * as snd from '../../../minigames/sound';
import { h } from '../../../minigames/ui';
import { play } from '../../../../../../app/play';
import { QU_LAG_STORAGE, SONG_IDS, songBestKey, songKey } from '../keys';
import { SONG_NAMES, songOfDay } from '../daily';
import { quBlock } from '../stalls';
import type { GameGrade, Line, SongId } from '../types';
import type { GameDef, Round } from './frame';
import { CALL_BONUS, GRIND_PER_BEAT, GRIND_WINDOW, JUDGE_POINTS, callBonus, chart, coinsFor, comboMul, gradeQu, judge, median, quAccuracy, quSealFeat, songsOpen, type Judge, type Lane, type QuNote } from './logic';
import { QU } from './games-text';

const t = (zh: string, en: string): Line => ({ zh, en });

function readLag(): number | null {
  try {
    const v = localStorage.getItem(QU_LAG_STORAGE);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(-0.3, Math.min(0.4, n)) : null;
  } catch { return null; }
}
function writeLag(v: number): void {
  try { localStorage.setItem(QU_LAG_STORAGE, v.toFixed(3)); } catch { /* storage may be blocked */ }
}

const PX_PER_S = 170;
const HIT_Y = 34;

export const quGame: GameDef = {
  id: 'qu',
  host: () => 'duer',
  stand: { x: 18, z: 3 },
  face: { x: 15.6, z: 4.4 },
  hostAt: { x: 18.6, z: 4.7 },
  hostFace: { x: 18, z: 3 },
  rules: () => QU.duer.rules.map((line) => ({ who: 'duer' as const, line })),
  twist: (day) => { const s = SONG_NAMES[songOfDay(day)]; return t(`号子：《${s.zh}》`, `The call: '${s.en}'`); },
  good: () => ({ who: 'duer', line: QU.duer.good }),
  options(day) {
    const today = songOfDay(day);
    const f = play.peek().flags;
    const open = songsOpen(today, (s) => !!f[songKey(s)], SONG_IDS);
    return {
      label: QU.song,
      items: SONG_IDS.map((s) => ({ id: s, name: t(`《${SONG_NAMES[s].zh}》`, SONG_NAMES[s].en), open: open.includes(s) })),
      pick: today,
    };
  },
  play(r: Round, option: string | null) {
    const song = (SONG_IDS as readonly string[]).includes(option ?? '') ? (option as SongId) : songOfDay(r.day);
    const ch = chart(song);
    const spb = 60 / ch.bpm;
    const calm = r.mood === '定';
    const win = (r.gentle ? 1.5 : 1) * 140 + (calm ? 10 : 0);
    let lag = readLag();

    // ── the view: a side three-quarter at 2.6 m: the block, the walker, 杜二 clapping
    r.view(r.at(15.4, 4.9, 1.6), r.at(18.2, 3.6, 0.8));

    // ── the DOM
    const root = r.root;
    const pad = h('div', 'tyg-pad', undefined, root);
    const top = h('div', 'tyg-top mg-live', undefined, root);
    h('b', 'brush', r.ctx.lang === 'zh' ? `《${SONG_NAMES[song].zh}》` : SONG_NAMES[song].en, top);
    const scoreEl = h('span', 'tyg-num', '0', top);
    const comboEl = h('small', '', '', top);
    const hint = h('div', 'tyg-hint', r.tr(matchMedia('(pointer: coarse)').matches ? QU.hint : QU.hintKeys), root);
    const strip = h('div', 'tyg-strip', undefined, root);
    const ghost = h('div', 'tyg-ghost', undefined, strip);
    const gL = h('i', 'is-l', r.tr(QU.lanes.L), ghost), gR = h('i', 'is-r', r.tr(QU.lanes.R), ghost);
    const lanes = h('div', 'tyg-lanes', undefined, strip);
    const laneL = h('div', 'tyg-lane is-l', undefined, lanes), laneR = h('div', 'tyg-lane is-r', undefined, lanes);
    h('div', 'tyg-hitline', undefined, lanes);
    const flashL = h('i', 'tyg-flash', undefined, laneL), flashR = h('i', 'tyg-flash', undefined, laneR);
    const judgeEl = h('div', 'tyg-judge', '', strip);

    // ── the notes (one element each, placed every frame while near)
    type N = QuNote & { i: number; el: HTMLElement; time: number; end: number; j: Judge | null; held: boolean; grind: boolean; half: Lane | null; halfAt: number };
    let t0 = 0; // audio time of beat 0 (after the count-in)
    const notes: N[] = ch.notes.map((n, i) => {
      const el = h('div', `tyg-note is-${n.lane.toLowerCase()}${n.echo ? ' is-echo' : ''}${n.hold ? ' is-hold' : ''}`, undefined, lanes);
      if (n.hold) el.style.setProperty('--tail', `${Math.round(n.hold * spb * PX_PER_S)}px`);
      el.style.display = 'none';
      return { ...n, i, el, time: 0, end: 0, j: null, held: false, grind: false, half: null, halfAt: 0 };
    });
    let score = 0, combo = 0, zheng = 0, hao = 0, bonus = 0;
    const echoJudges = new Map<number, Judge[]>();
    const calls = ch.calls.map((c) => ({ ...c, done: false, flashed: new Set<number>() }));

    const showJudge = (j: Judge) => {
      judgeEl.textContent = r.tr(QU.judge[j]);
      judgeEl.className = `tyg-judge is-${j === '正' ? 'zheng' : j === '好' ? 'hao' : 'miss'}`;
      void judgeEl.offsetWidth;
      judgeEl.classList.add('is-on');
    };
    const hit = (n: N, j: Judge) => {
      n.j = j;
      n.el.classList.add(j === 'miss' ? 'is-miss' : 'is-hit');
      if (n.echo) {
        const c = calls.find((x) => n.beat >= x.echo && n.beat < x.echo + 4);
        if (c) { const a = echoJudges.get(c.echo) ?? []; a.push(j); echoJudges.set(c.echo, a); }
      }
      if (j === 'miss') { combo = 0; showJudge(j); quBlock(r.ctx)?.puff(); return; }
      quBlock(r.ctx)?.hit();
      if (j === '正') zheng++; else hao++;
      score += JUDGE_POINTS[j] * comboMul(combo);
      combo++;
      if (combo === 10) r.say('duer', QU.duer.barks[0], 1500);
      if (combo === 20) r.say('duer', QU.duer.barks[1], 2000);
      if (combo === 30) r.say('duer', QU.duer.barks[2], 2600);
      showJudge(j);
      try { snd.at('pluck', snd.now(), { note: n.lane === 'L' ? 2 : n.lane === 'R' ? 4 : 0, level: 0.5 }); } catch { /* optional */ }
    };
    const flash = (lane: Lane) => {
      for (const f of lane === 'B' ? [flashL, flashR] : [lane === 'L' ? flashL : flashR]) {
        f.classList.remove('is-on'); void f.offsetWidth; f.classList.add('is-on');
      }
    };

    // ── input: a press on a side at an audio time; a release
    const downs = new Set<Lane>();
    const pressAt = (side: 'L' | 'R' | 'B', at: number) => {
      if (phase !== 'play') return;
      flash(side);
      const tt = at - (lag ?? 0);
      // the nearest unjudged note within the window
      let best: N | null = null, bd = Infinity;
      for (const n of notes) {
        if (n.j) continue;
        const d = Math.abs(tt - n.time) * 1000;
        if (d > win) { if (n.time > tt) break; continue; }
        if (d < bd) { bd = d; best = n; }
      }
      if (!best) return;
      if (best.lane === 'B') {
        if (side === 'B') { hit(best, judge((tt - best.time) * 1000, r.gentle, calm)); return; }
        // one side of a 跺: wait for the other (within 90 ms)
        if (best.half && best.half !== side && tt - best.halfAt < 0.09) { hit(best, judge((best.halfAt - best.time) * 1000, r.gentle, calm)); return; }
        best.half = side; best.halfAt = tt;
        return;
      }
      if (side !== 'B' && side !== best.lane) return; // a stray foot: ignored
      const j = judge((tt - best.time) * 1000, r.gentle, calm);
      hit(best, j);
      if (best.hold && j !== 'miss') best.held = true;
    };
    const releaseAt = (at: number) => {
      const tt = at - (lag ?? 0);
      for (const n of notes) {
        if (!n.held) continue;
        n.held = false;
        n.el.classList.remove('is-holding');
        if (Math.abs(tt - n.end) * 1000 <= GRIND_WINDOW * (r.gentle ? 1.5 : 1)) {
          n.grind = true;
          const g = GRIND_PER_BEAT * (n.hold ?? 0);
          score += g;
          r.pop(`+${g}`, 'is-small');
        }
      }
    };
    // pointers: left or right half; two at once is 跺
    const ptrs = new Map<number, 'L' | 'R'>();
    let lastPtr: { side: 'L' | 'R'; at: number } | null = null;
    const pd = (e: PointerEvent) => {
      if (phase === 'calib') { tap(e.timeStamp / 1000); e.preventDefault(); return; }
      const side: 'L' | 'R' = e.clientX < innerWidth / 2 ? 'L' : 'R';
      ptrs.set(e.pointerId, side);
      const at = e.timeStamp / 1000;
      if (lastPtr && lastPtr.side !== side && at - lastPtr.at < 0.09) { pressAt('B', lastPtr.at); lastPtr = null; }
      else { lastPtr = { side, at }; pressAt(side, at); }
      e.preventDefault();
    };
    const pu = (e: PointerEvent) => { if (ptrs.delete(e.pointerId) && ptrs.size === 0) releaseAt(e.timeStamp / 1000); };
    pad.addEventListener('pointerdown', pd);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    const keyLane = (e: KeyboardEvent): Lane | null => (e.code === 'KeyF' ? 'L' : e.code === 'KeyJ' ? 'R' : e.code === 'Space' ? 'B' : null);
    const kd = (e: KeyboardEvent) => {
      const l = keyLane(e);
      if (!l || e.repeat || document.querySelector('.walk-say-wrap')) return;
      e.preventDefault(); e.stopPropagation();
      if (phase === 'calib') { tap(e.timeStamp / 1000); return; }
      downs.add(l);
      pressAt(l, e.timeStamp / 1000);
    };
    const ku = (e: KeyboardEvent) => {
      const l = keyLane(e);
      if (!l || !downs.has(l)) return;
      e.preventDefault(); e.stopPropagation();
      downs.delete(l);
      if (!downs.size) releaseAt(e.timeStamp / 1000);
    };
    window.addEventListener('keydown', kd, true);
    window.addEventListener('keyup', ku, true);
    r.onStop(() => {
      pad.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      window.removeEventListener('keydown', kd, true);
      window.removeEventListener('keyup', ku, true);
    });

    // ── calibration (the first play on this device): clap along with 杜二, eight times
    let phase: 'calib' | 'lead' | 'play' | 'end' = lag === null ? 'calib' : 'lead';
    const claps: number[] = [];
    const taps: number[] = [];
    const tap = (at: number) => { taps.push(at); flash('B'); };
    let calibEl: HTMLElement | null = null;
    const startCalib = () => {
      calibEl = h('div', 'tyg-calib', undefined, root);
      h('b', 'brush', r.tr(QU.calibrateTitle), calibEl);
      h('span', '', r.quote(r.tr(QU.duer.calibrate)), calibEl);
      const base = snd.now() + 1.2;
      for (let i = 0; i < 8; i++) {
        const c = base + i * (60 / 72);
        claps.push(c);
        try { snd.at('clap', c, { level: 0.9 }); } catch { /* optional */ }
      }
    };
    const endCalib = () => {
      const d: number[] = [];
      for (const tp of taps) {
        let bd = Infinity, bv = 0;
        for (const c of claps) { const v = tp - c; if (Math.abs(v) < Math.abs(bd)) { bd = v; bv = v; } }
        if (Math.abs(bv) < 0.35) d.push(bv);
      }
      lag = d.length >= 4 ? median(d) : 0;
      writeLag(lag);
      calibEl?.remove();
      r.pop(r.tr(QU.calibrateDone), 'is-small');
      phase = 'lead';
    };

    // ── the clock
    let scheduled = -1; // the last beat the drum was scheduled for
    const startPlay = () => {
      t0 = snd.now() + 1.0 + ch.countIn * spb;
      for (const n of notes) { n.time = t0 + n.beat * spb; n.end = n.time + (n.hold ?? 0) * spb; }
      scheduled = -ch.countIn - 1;
      phase = 'play';
      hint.classList.add('is-fade');
    };
    if (phase === 'calib') startCalib(); else startPlay();

    let lastNow = snd.now();
    const endBeat = ch.blocks * ch.blockBeats;
    r.frame(() => {
      const nowA = snd.now();
      // (a pause — the 「这局不玩了？」 question — moves the whole chart on by its length)
      const gap = nowA - lastNow;
      lastNow = nowA;
      if (gap > 0.25 && phase === 'play') {
        t0 += gap;
        for (const n of notes) { n.time += gap; n.end += gap; }
      }
      if (phase === 'calib') {
        if (nowA > claps[claps.length - 1] + 0.8) { endCalib(); startPlay(); }
        return;
      }
      if (phase !== 'play') return;
      const beatNow = (nowA - t0) / spb;
      // schedule the drum (杜二's clap on every beat, a heavier drum on the bar), 0.2 s ahead
      while (scheduled + 1 <= beatNow + 0.2 / spb && scheduled + 1 < endBeat) {
        scheduled++;
        const b = scheduled;
        const inCall = calls.some((c) => b >= c.call && b < c.call + 4);
        try { snd.at(b % 4 === 0 ? 'drum' : 'clap', t0 + b * spb, { level: b < 0 ? 0.9 : inCall ? 0.25 : 0.45 }); } catch { /* optional */ }
      }
      // 杜二's call: his drum and his footprints in the ghost lane
      for (const c of calls) {
        for (let k = 0; k < c.pattern.length; k++) {
          const n = c.pattern[k];
          if (c.flashed.has(k)) continue;
          if (beatNow >= n.beat - 0.03) {
            c.flashed.add(k);
            if (beatNow - n.beat < 0.3) {
              try { snd.at('drum', snd.now(), { level: 0.9 }); } catch { /* optional */ }
              for (const g of n.lane === 'B' ? [gL, gR] : [n.lane === 'L' ? gL : gR]) { g.classList.remove('is-on'); void g.offsetWidth; g.classList.add('is-on'); }
            }
          }
        }
        if (!c.done && beatNow >= c.call - 0.5 && beatNow < c.call) { c.done = true; r.say('duer', QU.duer.call, 1600); }
        // the echo bar settled: +20 if it was all 正
        const ej = echoJudges.get(c.echo);
        const echoN = notes.filter((n) => n.echo && n.beat >= c.echo && n.beat < c.echo + 4).length;
        if (ej && ej.length === echoN && !(c as { paid?: boolean }).paid) {
          (c as { paid?: boolean }).paid = true;
          const b = callBonus(ej);
          if (b) { bonus += b; score += CALL_BONUS; r.pop(r.tr(QU.callBonus), 'is-red'); }
        }
      }
      // the notes: place those near, miss those gone past
      const nowJ = nowA - (lag ?? 0);
      for (const n of notes) {
        const dy = (n.time - nowA) * PX_PER_S;
        const tail = n.hold ? n.hold * spb * PX_PER_S : 0;
        const vis = dy < 260 && dy + tail > -40 && !(n.j && n.j !== 'miss' && !n.hold && dy < -8);
        n.el.style.display = vis ? '' : 'none';
        if (vis) n.el.style.transform = `translateY(${Math.round(HIT_Y + dy)}px)`;
        if (!n.j && (nowJ - n.time) * 1000 > win) {
          // a half-stamped 跺 counts as a 好 miss-free if the one foot was in time
          if (n.lane === 'B' && n.half) hit(n, judge((n.halfAt - n.time) * 1000, true, calm) === 'miss' ? 'miss' : '好');
          else hit(n, 'miss');
        }
        if (n.held) n.el.classList.add('is-holding');
      }
      scoreEl.textContent = String(Math.floor(score));
      comboEl.textContent = combo >= 5 ? `${r.tr(QU.combo)} ${combo}` : '';
      if (beatNow > endBeat + 1.5) finish();
    });

    const finish = () => {
      if (phase === 'end') return;
      phase = 'end';
      const acc = quAccuracy(zheng, hao, notes.length);
      const grade: GameGrade = gradeQu(acc);
      const total = Math.floor(score);
      const flags: string[] = [];
      if (grade !== '初') flags.push(songKey(song));
      const pct = Math.round(acc * 100);
      r.finish({
        score: total,
        measure: acc,
        feat: quSealFeat(song, grade),
        yue: song === songOfDay(r.day) ? total : 0,
        coins: coinsFor('qu', total),
        lines: [t(`《${SONG_NAMES[song].zh}》 · ${QU.accuracy.zh} ${pct}%${bonus ? ` · 喊号 +${bonus}` : ''}`, `'${SONG_NAMES[song].en}' · ${QU.accuracy.en} ${pct}%${bonus ? ` · call and answer +${bonus}` : ''}`)],
        say: { who: 'duer', line: grade === '初' ? QU.duer.lose : QU.duer.win },
        bests: r.gentle ? [] : [{ key: songBestKey(song), value: total }],
        flags,
      });
    };
  },
};
