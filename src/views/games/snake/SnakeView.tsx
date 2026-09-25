// 贪吃蛇 · Snake — one long brushstroke gathering plum blossoms.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { useT } from '../../../app/i18n';
import { Segmented, toast } from '../../../ui/kit';
import { audio } from '../../../audio/engine';
import type { BonusKind, Dir, SnakeState } from './logic';
import { SnakeEngine, type Phase } from './engine';
import { currentFestival } from './festival';
import { sprite } from './paint';
import { loadStats, saveStats, type SnakeMode, type SnakeStats } from './store';
import './snake.css';

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

/** Which half of the board the start hint should sit in: the one without the blossom. */
function hintSide(eng: SnakeEngine | null): 'top' | 'bottom' {
  const f = eng?.state.food;
  return eng && f && (f.y + 0.5) / eng.state.rows > 0.5 ? 'top' : 'bottom';
}

function prefersReduced(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function SnakeView() {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engRef = useRef<SnakeEngine | null>(null);
  const [stats, setStats] = useState<SnakeStats>(loadStats);
  const statsRef = useRef(stats);
  statsRef.current = stats;
  /** The mode picked for new games … */
  const [mode, setModeState] = useState<SnakeMode>(stats.mode);
  /** … and the mode of the game on the board (they differ while a run finishes in its old mode). */
  const [playMode, setPlayMode] = useState<SnakeMode>(stats.mode);
  const [hintAt, setHintAt] = useState<'top' | 'bottom'>('bottom');
  const [phase, setPhase] = useState<Phase>('ready');
  const [score, setScore] = useState(0);
  const [record, setRecord] = useState(false);
  const [won, setWon] = useState(false);
  /** Put the result card in the half of the board away from the splash. */
  const [cardAt, setCardAt] = useState<'top' | 'bottom'>('bottom');
  const [fest] = useState(currentFestival);
  const treatShown = useRef(false);
  const tRef = useRef(t);
  tRef.current = t;

  /** Count a finished run: one more game, and the best score for its mode. Returns whether it set a record. */
  const settle = (s: SnakeState): boolean => {
    const cur = statsRef.current;
    const m: SnakeMode = s.wrap ? 'wrap' : 'walls';
    const isRecord = s.score > cur.best[m];
    const next: SnakeStats = { ...cur, games: cur.games + 1, best: { ...cur.best, [m]: Math.max(cur.best[m], s.score) } };
    statsRef.current = next;
    setStats(next);
    saveStats(next);
    return isRecord && s.score > 0;
  };

  useEffect(() => {
    const cv = canvasRef.current!;
    const eng = new SnakeEngine(
      cv,
      { wrap: mode === 'wrap', bonusKind: fest?.bonus ?? 'osmanthus', moon: !!fest?.moon, reduced: prefersReduced() },
      {
        phase: (p) => {
          setPhase(p);
          const e = engRef.current;
          if (p === 'ready' && e) setPlayMode(e.state.wrap ? 'wrap' : 'walls');
        },
        score: (s) => {
          setScore(s);
          if (s === 0 && engRef.current) setHintAt(hintSide(engRef.current)); // a fresh board
        },
        event: (ev) => {
          if (ev.bonusSpawned && fest && !treatShown.current) {
            treatShown.current = true;
            toast(tRef.current(`${fest.zh}快乐！园中来了${fest.treatZh}，趁它还在，吃到加五分`, `Happy ${fest.en}! A ${fest.treatEn} appeared — eat it before it fades for +5`));
          }
        },
        over: (s) => {
          setRecord(settle(s));
          setWon(s.won);
          const y = engRef.current?.crashY();
          setCardAt(y != null && y > 0.5 ? 'top' : 'bottom');
        },
      },
    );
    engRef.current = eng;
    if (import.meta.env.DEV) (window as unknown as { __snake?: SnakeEngine }).__snake = eng; // for the visual test scripts
    setHintAt(hintSide(eng));
    eng.resize();
    eng.start();
    const ro = new ResizeObserver(() => eng.resize());
    ro.observe(cv);

    const onVis = () => {
      if (document.visibilityState === 'hidden') eng.pause();
    };
    const onBlur = () => eng.pause();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', onBlur);
    const mq = (() => {
      try {
        return matchMedia('(prefers-reduced-motion: reduce)');
      } catch {
        return null;
      }
    })();
    const onMq = () => eng.setOptions({ reduced: !!mq?.matches });
    mq?.addEventListener?.('change', onMq);

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      if (document.querySelector('.sheet-backdrop')) return;
      const d = KEYS[e.key];
      if (d) {
        e.preventDefault();
        void audio.unlock();
        eng.turn(d);
        return;
      }
      const onButton = tg?.tagName === 'BUTTON';
      if ((e.key === ' ' || e.key === 'Spacebar') && !onButton) {
        e.preventDefault();
        void audio.unlock();
        eng.toggle();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (eng.phase === 'playing') eng.pause();
        else if (eng.phase !== 'over') eng.play();
      } else if (e.key === 'Enter' && !onButton && eng.phase !== 'playing') {
        e.preventDefault();
        void audio.unlock();
        eng.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      eng.stop();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', onBlur);
      mq?.removeEventListener?.('change', onMq);
      window.removeEventListener('keydown', onKey);
      engRef.current = null;
    };
  }, []);

  // ── swipe on the board ──
  const swipe = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    void audio.unlock();
    // Presses on the result / pause cards belong to their buttons: capturing the pointer here
    // would retarget the click to the board.
    if ((e.target as Element | null)?.closest?.('.snake-card')) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    const d: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    engRef.current?.turn(d);
    // keep tracking from here, so one continuous gesture can make a second turn
    sw.x = e.clientX;
    sw.y = e.clientY;
    sw.moved = true;
  };
  const onPointerUp = (e: PointerEvent) => {
    const sw = swipe.current;
    swipe.current = null;
    if (!sw || sw.id !== e.pointerId || sw.moved) return;
    const eng = engRef.current;
    if (!eng) return;
    // a tap on the board starts, pauses or resumes
    if (eng.phase === 'ready' || eng.phase === 'paused') eng.play();
    else if (eng.phase === 'playing') eng.pause();
  };

  const pad = (d: Dir) => (e: Event) => {
    e.preventDefault();
    void audio.unlock();
    engRef.current?.turn(d);
  };

  const modeName = (m: SnakeMode) => (m === 'walls' ? t('有墙', 'Walls') : t('穿墙', 'Wrap'));

  /** Count the run on the board (if any) and start afresh in the picked mode. */
  const switchNow = () => {
    const eng = engRef.current;
    if (!eng) return;
    if (eng.inProgress) {
      const s = eng.state;
      const rec = settle(s);
      toast(t(`上一局 ${s.score} 分已记下${rec ? ' · 新纪录' : ''}`, `Last run's ${s.score} is saved${rec ? ' · a new best' : ''}`));
    }
    eng.reset();
    setRecord(false);
    setWon(false);
  };

  const setMode = (m: SnakeMode) => {
    if (m === mode) return;
    setModeState(m);
    const next = { ...statsRef.current, mode: m };
    statsRef.current = next;
    setStats(next);
    saveStats(next);
    const eng = engRef.current;
    if (!eng) return;
    const wrap = m === 'wrap';
    if (eng.inProgress) {
      // Never throw a scoring run away on a stray click: it finishes in its own mode and the
      // new one starts with the next game (or right now, if asked).
      eng.setNext({ wrap });
      if (m !== playMode) {
        eng.pause();
        toast(t(`本局仍按${modeName(playMode)}走完，下一局换作${modeName(m)}`, `This run stays on ${modeName(playMode)}; ${modeName(m)} starts next game`), {
          action: { label: t('现在换', 'Switch now'), run: switchNow },
        });
      }
      return;
    }
    eng.reset({ wrap });
    setPlayMode(m);
    setRecord(false);
    setWon(false);
  };

  const again = () => {
    void audio.unlock();
    setRecord(false);
    setWon(false);
    engRef.current?.reset();
  };

  // Hand focus to the card's button when it appears, so Enter / Space answer it. (The autofocus
  // attribute only works once per page load, so it can't be relied on for cards that come and go.)
  const cardBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase === 'over' || phase === 'paused') cardBtn.current?.focus({ preventScroll: true });
  }, [phase]);

  const best = stats.best[playMode];
  const playing = phase === 'playing';
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  return (
    <GameShell
      titleZh="贪吃蛇"
      titleEn="Snake"
      class="snake-page"
      subtitle={
        <span>
          {t('得分', 'Score')} <b class="num">{score}</b>
          <span class="snake-dot" aria-hidden="true"> · </span>
          {t('最佳', 'Best')} <span class="num">{Math.max(best, phase === 'over' ? 0 : score)}</span>
        </span>
      }
      actions={
        <button
          type="button"
          class="btn btn-ghost btn-icon snake-pausebtn"
          onClick={() => {
            void audio.unlock();
            const eng = engRef.current;
            if (!eng) return;
            if (eng.phase === 'playing') eng.pause();
            else if (eng.phase === 'over') again();
            else eng.play();
          }}
          aria-label={playing ? t('暂停', 'Pause') : phase === 'over' ? t('再来一局', 'Play again') : t('开始', 'Play')}
          title={playing ? t('暂停（空格）', 'Pause (Space)') : t('开始（空格）', 'Play (Space)')}
        >
          {playing ? <PauseIcon /> : phase === 'over' ? <AgainIcon /> : <PlayIcon />}
        </button>
      }
    >
      <div
        class={'snake-stage' + (phase === 'over' ? ' is-over' : '')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
      >
        <canvas
          ref={canvasRef}
          class="snake-canvas"
          role="img"
          aria-label={t(`贪吃蛇棋盘，得分 ${score}`, `Snake board, score ${score}`)}
        />
        {phase === 'ready' && (
          <div class={'snake-veil is-soft at-' + hintAt}>
            <p class="snake-hint">{coarse ? t('滑动棋盘或点方向键开始', 'Swipe the board or tap the pad to begin') : t('按方向键或 WASD 开始', 'Press an arrow key or WASD to begin')}</p>
          </div>
        )}
        {phase === 'paused' && (
          <div class="snake-veil">
            <div class="snake-card is-pause">
              <p class="snake-card-title">{t('暂停', 'Paused')}</p>
              <button type="button" class="btn btn-primary" onClick={() => engRef.current?.play()} ref={cardBtn}>
                {t('继续', 'Resume')}
              </button>
            </div>
          </div>
        )}
        {phase === 'over' && (
          <div class={'snake-veil is-over at-' + cardAt} role="alert">
            <div class="snake-card">
              <div class="snake-card-score num" aria-label={t(`得分 ${score}`, `Score ${score}`)}>{score}</div>
              <div class="snake-card-meta">
                <p class="snake-card-title">{won ? t('满园芳菲', 'The garden is full') : t('一局终了', 'Game over')}</p>
                <p class="snake-card-sub">
                  {record ? <span class="snake-record">{t('新纪录', 'New best')}</span> : <>{t('最佳', 'Best')} <span class="num">{best}</span></>}
                  <span class="snake-dot"> · </span>
                  {modeName(playMode)}
                </p>
              </div>
              <button type="button" class="btn btn-seal" onClick={again} ref={cardBtn}>
                {t('再来一局', 'Play again')}
              </button>
            </div>
          </div>
        )}
      </div>

      <div class="snake-bar">
        <Segmented<SnakeMode>
          label={t('模式', 'Mode')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'walls', label: t('有墙', 'Walls') },
            { value: 'wrap', label: t('穿墙', 'Wrap') },
          ]}
        />
        {fest && (
          <span class="snake-fest" title={t(`今日${fest.zh}，金桂换作${fest.treatZh}`, `${fest.en}: today the golden bonus is a ${fest.treatEn}`)}>
            {fest.moon ? <span class="snake-fest-moon" aria-hidden="true" /> : <TreatIcon kind={fest.bonus} />}
            {fest.moon ? t('中秋 · 月圆人团圆', 'Mid-Autumn · a full moon') : t(`${fest.zh} · 有${fest.treatZh}`, `${fest.en} · ${fest.treatsEn} today`)}
          </span>
        )}
      </div>

      <div class={'snake-pad' + (coarse ? ' is-on' : '')} role="group" aria-label={t('方向', 'Direction')}>
        <button type="button" class="snake-key k-up" onPointerDown={pad('up')} onClick={pad('up')} aria-label={t('上', 'Up')}><Arrow r={0} /></button>
        <button type="button" class="snake-key k-left" onPointerDown={pad('left')} onClick={pad('left')} aria-label={t('左', 'Left')}><Arrow r={-90} /></button>
        <button type="button" class="snake-key k-right" onPointerDown={pad('right')} onClick={pad('right')} aria-label={t('右', 'Right')}><Arrow r={90} /></button>
        <button type="button" class="snake-key k-down" onPointerDown={pad('down')} onClick={pad('down')} aria-label={t('下', 'Down')}><Arrow r={180} /></button>
      </div>

      <p class="snake-help muted">
        {fest
          ? t(`方向键 / WASD 转向 · 空格或 P 暂停 · 吃梅花长一节，${fest.treatZh}加五分`, `Arrows / WASD to steer · Space or P to pause · each blossom adds a segment; a ${fest.treatEn} is +5`)
          : t('方向键 / WASD 转向 · 空格或 P 暂停 · 吃梅花长一节，金桂加三分', 'Arrows / WASD to steer · Space or P to pause · each blossom adds a segment; golden osmanthus is +3')}
      </p>
    </GameShell>
  );
}

/** The festival's treat, painted small on a round of paper (so it reads in dark mode too). */
function TreatIcon(props: { kind: BonusKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const size = 22, big = size * 1.2, px = Math.round(size * dpr);
    cv.width = cv.height = px;
    const off = ((big - size) / 2) * dpr;
    ctx.drawImage(sprite(props.kind, big, dpr), -off, -off, big * dpr, big * dpr);
  }, [props.kind]);
  return <canvas ref={ref} class="snake-fest-treat" aria-hidden="true" />;
}

function Arrow(props: { r: number }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style={{ transform: `rotate(${props.r}deg)` }}>
      <path d="M5 15 C 8 11, 10 9, 12 6.5 C 14 9, 16 11, 19 15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8.5 5.5 C 8.2 10, 8.6 14, 8.4 18.5 M15.5 5.5 C 15.7 10, 15.3 14, 15.6 18.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8 5.5 C 12 8, 15 10, 18.5 12 C 15 14, 12 16, 8 18.5 C 7.6 14, 7.6 10, 8 5.5 Z" fill="currentColor" />
    </svg>
  );
}
function AgainIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M18.5 12 A 6.5 6.5 0 1 1 15.5 6.4 M15.5 6.4 L 15.8 2.8 M15.5 6.4 L 19 6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
    </svg>
  );
}
