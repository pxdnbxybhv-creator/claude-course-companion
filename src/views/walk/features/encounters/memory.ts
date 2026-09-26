// The encounters' own small memory (its own localStorage key): how many days each was due and did
// not happen (the chance rises), the rumours told today, what played out today, and consequences that
// come later (the fox's basket). Only a convenience: losing it only makes the next one a little rarer.
import { emptyMemory, sanitizeMemory, type Memory } from './logic';

const KEY = 'banmu.qiyu.v1';

export function loadMemory(): Memory {
  try {
    const t = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return t ? sanitizeMemory(JSON.parse(t)) : emptyMemory();
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(m: Memory): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode: for this visit only */ }
}
