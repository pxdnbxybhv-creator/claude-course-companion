// 华容道 · Huarong Pass — slide the generals aside and let 曹操 slip out through the gap.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { toast } from '../../../ui/kit';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { audio } from '../../../audio/engine';
import { makeSeal, sealReady } from '../../../ink/seal';
import { flag, record as playRecord } from '../../../app/play';
import {
  COLS, ROWS, LAYOUT, LAYOUTS, ROLE_NAMES, Solver, concreteMove, fits, isSolved, keyOf, movePiece, parseLayout, reachable, type Piece,
} from './logic';
import { KlotskiBoard } from './board';
import { BRUSH_FONT } from './paint';
import { decode, encode, loadSaved, writeSaved, type KlotskiSaved } from './store';
import './klotski.css';

type T = (zh: string, en: string) => string;

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Snap { pieces: Piece[]; moves: number }

const POEM = {
  zh: ['曹瞒兵败走华容，正与关公狭路逢。', '只为当初恩义重，放开金锁走蛟龙。'],
  en: 'Beaten, Cao Cao fled by Huarong and met Lord Guan on the narrow road. For a kindness long remembered, Guan opened the golden lock and let the dragon go.',
  src: ['《三国演义》第五十回', 'Romance of the Three Kingdoms, ch. 50'],
};

export function KlotskiView() {
  const t = useT();
  const zh = lang.value === 'zh';
  const saved0 = useMemo<KlotskiSaved>(loadSaved, []);
  const start = useMemo(() => {
    const c = saved0.cur;
    if (c && c.layout === saved0.layout) {
      const p = decode(c.layout, c.pos);
      if (p && !isSolved(p)) return { pieces: p, moves: c.moves, hist: c.hist.map((h) => ({ pieces: decode(c.layout, h.pos)!, moves: h.moves })) };
    }
    return { pieces: parseLayout(LAYOUT[saved0.layout].map), moves: 0, hist: [] as Snap[] };
  }, []);

  const [layoutId, setLayoutId] = useState(saved0.layout);
  const [pieces, setPieces] = useState<Piece[]>(start.pieces);
  const [moves, setMoves] = useState(start.moves);
  const [hist, setHist] = useState<Snap[]>(start.hist);
  const [best, setBest] = useState(saved0.best);
  const [wins, setWins] = useState(saved0.wins);
  const [phase, setPhase] = useState<'play' | 'exit' | 'won'>('play');
  const [record, setRecord] = useState(false);
  const [selected, setSelected] = useState(-1);
  const [held, setHeld] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [live, setLive] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<KlotskiBoard | null>(null);
  const lastMoved = useRef<string | null>(null);
  const cache = useRef<string[] | null>(null);
  const solveJob = useRef<{ cancel(): void } | null>(null);
  // the freshest state for event handlers that outlive a render
  const S = useRef({ pieces, moves, hist, layoutId, phase, selected, held });
  S.current = { pieces, moves, hist, layoutId, phase, selected, held };

  const layout = LAYOUT[layoutId];
  /** A solved layout whose play events are still to be recorded. */
  const pendingPlay = useRef<string | null>(null);
  const flushPlay = () => {
    const lid = pendingPlay.current;
    if (!lid) return;
    pendingPlay.current = null;
    playRecord('klotski');
    if (lid === 'hengdao') flag('klotski:hengdao');
  };
  useEffect(() => () => flushPlay(), []);
  /** The latest handlers, for the board's long-lived event callbacks. */
  const H = useRef<{ doMove: (i: number, x: number, y: number) => void; onTap: (i: number) => void; onTapCell: (x: number, y: number) => void }>(null!);

  // persist
  useEffect(() => {
    writeSaved({
      v: 1, layout: layoutId, best, wins,
      cur: phase === 'play' ? { layout: layoutId, pos: encode(pieces), moves, hist: hist.slice(-300).map((h) => ({ pos: encode(h.pieces), moves: h.moves })) } : null,
    });
  }, [pieces, moves, hist, layoutId, best, wins, phase]);

  // ── the board ──
  useEffect(() => {
    const cv = canvasRef.current!;
    const b = new KlotskiBoard(cv, {
      move: (i, x, y) => H.current.doMove(i, x, y),
      tap: (i) => H.current.onTap(i),
      tapCell: (x, y) => H.current.onTapCell(x, y),
      grab: () => void audio.unlock(),
    });
    b.reduced = reducedMotion();
    boardRef.current = b;
    b.setPieces(S.current.pieces, false);
    b.resize();
    const ro = new ResizeObserver(() => b.resize());
    ro.observe(cv);
    // the carved names want the brush face
    const fonts = document.fonts;
    if (fonts?.load) fonts.load(`40px ${BRUSH_FONT}`, '曹操关羽张飞赵云马超黄忠卒华容道').then(() => b.refreshTiles(), () => {});
    return () => {
      ro.disconnect();
      b.destroy();
      boardRef.current = null;
      solveJob.current?.cancel();
    };
  }, []);

  useEffect(() => {
    const b = boardRef.current;
    if (!b) return;
    b.selected = selected;
    b.locked = phase !== 'play';
    b.draw();
  }, [selected, phase]);

  const clearHint = () => {
    solveJob.current?.cancel();
    solveJob.current = null;
    setHintBusy(false);
    boardRef.current?.setHint(null);
  };

  /** Move piece i to (x, y). Consecutive moves of the same piece count as one (the classic counting). */
  const doMove = (i: number, x: number, y: number) => {
    const s = S.current;
    if (s.phase !== 'play') return;
    const p = s.pieces[i];
    if (!p || (p.x === x && p.y === y)) return;
    const next = movePiece(s.pieces, i, x, y);
    const merge = lastMoved.current === p.id && s.hist.length > 0;
    let moves = s.moves;
    let hist = s.hist;
    if (!merge) {
      hist = [...hist, { pieces: s.pieces, moves: s.moves }];
      moves++;
    }
    lastMoved.current = p.id;
    S.current = { ...s, pieces: next, moves, hist };
    setPieces(next);
    setMoves(moves);
    setHist(hist);
    boardRef.current?.setPieces(next, true);
    boardRef.current?.setHint(null);
    audio.knock();
    const nm = zh ? ROLE_NAMES[p.role].zh : ROLE_NAMES[p.role].en;
    setLive(t(`${nm}移到第${y + 1}行第${x + 1}列 · 第${moves}步`, `${nm} to row ${y + 1}, column ${x + 1} · move ${moves}`));
    if (isSolved(next)) win(next, moves);
  };

  const win = (final: Piece[], n: number) => {
    setPhase('exit');
    setSelected(-1);
    setHeld(false);
    clearHint();
    const b = boardRef.current;
    const ci = final.findIndex((p) => p.role === 'cao');
    audio.chime(5);
    const lid = S.current.layoutId;
    const prevBest = best[lid] ?? 0;
    const isRec = !prevBest || n < prevBest;
    setRecord(isRec && !!prevBest);
    if (isRec) setBest((bb) => ({ ...bb, [lid]: n }));
    setWins((w) => w + 1);
    // play events (and any quest celebration they raise) wait until 曹操 is out and the result
    // card is up; leaving mid-exit still counts them (see the unmount effect)
    pendingPlay.current = lid;
    const done = () => {
      flushPlay();
      setPhase('won');
      setTimeout(() => audio.bell(), 60);
    };
    if (b) b.exit(ci).then(done);
    else done();
    setLive(t(`曹操脱身！共 ${n} 步`, `Cao Cao escapes! ${n} moves`));
  };

  const onTap = (i: number) => {
    void audio.unlock();
    const s = S.current;
    if (s.phase !== 'play') return;
    const opts = reachable(s.pieces, i).filter((r) => r.dist === 1);
    const all = reachable(s.pieces, i);
    if (all.length === 1 || (opts.length === 1 && all.length <= 2)) {
      const r = opts[0] ?? all[0];
      setSelected(-1);
      doMove(i, r.x, r.y);
      return;
    }
    setHeld(false);
    setSelected(i === s.selected ? -1 : i);
    if (!all.length) audio.pluck(-3, 0.25);
  };

  /** With a piece selected, tapping an empty cell sends it there if it can reach it. */
  const onTapCell = (cx: number, cy: number) => {
    const s = S.current;
    if (s.phase !== 'play' || s.selected < 0) return;
    const p = s.pieces[s.selected];
    const dests = reachable(s.pieces, s.selected).filter((r) => cx >= r.x && cx < r.x + p.w && cy >= r.y && cy < r.y + p.h);
    if (!dests.length) {
      setSelected(-1);
      return;
    }
    dests.sort((a, b) => a.dist - b.dist);
    doMove(s.selected, dests[0].x, dests[0].y);
  };

  const undo = () => {
    const s = S.current;
    if (s.phase !== 'play' || !s.hist.length) return;
    const prev = s.hist[s.hist.length - 1];
    const hist = s.hist.slice(0, -1);
    lastMoved.current = null;
    S.current = { ...s, pieces: prev.pieces, moves: prev.moves, hist };
    setPieces(prev.pieces);
    setMoves(prev.moves);
    setHist(hist);
    boardRef.current?.setPieces(prev.pieces, true);
    clearHint();
    audio.pluck(-2, 0.4);
  };

  const begin = (lid: string, quiet = false) => {
    const s = S.current;
    const prev = { pieces: s.pieces, moves: s.moves, hist: s.hist, layoutId: s.layoutId, phase: s.phase };
    const fresh = parseLayout(LAYOUT[lid].map);
    lastMoved.current = null;
    cache.current = null;
    clearHint();
    boardRef.current?.clearExit();
    S.current = { ...s, pieces: fresh, moves: 0, hist: [], layoutId: lid, phase: 'play' };
    setLayoutId(lid);
    setPieces(fresh);
    setMoves(0);
    setHist([]);
    setPhase('play');
    setRecord(false);
    setSelected(-1);
    setHeld(false);
    boardRef.current?.setPieces(fresh, false);
    if (!quiet && prev.phase === 'play' && prev.moves > 0) {
      toast(t('已重新摆局', 'Board reset'), {
        action: {
          label: t('撤销', 'Undo'),
          run: () => {
            S.current = { ...S.current, pieces: prev.pieces, moves: prev.moves, hist: prev.hist, layoutId: prev.layoutId, phase: 'play' };
            setLayoutId(prev.layoutId);
            setPieces(prev.pieces);
            setMoves(prev.moves);
            setHist(prev.hist);
            boardRef.current?.setPieces(prev.pieces, false);
          },
        },
      });
    }
  };

  // ── hint: breadth-first search in small slices, cached along the found path ──
  const askHint = () => {
    void audio.unlock();
    const s = S.current;
    if (s.phase !== 'play' || hintBusy) return;
    const key = keyOf(s.pieces);
    const show = (path: string[]) => {
      const j = path.indexOf(key);
      if (j < 0 || j >= path.length - 1) return false;
      const m = concreteMove(S.current.pieces, path[j + 1]);
      if (!m) return false;
      boardRef.current?.setHint(m);
      const p = S.current.pieces[m.i];
      const nm = zh ? ROLE_NAMES[p.role].zh : ROLE_NAMES[p.role].en;
      setLive(t(`提示：移动${nm}，还需 ${path.length - 1 - j} 步`, `Hint: move ${nm} — ${path.length - 1 - j} moves to go`));
      toast(t(`移动${nm} · 此后最少还需 ${path.length - 1 - j} 步`, `Move ${nm} · ${path.length - 1 - j} moves from here`), 2200);
      return true;
    };
    if (cache.current && show(cache.current)) return;
    setHintBusy(true);
    const solver = new Solver(key);
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (!alive) return;
      const r = solver.step(8);
      if (!r) {
        timer = setTimeout(tick, 0);
        return;
      }
      setHintBusy(false);
      solveJob.current = null;
      if (!r.path) return;
      cache.current = r.path;
      if (keyOf(S.current.pieces) === key) show(r.path);
    };
    solveJob.current = { cancel: () => { alive = false; clearTimeout(timer); } };
    timer = setTimeout(tick, 0);
  };

  // ── keyboard: arrows pick a tile; Space/Enter lifts it and arrows slide it; U undo, H hint ──
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.altKey) return;
    const s = S.current;
    const k = e.key;
    if ((k === 'z' || k === 'Z') && e.ctrlKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.ctrlKey) return;
    if (k === 'u' || k === 'U' || k === 'Backspace') {
      e.preventDefault();
      undo();
      return;
    }
    if (k === 'h' || k === 'H') {
      e.preventDefault();
      askHint();
      return;
    }
    if (s.phase !== 'play') return;
    const dir: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dir[k];
    if (k === ' ' || k === 'Enter') {
      e.preventDefault();
      if (s.selected < 0) setSelected(s.pieces.findIndex((p) => p.role === 'cao'));
      else setHeld(!s.held);
      return;
    }
    if (k === 'Escape') {
      if (s.held) {
        e.preventDefault();
        setHeld(false);
      }
      return;
    }
    if (!d) return;
    e.preventDefault();
    void audio.unlock();
    if (s.selected < 0) {
      setSelected(s.pieces.findIndex((p) => p.role === 'cao'));
      return;
    }
    const p = s.pieces[s.selected];
    if (s.held) {
      if (fits(s.pieces, s.selected, p.x + d[0], p.y + d[1])) doMove(s.selected, p.x + d[0], p.y + d[1]);
      else audio.pluck(-3, 0.2);
      return;
    }
    // move the selection to the nearest tile in that direction
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    let bestI = -1, bestD = Infinity;
    s.pieces.forEach((q, i) => {
      if (i === s.selected) return;
      const qx = q.x + q.w / 2 - cx, qy = q.y + q.h / 2 - cy;
      const along = qx * d[0] + qy * d[1];
      if (along <= 0.01) return;
      const side = Math.abs(qx * d[1]) + Math.abs(qy * d[0]);
      const score = along + side * 2;
      if (score < bestD) { bestD = score; bestI = i; }
    });
    if (bestI >= 0) setSelected(bestI);
  };

  H.current = { doMove, onTap, onTapCell };

  const selName = selected >= 0 && pieces[selected] ? (zh ? ROLE_NAMES[pieces[selected].role].zh : ROLE_NAMES[pieces[selected].role].en) : '';
  const nameOf = (l: typeof LAYOUTS[number]) => (zh ? l.zh : l.en);
  const idx = LAYOUTS.findIndex((l) => l.id === layoutId);

  return (
    <GameShell
      titleZh="华容道"
      titleEn="Huarong Pass"
      class="klotski-page"
      subtitle={
        <span>
          {nameOf(layout)} · <span class="klt-n">{moves}</span> {t('步', moves === 1 ? 'move' : 'moves')}
        </span>
      }
      actions={
        <button type="button" class="btn btn-ghost btn-icon" onClick={() => begin(layoutId)} aria-label={t('重新摆局', 'Reset board')} title={t('重新摆局', 'Reset board')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M18.5 12 A 6.5 6.5 0 1 1 15.5 6.4 M15.5 6.4 L 15.8 2.8 M15.5 6.4 L 19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      }
    >
      <div class="klt">
        <div class={'klt-board' + (phase !== 'play' ? ' is-done' : '')}>
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-roledescription={t('华容道棋盘', 'sliding puzzle')}
            aria-label={t(
              `华容道，${nameOf(layout)}。方向键选子，空格拿起后用方向键推动，H 提示，U 撤销。${selName ? `已选${selName}${held ? '（拿起）' : ''}` : ''}`,
              `Huarong Pass, ${nameOf(layout)}. Arrows pick a tile; Space lifts it and arrows slide it; H for a hint, U to undo. ${selName ? `Selected: ${selName}${held ? ' (lifted)' : ''}` : ''}`,
            )}
            onKeyDown={onKey}
            onBlur={() => setHeld(false)}
          />
          {held && <span class="klt-held" aria-hidden="true">{t('推动中 · 方向键', 'Sliding · arrows')}</span>}
        </div>
        <p class="visually-hidden" aria-live="polite">{live}</p>

        <div class="klt-side">
          {phase === 'won' ? (
            <Result t={t} moves={moves} optimal={layout.optimal} best={best[layoutId] ?? moves} record={record} layoutName={nameOf(layout)}
              onAgain={() => begin(layoutId, true)}
              onNext={idx < LAYOUTS.length - 1 ? () => begin(LAYOUTS[idx + 1].id, true) : undefined}
            />
          ) : (
            <>
              <p class="klt-goal">
                {t('让曹操从下方缺口脱身。', 'Get Cao Cao out through the gap at the bottom.')}
                <span class="klt-opt">
                  {t(`最少 ${layout.optimal} 步`, `best possible: ${layout.optimal}`)}
                  {best[layoutId] ? t(` · 你的最佳 ${best[layoutId]} 步`, ` · yours: ${best[layoutId]}`) : ''}
                </span>
              </p>
              <div class="klt-controls">
                <button type="button" class="btn" onClick={undo} disabled={!hist.length || phase !== 'play'}>
                  {t('悔一步', 'Undo')}
                </button>
                <button type="button" class="btn" onClick={askHint} disabled={phase !== 'play'} aria-busy={hintBusy}>
                  {hintBusy ? t('推演中…', 'Thinking…') : t('提示', 'Hint')}
                </button>
              </div>
            </>
          )}

          <div class="klt-layouts" role="group" aria-label={t('棋局', 'Layouts')}>
            {LAYOUTS.map((l) => (
              <button
                type="button"
                class={'klt-layout' + (l.id === layoutId ? ' is-on' : '')}
                aria-pressed={l.id === layoutId}
                onClick={() => l.id !== layoutId && begin(l.id)}
              >
                <MiniLayout map={l.map} />
                <span class="klt-layout-name">{nameOf(l)}</span>
                <span class="klt-layout-meta num">
                  {best[l.id] ? <span class="klt-done" aria-label={t('已解', 'solved')}>✓ {best[l.id]}</span> : null}
                  <span class="muted">/{l.optimal}</span>
                </span>
              </button>
            ))}
          </div>
          <p class="klt-keys muted">
            {t(`已脱身 ${wins} 次 · 拖动或轻扫木块；只有一条路时轻点即走`, `${wins} escape${wins === 1 ? '' : 's'} · drag or swipe a tile; tap it when it has only one way to go`)}
            <span class="klt-kbd">{t(' · 键盘：方向键选子，空格拿起，H 提示，U 悔棋', ' · Keys: arrows pick, Space lifts, H hint, U undo')}</span>
          </p>
        </div>
      </div>
    </GameShell>
  );
}
export default KlotskiView;

/** A tiny drawing of a layout for its button. */
function MiniLayout(props: { map: string[] }) {
  const pcs = useMemo(() => parseLayout(props.map), [props.map]);
  const u = 6;
  return (
    <svg class="klt-mini" viewBox={`0 0 ${COLS * u + 2} ${ROWS * u + 2}`} aria-hidden="true">
      {pcs.map((p) => (
        <rect x={1 + p.x * u + 0.6} y={1 + p.y * u + 0.6} width={p.w * u - 1.2} height={p.h * u - 1.2} rx="1" class={'klt-mini-' + (p.role === 'cao' ? 'cao' : p.role === 'bing' ? 'bing' : 'gen')} />
      ))}
    </svg>
  );
}

function Result(props: { t: T; moves: number; optimal: number; best: number; record: boolean; layoutName: string; onAgain: () => void; onNext?: () => void }) {
  const { t } = props;
  const sealRef = useRef<HTMLCanvasElement>(null);
  const zh = lang.value === 'zh';
  const perfect = props.moves <= props.optimal;
  useEffect(() => {
    let alive = true;
    const c = sealRef.current;
    if (!c) return;
    sealReady('华容道').then(() => {
      if (!alive) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal('华容道', { size: 64, dpr, style: 'bai', seed: 81 });
      c.width = s.width;
      c.height = s.height;
      c.getContext('2d')!.drawImage(s, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div class="klt-result" role="status">
      <canvas ref={sealRef} class="klt-seal" aria-hidden="true" />
      <div class="klt-result-text">
        <p class="klt-verdict">{t('曹操脱身', 'Cao Cao escapes')}</p>
        <p class="klt-score">
          {t(`${props.layoutName} · ${props.moves} 步`, `${props.layoutName} · ${props.moves} moves`)}
          <span class="muted">
            {perfect ? t(' · 正是最少步数！', ' · the fewest possible!') : t(` · 最少 ${props.optimal} 步`, ` · fewest possible ${props.optimal}`)}
            {props.record ? t(' · 新纪录', ' · a new best') : ''}
          </span>
        </p>
      </div>
      <blockquote class="klt-poem">
        {zh ? (
          <>
            <span>{POEM.zh[0]}</span>
            <span>{POEM.zh[1]}</span>
          </>
        ) : (
          <span>{POEM.en}</span>
        )}
        <cite>— {zh ? POEM.src[0] : POEM.src[1]}</cite>
      </blockquote>
      <div class="klt-again">
        <button type="button" class="btn" onClick={props.onAgain}>{t('再摆一局', 'Play again')}</button>
        {props.onNext && <button type="button" class="btn btn-seal" onClick={props.onNext}>{t('下一局', 'Next layout')}</button>}
      </div>
    </div>
  );
}
