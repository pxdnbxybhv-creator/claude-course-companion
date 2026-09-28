// 水月幻镜 · when the tutorial is offered (d-tutorial §3), like the app's intro-film gate: a newcomer
// gets a one-time sheet on the first visit to 镜, a player with history a one-time lobby ribbon, and
// Playwright / webdriver neither unless forced with ?tutor=1. Pure.
import type { MirrorMeta } from '../types';

/** A player with no history: no codex page (entering marks the companion and the map), no ticket, no best. */
export function isNewcomer(m: Pick<MirrorMeta, 'codex' | 'ticketsUsed' | 'bests'>): boolean {
  return Object.keys(m.codex).length === 0 && m.ticketsUsed === 0 && Object.keys(m.bests).length === 0;
}
export function decideTutorOffer(o: { meta: Pick<MirrorMeta, 'codex' | 'ticketsUsed' | 'bests' | 'active' | 'tutor'>; webdriver: boolean; param: string | null }): 'sheet' | 'ribbon' | null {
  if (o.param === '0') return null;
  if (o.param === '1') return 'sheet';
  if (o.webdriver) return null;
  if (o.meta.tutor?.offered) return null;
  if (o.meta.active) return 'ribbon';
  return isNewcomer(o.meta) ? 'sheet' : 'ribbon';
}
