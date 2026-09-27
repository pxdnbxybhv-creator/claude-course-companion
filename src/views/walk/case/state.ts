// The 案卷 (case sheet) between the world and the page: the world asks the sheet to open in pick mode
// (「出示证物」 in a testimony) and waits for the card shown; the page opens it from the 案卷 chip. The
// bluebird's notes (「问青鸟」) are read here too, into play (backed up).
import { signal } from '@preact/signals';
import { flag, play, record } from '../../../app/play';
import { COUNTERS, nextHint, type EvidenceKey, type Hint, type WitnessKey } from '../features/taoyuan/case';

export type CaseTab = 'clues' | 'words' | 'bird';

export interface CasePick {
  who: WitnessKey;
  resolve(ev: EvidenceKey | null): void;
}

export interface CaseSheetState {
  tab: CaseTab;
  /** Pick mode: which witness the card will be shown to. */
  pick: CasePick | null;
  /** A card to open on arrival (just found). */
  focus?: EvidenceKey;
}

/** The sheet, open (non-null) or closed. */
export const caseSheet = signal<CaseSheetState | null>(null);

/** The walker is in the valley (the case's world keeps it): the 案卷 chip shows only there. */
export const caseHere = signal(false);

export function openCaseSheet(tab: CaseTab = 'clues', focus?: EvidenceKey): void {
  const s = caseSheet.peek();
  if (s?.pick) { s.pick.resolve(null); }
  caseSheet.value = { tab, pick: null, focus };
}

/** Close it (a pick still waiting gets nothing: 「不出示」). */
export function closeCaseSheet(): void {
  const s = caseSheet.peek();
  caseSheet.value = null;
  s?.pick?.resolve(null);
}

/** Open in pick mode for a witness; resolves with the card shown, or null if closed without. */
export function pickEvidence(who: WitnessKey): Promise<EvidenceKey | null> {
  const s = caseSheet.peek();
  s?.pick?.resolve(null);
  return new Promise((resolve) => {
    let settled = false;
    const once = (ev: EvidenceKey | null) => { if (settled) return; settled = true; resolve(ev); };
    caseSheet.value = { tab: 'clues', pick: { who, resolve: once } };
  });
}

/** Show this card to the witness (pick mode): the sheet closes and the world goes on. */
export function showEvidence(ev: EvidenceKey): void {
  const s = caseSheet.peek();
  caseSheet.value = null;
  s?.pick?.resolve(ev);
}

/**
 * 「问青鸟」: the next note of the ladder. A note not read before counts (case:hz:hint + 1, and its
 * tier's flag); one read already, or the "evidence is in hand" note, is free.
 */
export function askBird(): Hint {
  const h = nextHint(play.peek().flags);
  if (h.fresh && h.flag) {
    flag(h.flag);
    record(COUNTERS.hint);
  }
  return h;
}
