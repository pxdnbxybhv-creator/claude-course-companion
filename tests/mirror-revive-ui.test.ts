// 水月幻镜 · the UI half of 破镜重圆 and 视野 (API.md §3, §2.6): the session charges 50 文 through the
// purse (spend → record → the purse written → the run saved), refuses twice and in the tutorial, never
// lets a reload or 暂离 while down dodge a death; the owner's code never makes it free; the dialog's
// words and states; 视野 is sanitised, shown with 中 by default, and the old 震屏 row is gone; the HUD's
// rectangles reach the engine in canvas css px.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VNode } from 'preact';

type Store = { data: Map<string, string>; order: { key: string; coins: number | null }[] };
function fakeStorage(): Store {
  const data = new Map<string, string>();
  const order: Store['order'] = [];
  const fake = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
      const p = data.get('banmu.play.v1');
      order.push({ key: k, coins: p ? JSON.parse(p).coins : null });
    },
    removeItem: (k: string) => void data.delete(k),
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fake });
  return { data, order };
}
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
  vi.resetModules();
});

/** A paid run in its first wave, the purse at `purse` after the 20 文 fee. */
async function inWave(purse: number) {
  const st = fakeStorage();
  vi.resetModules();
  const M = await import('../src/app/mirror');
  const P = await import('../src/app/play');
  const S = await import('../src/views/mirror/logic/session');
  const today = M.mirror.value.payDay.day;
  P.play.value = { ...P.emptyPlay(), coins: purse + 20 };
  M.mirror.value = { ...M.defaultMeta(today), payDay: { day: today, runs: 1, free: true, paid: 0, drops: 0, refunded: false } };
  const e = S.enter({ char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false });
  if (!e.ok) throw new Error('enter failed');
  const { run } = S.startWave(e.run);
  expect(run.inWave).toBe(1);
  expect(P.play.value.coins).toBe(purse);
  return { M, P, S, st, run };
}

describe('破镜重圆 · the session', () => {
  it('payRevive charges exactly 50 文 with one mirror:revive, writes the purse before the run, saves revived and clears downAt', async () => {
    const { M, P, S, st } = await inWave(80);
    S.wentDown(1);
    expect(M.mirror.value.active?.downAt).toBe(1);
    st.order.length = 0;
    expect(S.payRevive()).toBe('ok');
    expect(P.play.value.coins).toBe(30);
    expect(P.play.value.counters['mirror:revive']).toBe(1);
    const a = M.mirror.value.active!;
    expect(a.revived).toBe(true);
    expect('downAt' in a).toBe(false);
    // on disk: the purse at 30 before the first meta write that says "revived"
    const metaAt = st.order.find((o) => o.key === M.MIRROR_KEY && JSON.parse(st.data.get(M.MIRROR_KEY)!).active?.revived === true);
    expect(metaAt?.coins).toBe(30);
    const saved = JSON.parse(st.data.get(M.MIRROR_KEY)!).active;
    expect(saved.revived).toBe(true);
    expect(saved.downAt).toBeUndefined();
    // once a run: a second ask is refused and charges nothing
    expect(S.payRevive()).toBe('used');
    expect(P.play.value.coins).toBe(30);
    expect(P.play.value.counters['mirror:revive']).toBe(1);
  });

  it("a short purse changes nothing ('short')", async () => {
    const { M, P, S } = await inWave(30);
    S.wentDown(1);
    const before = M.mirror.value.active;
    expect(S.payRevive()).toBe('short');
    expect(P.play.value.coins).toBe(30);
    expect(P.play.value.counters['mirror:revive'] ?? 0).toBe(0);
    expect(M.mirror.value.active).toBe(before);
    expect(M.mirror.value.active?.revived).toBeUndefined();
  });

  it("the tutorial's run is never charged ('used'), and no run or no wave is 'none'", async () => {
    const { M, P, S } = await inWave(80);
    S.commit({ ...M.mirror.value.active!, tutorial: true });
    expect(S.payRevive()).toBe('used');
    expect(P.play.value.coins).toBe(80);
    S.commit({ ...M.mirror.value.active!, tutorial: undefined, inWave: null });
    expect(S.payRevive()).toBe('none');
    M.mirror.value = { ...M.mirror.value, active: null };
    expect(S.payRevive()).toBe('none');
    expect(P.play.value.coins).toBe(80);
  });

  it("with the owner's code active the revive still costs exactly 50 文", async () => {
    const { P, S } = await inWave(80);
    P._acceptCodeForTests('TESTING');
    expect(P.redeemCode('TESTING')).toBe('ok');
    expect(P.codeActive.value).toBe(true);
    S.wentDown(1);
    const c0 = P.play.value.coins;
    expect(S.payRevive()).toBe('ok');
    expect(P.play.value.coins).toBe(c0 - 50);
    P.revokeCode();
  });

  it('a reload while down settles a death (镜碎), never an interruption', async () => {
    const { M, P, S } = await inWave(80);
    S.wentDown(1);
    const runs0 = P.play.value.counters['mirror:runs'] ?? 0;
    const rep = S.resumeCheck();
    expect(rep).not.toBeNull();
    expect(rep!.cause).toBe('death');
    expect(rep!.run.interruptions).toBe(0);
    expect(M.mirror.value.active).toBeNull();
    expect(P.play.value.counters['mirror:runs']).toBe(runs0 + 1);
  });

  it('a reload mid-wave without going down is still an interruption (and downAt from another wave does not count)', async () => {
    const { M, S } = await inWave(80);
    S.commit({ ...M.mirror.value.active!, downAt: 7 });
    expect(S.resumeCheck()).toBeNull();
    const a = M.mirror.value.active!;
    expect(a.inWave).toBeNull();
    expect(a.interruptions).toBe(1);
    expect('downAt' in a).toBe(false);
  });

  it('暂离 while down settles a death, not a replay', async () => {
    const { M, S } = await inWave(80);
    S.wentDown(1);
    const res = S.leaveMidWave();
    expect(res.report?.cause).toBe('death');
    expect(res.report?.run.interruptions).toBe(0);
    expect(M.mirror.value.active).toBeNull();
  });

  it('wentDown marks only the wave in play', async () => {
    const { M, S } = await inWave(80);
    S.wentDown(3);
    expect(M.mirror.value.active?.downAt).toBeUndefined();
    S.wentDown(1);
    expect(M.mirror.value.active?.downAt).toBe(1);
  });

  it('a revive the engine could not perform gives the 50 文 back and un-marks the run', async () => {
    const { M, P, S } = await inWave(80);
    S.wentDown(1);
    expect(S.payRevive()).toBe('ok');
    expect(P.play.value.coins).toBe(30);
    S.reviveFailed();
    expect(P.play.value.coins).toBe(80);
    expect(M.mirror.value.active?.revived).toBeUndefined();
    S.reviveFailed(); // twice: nothing more
    expect(P.play.value.coins).toBe(80);
  });

  it("the real session offers the revive and the tutorial's does not", async () => {
    vi.resetModules();
    const S = await import('../src/views/mirror/logic/session');
    const T = await import('../src/views/mirror/tutor/session');
    const R = await import('../src/views/mirror/tutor/run');
    expect(typeof S.realSession.payRevive).toBe('function');
    expect(typeof S.realSession.wentDown).toBe('function');
    const tut = T.createTutorSession(R.tutorRun('2026-09-28'));
    expect(tut.payRevive).toBeUndefined();
    expect(tut.wentDown).toBeUndefined();
  });
});

describe('视野 · the setting', () => {
  it('sanitizeMirror keeps near / mid / far and drops anything else (missing = 中)', async () => {
    vi.resetModules();
    const M = await import('../src/app/mirror');
    const { viewOf } = await import('../src/views/mirror/paint');
    for (const v of ['near', 'mid', 'far'] as const) expect(M.sanitizeMirror({ settings: { view: v } }).settings.view).toBe(v);
    for (const v of ['wide', 1, null, {}, 'NEAR']) {
      const s = M.sanitizeMirror({ settings: { view: v } }).settings;
      expect('view' in s).toBe(false);
      expect(viewOf(s.view)).toBe('mid');
    }
    expect('view' in M.defaultMeta().settings).toBe(false);
    expect(viewOf(M.sanitizeMirror({}).settings.view)).toBe('mid');
    // the other settings are untouched by it
    expect(M.sanitizeMirror({ settings: { view: 'far', aim: 'manual' } }).settings.aim).toBe('manual');
  });
});

// ───────────────────────────────────────────── the render tests (a vnode walk; no DOM)
interface Host { type: string; props: Record<string, unknown>; kids: Node[] }
type Node = Host | string;
function expand(v: unknown): Node[] {
  if (v == null || typeof v === 'boolean') return [];
  if (Array.isArray(v)) return v.flatMap(expand);
  if (typeof v === 'string' || typeof v === 'number') return [String(v)];
  const n = v as VNode<Record<string, unknown>>;
  if (typeof n.type === 'function') return expand((n.type as (p: unknown) => unknown)(n.props));
  return [{ type: String(n.type), props: n.props as Record<string, unknown>, kids: expand((n.props as { children?: unknown }).children) }];
}
const textOf = (n: Node | Node[]): string => (Array.isArray(n) ? n.map(textOf).join('') : typeof n === 'string' ? n : textOf(n.kids));
function all(n: Node | Node[], f: (h: Host) => boolean, out: Host[] = []): Host[] {
  if (Array.isArray(n)) { for (const k of n) all(k, f, out); return out; }
  if (typeof n === 'string') return out;
  if (f(n)) out.push(n);
  for (const k of n.kids) all(k, f, out);
  return out;
}
const zh = (z: string) => z;
const en = (_z: string, e: string) => e;

describe('the revive dialog', () => {
  it('with enough coins: the price, the purse, 「花 50 文复活」 live and 「不了，结束这一局」', async () => {
    const { ReviveBody, reviveView } = await import('../src/views/mirror/ui/Screens');
    const clicks: string[] = [];
    const tree = expand(ReviveBody({ price: 50, purse: 120, t: zh, armed: true, onRevive: () => clicks.push('revive'), onEnd: () => clicks.push('end') }));
    const text = textOf(tree);
    expect(text).toContain('镜碎了');
    expect(text).toContain('花 50 文，以一半气血原地站起');
    expect(text).toContain('你有 120 文');
    const btns = all(tree, (h) => h.type === 'button');
    expect(btns.map((b) => textOf(b))).toEqual(['花 50 文复活', '不了，结束这一局']);
    expect(btns[0].props.disabled).toBe(false);
    expect(all(tree, (h) => h.props['data-act'] === 'short')).toHaveLength(0);
    (btns[0].props.onClick as () => void)();
    (btns[1].props.onClick as () => void)();
    expect(clicks).toEqual(['revive', 'end']);
    expect(reviveView(50, 50, zh).can).toBe(true);
  });

  it('short: the revive disabled with the shortfall, 「结束这一局」 the only live button', async () => {
    const { ReviveBody } = await import('../src/views/mirror/ui/Screens');
    const tree = expand(ReviveBody({ price: 50, purse: 30, t: zh, armed: true, onRevive: () => {}, onEnd: () => {} }));
    const btns = all(tree, (h) => h.type === 'button');
    expect(btns[0].props.disabled).toBe(true);
    expect(textOf(all(tree, (h) => h.props['data-act'] === 'short'))).toBe('文不够（还差 20 文）。');
    expect(textOf(btns[1])).toBe('结束这一局');
    expect(btns[1].props.disabled).toBeFalsy();
  });

  it('English, and taps before the dialog is armed do nothing', async () => {
    const { ReviveBody } = await import('../src/views/mirror/ui/Screens');
    const clicks: string[] = [];
    const tree = expand(ReviveBody({ price: 50, purse: 7, t: en, armed: false, onRevive: () => clicks.push('r'), onEnd: () => clicks.push('e') }));
    const text = textOf(tree);
    expect(text).toContain('The mirror breaks');
    expect(text).toContain('You have 7 coins');
    expect(text).toContain('Not enough coins (43 short).');
    const btns = all(tree, (h) => h.type === 'button');
    expect(btns.map((b) => textOf(b))).toEqual(['Revive for 50 coins', 'End the run']);
    for (const b of btns) (b.props.onClick as () => void)();
    expect(clicks).toEqual([]);
  });
});

describe('the settings sheet', () => {
  it('shows 视野 with 中 pressed by default, the three plain lines, and no 震屏 row', async () => {
    vi.resetModules();
    const store = await import('../src/app/store');
    const setLang = (l: 'zh' | 'en') => { store.state.value = { ...store.state.value, settings: { ...store.state.value.settings, lang: l } }; };
    setLang('zh');
    const M = await import('../src/app/mirror');
    const { SettingsRows, VIEW_OPTS } = await import('../src/views/mirror/ui/Pause');
    M.mirror.value = M.defaultMeta('2026-09-28');
    let tree = expand(SettingsRows({}));
    const text = textOf(tree);
    expect(text).toContain('视野');
    expect(text).toContain('中：看得更远，远处的敌人也在画面里（推荐）');
    expect(text).toContain('看不到远处射来的攻击时，调到「中」或「远」。');
    expect(text).not.toContain('震屏');
    const views = all(tree, (h) => h.type === 'button' && typeof h.props['data-view'] === 'string');
    expect(views.map((b) => textOf(b))).toEqual(['近', '中', '远']);
    expect(views.map((b) => b.props['aria-pressed'])).toEqual([false, true, false]);
    expect(VIEW_OPTS.map((o) => o.lineZh)).toEqual(['人物大，看得近（旧视野）', '看得更远，远处的敌人也在画面里（推荐）', '看得最远，人物更小']);
    // a tap saves it and tells the run (live)
    const told: unknown[] = [];
    tree = expand(SettingsRows({ onChange: (p) => told.push(p) }));
    const far = all(tree, (h) => h.props['data-view'] === 'far')[0];
    (far.props.onClick as () => void)();
    expect(M.mirror.value.settings.view).toBe('far');
    expect(told).toEqual([{ view: 'far' }]);
    tree = expand(SettingsRows({}));
    expect(all(tree, (h) => typeof h.props['data-view'] === 'string').map((b) => b.props['aria-pressed'])).toEqual([false, false, true]);
    expect(textOf(tree)).toContain('远：看得最远，人物更小');
    setLang('en');
    expect(textOf(expand(SettingsRows({})))).toContain('Far: See the most; smaller figures');
    setLang('zh');
  });
});

describe('the HUD rectangles', () => {
  it('hudRectsOf: each laid-out HUD block in css px from the canvas, hidden ones left out', async () => {
    const { hudRectsOf } = await import('../src/views/mirror/ui/Run');
    const box = (left: number, top: number, width: number, height: number) => ({ getBoundingClientRect: () => ({ left, top, width, height }) });
    const els: Record<string, unknown> = {
      '.mj-hud-tl': box(10, 20, 150.4, 60),
      '.mj-hud-tc': box(160, 20, 70, 40),
      '.mj-hud-tr': box(300, 20, 0, 0), // not laid out
      '.mj-skill': box(300, 740, 72, 72),
    };
    const root = { querySelector: (s: string) => els[s] ?? null } as unknown as ParentNode;
    expect(hudRectsOf(root, { left: 10, top: 20 })).toEqual([
      { x: 0, y: 0, w: 150, h: 60 },
      { x: 150, y: 0, w: 70, h: 40 },
      { x: 290, y: 720, w: 72, h: 72 },
    ]);
  });
});
