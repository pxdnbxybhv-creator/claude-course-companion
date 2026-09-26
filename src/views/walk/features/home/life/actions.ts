// What you can do for the homestead's pets and people, shared by the ledger card, the pet seller and
// the animals themselves: adopt (name it, pay), hire (name them, pay), feed, walk together, rename,
// rehome, dismiss. Coins are spent here first, then app/home.ts records it.
import type { WorldCtx } from '../../../types';
import { adoptPet, feedPet, hireResident, home, HOME_LIMITS, releasePet, dismissResident, renamePet, renameResident, setFollower } from '../../../../../app/home';
import { play, spend } from '../../../../../app/play';
import { today } from '../../../../../app/store';
import { hashString } from '../../../../../core/rng';
import { adoptCheck, FOOD_PRICE, isRole, isSpecies, ROLE_DEF, SPECIES_DEF, type Role, type Species } from './logic';
import { nameCard } from './card';
import * as snd from './sound';

/** Where a newly adopted pet first appears (the seller's basket), read once by the pets at home. */
export const arrivals = new Map<string, { x: number; z: number }>();

export function adoptBlockText(species: Species, block: string | null): { zh: string; en: string } {
  const d = SPECIES_DEF[species];
  switch (block) {
    case 'house': return { zh: `先建一座${d.houseZh}`, en: `Build a ${d.houseEn} first` };
    case 'full': return { zh: `${d.houseZh}住满了`, en: `The ${d.houseEn} is full` };
    case 'limit': return { zh: `最多养 ${HOME_LIMITS.pets} 只`, en: `At most ${HOME_LIMITS.pets} pets` };
    case 'coins': return { zh: '铜钱不够', en: 'Not enough coins' };
    default: return { zh: '', en: '' };
  }
}

/** Adopt one: the naming card, then pay. Returns the new pet's uid, or null. */
export async function adopt(ctx: WorldCtx, species: Species, price = SPECIES_DEF[species].price, from?: { x: number; z: number }): Promise<string | null> {
  const h = home.value;
  const chk = adoptCheck(species, h.items, h.pets, { coins: play.value.coins, limit: HOME_LIMITS.pets, price });
  if (!chk.ok) { const b = adoptBlockText(species, chk.block); ctx.hud.toast(b.zh, b.en); return null; }
  const d = SPECIES_DEF[species];
  const taken = new Set(h.pets.map((p) => p.name));
  const name = await nameCard(ctx, {
    glyph: d.glyph,
    titleZh: `给${d.zh}取个名字`, titleEn: `Name your ${d.en.toLowerCase()}`,
    noteZh: d.traitZh, noteEn: d.traitEn,
    suggestions: d.names.filter((n) => !taken.has(n)),
  });
  if (name === null) return null;
  if (!spend(price)) { ctx.hud.toast('铜钱不够', 'Not enough coins'); return null; }
  const uid = adoptPet(species, name);
  if (!uid) return null;
  if (from) arrivals.set(uid, from);
  snd.chime();
  ctx.hud.toast(`${name}到家了！`, `${name} has come home!`, 2800);
  return uid;
}

/** Hire someone: the naming card, then pay. */
export async function hire(ctx: WorldCtx, role: Role): Promise<string | null> {
  const h = home.value;
  const r = ROLE_DEF[role];
  if (h.residents.some((m) => m.role === role)) { ctx.hud.toast(`已经有${r.zh}了`, `You already have a ${r.en.toLowerCase()}`); return null; }
  if (h.residents.length >= HOME_LIMITS.residents) { ctx.hud.toast('家里住不下了', 'No more room'); return null; }
  if (play.value.coins < r.price) { ctx.hud.toast('铜钱不够', 'Not enough coins'); return null; }
  const name = await nameCard(ctx, {
    glyph: r.glyph,
    titleZh: `新来的${r.zh}叫什么？`, titleEn: `What is your new ${r.en.toLowerCase()} called?`,
    noteZh: r.descZh, noteEn: r.descEn,
    suggestions: r.names,
  });
  if (name === null) return null;
  if (!spend(r.price)) { ctx.hud.toast('铜钱不够', 'Not enough coins'); return null; }
  const uid = hireResident(role, name, hashString(`${role}:${name}:${h.residents.length}:${h.pets.length}`));
  if (!uid) return null;
  snd.chime();
  ctx.hud.toast(`${r.zh}${name}来了`, `${name} the ${r.en.toLowerCase()} has arrived`, 2800);
  return uid;
}

/** Feed a pet (pet food costs coins; once a day counts). */
export function feed(ctx: WorldCtx, uid: string): boolean {
  const p = home.value.pets.find((x) => x.uid === uid);
  if (!p) return false;
  if (p.fed === today.value) { ctx.hud.toast(`${p.name}今天吃饱了`, `${p.name} has eaten today`); return false; }
  if (!spend(FOOD_PRICE)) { ctx.hud.toast('铜钱不够买吃的', 'Not enough coins for food'); return false; }
  feedPet(uid);
  snd.munch();
  return true;
}

export async function renamePetFlow(ctx: WorldCtx, uid: string): Promise<void> {
  const p = home.value.pets.find((x) => x.uid === uid);
  if (!p) return;
  const d = isSpecies(p.species) ? SPECIES_DEF[p.species] : null;
  const name = await nameCard(ctx, {
    glyph: d?.glyph ?? '宠', titleZh: `给${p.name || d?.zh || '它'}改个名字`, titleEn: `Rename ${p.name || 'your pet'}`,
    value: p.name, suggestions: d?.names ?? [],
  });
  if (name !== null) renamePet(uid, name);
}

export async function renameResidentFlow(ctx: WorldCtx, uid: string): Promise<void> {
  const m = home.value.residents.find((x) => x.uid === uid);
  if (!m) return;
  const r = isRole(m.role) ? ROLE_DEF[m.role] : null;
  const name = await nameCard(ctx, {
    glyph: r?.glyph ?? '人', titleZh: `给${r?.zh ?? ''}${m.name}改个名字`, titleEn: `Rename ${m.name}`,
    value: m.name, suggestions: r?.names ?? [],
  });
  if (name !== null) renameResident(uid, name);
}

export function toggleFollow(ctx: WorldCtx, uid: string): void {
  const p = home.value.pets.find((x) => x.uid === uid);
  if (!p) return;
  if (p.follow) {
    setFollower(null);
    ctx.hud.toast(`${p.name}回家去了`, `${p.name} goes back home`);
  } else {
    if (isSpecies(p.species) && !SPECIES_DEF[p.species].follows) { ctx.hud.toast('锦鲤离不开池塘', 'Koi cannot leave the pond'); return; }
    setFollower(uid);
    ctx.hud.toast(`${p.name}跟着你走了`, `${p.name} comes along with you`);
  }
}

export function rehome(ctx: WorldCtx, uid: string): void {
  const p = home.value.pets.find((x) => x.uid === uid);
  if (!p) return;
  releasePet(uid);
  ctx.hud.toast(`${p.name}去了一户好人家`, `${p.name} has gone to a good home`, 2600);
}

export function dismiss(ctx: WorldCtx, uid: string): void {
  const m = home.value.residents.find((x) => x.uid === uid);
  if (!m) return;
  dismissResident(uid);
  ctx.hud.toast(`${m.name}收拾行李，告辞了`, `${m.name} packs up and takes leave`, 2600);
}
