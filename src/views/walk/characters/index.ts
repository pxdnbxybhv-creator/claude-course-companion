// The cast's models: one factory per CharacterId (see data/characters.ts), and the painted portraits.
// Character modules never import 'three' at runtime (the namespace is passed in), so this registry
// is cheap to import from DOM pages.
import type { CharacterRegistry } from './types';
import { scholar } from './scholar';
import { gardener } from './gardener';
import { fisher } from './fisher';
import { musician } from './musician';
import { swordsman } from './swordsman';
import { taoist } from './taoist';
import { painter } from './painter';
import { player } from './player';
import { cat } from './cat';
import { rabbit } from './rabbit';
import { poet } from './poet';
import { guan } from './guan';
import { change } from './change';

export const FACTORIES: CharacterRegistry = {
  scholar, gardener, fisher, musician, swordsman, taoist, painter, player, cat, rabbit, poet, guan, change,
};

export { paintPortrait } from './portrait';
