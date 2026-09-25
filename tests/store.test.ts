import { describe, expect, it } from 'vitest';
import { sanitize, emptyState, exportJSON, importJSON, state, addHabit, toggleCheckin, today, deleteHabit } from '../src/app/store';
import { demoState } from '../src/app/demo';

describe('store', () => {
  it('sanitizes garbage into a valid empty state', () => {
    for (const junk of [null, 42, 'x', [], { habits: 'no' }, { settings: { volume: 'loud' } }]) {
      const s = sanitize(junk);
      expect(s.version).toBe(1);
      expect(Array.isArray(s.habits)).toBe(true);
      expect(s.settings.volume).toBeGreaterThanOrEqual(0);
    }
  });

  it('repairs individual records', () => {
    const s = sanitize({
      habits: [{ id: 'a', name: 'x'.repeat(100), plant: 'cactus' }, { name: 'no id' }],
      checkins: { a: ['2026-09-02', '2026-09-01', '2026-09-01', 'bad'] },
      notes: { '2026-09-01': 'hi', nope: 'x', '2026-09-02': '   ' },
      settings: { lang: 'fr', sealName: '一二三四五六', focusMinutes: 999, theme: 'neon' },
    });
    expect(s.habits).toHaveLength(1);
    expect(s.habits[0].name).toHaveLength(40);
    expect(s.habits[0].plant).toBe('bamboo');
    expect(s.checkins.a).toEqual(['2026-09-01', '2026-09-02']);
    expect(Object.keys(s.notes)).toEqual(['2026-09-01']);
    expect(s.settings.sealName).toBe('一二三四');
    expect(s.settings.focusMinutes).toBe(180);
    expect(s.settings.theme).toBe('auto');
  });

  it('round-trips export → import', () => {
    state.value = emptyState();
    const h = addHabit({ name: '读书', plant: 'orchid' });
    toggleCheckin(h.id);
    const json = exportJSON();
    state.value = emptyState();
    expect(importJSON(json)).toBe(true);
    expect(state.value.habits[0].name).toBe('读书');
    expect(state.value.checkins[h.id]).toEqual([today.value]);
    expect(importJSON('{"not":"a backup"}')).toBe(false);
    expect(importJSON('nonsense')).toBe(false);
    deleteHabit(h.id);
    expect(state.value.checkins[h.id]).toBeUndefined();
  });

  it('builds a valid demo garden', () => {
    const d = demoState('2026-09-24', 'zh');
    expect(sanitize(d)).toEqual(d);
    expect(d.habits.length).toBe(6);
  });
});
