// A playful, modern 黄历: gentle 宜 (good for) / 忌 (avoid) suggestions per day. STUB — contract only.
export interface AlmanacDay {
  yi: { zh: string; en: string }[];  // 3–4 items
  ji: { zh: string; en: string }[];  // 2–3 items
}

/** Deterministic for a given date & term — the same day always reads the same. */
export function almanacFor(dateKey: string, termIndex: number): AlmanacDay {
  void dateKey; void termIndex;
  return { yi: [{ zh: '读书', en: 'Read' }], ji: [{ zh: '熬夜', en: 'Stay up late' }] };
}
