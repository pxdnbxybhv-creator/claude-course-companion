// 水月幻镜 · the meta store (src/app/mirror.ts) at the edges: a sandboxed iframe where even reading
// `localStorage` throws must still boot (in memory, with the lobby's warning), and a money move writes
// the purse before meta (a hard kill between the two must never leave a paid run unpaid).
import { afterEach, describe, expect, it, vi } from 'vitest';

const g = globalThis as { localStorage?: unknown };
afterEach(() => {
  delete g.localStorage;
  vi.resetModules();
});

describe('the mirror store without storage', () => {
  it('boots in memory when reading localStorage throws (sandboxed iframe)', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error("SecurityError: Failed to read the 'localStorage' property from 'Window'"); },
    });
    vi.resetModules();
    const M = await import('../src/app/mirror');
    expect(M.storageOk.value).toBe(false);
    expect(M.mirror.value.active).toBeNull();
    expect(M.mirror.value.v).toBe(1);
    expect(() => M.saveMetaNow()).not.toThrow();
    expect(() => M.updateMeta((m) => ({ ...m, dust: 5 }))).not.toThrow();
    expect(M.mirror.value.dust).toBe(5);
    expect(() => M.flushPlay()).not.toThrow();
  });
});

describe('write order', () => {
  it('入镜 and 镜碎 write the purse before meta', async () => {
    const data = new Map<string, string>();
    const order: { key: string; purse: { coins: number; counters: Record<string, number> } | null }[] = [];
    const fake = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
        const p = data.get('banmu.play.v1');
        order.push({ key: k, purse: p ? JSON.parse(p) : null });
      },
      removeItem: (k: string) => void data.delete(k),
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fake });
    vi.resetModules();
    const M = await import('../src/app/mirror');
    const P = await import('../src/app/play');
    const S = await import('../src/views/mirror/logic/session');
    expect(M.storageOk.value).toBe(true);
    const today = M.mirror.value.payDay.day;
    P.play.value = { ...P.emptyPlay(), coins: 100 };
    M.mirror.value = { ...M.defaultMeta(today), payDay: { day: today, runs: 1, free: true, paid: 0, drops: 0, refunded: false } };
    order.length = 0;
    const e = S.enter({ char: 'scholar', map: 'lake', diff: 1, vows: {}, daily: false, plain: false });
    expect(e.ok && e.run.free).toBe(false);
    // the first meta write that holds the run already sees the paid purse on disk (no 120 ms gap)
    const metaAt = order.find((o) => o.key === M.MIRROR_KEY && JSON.parse(data.get(M.MIRROR_KEY)!).active);
    expect(metaAt?.purse?.coins).toBe(80);
    expect(metaAt?.purse?.counters['mirror:paid']).toBe(1);
    // 镜碎: the counters are on disk before meta drops the run
    order.length = 0;
    S.abandon();
    const settled = order.find((o) => o.key === M.MIRROR_KEY);
    expect(settled?.purse?.counters['mirror:runs']).toBe(1);
    expect(JSON.parse(data.get(M.MIRROR_KEY)!).active).toBeNull();
  });
});
