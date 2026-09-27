// 水月幻镜 · engine-content: everything named (API.md §5, GDD §11–§15, §17.7), registered for the
// core. The UI loads this module next to engine/index.ts and hands CONTENT to createEngine; a missing
// entry is a no-op, so the core runs without it.
//
//   skills.ts     the 13 镜技 (auto-target, drag-to-aim, cooldown after the run ends)
//   field.ts      map hazards, the passives' runtime parts, runtime 镜蚀, 今日镜 节气
//   elites.ts     the 6 named elites, the 6 镜印 affixes, 貔貅 and 镜中花
//   bosses.ts     the phase-script runner and the pattern library (9 bosses, 双生 by pairing)
//   mirrorself.ts 镜主, the Mirror Self
//   bridge.ts     the engine internals content needs beyond WorldApi (CHANGE REQUESTS)
//   util.ts       geometry, damage scaling, per-wave state, coroutines
//   dev.ts        window.__mirrorContent (dev builds)
import type { ContentRegistry } from '../../types';
import { SKILL_IMPLS } from './skills';
import { HAZARD_IMPLS, MUTATOR_IMPLS, PASSIVE_IMPLS, TERM_IMPLS } from './field';
import { AFFIX_IMPLS, ELITE_IMPLS, TREASURE_IMPLS } from './elites';
import { BOSS_IMPLS, PATTERN_IMPLS } from './bosses';
import { MIRROR_SELF } from './mirrorself';
import { installContentDev } from './dev';

export const CONTENT: ContentRegistry = {
  skills: SKILL_IMPLS,
  passives: PASSIVE_IMPLS,
  hazards: HAZARD_IMPLS,
  elites: ELITE_IMPLS,
  treasures: TREASURE_IMPLS,
  bosses: { ...BOSS_IMPLS, mirrorself: MIRROR_SELF as never },
  patterns: PATTERN_IMPLS,
  affixes: AFFIX_IMPLS,
  mutators: MUTATOR_IMPLS,
  terms: TERM_IMPLS,
};

installContentDev();

export { contentDev } from './dev';
export { bossState, forcePhase } from './bosses';
