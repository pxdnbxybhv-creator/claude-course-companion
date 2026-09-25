// The in-world mini-games and the people of the painting: fishing, pitch-pot, boating for lotus,
// river lanterns, the temple bell, hide-and-seek with Big Ginger, five NPCs with things to say, and
// the daily-errands chip. Each is a WorldFeature built into its region's group at the map's anchors.
import type { WorldFeature } from '../../types';
import { feature } from '../kit';
import { fishing } from './fishing';
import { pitchPot } from './pitchpot';
import { boating } from './boat';
import { riverLanterns } from './lanterns';
import { templeBell } from './bell';
import { hideAndSeek } from './cat';
import { NPCS } from './npcs';
import { errands } from './errands';
import { closeSound } from './sound';

/** Last: close the games' private sound context when the world goes. */
const quiet = feature('mg-sound', (bag) => { bag.onDispose(closeSound); });

export const MINIGAME_FEATURES: WorldFeature[] = [fishing, pitchPot, boating, riverLanterns, templeBell, hideAndSeek, ...NPCS, errands, quiet];
