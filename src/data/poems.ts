// Classical poetry (public domain), for check-ins, the almanac and the scroll. STUB — contract only.
import type { PlantKind } from '../core/types';

export interface Poem {
  /** One or two lines (a couplet), exactly as in the source, with full-width punctuation. */
  lines: string[];
  author: string;     // 朱熹
  dynasty: string;    // 宋
  title: string;      // 观书有感
  /** Our own brief English rendering. */
  en: string;
  authorEn: string;   // Zhu Xi
  /** Tags used to pick a fitting poem. */
  plants?: PlantKind[];
  terms?: number[];   // solar term indices 0..23
  seasons?: ('spring' | 'summer' | 'autumn' | 'winter')[];
  themes?: ('diligence' | 'focus' | 'night' | 'morning' | 'rain' | 'snow' | 'moon' | 'garden' | 'water' | 'friendship' | 'time')[];
}

export const POEMS: Poem[] = [
  { lines: ['半亩方塘一鉴开，天光云影共徘徊。', '问渠那得清如许？为有源头活水来。'], author: '朱熹', dynasty: '宋', title: '观书有感', en: 'A half-acre pond opens like a mirror; sky-light and cloud-shadow linger there together. How can it stay so clear? Because fresh water flows in from the source.', authorEn: 'Zhu Xi', themes: ['water', 'diligence', 'garden'] },
];

/** Deterministically pick a poem for a context. `salt` varies the pick (e.g. a date hash). */
export function pickPoem(ctx: { plant?: PlantKind; term?: number; theme?: Poem['themes'] extends (infer T)[] | undefined ? T : never; salt: number }): Poem {
  void ctx;
  return POEMS[0];
}
