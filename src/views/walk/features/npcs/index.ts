// The people of the painting: a bustling crowd in every place (crowd.ts), and new folk to talk to —
// a peddler on his round with a shop, a storyteller at the teahouse, a fortune teller, a sugar-figure
// stall, a flower girl, an old farmer by the homestead, a lost page boy and his master (people.ts);
// and what you carry from their stalls (carry.ts). The five older NPCs live in ../minigames/npcs.ts.
// Everyone is someone (folk.ts): a name, a voice, words for every companion (folk-lines.ts) and, for
// some, a story told a beat a day (folk-arcs.ts, talk.ts); one letter comes back by mail (letters.ts).
import type { WorldFeature } from '../../types';
import { crowd } from './crowd';
import { carryFeature } from './carry';
import { PEOPLE } from './people';

export const NPCS_FEATURES: WorldFeature[] = [crowd, carryFeature, ...PEOPLE];
