// 水月幻镜 · every data table, typed and keyed by ids.ts. Pure: safe for node tests and the sim.
export { STAT_IDS, BASE_STATS, CLAMP, F, CARD_STATS, CARD_STAT_IDS, MASTERY } from './stats';
export { WEAPONS, SETS, WCLASSES } from './weapons';
export { ITEMS } from './items';
export { MONSTERS, ELITES, TREASURES } from './monsters';
export { BOSSES, ENDLESS_BOSS } from './bosses';
export { MAPS, HAZARDS } from './maps';
export { COMPANIONS, SKILLS, PASSIVES } from './companions';
export { DIFFS, VOWS, HEAT_MAX, MUTATORS, AFFIXES } from './difficulty';
export { HEART, TERM_MODS, ARCHETYPES, PAY, rateOf } from './meta';
// the shared words (mirror3): one label and one plain line per idea, and every description template
export { GLOSSARY, STAT_FMT, STAT_GROUPS, termOf, termName, termLine } from './glossary';
export {
  K, WEAPON_SAY, ITEM_SAY, SKILL_SAY, PASSIVE_SAY, COMPANION_SAY, FLAG_SAY, ARCH_SAY, DIFF_SAY, VOW_SAY, MUTATOR_SAY, AFFIX_SAY,
  DEED_SAY, TITLE_SAY, FOE_SAY, HAZARD_SAY,
} from './say';
