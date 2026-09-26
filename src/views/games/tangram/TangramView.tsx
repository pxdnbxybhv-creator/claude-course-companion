// 七巧板 · Tangram — seven pieces, twenty-odd figures washed in pale ink; lay the pieces over one.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { toast } from '../../../ui/kit';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { audio } from '../../../audio/engine';
import { makeSeal, sealReady } from '../../../ink/seal';
import { record as playRecord } from '../../../app/play';
import { TANGRAM_NEW, tangramPay } from '../economy';
import { payToast, type Paid } from '../purse';
import { PaidLine, PayHint } from '../Paid';
import { FIGURE, FIGURES } from './figures';
import { SET, SOLVED, coverage, maskOf, maskTriangles, snap, solveFigure, type Placed, type Pt } from './geometry';
import { FIG_AREA, TangramTable, WORLD, homePieces, quarterTurn } from './board';
import { loadSaved, writeSaved } from './store';
import './tangram.css';

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const PIECE_NAMES: [string, string][] = [
  ['大三角', 'large triangle'], ['大三角', 'large triangle'], ['中三角', 'medium triangle'],
  ['小三角', 'small triangle'], ['小三角', 'small triangle'], ['正方', 'square'], ['斜方', 'parallelogram'],
];

function offsetFor(figId: string): Pt {
  const m = maskOf(FIGURE[figId].art);
  return { x: Math.round((WORLD.w - m.w) / 2), y: Math.round(FIG_AREA.y + (FIG_AREA.h - m.h) / 2) };
}

type Phase = 'play' | 'won' | 'shown';

export function TangramView() {
  const t = useT();
  const zh = lang.value === 'zh';
  const saved0 = useMemo(loadSaved, []);
  const [figId, setFigId] = useState(saved0.fig);
  const [pieces, setPieces] = useState<Placed[]>(saved0.table ?? homePieces());
  const [solved, setSolved] = useState<string[]>(saved0.solved);
  const [phase, setPhase] = useState<Phase>('play');
  const [selected, setSelected] = useState(-1);
  const [live, setLive] = useState('');
  /** What the last figure paid (a new one: 10), for the result card. */
  const [paid, setPaid] = useState<Paid | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tableRef = useRef<TangramTable | null>(null);
  const S = useRef({ figId, pieces, phase, selected, solved });
  S.current = { figId, pieces, phase, selected, solved };

  const fig = FIGURE[figId];
  const mask = useMemo(() => maskOf(fig.art), [figId]);
  const off = useMemo(() => offsetFor(figId), [figId]);

  useEffect(() => {
    writeSaved({ v: 1, fig: figId, solved, table: phase === 'play' ? pieces : null });
  }, [figId, pieces, solved, phase]);

  // ── the table ──
  useEffect(() => {
    const cv = canvasRef.current!;
    const tb = new TangramTable(cv, {
      change: (i, p, how) => H.current.changed(i, p, how),
      select: (i) => {
        void audio.unlock();
        setSelected(i);
      },
    });
    tb.reduced = reducedMotion();
    tb.pieces = S.current.pieces.map((p) => ({ ...p }));
    tb.setPieces(S.current.pieces, 0);
    tableRef.current = tb;
    tb.resize();
    tb.setFigure(maskOf(FIGURE[S.current.figId].art), offsetFor(S.current.figId));
    const ro = new ResizeObserver(() => tb.resize());
    ro.observe(cv);
    return () => {
      ro.disconnect();
      tb.destroy();
      tableRef.current = null;
    };
  }, []);

  useEffect(() => {
    const tb = tableRef.current;
    if (!tb) return;
    tb.selected = selected;
    tb.locked = phase !== 'play';
    tb.draw();
  }, [selected, phase]);

  const check = (next: Placed[]) => {
    const s = S.current;
    if (s.phase !== 'play') return;
    const c = coverage(mask, off, next);
    if (!SOLVED(c)) return;
    // made it
    setPhase('won');
    setSelected(-1);
    tableRef.current?.setInked(true);
    audio.chime(5);
    const first = !s.solved.includes(s.figId);
    if (first) {
      setSolved([...s.solved, s.figId]);
      playRecord('tangram');
      setPaid(payToast(tangramPay(true)));
    }
    setLive(t(`拼成了「${fig.zh}」`, `You made the ${fig.en}`));
  };

  const changed = (i: number, p: Placed, how: 'drop' | 'turn') => {
    const next = S.current.pieces.map((q, k) => (k === i ? p : q));
    S.current = { ...S.current, pieces: next };
    setPieces(next);
    if (how === 'turn') audio.pluck(i % 5, 0.35);
    else audio.knock();
    check(next);
  };

  const H = useRef<{ changed: typeof changed }>(null!);
  H.current = { changed };

  /** Change one piece from the buttons / keys. */
  const edit = (i: number, fn: (p: Placed) => Placed, how: 'drop' | 'turn' = 'turn') => {
    const s = S.current;
    if (s.phase !== 'play' || i < 0) return;
    void audio.unlock();
    const p = fn(s.pieces[i]);
    const next = s.pieces.map((q, k) => (k === i ? p : q));
    tableRef.current?.raise(i);
    tableRef.current?.setPieces(next, 150);
    changed(i, p, how);
  };
  // every figure is laid on the unit grid, so a turn is a quarter turn (to the next grid orientation)
  const rotate = (dir: 1 | -1) => edit(S.current.selected, (p) => snap({ ...p, rot: quarterTurn(p.rot, dir) }, 0.75));
  const flip = () => edit(S.current.selected, (p) => snap({ ...p, flip: !p.flip }, 0.75));

  const start = (id: string, keep = false) => {
    const home = homePieces();
    setFigId(id);
    setPhase('play');
    setPaid(null);
    setSelected(-1);
    const tb = tableRef.current;
    tb?.setInked(false);
    const next = keep ? S.current.pieces : home;
    S.current = { ...S.current, figId: id, phase: 'play', pieces: next };
    setPieces(next);
    tb?.setFigure(maskOf(FIGURE[id].art), offsetFor(id));
    tb?.setPieces(next, 380, 25);
  };

  const scatter = () => {
    const s = S.current;
    const prev = s.pieces;
    start(s.figId);
    if (s.phase === 'play' && prev.some((p, i) => p.x !== homePieces()[i].x || p.y !== homePieces()[i].y)) {
      toast(t('七块板已收回', 'Pieces back in the tray'), {
        action: {
          label: t('撤销', 'Undo'),
          run: () => {
            S.current = { ...S.current, pieces: prev };
            setPieces(prev);
            tableRef.current?.setPieces(prev, 300, 20);
          },
        },
      });
    }
  };

  /** Show one answer: the pieces glide into place (it doesn't count as solved). */
  const reveal = () => {
    const s = S.current;
    if (s.phase !== 'play') return;
    const sol = solveFigure(fig.art);
    if (!sol) return;
    void audio.unlock();
    const target: Placed[] = s.pieces.map((p) => ({ ...p }));
    const taken = new Set<number>();
    // match each piece to a slot of its kind, nearest first
    SET.forEach((k, i) => {
      let best = -1, bd = Infinity;
      sol.forEach((sl, j) => {
        if (sl.kind !== k || taken.has(j)) return;
        const d = Math.hypot(sl.x + off.x - s.pieces[i].x, sl.y + off.y - s.pieces[i].y);
        if (d < bd) { bd = d; best = j; }
      });
      taken.add(best);
      const sl = sol[best];
      target[i] = { kind: k, x: sl.x + off.x, y: sl.y + off.y, rot: sl.rot, flip: sl.flip };
    });
    setPhase('shown');
    setSelected(-1);
    S.current = { ...s, pieces: target, phase: 'shown' };
    setPieces(target);
    const tb = tableRef.current;
    tb?.setPieces(target, 700, 90);
    setTimeout(() => tableRef.current?.setInked(true), reducedMotion() ? 0 : 1300);
    audio.pluck(0, 0.5);
    setLive(t(`「${fig.zh}」的一种拼法`, `One way to make the ${fig.en}`));
  };

  // ── keyboard ──
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const s = S.current;
    const k = e.key;
    if (/^[1-7]$/.test(k)) {
      e.preventDefault();
      const i = Number(k) - 1;
      setSelected(i);
      tableRef.current?.raise(i);
      return;
    }
    if (k === '[' || k === ']') {
      e.preventDefault();
      setSelected(((s.selected < 0 ? 0 : s.selected + (k === ']' ? 1 : -1)) + 7) % 7);
      return;
    }
    if (s.selected < 0) return;
    const d: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (d[k]) {
      e.preventDefault();
      // a whole step lands on the grid (so a keyboard player can finish a figure); Shift nudges freely
      const fine = e.shiftKey;
      const step = fine ? 0.25 : 1;
      edit(s.selected, (p) => {
        const moved = { ...p, x: Math.max(0.2, Math.min(WORLD.w - 0.2, p.x + d[k][0] * step)), y: Math.max(0.2, Math.min(WORLD.h - 0.2, p.y + d[k][1] * step)) };
        return fine ? snap(moved, 0.12) : snap(moved, 1);
      }, 'drop');
    } else if (k === 'r' || k === 'R' || k === 'e' || k === 'E') {
      e.preventDefault();
      rotate(1);
    } else if (k === 'q' || k === 'Q') {
      e.preventDefault();
      rotate(-1);
    } else if (k === 'f' || k === 'F') {
      e.preventDefault();
      flip();
    } else if (k === 'Escape') setSelected(-1);
  };

  const idx = FIGURES.findIndex((f) => f.id === figId);
  const nextId = (() => {
    for (let k = 1; k <= FIGURES.length; k++) {
      const f = FIGURES[(idx + k) % FIGURES.length];
      if (!solved.includes(f.id)) return f.id;
    }
    return FIGURES[(idx + 1) % FIGURES.length].id;
  })();
  const selName = selected >= 0 ? (zh ? PIECE_NAMES[selected][0] : PIECE_NAMES[selected][1]) : '';

  return (
    <GameShell
      titleZh="七巧板"
      titleEn="Tangram"
      class="tangram-page"
      subtitle={
        <span>
          {t(`「${fig.zh}」`, fig.en)} · <span class="tg-n">{solved.length}</span>/<span class="tg-n">{FIGURES.length}</span> {t('幅', 'made')}
        </span>
      }
      actions={
        <button type="button" class="btn btn-ghost btn-icon" onClick={scatter} aria-label={t('收回七块板', 'Put the pieces back')} title={t('收回七块板', 'Put the pieces back')}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M18.5 12 A 6.5 6.5 0 1 1 15.5 6.4 M15.5 6.4 L 15.8 2.8 M15.5 6.4 L 19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          </svg>
        </button>
      }
    >
      <div class="tg">
        <div class="tg-table">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            role="application"
            aria-roledescription={t('七巧板', 'tangram table')}
            aria-label={t(
              `七巧板，拼「${fig.zh}」。数字键 1–7 选板，方向键移动（Shift 微调），R 旋转，F 翻转。${selName ? `已选${selName}` : ''}`,
              `Tangram: make the ${fig.en}. Keys 1–7 pick a piece, arrows move it (Shift for small steps), R turns, F flips. ${selName ? `Selected: ${selName}` : ''}`,
            )}
            onKeyDown={onKey}
          />
          {phase !== 'play' && <FigureName zh={fig.zh} en={fig.en} own={phase === 'won'} />}
        </div>
        <p class="visually-hidden" aria-live="polite">{live}</p>

        <div class="tg-side">
          {phase === 'play' ? (
            <>
              <div class="tg-tools" role="group" aria-label={t('手法', 'Moves')}>
                <button type="button" class="btn tg-tool" onClick={() => rotate(1)} disabled={selected < 0} aria-label={t('旋转 90°', 'Turn 90°')} title={t('旋转 90°（R）', 'Turn 90° (R)')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M18 12a6 6 0 1 1-2.2-4.6M16 3.8v3.8h3.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
                  <span>{t('转', 'Turn')}</span>
                </button>
                <button type="button" class="btn tg-tool" onClick={flip} disabled={selected < 0} aria-label={t('翻面', 'Flip')} title={t('翻面（F）', 'Flip (F)')}>
                  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3v18M9 7 4 17h5zM15 7l5 10h-5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
                  <span>{t('翻', 'Flip')}</span>
                </button>
                <button type="button" class="btn tg-tool" onClick={reveal} title={t('看一种拼法', 'Show one answer')}>
                  <span>{t('看答案', 'Answer')}</span>
                </button>
              </div>
              <p class="tg-help muted">
                {selected >= 0
                  ? t(`已选${selName} · 再点一下转 90°，双指也可转`, `${selName} selected · tap it again to turn 90°, or twist with two fingers`)
                  : t('拖动木板覆在淡墨图上；点一块选中，再点旋转。', 'Drag pieces over the pale ink shape; tap a piece to pick it, tap again to turn it.')}
                <span class="tg-kbd">{t(' · 键盘：1–7 选板，方向键移，R 转，F 翻', ' · Keys: 1–7 pick, arrows move, R turn, F flip')}</span>
              </p>
              <PayHint
                zh={solved.includes(figId) ? '此图已拼过；每拼成一幅新图，得 ' + TANGRAM_NEW + ' 文' : `拼成这幅新图，得 ${TANGRAM_NEW} 文`}
                en={solved.includes(figId) ? `Made before; each new figure pays ${TANGRAM_NEW} coins` : `Making this new figure pays ${TANGRAM_NEW} coins`}
              />
            </>
          ) : (
            <Result
              figZh={fig.zh}
              figEn={fig.en}
              own={phase === 'won'}
              count={solved.length}
              total={FIGURES.length}
              paid={paid}
              onNext={() => start(nextId)}
              onAgain={() => start(figId)}
            />
          )}

          <div class="tg-figs" role="group" aria-label={t('图谱', 'Figures')}>
            {FIGURES.map((f) => (
              <button
                type="button"
                class={'tg-fig' + (f.id === figId ? ' is-on' : '') + (solved.includes(f.id) ? ' is-done' : '')}
                aria-pressed={f.id === figId}
                aria-label={(zh ? f.zh : f.en) + (solved.includes(f.id) ? t('（已拼成）', ' (made)') : '')}
                onClick={() => f.id !== figId && start(f.id)}
              >
                <Thumb art={f.art} />
                <span class="tg-fig-name">{zh ? f.zh : f.en}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </GameShell>
  );
}
export default TangramView;

function Thumb(props: { art: string[] }) {
  const m = useMemo(() => maskOf(props.art), [props.art]);
  const d = useMemo(
    () => maskTriangles(m).map((tri) => 'M' + tri.map((p) => `${p.x} ${p.y}`).join('L') + 'Z').join(''),
    [m],
  );
  const s = Math.max(m.w, m.h);
  return (
    <svg class="tg-thumb" viewBox={`${(m.w - s) / 2 - 0.3} ${(m.h - s) / 2 - 0.3} ${s + 0.6} ${s + 0.6}`} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** The figure's name brushed large once it is made. */
function FigureName(props: { zh: string; en: string; own: boolean }) {
  const zh = lang.value === 'zh';
  return (
    <div class={'tg-name' + (props.own ? ' is-own' : '')} aria-hidden="true">
      <span class={zh ? 'brush' : 'latin'}>{zh ? props.zh : props.en}</span>
    </div>
  );
}

function Result(props: { figZh: string; figEn: string; own: boolean; count: number; total: number; paid: Paid | null; onNext: () => void; onAgain: () => void }) {
  const t = useT();
  const sealRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!props.own) return;
    let alive = true;
    const c = sealRef.current;
    if (!c) return;
    const text = props.figZh.length === 1 ? '巧' + props.figZh : props.figZh;
    sealReady(text).then(() => {
      if (!alive) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal(text, { size: 56, dpr, style: 'zhu', seed: props.count * 7 + 3 });
      c.width = s.width;
      c.height = s.height;
      c.getContext('2d')!.drawImage(s, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, [props.figZh, props.own]);
  return (
    <div class="tg-result" role="status">
      {props.own && <canvas ref={sealRef} class="tg-seal" aria-hidden="true" />}
      <div class="tg-result-text">
        <p class="tg-verdict">{props.own ? t(`拼成「${props.figZh}」`, `The ${props.figEn}, made`) : t(`「${props.figZh}」的一种拼法`, `One way to make the ${props.figEn}`)}</p>
        <p class="tg-count muted">
          {props.own
            ? t(`七块板，已拼成 ${props.count} / ${props.total} 幅`, `${props.count} of ${props.total} figures made`)
            : t('看过答案的这一幅不计入，自己再拼一次吧。', 'Peeked figures don’t count — try it yourself.')}
        </p>
        {props.own && <PaidLine paid={props.paid} />}
      </div>
      <div class="tg-again">
        <button type="button" class="btn" onClick={props.onAgain}>{t('再拼一次', 'Again')}</button>
        <button type="button" class="btn btn-seal" onClick={props.onNext}>{t('下一幅', 'Next figure')}</button>
      </div>
    </div>
  );
}
