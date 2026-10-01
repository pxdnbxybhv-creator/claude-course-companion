// 水月幻镜 · the 镜 tab (API.md §4): lobby ↔ run ↔ results, plus the lobby's pages (镜鉴, 镜碑, 心镜,
// 心得, 设置) and the tutorial 「初入镜中」 (a practice run in memory: no fee, no records). On mount a
// stale or unreadable run is settled (resumeCheck) and the lobby's day is rolled; a newcomer is offered
// the tutorial once (tutor/offer.ts). While a run shows, `.mirror-live` hides the tab bar. The view owns
// the mirror's audio for its lifetime; `key={r}` in App remounts it on navigation, and the cleanup here
// disposes and saves.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useT } from '../../app/i18n';
import { mirror, saveMetaNow } from '../../app/mirror';
import { toast } from '../../ui/kit';
import { abandon, codeOn, enter, lobbyVisit, resumeCheck, setTutor } from './logic/session';
import { endTuning, tuningActive } from './logic/tuning';
import type { SandSession } from './ui/sand/session';
import { todayKey } from '../../core/date';
import { createTutorSession, type TutorSession } from './tutor/session';
import { tutorRun } from './tutor/run';
import { decideTutorOffer } from './tutor/offer';
import { TutorOffer } from './ui/Tutorial';
import { createMirrorAudio } from './audio/sfx';
import type { MirrorAudio, RunReport, RunSave } from './types';
import type { CharacterId } from './types';
import { Lobby, type LobbyPage } from './ui/Lobby';
import { RunView } from './ui/Run';
import { Results } from './ui/Results';
import { Codex } from './ui/Codex';
import { HeartMirror, MasteryPage, RecordsPage, SettingsPage } from './ui/Meta';
import { WENKAI_MIRROR_SAMPLE } from './ui/font-sample';
import { calmPref } from './ui/prefs';
import './ui/mirror.css';

type Scene =
  | { kind: 'lobby' }
  | { kind: 'page'; page: LobbyPage }
  | { kind: 'run'; run: RunSave; ritual: 'paid' | 'free' | null; key: number }
  | { kind: 'tutor'; sess: TutorSession; key: number }
  | { kind: 'results'; report: RunReport; snap: HTMLCanvasElement | null }
  // m8 模拟场 (sandbox.md §2): the setup page (sess null), then a run in memory; only while the code is on
  | { kind: 'sand'; key: number; sess: SandSession | null };

/** The 模拟场's chunk (its screens and session), loaded the first time it opens. */
type SandMod = typeof import('./ui/sand/Sand') & typeof import('./ui/sand/session');
let sandChunk: Promise<SandMod> | null = null;
const loadSand = () => (sandChunk ??= Promise.all([import('./ui/sand/Sand'), import('./ui/sand/session')]).then(([a, b]) => ({ ...a, ...b })));

/** `?tutor=0|1` (read once on the 镜 route, then taken out of the address). */
function tutorParam(): string | null {
  try {
    const q = new URLSearchParams(location.search);
    const v = q.get('tutor');
    if (v === null) return null;
    q.delete('tutor');
    const rest = q.toString();
    try { history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch { /* sandboxed */ }
    return v;
  } catch { return null; }
}

export default function MirrorView() {
  const t = useT();
  const audio = useRef<MirrorAudio | null>(null);
  const aud = () => (audio.current ??= createMirrorAudio());
  const [scene, setScene] = useState<Scene>(() => {
    const report = resumeCheck();
    lobbyVisit();
    return report ? { kind: 'results', report, snap: null } : { kind: 'lobby' };
  });
  // the tutorial's offer: a newcomer's sheet or a veteran's ribbon, decided once as the lobby opens
  const [offer, setOffer] = useState<'sheet' | 'ribbon' | null>(() => {
    const param = tutorParam();
    if (scene.kind !== 'lobby') return null;
    return decideTutorOffer({ meta: mirror.value, webdriver: !!(typeof navigator !== 'undefined' && navigator.webdriver), param });
  });
  /** After the tutorial's 「去入镜」: the lobby's entry button rings once. */
  const [ring, setRing] = useState(false);

  useEffect(() => {
    // the mirror's own WenKai file (item and monster names), fetched as the tab opens
    try { if (WENKAI_MIRROR_SAMPLE) void document.fonts?.load(`16px 'LXGW WenKai'`, WENKAI_MIRROR_SAMPLE).catch(() => {}); } catch { /* no font loading API */ }
    if (scene.kind === 'results' && scene.report.cause === 'migrate') toast(t('此局存档已旧，按镜碎结算。', 'That run was saved by an older version and has been settled.'), 4000);
    if (scene.kind === 'results' && scene.report.cause === 'interrupt') toast(t('第三次中断，本照以镜碎结算。', 'A third interruption: the run has been settled.'), 4000);
    // only resumeCheck's 「left while down」 path opens the view on a death's results
    if (scene.kind === 'results' && scene.report.cause === 'death') toast(t('上次倒下后没有复活就离开了，这一局按镜碎结算。', 'You left while down last time, so the run has ended.'), 4000);
    return () => {
      audio.current?.dispose();
      audio.current = null;
      // m8: leaving the 镜 tab from the 模拟场 keeps the edits as this device's draft, then puts every table back
      if (tuningActive()) { try { sandRef.current?.keepDraft(); } catch { /* no storage */ } endTuning(); }
      saveMetaNow();
    };
  }, []);

  // music by scene (the run drives its own phases); each scene starts at the top of the page
  useEffect(() => {
    try { window.scrollTo(0, 0); } catch { /* old browsers */ }
    const map = mirror.value.active?.map ?? mirror.value.lobby.map;
    if (scene.kind === 'lobby' || scene.kind === 'page') aud().music('lobby', map);
    else if (scene.kind === 'results') aud().music('results', scene.report.run.map);
  }, [scene.kind]);

  const startRun = (o: { daily: boolean; char?: CharacterId }) => {
    const lb = mirror.value.lobby;
    const res = enter({ char: o.char ?? lb.char, map: lb.map, diff: lb.diff, vows: lb.vows, daily: o.daily, plain: mirror.value.heart.plain });
    if (!res.ok) {
      toast(res.reason === 'short' ? t('囊中铜钱不够。', 'Not enough coins in your purse.') : t('镜中尚有一照未了：先续镜或弃镜。', 'A run is still waiting: return to it or give it up first.'));
      return;
    }
    // the tap unlocks the context and starts rendering the voices (研墨 waits for the rest); the
    // ritual's sound plays once its voice exists, and not at all if that takes longer than the ritual
    const a = aud();
    const t0 = performance.now();
    void a.prime().then(() => { if (performance.now() - t0 < 650) a.sfx(res.run.free ? 'ritualGlint' : 'ritualCoins'); });
    setScene({ kind: 'run', run: res.run, ritual: res.run.free ? 'free' : 'paid', key: Date.now() });
  };
  const resume = () => {
    const report = resumeCheck();
    if (report) { setScene({ kind: 'results', report, snap: null }); return; }
    const run = mirror.value.active;
    if (run) setScene({ kind: 'run', run, ritual: null, key: Date.now() });
  };
  const giveUp = () => {
    if (!mirror.value.active) return;
    setScene({ kind: 'results', report: abandon(), snap: null });
  };
  /** 「初入镜中」: free, nothing recorded; a paused real run is left exactly as it is. */
  const startTutor = () => {
    setOffer(null);
    setTutor({ offered: true });
    const a = aud();
    const t0 = performance.now();
    void a.prime().then(() => { if (performance.now() - t0 < 650) a.sfx('ritualGlint'); });
    setScene({ kind: 'tutor', sess: createTutorSession(tutorRun(todayKey())), key: Date.now() });
  };
  const toLobby = () => { lobbyVisit(); setScene({ kind: 'lobby' }); };
  // ── m8 模拟场: in through the lobby while the code is on; out through one path that restores the tables
  const [sandMod, setSandMod] = useState<SandMod | null>(null);
  /** The loaded sandbox module for the unmount cleanup (which sees only the first render's state). */
  const sandRef = useRef<SandMod | null>(null);
  sandRef.current = sandMod;
  // while the tables are tuned: a hidden page or a closing tab keeps the draft (a reload offers it back, never applies it)
  useEffect(() => {
    if (scene.kind !== 'sand' || !sandMod) return;
    const keep = () => { if (tuningActive()) { try { sandMod.keepDraft(); } catch { /* no storage */ } } };
    const vis = () => { if (document.visibilityState === 'hidden') keep(); };
    window.addEventListener('pagehide', keep);
    document.addEventListener('visibilitychange', vis);
    return () => { window.removeEventListener('pagehide', keep); document.removeEventListener('visibilitychange', vis); };
  }, [scene.kind, sandMod]);
  const openSandbox = () => {
    if (!codeOn()) return;
    void loadSand().then((mod) => {
      if (!codeOn()) return;
      mod.openSand();
      setSandMod(mod);
      setScene({ kind: 'sand', key: Date.now(), sess: null });
    }).catch((e) => { console.warn('[mirror] sandbox', e); toast(t('模拟场没能打开。', 'The sandbox could not open.'), 3200); });
  };
  const leaveSandbox = (note?: string) => {
    if (sandMod) { sandMod.keepDraft(); sandMod.leaveSand(); } else if (tuningActive()) endTuning();
    if (note) toast(note, 3600);
    toLobby();
  };
  const sandSetup = () => {
    if (scene.kind === 'sand' && scene.sess) sandMod?.rememberBuild(scene.sess.run());
    setScene({ kind: 'sand', key: Date.now(), sess: null });
  };
  // revoking the code closes the sandbox: tables restored, back to the lobby
  const coded = codeOn();
  useEffect(() => {
    if (scene.kind === 'sand' && !coded) leaveSandbox(t('测试码已取消，模拟场已关闭。', 'The test code was removed; the sandbox has closed.'));
  }, [coded, scene.kind]);

  const live = scene.kind === 'run' || scene.kind === 'tutor' || (scene.kind === 'sand' && !!scene.sess);
  return (
    <div class={'mirror' + (live ? ' mirror-live' : '') + (calmPref.value ? ' mj-calm' : '') + (scene.kind === 'sand' ? ' mj-sand-on' : '')}>
      {scene.kind === 'lobby' && (
        <Lobby
          onEnter={startRun}
          onResume={resume}
          onAbandon={giveUp}
          onPage={(page) => setScene({ kind: 'page', page })}
          onTutorial={startTutor}
          ribbon={offer === 'ribbon'}
          onRibbonClose={() => setOffer(null)}
          ring={ring}
          onRung={() => setRing(false)}
          onSand={openSandbox}
        />
      )}
      {scene.kind === 'lobby' && <TutorOffer open={offer === 'sheet'} onYes={startTutor} onNo={() => setOffer(null)} />}
      {scene.kind === 'page' && (
        <div class="mj-pagewrap page">
          <header class="topbar">
            <button type="button" class="btn btn-ghost btn-small" onClick={() => setScene({ kind: 'lobby' })}>← {t('镜前', 'Mirror')}</button>
          </header>
          {scene.page === 'codex' && <Codex />}
          {scene.page === 'records' && <RecordsPage />}
          {scene.page === 'heart' && <HeartMirror />}
          {scene.page === 'mastery' && <MasteryPage />}
          {scene.page === 'settings' && <SettingsPage onTutorial={startTutor} />}
        </div>
      )}
      {scene.kind === 'run' && (
        <RunView
          key={scene.key}
          initial={scene.run}
          ritual={scene.ritual}
          audio={aud()}
          onEnd={(e) => setScene({ kind: 'results', report: e.report, snap: e.snap })}
          onLeave={(note) => { if (note) toast(note, 3200); lobbyVisit(); setScene({ kind: 'lobby' }); }}
        />
      )}
      {scene.kind === 'tutor' && (
        <RunView
          key={scene.key}
          initial={scene.sess.run()}
          ritual="tutor"
          audio={aud()}
          sess={scene.sess}
          practice
          onEnd={() => toLobby()}
          onLeave={(note) => { if (note) toast(note, 3200); toLobby(); }}
          onTutorEnd={(go) => { toLobby(); if (go) setRing(true); }}
        />
      )}
      {scene.kind === 'sand' && sandMod && !scene.sess && (
        <sandMod.Setup key={scene.key} onBack={() => leaveSandbox()} onStart={(st) => setScene({ kind: 'sand', key: Date.now(), sess: sandMod.createSandSession(st) })} />
      )}
      {scene.kind === 'sand' && sandMod && scene.sess && (
        <RunView
          key={scene.key}
          initial={scene.sess.run()}
          ritual={null}
          audio={aud()}
          sess={scene.sess}
          sand={sandMod.SAND_UI}
          onEnd={() => sandSetup()}
          onLeave={(note) => { if (note) toast(note, 3200); sandSetup(); }}
        />
      )}
      {scene.kind === 'results' && (
        <Results
          report={scene.report}
          snap={scene.snap}
          onAgain={() => { lobbyVisit(); startRun({ daily: false }); }}
          onLobby={() => { lobbyVisit(); setScene({ kind: 'lobby' }); }}
        />
      )}
    </div>
  );
}
