// 飞花令 · Flying Flowers — one character is the order (令); you and a guest poet take turns
// answering with a line of classical verse that holds it, its place moving one character on each
// line (按位飞花, 1st → 7th and round again). Every line comes from the verified poems.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GameShell } from '../GameShell';
import { Segmented, toast } from '../../../ui/kit';
import { useT } from '../../../app/i18n';
import { lang } from '../../../app/store';
import { audio } from '../../../audio/engine';
import { makeSeal, sealReady } from '../../../ink/seal';
import { recordMax } from '../../../app/play';
import { LING, PLACES, cnNum, computerLine, drawLing, makeRound, markAt, nextPlace, verdict, type Clause, type Round, type Verdict } from './logic';
import { loadStats, saveStats, type FeihuaStats } from './store';
import './feihua.css';

type Phase = 'ready' | 'player' | 'machine' | 'over';
interface Said { c: Clause; who: 'me' | 'guest'; ling: string; pos: number }
interface Ending { why: Verdict | 'time' | 'spent'; picked?: Clause; right: Clause[]; pos: number; isRecord: boolean }

const TURN_MS = 30000;
const rng = () => Math.random();

function reducedMotion(): boolean {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function FeihuaView() {
  const t = useT();
  const zh = lang.value === 'zh';
  const [stats, setStats] = useState<FeihuaStats>(loadStats);
  const [phase, setPhase] = useState<Phase>('ready');
  const [ling, setLing] = useState(stats.lastLing);
  const [pos, setPos] = useState(1);
  const [chain, setChain] = useState<Said[]>([]);
  const [round, setRound] = useState<Round | null>(null);
  const [streak, setStreak] = useState(0);
  const [ending, setEnding] = useState<Ending | null>(null);
  const [deadline, setDeadline] = useState(0);
  const [now, setNow] = useState(0);
  const [live, setLive] = useState('');
  const used = useRef(new Set<string>());
  const played = useRef<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** How often each decoy line has been offered this game (so the same ones don't keep coming). */
  const shown = useRef(new Map<string, number>());
  const chainRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);
  const S = useRef({ phase, ling, pos, streak, round, stats });
  S.current = { phase, ling, pos, streak, round, stats };

  // leaving mid-game still counts the chain (quests read it) — but never mid-round, where a
  // celebration would cover the clock and the choices
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const s = S.current;
      if ((s.phase === 'player' || s.phase === 'machine') && s.streak > 0) recordMax('feihua', s.streak);
    },
    [],
  );

  const persist = (s: FeihuaStats) => {
    setStats(s);
    saveStats(s);
  };

  // keep the newest line in view (columns run right → left)
  useEffect(() => {
    const el = chainRef.current;
    if (!el) return;
    el.scrollTo({ left: -el.scrollWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [chain.length]);

  // the relaxed clock
  useEffect(() => {
    if (phase !== 'player' || !deadline) return;
    const id = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= deadline) {
        clearInterval(id);
        const r = S.current.round;
        end({ why: 'time', right: r?.options.filter((o) => r.correct.includes(o.text)) ?? [] });
      }
    }, 250);
    return () => clearInterval(id);
  }, [phase, deadline]);

  /** Offer the player four lines for the place `from` (or the next one that still has a line);
   *  switch the 令字 when it has run dry. */
  const playerTurn = (ch: string, from: number, announce = true) => {
    let c = ch;
    let p = nextPlace(c, from, used.current);
    if (p == null) {
      const prev = c;
      c = drawLing(played.current, used.current, rng);
      p = nextPlace(c, 1, used.current);
      if (p == null) {
        end({ why: 'spent', right: [] });
        return;
      }
      played.current.push(c);
      setLing(c);
      if (announce) toast(t(`「${prev}」字令已尽，换作「${c}」字令`, `“${prev}” is spent — the order is now “${c}”`), 3200);
    }
    const r = makeRound(c, p, used.current, rng, shown.current);
    setPos(p);
    setRound(r);
    setPhase('player');
    setDeadline(stats.timer ? Date.now() + TURN_MS : 0);
    setNow(Date.now());
  };

  const begin = (ch?: string) => {
    void audio.unlock();
    clearTimeout(timer.current);
    used.current = new Set();
    shown.current = new Map();
    const c = ch ?? drawLing([], used.current, rng);
    played.current = [c];
    setLing(c);
    setChain([]);
    setStreak(0);
    setEnding(null);
    persist({ ...stats, lastLing: c });
    audio.bell();
    playerTurn(c, 1, false);
    setLive(t(`行「${c}」字令，第一句「${c}」字居首。`, `The order is “${c}”. First line: “${c}” as its first character.`));
  };

  const end = (e: Omit<Ending, 'pos' | 'isRecord'>) => {
    clearTimeout(timer.current);
    const { streak: s, pos: at, stats: st } = S.current;
    S.current = { ...S.current, phase: 'over' };
    setPhase('over');
    setEnding({ ...e, pos: at, isRecord: s > st.best && st.games > 0 });
    setRound(null);
    persist({ ...st, games: st.games + 1, best: Math.max(st.best, s) });
    recordMax('feihua', s);
    audio.knock();
    setLive(t(`令断。连 ${s} 句。`, `The chain breaks at ${s}.`));
  };

  const pick = (c: Clause) => {
    const s = S.current;
    if (s.phase !== 'player' || !s.round) return;
    void audio.unlock();
    const v = verdict(s.ling, s.round.pos, c.text, used.current);
    if (v) {
      end({ why: v, picked: c, right: s.round.options.filter((o) => s.round!.correct.includes(o.text)) });
      return;
    }
    used.current.add(c.text);
    const n = s.streak + 1;
    const myPos = s.round.pos;
    S.current = { ...S.current, streak: n, phase: 'machine' };
    setStreak(n);
    setChain((ch) => [...ch, { c, who: 'me', ling: s.ling, pos: myPos }]);
    setRound(null);
    setPhase('machine');
    audio.pluck((n % 5) + 1, 0.65);
    if (n > 1 && n % 5 === 0) audio.chime(Math.min(5, n / 5));
    setLive(t(`你：${c.text}`, `You: ${c.text}`));
    const lingNow = s.ling;
    timer.current = setTimeout(() => {
      const gp = nextPlace(lingNow, (myPos % PLACES) + 1, used.current);
      const g = gp == null ? null : computerLine(lingNow, gp, used.current, rng);
      if (!g || gp == null) {
        const nl = drawLing(played.current, used.current, rng);
        if (nextPlace(nl, 1, used.current) == null) {
          end({ why: 'spent', right: [] });
          return;
        }
        played.current.push(nl);
        setLing(nl);
        toast(t(`客人词穷，改行「${nl}」字令`, `Your guest is stumped — the order is now “${nl}”`), 3200);
        playerTurn(nl, 1, false);
        return;
      }
      used.current.add(g.text);
      setChain((ch) => [...ch, { c: g, who: 'guest', ling: lingNow, pos: gp }]);
      audio.pluck(-1 - (n % 3), 0.45);
      setLive(t(`客：${g.text}（${g.poem.author}《${g.poem.title}》）`, `Guest: ${g.text} (${g.poem.authorEn}: ${g.poem.en})`));
      playerTurn(lingNow, (gp % PLACES) + 1);
    }, reducedMotion() ? 500 : 900 + Math.random() * 900);
  };

  // keys 1–4 pick; Enter starts / restarts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tg = e.target as HTMLElement | null;
      if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
      // a sheet or a dialog (a quest celebration, say) has the keys
      if (document.querySelector('.sheet-backdrop, [aria-modal="true"]')) return;
      const s = S.current;
      if (s.phase === 'player' && s.round && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const o = s.round.options[Number(e.key) - 1];
        if (o) pick(o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // bring the four choices into view each turn (small phones: below the chain)
  useEffect(() => {
    if (phase !== 'player') return;
    pickRef.current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, [phase, round]);

  const lingInfo = LING.find((l) => l.ch === ling);
  const left = deadline ? Math.max(0, deadline - now) : 0;
  const last = chain[chain.length - 1];

  return (
    <GameShell
      titleZh="飞花令"
      titleEn="Flying Flowers"
      class="feihua-page"
      subtitle={
        phase === 'ready' ? (
          stats.best ? t(`最长连 ${stats.best} 句`, `Best chain: ${stats.best}`) : t('一字为令，接一句诗', 'One character, one line of verse')
        ) : (
          <span>
            {t(`「${ling}」字令 · 连 `, `Order “${ling}” · chain `)}
            <span class="fh-n">{streak}</span>
            {t(' 句', '')}
          </span>
        )
      }
    >
      <div class="fh">
        {phase === 'ready' ? (
          <Ready
            stats={stats}
            ling={ling}
            onTimer={(on) => persist({ ...stats, timer: on })}
            onStart={begin}
          />
        ) : (
          <>
            <div class="fh-head">
              <LingSeal ch={ling} />
              <div class="fh-head-text">
                <p class="fh-order">
                  {t(`请接「${ling}」字居第${cnNum(pos)}字的诗句`, `“${ling}”${lingInfo ? ` (${lingInfo.en})` : ''} as character ${pos}`)}
                </p>
                <Places pos={pos} ch={ling} />
                <p class="fh-streak">
                  <span class="fh-n fh-big">{streak}</span>
                  <span class="muted">{t(' 句 · 最长 ', ' in a row · best ')}{Math.max(stats.best, streak)}</span>
                </p>
              </div>
            </div>

            <div class="fh-chain" ref={chainRef} aria-label={t('已对诗句', 'Lines so far')}>
              {chain.length === 0 && <p class="fh-empty">{t('君先请', 'You first')}</p>}
              {chain.map((s, i) => (
                <figure class={'fh-col ' + (s.who === 'me' ? 'is-me' : 'is-guest') + (i === chain.length - 1 ? ' is-new' : '')} key={i}>
                  <span class="fh-who" aria-label={s.who === 'me' ? t('你', 'You') : t('客', 'Guest')}>{s.who === 'me' ? '君' : '客'}</span>
                  <blockquote class="fh-line">
                    {markAt(s.c.text, s.pos).map((p) => (p.hit ? <em>{p.t}</em> : p.t))}
                  </blockquote>
                  <figcaption class="fh-src">
                    {s.c.poem.author}《{s.c.poem.title}》
                  </figcaption>
                </figure>
              ))}
              {phase === 'machine' && (
                <div class="fh-col is-guest is-thinking" aria-hidden="true">
                  <span class="fh-who">客</span>
                  <span class="fh-dots"><i /><i /><i /></span>
                </div>
              )}
            </div>
            {!zh && last && (
              <p class="fh-gloss">
                <span class="fh-gloss-src">{last.c.poem.authorEn}, “{last.c.poem.title}”:</span> {last.c.poem.en}
              </p>
            )}
            <p class="visually-hidden" aria-live="polite">{live}</p>

            {phase === 'player' && round && (
              <div class="fh-pick" ref={pickRef}>
                {deadline > 0 && (
                  <div class="fh-clock" role="timer" aria-label={t(`还剩 ${Math.ceil(left / 1000)} 秒`, `${Math.ceil(left / 1000)} seconds left`)}>
                    <span style={{ transform: `scaleX(${left / TURN_MS})` }} />
                  </div>
                )}
                <div class="fh-options" role="group" aria-label={t('四句择一', 'Choose one of four')}>
                  {round.options.map((o, i) => (
                    <button type="button" class="fh-opt" onClick={() => pick(o)} key={o.text}>
                      <span class="fh-key" aria-hidden="true">{i + 1}</span>
                      <span class="fh-opt-text">{o.text}</span>
                    </button>
                  ))}
                </div>
                <p class="fh-rule muted">
                  {t(`「${ling}」须是第${cnNum(pos)}字，且不可重复前句。`, `“${ling}” must be character ${pos}, and no line may be said twice.`)}
                  <span class="fh-kbd">{t(' 数字键 1–4 作答。', ' Keys 1–4 to answer.')}</span>
                </p>
              </div>
            )}
            {phase === 'machine' && <p class="fh-wait muted">{t('客人沉吟…', 'Your guest is thinking…')}</p>}

            {phase === 'over' && ending && (
              <Over
                ending={ending}
                ling={ling}
                streak={streak}
                onAgain={() => begin(ling)}
                onNew={() => begin()}
                zh={zh}
              />
            )}
          </>
        )}
      </div>
    </GameShell>
  );
}
export default FeihuaView;

/** Seven small squares, the 令字 in the one it must fill. */
function Places(props: { pos: number; ch: string }) {
  const t = useT();
  return (
    <p class="fh-places" role="img" aria-label={t(`第${cnNum(props.pos)}字`, `character ${props.pos}`)}>
      {Array.from({ length: PLACES }, (_, i) => (
        <span class={'fh-place' + (i + 1 === props.pos ? ' is-on' : '')} aria-hidden="true">{i + 1 === props.pos ? props.ch : ''}</span>
      ))}
    </p>
  );
}

function LingSeal(props: { ch: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const c = ref.current;
    if (!c) return;
    sealReady(props.ch).then(() => {
      if (!alive) return;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const s = makeSeal(props.ch, { size: 64, dpr, style: 'bai', seed: props.ch.charCodeAt(0) });
      c.width = s.width;
      c.height = s.height;
      c.getContext('2d')!.drawImage(s, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, [props.ch]);
  return <canvas ref={ref} class="fh-seal" role="img" aria-label={props.ch} />;
}

function Ready(props: { stats: FeihuaStats; ling: string; onTimer: (on: boolean) => void; onStart: (ch?: string) => void }) {
  const t = useT();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <div class="fh-ready">
      <p class="fh-intro">
        {t(
          '飞花令是古人酒席间的雅令：定一字为令，众人轮流吟一句含此字的诗，接不上、说错或重复者罚。此处按位飞花——第一句令字居首，第二句居第二字，依次后移，到第七字再从头。你与一位客人对吟，每轮从四句中择一。',
          'Flying Flowers is an old drinking-party game: one character is the order, and each guest in turn recites a line of verse that holds it. Miss, misquote or repeat, and you pay the forfeit. Here the character flies by place: first line, 1st character; next line, 2nd; and so on to the 7th and round again. You and a guest poet take turns; each turn you choose one of four lines.',
        )}
      </p>
      <div class="fh-lings" role="group" aria-label={t('选一个令字', 'Pick the character')}>
        {LING.map((l) => (
          <button type="button" class={'fh-ling brush' + (sel === l.ch ? ' is-on' : '')} aria-pressed={sel === l.ch} onClick={() => setSel(sel === l.ch ? null : l.ch)} title={l.en}>
            {l.ch}
          </button>
        ))}
      </div>
      <Segmented<'relaxed' | 'timed'>
        label={t('节奏', 'Pace')}
        value={props.stats.timer ? 'timed' : 'relaxed'}
        onChange={(v) => props.onTimer(v === 'timed')}
        options={[
          { value: 'relaxed', label: t('从容', 'Unhurried') },
          { value: 'timed', label: t('一炷香（30 秒）', 'Timed (30 s)') },
        ]}
      />
      <button type="button" class="btn btn-seal fh-go" onClick={() => props.onStart(sel ?? undefined)}>
        {sel ? t(`行「${sel}」字令`, `Begin with “${sel}”`) : t('抽一个令字', 'Draw a character')}
      </button>
      {props.stats.games > 0 && (
        <p class="fh-record muted">{t(`已行令 ${props.stats.games} 回 · 最长连 ${props.stats.best} 句`, `${props.stats.games} games · best chain ${props.stats.best}`)}</p>
      )}
    </div>
  );
}

function Over(props: { ending: Ending; ling: string; streak: number; onAgain: () => void; onNew: () => void; zh: boolean }) {
  const t = useT();
  const { ending: e, ling } = props;
  const q = e.picked?.text;
  const why =
    e.why === 'time' ? t('一炷香尽，未能接上。', 'The incense burned out.')
    : e.why === 'spent' ? t('满座诗句都已吟尽。', 'Every line in the book has been said.')
    : e.why === 'repeat' ? t(`「${q}」前面已经吟过了。`, `“${q}” was already said.`)
    : e.why === 'place' ? t(`「${q}」里的「${ling}」不在第${cnNum(e.pos)}字。`, `In “${q}”, “${ling}” isn’t character ${e.pos}.`)
    : t(`「${q}」里没有「${ling}」字。`, `“${q}” has no “${ling}” in it.`);
  const record = e.isRecord;
  return (
    <div class="fh-over" role="status">
      <p class="fh-verdict">{t('令断', 'The chain breaks')} · <span class="fh-n">{props.streak}</span> {t('句', props.streak === 1 ? 'line' : 'lines')}{record ? t(' · 新纪录', ' · a new best') : ''}</p>
      <p class="fh-why">{why}</p>
      {e.right.length > 0 && (
        <div class="fh-right">
          <span class="muted">{t('可接：', 'You could have said:')}</span>
          {e.right.map((c) => (
            <p class="fh-right-line" key={c.text}>
              {markAt(c.text, e.pos).map((p) => (p.hit ? <em>{p.t}</em> : p.t))}
              <span class="fh-src-inline">— {props.zh ? `${c.poem.author}《${c.poem.title}》` : `${c.poem.authorEn}, ${c.poem.title}`}</span>
              {!props.zh && <span class="fh-right-en">{c.poem.en}</span>}
            </p>
          ))}
        </div>
      )}
      <div class="fh-again">
        <button type="button" class="btn" onClick={props.onAgain}>{t(`再行「${ling}」令`, `Again with “${ling}”`)}</button>
        <button type="button" class="btn btn-seal" onClick={props.onNew}>{t('换一个令字', 'A new character')}</button>
      </div>
    </div>
  );
}
