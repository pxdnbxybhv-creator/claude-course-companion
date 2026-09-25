// 井字棋 · Tic-tac-toe — circles and crosses, brushed on paper.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { Segmented } from '../../../ui/kit';
import { audio } from '../../../audio/engine';
import { aiMove, emptyBoard, outcome, play, toMove, winner, type Board, type Level, type Mark } from './logic';
import { TttBoard } from './board';
import { LEVEL_NAMES, loadStats, saveStats, type TttStats } from './store';
import './ttt.css';

type Mode = 'ai' | 'pvp';
const ME: Mark = 'O';
const AI: Mark = 'X';
const GLYPH: Record<Mark, string> = { O: '〇', X: '✕' };

function prefersReduced(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Session { a: number; d: number; b: number }

export function TicTacToeView() {
  const t = useT();
  const zh = lang.value === 'zh';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<TttBoard | null>(null);
  const cellsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const [stats, setStats] = useState<TttStats>(loadStats);
  const [mode, setMode] = useState<Mode>(stats.mode);
  const [level, setLevel] = useState<Level>(stats.level);
  const [first, setFirst] = useState<Mark>(stats.first);
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [session, setSession] = useState<Session>({ a: 0, d: 0, b: 0 });
  const [focus, setFocus] = useState(4);
  const [live, setLive] = useState('');
  const game = useRef(1);
  /** The board as of the latest move (state updates land a render later; input may arrive sooner). */
  const boardNow = useRef(board);
  boardNow.current = board;


  const result = outcome(board);
  const turn = toMove(board, first);
  const aiTurn = mode === 'ai' && !result && turn === AI;
  const win = winner(board);

  // ── board painter ──
  useEffect(() => {
    const cv = canvasRef.current!;
    const b = new TttBoard(cv);
    b.reduced = prefersReduced();
    boardRef.current = b;
    b.resize();
    b.newGame(game.current);
    const ro = new ResizeObserver(() => {
      b.resize();
    });
    ro.observe(cv);
    return () => {
      ro.disconnect();
      b.stop();
      boardRef.current = null;
    };
  }, []);

  const persist = (next: TttStats) => {
    setStats(next);
    saveStats(next);
  };

  const newGame = (opts: Partial<{ mode: Mode; level: Level; first: Mark }> = {}) => {
    const m = opts.mode ?? mode, lv = opts.level ?? level, f = opts.first ?? first;
    game.current++;
    const fresh = emptyBoard();
    boardNow.current = fresh;
    setBoard(fresh);
    boardRef.current?.newGame(game.current);
    persist({ ...stats, mode: m, level: lv, first: f });
    setLive('');
  };

  /** Place a mark (from a human, or the machine) and settle the game if it ends. */
  const place = (i: number, who: 'human' | 'ai') => {
    const b = boardNow.current;
    if (b[i] || outcome(b)) return;
    const m = toMove(b, first);
    if (mode === 'ai' && who === 'human' && m !== ME) return;
    const nb = play(b, i, m);
    boardNow.current = nb;
    setBoard(nb);
    boardRef.current?.mark(i, m);
    audio.pluck(i - 2, who === 'ai' ? 0.45 : 0.7);
    setLive(`${GLYPH[m]} ${zh ? `第${i + 1}格` : `cell ${i + 1}`}`);
    const o = outcome(nb);
    if (o) settle(nb, o);
  };

  const settle = (nb: Board, o: Mark | 'draw') => {
    const w = winner(nb);
    if (w) boardRef.current?.win(w.line[0], w.line[2]);
    if (mode === 'ai') {
      const tally = { ...stats.ai[level] };
      if (o === ME) tally.w++;
      else if (o === AI) tally.l++;
      else tally.d++;
      persist({ ...stats, mode, level, first, ai: { ...stats.ai, [level]: tally } });
      setSession((s) => ({ a: s.a + (o === ME ? 1 : 0), d: s.d + (o === 'draw' ? 1 : 0), b: s.b + (o === AI ? 1 : 0) }));
      if (o === ME) audio.chime(3);
      else if (o === AI) setTimeout(() => audio.knock(), 250);
      setLive(o === ME ? t('你赢了', 'You win') : o === AI ? t('机器胜', 'The machine wins') : t('和棋', 'Draw'));
    } else {
      const p = { ...stats.pvp };
      if (o === 'O') p.o++;
      else if (o === 'X') p.x++;
      else p.d++;
      persist({ ...stats, mode, level, first, pvp: p });
      setSession((s) => ({ a: s.a + (o === 'O' ? 1 : 0), d: s.d + (o === 'draw' ? 1 : 0), b: s.b + (o === 'X' ? 1 : 0) }));
      if (o !== 'draw') audio.chime(3);
      setLive(o === 'draw' ? t('和棋', 'Draw') : t(`${GLYPH[o]} 胜`, `${GLYPH[o]} wins`));
    }
  };

  // ── the machine's move, after a moment's thought ──
  useEffect(() => {
    if (!aiTurn) return;
    const id = setTimeout(() => {
      const i = aiMove(board, AI, level);
      if (i >= 0) place(i, 'ai');
    }, board.every((c) => !c) ? 700 : 380 + Math.random() * 320);
    return () => clearTimeout(id);
  }, [aiTurn, board, level]);

  const humanPlay = (i: number) => {
    void audio.unlock();
    if (result) return;
    if (aiTurn) return;
    place(i, 'human');
  };

  // ── keyboard: 1–9 anywhere on the page; arrows move between cells; N / Enter for a new game when over ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (document.querySelector('.sheet-backdrop')) return;
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const i = Number(e.key) - 1;
        setFocus(i);
        humanPlay(i);
      } else if ((e.key === 'n' || e.key === 'N') && !e.repeat) {
        e.preventDefault();
        newGame();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onGridKey = (e: KeyboardEvent) => {
    const d: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const mv = d[e.key];
    if (!mv) return;
    e.preventDefault();
    const x = ((focus % 3) + mv[0] + 3) % 3, y = ((Math.floor(focus / 3) + mv[1] + 3) % 3);
    const n = y * 3 + x;
    setFocus(n);
    cellsRef.current[n]?.focus();
  };

  // ── words ──
  let status: string;
  if (result === 'draw') status = t('和棋', 'Draw');
  else if (result) status = mode === 'ai' ? (result === ME ? t('你赢了', 'You win') : t('机器胜', 'The machine wins')) : t(`${GLYPH[result]} 胜`, `${GLYPH[result]} wins`);
  else if (aiTurn) status = t('对手思量…', 'Thinking…');
  else if (mode === 'ai') status = t(`轮到你 · ${GLYPH[ME]}`, `Your move · ${GLYPH[ME]}`);
  else status = t(`${GLYPH[turn]} 落子`, `${GLYPH[turn]} to move`);

  const cellLabel = (i: number) => {
    const c = board[i];
    const st = c ? GLYPH[c] : t('空', 'empty');
    return t(`第${i + 1}格，${st}`, `Cell ${i + 1}, ${st}`);
  };

  const tally = stats.ai[level];
  const lvName = zh ? LEVEL_NAMES[level].zh : LEVEL_NAMES[level].en;

  return (
    <GameShell
      titleZh="井字棋"
      titleEn="Tic-tac-toe"
      class="ttt-page"
      subtitle={<span class={result ? 'ttt-status is-over' : 'ttt-status'}>{status}</span>}
      actions={
        <button type="button" class="btn btn-ghost btn-icon" onClick={() => newGame()} aria-label={t('重新开局', 'New game')} title={t('重新开局（N）', 'New game (N)')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M18.5 12 A 6.5 6.5 0 1 1 15.5 6.4 M15.5 6.4 L 15.8 2.8 M15.5 6.4 L 19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      }
    >
      <div class={'ttt-stage' + (result ? ' is-over' : '') + (aiTurn ? ' is-waiting' : '')}>
        <canvas ref={canvasRef} class="ttt-canvas" aria-hidden="true" />
        <div class="ttt-cells" role="grid" aria-label={t('棋盘', 'Board')} onKeyDown={onGridKey}>
          {[0, 1, 2].map((r) => (
            <div role="row" class="ttt-row" key={r}>
              {[0, 1, 2].map((c) => {
                const i = r * 3 + c;
                const taken = !!board[i];
                const blocked = taken || !!result || aiTurn;
                const ghost = !blocked ? GLYPH[mode === 'ai' ? ME : turn] : '';
                return (
                  <button
                    key={i}
                    type="button"
                    role="gridcell"
                    ref={(el) => {
                      cellsRef.current[i] = el;
                    }}
                    class={'ttt-cell' + (win?.line.includes(i) ? ' is-win' : '')}
                    tabIndex={focus === i ? 0 : -1}
                    aria-label={cellLabel(i)}
                    aria-disabled={blocked}
                    data-ghost={ghost}
                    onFocus={() => setFocus(i)}
                    onClick={() => humanPlay(i)}
                  >
                    <span class="ttt-num" aria-hidden="true">{i + 1}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p class="visually-hidden" aria-live="polite">{live}</p>

      <div class="ttt-result" aria-hidden={!result}>
        {result && (
          <button type="button" class="btn btn-seal" onClick={() => newGame()}>
            {t('再来一局', 'Play again')}
          </button>
        )}
      </div>

      <div class="ttt-score" aria-label={t('本局比分', 'This session')}>
        <div class="ttt-score-col">
          <span class="ttt-score-n num">{session.a}</span>
          <span class="ttt-score-l">{mode === 'ai' ? t('你', 'You') : '〇'}</span>
        </div>
        <div class="ttt-score-col is-mid">
          <span class="ttt-score-n num">{session.d}</span>
          <span class="ttt-score-l">{t('和', 'Draws')}</span>
        </div>
        <div class="ttt-score-col">
          <span class="ttt-score-n num">{session.b}</span>
          <span class="ttt-score-l">{mode === 'ai' ? t('机', 'AI') : '✕'}</span>
        </div>
      </div>

      <div class="ttt-controls">
        <Segmented<Mode>
          label={t('对手', 'Opponent')}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setSession({ a: 0, d: 0, b: 0 });
            newGame({ mode: m });
          }}
          options={[
            { value: 'ai', label: t('人机', 'vs AI') },
            { value: 'pvp', label: t('同桌', 'Two players') },
          ]}
        />
        {mode === 'ai' && (
          <Segmented<Level>
            label={t('难度', 'Level')}
            value={level}
            onChange={(lv) => {
              setLevel(lv);
              newGame({ level: lv });
            }}
            options={(['easy', 'medium', 'hard'] as Level[]).map((lv) => ({ value: lv, label: zh ? LEVEL_NAMES[lv].zh : LEVEL_NAMES[lv].en }))}
          />
        )}
        <Segmented<Mark>
          label={t('先手', 'Who starts')}
          value={first}
          onChange={(f) => {
            setFirst(f);
            newGame({ first: f });
          }}
          options={
            mode === 'ai'
              ? [
                  { value: 'O', label: t('我先', 'Me first') },
                  { value: 'X', label: t('机先', 'AI first') },
                ]
              : [
                  { value: 'O', label: t('〇 先', '〇 first') },
                  { value: 'X', label: t('✕ 先', '✕ first') },
                ]
          }
        />
      </div>

      <p class="ttt-totals muted">
        {mode === 'ai'
          ? t(`${lvName} · 累计 ${tally.w}胜 ${tally.d}和 ${tally.l}负`, `${lvName} · all-time ${tally.w}W ${tally.d}D ${tally.l}L`)
          : t(`同桌 · 累计 〇${stats.pvp.o}胜 ✕${stats.pvp.x}胜 ${stats.pvp.d}和`, `Two players · all-time 〇 ${stats.pvp.o} · ✕ ${stats.pvp.x} · ${stats.pvp.d} draw${stats.pvp.d === 1 ? '' : 's'}`)}
        <span class="ttt-keys"> · {t('数字键 1–9 落子，N 重开', 'Keys 1–9 to play, N for a new game')}</span>
      </p>
    </GameShell>
  );
}
export default TicTacToeView;
