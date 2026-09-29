// 水月幻镜 · the catalogue (GDD §24.4): counts, ids, every def keyed by its registry id, ⚖ spot checks.
import { describe, expect, it } from 'vitest';
import {
  ALT_SKILL_REG, ARCHETYPE_REG, BOSS_REG, COMPANION_REG, DEED_REG, ELITE_REG, HAZARD_REG, HEART_REG, ITEM_REG, MAP_REG,
  MONSTER_REG, MUTATOR_REG, PASSIVE_REG, REGISTRIES, SKILL_REG, STARTER_ITEMS, STARTER_WEAPONS, TERM_MOD_REG, TREASURE_REG,
  VOW_REG, WEAPON_REG, AFFIX_REG, lockOf, named,
} from '../src/views/mirror/ids';
import {
  AFFIXES, ARCHETYPES, BOSSES, COMPANIONS, DIFFS, ELITES, HAZARDS, HEART, ITEMS, MAPS, MONSTERS, MUTATORS, PASSIVES, SETS,
  SKILLS, TERM_MODS, TREASURES, VOWS, WCLASSES, WEAPONS,
} from '../src/views/mirror/data';
import { CHARACTERS } from '../src/data/characters';

const keysMatch = (reg: readonly { id: string }[], table: Record<string, { id: string }>) => {
  expect(Object.keys(table).sort()).toEqual(reg.map((r) => r.id).sort());
  for (const [k, v] of Object.entries(table)) expect(v.id).toBe(k);
};

describe('mirror catalogue', () => {
  it('has the GDD counts', () => {
    expect(WEAPON_REG).toHaveLength(27);
    expect(STARTER_WEAPONS).toHaveLength(18);
    expect(ITEM_REG).toHaveLength(77); // + the two 镜宝 (忘尘镜, 龙渊剑)
    expect(STARTER_ITEMS).toHaveLength(55); // 镜宝 carry no deed lock: itemPool keeps them out of every offer
    expect(ARCHETYPE_REG).toHaveLength(14);
    expect(MAP_REG).toHaveLength(3);
    expect(MONSTER_REG).toHaveLength(36);
    expect(ELITE_REG).toHaveLength(6);
    expect(TREASURE_REG).toHaveLength(2);
    expect(BOSS_REG).toHaveLength(9);
    expect(COMPANION_REG).toHaveLength(13);
    expect(DEED_REG).toHaveLength(31);
    expect(HEART_REG).toHaveLength(16);
    expect(TERM_MOD_REG).toHaveLength(24);
    expect(DIFFS).toHaveLength(6);
  });

  it('keys every def by its registry id', () => {
    keysMatch(WEAPON_REG, WEAPONS);
    keysMatch(ITEM_REG, ITEMS);
    keysMatch(MONSTER_REG, MONSTERS);
    keysMatch(ELITE_REG, ELITES);
    keysMatch(TREASURE_REG, TREASURES);
    keysMatch(BOSS_REG, BOSSES);
    keysMatch(MAP_REG, MAPS);
    keysMatch(HAZARD_REG, HAZARDS);
    keysMatch(COMPANION_REG, COMPANIONS);
    keysMatch([...SKILL_REG, ...ALT_SKILL_REG], SKILLS);
    keysMatch(PASSIVE_REG, PASSIVES);
    keysMatch(VOW_REG, VOWS);
    keysMatch(MUTATOR_REG, MUTATORS);
    keysMatch(AFFIX_REG, AFFIXES);
    keysMatch(TERM_MOD_REG, TERM_MODS);
    keysMatch(HEART_REG, HEART);
    keysMatch(ARCHETYPE_REG, ARCHETYPES);
    expect(Object.keys(SETS).sort()).toEqual([...WCLASSES].sort());
    DIFFS.forEach((d, i) => expect(d.index).toBe(i));
  });

  it('keeps ids unique across every list', () => {
    const all = Object.values(REGISTRIES).flatMap((l) => (l as readonly { id: string }[]).map((r) => r.id));
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    expect(named('guihua')?.zh).toBe('桂花精');
  });

  it('matches companions to the app roster', () => {
    expect(COMPANION_REG.map((c) => c.id).sort()).toEqual(CHARACTERS.map((c) => c.id).sort());
    for (const c of COMPANION_REG) {
      const d = COMPANIONS[c.id];
      expect(SKILLS[d.skill].char).toBe(c.id);
      expect(SKILLS[d.altSkill].char).toBe(c.id);
      expect(PASSIVES[d.passive].char).toBe(c.id);
      // ⚖5 (m6): every body +10 气血 (关公 +12), +2 护甲 (关公 +3), the nine ranged +1 more
      expect(d.hp).toBeGreaterThanOrEqual(26);
      expect(d.hp).toBeLessThanOrEqual(40);
      expect(d.armor).toBeGreaterThanOrEqual(2);
      expect(d.armor).toBeLessThanOrEqual(6);
      expect(['melee', 'ranged']).toContain(d.style);
      if (d.start !== 'choice') expect(STARTER_WEAPONS).toContain(d.start);
    }
    expect(COMPANIONS.guan.slots).toBe(5);
    expect(COMPANIONS.guan.bans).toEqual(['hidden']);
    expect(COMPANIONS.cat.bans).toEqual(['heavy', 'bow']);
    expect(COMPANIONS.change.dodgeCap).toBe(70);
  });

  it('locks every locked weapon and item behind an existing deed', () => {
    const deeds = new Set(DEED_REG.map((d) => d.id));
    for (const w of WEAPON_REG) {
      const lock = lockOf(w.id);
      expect(!!lock).toBe(!STARTER_WEAPONS.includes(w.id));
      if (lock) expect(deeds.has(lock)).toBe(true);
    }
    // legendaries are all 锁 and unique; the 镜宝 (tier 4 too) are earned, never offered, and stack
    for (const it of ITEM_REG) if (ITEMS[it.id].tier === 4 && !ITEMS[it.id].relic) expect(lockOf(it.id)).toBeTruthy();
    for (const it of ITEM_REG) if (ITEMS[it.id].tier === 4 && !ITEMS[it.id].relic) expect(ITEMS[it.id].max).toBe(1);
    for (const it of ITEM_REG) if (ITEMS[it.id].relic) expect([ITEMS[it.id].max, ITEMS[it.id].price, lockOf(it.id)]).toEqual([0, 0, undefined]);
  });

  it('gives every archetype key items and (but 劫火) a capstone', () => {
    for (const a of ARCHETYPE_REG) {
      const d = ARCHETYPES[a.id];
      expect(d.keys.length).toBeGreaterThanOrEqual(3);
      if (a.id !== 'jiehuo') expect(d.capstone).toBeTruthy();
      for (const k of d.keys) expect(ITEMS[k]).toBeTruthy();
      for (const w of d.weapons) expect(WEAPONS[w]).toBeTruthy();
    }
  });

  it('builds every map from its own roster, elites and a boss at 10, 20 and 30', () => {
    for (const m of MAP_REG) {
      const d = MAPS[m.id];
      expect(d.roster.filter((id) => MONSTERS[id].map === 'all')).toHaveLength(4);
      for (const id of d.roster) expect(['all', m.id]).toContain(MONSTERS[id].map);
      expect(d.roster.length).toBe(m.id === 'lake' ? 14 : 15);
      for (const e of d.elites) expect(ELITES[e].map).toBe(m.id);
      d.bosses.forEach((b, i) => { expect(BOSSES[b].map).toBe(m.id); expect(BOSSES[b].wave).toBe((i + 1) * 10); });
      for (const h of d.hazards) expect(HAZARDS[h].map).toBe(m.id);
    }
    expect(MAPS.lake.hp).toBe(1);
    expect(MAPS.forest.hp).toBe(1);
    expect(MAPS.palace.hp).toBe(1.05);
    expect([MAPS.lake.pay, MAPS.forest.pay, MAPS.palace.pay]).toEqual([1, 1.05, 1.1]);
  });

  it('scripts every boss in three phases at 100 / 60 / 25%, with ⚖ damage', () => {
    for (const b of BOSS_REG) {
      const d = BOSSES[b.id];
      expect(d.phases.map((p) => p.from)).toEqual([1, 0.6, 0.25]);
      expect(d.K).toBe({ 10: 1300, 20: 1200, 30: 700 }[d.wave]);
      expect(d.contact).toBe({ 10: 7, 20: 37, 30: 120 }[d.wave]);
      for (const p of d.phases) expect(p.script.length).toBeGreaterThan(0);
    }
    expect(BOSSES.carp.phases[0].script.find((c) => c.pat === 'bubbleSpiral')!.dmg).toBe(4);
    expect(BOSSES.xingtian.phases[0].script[0].dmg).toBe(110); // 22 × 5
    expect(BOSSES.mirage.phases[0].script[0].dmg).toBe(23); // 10 × 2.3
  });

  it('carries the ⚖ numbers', () => {
    expect(WEAPONS.qingping.dmg).toEqual([9, 15, 24, 38]);
    expect(WEAPONS.qingping.cd).toBe(1.2);
    expect(WEAPONS.yanyue.scale).toEqual({ melee: 1.1, armor: 0.3 });
    expect(WEAPONS.brush.scale).toEqual({ spirit: 2 });
    expect(WEAPONS.thunder.p.fall).toBe(0.85);
    expect(WEAPONS.rod.p.hooks).toEqual([1, 1, 2, 3]);
    expect(ITEMS.luckycat.max).toBe(2);
    expect(ITEMS.cuthair.stats).toEqual({ dmg: 10, hp: -2 });
    expect(ITEMS.inkpool.price).toBe(52); // ⚖5 紫红: 仙 ×0.7
    expect(ITEMS.yujian.max).toBe(2);
    expect(ITEMS.swordheart.max).toBe(1);
    expect(COMPANIONS.scholar.hp).toBe(34);
    expect(COMPANIONS.scholar.armor).toBe(4);
    expect(COMPANIONS.guan.hp).toBe(40);
    expect(COMPANIONS.guan.armor).toBe(6);
    expect(COMPANIONS.poet.armor).toBe(3);
    expect(SKILLS.yizi.p.base).toBe(30);
    expect(SKILLS.tuodao.cd).toBe(14);
    expect(DIFFS.map((d) => d.hp)).toEqual([0.7, 1, 1.3, 1.6, 1.9, 2.2]);
    expect(DIFFS.map((d) => d.dmg)).toEqual([0.6, 1, 1.3, 1.6, 1.9, 2.2]); // ⚖5 ladder guard: the damage step doubled from 明镜
    expect(DIFFS.map((d) => d.pay)).toEqual([0.5, 1, 1.15, 1.3, 1.45, 1.6]);
  });
});
