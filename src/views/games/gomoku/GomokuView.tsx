// 五子棋 · Gomoku — against the machine (初学 / 棋友 / 国手) or a friend at the same table (同桌).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { Segmented, Sheet, toast } from '../../../ui/kit';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { audio } from '../../../audio/engine';
import { makeSeal, sealReady } from '../../../ink/seal';
import { BLACK, WHITE, CELLS, N, boardFrom, colorOfMove, coordName, idx, colOf, rowOf, outcome, type Color } from './engine';
import type { Level } from './ai';
import { AiClient, type Pending } from './aiClient';
import { BoardPainter, hitTest, type Ghost } from './board';
import { loadSaved, writeSaved, statText, LEVEL_NAMES, type Mode, type Saved } from './save';
import { record as playRecord } from '../../../app/play';
import './gomoku.css';

type T = (zh: string, en: string) => string;

const POEMS = {
  win: [
    ['玉子纹楸一路饶，最宜檐雨竹萧萧。', 'Jade stones on a grained board — best with rain on the eaves and rustling bamboo.', '杜牧', 'Du Mu'],
    ['心似蛛丝游碧落，身如蜩甲化枯枝。', 'The mind drifts like gossamer in the blue; the body sits still as a cicada’s shell.', '黄庭坚', 'Huang Tingjian'],
    ['胜固欣然，败亦可喜。', 'Winning is a joy; losing, too, has its pleasure.', '苏轼《观棋》', 'Su Shi'],
  ],
  loss: [
    ['胜固欣然，败亦可喜。', 'Winning is a joy; losing, too, has its pleasure.', '苏轼《观棋》', 'Su Shi'],
    ['棋罢不知人换世。', 'The game over — who knew the world had changed?', '欧阳修', 'Ouyang Xiu'],
    ['闲敲棋子落灯花。', 'Idly tapping the stones, I watch the lamp-wick blossoms fall.', '赵师秀《约客》', 'Zhao Shixiu'],
  ],
  duo: [
    ['老妻画纸为棋局。', 'My old wife rules a board on paper for our game.', '杜甫《江村》', 'Du Fu'],
    ['闲敲棋子落灯花。', 'Idly tapping the stones, I watch the lamp-wick blossoms fall.', '赵师秀《约客》', 'Zhao Shixiu'],
  ],
  draw: [['棋罢不知人换世。', 'The game over — who knew the world had changed?', '欧阳修', 'Ouyang Xiu']],
} as const;

const colorName = (t: T, c: Color) => (c === BLACK ? t('黑', 'Black') : t('白', 'White'));

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function GomokuView() {
  const t = useT();
  const saved = useMemo<Saved>(loadSaved, []);
  const [mode, setMode] = useState<Mode>(saved.game?.mode ?? saved.prefs.mode);
  const [level, setLevel] = useState<Level>(saved.game?.level ?? saved.prefs.level);
  const [human, setHuman] = useState<Color>(saved.game?.human ?? saved.prefs.human);
  const [moves, setMoves] = useState<number[]>(saved.game?.moves ?? []);
  const [recorded, setRecorded] = useState(saved.game?.recorded ?? false);
  const [stats, setStats] = useState(saved.stats);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState(-1);
  const [hintBusy, setHintBusy] = useState(false);
  const [dropAt, setDropAt] = useState(0);
  const [sheet, setSheet] = useState(false);
  const [announce, setAnnounce] = useState('');

  const client = useMemo(() => new AiClient(), []);
  useEffect(() => () => client.dispose(), []);

  const res = useMemo(() => outcome(moves), [moves]);
  const over = res.winner !== 0 || res.draw;
  const turn = colorOfMove(moves.length);
  const vsAi = mode === 'ai';
  const aiTurn = vsAi && !over && turn !== human;
  const humanMoves = vsAi ? moves.filter((_, i) => colorOfMove(i) === human).length : moves.length;
  const fresh = humanMoves === 0;
  const winAt = useRef(0);

  // persist every change
  useEffect(() => {
    writeSaved({ v: 1, stats, prefs: { mode, level, human }, game: { moves, mode, level, human, recorded } });
  }, [moves, mode, level, human, recorded, stats]);

  const hintJob = useRef<Pending | null>(null);
  const movesRef = useRef(moves);
  movesRef.current = moves;

  const place = (cell: number) => {
    hintJob.current?.cancel();
    hintJob.current = null;
    setMoves((m) => {
      if (cell < 0 || cell >= CELLS || m.includes(cell) || outcome(m).winner) return m;
      return [...m, cell];
    });
    setDropAt(performance.now());
    setHint(-1);
    audio.knock();
  };

  // announce each move for screen readers
  useEffect(() => {
    if (!moves.length) return;
    const last = moves[moves.length - 1];
    setAnnounce(`${colorName(t, colorOfMove(moves.length - 1))} ${coordName(last)}`);
  }, [moves.length]);

  // the machine's turn
  useEffect(() => {
    if (!aiTurn) return;
    setThinking(true);
    let alive = true;
    const job: Pending = client.think(moves, { level });
    const minWait = new Promise((r) => setTimeout(r, moves.length ? 420 : 250));
    Promise.all([job.promise, minWait])
      .then(([r]) => {
        if (!alive) return;
        setThinking(false);
        if (r.move >= 0) place(r.move);
      })
      .catch(() => alive && setThinking(false));
    return () => {
      alive = false;
      job.cancel();
      setThinking(false);
    };
  }, [aiTurn, moves, level]);

  /** Did this game end while we watched (not restored already finished)? — play events count once. */
  const liveGame = useRef(!over);
  // game end: stroke, seal, sound, stats
  useEffect(() => {
    if (!over) {
      liveGame.current = true;
      return;
    }
    if (liveGame.current) {
      liveGame.current = false;
      playRecord('boardgame');
      if (vsAi && res.winner === human && level !== 'beginner') playRecord('win:club');
    }
    winAt.current = performance.now() + (reducedMotion() ? 0 : 260);
    if (vsAi && res.winner === human) audio.chime(5);
    else if (vsAi && res.winner) audio.bell();
    else audio.chime(2);
    if (vsAi && !recorded && res.winner) {
      const next = { ...stats, [level]: { ...stats[level] } };
      if (res.winner === human) next[level].w++;
      else next[level].l++;
      setStats(next);
      setRecorded(true);
    }
  }, [over]);

  const startNew = (patch?: { mode?: Mode; level?: Level; human?: Color }, quiet = false) => {
    const prev = { moves, mode, level, human, recorded };
    const inProgress = !over && humanMoves > 0 && moves.length > 1;
    if (patch?.mode) setMode(patch.mode);
    if (patch?.level) setLevel(patch.level);
    if (patch?.human) setHuman(patch.human);
    setMoves([]);
    setRecorded(false);
    setHint(-1);
    if (inProgress && !quiet) {
      toast(t('已开新局', 'New game started'), {
        action: {
          label: t('撤销', 'Undo'),
          run: () => {
            setMode(prev.mode);
            setLevel(prev.level);
            setHuman(prev.human);
            setRecorded(prev.recorded);
            setMoves(prev.moves);
          },
        },
      });
    }
  };

  const undo = () => {
    if (!moves.length) return;
    const m = moves.slice();
    if (!vsAi) m.pop();
    else {
      let removedHuman = false;
      while (m.length) {
        const c = colorOfMove(m.length - 1);
        m.pop();
        if (c === human) { removedHuman = true; break; }
      }
      if (!removedHuman) return;
    }
    setHint(-1);
    setMoves(m);
    setDropAt(0);
    audio.pluck(-2, 0.4);
  };

  const askHint = () => {
    if (over || aiTurn || hintBusy) return;
    setHintBusy(true);
    const asked = moves;
    const job = client.think(moves, { level: 'club', timeMs: 650 });
    hintJob.current = job;
    job.promise
      .then((r) => {
        // only if the position hasn't moved on meanwhile
        if (movesRef.current === asked) setHint(r.move);
      })
      .catch(() => {})
      .finally(() => {
        if (hintJob.current === job) hintJob.current = null;
        setHintBusy(false);
      });
  };
  // a hint is only valid for the position it was computed for
  useEffect(() => setHint(-1), [moves.length]);

  const canPlace = !over && !aiTurn;
  const canUndo = vsAi ? moves.some((_, i) => colorOfMove(i) === human) : moves.length > 0;

  const levelName = (l: Level) => t(...LEVEL_NAMES[l]);
  const matchLine = vsAi ? `${t('人机', 'vs AI')} · ${levelName(level)} · ${human === BLACK ? t('执黑', 'Black') : t('执白', 'White')}` : t('同桌对弈', 'Two players');
  const l = lang.value;
  const record = vsAi ? statText({ ...saved, stats, prefs: { mode, level, human } }, l, level) : null;

  let status: string;
  if (over) status = res.draw ? t('和棋', 'Draw') : vsAi ? (res.winner === human ? t('你赢了', 'You win') : t('机器胜', 'The machine wins')) : res.winner === BLACK ? t('黑胜', 'Black wins') : t('白胜', 'White wins');
  else if (thinking) status = t('思考中…', 'Thinking…');
  else if (vsAi) status = moves.length === 0 && human === BLACK ? t('执黑先行，落子开局', 'You play black — place a stone to begin') : t('轮到你', 'Your move');
  else status = `${t('轮到', '')}${colorName(t, turn)}${l === 'zh' ? '' : ' to play'}`;

  return (
    <GameShell titleZh="五子棋" titleEn="Gomoku" subtitle={matchLine} class="gomoku-page">
      <div class="gmk">
        <Board
          moves={moves}
          turn={turn}
          canPlace={canPlace}
          hint={hint >= 0 && !over ? hint : -1}
          hintColor={turn}
          win={res.line}
          winAt={winAt}
          dropAt={dropAt}
          onPlace={place}
          label={t('棋盘：方向键移动，回车落子', 'Board: arrow keys to move, Enter to place a stone')}
          t={t}
        />
        <div class="gmk-side">
          <div class={'gmk-status' + (thinking ? ' is-thinking' : '')} aria-live="polite">
            {thinking ? <Incense /> : <span class={'gmk-turn-dot ' + (over ? '' : turn === BLACK ? 'is-black' : 'is-white')} aria-hidden="true" />}
            <span>{status}</span>
            {moves.length > 0 && <span class="gmk-count">{t(`第 ${moves.length} 手`, moves.length === 1 ? "1 stone" : `${moves.length} stones`)}</span>}
          </div>
          <span class="visually-hidden" aria-live="polite">{announce}</span>

          {over && <Result t={t} res={res} vsAi={vsAi} human={human} moves={moves.length} record={record} onAgain={() => startNew(undefined, true)} />}

          <div class="gmk-controls">
            <button type="button" class="btn" onClick={undo} disabled={!canUndo || moves.length === 0}>
              {t('悔棋', 'Undo')}
            </button>
            <button type="button" class="btn" onClick={askHint} disabled={!canPlace || hintBusy}>
              {hintBusy ? t('思量…', 'Pondering…') : t('提示', 'Hint')}
            </button>
            <button type="button" class="btn" onClick={() => (fresh ? startNew() : setSheet(true))}>
              {t('新局', 'New game')}
            </button>
          </div>

          {fresh && !over ? (
            <Setup t={t} mode={mode} level={level} human={human} onChange={(p) => startNew(p, true)} record={record} />
          ) : (
            <p class="gmk-note muted">
              {vsAi && (record ?? matchLine)}
              <button type="button" class="gmk-link" onClick={() => setSheet(true)}>{t('换个棋局', 'Change')}</button>
            </p>
          )}
        </div>
      </div>
      <NewGameSheet
        open={sheet}
        t={t}
        mode={mode}
        level={level}
        human={human}
        onClose={() => setSheet(false)}
        onStart={(p) => {
          setSheet(false);
          startNew(p);
        }}
      />
    </GameShell>
  );
}

function Incense() {
  return (
    <svg class="gmk-incense" viewBox="0 0 16 40" aria-hidden="true">
      <path class="smoke" d="M8 24 C 4 19, 12 15, 7 10 S 10 3, 8 0" />
      <line class="stick" x1="8" y1="25" x2="8" y2="40" />
      <circle class="ember" cx="8" cy="25" r="1.6" />
    </svg>
  );
}

function Setup(props: { t: T; mode: Mode; level: Level; human: Color; record: string | null; onChange: (p: { mode?: Mode; level?: Level; human?: Color }) => void }) {
  const { t } = props;
  return (
    <div class="gmk-setup">
      <Segmented<Mode>
        label={t('对手', 'Opponent')}
        value={props.mode}
        onChange={(mode) => props.onChange({ mode })}
        options={[
          { value: 'ai', label: t('人机', 'vs AI') },
          { value: 'duo', label: t('同桌', 'Two players') },
        ]}
      />
      {props.mode === 'ai' && (
        <>
          <Segmented<Level>
            label={t('棋力', 'Strength')}
            value={props.level}
            onChange={(level) => props.onChange({ level })}
            options={(['beginner', 'club', 'master'] as Level[]).map((l) => ({ value: l, label: t(...LEVEL_NAMES[l]) }))}
          />
          <Segmented<Color>
            label={t('执子', 'Your colour')}
            value={props.human}
            onChange={(human) => props.onChange({ human })}
            options={[
              { value: BLACK, label: t('执黑先行', 'Black, first') },
              { value: WHITE, label: t('执白', 'White') },
            ]}
          />
        </>
      )}
      <p class="gmk-note muted">
        {props.mode === 'ai'
          ? props.record ?? t('先连成五子者胜，长连亦胜。', 'Five or more in a row wins.')
          : t('二人同坐一案，轮流落子。', 'Two people, one board — take turns.')}
      </p>
    </div>
  );
}

function NewGameSheet(props: { open: boolean; t: T; mode: Mode; level: Level; human: Color; onClose: () => void; onStart: (p: { mode: Mode; level: Level; human: Color }) => void }) {
  const { t } = props;
  const [mode, setMode] = useState(props.mode);
  const [level, setLevel] = useState(props.level);
  const [human, setHuman] = useState(props.human);
  useEffect(() => {
    if (!props.open) return;
    setMode(props.mode);
    setLevel(props.level);
    setHuman(props.human);
  }, [props.open]);
  return (
    <Sheet open={props.open} onClose={props.onClose} title={t('新局', 'New game')} label={t('新局', 'New game')}>
      <div class="gmk-sheet">
        <div class="gmk-field">
          <span>{t('对手', 'Opponent')}</span>
          <Segmented<Mode> value={mode} onChange={setMode} label={t('对手', 'Opponent')} options={[{ value: 'ai', label: t('人机', 'vs AI') }, { value: 'duo', label: t('同桌', 'Two players') }]} />
        </div>
        {mode === 'ai' && (
          <>
            <div class="gmk-field">
              <span>{t('棋力', 'Strength')}</span>
              <Segmented<Level> value={level} onChange={setLevel} label={t('棋力', 'Strength')} options={(['beginner', 'club', 'master'] as Level[]).map((l) => ({ value: l, label: t(...LEVEL_NAMES[l]) }))} />
            </div>
            <div class="gmk-field">
              <span>{t('执子', 'Your colour')}</span>
              <Segmented<Color> value={human} onChange={setHuman} label={t('执子', 'Your colour')} options={[{ value: BLACK, label: t('执黑先行', 'Black, first') }, { value: WHITE, label: t('执白', 'White') }]} />
            </div>
          </>
        )}
        <button type="button" class="btn btn-primary gmk-start" onClick={() => props.onStart({ mode, level, human })}>
          {t('开新局', 'Start')}
        </button>
      </div>
    </Sheet>
  );
}

function Result(props: { t: T; res: ReturnType<typeof outcome>; vsAi: boolean; human: Color; moves: number; record: string | null; onAgain: () => void }) {
  const { t, res, vsAi, human } = props;
  const sealRef = useRef<HTMLCanvasElement>(null);
  const won = vsAi && res.winner === human;
  const kind: keyof typeof POEMS = res.draw ? 'draw' : !vsAi ? 'duo' : won ? 'win' : 'loss';
  const poem = POEMS[kind][props.moves % POEMS[kind].length];
  const sealText = res.draw ? '和' : !vsAi ? (res.winner === BLACK ? '黑胜' : '白胜') : won ? '胜' : '负';
  const verdict = res.draw ? t('和棋', 'A draw') : !vsAi ? (res.winner === BLACK ? t('黑棋胜', 'Black wins') : t('白棋胜', 'White wins')) : won ? t('你赢了', 'You win') : t('棋差一着', 'One move short');
  useEffect(() => {
    let alive = true;
    const c = sealRef.current;
    if (!c) return;
    sealReady(sealText).then(() => {
      if (!alive) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal(sealText, { size: 60, dpr, style: won || !vsAi ? 'bai' : 'zhu', shape: sealText.length === 1 ? 'square' : 'square', seed: props.moves });
      c.width = s.width;
      c.height = s.height;
      c.getContext('2d')!.drawImage(s, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, [sealText]);
  const zh = lang.value === 'zh';
  return (
    <div class="gmk-result" role="status">
      <canvas ref={sealRef} class="gmk-seal" aria-hidden="true" />
      <div class="gmk-result-text">
        <p class="gmk-verdict">{verdict}</p>
        <p class="gmk-poem">
          {zh ? poem[0] : poem[1]}
          <span class="gmk-poet">— {zh ? poem[2] : poem[3]}</span>
        </p>
        {props.record && <p class="gmk-record muted">{props.record}</p>}
      </div>
      <button type="button" class="btn btn-seal gmk-again" onClick={props.onAgain}>
        {t('再来一局', 'Play again')}
      </button>
    </div>
  );
}

// ─── the board canvas ──────────────────────────────────────────────────────────────────────────

/** A finger must rest this long before sliding adjusts the stone (quicker = a swipe). */
const HOLD_MS = 150;
/** …and rest this long on the final point before lifting places it. */
const REST_MS = 150;
/** Movement (in grid gaps) still counted as a tap. */
const TAP_SLOP = 0.6;
interface TouchGesture { id: number; x0: number; y0: number; t0: number; drag: boolean; dead: boolean; restFrom: number }

function Board(props: {
  moves: number[];
  turn: Color;
  canPlace: boolean;
  hint: number;
  hintColor: Color;
  win: number[] | null;
  winAt: { current: number };
  dropAt: number;
  onPlace: (cell: number) => void;
  label: string;
  t: T;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<BoardPainter | null>(null);
  const ghost = useRef<Ghost | null>(null);
  const touch = useRef<TouchGesture | null>(null);
  const cursor = useRef(-1);
  const kbd = useRef(false);
  const focused = useRef(false);
  const raf = useRef(0);
  const reduced = useMemo(reducedMotion, []);
  const p = useRef(props);
  p.current = props;

  const frame = () => {
    raf.current = 0;
    const pt = painter.current;
    if (!pt) return;
    const P = p.current;
    const board = boardFrom(P.moves);
    const g = ghost.current;
    const more = pt.draw(
      {
        moves: P.moves,
        dropAt: P.dropAt,
        ghost: g && P.canPlace && !board[g.cell] ? { ...g, color: P.turn } : null,
        hint: P.hint >= 0 && !board[P.hint] ? { cell: P.hint, color: P.hintColor, kind: 'hint' } : null,
        cursor: cursor.current,
        showCursor: kbd.current && focused.current,
        win: P.win ? { line: P.win, at: P.winAt.current } : null,
        reduced,
      },
      performance.now(),
    );
    if (more) raf.current = requestAnimationFrame(frame);
  };
  const redraw = () => {
    if (!raf.current) raf.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    painter.current = new BoardPainter(c);
    const fit = () => {
      const size = w.clientWidth;
      if (!size) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      painter.current!.resize(size, dpr);
      c.style.width = c.style.height = `${Math.floor(size)}px`;
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      frame();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    const holdScroll = (e: TouchEvent) => {
      const g = touch.current;
      if (g && !g.dead && (g.drag || performance.now() - g.t0 >= HOLD_MS) && e.cancelable) e.preventDefault();
    };
    c.addEventListener('touchmove', holdScroll, { passive: false });
    // coordinates are painted with the latin face: repaint once fonts arrive
    document.fonts?.ready.then(() => { painter.current?.invalidate(); fit(); }).catch(() => {});
    return () => {
      ro.disconnect();
      c.removeEventListener('touchmove', holdScroll);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(redraw, [props.moves, props.canPlace, props.hint, props.win, props.dropAt, props.turn]);

  const cellAt = (e: PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return hitTest(painter.current!.g, e.clientX - r.left, e.clientY - r.top);
  };
  const occupied = (cell: number) => cell >= 0 && p.current.moves.includes(cell);

  // Touch: a tap places the stone. A finger that rests (HOLD ms) may then slide to adjust — a
  // crosshair shows where the hidden stone will land — and places on lift only after resting on
  // the final point (REST ms). A quick move before the hold is a swipe: vertical ones scroll the
  // page natively (touch-action: pan-y → pointercancel), any other flick is simply dropped.
  const onDown = (e: PointerEvent) => {
    kbd.current = false;
    void audio.unlock();
    if (e.pointerType === 'mouse') return;
    if (touch.current) {
      // a second finger: this is a pinch or a stray palm, not a move
      touch.current.dead = true;
      ghost.current = null;
      redraw();
      return;
    }
    if (!p.current.canPlace) return;
    const cell = cellAt(e);
    const t0 = performance.now();
    touch.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0, drag: false, dead: false, restFrom: t0 };
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    ghost.current = cell >= 0 && !occupied(cell) ? { cell, color: p.current.turn, kind: 'touch' } : null;
    redraw();
  };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      const cell = cellAt(e);
      const next = cell >= 0 && !occupied(cell) && p.current.canPlace ? cell : -1;
      if ((ghost.current?.cell ?? -1) !== next) {
        ghost.current = next >= 0 ? { cell: next, color: p.current.turn, kind: 'hover' } : null;
        redraw();
      }
      return;
    }
    const g = touch.current;
    if (!g || g.id !== e.pointerId || g.dead) return;
    const now = performance.now();
    if (!g.drag) {
      const gap = painter.current?.g.gap ?? 24;
      if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < gap * TAP_SLOP) return; // a tap's wobble
      if (now - g.t0 < HOLD_MS) {
        g.dead = true; // a flick, not a move
        ghost.current = null;
        redraw();
        return;
      }
      g.drag = true;
    }
    const cell = cellAt(e);
    const next = cell >= 0 && !occupied(cell) ? cell : -1;
    if ((ghost.current?.cell ?? -1) !== next) {
      g.restFrom = now;
      ghost.current = next >= 0 ? { cell: next, color: p.current.turn, kind: 'touch' } : null;
      redraw();
    }
  };
  const onUp = (e: PointerEvent) => {
    let cell = -1;
    if (e.pointerType === 'mouse') {
      if (e.button !== 0 || !p.current.canPlace) return;
      cell = cellAt(e);
    } else {
      const g = touch.current;
      if (!g || g.id !== e.pointerId) return;
      touch.current = null;
      const ok = !g.dead && (!g.drag || performance.now() - g.restFrom >= REST_MS);
      cell = ok && p.current.canPlace ? ghost.current?.cell ?? -1 : -1;
      ghost.current = null;
    }
    if (cell >= 0 && !occupied(cell)) {
      cursor.current = cell;
      p.current.onPlace(cell);
      if (e.pointerType === 'mouse') ghost.current = null;
    }
    redraw();
  };
  const onCancel = (e?: PointerEvent) => {
    if (e && touch.current && touch.current.id !== e.pointerId) return;
    touch.current = null;
    ghost.current = null;
    redraw();
  };
  const onKey = (e: KeyboardEvent) => {
    const moves = p.current.moves;
    let c = cursor.current;
    if (c < 0) c = moves.length ? moves[moves.length - 1] : idx(7, 7);
    let x = colOf(c), y = rowOf(c);
    switch (e.key) {
      case 'ArrowLeft': x = Math.max(0, x - 1); break;
      case 'ArrowRight': x = Math.min(N - 1, x + 1); break;
      case 'ArrowUp': y = Math.max(0, y - 1); break;
      case 'ArrowDown': y = Math.min(N - 1, y + 1); break;
      case 'Home': x = 0; break;
      case 'End': x = N - 1; break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        void audio.unlock();
        if (p.current.canPlace && cursor.current >= 0 && !occupied(cursor.current)) p.current.onPlace(cursor.current);
        else if (cursor.current < 0) { cursor.current = c; kbd.current = true; redraw(); }
        return;
      default:
        return;
    }
    e.preventDefault();
    kbd.current = true;
    cursor.current = idx(x, y);
    redraw();
  };

  const cursorName = cursor.current >= 0 ? coordName(cursor.current) : '';
  return (
    <div class="gmk-board" ref={wrap}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="application"
        aria-label={props.label + (cursorName ? ` · ${cursorName}` : '')}
        aria-roledescription={props.t('棋盘', 'board')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onCancel()}
        onKeyDown={onKey}
        onFocus={() => { focused.current = true; redraw(); }}
        onBlur={() => { focused.current = false; redraw(); }}
      />
    </div>
  );
}
export default GomokuView;
