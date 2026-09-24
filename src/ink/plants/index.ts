// Plant registry. Each generator lives in its own file and returns a Drawing (see ../types.ts).
import type { PlantKind } from '../../core/types';
import type { Drawing, PlantGenerator, PlantSpec } from '../types';
import { bamboo } from './bamboo';
import { plum } from './plum';
import { orchid } from './orchid';
import { chrysanthemum } from './chrysanthemum';
import { pine } from './pine';
import { lotus } from './lotus';

export const GENERATORS: Record<PlantKind, PlantGenerator> = { bamboo, plum, orchid, chrysanthemum, pine, lotus };

const cache = new Map<string, Drawing>();

/** Memoised: generating a plant is deterministic in (kind, seed, height). */
export function plantDrawing(spec: PlantSpec): Drawing {
  const key = `${spec.kind}:${spec.seed}:${spec.height}`;
  let d = cache.get(key);
  if (!d) {
    d = GENERATORS[spec.kind](spec);
    cache.set(key, d);
  }
  return d;
}

export const PLANT_INFO: Record<PlantKind, { zh: string; en: string; virtueZh: string; virtueEn: string }> = {
  plum: { zh: '梅', en: 'Plum', virtueZh: '凌寒独自开', virtueEn: 'blooms alone in the cold' },
  orchid: { zh: '兰', en: 'Orchid', virtueZh: '幽谷自芬芳', virtueEn: 'fragrant in a hidden valley' },
  bamboo: { zh: '竹', en: 'Bamboo', virtueZh: '虚心而有节', virtueEn: 'hollow-hearted, yet jointed' },
  chrysanthemum: { zh: '菊', en: 'Chrysanthemum', virtueZh: '傲霜犹有枝', virtueEn: 'defies the frost' },
  pine: { zh: '松', en: 'Pine', virtueZh: '岁寒而后凋', virtueEn: 'last to wither in winter' },
  lotus: { zh: '荷', en: 'Lotus', virtueZh: '出淤泥而不染', virtueEn: 'rises from mud unstained' },
};
