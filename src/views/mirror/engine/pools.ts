// 水月幻镜 · pooled structure-of-arrays for every in-wave body (GDD §24.3). Slots are reused; a free
// list keeps allocation O(1); nothing here allocates after construction.
import type { AffixId } from '../ids';
import type { AtlasId, TeleShape, WorldApi, AffixImpl, ActorImpl } from '../types';

/** Base pool: alive flags, a free list and a high-water mark for loops. */
export class Pool {
  readonly cap: number;
  readonly alive: Uint8Array;
  /** Loop bound: every live slot is < n. */
  n = 0;
  count = 0;
  private free: Int32Array;
  private nFree: number;
  constructor(cap: number) {
    this.cap = cap;
    this.alive = new Uint8Array(cap);
    this.free = new Int32Array(cap);
    for (let i = 0; i < cap; i++) this.free[i] = cap - 1 - i;
    this.nFree = cap;
  }
  /** A free slot index, or −1 when full. */
  take(): number {
    if (this.nFree <= 0) return -1;
    const i = this.free[--this.nFree];
    this.alive[i] = 1;
    this.count++;
    if (i >= this.n) this.n = i + 1;
    return i;
  }
  release(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.count--;
    this.free[this.nFree++] = i;
  }
  clear(): void {
    this.alive.fill(0);
    for (let i = 0; i < this.cap; i++) this.free[i] = this.cap - 1 - i;
    this.nFree = this.cap;
    this.n = 0;
    this.count = 0;
  }
  /** Shrink the loop bound past trailing dead slots. */
  trim(): void {
    while (this.n > 0 && !this.alive[this.n - 1]) this.n--;
  }
}

export const EKind = { Mon: 0, Elite: 1, Boss: 2, Treasure: 3, Ally: 4, Demon: 5 } as const;
export const KIND_NAMES = ['mon', 'elite', 'boss', 'treasure', 'ally', 'demon'] as const;

/** Burn and bleed stacks kept per enemy (samadhi doubles a cap of 5 + items: 16 is plenty). */
export const BURN_MAX = 16;
export const BLEED_MAX = 15;

export class Enemies extends Pool {
  readonly gen: Uint32Array;
  readonly kind: Uint8Array;
  /** Registry id and atlas id of the body. */
  readonly id: string[];
  readonly atlas: (AtlasId | null)[];
  /** Role code (see enemies.ts ROLE), ai code. */
  readonly role: Uint8Array;
  readonly x: Float32Array; readonly y: Float32Array;
  readonly vx: Float32Array; readonly vy: Float32Array;
  readonly face: Float32Array;
  readonly r: Float32Array;
  /** Painted radius (sprite scale = r / r0). */
  readonly r0: Float32Array;
  readonly hp: Float32Array; readonly hpMax: Float32Array;
  readonly armor: Float32Array; readonly dmg: Float32Array; readonly speed: Float32Array; readonly resist: Float32Array;
  /** State machine: st, time left in it, target point, two scratch values. */
  readonly st: Uint8Array; readonly stT: Float32Array; readonly tx: Float32Array; readonly ty: Float32Array;
  readonly a: Float32Array; readonly b: Float32Array;
  readonly cool: Float32Array;
  readonly kx: Float32Array; readonly ky: Float32Array; readonly kT: Float32Array;
  readonly flash: Float32Array; readonly contactT: Float32Array;
  // statuses
  readonly burnN: Uint8Array; readonly burnT: Float32Array; readonly burnD: Float32Array;
  readonly bleedN: Uint8Array; readonly bleedT: Float32Array; readonly bleedD: Float32Array;
  readonly slowV: Float32Array; readonly slowT: Float32Array;
  readonly rootT: Float32Array; readonly stunT: Float32Array; readonly charmT: Float32Array;
  readonly shredN: Uint8Array; readonly shredT: Float32Array;
  readonly vulnV: Float32Array; readonly vulnT: Float32Array; readonly staggerT: Float32Array;
  /** Charmed by 伯牙 (burst when it ends). */
  readonly boya: Uint8Array;
  readonly untarget: Uint8Array; readonly invuln: Uint8Array; readonly hidden: Uint8Array; readonly air: Uint8Array;
  readonly tags: Uint16Array;
  /** 月华 dropped (threat cost; fractional drops with that chance). */
  readonly cost: Float32Array;
  readonly noDrops: Uint8Array; readonly capped: Uint8Array;
  /** 重墨 growth (1 … 1.6). */
  readonly heavy: Float32Array;
  readonly lastSlot: Int16Array; readonly lastSrc: Uint8Array;
  readonly numAcc: Float32Array; readonly numT: Float32Array; readonly numCrit: Uint8Array;
  /** The live number this body last showed (merging), −1 for none. */
  readonly numIdx: Int16Array;
  /** Hit reaction (打击感, visual only): strength 0..1, direction of the blow, seconds since. */
  readonly hitV: Float32Array; readonly hitA: Float32Array; readonly hitAge: Float32Array;
  readonly partner: Int32Array;
  readonly eaten: Float32Array;
  readonly phase: Uint8Array;
  /** A splitter's child (never splits again). */
  readonly child: Uint8Array;
  /** A boss's decoy (mirage, illusion, false moon, monkey, tree): never healed, never counts as a foe of note. */
  readonly decoy: Uint8Array;
  readonly age: Float32Array;
  /** Content scratch: 8 floats per body, and a subarray view per slot made once. */
  readonly memAll: Float32Array;
  readonly mem: Float32Array[];
  readonly actor: (ActorImpl | null)[];
  readonly actorS: unknown[];
  readonly affixes: (readonly AffixId[] | null)[];
  readonly affixImpl: AffixImpl[][];
  readonly affixS: unknown[][];

  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.gen = new Uint32Array(cap);
    this.kind = new Uint8Array(cap);
    this.id = new Array(cap).fill('');
    this.atlas = new Array(cap).fill(null);
    this.role = new Uint8Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.face = F(); this.r = F(); this.r0 = F();
    this.hp = F(); this.hpMax = F(); this.armor = F(); this.dmg = F(); this.speed = F(); this.resist = F();
    this.st = new Uint8Array(cap); this.stT = F(); this.tx = F(); this.ty = F(); this.a = F(); this.b = F(); this.cool = F();
    this.kx = F(); this.ky = F(); this.kT = F(); this.flash = F(); this.contactT = F();
    this.burnN = new Uint8Array(cap); this.burnT = new Float32Array(cap * BURN_MAX); this.burnD = new Float32Array(cap * BURN_MAX);
    this.bleedN = new Uint8Array(cap); this.bleedT = new Float32Array(cap * BLEED_MAX); this.bleedD = new Float32Array(cap * BLEED_MAX);
    this.slowV = F(); this.slowT = F(); this.rootT = F(); this.stunT = F(); this.charmT = F();
    this.shredN = new Uint8Array(cap); this.shredT = F(); this.vulnV = F(); this.vulnT = F(); this.staggerT = F();
    this.boya = new Uint8Array(cap);
    this.untarget = new Uint8Array(cap); this.invuln = new Uint8Array(cap); this.hidden = new Uint8Array(cap); this.air = new Uint8Array(cap);
    this.tags = new Uint16Array(cap); this.cost = F(); this.noDrops = new Uint8Array(cap); this.capped = new Uint8Array(cap);
    this.heavy = F(); this.lastSlot = new Int16Array(cap); this.lastSrc = new Uint8Array(cap);
    this.numAcc = F(); this.numT = F(); this.numCrit = new Uint8Array(cap); this.numIdx = new Int16Array(cap).fill(-1);
    this.hitV = F(); this.hitA = F(); this.hitAge = F();
    this.partner = new Int32Array(cap); this.eaten = F(); this.phase = new Uint8Array(cap); this.child = new Uint8Array(cap); this.decoy = new Uint8Array(cap); this.age = F();
    this.memAll = new Float32Array(cap * 8);
    this.mem = [];
    for (let i = 0; i < cap; i++) this.mem.push(this.memAll.subarray(i * 8, i * 8 + 8));
    this.actor = new Array(cap).fill(null);
    this.actorS = new Array(cap).fill(null);
    this.affixes = new Array(cap).fill(null);
    this.affixImpl = [];
    this.affixS = [];
    for (let i = 0; i < cap; i++) { this.affixImpl.push([]); this.affixS.push([]); }
  }

  /** Handle of slot i (generation-tagged: stale handles fail alive checks). */
  handle(i: number): number { return this.gen[i] * 1024 + i; }
  slotOf(h: number): number {
    if (h < 0) return -1;
    const i = h % 1024;
    if (i >= this.cap || !this.alive[i] || this.gen[i] !== Math.floor(h / 1024)) return -1;
    return i;
  }

  /** Take a slot and zero every per-body field. */
  spawnSlot(): number {
    const i = this.take();
    if (i < 0) return -1;
    this.gen[i] = (this.gen[i] + 1) % 0x100000;
    this.vx[i] = this.vy[i] = this.face[i] = 0;
    this.st[i] = 0; this.stT[i] = 0; this.tx[i] = this.ty[i] = 0; this.a[i] = this.b[i] = 0; this.cool[i] = 0;
    this.kx[i] = this.ky[i] = this.kT[i] = 0; this.flash[i] = 0; this.contactT[i] = 0;
    this.burnN[i] = 0; this.bleedN[i] = 0; this.slowV[i] = this.slowT[i] = 0; this.rootT[i] = this.stunT[i] = this.charmT[i] = 0;
    this.shredN[i] = 0; this.shredT[i] = 0; this.vulnV[i] = this.vulnT[i] = 0; this.staggerT[i] = 0; this.boya[i] = 0;
    this.untarget[i] = this.invuln[i] = this.hidden[i] = this.air[i] = 0;
    this.tags[i] = 0; this.cost[i] = 0; this.noDrops[i] = 0; this.capped[i] = 1; this.heavy[i] = 1;
    this.lastSlot[i] = -1; this.lastSrc[i] = 0; this.numAcc[i] = 0; this.numT[i] = 0; this.numCrit[i] = 0; this.numIdx[i] = -1;
    this.hitV[i] = 0; this.hitA[i] = 0; this.hitAge[i] = 9;
    this.partner[i] = -1; this.eaten[i] = 0; this.phase[i] = 0; this.child[i] = 0; this.decoy[i] = 0; this.age[i] = 0;
    this.mem[i].fill(0);
    this.actor[i] = null; this.actorS[i] = null; this.affixes[i] = null;
    this.affixImpl[i].length = 0; this.affixS[i].length = 0;
    return i;
  }
}

/** Shot behaviours (player side). */
export const SMode = { Straight: 0, BoomOut: 1, BoomBack: 2, Hook: 3, Lob: 4, SwordLead: 5, SwordOut: 6, Homing: 7, Rain: 8, Converge: 9, HookBack: 10, SwordBack: 11 } as const;

export class Shots extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly r: Float32Array; readonly life: Float32Array; readonly life0: Float32Array;
  readonly kind: Uint8Array;
  readonly mode: Uint8Array;
  /** Weapon slot (−1 = item/skill/summon). */
  readonly slot: Int16Array;
  /** Damage before crit and armour; crit chance 0..1 and multiplier. */
  readonly dmg: Float32Array; readonly critP: Float32Array; readonly critM: Float32Array;
  readonly knock: Float32Array; readonly proc: Float32Array;
  readonly pierce: Int16Array; readonly bounce: Int16Array;
  readonly homing: Float32Array; readonly speed: Float32Array;
  /** Target / lob landing / boomerang origin. */
  readonly tx: Float32Array; readonly ty: Float32Array;
  readonly target: Int32Array;
  /**
   * Bodies this shot has hit: one bit per enemy slot (words per shot = ⌈enemy cap / 32⌉). A shot
   * hits a body at most once per pass; a boomerang or a returning sword forgets on the turn. The
   * world clears a slot's bit in every shot when a new body takes that slot.
   */
  readonly hitBits: Uint32Array;
  readonly words: number;
  /** Bit flags, see SF. */
  readonly flags: Uint32Array;
  readonly src: Uint8Array;
  readonly aux: Float32Array;
  readonly trailT: Float32Array;
  readonly px: Float32Array; readonly py: Float32Array;
  /** Enemy side: raw scaled damage, status to apply. */
  readonly status: Uint8Array; readonly statusDur: Float32Array; readonly statusV: Float32Array;
  readonly owner: Int32Array;
  /** `bodies` is the enemy pool's capacity (0 for enemy shots, which keep no hit set). */
  constructor(cap: number, bodies = 0) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.words = Math.ceil(bodies / 32);
    this.hitBits = new Uint32Array(cap * this.words);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.r = F(); this.life = F(); this.life0 = F();
    this.kind = new Uint8Array(cap); this.mode = new Uint8Array(cap); this.slot = new Int16Array(cap);
    this.dmg = F(); this.critP = F(); this.critM = F(); this.knock = F(); this.proc = F();
    this.pierce = new Int16Array(cap); this.bounce = new Int16Array(cap); this.homing = F(); this.speed = F();
    this.tx = F(); this.ty = F(); this.target = new Int32Array(cap);
    this.flags = new Uint32Array(cap); this.src = new Uint8Array(cap); this.aux = F(); this.trailT = F(); this.px = F(); this.py = F();
    this.status = new Uint8Array(cap); this.statusDur = F(); this.statusV = F(); this.owner = new Int32Array(cap);
  }
  spawnSlot(): number {
    const i = this.take();
    if (i < 0) return -1;
    this.vx[i] = this.vy[i] = 0; this.r[i] = 6; this.life[i] = this.life0[i] = 1; this.kind[i] = 0; this.mode[i] = 0; this.slot[i] = -1;
    this.dmg[i] = 0; this.critP[i] = 0; this.critM[i] = 1.5; this.knock[i] = 0; this.proc[i] = 1; this.pierce[i] = 0; this.bounce[i] = 0;
    this.homing[i] = 0; this.speed[i] = 0; this.tx[i] = this.ty[i] = 0; this.target[i] = -1; this.flags[i] = 0;
    this.forgetHits(i);
    this.src[i] = 0; this.aux[i] = 0; this.trailT[i] = 0; this.px[i] = this.x[i]; this.py[i] = this.y[i];
    this.status[i] = 0; this.statusDur[i] = 0; this.statusV[i] = 0; this.owner[i] = -1;
    return i;
  }
  /** Has shot i already hit the body with handle h (slot = h mod 1024)? */
  hitBefore(i: number, h: number): boolean {
    const e = h & 1023;
    if (e >= this.words * 32) return false;
    return ((this.hitBits[i * this.words + (e >> 5)] >>> (e & 31)) & 1) === 1;
  }
  remember(i: number, h: number): void {
    const e = h & 1023;
    if (e >= this.words * 32) return;
    this.hitBits[i * this.words + (e >> 5)] |= 1 << (e & 31);
  }
  /** Shot i forgets every body (spawn, and the turn of a boomerang or a returning sword). */
  forgetHits(i: number): void {
    if (this.words) this.hitBits.fill(0, i * this.words, (i + 1) * this.words);
  }
  /** Every live shot forgets enemy slot e (a new body has taken it). */
  forgetBody(e: number): void {
    const W = this.words;
    if (e >= W * 32) return;
    const o = e >> 5, m = ~(1 << (e & 31));
    for (let j = 0; j < this.n; j++) if (this.alive[j]) this.hitBits[j * W + o] &= m;
  }
}
/** Shot flags. */
export const SF = {
  sword: 1, trail: 2, fire: 4, ghostX: 8, shred: 16, split: 32, charm: 64, peach: 128, blob: 256, note: 512,
  crescent: 1024, bigElite: 2048, followUp: 4096, splitSword: 8192, moonsoul: 16384, verse: 32768, returnHeal: 65536,
  projectile: 131072, pierceAll: 262144, stun: 524288, leaf: 1048576, echo: 2097152, reflected: 4194304, noDeflect: 8388608,
  burnHit: 16777216, gourd: 33554432,
} as const;

export class Drops extends Pool {
  readonly kind: Uint8Array;
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly worth: Float32Array; readonly age: Float32Array; readonly magnet: Uint8Array;
  /** Coin drops: index into the wave's coin plan. */
  readonly coin: Int16Array;
  /** m8 (PLAN E4): your own scattered 月华 (千金散尽), and the seconds before a piece can be pulled or taken. */
  readonly own: Uint8Array; readonly hold: Float32Array;
  constructor(cap: number) {
    super(cap);
    this.kind = new Uint8Array(cap);
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.vx = new Float32Array(cap); this.vy = new Float32Array(cap);
    this.worth = new Float32Array(cap); this.age = new Float32Array(cap); this.magnet = new Uint8Array(cap); this.coin = new Int16Array(cap);
    this.own = new Uint8Array(cap); this.hold = new Float32Array(cap);
  }
}

export class Summons extends Pool {
  readonly kind: Uint8Array;
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array; readonly face: Float32Array;
  readonly hp: Float32Array; readonly hpMax: Float32Array; readonly life: Float32Array; readonly life0: Float32Array;
  readonly cd: Float32Array; readonly atkT: Float32Array; readonly r: Float32Array;
  readonly dmg: Float32Array; readonly critP: Float32Array; readonly critM: Float32Array; readonly knock: Float32Array;
  readonly slot: Int16Array; readonly capped: Uint8Array; readonly target: Int32Array;
  readonly st: Uint8Array; readonly stT: Float32Array; readonly tx: Float32Array; readonly ty: Float32Array;
  readonly order: Float64Array; readonly dragon: Uint8Array; readonly tier: Uint8Array; readonly flash: Float32Array;
  readonly contactT: Float32Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.kind = new Uint8Array(cap);
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.face = F(); this.hp = F(); this.hpMax = F(); this.life = F(); this.life0 = F();
    this.cd = F(); this.atkT = F(); this.r = F(); this.dmg = F(); this.critP = F(); this.critM = F(); this.knock = F();
    this.slot = new Int16Array(cap); this.capped = new Uint8Array(cap); this.target = new Int32Array(cap);
    this.st = new Uint8Array(cap); this.stT = F(); this.tx = F(); this.ty = F(); this.order = new Float64Array(cap);
    this.dragon = new Uint8Array(cap); this.tier = new Uint8Array(cap); this.flash = F(); this.contactT = F();
  }
}

export class Stones extends Pool {
  readonly x: Float32Array; readonly y: Float32Array; readonly arm: Float32Array; readonly life: Float32Array;
  readonly white: Uint8Array; readonly slot: Int16Array; readonly order: Float64Array; readonly fuse: Float32Array;
  constructor(cap: number) {
    super(cap);
    this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.arm = new Float32Array(cap); this.life = new Float32Array(cap);
    this.white = new Uint8Array(cap); this.slot = new Int16Array(cap); this.order = new Float64Array(cap); this.fuse = new Float32Array(cap);
  }
}

export interface ZoneFn { (w: WorldApi, zone: number): void }
export class Zones extends Pool {
  readonly side: Uint8Array; readonly look: string[];
  readonly x: Float32Array; readonly y: Float32Array; readonly r: Float32Array; readonly life: Float32Array; readonly life0: Float32Array;
  /** Seconds since the zone opened, kept apart from `life` (a float32 life of 1e9 never counts down). */
  readonly age: Float64Array;
  readonly tick: Float32Array; readonly tickT: Float32Array; readonly fn: (ZoneFn | null)[];
  readonly slow: Float32Array; readonly dps: Float32Array; readonly undodge: Uint8Array; readonly follow: Uint8Array;
  /** Core zone code (web, spore, fire, flower, trail …) with its numbers. */
  readonly code: Uint8Array; readonly v: Float32Array; readonly gen: Uint32Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.side = new Uint8Array(cap); this.look = new Array(cap).fill('');
    this.x = F(); this.y = F(); this.r = F(); this.life = F(); this.life0 = F(); this.age = new Float64Array(cap); this.tick = F(); this.tickT = F();
    this.fn = new Array(cap).fill(null); this.slow = F(); this.dps = F(); this.undodge = new Uint8Array(cap); this.follow = new Uint8Array(cap);
    this.code = new Uint8Array(cap); this.v = F(); this.gen = new Uint32Array(cap);
  }
}

export interface TeleFn { (w: WorldApi): void }
export class Teles extends Pool {
  /** Shapes are reused objects, one per slot. */
  readonly shape: TeleShape[];
  readonly t: Float32Array; readonly dur: Float32Array; readonly fn: (TeleFn | null)[];
  readonly code: Uint8Array; readonly owner: Int32Array; readonly v: Float32Array; readonly gen: Uint32Array;
  constructor(cap: number) {
    super(cap);
    this.shape = [];
    for (let i = 0; i < cap; i++) this.shape.push({ kind: 'circle', x: 0, y: 0, r: 0 });
    this.t = new Float32Array(cap); this.dur = new Float32Array(cap); this.fn = new Array(cap).fill(null);
    this.code = new Uint8Array(cap); this.owner = new Int32Array(cap); this.v = new Float32Array(cap); this.gen = new Uint32Array(cap);
  }
}

export class Particles extends Pool {
  readonly kind: string[];
  readonly x: Float32Array; readonly y: Float32Array; readonly vx: Float32Array; readonly vy: Float32Array;
  readonly life: Float32Array; readonly life0: Float32Array; readonly r: Float32Array; readonly dir: Float32Array; readonly len: Float32Array;
  readonly a: Float32Array;
  constructor(cap: number) {
    super(cap);
    const F = () => new Float32Array(cap);
    this.kind = new Array(cap).fill('');
    this.x = F(); this.y = F(); this.vx = F(); this.vy = F(); this.life = F(); this.life0 = F(); this.r = F(); this.dir = F(); this.len = F(); this.a = F();
  }
}

export class Numbers extends Pool {
  readonly v: Float32Array; readonly x: Float32Array; readonly y: Float32Array; readonly t: Float32Array; readonly style: Uint8Array;
  /** Arc velocity (u/s), size by damage (1 = a typical hit), seconds alive in all, owner handle (−1). */
  readonly vx: Float32Array; readonly vy: Float32Array; readonly sz: Float32Array; readonly age: Float32Array; readonly owner: Int32Array;
  constructor(cap: number) {
    super(cap);
    this.v = new Float32Array(cap); this.x = new Float32Array(cap); this.y = new Float32Array(cap); this.t = new Float32Array(cap); this.style = new Uint8Array(cap);
    this.vx = new Float32Array(cap); this.vy = new Float32Array(cap); this.sz = new Float32Array(cap); this.age = new Float32Array(cap); this.owner = new Int32Array(cap);
  }
}

export interface TimerFn { (w: WorldApi): void }
export class Timers extends Pool {
  readonly t: Float32Array; readonly every: Float32Array; readonly fn: (TimerFn | null)[]; readonly gen: Uint32Array;
  constructor(cap: number) {
    super(cap);
    this.t = new Float32Array(cap); this.every = new Float32Array(cap); this.fn = new Array(cap).fill(null); this.gen = new Uint32Array(cap);
  }
}

// ═════════════════════════════════════════════ m8 · lane blocks (PLAN §3.5 U2): append-only, each lane under its own anchor
// ── m8:items ──
// ── m8:hidden ──
// ── m8:art ──
