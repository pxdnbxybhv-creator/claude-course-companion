// Every 奇遇's scene, by id (see data/encounters.ts). Each builds its small stage when the director
// decides the encounter happens (index.ts), and plays out when the walker takes part. 桃花源 is not
// here: it is met in the 桃源 story (logic.ts STORY_ENCOUNTERS).
import type { SceneBuild } from './stage';
import { hujie, zhiyin } from './scene-bamboo';
import { lanke, xianhe } from './scene-ridge';
import { laoyue, yuelao } from './scene-lake';
import { kezhou, shijin, zuixian } from './scene-town';
import { hanshan } from './scene-temple';
import { hudie, liuxing, mutong } from './scene-open';

export const SCENES: Record<string, SceneBuild> = {
  zhiyin, lanke, laoyue, hujie, xianhe, liuxing, shijin, hudie, kezhou, zuixian, mutong, hanshan, yuelao,
};
