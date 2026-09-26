// 清空一切 and importing a backup reach every store that rides along in backups, not just the garden.
import { describe, expect, it } from 'vitest';
import { state, emptyState, exportJSON, importJSON, resetAll, replaceState, setSettings } from '../src/app/store';
import { play, emptyPlay, playResets } from '../src/app/play';
import { home, emptyHome, setHomeName, adoptPet, setPetLine } from '../src/app/home';
import { book, saveBook } from '../src/views/walk/features/home/life/book';

function seed() {
  replaceState({ ...emptyState(), habits: [{ id: 'a1b2c3d4', name: 'mine', plant: 'bamboo', seed: 1, createdAt: '2026-09-01' }] });
  play.value = { ...emptyPlay(), coins: 897, flags: { 'wp:lake': true }, done: { 'q-water': '2026-09-20' } };
  home.value = emptyHome();
  setHomeName('测试园');
  const pet = adoptPet('dog', '阿黄');
  expect(pet).not.toBeNull();
  setPetLine(pet!, '早');
  saveBook((b) => { b.snack = '2026-09-25'; b.lines[pet!] = '早'; });
}

describe('erase and import', () => {
  it('清空一切 empties the garden, the walk’s progress, the homestead and its notebook, and keeps the settings', () => {
    seed();
    setSettings({ sealName: '半亩' });
    const n = playResets();
    resetAll();
    expect(state.value.habits).toEqual([]);
    expect(state.value.settings.sealName).toBe('半亩');
    expect(play.value.coins).toBe(0);
    expect(play.value.flags).toEqual({});
    expect(play.value.done).toEqual({});
    expect(home.value).toEqual(emptyHome());
    expect(book().snack).toBe('');
    expect(book().lines).toEqual({});
    expect(playResets()).toBe(n + 1);
  });

  it('an older backup, without the homestead, replaces the homestead too', () => {
    seed();
    const old = JSON.parse(exportJSON()) as Record<string, unknown>;
    delete old.home;
    delete old.homelife;
    home.value = emptyHome();
    setHomeName('另一园');
    expect(importJSON(JSON.stringify(old))).toBe(true);
    expect(play.value.coins).toBe(897);
    expect(home.value).toEqual(emptyHome());
    expect(book().snack).toBe('');
  });

  it('a full backup brings everything back', () => {
    seed();
    const json = exportJSON();
    resetAll();
    expect(importJSON(json)).toBe(true);
    expect(play.value.coins).toBe(897);
    expect(home.value.name).toBe('测试园');
    expect(home.value.pets.map((p) => p.name)).toEqual(['阿黄']);
    expect(book().snack).toBe('2026-09-25');
  });
});
