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
import { abandon, enter, lobbyVisit, resumeCheck, setTutor } from './logic/session';
import { todayKey } from '../../core/date';
import { createTutorSession, type TutorSession } from './tutor/session';
import { tutorRun } from './tutor/run';
import { decideTutorOffer } from './tutor/offer';
import { TutorOffer } from './ui/Tutorial';
import { createMirrorAudio } from './audio/sfx';
import type { MirrorAudio, RunReport, RunSave } from './types';
import type { CharacterId } from '../../data/characters';
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
  | { kind: 'results'; report: RunReport; snap: HTMLCanvasElement | null };

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
    return () => {
      audio.current?.dispose();
      audio.current = null;
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

  const live = scene.kind === 'run' || scene.kind === 'tutor';
  return (
    <div class={'mirror' + (live ? ' mirror-live' : '') + (calmPref.value ? ' mj-calm' : '')}>
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
