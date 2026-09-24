// Solar-term texts: names, pentads (七十二候), blurbs. STUB — contract only.
export interface TermText {
  zh: string;       // 立春
  pinyin: string;   // lìchūn
  en: string;       // Start of Spring
  /** One poetic sentence about the season, ≤ 40 chars. */
  blurbZh: string;
  blurbEn: string;
  /** The three pentads (七十二候) of this term, in order. */
  pentads: { zh: string; en: string }[];
}

export const TERMS: TermText[] = Array.from({ length: 24 }, (_, i) => ({
  zh: '节气' + i, pinyin: '', en: 'Term ' + i, blurbZh: '', blurbEn: '',
  pentads: [{ zh: '候一', en: '' }, { zh: '候二', en: '' }, { zh: '候三', en: '' }],
}));
