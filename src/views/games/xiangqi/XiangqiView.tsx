// 象棋 · Xiangqi — against the machine (初学 / 棋友 / 国手) or a friend at the same table (同桌).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { Segmented, Sheet, toast } from '../../../ui/kit';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { record } from '../../../app/play';
import { audio } from '../../../audio/engine';
import { makeSeal, sealReady } from '../../../ink/seal';
import { Position, RED, BLACK, moveOf, sideOf, pieceChar, sq, notation, type Outcome, type Side } from './engine';
import { PIECE_VALUE, type Level } from './ai';
import { AiClient, type Pending } from './aiClient';
import { BoardPainter, ASPECT, hitTest, stepOnScreen, boardFontsReady, type Slide, type LabelLang } from './board';
import { loadSaved, writeSaved, statText, LEVEL_NAMES, LEVEL_IDS, type Mode, type Saved } from './save';
import './xiangqi.css';

type T = (zh: string, en: string) => string;
type Poem = readonly [string, string, string, string];

const POEMS: Record<'win' | 'loss' | 'draw' | 'duo', readonly Poem[]> = {
  win: [
    ['大风起兮云飞扬，威加海内兮归故乡。', 'A great wind rises and the clouds fly; my might fills the land, and I come home.', '刘邦《大风歌》', 'Liu Bang, Song of the Great Wind'],
    ['但使龙城飞将在，不教胡马度阴山。', 'Were the Flying General still at Dragon City, no raider’s horse would cross the Yin Mountains.', '王昌龄《出塞》', 'Wang Changling, Beyond the Frontier'],
  ],
  loss: [
    ['胜败兵家事不期，包羞忍耻是男儿。', 'No general can foretell victory or defeat; to bear the shame is what makes a man.', '杜牧《题乌江亭》', 'Du Mu, At the Wujiang Pavilion'],
    ['江东子弟多才俊，卷土重来未可知。', 'East of the river the young are many and able — who knows, he might have come back in a cloud of dust.', '杜牧《题乌江亭》', 'Du Mu, At the Wujiang Pavilion'],
    ['胜固欣然，败亦可喜。', 'Winning is a joy; losing, too, has its pleasure.', '苏轼《观棋》', 'Su Shi, Watching Chess'],
  ],
  draw: [
    ['棋罢不知人换世，酒阑无奈客思家。', 'The game over — who knew the world had changed? The wine run dry, the traveller longs for home.', '欧阳修《梦中作》', 'Ouyang Xiu, Written in a Dream'],
    ['胜固欣然，败亦可喜。', 'Winning is a joy; losing, too, has its pleasure.', '苏轼《观棋》', 'Su Shi, Watching Chess'],
  ],
  duo: [
    ['有约不来过夜半，闲敲棋子落灯花。', 'My friend has not come, and midnight is past; I idly tap the pieces, and the lamp-wick blossoms fall.', '赵师秀《约客》', 'Zhao Shixiu, Waiting for a Guest'],
    ['生当作人杰，死亦为鬼雄。', 'In life, be a hero among men; in death, a hero among the shades.', '李清照《夏日绝句》', 'Li Qingzhao, Summer Quatrain'],
  ],
};

const REASONS: Record<Outcome['reason'], [string, string]> = {
  mate: ['将死', 'Checkmate'],
  stalemate: ['困毙：无子可动', 'Stalemate — no legal move loses'],
  perpetual: ['长将判负', 'Perpetual check loses'],
  repetition: ['三次重复，判和', 'Threefold repetition — a draw'],
  rule60: ['六十回合未吃子，判和', 'Sixty moves without a capture — a draw'],
  material: ['双方无子过河，判和', 'Neither side can attack — a draw'],
};

const sideName = (t: T, s: Side) => (s === RED ? t('红', 'Red') : t('黑', 'Black'));

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Game {
  pos: Position;
  /** notation for each move, [zh, en] */
  notes: [string, string][];
  outcome: Outcome | null;
  /** the general in check, or -1 */
  check: number;
}

function build(moves: readonly number[]): Game {
  const pos = new Position();
  const notes: [string, string][] = [];
  for (const m of moves) {
    const zh = notationSafe(pos, m, 'zh'), en = notationSafe(pos, m, 'en');
    if (!pos.play(m)) break;
    notes.push([zh, en]);
  }
  return { pos, notes, outcome: pos.outcome(), check: pos.inCheck() ? pos.kings[pos.side] : -1 };
}
function notationSafe(p: Position, m: number, l: 'zh' | 'en') {
  try {
    return notation(p, m, l);
  } catch {
    return '';
  }
}

export function XiangqiView() {
  const t = useT();
  const saved = useMemo<Saved>(loadSaved, []);
  const [mode, setMode] = useState<Mode>(saved.game?.mode ?? saved.prefs.mode);
  const [level, setLevel] = useState<Level>(saved.game?.level ?? saved.prefs.level);
  const [human, setHuman] = useState<Side>(saved.game?.human ?? saved.prefs.human);
  const [moves, setMoves] = useState<number[]>(saved.game?.moves ?? []);
  const [recorded, setRecorded] = useState(saved.game?.recorded ?? false);
  const [stats, setStats] = useState(saved.stats);
  const [flipManual, setFlipManual] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [slide, setSlide] = useState<Slide | null>(null);
  const [sel, setSel] = useState(-1);
  const [sheet, setSheet] = useState(false);
  const [announce, setAnnounce] = useState('');

  const client = useMemo(() => new AiClient(), []);
  useEffect(() => () => client.dispose(), []);

  const game = useMemo(() => build(moves), [moves]);
  const pos = game.pos;
  const res = game.outcome;
  const over = !!res;
  const turn = pos.side;
  const vsAi = mode === 'ai';
  const aiTurn = vsAi && !over && turn !== human;
  const canMove = !over && !aiTurn;
  const humanMoves = vsAi ? moves.filter((_, i) => (i % 2 === 0 ? RED : BLACK) === human).length : moves.length;
  const fresh = humanMoves === 0;
  const flip = (vsAi && human === BLACK) !== flipManual;
  const checkAt = useRef(0);
  const lastCheck = useRef(-1);
  if (game.check !== lastCheck.current) {
    lastCheck.current = game.check;
    checkAt.current = performance.now();
  }

  // persist every change
  useEffect(() => {
    writeSaved({ v: 1, stats, prefs: { mode, level, human }, game: { moves, mode, level, human, recorded } });
  }, [moves, mode, level, human, recorded, stats]);

  // a game restored on load (already over, or in check) makes no sound: audio needs a gesture first
  const restored = useRef(true);
  useEffect(() => {
    // after this commit's other effects have seen it
    const id = setTimeout(() => (restored.current = false), 0);
    return () => clearTimeout(id);
  }, []);

  const hintJob = useRef<Pending | null>(null);
  const movesRef = useRef(moves);
  movesRef.current = moves;

  const play = (mv: number, animate = true) => {
    hintJob.current?.cancel();
    hintJob.current = null;
    const p = game.pos;
    const from = mv & 255, to = mv >> 8;
    if (!p.isLegal(mv)) return;
    const piece = p.board[from], captured = p.board[to];
    setSlide({ from, to, piece, captured, at: animate ? performance.now() : 0 });
    setMoves((m) => (m === movesRef.current ? [...m, mv] : m));
    setSel(-1);
    setHint(0);
    audio.knock();
    if (captured) audio.pluck(-3, 0.35);
  };

  // announce each move for screen readers, and ring on check
  useEffect(() => {
    if (!moves.length) return;
    const n = game.notes[game.notes.length - 1];
    const mover: Side = moves.length % 2 === 1 ? RED : BLACK;
    const l = lang.value;
    setAnnounce(`${sideName(t, mover)} ${n ? (l === 'zh' ? n[0] : n[1]) : ''}${game.check >= 0 ? t('，将军', ', check') : ''}`);
    if (game.check >= 0 && !game.outcome && !restored.current) audio.pluck(5, 0.45);
  }, [moves.length]);

  // the machine's turn
  useEffect(() => {
    if (!aiTurn) return;
    setThinking(true);
    let alive = true;
    const job: Pending = client.think(moves, { level });
    const minWait = new Promise((r) => setTimeout(r, moves.length ? 380 : 260));
    Promise.all([job.promise, minWait])
      .then(([r]) => {
        if (!alive) return;
        setThinking(false);
        if (r.move) play(r.move);
      })
      .catch(() => alive && setThinking(false));
    return () => {
      alive = false;
      job.cancel();
      setThinking(false);
    };
  }, [aiTurn, moves, level]);

  // game end: sound, stats, play records
  useEffect(() => {
    if (!over || !res) return;
    const won = vsAi && res.winner === human;
    if (!restored.current) {
      if (won) audio.chime(5);
      else if (vsAi && res.winner !== null) audio.bell();
      else audio.chime(2);
    }
    if (recorded) return;
    setRecorded(true);
    record('boardgame');
    if (vsAi) {
      const next = { ...stats, [level]: { ...stats[level] } };
      if (res.winner === null) next[level].d++;
      else if (won) next[level].w++;
      else next[level].l++;
      setStats(next);
      if (won && (level === 'club' || level === 'master')) record('win:club');
      if (won && level === 'master') record('win:xiangqi-master');
    }
  }, [over]);

  const startNew = (patch?: { mode?: Mode; level?: Level; human?: Side }, quiet = false) => {
    const prev = { moves, mode, level, human, recorded };
    const inProgress = !over && humanMoves > 0 && moves.length > 1;
    if (patch?.mode) setMode(patch.mode);
    if (patch?.level) setLevel(patch.level);
    if (patch?.human !== undefined) setHuman(patch.human);
    setMoves([]);
    setRecorded(false);
    setHint(0);
    setSel(-1);
    setSlide(null);
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
        const c: Side = (m.length - 1) % 2 === 0 ? RED : BLACK;
        m.pop();
        if (c === human) { removedHuman = true; break; }
      }
      if (!removedHuman) return;
    }
    setHint(0);
    setSel(-1);
    setSlide(null);
    setMoves(m);
    audio.pluck(-2, 0.4);
  };

  const askHint = () => {
    if (over || aiTurn || hintBusy) return;
    setHintBusy(true);
    const asked = moves;
    const job = client.think(moves, { level: 'club', timeMs: 700, book: false });
    hintJob.current = job;
    job.promise
      .then((r) => {
        if (movesRef.current === asked && r.move) setHint(r.move);
      })
      .catch(() => {})
      .finally(() => {
        if (hintJob.current === job) hintJob.current = null;
        setHintBusy(false);
      });
  };

  const targets = useMemo(() => (sel >= 0 && canMove ? pos.targetsFrom(sel) : []), [sel, game, canMove]);

  const pickable = (s: number) => canMove && s >= 0 && !!pos.board[s] && sideOf(pos.board[s]) === turn;
  const tap = (s: number) => {
    if (!canMove) return;
    if (sel >= 0 && targets.includes(s)) return play(moveOf(sel, s));
    if (pickable(s)) {
      setSel(s === sel ? -1 : s);
      if (s !== sel) audio.pluck(1, 0.18);
      return;
    }
    setSel(-1);
  };
  const pick = (s: number) => {
    if (pickable(s) && s !== sel) setSel(s);
  };
  const drop = (from: number, to: number) => {
    if (!canMove) return;
    const mv = moveOf(from, to);
    if (pos.isLegal(mv)) play(mv, false);
  };

  const canUndo = vsAi ? moves.some((_, i) => (i % 2 === 0 ? RED : BLACK) === human) : moves.length > 0;
  const levelName = (l: Level) => t(...LEVEL_NAMES[l]);
  const matchLine = vsAi ? `${t('人机', 'vs AI')} · ${levelName(level)} · ${human === RED ? t('执红', 'Red') : t('执黑', 'Black')}` : t('同桌对弈', 'Two players');
  const l = lang.value;
  const recordLine = vsAi ? statText({ ...saved, stats, prefs: { mode, level, human } }, l, level) : null;

  // once the game is over the result card says who won and why, and the status line steps aside
  let status: string;
  if (thinking) status = t('思考中…', 'Thinking…');
  else if (vsAi) status = moves.length === 0 && human === RED ? t('执红先行，请走第一步', 'You play red — make the first move') : t('轮到你', 'Your move');
  else status = l === 'zh' ? `轮到${sideName(t, turn)}方` : `${sideName(t, turn)} to move`;

  const lastMove = moves.length ? moves[moves.length - 1] : 0;
  const caps = useMemo(() => pos.captures(), [game]);
  // the tray reads strongest first: 车 炮 马 相 仕 兵
  const lostBy = (s: Side) => caps.filter((p) => sideOf(p) === s).sort((a, b) => PIECE_VALUE[b & 7] - PIECE_VALUE[a & 7] || (b & 7) - (a & 7));

  return (
    <GameShell titleZh="象棋" titleEn="Xiangqi" subtitle={matchLine} class="xiangqi-page">
      <div class="xq">
        <Board
          board={pos.board}
          slide={slide}
          lastMove={lastMove}
          selected={canMove ? sel : -1}
          targets={targets}
          check={game.check}
          checkAt={checkAt}
          over={over}
          hint={hint && !over ? hint : 0}
          flip={flip}
          lang={l}
          pickable={pickable}
          onTap={tap}
          onPick={pick}
          onDrop={drop}
          label={t('棋盘：方向键移动，回车选子或落子，Esc 取消', 'Board: arrow keys to move, Enter to pick up or place, Esc to cancel')}
          t={t}
        />
        <div class="xq-side">
          {!over && (
            <div class={'xq-status' + (thinking ? ' is-thinking' : '')} aria-live="polite">
              {thinking ? <Incense /> : <span class={'xq-turn ' + (turn === RED ? 'is-red' : 'is-black')} aria-hidden="true">{turn === RED ? '帅' : '将'}</span>}
              <span>{status}</span>
              {game.check >= 0 && (
                <span class="xq-check" key={moves.length}>
                  <CheckSeal />
                  {t('将军！', 'Check!')}
                </span>
              )}
            </div>
          )}
          <span class="visually-hidden" aria-live="polite">{announce}</span>

          {res && <Result t={t} res={res} vsAi={vsAi} human={human} plies={moves.length} record={recordLine} onAgain={() => startNew(undefined, true)} />}

          <Tray t={t} lostRed={lostBy(RED)} lostBlack={lostBy(BLACK)} />

          <div class="xq-controls">
            <button type="button" class="btn" onClick={undo} disabled={!canUndo}>
              {t('悔棋', 'Undo')}
            </button>
            <button type="button" class="btn" onClick={askHint} disabled={!canMove || hintBusy}>
              {hintBusy ? t('思量…', 'Pondering…') : t('提示', 'Hint')}
            </button>
            <button type="button" class="btn" onClick={() => setFlipManual((f) => !f)} aria-pressed={flipManual}>
              {t('翻转', 'Flip')}
            </button>
            <button type="button" class="btn" onClick={() => (fresh ? startNew() : setSheet(true))}>
              {t('新局', 'New game')}
            </button>
          </div>

          {fresh && !over ? (
            <Setup t={t} mode={mode} level={level} human={human} onChange={(p) => startNew(p, true)} record={recordLine} />
          ) : (
            <p class="xq-note muted">
              {vsAi && (recordLine ?? matchLine)}
              <button type="button" class="xq-link" onClick={() => setSheet(true)}>{t('换个棋局', 'Change')}</button>
            </p>
          )}

          {game.notes.length > 0 && <MoveList notes={game.notes} t={t} />}
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
    <svg class="xq-incense" viewBox="0 0 16 40" aria-hidden="true">
      <path class="smoke" d="M8 24 C 4 19, 12 15, 7 10 S 10 3, 8 0" />
      <line class="stick" x1="8" y1="25" x2="8" y2="40" />
      <circle class="ember" cx="8" cy="25" r="1.6" />
    </svg>
  );
}

/** The 将 seal beside "将军！". */
function CheckSeal() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    sealReady('将').then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal('将', { size: 28, dpr, style: 'bai', seed: 5, wear: 0.4 });
      c.width = s.width;
      c.height = s.height;
      c.getContext('2d')!.drawImage(s, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, []);
  return <canvas ref={ref} class="xq-check-seal" aria-hidden="true" />;
}

function Tray(props: { t: T; lostRed: number[]; lostBlack: number[] }) {
  const { t } = props;
  if (!props.lostRed.length && !props.lostBlack.length) return null;
  const row = (label: string, list: number[], side: Side) => (
    <div class="xq-tray-row">
      <span class="xq-tray-label">{label}</span>
      <span class="xq-tray-pieces" aria-label={`${label} ${list.map(pieceChar).join('')}`}>
        {list.length ? list.map((p) => <span class={'xq-mini ' + (side === RED ? 'is-red' : 'is-black')} aria-hidden="true">{pieceChar(p)}</span>) : <span class="xq-tray-none muted">—</span>}
      </span>
    </div>
  );
  return (
    <div class="xq-tray">
      {row(t('红方吃子', 'Red took'), props.lostBlack, BLACK)}
      {row(t('黑方吃子', 'Black took'), props.lostRed, RED)}
    </div>
  );
}

function MoveList(props: { notes: [string, string][]; t: T }) {
  const zh = lang.value === 'zh';
  const pairs: [string, string | null][] = [];
  for (let i = 0; i < props.notes.length; i += 2) {
    const a = props.notes[i], b = props.notes[i + 1];
    pairs.push([zh ? a[0] : a[1], b ? (zh ? b[0] : b[1]) : null]);
  }
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [props.notes.length]);
  return (
    <details class="xq-record">
      <summary>{props.t(`棋谱 · ${props.notes.length} 着`, `Record · ${props.notes.length} ${props.notes.length === 1 ? 'move' : 'moves'}`)}</summary>
      <ol ref={listRef}>
        {pairs.map(([a, b]) => (
          <li>
            <span>{a}</span>
            {b && <span>{b}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

function Setup(props: { t: T; mode: Mode; level: Level; human: Side; record: string | null; onChange: (p: { mode?: Mode; level?: Level; human?: Side }) => void }) {
  const { t } = props;
  return (
    <div class="xq-setup">
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
            options={LEVEL_IDS.map((l) => ({ value: l, label: t(...LEVEL_NAMES[l]) }))}
          />
          <Segmented<Side>
            label={t('执子', 'Your side')}
            value={props.human}
            onChange={(human) => props.onChange({ human })}
            options={[
              { value: RED, label: t('执红先行', 'Red, first') },
              { value: BLACK, label: t('执黑', 'Black') },
            ]}
          />
        </>
      )}
      <p class="xq-note muted">
        {props.mode === 'ai'
          ? props.record ?? t('将死或困毙对方即胜；长将判负。', 'Checkmate or stalemate wins; perpetual check loses.')
          : t('二人同坐一案，红先黑后。', 'Two people, one board — red moves first.')}
      </p>
    </div>
  );
}

function NewGameSheet(props: { open: boolean; t: T; mode: Mode; level: Level; human: Side; onClose: () => void; onStart: (p: { mode: Mode; level: Level; human: Side }) => void }) {
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
      <div class="xq-sheet">
        <div class="xq-field">
          <span>{t('对手', 'Opponent')}</span>
          <Segmented<Mode> value={mode} onChange={setMode} label={t('对手', 'Opponent')} options={[{ value: 'ai', label: t('人机', 'vs AI') }, { value: 'duo', label: t('同桌', 'Two players') }]} />
        </div>
        {mode === 'ai' && (
          <>
            <div class="xq-field">
              <span>{t('棋力', 'Strength')}</span>
              <Segmented<Level> value={level} onChange={setLevel} label={t('棋力', 'Strength')} options={LEVEL_IDS.map((l) => ({ value: l, label: t(...LEVEL_NAMES[l]) }))} />
            </div>
            <div class="xq-field">
              <span>{t('执子', 'Your side')}</span>
              <Segmented<Side> value={human} onChange={setHuman} label={t('执子', 'Your side')} options={[{ value: RED, label: t('执红先行', 'Red, first') }, { value: BLACK, label: t('执黑', 'Black') }]} />
            </div>
          </>
        )}
        <button type="button" class="btn btn-primary xq-start" onClick={() => props.onStart({ mode, level, human })}>
          {t('开新局', 'Start')}
        </button>
      </div>
    </Sheet>
  );
}

function Result(props: { t: T; res: Outcome; vsAi: boolean; human: Side; plies: number; record: string | null; onAgain: () => void }) {
  const { t, res, vsAi, human } = props;
  const sealRef = useRef<HTMLCanvasElement>(null);
  const won = vsAi && res.winner === human;
  const kind: keyof typeof POEMS = res.winner === null ? 'draw' : !vsAi ? 'duo' : won ? 'win' : 'loss';
  const poem = POEMS[kind][props.plies % POEMS[kind].length];
  const sealText = res.winner === null ? '和' : !vsAi ? (res.winner === RED ? '红胜' : '黑胜') : won ? '胜' : '负';
  const verdict = res.winner === null ? t('和棋', 'A draw') : !vsAi ? (res.winner === RED ? t('红方胜', 'Red wins') : t('黑方胜', 'Black wins')) : won ? t('你赢了', 'You win') : t('棋差一着', 'One move short');
  useEffect(() => {
    let alive = true;
    const c = sealRef.current;
    if (!c) return;
    sealReady(sealText).then(() => {
      if (!alive) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal(sealText, { size: 60, dpr, style: won || !vsAi ? 'bai' : 'zhu', seed: props.plies });
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
    <div class="xq-result" role="status">
      <canvas ref={sealRef} class="xq-seal" aria-hidden="true" />
      <div class="xq-result-text">
        <p class="xq-verdict">{verdict}</p>
        <p class="xq-reason">{t(...REASONS[res.reason])}</p>
        <p class="xq-poem">
          {zh ? poem[0] : poem[1]}
          <span class="xq-poet">— {zh ? poem[2] : poem[3]}</span>
        </p>
        {props.record && <p class="xq-rec muted">{props.record}</p>}
      </div>
      <button type="button" class="btn btn-seal xq-again" onClick={props.onAgain}>
        {t('再来一局', 'Play again')}
      </button>
    </div>
  );
}

// ─── the board canvas ──────────────────────────────────────────────────────────────────────────

/** Movement (css px) still counted as a tap / click. */
const TAP_SLOP = 10;
interface Gesture { id: number; x0: number; y0: number; from: number; mouse: boolean; drag: boolean; dead: boolean }

function Board(props: {
  board: Uint8Array;
  slide: Slide | null;
  lastMove: number;
  selected: number;
  targets: number[];
  check: number;
  checkAt: { current: number };
  over: boolean;
  hint: number;
  flip: boolean;
  lang: LabelLang;
  pickable: (s: number) => boolean;
  onTap: (s: number) => void;
  onPick: (s: number) => void;
  onDrop: (from: number, to: number) => void;
  label: string;
  t: T;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const painter = useRef<BoardPainter | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const drag = useRef<{ from: number; x: number; y: number } | null>(null);
  const hover = useRef(-1);
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
    const more = pt.draw(
      {
        board: P.board,
        slide: P.slide,
        lastMove: P.lastMove,
        selected: P.selected,
        targets: P.targets,
        check: P.check,
        checkAt: P.checkAt.current,
        final: P.over,
        hint: P.hint,
        cursor: cursor.current,
        showCursor: kbd.current && focused.current,
        drag: drag.current,
        hover: hover.current,
        reduced,
      },
      performance.now(),
    );
    if (more) raf.current = requestAnimationFrame(frame);
  };
  const redraw = () => {
    if (!raf.current) raf.current = requestAnimationFrame(frame);
  };

  const fit = () => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w || !painter.current) return;
    const width = w.clientWidth;
    if (!width) return;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    painter.current.resize(width, dpr, p.current.flip, p.current.lang);
    c.style.width = `${Math.floor(width)}px`;
    c.style.height = `${Math.floor(painter.current.g.h)}px`;
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    frame();
  };

  useEffect(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    painter.current = new BoardPainter(c);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(w);
    // the carved characters and the river are painted with web fonts: repaint once they arrive
    let alive = true;
    boardFontsReady().then(() => {
      if (!alive) return;
      painter.current?.invalidate();
      fit();
    });
    return () => {
      alive = false;
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, []);

  useEffect(fit, [props.flip, props.lang]);
  useEffect(redraw, [props.board, props.slide, props.lastMove, props.selected, props.targets, props.check, props.over, props.hint]);

  const squareAt = (e: PointerEvent) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return hitTest(painter.current!.g, e.clientX - r.left, e.clientY - r.top);
  };
  const local = (e: PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Touch: a tap picks a piece or moves it; anything that travels is a scroll or a stray swipe and
  // is dropped. Mouse: click-click as with touch, or press a piece and drag it to its square.
  const onDown = (e: PointerEvent) => {
    kbd.current = false;
    void audio.unlock();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (gesture.current && !gesture.current.mouse) {
      // a second finger: a pinch, not a move
      gesture.current.dead = true;
      return;
    }
    const s = squareAt(e);
    gesture.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: s, mouse: e.pointerType === 'mouse', drag: false, dead: false };
    if (e.pointerType === 'mouse') {
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  };
  const onMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (e.pointerType === 'mouse') {
      const s = squareAt(e);
      if (s !== hover.current) {
        hover.current = s;
        const c = canvas.current!;
        c.style.cursor = s >= 0 && (p.current.pickable(s) || p.current.targets.includes(s)) ? 'pointer' : 'default';
        redraw();
      }
      if (g && g.id === e.pointerId && !g.dead) {
        const far = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TAP_SLOP;
        if (!g.drag && far && p.current.pickable(g.from)) {
          g.drag = true;
          p.current.onPick(g.from);
        }
        if (g.drag) {
          drag.current = { from: g.from, ...local(e) };
          redraw();
        }
      }
      return;
    }
    if (!g || g.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TAP_SLOP) g.dead = true;
  };
  const onUp = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (g.dead) return;
    const s = squareAt(e);
    if (g.drag) {
      drag.current = null;
      if (s >= 0 && s !== g.from && p.current.targets.includes(s)) p.current.onDrop(g.from, s);
      redraw();
      return;
    }
    if (s >= 0) cursor.current = s;
    p.current.onTap(s);
    redraw();
  };
  const onCancel = (e?: PointerEvent) => {
    if (e && gesture.current && gesture.current.id !== e.pointerId) return;
    gesture.current = null;
    drag.current = null;
    redraw();
  };
  const onKey = (e: KeyboardEvent) => {
    const g = painter.current?.g;
    if (!g) return;
    let c = cursor.current;
    if (c < 0) c = p.current.selected >= 0 ? p.current.selected : sq(4, g.flip ? 2 : 7);
    switch (e.key) {
      case 'ArrowLeft': c = stepOnScreen(g, c, -1, 0); break;
      case 'ArrowRight': c = stepOnScreen(g, c, 1, 0); break;
      case 'ArrowUp': c = stepOnScreen(g, c, 0, -1); break;
      case 'ArrowDown': c = stepOnScreen(g, c, 0, 1); break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        void audio.unlock();
        if (cursor.current < 0) { cursor.current = c; kbd.current = true; redraw(); return; }
        kbd.current = true;
        p.current.onTap(cursor.current);
        redraw();
        return;
      case 'Escape':
        if (p.current.selected >= 0) {
          e.preventDefault();
          e.stopPropagation();
          p.current.onTap(-1);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    kbd.current = true;
    cursor.current = c;
    redraw();
  };

  const aspect = `${1} / ${ASPECT}`;
  return (
    <div class="xq-board" ref={wrap} style={{ aspectRatio: aspect }}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="application"
        aria-label={props.label}
        aria-roledescription={props.t('象棋棋盘', 'xiangqi board')}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onCancel}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          if (hover.current !== -1) { hover.current = -1; redraw(); }
        }}
        onKeyDown={onKey}
        onFocus={() => { focused.current = true; redraw(); }}
        onBlur={() => { focused.current = false; redraw(); }}
      />
    </div>
  );
}
export default XiangqiView;
