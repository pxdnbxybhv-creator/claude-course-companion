// 水月幻镜 · the world: one wave's simulation in pooled typed arrays (GDD §24.3), the damage pipeline
// both ways (§4.2, §4.3), statuses (§4.4), drops and 蓄月 (§6), coins (§16.3), and the WorldApi
// façade engine/content codes against (API.md §5). DOM-free; engine/index.ts owns the canvas and loop.
import type { BossId, DropKind, EliteId, FxName, HazardId, ItemId, MonsterId, SummonKind, TreasureId, WeaponId } from '../ids';
import { BOSS_REG, named } from '../ids';
import type {
  ActiveMutator, ArenaGeom, Behaviour, Bilingual, Camera, CoinDrop, ContentRegistry, DamageSrc, DifficultyDef, EngineHooks,
  EngineSettings, EnemyFilter, EnemyView, GameEvent, HeartSource, HitPacket, HudState, MapDef, MirrorAudio, Painter, PlayerView,
  Quality, RunSave, RunStatKey, RunStats, SfxName, ShotSpec, SkillDef, SkillImpl, SkillRun, SpawnOpts, SpawnPlan, Stats,
  StatMods, StatusKind, TeleSpec, Vec, WaveResult, WaveSetup, WorldApi, ZoneSpec, DeathResult, ActorImpl, DownInfo,
} from '../types';
import {
  BOSSES, CLAMP, COMPANIONS, DIFFS, ELITES, ENDLESS_BOSS, F, HAZARDS, MAPS, MONSTERS, PASSIVES, SKILLS, STAT_IDS, TREASURES, WEAPONS,
} from '../data';
import {
  clamp, computeStats, dodgeCapOf, dodgeChance, dmgMul, dottingX, enemyArmorAdd, enemyHit, healMult, knockback, luckMult, maxHp,
  pickupRadius, playerHit, reachPct, regenPerSec, relicFor, xpNext, REVIVE, canRevive, moveSpeedOf, critOverflowOf,
} from '../logic/formulas';
import { moveCapOf } from '../logic/items';
import { arenaGeom, insideShape } from '../logic/arena';
import { rngFor, type Rng } from '../logic/rng';
import {
  Drops, EKind, Enemies, KIND_NAMES, Numbers, Particles, Shots, Stones, Summons, Teles, Timers, Zones, BURN_MAX, BLEED_MAX, SF, SMode,
} from './pools';
import { SpatialHash } from './hash';
import {
  CAPS, DK, ENEMY_SHOTS, DROPS_CAP, HF, PK, ROLE, SK, SRC, SRCI, STI, TAU, ZC, angDiff, segDist2, tagBits, TAG_BIT,
} from './consts';
import { hasDrunk, hitboxOf, liveStats, readMods, type EvBuff, type Live, type Mods } from './effects';
import { initEnemy, tickEnemies, onEnemyDeath, strikeTele } from './enemies';
import { fireWeapons, initWeapons, onWeaponKill, tickPlayerShots, tickSummons, tickStones, tickSwords, type WeaponSlot } from './weapons';
import { FC, Feel } from './feel';
import { DOWN_ANIM, reviveFx, reviveShimmer } from './down';
// m8 (PLAN E2, E6): the lanes' world hooks and the 技 verbs (stubs until ITEMS / HIDDEN fill them)
import { registerItemHooks } from './content/items';
import { registerHiddenHooks } from './content/hidden';
import { pressSkill, releaseSkill } from './verbs';
import { isMoonKind, isMoonWorth, moonDraws, moonKindOf, splitMoon } from './moon';

/** 'down': fallen with the revive on offer (破镜重圆): nothing steps until revive() or giveUp(). */
export type Phase = 'idle' | 'wave' | 'ending' | 'down' | 'dead';

interface Buff { key: string; stats: StatMods; t: number; moveX: number }
interface Running { b: Behaviour; s: unknown; failed: boolean }

/** Damage numbers: seconds shown after their last pop, and the fall of their arc (u/s²). */
const NUM_LIFE = 0.78;
const NUM_GRAVITY = 380;

/** A reusable scratch vector for queries that return a point. */
const V: Vec = { x: 0, y: 0 };
/** A push into a round obstacle keeps at least this share of its speed, turned along it (collidePoint). */
const SLIDE_KEEP = 0.8;

/**
 * The UI's hooks, each behind a guard: a throw in UI code is logged (at most once per hook per 5 s)
 * and never reaches the engine's error rules, so a broken HUD cannot void or settle a run.
 */
function guardHooks(h: EngineHooks): EngineHooks {
  const last: Record<string, number> = {};
  const report = (name: string, e: unknown) => {
    const now = Date.now();
    if (now - (last[name] ?? -1e9) < 5000) return;
    last[name] = now;
    console.error(`[mirror engine] the UI's ${name} hook threw`, e);
  };
  const wrap = <K extends keyof EngineHooks>(name: K): EngineHooks[K] => {
    const fn = h[name] as (...a: unknown[]) => void;
    return ((...a: unknown[]) => { try { fn.apply(h, a); } catch (e) { report(name, e); } }) as EngineHooks[K];
  };
  return {
    hud: wrap('hud'), levelUp: wrap('levelUp'), crate: wrap('crate'), coin: wrap('coin'),
    boss: wrap('boss'), waveEnd: wrap('waveEnd'), death: wrap('death'), error: wrap('error'),
  };
}

export interface WorldOpts {
  painter: Painter | null;
  audio: MirrorAudio | null;
  content: ContentRegistry;
  hooks: EngineHooks;
  settings: EngineSettings;
}

export class World implements WorldApi {
  // ── configuration
  run!: RunSave;
  setup!: WaveSetup;
  plan!: SpawnPlan;
  map!: MapDef;
  diff!: DifficultyDef;
  arena!: ArenaGeom;
  private arenaKey = '';
  quality: Quality;
  settings: EngineSettings;
  /** The UI's hooks; whatever is assigned is wrapped so a throw in UI code never reaches the error rules. */
  get hooks(): EngineHooks { return this._hooks; }
  set hooks(h: EngineHooks) {
    this._hooks = guardHooks(h);
    this.downedHook = typeof h.downed === 'function' ? h.downed.bind(h) : null;
  }
  private _hooks!: EngineHooks;
  /** The UI's optional `downed` hook, unguarded: a throw there gives up (never a stuck 'down'). */
  private downedHook: ((d: DownInfo) => void) | null = null;
  content: ContentRegistry;
  painter: Painter | null;
  audio: MirrorAudio | null;
  mods!: Mods;

  // ── time
  t = 0;
  /** The render clock (engine/index.ts LerpSet): `t` less the part of a step the drawn picture lags
   *  behind the simulation. Only drawing reads it (orbit angles); every rule reads `t`. */
  tDraw = 0;
  dt = 1 / 60;
  wave = 0;
  /** The beat ticked this step: the core's 2 Hz clock, or a boss's own tempo while one keeps it (夔). */
  beat = false;
  /** A boss keeps the beat (content reports each of its ticks through beatLatch; 夔 at 80 BPM). */
  beatOwn = false;
  beatLatch = false;
  /** Beats so far, and the count the HUD last saw (its ≈8 Hz push flags every beat once). */
  beatN = 0;
  private hudBeatN = 0;
  moonPhase = 0;
  rng: () => number = Math.random;
  erng!: Rng;
  phase: Phase = 'idle';
  /** Seconds into the wave; the wave's length (null: a boss wave). */
  tWave = 0;
  len: number | null = null;
  endingT = 0;
  /** The engine should pause itself (boss intro). */
  pauseRequest = false;
  /** ms of hitstop the loop should hold. */
  hitstopMs = 0;
  /** The current shake amplitude (CSS px; set by the feel layer each frame). */
  shakePx = 0;
  /** 打击感: hit reactions, spatter, hitstop budget, camera trauma, the impact sound bus. */
  feel!: Feel;
  /** Where the blow that is hurting you came from (a shot's tail); NaN when unknown. */
  hurtSrcX = NaN; hurtSrcY = NaN;
  lightR: number | null = null;
  degrade = 0;

  // ── pools
  E: Enemies;
  PS: Shots;
  ES: Shots;
  D: Drops;
  S: Summons;
  ST: Stones;
  Z: Zones;
  T: Teles;
  P: Particles;
  N: Numbers;
  TM: Timers;
  hash!: SpatialHash;
  /**
   * Scratch index buffers for hash queries. q0 and q1 are held by loops that strike, and a strike
   * can re-enter the world (kill handlers, affixes, actor deaths, a level-up's push ring): every
   * strike, kill and event runs one level deeper, and each level has its own pair, so a nested query
   * never overwrites the list an outer loop is still reading. q2 is for leaf queries that call
   * nothing back (nearest, strongest, countNear, query).
   */
  get q0(): Int32Array { return this.qs[this.qd * 2] ?? this.growQ(0); }
  get q1(): Int32Array { return this.qs[this.qd * 2 + 1] ?? this.growQ(1); }
  q2 = new Int32Array(512);
  private qs: Int32Array[] = [new Int32Array(512), new Int32Array(512)];
  /** Re-entry depth of strike / kill / emit. */
  qd = 0;
  private growQ(k: number): Int32Array {
    while (this.qs.length <= this.qd * 2 + 1) this.qs.push(new Int32Array(512));
    return this.qs[this.qd * 2 + k];
  }
  capEnemies: number;

  // ── the player
  px = 0; py = 0; pvx = 0; pvy = 0; face = 0; moving = false; stillFor = 0;
  hp = 1; hpMax = 1; hpBonus = 0; shieldV = 0; iframes = 0; invulnT = 0; untargT = 0; rootT = 0;
  pslowV = 0; pslowT = 0; pkx = 0; pky = 0; pkT = 0;
  dashX = 0; dashY = 0; dashV = 0; dashT = 0;
  leapFX = 0; leapFY = 0; leapTX = 0; leapTY = 0; leapT = 0; leapDur = 0;
  pr = 14;
  dotDps = new Float32Array(6); dotT = new Float32Array(6); dotAcc = 0;
  regenAcc = 0;
  blocks = 0;
  yanwangUsed = false;
  lifeUsed = false;
  lives = 0;
  once: string[] = [];
  drunk = 0; drunkIdle = 0; drunkOn = false; drunkCap = 100;
  lvl = 1; xpLive = 0; levels = 0;
  buffs: Buff[] = [];
  moveX = 0; moveY = 0; aimX = 0; aimY = 0; cursorX = -1; cursorY = -1; cursorT = 99;
  dodgeWin = 0;
  /** Per-second caps: lifesteal, crit heal, sword-return heal. */
  capWin = new Float32Array(4); capN = new Float32Array(4);
  cause = 'hazard';
  godmode = false;
  /** 破镜重圆: seconds spent down (sim steps while 'down' only advance this), and where you fell. */
  downAge = 0; downX = 0; downY = 0;
  /** The revive's shimmer: seconds left (drawn only; the invulnerability itself is invulnT). */
  reviveT = 0;
  /** The payload handed to `downed` (reused). */
  private readonly downInfo: DownInfo = { canRevive: true, price: REVIVE.price, wave: 0, cause: 'hazard' };

  // ── stats
  base!: Stats;
  stats!: Stats;
  live: Live = { waveTime: 0, hpFrac: 1, still: 0, swordsAir: 0, weapons: 0 };
  dodgeCap = 60;
  pickupR: number = F.pickupBase;
  moveSpd = 280;

  // ── weapons, swords, summons
  slots: WeaponSlot[] = [];
  /** Direction of the last attack (NO_DIR for none); 绕梁 and 水月镜 read it. */
  lastDir = 1e9;
  ambushN = 0;
  wanjianT = 0;
  captureT = 0;
  lingboT = 0;
  /** 攻击距离 % on every weapon this wave (龙渊剑 +20 a copy, 玉兔 −15). */
  reachPct = 0;
  sproutT = 0;
  dragonT = 0;
  stoneOrder = 0;
  stoneChain = 0;
  tombTouch = new Float32Array(400);
  idleTouch = new Float32Array(400);
  /** Scratch point for helpers (never kept). */
  pt2: Vec = { x: 0, y: 0 };
  /** The camera the renderer last used (cursor aim reads it). */
  cam: Camera = { x: 0, y: 0, scale: 1, w: 1, h: 1, dpr: 1 };
  swordsAir = 0;
  summonsAlive = 0;
  summonOrder = 0;
  blades = 0;
  canjian = 0;
  swordKills = 0;
  idleSwords = 0;

  // ── the wave's tallies
  moonGot = 0; xpGot = 0; store = 0; storeUsed = 0; crates = 0; killCrates = 0;
  hearts: HeartSource[] = [];
  sleeve: CoinDrop[] = [];
  coinUsed: boolean[] = [];
  kills = 0; eliteKills = 0;
  rs: RunStats = {};
  killsBy: Record<string, number> = {};
  byWeapon: Partial<Record<WeaponId, { dmg: number; kills: number }>> = {};
  bossesKilled: (BossId | 'twins' | 'mirrorself')[] = [];
  /** 镜宝 earned this wave (one per boss body felled); endWave adds them to run.items. */
  relicsGot: ('wangchen' | 'longyuan')[] = [];
  /** When the last 镜宝 title went up (world clock), so the wave's 「破」 does not print over it. */
  relicTitleAt = -9;
  bossH: number[] = [];
  bossesSpawned = false;
  moonHeld = 0;

  // ── spawning
  gi = 0; ei = 0; ti = 0;
  gongAt = 0;

  // ── content
  running: Running[] = [];
  skillDef: SkillDef | null = null;
  skillImpl: SkillImpl | null = null;
  skillRun: SkillRun | null = null;
  skillCd = 0;
  skillCdMax = 1;
  skillPreview: Vec | null = null;

  // ── recovery
  cur = -1;
  curWhat: 'enemy' | 'summon' | 'behaviour' | 'skill' | 'none' = 'none';

  // ── HUD
  hud: HudState = {
    hp: 0, hpMax: 0, shield: 0, moon: 0, sleeve: 0, showSleeve: false, level: 1, xp: 0, xpNext: 16, wave: 0, time: null, boss: null,
    skillCd: 0, skillActive: false, drunk: null, moonPhase: null, lives: null, curse: 0, lowHp: false, beat: false, dark: false, fps: 60,
  };
  hudT = 0;
  fps = 60;
  /** Titles for the renderer: text, where, time left. */
  titles: { text: Bilingual; where: 'edge' | 'centre'; t: number }[] = [];
  titleGate = 0;
  /** simMs: ms per step; drawMs/lastDraw: the frame interval (ms, EMA/last); canvasMs: JS time of the draw calls. */
  perf = { steps: 0, simMs: 0, drawMs: 0, lastSim: 0, lastDraw: 0, canvasMs: 0 };

  /** Reused view objects handed to content. */
  private evs: GameEvent[] = [];
  private eview: EnemyViewImpl;
  player: PlayerView;
  lastCrit = false;
  /** Crits dealt so far (a weapon checks whether any hit of one attack crit). */
  critN = 0;

  constructor(o: WorldOpts) {
    this.settings = o.settings;
    this.quality = o.settings.quality;
    this.hooks = o.hooks;
    this.content = o.content;
    this.painter = o.painter;
    this.audio = o.audio;
    const caps = CAPS[this.quality];
    this.capEnemies = caps.enemies;
    this.E = new Enemies(400);
    this.PS = new Shots(caps.pshots, this.E.cap);
    this.ES = new Shots(ENEMY_SHOTS);
    this.D = new Drops(DROPS_CAP);
    this.S = new Summons(40);
    this.ST = new Stones(16);
    this.Z = new Zones(96);
    this.T = new Teles(128);
    this.P = new Particles(caps.particles);
    this.N = new Numbers(96);
    this.TM = new Timers(96);
    this.eview = new EnemyViewImpl(this);
    this.feel = new Feel(this);
    const w = this;
    this.player = {
      get hp() { return w.hp; }, get hpMax() { return w.hpMax; }, get r() { return w.pr; },
      get x() { return w.px; }, get y() { return w.py; }, get vx() { return w.pvx; }, get vy() { return w.pvy; },
      get face() { return w.face; }, get moving() { return w.moving; }, get stillFor() { return w.stillFor; },
      get invuln() { return Math.max(w.invulnT, w.iframes); }, get untargetable() { return w.untargT; },
    };
  }

  // ═══════════════════════════════════════════════════════════ wave lifecycle

  /** Set up wave `setup.wave` with this run state (a replay is the same call). */
  begin(run: RunSave, setup: WaveSetup): void {
    this.run = run;
    this.setup = setup;
    this.plan = setup.plan;
    this.lastResult = null;
    this.wave = setup.wave;
    this.map = MAPS[run.map];
    this.diff = DIFFS[run.diff];
    const key = run.map + '|' + run.seed;
    if (key !== this.arenaKey) {
      this.arena = arenaGeom(run.map, run.seed);
      this.arenaKey = key;
      this.hash = new SpatialHash(this.arena.minX, this.arena.minY, this.arena.maxX, this.arena.maxY, this.E.cap);
    }
    this.rng = rngFor(run.seed, this.wave, 'content');
    this.erng = rngFor(run.seed, this.wave, 'engine');
    for (const p of [this.E, this.PS, this.ES, this.D, this.S, this.ST, this.Z, this.T, this.P, this.N, this.TM]) p.clear();
    this.t = 0; this.tWave = 0; this.len = setup.plan.len; this.endingT = 0; this.hitstopMs = 0; this.shakePx = 0; this.lightR = null;
    this.beat = false; this.beatOwn = false; this.beatLatch = false; this.beatN = 0; this.hudBeatN = 0;
    this.feel.begin();
    this.pauseRequest = false; this.titles.length = 0;
    this.base = { ...setup.stats };
    this.stats = { ...setup.stats };
    this.reachPct = reachPct(run);
    this.mods = readMods(run);
    // m8 画地为牢: the walking-speed cap (× F.baseSpeed; Infinity = none) that moveSpeedOf applies
    this.moveCap = moveCapOf(run);
    // the player: full 气血 at every wave start (GDD §3 step 11)
    this.pr = hitboxOf(run);
    // you enter at the centre (广寒: south of the 桂树, 200 u clear of it — 0.7 s of walking up; it used
    // to stand 56 u in front of you, so walking up stopped dead after 0.2 s)
    this.px = 0; this.py = 0;
    for (const o of this.arena.obstacles) if (Math.hypot(o.x, o.y) < o.r + this.pr) this.py = o.y + o.r + this.pr + 200;
    this.pvx = this.pvy = 0; this.face = -Math.PI / 2; this.moving = false; this.stillFor = 0;
    this.hpBonus = 0;
    this.hpMax = maxHp(this.base);
    this.hp = this.hpMax;
    this.shieldV = 0; this.iframes = 0; this.invulnT = 0; this.untargT = 0; this.rootT = 0; this.pslowV = this.pslowT = 0; this.pkT = 0;
    this.dashT = 0; this.leapT = 0; this.leapDur = 0; this.dotDps.fill(0); this.dotT.fill(0); this.dotAcc = 0; this.regenAcc = 0;
    this.blocks = this.mods.blocks; this.yanwangUsed = false; this.lifeUsed = false; this.lives = run.lives; this.once = run.once.slice();
    this.downAge = 0; this.reviveT = 0;
    this.drunkOn = hasDrunk(run);
    this.drunkCap = this.mods.special.jiangjinjiu ? this.mods.special.jiangjinjiu.cap ?? 200 : F.drunk.cap;
    this.drunk = this.drunkOn ? clamp(run.drunk, 0, this.drunkCap) : 0; this.drunkIdle = 0;
    this.lvl = run.lvl; this.xpLive = run.xp; this.levels = 0;
    this.buffs.length = 0; this.dodgeWin = 0; this.capWin.fill(0); this.capN.fill(0); this.cause = 'hazard';
    this.dodgeCap = dodgeCapOf(run);
    // tallies
    this.moonGot = 0; this.xpGot = 0; this.store = run.store; this.storeUsed = 0; this.crates = 0; this.killCrates = 0;
    this.hearts = []; this.sleeve = []; this.coinUsed = setup.coins.map(() => false);
    this.kills = 0; this.eliteKills = 0; this.rs = {}; this.killsBy = {}; this.byWeapon = {}; this.bossesKilled = []; this.relicsGot = []; this.relicTitleAt = -9; this.bossH = [];
    this.bossesSpawned = false; this.moonHeld = run.moon;
    this.gi = 0; this.ei = 0; this.ti = 0; this.gongAt = 0;
    this.swordsAir = 0; this.summonsAlive = 0; this.summonOrder = 0; this.swordKills = 0; this.canjian = 0;
    // 嫦娥's cycle starts at tonight's real phase (full on the real 满月 day)
    this.moonPhase = run.char === 'change'
      ? (setup.sky.fullMoonDay ? 0 : Math.round(((setup.sky.lunation + 0.5) % 1) * 8) % 8)
      : 0;
    this.moonT0 = this.moonPhase * (PASSIVES.yinqing.p.cycle / 8);
    this.bossBeat = !!setup.plan.boss?.ids.includes('kui');
    this.recomputeStats();
    initWeapons(this);
    // the 镜技
    const C = COMPANIONS[run.char];
    this.skillDef = SKILLS[C.skill] ?? null;
    this.skillImpl = (this.content.skills[C.skill] as SkillImpl | undefined) ?? null;
    this.skillRun = null;
    this.skillCdMax = this.skillDef?.cd ?? 10;
    this.skillCd = 0;
    // m8 (PLAN E2–E4, E7): the per-wave seams start empty, then the held items and the hidden companions register theirs
    this.guardHook = null; this.hurtScalers.length = 0; this.afterHurt.length = 0; this.onStream = null; this.playerHooks.length = 0;
    this.teleOwner = -1; this.cdX = 1; this.ownLost = 0;
    registerItemHooks(this);
    registerHiddenHooks(this);
    // content behaviours: the passive, the map's hazards, 镜蚀, 节气
    this.running.length = 0;
    this.startBehaviour(this.content.passives[C.passive], undefined);
    // m8 (PLAN E5): one Behaviour per held item that has one (engine/content/items.ts), arg = the count held
    const IB = this.content.items;
    if (IB) for (const id in run.items) { const n = run.items[id as ItemId] ?? 0; if (n > 0) this.startBehaviour(IB[id as ItemId], n); }
    for (const hz of this.map.hazards) {
      const def = this.hazardFrom(hz);
      if (def <= this.wave) this.startBehaviour(this.content.hazards[hz], undefined);
    }
    for (const m of setup.mutators as ActiveMutator[]) this.startBehaviour(this.content.mutators[m.id], m.x);
    if (setup.term) this.startBehaviour(this.content.terms[setup.term], undefined);
    // item familiars and the wave-start effects
    if (this.mods.demon > 0) this.spawnDemon();
    this.phase = 'wave';
    this.hudT = 0;
    this.pushHud(true);
  }
  private moonT0 = 0;

  private hazardFrom(id: HazardId): number { return HAZARDS[id]?.from ?? 1; }

  /** Run an outside Behaviour for the rest of this wave (the tutorial's wave scripts, the first-time-tip
   *  watcher). Cleared at the wave end like content behaviours. Call after engine.start(). */
  attach(b: Behaviour, arg?: number): void { this.startBehaviour(b, arg); }

  private startBehaviour(b: Behaviour | undefined, arg: number | undefined): void {
    if (!b) return;
    const r: Running = { b, s: undefined, failed: false };
    this.running.push(r);
    this.curWhat = 'behaviour';
    try { r.s = b.start ? b.start(this, arg) : undefined; } catch (e) { r.failed = true; this.hooks.error(e, false); }
    this.curWhat = 'none';
  }

  // ═══════════════════════════════════════════════════════════ the step

  /** One fixed 60 Hz step. */
  step(dt: number): void {
    // down: the world holds still; only the fall's clock runs (the renderer reads it)
    if (this.phase === 'down') { this.downAge += dt; return; }
    if (this.phase !== 'wave' && this.phase !== 'ending') return;
    this.qd = 0;
    this.dt = dt;
    this.t += dt;
    const beatBefore = Math.floor((this.t - dt) * 2);
    // while a boss keeps the beat, the core's follows the ticks it reported last step
    this.beat = this.beatOwn ? this.beatLatch : Math.floor(this.t * 2) !== beatBefore;
    this.beatLatch = false;
    if (this.beat) this.beatN++;
    if (this.run.char === 'change') this.moonPhase = Math.floor(((this.t + this.moonT0) / (PASSIVES.yinqing.p.cycle / 8))) % 8;
    if (this.phase === 'ending') { this.stepEnding(dt); this.feel.step(dt); return; }
    this.tWave += dt;
    this.live.waveTime = this.tWave;
    // timers and content
    this.tickTimers(dt);
    for (const r of this.running) {
      if (r.failed || !r.b.tick) continue;
      this.curWhat = 'behaviour';
      try { r.b.tick(this, r.s, dt); } catch (e) { r.failed = true; this.curWhat = 'none'; this.hooks.error(e, false); }
    }
    this.curWhat = 'none';
    // (a boss that keeps the beat sounds its own tick)
    if (this.beat && !this.beatOwn && (this.run.char === 'musician' || this.bossBeat)) this.sfx('beatTick');
    this.tickSkill(dt);
    this.tickPlayer(dt);
    this.recomputeStats();
    this.spawnTick();
    this.hash.build(this.E.n, this.E.alive, this.E.x, this.E.y, this.E.hidden);
    tickEnemies(this, dt);
    fireWeapons(this, dt);
    tickPlayerShots(this, dt);
    this.tickEnemyShots(dt);
    tickSummons(this, dt);
    tickStones(this, dt);
    tickSwords(this, dt);
    this.tickZones(dt);
    this.tickTeles(dt);
    this.tickDrops(dt);
    this.tickParticles(dt);
    this.tickNumbers(dt);
    this.tickVitals(dt);
    this.feel.step(dt);
    this.checkWaveEnd();
    this.perf.steps++;
    this.hudT -= dt;
    if (this.hudT <= 0) { this.hudT = 0.125; this.pushHud(false); }
  }
  bossBeat = false;

  private tickTimers(dt: number): void {
    const TM = this.TM;
    for (let i = 0; i < TM.n; i++) {
      if (!TM.alive[i]) continue;
      TM.t[i] -= dt;
      if (TM.t[i] > 0) continue;
      const fn = TM.fn[i];
      if (TM.every[i] > 0) TM.t[i] += TM.every[i]; else { TM.release(i); TM.fn[i] = null; }
      if (fn) {
        this.curWhat = 'behaviour';
        try { fn(this); } catch (e) { TM.release(i); TM.fn[i] = null; this.hooks.error(e, false); }
        this.curWhat = 'none';
      }
    }
  }

  // ── the 镜技
  private tickSkill(dt: number): void {
    if (this.skillRun) {
      this.curWhat = 'skill';
      let go = false;
      try { go = this.skillRun.tick(this, dt); } catch (e) { go = false; this.hooks.error(e, false); }
      this.curWhat = 'none';
      if (!go) {
        try { this.skillRun.end?.(this); } catch { /* ignore */ }
        this.skillRun = null;
        // m8:hidden: a run may set its own next cooldown (越女's chained guards, 山鬼's cooldown from the bind)
        this.skillCd = (this.cdNext >= 0 ? this.cdNext : this.skillCdMax) * this.cdX;
        this.cdNext = -1;
      }
    } else if (this.skillCd > 0) this.skillCd = Math.max(0, this.skillCd - dt);
  }

  /** Cast the 镜技 toward a world point (null: auto-target). m8: `t` is the press's world time (engine/verbs.ts). */
  castSkill(at: Vec | null, dir: Vec | null, t = this.t): boolean {
    // m8:hidden: a press while a 'recast' run lives goes to its recast (山鬼's snap; hidden.md §2.5)
    if (this.phase === 'wave' && this.skillRun?.recast) {
      this.curWhat = 'skill';
      try { this.skillRun.recast(this, t, dir); } catch (e) { this.hooks.error(e, false); }
      this.curWhat = 'none';
      return true;
    }
    if (this.phase !== 'wave' || this.skillRun || this.skillCd > 0 || !this.skillDef || !this.skillImpl) return false;
    const def = this.skillDef;
    let target: Vec | null = at;
    this.castT = t; this.castAimed = at !== null; this.cdNext = -1;
    this.curWhat = 'skill';
    try {
      if (!target) target = this.skillImpl.target(this, def);
      const aim = target ?? { x: this.px + Math.cos(this.face) * 100, y: this.py + Math.sin(this.face) * 100 };
      let d = dir;
      if (!d) {
        const mv = Math.hypot(this.moveX, this.moveY);
        d = mv > 0.1 ? { x: this.moveX / mv, y: this.moveY / mv } : { x: Math.cos(this.face), y: Math.sin(this.face) };
      }
      this.skillRun = this.skillImpl.cast(this, def, { x: aim.x, y: aim.y }, d);
      this.emit('cast', -1, 0, false, 'skill', this.px, this.py, -1);
      // m8:hidden: a 'hold' skill cast in one call (engine.skill(), the bot, the tutorial) is a press and an
      // instant release: 后羿's tap shot (a zero dir = aim at the release; engine/verbs.ts)
      if (!this.verbPress && def.input === 'hold' && this.skillRun?.release) this.skillRun.release(this, 0, this.castAimed ? d : { x: 0, y: 0 });
    } catch (e) {
      this.skillRun = null;
      this.hooks.error(e, false);
    }
    this.curWhat = 'none';
    return !!this.skillRun;
  }

  // ── the player
  private tickPlayer(dt: number): void {
    this.iframes = Math.max(0, this.iframes - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    if (this.reviveT > 0) { this.reviveT = Math.max(0, this.reviveT - dt); reviveShimmer(this, dt); }
    this.untargT = Math.max(0, this.untargT - dt);
    this.rootT = Math.max(0, this.rootT - dt);
    this.dodgeWin = Math.max(0, this.dodgeWin - dt);
    this.cursorT += dt;
    if (this.pslowT > 0) { this.pslowT -= dt; if (this.pslowT <= 0) this.pslowV = 0; }
    for (let i = this.buffs.length - 1; i >= 0; i--) { const b = this.buffs[i]; b.t -= dt; if (b.t <= 0) this.buffs.splice(i, 1); }
    let moveMul = 1;
    for (const b of this.buffs) moveMul *= b.moveX;
    const oldX = this.px, oldY = this.py;
    if (this.leapT > 0) {
      this.leapT -= dt;
      const k = 1 - Math.max(0, this.leapT) / this.leapDur;
      this.px = this.leapFX + (this.leapTX - this.leapFX) * k;
      this.py = this.leapFY + (this.leapTY - this.leapFY) * k;
    } else if (this.dashT > 0) {
      this.dashT -= dt;
      this.px += this.dashX * this.dashV * dt;
      this.py += this.dashY * this.dashV * dt;
    } else {
      const mx = this.moveX, my = this.moveY;
      const m = Math.hypot(mx, my);
      const vmax = this.moveSpd * moveMul * (1 - this.pslowV) * (this.rootT > 0 ? 0 : 1);
      const tx = m > 0.05 ? (mx / Math.max(1, m)) * vmax : 0, ty = m > 0.05 ? (my / Math.max(1, m)) * vmax : 0;
      // 0.06 s from standing to full speed, 0.05 s to stop, no drift (GDD §20)
      const rate = (m > 0.05 ? vmax / 0.06 : this.moveSpd / 0.05) * dt;
      const dvx = tx - this.pvx, dvy = ty - this.pvy, dv = Math.hypot(dvx, dvy);
      if (dv <= rate) { this.pvx = tx; this.pvy = ty; } else { this.pvx += (dvx / dv) * rate; this.pvy += (dvy / dv) * rate; }
      if (this.pkT > 0) { this.pkT -= dt; this.px += this.pkx * dt; this.py += this.pky * dt; }
      this.px += this.pvx * dt;
      this.py += this.pvy * dt;
      if (m > 0.05) this.face = Math.atan2(my, mx);
    }
    this.collidePoint(true, oldX, oldY);
    const moved = Math.hypot(this.px - oldX, this.py - oldY);
    this.moving = moved > 0.5 * dt * 60 * 0.05;
    // m8 (I2): starting to move after standing still is the `go` event (动如脱兔)
    if (this.moving) { if (this.stillFor > 0 && this.mods.evBuffs.length) this.itemBuffs('onGo', -1, this.stillFor); this.stillFor = 0; } else this.stillFor += dt;
    this.live.still = this.stillFor;
  }

  /** Keep the player inside the arena and out of obstacles. (ox, oy): where this step's move started.
   *  A push into a round obstacle turns along it and keeps ≥ SLIDE_KEEP of its speed (a straight push
   *  has no sideways part, so it used to stop dead: 广寒's 桂树 from any side); it slides toward the side
   *  the push leans to (+x when dead on). */
  private collidePoint(player: boolean, ox = this.px, oy = this.py): void {
    const r = this.pr;
    for (const o of this.arena.obstacles) {
      const dx = this.px - o.x, dy = this.py - o.y, d = Math.hypot(dx, dy), m = o.r + r;
      if (d < m && d > 1e-6) {
        let nx = dx / d, ny = dy / d;
        const mvx = this.px - ox, mvy = this.py - oy, mv = Math.hypot(mvx, mvy);
        if (player && mv > 1e-6 && mvx * nx + mvy * ny < 0) {
          // the move's part along the tangent t = (−ny, nx); what the push-out alone would slide
          const tl = -mvx * ny + mvy * nx, got = Math.abs(tl), want = SLIDE_KEEP * mv;
          if (got < want) {
            const sgn = got > 1e-6 * mv ? Math.sign(tl) : ny !== 0 ? Math.sign(-ny) : Math.sign(nx) || 1;
            const a = (sgn * (want - got)) / m, c = Math.cos(a), s = Math.sin(a);
            const rx = nx * c - ny * s, ry = nx * s + ny * c;
            nx = rx; ny = ry;
          }
        }
        this.px = o.x + nx * m; this.py = o.y + ny * m;
      }
      else if (d <= 1e-6) this.px = o.x + m;
    }
    this.clampXY(r);
  }
  /** Clamp (px, py) or a body into the arena shape. */
  private clampXY(r: number): void {
    V.x = this.px; V.y = this.py;
    this.clampToArena(V, r);
    this.px = V.x; this.py = V.y;
  }

  recomputeStats(): void {
    const lv = this.live;
    lv.hpFrac = this.hpMax > 0 ? this.hp / this.hpMax : 1;
    lv.swordsAir = this.swordsAir;
    lv.weapons = this.run.weapons.length;
    // m8 (I1): the readings of the live converts that need the world (foes near you, unpulled 月华 near you)
    if (this.mods.conv.length) this.itemConvReadings();
    liveStats(this.stats, this.base, this.mods, lv, {
      moonHeld: this.moonHeld, summons: this.summonsAlive, drunk: this.drunk, drunkActive: this.drunkOn,
      drunkFull: this.drunkOn && this.drunk >= 100, moonPhase: this.moonPhase, change: this.run.char === 'change',
      buffs: this.buffs, solo: this.run.weapons.length, dugu: !!this.mods.special.dugu,
    });
    const hm = Math.max(1, Math.round(this.stats.hp) + this.hpBonus);
    if (hm !== this.hpMax) {
      if (hm > this.hpMax) this.hp += hm - this.hpMax;
      this.hpMax = hm;
      if (this.hp > hm) this.hp = hm;
    }
    this.pickupR = pickupRadius(this.stats);
    this.moveSpd = moveSpeedOf(this.stats, this.moveCap);
  }

  private tickVitals(dt: number): void {
    // regen (0.1 × 回气 per s, fractional), shield decay (玉兔 2%/s), player DoT, 醉 drain
    const rps = regenPerSec(this.stats);
    if (rps > 0) {
      this.regenAcc += rps * dt;
      if (this.regenAcc >= 1) { const n = Math.floor(this.regenAcc); this.regenAcc -= n; this.healRaw(n, false); }
    }
    if (this.shieldV > 0 && this.run.char === 'rabbit') this.shieldV = Math.max(0, this.shieldV - this.hpMax * PASSIVES.yaoxiang.p.decay * dt);
    let dps = 0;
    for (let k = 0; k < 6; k++) if (this.dotT[k] > 0) { this.dotT[k] -= dt; dps += this.dotDps[k]; }
    if (dps > 0) {
      this.dotAcc += dps * dt;
      if (this.dotAcc >= 1) { const n = Math.floor(this.dotAcc); this.dotAcc -= n; this.hurt(n, { undodgeable: true, noArmor: true, src: this.cause, dot: true } as never); }
    }
    if (this.drunkOn) {
      this.drunkIdle += dt;
      if (this.drunkIdle > F.drunk.drainAfter && this.drunk > 0) {
        let drain = F.drunk.drain * (this.mods.flags.has('drainHalf') ? 0.5 : 1);
        if (this.mods.special.jiangjinjiu) drain *= this.mods.special.jiangjinjiu.drain ?? 2;
        this.drunk = Math.max(0, this.drunk - drain * dt);
      }
      this.maxStat('peakDrunk', this.drunk);
    }
    for (let k = 0; k < 4; k++) if (this.t - this.capWin[k] >= 1) { this.capWin[k] = this.t; this.capN[k] = 0; }
    for (let i = this.titles.length - 1; i >= 0; i--) { this.titles[i].t -= dt; if (this.titles[i].t <= 0) this.titles.splice(i, 1); }
    this.titleGate = Math.max(0, this.titleGate - dt);
  }

  // ═══════════════════════════════════════════════════════════ spawning

  private spawnTick(): void {
    const plan = this.plan;
    const tw = this.tWave;
    // bosses at the very start (the intro card pauses the engine)
    if (plan.boss && !this.bossesSpawned) {
      this.bossesSpawned = true;
      const ids = plan.boss.ids;
      const n = ids.length;
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (k - (n - 1) / 2) * 1.2;
        const h = this.spawnBoss(ids[k], Math.cos(a) * 320, Math.sin(a) * 320, plan.boss.hp);
        if (h >= 0) this.bossH.push(h);
      }
      const introId = this.wave > 30 ? (ids[0] === 'mirrorself' ? 'mirrorself' : 'twins') : (ids[0] as BossId);
      this.hooks.boss({ kind: 'intro', id: introId, ids: ids.filter((x): x is BossId => x !== 'mirrorself') });
      this.pauseRequest = true;
      this.sfx('bossDrum');
    }
    while (this.gi < plan.groups.length && plan.groups[this.gi].t <= tw) {
      const g = plan.groups[this.gi++];
      this.spawnGroup(g.id, g.n);
    }
    while (this.ei < plan.elites.length && plan.elites[this.ei].t <= tw) {
      const e = plan.elites[this.ei++];
      const h = this.spawn(e.id, null, null, { bloom: true, affixes: e.affixes });
      if (h >= 0) { this.sfx('bossDrum'); }
    }
    while (this.ti < plan.treasures.length && plan.treasures[this.ti].t <= tw) {
      const tr = plan.treasures[this.ti++];
      this.spawn(tr.id, null, null, { bloom: true, capped: false });
    }
    // the gong counts 3-2-1 before a timed wave ends
    if (this.len !== null) {
      const left = this.len - tw;
      if (left <= 3 && this.gongAt < 3 && left > 0 && left <= 3 - this.gongAt) { this.gongAt++; this.sfx('gong'); }
    }
  }

  /** Where a pack spawns: ≥ 260 u from you, preferring the far 60% of the arena. */
  private spawnPoint(out: Vec, r: number): void {
    let bx = 0, by = 0, bd = -1;
    const A = this.arena;
    let got = 0;
    for (let tries = 0; tries < 24 && got < 5; tries++) {
      const x = A.minX + (A.maxX - A.minX) * this.erng(), y = A.minY + (A.maxY - A.minY) * this.erng();
      if (!insideShape(A.shape, x, y, r + 30) || this.inObstacle(x, y, r + 8)) continue;
      const d = Math.hypot(x - this.px, y - this.py);
      if (d < F.spawnMinDist) continue;
      got++;
      // prefer the farther candidates: a random pick weighted toward distance
      const score = d * (0.6 + 0.8 * this.erng());
      if (score > bd) { bd = score; bx = x; by = y; }
    }
    if (bd < 0) { const a = this.erng() * TAU; bx = this.px + Math.cos(a) * 300; by = this.py + Math.sin(a) * 300; V.x = bx; V.y = by; this.clampToArena(V, r + 20); bx = V.x; by = V.y; }
    out.x = bx; out.y = by;
  }
  inObstacle(x: number, y: number, r: number): boolean {
    for (const o of this.arena.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + r) return true;
    return false;
  }

  private pt: Vec = { x: 0, y: 0 };
  private spawnGroup(id: MonsterId, n: number): void {
    const def = MONSTERS[id];
    const pt = this.pt;
    const packs = Math.max(1, Math.ceil(n / Math.max(1, def.pack)));
    let left = n;
    for (let p = 0; p < packs && left > 0; p++) {
      this.spawnPoint(pt, def.r ?? 14);
      const cx = pt.x, cy = pt.y;
      const m = Math.min(left, def.pack);
      const partnerStart = this.E.n;
      void partnerStart;
      let prevH = -1;
      for (let k = 0; k < m; k++) {
        let x = cx, y = cy;
        if (def.role === 'formation') {
          // a shield line, perpendicular to you
          const a = Math.atan2(this.py - cy, this.px - cx) + Math.PI / 2;
          const off = (k - (m - 1) / 2) * (def.p.gap ?? 34);
          x = cx + Math.cos(a) * off; y = cy + Math.sin(a) * off;
        } else if (def.role === 'laser') {
          const a = this.erng() * TAU;
          const off = (k === 0 ? -0.5 : 0.5) * (def.p.apart ?? 300);
          x = cx + Math.cos(a) * off; y = cy + Math.sin(a) * off;
        } else if (m > 1) {
          const a = (k / m) * TAU + this.erng() * 0.6, d = 18 + 14 * Math.sqrt(k);
          x = cx + Math.cos(a) * d; y = cy + Math.sin(a) * d;
        }
        const h = this.spawn(id, x, y, { bloom: true, hpX: this.plan.kind === 'horde' ? F.hordeHp : 1 });
        if (h >= 0 && def.role === 'laser' && prevH >= 0) {
          const a = this.E.slotOf(prevH), b = this.E.slotOf(h);
          if (a >= 0 && b >= 0) { this.E.partner[a] = b; this.E.partner[b] = a; }
        }
        prevH = h;
        left--;
      }
    }
  }

  /** Living enemies that count toward the alive cap. */
  cappedAlive(): number {
    let c = 0;
    const E = this.E;
    for (let i = 0; i < E.n; i++) if (E.alive[i] && E.capped[i]) c++;
    return c;
  }

  /** 重墨: a spawn over the cap feeds 80% of its HP and its drops to a random living non-elite. */
  private overflow(hp: number, cost: number): boolean {
    const E = this.E;
    let pick = -1, seen = 0;
    for (let i = 0; i < E.n; i++) {
      // the target gets all the drops (§5.1), so never a body that drops nothing or fights for you
      if (!E.alive[i] || E.kind[i] !== EKind.Mon || E.hidden[i] || E.noDrops[i] || E.charmT[i] > 0) continue;
      seen++;
      if (this.erng() * seen < 1) pick = i;
    }
    if (pick < 0) {
      // nothing can carry it: the 月华 goes to 蓄月 rather than vanishing
      if (cost > 0) this.store += cost * (1 + F.curseMoon * Math.max(0, this.stats.curse) + this.mods.moonPct / 100);
      return false;
    }
    // ⚖5 ceiling: a fed body never passes F.heavyInk.hpCap × its own HP (the 月华 and drops still move)
    const mon = MONSTERS[E.id[pick] as MonsterId];
    const lim = (mon ? mon.hp * this.plan.hpX : E.hpMax[pick]) * F.heavyInk.hpCap;
    const add = Math.max(0, Math.min(hp * F.heavyInk.hpFrac, lim - E.hpMax[pick]));
    E.hp[pick] += add;
    E.hpMax[pick] += add;
    E.cost[pick] += cost;
    E.heavy[pick] = Math.min(F.heavyInk.max, E.heavy[pick] * (1 + F.heavyInk.grow));
    E.r[pick] = E.r0[pick] * E.heavy[pick];
    return true;
  }

  // ═══════════════════════════════════════════════════════════ WorldApi: bodies

  spawn(id: MonsterId | EliteId | TreasureId, x: number | null, y: number | null, o: SpawnOpts = {}): number {
    const mon = (MONSTERS as Record<string, typeof MONSTERS[MonsterId]>)[id];
    const eli = (ELITES as Record<string, typeof ELITES[EliteId]>)[id];
    const tre = (TREASURES as Record<string, typeof TREASURES[TreasureId]>)[id];
    if (!mon && !eli && !tre) return -1;
    const capped = o.capped ?? !!mon;
    const hpX = this.plan.hpX * (o.hpX ?? 1);
    if (capped && this.cappedAlive() >= this.capEnemies) {
      const hp0 = (mon?.hp ?? eli?.hp ?? 10) * hpX;
      this.overflow(hp0, o.noDrops ? 0 : mon?.cost ?? 0);
      return -1;
    }
    const E = this.E;
    const i = E.spawnSlot();
    if (i < 0) return -1;
    this.PS.forgetBody(i);
    E.capped[i] = capped ? 1 : 0;
    if (x === null || y === null) {
      this.spawnPoint(this.pt, mon?.r ?? eli?.r ?? 14);
      x = this.pt.x; y = this.pt.y;
    }
    E.x[i] = x; E.y[i] = y;
    E.id[i] = id;
    E.noDrops[i] = o.noDrops ? 1 : 0;
    const armorAdd = enemyArmorAdd(this.run, this.wave);
    if (mon) {
      E.kind[i] = EKind.Mon;
      E.atlas[i] = `mon:${id}` as never;
      E.role[i] = ROLE[mon.role];
      E.r0[i] = mon.r ?? 14; E.r[i] = E.r0[i];
      E.hp[i] = E.hpMax[i] = Math.max(1, mon.hp * hpX);
      E.dmg[i] = mon.dmg * this.plan.dmgX;
      E.speed[i] = mon.speed * this.plan.spdX;
      E.armor[i] = mon.armor + armorAdd;
      E.resist[i] = mon.resist;
      E.cost[i] = mon.cost;
      E.tags[i] = tagBits(mon.tags);
    } else if (eli) {
      E.kind[i] = EKind.Elite;
      E.atlas[i] = `elite:${id}` as never;
      E.role[i] = ROLE.tank;
      E.r0[i] = eli.r ?? 24; E.r[i] = E.r0[i];
      E.hp[i] = E.hpMax[i] = Math.max(1, eli.hp * hpX);
      E.dmg[i] = eli.dmg * this.plan.dmgX;
      E.speed[i] = eli.speed * this.plan.spdX;
      E.armor[i] = eli.armor + armorAdd;
      E.resist[i] = F.resist.elite;
      E.cost[i] = F.eliteMoon;
      E.tags[i] = tagBits(eli.tags);
      E.actor[i] = (this.content.elites[id as EliteId] as ActorImpl | undefined) ?? null;
    } else if (tre) {
      E.kind[i] = EKind.Treasure;
      E.atlas[i] = `mon:${id}` as never;
      E.role[i] = ROLE.chaser;
      E.r0[i] = id === 'pixiu' ? 16 : 14; E.r[i] = E.r0[i];
      E.hp[i] = E.hpMax[i] = Math.max(1, tre.hp * (id === 'mirrorflower' ? 1 : this.plan.hpX));
      E.dmg[i] = 0;
      E.speed[i] = 0;
      E.armor[i] = 0;
      E.resist[i] = 0;
      E.cost[i] = tre.p.moon ?? 0;
      E.stT[i] = tre.life;
      E.actor[i] = (this.content.treasures[id as TreasureId] as ActorImpl | undefined) ?? null;
    }
    initEnemy(this, i, o.bloom ? (this.diff.teleX ? F.bloomEasy : F.bloom) : 0);
    if (o.affixes && o.affixes.length) {
      E.affixes[i] = o.affixes;
      for (const a of o.affixes) {
        const impl = this.content.affixes[a];
        if (!impl) continue;
        E.affixImpl[i].push(impl);
        let s: unknown;
        try { s = impl.init(this, E.handle(i)); } catch (e) { this.hooks.error(e, false); }
        E.affixS[i].push(s);
      }
    }
    const act = E.actor[i];
    if (act) {
      this.cur = i; this.curWhat = 'enemy';
      try { E.actorS[i] = act.init(this, E.handle(i)); } catch (e) { E.actor[i] = null; this.hooks.error(e, false); }
      this.cur = -1; this.curWhat = 'none';
    }
    return E.handle(i);
  }

  spawnBoss(id: BossId | 'mirrorself', x: number, y: number, hp: number): number {
    const E = this.E;
    const i = E.spawnSlot();
    if (i < 0) return -1;
    this.PS.forgetBody(i);
    E.capped[i] = 0;
    E.kind[i] = EKind.Boss;
    E.id[i] = id;
    E.atlas[i] = `boss:${id}:0` as never;
    E.x[i] = x; E.y[i] = y;
    const def = id === 'mirrorself' ? null : BOSSES[id];
    const home = this.wave >= 30 ? 30 : this.wave >= 20 ? 20 : 10;
    E.r0[i] = def?.r ?? 40; E.r[i] = E.r0[i];
    E.hp[i] = E.hpMax[i] = Math.max(1, hp);
    const contact = def ? def.contact : ENDLESS_BOSS.contact;
    E.dmg[i] = contact * this.plan.dmgX / Math.max(1e-6, dmgMul(home));
    E.speed[i] = (def?.phases[0].speed ?? 90) * (this.diff.enemySpeed ?? 1);
    E.armor[i] = enemyArmorAdd(this.run, this.wave);
    E.resist[i] = F.resist.boss;
    E.cost[i] = F.bossMoon;
    E.role[i] = ROLE.chaser;
    E.actor[i] = (this.content.bosses[id] as ActorImpl | undefined) ?? null;
    initEnemy(this, i, 0);
    const act = E.actor[i];
    if (act) {
      this.cur = i; this.curWhat = 'enemy';
      try { E.actorS[i] = act.init(this, E.handle(i)); } catch (e) { E.actor[i] = null; this.hooks.error(e, false); }
      this.cur = -1; this.curWhat = 'none';
    }
    return E.handle(i);
  }

  /** The multiplier from a boss's home-wave 照影 numbers to this wave's (diff, vows, 劫, endless). */
  bossDmgX(): number {
    const home = this.wave >= 30 ? 30 : this.wave >= 20 ? 20 : 10;
    return this.plan.dmgX / Math.max(1e-6, dmgMul(home));
  }

  bossPhase(h: number, phase: number): void {
    const i = this.E.slotOf(h);
    if (i < 0) return;
    const E = this.E;
    E.phase[i] = phase;
    const id = E.id[i];
    E.atlas[i] = `boss:${id}:${Math.min(3, phase)}` as never;
    this.hooks.boss({ kind: 'phase', id: this.bossHudId(id), phase });
    const reg = BOSS_REG.find((b) => b.id === id);
    const ph = reg?.phases[Math.min(2, phase)];
    if (ph) this.title({ zh: ph.zh, en: ph.en }, 'centre');
    this.clearShots('enemy');
    this.sfx('phaseBreak');
    // a beat of stillness, then a small, short shake (feel.phase): big moments only
    this.feel.stopHard(120);
    this.feel.phase(E.x[i], E.y[i]);
  }
  private bossHudId(id: string): BossId | 'twins' | 'mirrorself' {
    if (id === 'mirrorself') return 'mirrorself';
    if (this.wave > 30 && this.plan.boss?.twins) return 'twins';
    return id as BossId;
  }

  summon(kind: SummonKind, x: number, y: number, o: { life: number; hit: HitPacket; cd: number; r?: number; capped?: boolean }): number {
    const S = this.S;
    const i = S.take();
    if (i < 0) return -1;
    S.kind[i] = SK[kind] ?? 0;
    S.x[i] = x; S.y[i] = y; S.vx[i] = S.vy[i] = 0; S.face[i] = 0;
    const hp = F.summon.hp + F.summon.hpSpirit * this.stats.spirit + F.summon.hpWave * this.wave;
    S.hp[i] = S.hpMax[i] = hp;
    S.life[i] = S.life0[i] = o.life;
    S.cd[i] = o.cd; S.atkT[i] = o.cd * 0.5; S.r[i] = o.r ?? 12;
    S.dmg[i] = this.packetRaw(o.hit) * (o.hit.mult ?? 1) * this.dmgMultNow();
    S.critP[i] = o.hit.crit === true ? 1 : o.hit.crit === false ? 0 : clamp(this.stats.crit / 100, 0, 1);
    S.critM[i] = F.critXDefault + this.stats.critDmg / 100;
    S.knock[i] = o.hit.knock ?? 0;
    S.slot[i] = -1; S.capped[i] = o.capped ? 1 : 0; S.target[i] = -1; S.st[i] = 0; S.stT[i] = 0;
    S.order[i] = ++this.summonOrder; S.dragon[i] = 0; S.tier[i] = 0; S.flash[i] = 0; S.contactT[i] = 0;
    return i;
  }

  shot(s: ShotSpec): void {
    if (s.side === 'enemy') {
      this.enemyShot(s.kind, s.x, s.y, s.vx, s.vy, s.r, s.life, (s.dmg ?? 0) * this.plan.dmgX, s.lob ?? false, s.homing ?? 0,
        s.status ? STI[s.status.kind] + 1 : 0, s.status?.dur ?? 0, s.status?.v ?? 0, -1);
      return;
    }
    const PS = this.PS;
    const i = PS.spawnSlot();
    if (i < 0) return;
    PS.x[i] = s.x; PS.y[i] = s.y; PS.px[i] = s.x; PS.py[i] = s.y; PS.vx[i] = s.vx; PS.vy[i] = s.vy; PS.r[i] = s.r;
    PS.life[i] = PS.life0[i] = s.life; PS.kind[i] = PK[s.kind] ?? 0;
    PS.mode[i] = s.lob ? SMode.Lob : s.homing ? SMode.Homing : SMode.Straight;
    PS.homing[i] = s.homing ?? 0; PS.speed[i] = Math.hypot(s.vx, s.vy);
    PS.pierce[i] = s.pierce ?? 0;
    if (s.lob) { PS.tx[i] = s.x + s.vx * s.life; PS.ty[i] = s.y + s.vy * s.life; }
    const pk = s.hit;
    if (pk) {
      PS.dmg[i] = this.packetRaw(pk) * (pk.mult ?? 1) * this.dmgMultNow();
      PS.critP[i] = pk.crit === true ? 1 : pk.crit === false ? 0 : clamp(this.stats.crit / 100, 0, 1);
      PS.critM[i] = F.critXDefault + this.stats.critDmg / 100;
      PS.knock[i] = pk.knock ?? 0;
      PS.proc[i] = pk.proc ?? 1;
      PS.src[i] = SRCI[pk.src];
      if (pk.status) { PS.status[i] = STI[pk.status.kind] + 1; PS.statusDur[i] = pk.status.dur; PS.statusV[i] = pk.status.v ?? 0; }
      if (pk.noArmor) PS.flags[i] |= SF.noDeflect;
    }
    PS.flags[i] |= SF.projectile;
  }

  /** Enemy shot (damage already scaled). */
  enemyShot(kind: string, x: number, y: number, vx: number, vy: number, r: number, life: number, dmg: number, lob: boolean, homing: number,
    status: number, statusDur: number, statusV: number, owner: number): number {
    const ES = this.ES;
    let i = ES.spawnSlot();
    if (i < 0) {
      // over 300: the oldest fades
      let oldest = -1, lo = Infinity;
      for (let k = 0; k < ES.n; k++) if (ES.alive[k] && ES.life[k] < lo) { lo = ES.life[k]; oldest = k; }
      if (oldest < 0) return -1;
      ES.release(oldest);
      i = ES.spawnSlot();
      if (i < 0) return -1;
    }
    const sp = this.diff.shotSpeed ?? 1;
    ES.x[i] = x; ES.y[i] = y; ES.vx[i] = vx * sp; ES.vy[i] = vy * sp; ES.r[i] = r; ES.life[i] = ES.life0[i] = lob ? life : life / sp;
    ES.kind[i] = PK[kind as keyof typeof PK] ?? PK.eOrb; ES.dmg[i] = dmg; ES.mode[i] = lob ? SMode.Lob : homing ? SMode.Homing : SMode.Straight;
    ES.homing[i] = homing; ES.status[i] = status; ES.statusDur[i] = statusDur; ES.statusV[i] = statusV; ES.owner[i] = owner;
    if (lob) { ES.tx[i] = x + vx * life; ES.ty[i] = y + vy * life; ES.px[i] = x; ES.py[i] = y; }
    return i;
  }

  clearShots(side: 'enemy' | 'player'): void {
    const P = side === 'enemy' ? this.ES : this.PS;
    for (let i = 0; i < P.n; i++) if (P.alive[i]) {
      if (side === 'enemy' && this.P.count < this.P.cap - 10 && this.erng() < 0.3) this.fx('inkBurst', P.x[i], P.y[i], { r: 8, life: 0.3 });
      P.release(i);
    }
    if (side === 'player') this.swordsAir = 0;
  }

  zone(z: ZoneSpec): number {
    const Z = this.Z;
    const i = Z.take();
    if (i < 0) return -1;
    Z.gen[i] = (Z.gen[i] + 1) % 0x100000;
    Z.side[i] = z.side === 'player' ? 1 : 0; Z.look[i] = z.look; Z.x[i] = z.x; Z.y[i] = z.y; Z.r[i] = z.r;
    Z.life[i] = Z.life0[i] = z.life; Z.age[i] = 0; Z.tick[i] = z.tick ?? 0; Z.tickT[i] = z.tick ?? 0; Z.fn[i] = z.onTick ?? null;
    Z.slow[i] = z.slow ?? 0; Z.dps[i] = z.dmgPerSec ?? 0; Z.undodge[i] = z.undodgeable ? 1 : 0; Z.follow[i] = z.follow === 'player' ? 1 : 0;
    Z.code[i] = 0; Z.v[i] = 0;
    return Z.gen[i] * 1024 + i;
  }
  endZone(id: number): void {
    const i = id % 1024;
    if (i < this.Z.cap && this.Z.alive[i] && this.Z.gen[i] === Math.floor(id / 1024)) { this.Z.release(i); this.Z.fn[i] = null; }
  }
  /** A core zone (web, spore, fire puddle, flower …) with a code the tick switch reads. */
  coreZone(side: 0 | 1, look: FxName, x: number, y: number, r: number, life: number, code: number, v: number, slow = 0, dps = 0): number {
    const id = this.zone({ side: side ? 'player' : 'enemy', look, x, y, r, life, slow, dmgPerSec: dps });
    if (id >= 0) { this.Z.code[id % 1024] = code; this.Z.v[id % 1024] = v; }
    return id;
  }

  tele(t: TeleSpec): number {
    return this.coreTele(t.shape, t.dur, 0, t.owner ?? -1, 0, t.then ?? null);
  }
  /** A telegraph; `code` > 0 runs a core strike when it fills (see strikeTele). */
  coreTele(shape: TeleSpec['shape'], dur: number, code: number, owner: number, v: number, fn: ((w: WorldApi) => void) | null): number {
    const T = this.T;
    const i = T.take();
    if (i < 0) { if (fn) { try { fn(this); } catch (e) { this.hooks.error(e, false); } } return -1; }
    T.gen[i] = (T.gen[i] + 1) % 0x100000;
    const s = T.shape[i] as unknown as Record<string, unknown>;
    for (const k in s) delete s[k];
    Object.assign(s, shape);
    T.t[i] = 0; T.dur[i] = Math.max(0.05, dur * (this.diff.teleX ?? 1)); T.fn[i] = fn; T.code[i] = code; T.owner[i] = owner; T.v[i] = v;
    return T.gen[i] * 1024 + i;
  }

  drop(kind: DropKind, x: number, y: number, n = 1): void {
    for (let k = 0; k < n; k++) this.dropOne(DK[kind], x, y, kind === 'moonFull' ? F.moonTiers[0] : kind === 'moonThick' ? F.thickWorth : kind === 'goldShard' ? 4 : kind === 'carpGold' ? 5 : 1, -1);
  }

  attract(x: number, y: number, r: number): void {
    const D = this.D, r2 = r * r;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      if (k === DK.heartDrop || k === DK.relicMirror || k === DK.relicSword) continue;
      const dx = D.x[i] - x, dy = D.y[i] - y;
      if (dx * dx + dy * dy <= r2) D.magnet[i] = 2;
    }
  }

  // ═══════════════════════════════════════════════════════════ WorldApi: queries

  alive(h: number): boolean { return this.E.slotOf(h) >= 0; }
  enemy(h: number): EnemyView { this.eview.i = this.E.slotOf(h); return this.eview; }

  /** Can slot i be targeted under filter f? */
  targetable(i: number, f: EnemyFilter = 'any'): boolean {
    const E = this.E;
    if (!E.alive[i] || E.hidden[i] || E.untarget[i]) return false;
    const k = E.kind[i];
    const ally = k === EKind.Ally || E.charmT[i] > 0;
    switch (f) {
      case 'any': return !ally;
      case 'normal': return !ally && (k === EKind.Mon || k === EKind.Demon);
      case 'notBoss': return !ally && k !== EKind.Boss;
      case 'eliteOrBoss': return !ally && (k === EKind.Elite || k === EKind.Boss);
      case 'ally': return ally;
    }
  }
  nearestSlot(x: number, y: number, r: number, f: EnemyFilter = 'any', skipH = -1): number {
    const E = this.E, buf = this.q2;
    const n = this.hash.gather(x, y, r + 64, buf);
    let best = -1, bd = Infinity;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f) || E.handle(i) === skipH) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, d = dx * dx + dy * dy;
      const rr = r + E.r[i];
      if (d <= rr * rr && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  nearest(x: number, y: number, r: number, f?: EnemyFilter): number {
    const i = this.nearestSlot(x, y, r, f);
    return i < 0 ? -1 : this.E.handle(i);
  }
  strongestSlot(x: number, y: number, r: number, f: EnemyFilter = 'any'): number {
    const E = this.E, buf = this.q2;
    const n = this.hash.gather(x, y, r + 64, buf);
    let best = -1, bh = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y;
      const rr = r + E.r[i];
      if (dx * dx + dy * dy <= rr * rr && E.hp[i] > bh) { bh = E.hp[i]; best = i; }
    }
    return best;
  }
  strongest(x: number, y: number, r: number, f?: EnemyFilter): number {
    const i = this.strongestSlot(x, y, r, f);
    return i < 0 ? -1 : this.E.handle(i);
  }
  densest(x: number, y: number, reach: number, r: number): Vec | null {
    const E = this.E, buf = this.q1;
    const n = this.hash.gather(x, y, reach + 64, buf);
    let best = -1, bc = 0;
    const step = Math.max(1, Math.floor(n / 24));
    for (let k = 0; k < n; k += step) {
      const i = buf[k];
      if (!this.targetable(i)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y;
      if (dx * dx + dy * dy > reach * reach) continue;
      const c = this.countNear(E.x[i], E.y[i], r);
      if (c > bc) { bc = c; best = i; }
    }
    if (best < 0) return null;
    V.x = E.x[best]; V.y = E.y[best];
    return V;
  }
  countNear(x: number, y: number, r: number): number {
    const E = this.E, buf = this.q2;
    const n = this.hash.gather(x, y, r + 32, buf);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
      if (dx * dx + dy * dy <= rr * rr) c++;
    }
    return c;
  }
  query(x: number, y: number, r: number, out: number[], f: EnemyFilter = 'any'): number {
    const E = this.E, buf = this.q2;
    const n = this.hash.gather(x, y, r + 64, buf);
    out.length = 0;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
      if (dx * dx + dy * dy <= rr * rr) out.push(E.handle(i));
    }
    return out.length;
  }
  inArena(x: number, y: number, r = 0): boolean {
    return insideShape(this.arena.shape, x, y, r) && !this.inObstacle(x, y, r);
  }
  clampToArena(p: Vec, r = 0): Vec {
    const s = this.arena.shape;
    if (s.kind === 'circle') {
      const d = Math.hypot(p.x, p.y), m = s.r - r;
      if (d > m && d > 0) { p.x *= m / d; p.y *= m / d; }
    } else if (s.kind === 'rect') {
      const hw = s.w / 2 - r, hh = s.h / 2 - r;
      p.x = clamp(p.x, -hw, hw); p.y = clamp(p.y, -hh, hh);
    } else {
      const a = s.r * Math.cos(Math.PI / 8) - r;
      p.x = clamp(p.x, -a, a); p.y = clamp(p.y, -a, a);
      const ax = Math.abs(p.x), ay = Math.abs(p.y), dd = (ax + ay) * Math.SQRT1_2;
      if (dd > a) { const k = (dd - a) * Math.SQRT1_2; p.x -= Math.sign(p.x) * k; p.y -= Math.sign(p.y) * k; }
    }
    return p;
  }

  // ═══════════════════════════════════════════════════════════ damage: player → enemy (§4.2)

  /** raw = base + Σ scale·stat (live sheet). */
  packetRaw(pk: HitPacket): number {
    let r = pk.base;
    if (pk.scale) for (const k in pk.scale) r += (pk.scale[k as keyof Stats] ?? 0) * this.stats[k as keyof Stats];
    return Math.max(1, r);
  }
  // m8 (PLAN L3): the 伤害 floor is CLAMP.dmgMin, read live (the 模拟场 may edit it)
  dmgMultNow(): number { return Math.max(0.1, 1 + Math.max(CLAMP.dmgMin, this.stats.dmg) / 100); }

  /**
   * One player-side hit on slot i: crit roll, armour (+ shred), front shields, vulnerability, paper
   * ×2 from fire; then flash, knockback, numbers, events, lifesteal and death. Returns damage dealt.
   * `dmg` is raw × mult (before crit and armour).
   */
  strike(i: number, dmg: number, critP: number, critM: number, knock: number, fx: number, fy: number, slot: number, src: number, flags: number, proc = 1): number {
    this.qd++;
    try { return this.strikeIn(i, dmg, critP, critM, knock, fx, fy, slot, src, flags, proc); } finally { this.qd--; }
  }
  private strikeIn(i: number, dmg: number, critP: number, critM: number, knock: number, fx: number, fy: number, slot: number, src: number, flags: number, proc: number): number {
    const E = this.E;
    if (!E.alive[i] || E.invuln[i] || E.hidden[i]) return 0;
    let crit = false;
    if (flags & HF.forceCrit) crit = true;
    else if (!(flags & HF.noCrit) && critP > 0) {
      // 将进酒: at 醉 100+ every hit crits
      const auto = this.mods.special.jiangjinjiu && this.drunk >= (this.mods.special.jiangjinjiu.autoCrit ?? 100);
      crit = auto || this.erng() < critP;
    }
    const noArmor = (flags & (HF.noArmor | HF.dot)) !== 0;
    let front = 1;
    const tg = E.tags[i];
    if (tg & (TAG_BIT.front | TAG_BIT.shieldline)) {
      const toSrc = Math.atan2(fy - E.y[i], fx - E.x[i]);
      const off = Math.abs(angDiff(toSrc, E.face[i]));
      if ((tg & TAG_BIT.front) && off < (MONSTERS.crab.p.frontDeg / 2) * (Math.PI / 180)) front = MONSTERS.crab.p.frontX;
      if ((tg & TAG_BIT.shieldline) && (flags & HF.projectile) && off < Math.PI / 3) front = MONSTERS.soldier.p.shieldX;
    }
    let vuln = 1 + (E.vulnT[i] > 0 ? E.vulnV[i] / 100 : 0);
    if ((flags & HF.fire) && (tg & TAG_BIT.paper)) vuln *= 2;
    // m8 斩草除根 / 百步穿杨 (items.md P6): weapon hits of their class, beside vulnerability
    if (src === SRCI.weapon && slot >= 0 && !(flags & HF.dot) && (this.mods.execute.length || this.mods.far.length)) vuln *= this.itemHitX(i, slot);
    const shred = E.shredT[i] > 0 ? E.shredN[i] : 0;
    // DoT (burn, bleed, zones) is fractional per step: no armour, no rounding, no 1-point floor
    const d = flags & HF.dot ? dmg * front * vuln : playerHit(dmg, 1, crit, critM, { armor: E.armor[i], shred, noArmor, front, vuln });
    E.hp[i] -= d;
    E.lastSlot[i] = slot;
    E.lastSrc[i] = src;
    this.lastCrit = crit;
    if (crit) this.critN++;
    // numbers: the first hit shows at once (in sync with the flash); later hits on the same body
    // merge into its live number every 0.25 s
    E.numAcc[i] += d;
    if (crit) E.numCrit[i] = 1;
    if (!(flags & HF.dot) && !this.liveNum(i)) this.flushNumber(i);
    this.addStat('dmgDealt', d);
    if (crit) this.addStat('crits', 1);
    this.maxStat('peakHit', d);
    if (slot >= 0 && slot < this.slots.length) {
      const id = this.slots[slot].id;
      const b = this.byWeapon[id] ?? (this.byWeapon[id] = { dmg: 0, kills: 0 });
      b.dmg += d;
    }
    // knockback (§4.2): impulse over 0.12 s; bosses resist fully. m8 泰山压顶 (P7): its class pins instead of pushing
    const pinD = this.mods.pin.length && src === SRCI.weapon && slot >= 0 && !(flags & HF.dot) ? this.itemPin(slot) : 0;
    if (pinD > 0) this.statusSlot(i, 'root', pinD);
    else if (knock > 0 && E.resist[i] < 1 && E.kind[i] !== EKind.Boss) {
      const dist = knockback(knock, this.stats.knock, E.resist[i], this.map.knockX);
      if (dist > 0) {
        let dx = E.x[i] - fx, dy = E.y[i] - fy;
        const L = Math.hypot(dx, dy) || 1;
        dx /= L; dy /= L;
        E.kx[i] = (dx * dist) / F.knockDur; E.ky[i] = (dy * dist) / F.knockDur; E.kT[i] = F.knockDur;
      }
    }
    // (an elite struck no longer stops the world: the elite itself freezes and staggers — feel.hit)
    const srcName = SRC[src];
    // 打击感: the body reacts (flash, squash, recoil, a local freeze), marks and spatter by weapon
    // class, the impact bus (quiet DoT ticks: none); the camera stays still
    if (!(flags & HF.quiet) || !(flags & HF.dot)) this.feel.hit(i, fx, fy, d, crit, this.fcOf(slot, src, flags), (flags & HF.dot) !== 0, src, slot);
    // on-hit: lifesteal (weapons only), items, content
    if (!(flags & HF.noProc)) {
      // melee weapon hits carry an innate 吸血 (F.meleeSteal) on top of the stat; the 10/s cap is shared
      const steal = src === SRCI.weapon ? this.stats.steal + (flags & HF.melee ? F.meleeSteal : 0) : 0;
      if (steal > 0 && this.erng() < (clamp(steal, 0, 100) / 100) * proc) this.capHeal(0, 1, F.stealPerSec);
      if (crit) {
        if (this.mods.critHeal) this.capHeal(1, this.mods.critHeal.v, this.mods.critHeal.cap);
        if (this.mods.critDrunk) this.addDrunk(this.mods.critDrunk * proc);
      }
      if (this.mods.hitHeal && this.erng() < this.mods.hitHeal.p * proc) this.capHeal(2, this.mods.hitHeal.v, this.mods.hitHeal.cap);
      // m8: the items' on-hit buffs and statuses (weapon hits only; items.md P4, P5)
      if (src === SRCI.weapon && slot >= 0 && (this.mods.evBuffs.length || this.mods.hitStatus.length)) this.itemOnHit(i, slot, d, crit, proc);
    }
    const h = E.handle(i);
    const act = E.actor[i];
    if (act?.hit || E.affixImpl[i].length) {
      const ev = this.fillEv(crit ? 'crit' : 'hit', h, d, crit, srcName, E.x[i], E.y[i], slot);
      if (act?.hit) { try { act.hit(this, h, E.actorS[i], ev); } catch (e) { this.hooks.error(e, false); } }
      const im = E.affixImpl[i];
      for (let k = 0; k < im.length; k++) if (im[k].hit) { try { im[k].hit!(this, h, E.affixS[i][k], ev); } catch (e) { this.hooks.error(e, false); } }
    }
    this.emit(crit ? 'crit' : 'hit', h, d, crit, srcName, E.x[i], E.y[i], slot);
    if (E.alive[i] && E.hp[i] <= 0) this.killSlot(i, true, crit);
    return d;
  }

  /** The feel class of a strike: the weapon's own, else by source. */
  fcOf(slot: number, src: number, flags: number): number {
    if (slot >= 0 && slot < this.slots.length) return this.slots[slot].fc;
    if (src === SRCI.summon) return FC.ink;
    if (src === SRCI.skill) return FC.skill;
    if (flags & HF.sword) return FC.flying;
    return FC.generic;
  }

  /** Heal from a capped source (k: 0 lifesteal, 1 crit heal, 2 on-hit heal, 3 sword return). */
  capHeal(k: number, v: number, capPerSec: number): void {
    if (this.t - this.capWin[k] >= 1) { this.capWin[k] = this.t; this.capN[k] = 0; }
    if (this.capN[k] + v > capPerSec) return;
    this.capN[k] += v;
    this.heal(v);
  }

  /** Apply a HitPacket (content, skills, items) to slot i. */
  hitSlot(i: number, pk: HitPacket, fx: number, fy: number): number {
    const dmg = this.packetRaw(pk) * (pk.mult ?? 1) * this.dmgMultNow();
    const critP = pk.crit === true ? 1 : pk.crit === false ? 0 : clamp(this.stats.crit / 100, 0, 1);
    const critM = F.critXDefault + this.stats.critDmg / 100 + (Math.max(0, this.stats.crit - 100) / 100) * critOverflowOf(this.run);
    let flags = pk.noArmor ? HF.noArmor : 0;
    if (pk.crit === true) flags |= HF.forceCrit;
    if (pk.crit === false) flags |= HF.noCrit;
    const src = SRCI[pk.src] ?? SRCI.skill;
    const d = this.strike(i, dmg, critP, critM, pk.knock ?? 0, fx, fy, -1, src, flags, pk.proc ?? 1);
    if (pk.status && this.E.alive[i]) this.statusSlot(i, pk.status.kind, pk.status.dur, pk.status.v);
    return d;
  }

  hit(h: number, pk: HitPacket): number {
    const i = this.E.slotOf(h);
    return i < 0 ? 0 : this.hitSlot(i, pk, this.px, this.py);
  }
  hitArea(x: number, y: number, r: number, pk: HitPacket, f: EnemyFilter = 'any'): number {
    const E = this.E, buf = this.q0;
    const n = this.hash.gather(x, y, r + 64, buf);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;
      if (this.hitSlot(i, pk, x, y) > 0) c++;
    }
    return c;
  }
  hitCone(x: number, y: number, dir: number, r: number, deg: number, pk: HitPacket, f: EnemyFilter = 'any'): number {
    const E = this.E, buf = this.q0, half = (deg / 2) * (Math.PI / 180);
    const n = this.hash.gather(x, y, r + 64, buf);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f)) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i], d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      if (d2 > E.r[i] * E.r[i] && Math.abs(angDiff(Math.atan2(dy, dx), dir)) > half + Math.asin(Math.min(1, E.r[i] / Math.sqrt(d2)))) continue;
      if (this.hitSlot(i, pk, x, y) > 0) c++;
    }
    return c;
  }
  hitLine(x: number, y: number, dir: number, len: number, w: number, pk: HitPacket, f: EnemyFilter = 'any'): number {
    const E = this.E, buf = this.q0;
    const ex = x + Math.cos(dir) * len, ey = y + Math.sin(dir) * len;
    const n = this.hash.gather((x + ex) / 2, (y + ey) / 2, len / 2 + w + 64, buf);
    let c = 0;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!this.targetable(i, f)) continue;
      const rr = w / 2 + E.r[i];
      if (segDist2(E.x[i], E.y[i], x, y, ex, ey) > rr * rr) continue;
      if (this.hitSlot(i, pk, x, y) > 0) c++;
    }
    return c;
  }

  status(h: number, kind: StatusKind, dur: number, v?: number): void {
    const i = this.E.slotOf(h);
    if (i >= 0) this.statusSlot(i, kind, dur, v);
  }
  /**
   * Statuses (§4.4): burn/bleed stacks with their own timers, the strongest slow (60% cap, bosses
   * half), root/stun (bosses immune, elites half), charm (non-elite), shred (≤ 5), vuln, stagger.
   * 道童 statuses last 50% longer.
   */
  statusSlot(i: number, kind: StatusKind, dur: number, v = 0, cap0 = 0): void {
    const E = this.E;
    if (!E.alive[i]) return;
    const k = E.kind[i];
    const boss = k === EKind.Boss, elite = k === EKind.Elite;
    if (this.run.char === 'taoist') dur *= 1 + PASSIVES.tongzi.p.statusDur / 100;
    switch (kind) {
      case 'burn': {
        // the base cap is 3 (火符 IV: 5); 黄纸, the 符箓 6-set and 三昧真火 raise it
        let cap = (cap0 || 3) + this.mods.burnStacks + (this.mods.flags.has('burnStack') ? 1 : 0);
        if (this.mods.special.samadhi) cap *= this.mods.special.samadhi.stackX ?? 2;
        cap = Math.min(16, cap);
        const dps = Math.abs(v) || 3;
        const o = i * BURN_MAX;
        const t = dur + this.mods.burnDur;
        if (E.burnN[i] < cap) { E.burnT[o + E.burnN[i]] = t; E.burnD[o + E.burnN[i]] = dps; E.burnN[i]++; }
        else { // refresh the weakest
          let lo = 0;
          for (let s = 1; s < E.burnN[i]; s++) if (E.burnT[o + s] < E.burnT[o + lo]) lo = s;
          E.burnT[o + lo] = t; E.burnD[o + lo] = Math.max(E.burnD[o + lo], dps);
        }
        break;
      }
      case 'bleed': {
        // 3/s + 30% 近战 for 3 s, up to 5 stacks (猫爪 IV: 15)
        const cap = Math.min(BLEED_MAX, cap0 || 5);
        const dps = 3 + 0.3 * Math.max(0, this.stats.melee);
        // m8 见血封喉 (P5): v > 0 is the stack's own damage a second (a share of the hit); 猫爪 passes 0
        const per = v > 0 ? v : dps;
        const o = i * BLEED_MAX;
        if (E.bleedN[i] < cap) { E.bleedT[o + E.bleedN[i]] = dur; E.bleedD[o + E.bleedN[i]] = per; E.bleedN[i]++; }
        else {
          let lo = 0; for (let s = 1; s < E.bleedN[i]; s++) if (E.bleedT[o + s] < E.bleedT[o + lo]) lo = s; E.bleedT[o + lo] = dur;
          // a refresh at the cap keeps the larger damage a second (items.md §R.4 ⑮)
          if (v > 0) E.bleedD[o + lo] = Math.max(E.bleedD[o + lo], per);
        }
        break;
      }
      case 'slow': {
        let s = Math.min(0.6, v > 1 ? v / 100 : v);
        if (boss) s *= 0.5;
        if (s >= E.slowV[i] || E.slowT[i] <= 0) { E.slowV[i] = s; E.slowT[i] = Math.max(E.slowT[i], dur); }
        break;
      }
      case 'root': if (!boss) E.rootT[i] = Math.max(E.rootT[i], elite ? dur / 2 : dur); break;
      case 'stun': if (!boss) E.stunT[i] = Math.max(E.stunT[i], elite ? dur / 2 : dur); break;
      case 'charm':
        if (k === EKind.Mon) {
          if (E.charmT[i] <= 0) this.addStat('charms', 1);
          E.charmT[i] = Math.max(E.charmT[i], dur);
          if (this.mods.charm) E.boya[i] = 1;
        }
        break;
      case 'shred': E.shredN[i] = Math.min(5, E.shredN[i] + Math.max(1, Math.round(v || 1))); E.shredT[i] = 3; break;
      case 'vuln': E.vulnV[i] = Math.max(E.vulnT[i] > 0 ? E.vulnV[i] : 0, v || 25); E.vulnT[i] = Math.max(E.vulnT[i], dur); break;
      case 'stagger': if (!boss) E.staggerT[i] = Math.max(E.staggerT[i], dur); break;
    }
  }

  push(h: number, fromX: number, fromY: number, dist: number): void {
    const i = this.E.slotOf(h);
    if (i < 0) return;
    const E = this.E;
    if (E.kind[i] === EKind.Boss) return;
    const d = dist * (1 - E.resist[i]) * this.map.knockX;
    let dx = E.x[i] - fromX, dy = E.y[i] - fromY;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    E.kx[i] = (dx * d) / F.knockDur; E.ky[i] = (dy * d) / F.knockDur; E.kT[i] = F.knockDur;
  }
  pull(h: number, toX: number, toY: number, dist: number): void {
    const i = this.E.slotOf(h);
    if (i < 0) return;
    const E = this.E;
    if (E.kind[i] === EKind.Boss) return;
    let dx = toX - E.x[i], dy = toY - E.y[i];
    const L = Math.hypot(dx, dy) || 1;
    const d = Math.min(L - E.r[i], dist * (1 - Math.min(0.9, E.resist[i])));
    if (d <= 0) return;
    dx /= L; dy /= L;
    E.kx[i] = (dx * d) / F.knockDur; E.ky[i] = (dy * d) / F.knockDur; E.kT[i] = F.knockDur;
  }
  convert(h: number, dur: number): void {
    const i = this.E.slotOf(h);
    if (i < 0 || this.E.kind[i] !== EKind.Mon) return;
    this.E.kind[i] = EKind.Ally;
    this.E.capped[i] = 0;
    this.E.charmT[i] = dur;
    this.addStat('charms', 1);
  }
  kill(h: number, drops = true): void {
    const i = this.E.slotOf(h);
    if (i >= 0) this.killSlot(i, drops, false);
  }

  /** Death of slot i: tallies, drops, coins, events, splat. */
  killSlot(i: number, drops: boolean, crit: boolean): void {
    if (!this.E.alive[i]) return;
    this.qd++;
    try { this.killIn(i, drops, crit); } finally { this.qd--; }
  }
  private killIn(i: number, drops: boolean, crit: boolean): void {
    const E = this.E;
    const h = E.handle(i);
    const k = E.kind[i], id = E.id[i], x = E.x[i], y = E.y[i];
    // everything read after release is taken now: a splitter's first child reuses slot i
    const lastSlot = E.lastSlot[i], lastSrc = E.lastSrc[i], r = E.r[i], burning = E.burnN[i] > 0, hitA = E.hitA[i];
    // m8 连环计 / 星火燎原 (P8): the victim's max HP and its strongest burn, read before the release
    const hpMax0 = E.hpMax[i];
    let burnD0 = 0;
    if (burning && this.mods.spread.length) for (let s = 0; s < E.burnN[i]; s++) burnD0 = Math.max(burnD0, E.burnD[i * BURN_MAX + s]);
    // 打击感: the look its death burst breaks apart (the slot may be reused before feel.kill)
    const look = E.atlas[i], lookFace = E.face[i], lookK = E.r[i] / Math.max(1, E.r0[i]);
    E.hp[i] = Math.min(E.hp[i], 0);
    this.flushNumber(i);
    // content death hooks run while the body still exists
    const act = E.actor[i];
    if (act?.death) { try { act.death(this, h, E.actorS[i]); } catch (e) { this.hooks.error(e, false); } }
    const im = E.affixImpl[i];
    for (let a = 0; a < im.length; a++) if (im[a].death) { try { im[a].death!(this, h, E.affixS[i][a]); } catch (e) { this.hooks.error(e, false); } }
    const ally = k === EKind.Ally;
    if (!ally) {
      this.kills++;
      this.addStat('kills', 1);
      this.killsBy[id] = (this.killsBy[id] ?? 0) + 1;
      const slot = lastSlot;
      if (slot >= 0 && slot < this.slots.length) {
        const sl = this.slots[slot];
        const b = this.byWeapon[sl.id] ?? (this.byWeapon[sl.id] = { dmg: 0, kills: 0 });
        b.kills++;
        const cls = WEAPONS[sl.id].classes;
        if (cls.includes('sword')) this.addStat('killsSword', 1);
        if (cls.includes('flying')) { this.addStat('killsFlying', 1); this.swordKills++; }
        if (cls.includes('ink')) this.addStat('killsInk', 1);
      }
      if (lastSrc === SRCI.summon) this.addStat('killsInk', 1);
      if (E.tags[i] & TAG_BIT.ghost) this.addStat('killsGhost', 1);
      if (this.drunkOn) this.addDrunk(F.drunk.perKill);
    }
    E.release(i);
    if (k === EKind.Boss) this.onBossDeath(id, x, y);
    else if (k === EKind.Elite) { this.eliteKills++; this.addStat('elites', 1); }
    else if (k === EKind.Treasure) {
      if (id === 'pixiu') this.addStat('pixiu', 1);
      if (id === 'mirrorflower') { this.addStat('flowers', 1); this.hearts.push('flower'); this.sfx('bell'); }
    }
    if (drops && !E.noDrops[i] && !ally && k !== EKind.Demon) this.killDrops(i, k, id, x, y);
    if (!ally) onWeaponKill(this, lastSlot, x, y, crit, burning);
    if (k === EKind.Demon && drops && this.erng() * 100 < this.mods.demonCrate) { this.crates++; this.dropOne(DK.crateBox, x, y, 1, -1); this.hooks.crate(this.crates); }
    onEnemyDeath(this, i, k, id, x, y, crit);
    this.emit('kill', h, 0, crit, SRC[lastSrc] ?? 'weapon', x, y, lastSlot);
    // m8: the items' on-kill buffs, bursts and spreads (items.md P4, P8)
    if (!ally && (this.mods.evBuffs.length || this.mods.blast.length || this.mods.spread.length)) this.itemOnKill(k, x, y, hpMax0, burnD0, lastSlot);
    // ink (打击感): the body breaks into its pieces over a splash on the ground, a wet crown and flung
    // drops, then a stain stamped into the paper. The dark ink burst (drawn in the effects layer, over
    // the pieces) only when nothing breaks: an ally, a degraded frame, a crowd's fifth death in a step.
    let broke = false;
    if (!ally) { this.feel.corpse(look, lookFace, lookK); broke = this.feel.kill(x, y, r, k, crit, hitA, this.fcOf(lastSlot, lastSrc, 0)); }
    if (!broke) this.fx('inkBurst', x, y, { r: r * 1.6, life: 0.35 });
    try { this.painter?.stamp('splat', x, y, r * 1.2, (h * 2654435761) >>> 0); } catch { /* painter optional */ }
  }

  /** A body leaves without being killed (a wilted 水草缠, an expired summon): no tallies, drops or events. */
  expireSlot(i: number, look: FxName = 'inkBurst'): void {
    const E = this.E;
    if (!E.alive[i]) return;
    this.flushNumber(i);
    this.fx(look, E.x[i], E.y[i], { r: E.r[i] * 1.2, life: 0.4 });
    E.release(i);
  }

  private killDrops(i: number, k: number, id: string, x: number, y: number): void {
    const E = this.E;
    const luck = luckMult(this.stats.luck);
    // 劫's 月华 (m8: F.curseMoon, not a literal)
    const vx = 1 + F.curseMoon * Math.max(0, this.stats.curse) + this.mods.moonPct / 100;
    let cost = E.cost[i];
    if (k === EKind.Mon) {
      const whole = Math.floor(cost), frac = cost - whole;
      let n = whole + (this.erng() < frac ? 1 : 0);
      if (n > 0) this.dropMoon(x, y, n * vx);
      n = 0;
      // 镜奁 at 0.5% × luck, diminishing within a wave (§6)
      if (this.erng() < (F.crateChance * luck) / (1 + this.killCrates)) { this.killCrates++; this.crates++; this.dropOne(DK.crateBox, x, y, 1, -1); this.hooks.crate(this.crates); this.sfx('crate'); }
      if (this.erng() < F.lotusChance * luck) this.dropOne(DK.lotusSeed, x, y, 1, -1);
      if (this.mods.luckyDrop && this.erng() < this.mods.luckyDrop.p * (this.mods.luckyDrop.luck ? luck : 1)) this.dropOne(DK.goldShard, x, y, 4 * vx, -1);
      if (this.run.char === 'fisher' && this.erng() < PASSIVES.yuanzhe.p.carp * luck) this.dropOne(DK.carpGold, x, y, PASSIVES.yuanzhe.p.carpMoon * vx, -1);
      // the k-th kill carries the wave's 铜钱 (§16.3)
      this.coinFor('wave', x, y, this.kills);
    } else if (k === EKind.Elite) {
      // m8 与虎谋皮 (P14): the elite's 月华 + eliteMoonPct %, and eliteCrates more 镜奁
      this.dropMoon(x, y, cost * vx * (1 + this.mods.eliteMoonPct / 100));
      this.crates++; this.dropOne(DK.crateBox, x, y, 1, -1); this.hooks.crate(this.crates); this.sfx('crate');
      for (let c = 0; c < this.mods.eliteCrates; c++) { this.crates++; this.dropOne(DK.crateBox, x, y, 1, -1); this.hooks.crate(this.crates); }
      this.coinFor('elite', x, y, this.eliteKills);
    } else if (k === EKind.Treasure) {
      if (id === 'pixiu') {
        this.dropMoon(x, y, (TREASURES.pixiu.p.moon ?? 20) * vx);
        this.crates++; this.dropOne(DK.crateBox, x, y, 1, -1); this.hooks.crate(this.crates);
        this.coinFor('pixiu', x, y, 0);
      }
    } else if (k === EKind.Boss) {
      this.dropMoon(x, y, cost * vx);
      this.dropOne(DK.heartDrop, x, y, 1, -1);
    }
    cost = 0;
    void cost;
  }

  /**
   * A 镜宝 counts from the moment it is earned: the sheet is recomputed with it (so the static converts —
   * 铁骨, 定海神针, 追风逐电, 悬壶 — follow at once; 气血 +100 heals by 100), the reach and 墨宝's crit follow,
   * a centre title names it and its icon flies from the fallen boss to you (cosmetic: it is already yours).
   */
  private grantRelic(rid: 'wangchen' | 'longyuan', x: number, y: number): void {
    const before = this.relicRun();
    this.relicsGot.push(rid);
    const after = this.relicRun();
    const s0 = computeStats(before), s1 = computeStats(after);
    for (const k of STAT_IDS) this.base[k] += s1[k] - s0[k];
    this.reachPct = reachPct(after);
    const dx = dottingX(after);
    for (const sl of this.slots) if (sl.def.critX <= 0 && sl.ink) sl.critX = dx;
    this.recomputeStats();
    this.dropOne(rid === 'wangchen' ? DK.relicMirror : DK.relicSword, x, y, 1, -1);
    this.fx('levelRing', x, y, { r: 90, life: 0.5 });
    const rn = named(rid);
    if (rn) { this.title({ zh: `得 ${rn.zh}`, en: `${rn.en} +1` }, 'centre'); this.relicTitleAt = this.t; }
  }
  /** The run as it stands inside this wave: its items plus the 镜宝 earned so far. */
  private relicRun(): RunSave {
    if (!this.relicsGot.length) return this.run;
    const items = { ...this.run.items };
    for (const id of this.relicsGot) items[id] = (items[id] ?? 0) + 1;
    return { ...this.run, items };
  }
  private onBossDeath(id: string, x: number, y: number): void {
    this.addStat('bosses', 1);
    if (this.wave > 30) this.addStat('endlessBosses', 1);
    this.hooks.boss({ kind: 'dead', id: this.bossHudId(id) });
    this.feel.stopHard(160);
    this.feel.bossDown(x, y);
    this.sfx('shatter');
    // 镜宝: one per boss felled — when the last living body of this boss id falls (无相's wave-20 pair of one
    // boss = 1; endless 双生, two different bosses = 2; 镜主 = 1), by the weapons held (relicFor); it counts at once
    const E = this.E;
    let same = 0;
    for (let j = 0; j < E.n; j++) if (E.alive[j] && E.kind[j] === EKind.Boss && E.id[j] === id) same++;
    if (same === 0) this.grantRelic(relicFor(this.run), x, y);
    // the wave's boss reward waits for the last body of the fight
    let left = 0;
    for (const h of this.bossH) if (this.E.slotOf(h) >= 0) left++;
    if (left === 0) {
      this.hearts.push('boss');
      const bid: BossId | 'twins' | 'mirrorself' = this.bossHudId(id);
      this.bossesKilled.push(bid);
      if (!this.coinFor('daily', x, y, 0)) this.coinFor('boss', x, y, 0);
    }
  }

  /** Spawn the planned coin for an event, if one is due (returns true when a coin dropped). */
  coinFor(src: CoinDrop['src'], x: number, y: number, k: number): boolean {
    const coins = this.setup.coins;
    for (let c = 0; c < coins.length; c++) {
      if (this.coinUsed[c] || coins[c].src !== src) continue;
      if ((src === 'wave' || src === 'elite') && coins[c].k !== undefined && coins[c].k! > k) continue;
      this.coinUsed[c] = true;
      const kind = coins[c].kind === 'cashTen' ? DK.cashTen : coins[c].kind === 'cashString' ? DK.cashString : DK.cashCoin;
      this.dropOne(kind, x, y, coins[c].worth, c);
      if (kind === DK.cashTen) this.fx('coinRipple', x, y, { r: 40, life: 0.3 });
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════ damage: enemy → player (§4.3)

  /**
   * Damage to the player. `n` is scaled damage (E.dmg × waveDmg …). Dodge and armour apply unless
   * flagged. i-frames F.iframes (0.5 s, ⚖5) after any hit. Returns what was dealt.
   */
  hurt(n: number, o?: { undodgeable?: boolean; noArmor?: boolean; src?: string }): void {
    this.hurtFrom(n, -1, !!o?.undodgeable, !!o?.noArmor, o?.src ?? 'hazard', !!(o as { dot?: boolean } | undefined)?.dot, false);
  }
  hurtFrom(n: number, attacker: number, undodgeable: boolean, noArmor: boolean, src: string, dot: boolean, melee: boolean, shot = -1): number {
    if (this.phase !== 'wave' || n <= 0) return 0;
    // m8 (PLAN C9): invulnerable, untargetable or mid-leap first; then the guard (越女: a caught blow never lands,
    // never scatters and never reaches the items); then the i-frames
    if (!dot && (this.invulnT > 0 || this.untargT > 0 || this.leapT > 0)) return 0;
    if (!dot && this.guardHook !== null && this.guardHook(n, attacker, shot, src, melee)) return 0;
    if (!dot && this.iframes > 0) return 0;
    if (dot && (this.invulnT > 0 || this.untargT > 0)) return 0;
    if (this.godmode) return 0;
    if (!undodgeable && !dot && this.erng() < dodgeChance(this.stats.dodge, this.dodgeCap)) {
      this.onDodge();
      return 0;
    }
    if (!dot && this.blocks > 0) {
      this.blocks--;
      this.iframes = F.iframes;
      this.fx('shieldBubble', this.px, this.py, { r: 26, life: 0.4 });
      this.sfx('bell');
      return 0;
    }
    // 关公 义薄云天: enemies within 150 deal −10%
    if (attacker >= 0 && this.run.char === 'guan') {
      const E = this.E;
      if (Math.hypot(E.x[attacker] - this.px, E.y[attacker] - this.py) <= PASSIVES.yibo.p.auraR) n *= 1 - PASSIVES.yibo.p.aura / 100;
    }
    // m8 (PLAN C9): the blow's scalers before armour (醉卧沙场, 露), each a factor
    for (let k = 0; k < this.hurtScalers.length; k++) n *= this.hurtScalers[k](n, attacker, shot, src, dot, melee);
    let d = enemyHit(n, this.stats.armor, { maxHp: this.hpMax, guan: this.run.char === 'guan', noArmor: noArmor || dot });
    if (this.shieldV > 0) {
      const a = Math.min(this.shieldV, d);
      this.shieldV -= a;
      d -= a;
    }
    this.cause = src;
    if (d > 0) {
      this.hp -= d;
      this.addNum(d, this.px, this.py - 10, 5);
    }
    if (!dot) {
      this.iframes = F.iframes;
      this.addStat('hitsTaken', 1);
      // 打击感: a dark edge pulse, the heartbeat drum and a grunt, an 8 ms haptic tick, and your figure
      // knocked back a few px — drawn only: the simulation never shoves you (GDD §20.1: no drift), so a
      // blow can't push you into a telegraph; a hard blow (≥ 15% of your HP, a boss's) also nudges the
      // camera a little and stops a beat
      const sx = attacker >= 0 ? this.E.x[attacker] : this.hurtSrcX, sy = attacker >= 0 ? this.E.y[attacker] : this.hurtSrcY;
      this.feel.hurt(sx, sy, attacker >= 0 && this.E.kind[attacker] === EKind.Boss, this.hpMax > 0 ? d / this.hpMax : 0);
      this.emit('hurt', attacker >= 0 ? this.E.handle(attacker) : -1, d, false, 'enemy', this.px, this.py, -1);
      if (attacker >= 0) this.thorns(attacker, n, melee);
      // m8 (PLAN C9): after the blow landed (千金散尽)
      for (let k = 0; k < this.afterHurt.length; k++) this.afterHurt[k](d, n, attacker, shot, src, melee);
    }
    if (this.hp <= 0) this.lethal();
    return d;
  }

  private onDodge(): void {
    this.addStat('dodges', 1);
    this.iframes = Math.max(this.iframes, 0.15);
    this.fx('dustPuff', this.px, this.py, { r: 18, life: 0.3 });
    this.sfx('dodge');
    this.dodgeWin = 2;
    const m = this.mods;
    // m8 (I2): every onDodge buff (广寒桂 …), keyed per effect; 后发先至 primes the weapons
    if (m.evBuffs.length) this.itemBuffs('onDodge', -1);
    if (m.prime) this.itemPrime();
    for (const sh of m.shards) {
      const raw = sh.base + this.scaleSum(sh.scale);
      for (let k = 0; k < sh.n; k++) {
        const a = this.face + (k - (sh.n - 1) / 2) * 0.6 + Math.PI;
        const i = this.PS.spawnSlot();
        if (i < 0) break;
        const PS = this.PS;
        PS.x[i] = this.px; PS.y[i] = this.py; PS.vx[i] = Math.cos(a) * 420; PS.vy[i] = Math.sin(a) * 420; PS.speed[i] = 420; PS.r[i] = 7;
        PS.life[i] = PS.life0[i] = 1.6; PS.kind[i] = PK.moonMote; PS.mode[i] = SMode.Homing; PS.homing[i] = 7;
        PS.dmg[i] = raw * this.dmgMultNow(); PS.critP[i] = clamp(this.stats.crit / 100, 0, 1); PS.critM[i] = F.critXDefault + this.stats.critDmg / 100;
        PS.src[i] = SRCI.item; PS.flags[i] = SF.projectile | SF.moonsoul;
      }
    }
    this.emit('dodge', -1, 0, false, 'enemy', this.px, this.py, -1);
  }

  private thorns(attacker: number, dealt: number, melee: boolean): void {
    const E = this.E;
    if (!E.alive[attacker]) return;
    for (const t of this.mods.thorns) {
      if (t.meleeOnly && !melee) continue;
      const raw = (t.base + this.scaleSum(t.scale)) * t.n + (dealt * t.dealtPct) / 100;
      if (raw <= 0) continue;
      this.strike(attacker, raw * this.dmgMultNow(), 0, 1, 0, this.px, this.py, -1, SRCI.item, HF.noCrit | HF.noProc);
      if (!E.alive[attacker]) return;
    }
  }

  /** A lethal hit: 阎王帖 → 九命 → the passive → 蓬莱 → death. */
  private lethal(): void {
    if (this.mods.surviveWave && !this.yanwangUsed) {
      this.yanwangUsed = true; this.hp = 1; this.invulnT = Math.max(this.invulnT, 1);
      this.title({ zh: '阎王帖', en: 'Summons Refused' }, 'edge');
      return;
    }
    if (this.run.char === 'cat' && this.lives > 0 && !this.lifeUsed) {
      this.lives--; this.lifeUsed = true; this.hp = 1; this.invulnT = PASSIVES.jiuming.p.iframe;
      this.fx('shieldBubble', this.px, this.py, { r: 30, life: 0.6 });
      this.sfx('bell');
      return;
    }
    for (const r of this.running) {
      if (r.failed || !r.b.lethal) continue;
      let saved = false;
      try { saved = r.b.lethal(this, r.s); } catch (e) { r.failed = true; this.hooks.error(e, false); }
      if (saved && this.hp > 0) return;
      if (saved) { this.hp = 1; return; }
    }
    if (this.mods.surviveRun && !this.once.includes('penglai')) {
      this.once.push('penglai');
      this.hp = Math.max(1, Math.round(this.hpMax * this.mods.surviveRun.hpPct));
      this.invulnT = 1.5;
      if (this.mods.surviveRun.clear) this.clearShots('enemy');
      this.title({ zh: '蓬莱仙丹', en: 'Elixir of Penglai' }, 'centre');
      this.sfx('levelUp');
      return;
    }
    this.hp = 0;
    if (this.goDown()) return;
    this.die(false);
  }

  /**
   * 破镜重圆: the run's first death (logic canRevive(run)) goes 'down' instead, when the UI answers
   * `downed`. The world holds still (engine: nothing steps, the fall animates DOWN_ANIM s, then the
   * frame holds) until revive() or giveUp(). False (die now) without the hook or once revived.
   */
  private goDown(): boolean {
    if (this.phase !== 'wave' || !this.downedHook || !canRevive(this.run)) return false;
    this.phase = 'down';
    this.downAge = 0; this.downX = this.px; this.downY = this.py;
    this.pvx = this.pvy = 0; this.moving = false; this.dashT = 0; this.hitstopMs = 0;
    this.sfx('shatter');
    this.pushHud(true);
    const d = this.downInfo;
    d.canRevive = true; d.price = REVIVE.price; d.wave = this.wave; d.cause = this.cause;
    try { this.downedHook(d); } catch (e) {
      console.error("[mirror engine] the UI's downed hook threw; giving up", e);
      this.giveUp();
    }
    return true;
  }
  /** The fall is still animating (the engine keeps drawing frames until then). */
  get downAnimating(): boolean { return this.phase === 'down' && this.downAge < DOWN_ANIM; }

  /**
   * Rise where you fell (Engine.revive): REVIVE.hpPct of max 气血, REVIVE.invuln s invulnerable with
   * the shimmer, your burns and poisons, root and slow washed off; the revival shockwave throws the
   * crowd within REVIVE.pushR back (bosses stand) and enemy shots within REVIVE.clearR are wiped;
   * run.revived = true (the engine's run object: the session must persist it). No RNG is drawn, so a
   * replay that revives at the same step stays deterministic. False unless down.
   */
  revive(): boolean {
    if (this.phase !== 'down') return false;
    this.run.revived = true;
    this.phase = 'wave';
    this.downAge = 0;
    this.hp = Math.max(1, Math.round(this.hpMax * REVIVE.hpPct));
    this.invulnT = Math.max(this.invulnT, REVIVE.invuln);
    this.reviveT = REVIVE.invuln;
    this.dotDps.fill(0); this.dotT.fill(0); this.dotAcc = 0;
    this.rootT = 0; this.pslowT = 0; this.pslowV = 0;
    const x = this.px, y = this.py;
    // the revival shockwave: the crowd near you is thrown back (a plain scan: this runs once a run)
    const E = this.E;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.kind[i] === EKind.Boss || E.kind[i] === EKind.Ally) continue;
      if (Math.hypot(E.x[i] - x, E.y[i] - y) < REVIVE.pushR + E.r[i]) this.push(E.handle(i), x, y, REVIVE.push);
    }
    // … and the enemy shots near you are gone (a wisp of ink where each was)
    const ES = this.ES, c2 = REVIVE.clearR * REVIVE.clearR;
    for (let i = 0; i < ES.n; i++) {
      if (!ES.alive[i]) continue;
      const dx = ES.x[i] - x, dy = ES.y[i] - y;
      if (dx * dx + dy * dy > c2) continue;
      if ((i & 3) === 0) this.fx('inkBurst', ES.x[i], ES.y[i], { r: 8, life: 0.3 });
      ES.release(i);
    }
    reviveFx(this);
    this.title({ zh: '破镜重圆', en: 'The Mirror Made Whole' }, 'centre');
    this.sfx('levelUp');
    this.sfx('bell');
    this.pushHud(true);
    return true;
  }
  /** Decline the revive (Engine.giveUp): the normal death, hooks.death → 'dead'. A no-op unless down. */
  giveUp(): void {
    if (this.phase !== 'down') return;
    this.phase = 'wave';
    this.die(true);
  }

  private die(quiet: boolean): void {
    if (this.phase !== 'wave') return;
    this.phase = 'dead';
    for (const r of this.running) { if (!r.failed && r.b.end) { try { r.b.end(this, r.s); } catch { /* ignore */ } } }
    if (!quiet) this.sfx('shatter');
    const partial = this.result();
    const d: DeathResult = { wave: this.wave, partial, cause: this.cause };
    this.pushHud(true);
    this.hooks.death(d);
  }

  // ═══════════════════════════════════════════════════════════ WorldApi: the player

  heal(n: number): void { this.healRaw(n, true); }
  healRaw(n: number, mult: boolean): void {
    if (n <= 0 || this.phase !== 'wave') return;
    const v = mult ? n * healMult(this.stats) : n;
    const room = this.hpMax - this.hp;
    const got = Math.min(room, v);
    this.hp += got;
    this.addStat('healed', got);
    const over = v - got;
    if (over > 0 && this.run.char === 'rabbit') this.shieldV = Math.min(this.hpMax * PASSIVES.yaoxiang.p.shield, this.shieldV + over);
    if (got >= 1 && this.settings.nums === 2) this.addNum(got, this.px, this.py - 18, 2);
  }
  shield(n: number, cap?: number): void {
    this.shieldV = Math.min(cap ?? this.hpMax, this.shieldV + n);
  }
  dash(dirX: number, dirY: number, dist: number, dur: number, invuln = 0): void {
    const L = Math.hypot(dirX, dirY) || 1;
    this.dashX = dirX / L; this.dashY = dirY / L; this.dashV = dist / Math.max(0.02, dur); this.dashT = dur;
    if (invuln > 0) this.invulnT = Math.max(this.invulnT, invuln);
    this.face = Math.atan2(this.dashY, this.dashX);
  }
  leap(to: Vec, dur: number, untargetable = false): void {
    V.x = to.x; V.y = to.y;
    this.clampToArena(V, this.pr);
    this.leapFX = this.px; this.leapFY = this.py; this.leapTX = V.x; this.leapTY = V.y; this.leapDur = Math.max(0.05, dur); this.leapT = this.leapDur;
    if (untargetable) this.untargT = Math.max(this.untargT, dur);
  }
  invuln(dur: number): void { this.invulnT = Math.max(this.invulnT, dur); }
  untargetable(dur: number): void { this.untargT = Math.max(this.untargT, dur); }
  root(dur: number): void { this.rootT = Math.max(this.rootT, dur); }
  buff(key: string, stats: StatMods, dur: number, moveX = 1): void {
    for (const b of this.buffs) if (b.key === key) { b.stats = stats; b.t = dur; b.moveX = moveX; return; }
    this.buffs.push({ key, stats, t: dur, moveX });
  }
  addDrunk(n: number): void {
    if (!this.drunkOn) return;
    this.drunk = clamp(this.drunk + n * (this.run.char === 'poet' ? PASSIVES.baipian.p.drunkX : 1), 0, this.drunkCap);
    this.drunkIdle = 0;
  }
  refundSkill(sec: number): void { this.skillCd = Math.max(0, this.skillCd - sec); }

  /** Slow the player (strongest applies). */
  slowPlayer(v: number, dur: number): void {
    if (v >= this.pslowV || this.pslowT <= 0) { this.pslowV = Math.min(0.8, v); this.pslowT = Math.max(this.pslowT, dur); }
  }
  /** A DoT on the player (burns, clouds): undodgeable, ignores armour. */
  dotPlayer(dps: number, dur: number): void {
    let k = 0, lo = Infinity;
    for (let s = 0; s < 6; s++) if (this.dotT[s] < lo) { lo = this.dotT[s]; k = s; }
    this.dotDps[k] = dps; this.dotT[k] = dur;
  }
  /** Pull the player toward (x, y) by dist (金蟾's tongue); 定海神针 makes you immune. */
  pullPlayer(x: number, y: number, dist: number): void {
    if (this.mods.knockImmune) return;
    let dx = x - this.px, dy = y - this.py;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    this.pkx = (dx * dist) / 0.2; this.pky = (dy * dist) / 0.2; this.pkT = 0.2;
  }

  // ═══════════════════════════════════════════════════════════ presentation

  fx(name: FxName, x: number, y: number, o?: { r?: number; dir?: number; life?: number; tint?: string }): void {
    const P = this.P;
    const lim = this.degrade ? P.cap >> 1 : P.cap;
    if (P.count >= lim) return;
    const i = P.take();
    if (i < 0) return;
    P.kind[i] = name; P.x[i] = x; P.y[i] = y; P.vx[i] = 0; P.vy[i] = 0;
    P.life[i] = P.life0[i] = o?.life ?? 0.3; P.r[i] = o?.r ?? 16; P.dir[i] = o?.dir ?? 0; P.len[i] = 0; P.a[i] = 1;
  }
  /** A stretched fx along a segment (beams, chains, streaks). */
  fxLine(name: FxName, x: number, y: number, dir: number, len: number, life: number, w = 1): void {
    const P = this.P;
    if (P.count >= P.cap) return;
    const i = P.take();
    if (i < 0) return;
    P.kind[i] = name; P.x[i] = x; P.y[i] = y; P.vx[i] = 0; P.vy[i] = 0; P.life[i] = P.life0[i] = life; P.r[i] = w; P.dir[i] = dir; P.len[i] = len; P.a[i] = 1;
  }
  title(text: Bilingual, where: 'edge' | 'centre' = 'edge'): void {
    if (where === 'edge') { if (this.titleGate > 0) return; this.titleGate = 1; }
    this.titles.push({ text, where, t: where === 'centre' ? 1.4 : 0.6 });
    if (this.titles.length > 4) this.titles.shift();
  }
  /** A boss's slam shakes the screen a little (the feel layer: ≤ 2 px, at most one per 0.5 s, off with
   *  the shake setting). The player's own weapons, 镜技 and the elites never call it: their blows show on
   *  the bodies. */
  shake(px: number): void {
    this.feel.shake(px);
  }
  /** Micro-hitstop, paid from the feel layer's bucket (≤ ~14% of any second). */
  hitstop(ms: number): void {
    this.feel.stop(ms);
  }
  sfx(name: SfxName): void {
    try { this.audio?.sfx(name); } catch { /* audio optional */ }
  }
  light(r: number | null): void { this.lightR = r; }
  /**
   * Set 嫦娥's moon to a phase now (0 full … 4 new); the 16 s cycle runs on from there. Not in
   * WorldApi yet (CHANGE REQUEST): 广寒清辉 sets 满月 through `(w as World).setMoon(0)`.
   */
  setMoon(phase: number): void {
    const step = PASSIVES.yinqing.p.cycle / 8;
    this.moonT0 = (((phase % 8) + 8) % 8) * step - this.t + 1e-6;
    this.moonPhase = ((phase % 8) + 8) % 8;
  }

  after(sec: number, fn: (w: WorldApi) => void): number { return this.timer(sec, 0, fn); }
  every(sec: number, fn: (w: WorldApi) => void): number { return this.timer(sec, Math.max(0.05, sec), fn); }
  private timer(t: number, every: number, fn: (w: WorldApi) => void): number {
    const TM = this.TM;
    const i = TM.take();
    if (i < 0) return -1;
    TM.gen[i] = (TM.gen[i] + 1) % 0x100000;
    TM.t[i] = t; TM.every[i] = every; TM.fn[i] = fn;
    return TM.gen[i] * 1024 + i;
  }
  cancel(timer: number): void {
    const i = timer % 1024;
    if (timer >= 0 && i < this.TM.cap && this.TM.alive[i] && this.TM.gen[i] === Math.floor(timer / 1024)) { this.TM.release(i); this.TM.fn[i] = null; }
  }

  // ═══════════════════════════════════════════════════════════ events and tallies

  fillEv(type: GameEvent['type'], e: number, dmg: number, crit: boolean, src: DamageSrc, x: number, y: number, slot: number): GameEvent {
    // one reused event object per re-entry depth, so a nested emit cannot rewrite the event the
    // outer handlers are still reading
    const ev = this.evs[this.qd] ?? (this.evs[this.qd] = { type: 'hit', e: -1, dmg: 0, crit: false, src: 'weapon', x: 0, y: 0, slot: -1 });
    ev.type = type; ev.e = e; ev.dmg = dmg; ev.crit = crit; ev.src = src; ev.x = x; ev.y = y; ev.slot = slot;
    return ev;
  }
  /** Send a combat event to the running behaviours and the skill run. */
  emit(type: GameEvent['type'], e: number, dmg: number, crit: boolean, src: DamageSrc, x: number, y: number, slot: number): void {
    const n = this.running.length;
    if (!n && !this.skillRun?.on) return;
    const ev = this.fillEv(type, e, dmg, crit, src, x, y, slot);
    this.qd++;
    try {
      for (let k = 0; k < n; k++) {
        const r = this.running[k];
        if (r.failed || !r.b.on) continue;
        try { r.b.on(this, r.s, ev); } catch (err) { r.failed = true; this.hooks.error(err, false); }
      }
      if (this.skillRun?.on) { try { this.skillRun.on(this, ev); } catch (err) { this.hooks.error(err, false); } }
    } finally { this.qd--; }
  }
  addStat(k: RunStatKey, v: number): void { this.rs[k] = (this.rs[k] ?? 0) + v; }
  maxStat(k: RunStatKey, v: number): void { if (v > (this.rs[k] ?? 0)) this.rs[k] = v; }
  scaleSum(scale: StatMods | undefined): number {
    let r = 0;
    if (scale) for (const k in scale) r += (scale[k as keyof Stats] ?? 0) * this.stats[k as keyof Stats];
    return r;
  }

  // ═══════════════════════════════════════════════════════════ drops (§6, §16.3)

  dropMoon(x: number, y: number, worth: number): void {
    // m8 (PLAN D20): 满月 25 / 月华珠 5 / 月华 1, greedily; one 月华 per whole point below 5 and a fractional
    // remainder rides on the last piece, so an ordinary 1–3 kill drops exactly as before
    const P = splitMoon(worth, this.moonPieces);
    for (let k = 0; k < P.length; k++) this.dropOne(moonKindOf(P[k]), x, y, P[k], -1);
  }
  /**
   * One pickup. m8 (PLAN E4) `o`: `own` = your own scattered 月华 (千金散尽: picked up, it only comes back; left
   * lying at the wave's end, it is result().lost); `hold` = seconds before it can be pulled or taken; `noFuse` =
   * never joins a 浓墨 fusion.
   */
  dropOne(kind: number, x: number, y: number, worth: number, coin: number, o?: { own?: boolean; hold?: number; noFuse?: boolean }): void {
    const D = this.D;
    // 浓墨: past 300 on the ground, drops fuse (a moon drop joins an existing one; m8: never an own piece)
    if (!o?.noFuse && isMoonKind(kind) && D.count >= F.thickAbove) {
      let pick = -1;
      for (let tries = 0; tries < 6; tries++) {
        const j = Math.floor(this.erng() * D.n);
        if (D.alive[j] && !D.own[j] && isMoonKind(D.kind[j])) { pick = j; break; }
      }
      if (pick >= 0) {
        D.worth[pick] += worth;
        // m8: the fused piece wears the pearl of its worth (月华珠 from 5, 满月 from 25; never smaller)
        const fk = moonKindOf(D.worth[pick]);
        if (fk === DK.moonFull || (fk === DK.moonThick && D.kind[pick] === DK.moonDrop)) D.kind[pick] = fk;
        return;
      }
    }
    let i = D.take();
    if (i < 0) {
      // m8: an own piece with nowhere to land simply stays yours
      if (o?.own) { this.moonHeld += worth; return; }
      // the pool is full: 月华 (and gold that is only 月华) is collected at once …
      if (isMoonWorth(kind)) { this.collectPiece(kind, worth); return; }
      // … and anything else takes the slot of the oldest 月华 on the ground, which is collected
      // (a planned 铜钱 is real money and must never be lost)
      let old = -1, oa = -1;
      for (let j = 0; j < D.n; j++) {
        if (!D.alive[j]) continue;
        const kj = D.kind[j];
        if (isMoonWorth(kj) && D.age[j] > oa) { oa = D.age[j]; old = j; }
      }
      if (old < 0) {
        // nothing to evict (the ground is all coins, seeds and crates): a coin goes straight to the sleeve
        if (coin >= 0 && coin < this.setup.coins.length) this.sleeveCoin(this.setup.coins[coin], kind);
        return;
      }
      const w = D.worth[old];
      D.release(old);
      // m8: an own piece only comes back (no XP, no 蓄月 draw, no tally)
      if (D.own[old]) this.moonHeld += w; else this.collectPiece(D.kind[old], w);
      i = D.take();
      if (i < 0) return;
    }
    const a = this.erng() * TAU, s = 60 + 80 * this.erng();
    D.kind[i] = kind; D.x[i] = x; D.y[i] = y; D.vx[i] = Math.cos(a) * s; D.vy[i] = Math.sin(a) * s;
    D.worth[i] = worth; D.age[i] = 0; D.magnet[i] = kind === DK.crateBox || kind === DK.heartDrop || kind === DK.relicMirror || kind === DK.relicSword ? 1 : 0; D.coin[i] = coin;
    D.own[i] = o?.own ? 1 : 0; D.hold[i] = o?.hold ?? 0;
    // a 镜宝 rises from the fallen boss and hangs there ~0.75 s (the pop arc runs while age < 0.25) before it
    // flies to you, so the moment reads; same RNG draws as any drop
    if (kind === DK.relicMirror || kind === DK.relicSword) { D.vx[i] = 0; D.vy[i] = -150; D.age[i] = -0.5; }
  }

  private tickDrops(dt: number): void {
    const D = this.D;
    const pr = this.pickupR, pr2 = pr * pr, take = this.pr + 12;
    const fetch = this.mods.familiar?.fetch ?? 0;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      D.age[i] += dt;
      // the 0.25 s pop arc
      if (D.age[i] < 0.25) { D.x[i] += D.vx[i] * dt; D.y[i] += D.vy[i] * dt; D.vx[i] *= 0.88; D.vy[i] *= 0.88; continue; }
      // m8 (E4): a held piece (千金散尽's landing) can't be pulled or taken yet
      if (D.hold[i] > 0) { D.hold[i] -= dt; continue; }
      const dx = this.px - D.x[i], dy = this.py - D.y[i], d2 = dx * dx + dy * dy;
      const k = D.kind[i];
      if (!D.magnet[i] && d2 < pr2) { D.magnet[i] = 1; this.feel.zip(); }
      if (!D.magnet[i] && fetch > 0 && d2 < fetch * fetch && this.summonsAlive >= 0 && isMoonKind(k)) D.magnet[i] = 1;
      if (D.magnet[i]) {
        const d = Math.sqrt(d2) || 1;
        const sp = Math.min(F.pickupMaxSpeed, 260 + D.age[i] * 900) * (D.magnet[i] === 2 ? 1.4 : 1);
        D.x[i] += (dx / d) * sp * dt; D.y[i] += (dy / d) * sp * dt;
        // m8 月华如练: a streaming piece (engine/content/items.ts sets onStream)
        if (this.onStream !== null) this.onStream(i);
      }
      if (d2 <= take * take) this.pickup(i);
    }
  }

  private pickup(i: number): void {
    const D = this.D;
    const k = D.kind[i], worth = D.worth[i];
    this.feel.pickup(D.x[i], D.y[i], k === DK.cashCoin || k === DK.cashString || k === DK.cashTen || k === DK.goldShard);
    D.release(i);
    // m8 (E4): your own scattered 月华 comes back as it was: no XP, no 蓄月 draw, no tally, no pickup event
    if (D.own[i]) { this.moonHeld += worth; return; }
    switch (k) {
      case DK.moonDrop: case DK.moonThick: case DK.moonFull: case DK.goldShard: case DK.carpGold:
        this.collectPiece(k, worth);
        break;
      case DK.crateBox: this.sfx('crate'); break;
      case DK.lotusSeed: this.heal(F.lotusHeal); this.sfx('pickup'); break;
      case DK.heartDrop: this.sfx('bell'); break;
      case DK.relicMirror: case DK.relicSword: this.sfx('merge'); this.fx('levelRing', this.px, this.py, { r: 60, life: 0.45 }); break;
      case DK.cashCoin: case DK.cashString: case DK.cashTen: {
        const c = D.coin[i];
        const drop = c >= 0 && c < this.setup.coins.length ? this.setup.coins[c] : { kind: 'cashCoin', worth: 1, src: 'wave' } as CoinDrop;
        this.sleeveCoin(drop, k);
        break;
      }
    }
    this.emit('pickup', -1, worth, false, 'item', this.px, this.py, -1);
  }
  /** A 铜钱 goes into the sleeve (picked up, or straight in when there is nowhere to drop it). */
  private sleeveCoin(drop: CoinDrop, k: number): void {
    this.sleeve.push(drop);
    let s = 0;
    for (const x of this.sleeve) s += x.worth;
    this.hooks.coin(drop, s);
    this.sfx(k === DK.cashTen ? 'coinTen' : k === DK.cashString ? 'coinString' : 'coin');
    this.addNum(drop.worth, this.px, this.py - 24, 4);
  }
  private pickCombo = 0;
  private pickT = 0;
  collectMoon(worth: number, draws = 1, big = 0): void {
    let w = worth;
    // 蓄月: each pickup draws one extra from the store until it is empty (m8, PLAN D21: a pearl draws one per
    // whole point of its worth, `draws`, so the tiers leave the income as it was)
    if (this.store > 0) { const s = Math.min(this.store, draws); this.store -= s; this.storeUsed += s; w += s; }
    this.moonGot += w;
    this.moonHeld += w;
    this.addStat('moonCollected', w);
    const xpX = this.run.char === 'scholar' ? 1 + PASSIVES.bolan.p.xp / 100 : 1;
    const xp = w * xpX;
    this.xpGot += xp;
    this.xpLive += xp;
    while (this.xpLive >= xpNext(this.lvl)) {
      this.xpLive -= xpNext(this.lvl);
      this.lvl++;
      this.levels++;
      this.levelUp();
    }
    if (this.t - this.pickT > 0.6) this.pickCombo = 0;
    this.pickT = this.t;
    this.pickCombo++;
    // the chime climbs 宫商角徵羽 on every other pickup; m8: a 月华珠 / 满月 always sounds, an octave up, and a
    // 满月 adds a soft bell (big: 1 月华珠, 2 满月)
    try {
      if (big > 0) { this.audio?.pickup(((this.pickCombo >> 1) % 10) + 5); if (big >= 2) this.audio?.sfx('bell', { gain: 0.5 }); }
      else if ((this.pickCombo & 1) === 1) this.audio?.pickup((this.pickCombo >> 1) % 10);
    } catch { /* optional */ }
  }
  /** Mid-wave level: +1 气血 and heal 1, a 120 u knockback ring and the chime (GDD §6, §20). */
  private levelUp(): void {
    this.hpBonus++;
    this.hpMax++;
    this.hp = Math.min(this.hpMax, this.hp + 1);
    this.fx('levelRing', this.px, this.py, { r: 120, life: 0.5 });
    this.sfx('levelUp');
    this.feel.level(this.px, this.py);
    const E = this.E, buf = this.q0;
    const n = this.hash.gather(this.px, this.py, 160, buf);
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!E.alive[i] || E.kind[i] === EKind.Boss) continue;
      if (Math.hypot(E.x[i] - this.px, E.y[i] - this.py) < 120 + E.r[i]) this.push(E.handle(i), this.px, this.py, 120);
    }
    this.hooks.levelUp(this.lvl);
  }

  // ═══════════════════════════════════════════════════════════ enemy shots, zones, teles, particles, numbers

  private tickEnemyShots(dt: number): void {
    const ES = this.ES;
    const pr = this.pr;
    const obs = this.arena.obstacles;
    for (let i = 0; i < ES.n; i++) {
      if (!ES.alive[i]) continue;
      ES.life[i] -= dt;
      if (ES.mode[i] === SMode.Lob) {
        if (ES.life[i] <= 0) {
          // lands: damages within its radius
          const dx = this.px - ES.tx[i], dy = this.py - ES.ty[i];
          if (dx * dx + dy * dy <= (ES.r[i] + pr) * (ES.r[i] + pr)) this.shotHitsPlayer(i);
          this.fx('dustPuff', ES.tx[i], ES.ty[i], { r: ES.r[i], life: 0.3 });
          ES.release(i);
          continue;
        }
        const k = 1 - ES.life[i] / ES.life0[i];
        ES.x[i] = ES.px[i] + (ES.tx[i] - ES.px[i]) * k;
        ES.y[i] = ES.py[i] + (ES.ty[i] - ES.py[i]) * k;
        continue;
      }
      if (ES.life[i] <= 0) { ES.release(i); continue; }
      if (ES.mode[i] === SMode.Homing && ES.homing[i] > 0) {
        const a = Math.atan2(this.py - ES.y[i], this.px - ES.x[i]);
        const cur = Math.atan2(ES.vy[i], ES.vx[i]);
        const sp = Math.hypot(ES.vx[i], ES.vy[i]);
        const na = cur + clamp(angDiff(a, cur), -ES.homing[i] * dt, ES.homing[i] * dt);
        ES.vx[i] = Math.cos(na) * sp; ES.vy[i] = Math.sin(na) * sp;
      }
      if (ES.mode[i] === SMode.BoomOut && ES.life[i] < ES.life0[i] / 2) { ES.vx[i] = -ES.vx[i]; ES.vy[i] = -ES.vy[i]; ES.mode[i] = SMode.BoomBack; }
      ES.x[i] += ES.vx[i] * dt;
      ES.y[i] += ES.vy[i] * dt;
      // lotus, bamboo and the tree all stop enemy shots
      let blocked = false;
      for (let o = 0; o < obs.length; o++) {
        const dx = ES.x[i] - obs[o].x, dy = ES.y[i] - obs[o].y;
        if (dx * dx + dy * dy < obs[o].r * obs[o].r) { blocked = true; break; }
      }
      if (blocked || !insideShape(this.arena.shape, ES.x[i], ES.y[i], -60)) { ES.release(i); continue; }
      const dx = this.px - ES.x[i], dy = this.py - ES.y[i], rr = ES.r[i] + pr;
      if (dx * dx + dy * dy <= rr * rr) {
        if (this.shotHitsPlayer(i)) ES.release(i);
      }
    }
  }
  /** Returns true when the shot is spent. */
  private shotHitsPlayer(i: number): boolean {
    const ES = this.ES;
    if (this.untargT > 0 || this.leapT > 0) return false;
    const sp = Math.hypot(ES.vx[i], ES.vy[i]) || 1;
    this.hurtSrcX = ES.x[i] - (ES.vx[i] / sp) * 40; this.hurtSrcY = ES.y[i] - (ES.vy[i] / sp) * 40;
    const dealt = this.hurtFrom(ES.dmg[i], -1, false, false, ES.owner[i] >= 0 ? this.E.id[ES.owner[i]] : 'shot', false, false, i);
    this.hurtSrcX = NaN; this.hurtSrcY = NaN;
    if (dealt > 0 && ES.status[i]) {
      const kind = ES.status[i] - 1;
      if (kind === STI.slow) this.slowPlayer(ES.statusV[i] || 0.3, ES.statusDur[i]);
      else if (kind === STI.root) this.root(ES.statusDur[i]);
      else if (kind === STI.burn) this.dotPlayer(ES.statusV[i], ES.statusDur[i]);
    }
    return true;
  }

  private tickZones(dt: number): void {
    const Z = this.Z, E = this.E;
    for (let i = 0; i < Z.n; i++) {
      if (!Z.alive[i]) continue;
      Z.life[i] -= dt;
      Z.age[i] += dt;
      if (Z.life[i] <= 0) { this.zoneEnd(i); continue; }
      if (Z.follow[i]) { Z.x[i] = this.px; Z.y[i] = this.py; }
      if (Z.fn[i] && Z.tick[i] > 0) {
        Z.tickT[i] -= dt;
        if (Z.tickT[i] <= 0) {
          Z.tickT[i] += Z.tick[i];
          try { Z.fn[i]!(this, Z.gen[i] * 1024 + i); } catch (e) { Z.fn[i] = null; this.hooks.error(e, false); }
          if (!Z.alive[i]) continue;
        }
      }
      const x = Z.x[i], y = Z.y[i], r = Z.r[i];
      if (Z.side[i] === 0) {
        // enemy zones act on the player (webs, clouds, puddles): undodgeable DoT, slows
        const dx = this.px - x, dy = this.py - y;
        // 嫦娥 floats over the core's ground zones (webs, spore clouds): never slowed, half the burn (round 5:
        // with the late HP wall gone these zones are what ends endless runs, and full immunity took her to
        // the cap every time); content zones decide for themselves
        const floats = this.run.char === 'change' && Z.code[i] !== 0;
        if (dx * dx + dy * dy <= (r + this.pr * 0.5) * (r + this.pr * 0.5)) {
          if (!floats && Z.slow[i] > 0) this.slowPlayer(Z.slow[i] > 1 ? Z.slow[i] / 100 : Z.slow[i], 0.15);
          if (Z.dps[i] > 0) this.dotPlayer(Z.dps[i] * (floats ? 0.5 : 1), 0.2);
        }
      } else if (Z.slow[i] > 0 || Z.dps[i] > 0 || Z.code[i] > 0) {
        this.zoneOnEnemies(i, x, y, r, dt);
      }
    }
    void E;
  }
  private zoneOnEnemies(z: number, x: number, y: number, r: number, dt: number): void {
    const Z = this.Z, E = this.E, buf = this.q1;
    const n = this.hash.gather(x, y, r + 64, buf);
    Z.tickT[z] -= Z.fn[z] ? 0 : dt;
    const pulse = Z.code[z] > 0 && Z.tickT[z] <= 0;
    if (pulse) Z.tickT[z] += 0.5;
    for (let k = 0; k < n; k++) {
      const i = buf[k];
      if (!E.alive[i] || E.hidden[i] || E.kind[i] === EKind.Ally) continue;
      const dx = E.x[i] - x, dy = E.y[i] - y, rr = r + E.r[i];
      if (dx * dx + dy * dy > rr * rr) continue;
      if (Z.slow[z] > 0) this.statusSlot(i, 'slow', 0.2, Z.slow[z]);
      if (Z.dps[z] > 0) this.strike(i, Z.dps[z] * dt, 0, 1, 0, x, y, -1, SRCI.item, HF.dot | HF.noProc | HF.quiet);
      if (pulse && Z.code[z] === ZC.fire) this.statusSlot(i, 'burn', 1, Z.v[z]);
      if (pulse && Z.code[z] === ZC.trail) this.strike(i, Z.v[z], clamp(this.stats.crit / 100, 0, 1), F.critXDefault + this.stats.critDmg / 100, 0, x, y, -1, SRCI.item, HF.quiet);
    }
  }
  private zoneEnd(i: number): void {
    this.Z.release(i);
    this.Z.fn[i] = null;
  }

  private tickTeles(dt: number): void {
    const T = this.T;
    for (let i = 0; i < T.n; i++) {
      if (!T.alive[i]) continue;
      T.t[i] += dt;
      if (T.t[i] < T.dur[i]) continue;
      const fn = T.fn[i], code = T.code[i], owner = T.owner[i], v = T.v[i];
      const shape = T.shape[i];
      T.release(i);
      T.fn[i] = null;
      // m8: the telegraph striking now, for the guard's 破招 (WorldApi.underTele)
      this.teleOwner = owner;
      try {
        if (code) strikeTele(this, code, shape, owner, v);
        if (fn) { try { fn(this); } catch (e) { this.hooks.error(e, false); } }
      } finally { this.teleOwner = -1; }
    }
  }

  private tickParticles(dt: number): void {
    const P = this.P;
    for (let i = 0; i < P.n; i++) {
      if (!P.alive[i]) continue;
      P.life[i] -= dt;
      if (P.life[i] <= 0) { P.release(i); continue; }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt;
    }
  }

  /** Numbers merge per target every 0.25 s (GDD §20); each flies a short arc (up, then settling). */
  private tickNumbers(dt: number): void {
    const E = this.E;
    for (let i = 0; i < E.n; i++) {
      if (!E.alive[i] || E.numAcc[i] <= 0) continue;
      E.numT[i] += dt;
      if (E.numT[i] >= 0.25) this.flushNumber(i);
    }
    const N = this.N;
    for (let i = 0; i < N.n; i++) {
      if (!N.alive[i]) continue;
      N.t[i] += dt;
      N.age[i] += dt;
      N.x[i] += N.vx[i] * dt; N.y[i] += N.vy[i] * dt;
      N.vy[i] += NUM_GRAVITY * dt; N.vx[i] *= Math.exp(-3 * dt);
      if (N.t[i] > NUM_LIFE) { N.release(i); continue; }
    }
  }
  flushNumber(i: number): void {
    const E = this.E;
    const v = E.numAcc[i];
    if (v > 0) {
      const crit = E.numCrit[i] === 1;
      if (this.settings.nums === 2 || (this.settings.nums === 1 && crit)) {
        // many hits on one body stack into its live number (re-popping it) rather than a pile
        const N = this.N, j = E.numIdx[i], h = E.handle(i);
        if (this.liveNum(i)) {
          N.v[j] += v;
          if (crit) N.style[j] = 1;
          N.t[j] = 0.02;
          N.vy[j] = Math.min(N.vy[j], -90);
          N.sz[j] = this.numSize(N.v[j], N.style[j] === 1);
        } else {
          const k = this.addNum(v, E.x[i], E.y[i] - E.r[i], crit ? 1 : 0);
          if (k >= 0) { this.N.owner[k] = h; E.numIdx[i] = k; }
        }
      }
    }
    E.numAcc[i] = 0; E.numT[i] = 0; E.numCrit[i] = 0;
  }
  /** Does body i still show a number that later hits can merge into? */
  private liveNum(i: number): boolean {
    const N = this.N, j = this.E.numIdx[i];
    return j >= 0 && N.alive[j] === 1 && N.owner[j] === this.E.handle(i) && N.t[j] < 0.45 && N.age[j] < 1.4;
  }
  /** Size of a number by damage against the running mean of hits (≤ 1.2×; crits a touch up): numbers
   *  must never outshout the enemy shots (GDD §20). */
  private numSize(v: number, crit: boolean): number {
    const k = Math.log2(Math.max(0.1, v) / Math.max(1, this.feel.numRef));
    return Math.max(0.85, Math.min(1.2, 1 + 0.12 * k)) * (crit ? 1.04 : 1);
  }
  /** style: 0 hit · 1 crit · 2 heal · 3 moon · 4 coin · 5 player. Returns the slot (−1 none). */
  addNum(v: number, x: number, y: number, style: number): number {
    if (this.settings.nums === 0 && style !== 4) return -1;
    const N = this.N;
    let i = N.take();
    if (i < 0) {
      // full: the oldest plain number gives way to a crit, a coin or your own wound
      if (style === 0) return -1;
      let old = -1, ot = -1;
      for (let j = 0; j < N.n; j++) if (N.alive[j] && N.style[j] === 0 && N.t[j] > ot) { ot = N.t[j]; old = j; }
      if (old < 0) return -1;
      i = old;
    }
    const f = this.feel;
    if (style === 0) f.numRef += (v - f.numRef) * 0.05;
    // one blow on a packed crowd: the numbers born with this one stack upward (≤ 3), the rest stay
    // quiet — a wall of numerals would hide the shots and telegraphs behind it
    if (style <= 1) {
      let over = 0;
      for (let j = 0; j < N.n; j++) {
        if (j === i || !N.alive[j] || N.age[j] > 0.06 || N.style[j] > 1) continue;
        if (Math.abs(N.x[j] - x) < 36 && Math.abs(N.y[j] - y + over * 18) < 20) over++;
      }
      if (over >= 3) { N.release(i); return -1; }
      y -= over * 18;
    }
    N.v[i] = v; N.x[i] = x + (f.rnd() - 0.5) * 10; N.y[i] = y; N.t[i] = 0; N.age[i] = 0; N.style[i] = style; N.owner[i] = -1;
    N.vx[i] = (f.rnd() - 0.5) * 90; N.vy[i] = -(150 + 60 * f.rnd()) * (style === 1 ? 1.15 : 1);
    N.sz[i] = style === 0 || style === 1 ? this.numSize(v, style === 1) : style === 5 ? 1.15 : 1;
    return i;
  }

  // ═══════════════════════════════════════════════════════════ the wave's end (GDD §3)

  private checkWaveEnd(): void {
    if (this.phase !== 'wave') return;
    if (this.len !== null) {
      if (this.tWave >= this.len) this.beginEnding();
    } else if (this.bossesSpawned && this.bossH.length) {
      let left = 0;
      for (const h of this.bossH) if (this.E.slotOf(h) >= 0) left++;
      if (left === 0) this.beginEnding();
    }
  }

  fieldMoon = 0;
  /** The last won wave's result (null until a wave is won; cleared by begin). */
  lastResult: WaveResult | null = null;
  beginEnding(): void {
    if (this.phase !== 'wave') return;
    this.phase = 'ending';
    this.endingT = 1.2;
    // a boss's 镜宝 title is up in the centre already (the last body just fell): it says the wave is won,
    // and 「破」 would print over it
    if (this.t - this.relicTitleAt > 1.2) this.title({ zh: `第 ${this.wave} 重 · 破`, en: `Wave ${this.wave} · Clear` }, 'centre');
    this.sfx('gong');
    // the HUD (and the band's clear cue) hear the wave end now, with the 「破」, not 1.2 s later
    this.pushHud(true);
    try { this.painter?.wash(0.08); } catch { /* optional */ }
    // enemies and their shots dissolve with no drops
    const E = this.E;
    for (let i = 0; i < E.n; i++) if (E.alive[i]) { this.fx('inkBurst', E.x[i], E.y[i], { r: E.r[i] * 1.4, life: 0.5 }); E.release(i); }
    this.ES.clear();
    this.T.clear();
    this.TM.clear();
    // field 月华 → 蓄月; 铜钱, crates and hearts fly to you
    let field = 0;
    const D = this.D;
    for (let i = 0; i < D.n; i++) {
      if (!D.alive[i]) continue;
      const k = D.kind[i];
      // m8 (E4): your own 月华 left lying is lost (result().lost), never 蓄月
      if (D.own[i]) { this.ownLost += D.worth[i]; this.fx('petalBurst', D.x[i], D.y[i], { r: 8, life: 0.4 }); D.release(i); continue; }
      if (isMoonWorth(k)) { field += D.worth[i]; this.fx('petalBurst', D.x[i], D.y[i], { r: 8, life: 0.4 }); D.release(i); }
      else if (k !== DK.relicMirror && k !== DK.relicSword) D.magnet[i] = 2; // a 镜宝 keeps its own rise and flight
    }
    this.fieldMoon = field;
    for (const r of this.running) { if (!r.failed && r.b.end) { try { r.b.end(this, r.s); } catch (e) { this.hooks.error(e, false); } } }
    this.running.length = 0;
    if (this.skillRun) { try { this.skillRun.end?.(this); } catch { /* ignore */ } this.skillRun = null; }
    // summons and stones expire
    this.S.clear(); this.ST.clear(); this.Z.clear(); this.PS.clear();
    this.swordsAir = 0; this.summonsAlive = 0;
  }

  private stepEnding(dt: number): void {
    this.endingT -= dt;
    this.tickDrops(dt);
    this.tickParticles(dt);
    this.tickNumbers(dt);
    if (this.endingT > 0) return;
    // anything still flying is collected
    const D = this.D;
    for (let i = 0; i < D.n; i++) if (D.alive[i]) this.pickup(i);
    this.phase = 'idle';
    const r = this.result();
    // kept so the UI can ask again if its waveEnd handler failed (engine.lastResult)
    this.lastResult = r;
    this.pushHud(true);
    this.hooks.waveEnd(r);
  }

  /** The WaveResult (also the partial of a death). */
  result(): WaveResult {
    this.addStat('ms', 0);
    this.maxStat('peakSwordsAir', this.swordsAir);
    const vx = 1;
    void vx;
    const stats: RunStats = { ...this.rs, ms: Math.round(this.tWave * 1000) };
    // m8 (E4): own 月华 left on the ground (千金散尽); present only when some was lost
    const lost = Math.round(this.ownLost);
    return {
      wave: this.wave,
      moon: Math.round(this.moonGot),
      xp: Math.round(this.xpGot),
      field: Math.round(this.fieldMoon),
      storeLeft: Math.max(0, Math.round(this.store)),
      levels: this.levels,
      crates: this.crates,
      hearts: this.hearts.slice(),
      sleeve: this.sleeve.slice(),
      lives: this.lives,
      once: this.once.slice(),
      drunk: Math.round(this.drunk),
      stats,
      killsBy: { ...this.killsBy },
      byWeapon: JSON.parse(JSON.stringify(this.byWeapon)),
      bosses: this.bossesKilled.slice() as WaveResult['bosses'],
      relics: this.relicsGot.slice(),
      ms: Math.round(this.tWave * 1000),
      ...(lost > 0 ? { lost } : {}),
    };
  }

  // ═══════════════════════════════════════════════════════════ HUD (≈ 8 Hz)

  pushHud(force: boolean): void {
    const h = this.hud;
    h.hp = Math.max(0, Math.ceil(this.hp)); h.hpMax = this.hpMax; h.shield = Math.round(this.shieldV);
    h.moon = Math.floor(this.moonHeld);
    let s = 0;
    for (const c of this.sleeve) s += c.worth;
    h.sleeve = s; h.showSleeve = s > 0 || (this.run?.coins ?? 0) > 0;
    h.level = this.lvl; h.xp = Math.floor(this.xpLive); h.xpNext = xpNext(this.lvl);
    h.wave = this.wave;
    h.time = this.len === null ? null : Math.max(0, this.len - this.tWave);
    if (this.bossH.length) {
      let hp = 0, max = 0, phase = 0, id = '';
      for (const bh of this.bossH) {
        const i = this.E.slotOf(bh);
        if (i < 0) continue;
        hp += Math.max(0, this.E.hp[i]); max += this.E.hpMax[i]; phase = Math.max(phase, this.E.phase[i]); id = this.E.id[i];
      }
      h.boss = max > 0 ? { id: this.bossHudId(id), hp: hp / max, phase } : null;
    } else h.boss = null;
    h.skillCd = this.skillRun ? 1 : this.skillCdMax > 0 ? this.skillCd / (this.skillCdMax * this.cdX) : 0;
    h.skillActive = !!this.skillRun;
    this.hiddenHud(h); // m8:hidden (skillHeld, skillRecast, ring)
    h.drunk = this.drunkOn ? Math.round(this.drunk) : null;
    h.moonPhase = this.run?.char === 'change' ? this.moonPhase : null;
    h.lives = this.run?.char === 'cat' ? this.lives : null;
    h.curse = Math.round(this.stats?.curse ?? 0);
    h.lowHp = this.hp < this.hpMax * 0.3;
    // a beat since the last push (the push runs at ≈8 Hz, a beat lasts one step)
    h.beat = this.beatN !== this.hudBeatN;
    this.hudBeatN = this.beatN;
    h.dark = this.lightR !== null;
    h.fps = Math.round(this.fps);
    if (force || this.phase === 'wave' || this.phase === 'ending') this.hooks.hud(h);
    // the band: the wave clock, danger (HP, the crowd against the cap), the boss phase, the clear
    if (this.audio?.hud && (this.phase === 'wave' || this.phase === 'ending')) {
      try { this.audio.hud(h, this.capEnemies > 0 ? this.cappedAlive() / this.capEnemies : 0); } catch { /* audio optional */ }
    }
  }

  // ═══════════════════════════════════════════════════════════ recovery (GDD §23)

  /** After a throw: drop the offending entity (the enemy or summon being processed). */
  recover(): void {
    this.qd = 0;
    if (this.curWhat === 'enemy' && this.cur >= 0 && this.E.alive[this.cur]) { this.E.actor[this.cur] = null; this.E.release(this.cur); }
    else if (this.curWhat === 'summon' && this.cur >= 0) this.S.release(this.cur);
    else if (this.curWhat === 'skill') { this.skillRun = null; this.skillCd = this.skillCdMax * this.cdX; }
    this.cur = -1;
    this.curWhat = 'none';
  }

  /** Spawn the 心魔: a copy of you with 40% of your HP and damage (item 心魔). */
  private spawnDemon(): void {
    const pct = this.mods.demon / 100;
    const h = this.spawn('blot', null, null, { bloom: true, capped: false, noDrops: true });
    const i = this.E.slotOf(h);
    if (i < 0) return;
    const E = this.E;
    E.kind[i] = EKind.Demon;
    E.id[i] = 'demonSelf';
    E.atlas[i] = 'sum:demonSelf' as never;
    E.role[i] = ROLE.shooter;
    E.r0[i] = 14; E.r[i] = 14;
    // its toughness follows the wave, so it is a duel, not a free crate
    E.hp[i] = E.hpMax[i] = Math.max(this.hpMax * pct, 40 * pct * this.plan.hpX);
    E.dmg[i] = Math.max(1, 5 * pct * this.plan.dmgX + this.hpMax * 0.02);
    E.speed[i] = this.moveSpd * 0.6;
    E.cost[i] = 0;
    E.noDrops[i] = 0;
  }

  // ═══════════════════════════════════════════════════════════ m8 · the seams (Lane 0, PLAN §3.5; frozen)
  // Each is empty or 1 unless a lane fills it, and begin resets it every wave before registerItemHooks /
  // registerHiddenHooks run. Lanes add their own World members only inside their block below.

  /** 越女's guard window (HIDDEN): asked first for every blow that is not a DoT and reaches the player past
   *  invuln / untargetable / leap, before the i-frames; true = caught (no damage, no dodge roll, no items). */
  guardHook: ((n: number, attacker: number, shot: number, src: string, melee: boolean) => boolean) | null = null;
  /** Factors on a blow before armour (ITEMS 醉卧沙场, HIDDEN 露); DoTs pass through too (`dot`). */
  readonly hurtScalers: ((n: number, attacker: number, shot: number, src: string, dot: boolean, melee: boolean) => number)[] = [];
  /** After a blow (not a DoT) landed: d = dealt after armour and shield, n = before armour (ITEMS 千金散尽). */
  readonly afterHurt: ((d: number, n: number, attacker: number, shot: number, src: string, melee: boolean) => void)[] = [];
  /** The owner of the telegraph striking now (T.owner: an enemy handle, or −1); set around tickTeles' strike. */
  teleOwner = -1;
  /** 模拟场: the 镜技 cooldown multiplier (1 = normal). */
  cdX = 1;
  /** 月华如练 (ITEMS): called each step for each magnetised drop slot, after it moved. */
  onStream: ((i: number) => void) | null = null;
  /** Drawn at the figure layer just before your figure (engine/render.ts); true = skip the default figure
   *  (越女's guard pose, 后羿's draw). Rings and tethers draw here too. */
  readonly playerHooks: ((ctx: CanvasRenderingContext2D, cam: Camera, W: World) => boolean)[] = [];
  /** Own 月华 left lying at this wave's end (千金散尽): result().lost. */
  ownLost = 0;
  /** 画地为牢: the walking-speed cap as × F.baseSpeed (Infinity = none), from moveCapOf(run) at begin. */
  moveCap = Infinity;
  /** The 技 button down at `at` s (engine/verbs.ts; a 'tap' skill casts as today). */
  press(at: number): void { pressSkill(this, at); }
  /** The 技 button up at `at` s; dir null = cancel (engine/verbs.ts). */
  release(dir: Vec | null, at: number): void { releaseSkill(this, dir, at); }

  // ── m8:items ──
  // The new items' engine readers (items.md §5, PLAN §4.I). Every number comes from the item's fx (Mods); the
  // call sites in strikeIn / killIn / onDodge / tickPlayer / recomputeStats are one guarded line each.

  /** I2: the stacks of each keyed event buff now running. */
  private itemStack = new Map<string, number>();
  /** 后发先至: the slots in primeMask are primed until primeT; it can prime again from primeReady. */
  primeT = -1;
  primeMask = 0;
  private primeReady = 0;
  /** 连环计: pending bursts (x, y, victim max HP), the per-second window, each boss's last burst. */
  private blastQ: number[] = [];
  private blasting = false;
  private blastTimes: number[] = [];
  private blastBoss = new Map<number, number>();
  /** 星火燎原's recent spread times; 倒戈相向's own turned foes (handles). */
  private spreadTimes: number[] = [];
  private turned: number[] = [];
  /** This wave's item-op tallies (tests, the 模拟场). */
  itemTally = { blasts: 0, bossBlasts: 0, spreads: 0, turned: 0, primed: 0, scattered: 0, streamHits: 0 };

  /** Every wave (registerItemHooks, from begin): the item ops start clean. */
  itemBegin(): void {
    this.itemStack.clear();
    this.primeT = -1; this.primeMask = 0; this.primeReady = 0;
    this.blastQ.length = 0; this.blasting = false; this.blastTimes.length = 0; this.blastBoss.clear();
    this.spreadTimes.length = 0; this.turned.length = 0;
    if (this.stoneBorn.length !== this.ST.cap) this.stoneBorn = new Float64Array(this.ST.cap);
    this.streamAt.fill(-1);
    this.itemTally = { blasts: 0, bossBlasts: 0, spreads: 0, turned: 0, primed: 0, scattered: 0, streamHits: 0 };
  }

  /** A per-second budget over any 1 s window: true (and counted) while fewer than `per` happened in the last second. */
  private itemRate(times: number[], per: number): boolean {
    while (times.length && this.t - times[0] >= 1) times.shift();
    if (times.length >= per) return false;
    times.push(this.t);
    return true;
  }
  /** I2: one event buff fires: a stack more (up to its `stack`), `dur` refreshed, all stacks end together. */
  itemBuff(b: EvBuff): void {
    let cur = 0;
    for (let j = 0; j < this.buffs.length; j++) if (this.buffs[j].key === b.key) { cur = this.itemStack.get(b.key) ?? 0; break; }
    const n = Math.min(b.stack, cur + 1);
    this.itemStack.set(b.key, n);
    this.buff(b.key, b.lv[n - 1], b.dur, b.moveX);
  }
  /** I2: fire the event buffs of `hook`. `slot` ≥ 0 filters by the weapon's class; `still` is the stand-still time
   *  an `onGo` ends (each needs ≥ its `after`). */
  itemBuffs(hook: EvBuff['hook'], slot: number, still = 0): void {
    const L = this.mods.evBuffs;
    for (let q = 0; q < L.length; q++) {
      const b = L[q];
      if (b.hook !== hook) continue;
      if (b.cls && !(slot >= 0 && slot < this.slots.length && this.slots[slot].cls.includes(b.cls))) continue;
      if (hook === 'onGo' && still < b.after) continue;
      this.itemBuff(b);
    }
  }

  /** P6 (斩草除根, 百步穿杨): the factor on a weapon hit of slot `slot` on enemy slot `i` (1 when none applies). */
  itemHitX(i: number, slot: number): number {
    const sl = this.slots[slot];
    if (!sl) return 1;
    const E = this.E;
    let x = 1;
    for (const e of this.mods.execute) {
      if (!sl.cls.includes(e.cls) || E.hp[i] >= e.below * E.hpMax[i]) continue;
      x *= E.kind[i] === EKind.Elite || E.kind[i] === EKind.Boss ? e.bigX : e.x;
    }
    for (const f of this.mods.far) {
      if (!sl.cls.includes(f.cls)) continue;
      const d = Math.hypot(E.x[i] - this.px, E.y[i] - this.py);
      x *= 1 + Math.min(f.max, (f.pct * d) / f.per) / 100;
    }
    return x;
  }
  /** P7 (泰山压顶): the root a weapon hit of slot `slot` gives instead of its push (0 = push as usual). */
  itemPin(slot: number): number {
    const sl = this.slots[slot];
    if (!sl) return 0;
    let d = 0;
    for (const p of this.mods.pin) if (sl.cls.includes(p.cls)) d = Math.max(d, p.dur);
    return d;
  }
  /** P4 + P5: a weapon hit (not noProc) of slot `slot` dealt `d` to enemy slot `i`. */
  itemOnHit(i: number, slot: number, d: number, crit: boolean, proc: number): void {
    const sl = this.slots[slot];
    if (!sl) return;
    const L = this.mods.evBuffs;
    for (let q = 0; q < L.length; q++) {
      const b = L[q];
      if (b.hook !== 'onHit' && !(crit && b.hook === 'onCrit')) continue;
      if (b.cls && !sl.cls.includes(b.cls)) continue;
      this.itemBuff(b);
    }
    const E = this.E;
    for (const st of this.mods.hitStatus) {
      if (!E.alive[i]) return;
      if (st.cls && !sl.cls.includes(st.cls)) continue;
      // a chance below 100 % is a proc: × the weapon's proc coefficient, × 福缘 when `luck`
      if (st.p < 100 && this.erng() >= (st.p / 100) * proc * (st.luck ? luckMult(this.stats.luck) : 1)) continue;
      if (st.kind === 'convert') { this.itemTurn(i, st.dur, st.cap); continue; }
      const boss = E.kind[i] === EKind.Boss;
      const v = st.ofHit > 0 ? ((d * st.ofHit) / 100) * st.n : boss ? st.bossV : st.v;
      this.statusSlot(i, st.kind, st.dur, v, st.cap);
    }
  }
  /** 倒戈相向: turn an ordinary foe still standing for `dur`, while fewer than `cap` it turned are still on your side. */
  private itemTurn(i: number, dur: number, cap: number): void {
    const E = this.E;
    if (E.kind[i] !== EKind.Mon || E.hp[i] <= 0) return;
    let live = 0;
    for (let q = this.turned.length - 1; q >= 0; q--) {
      const j = E.slotOf(this.turned[q]);
      if (j < 0 || !E.alive[j] || E.kind[j] !== EKind.Ally) this.turned.splice(q, 1); else live++;
    }
    if (cap > 0 && live >= cap) return;
    const h = E.handle(i);
    this.convert(h, dur);
    this.turned.push(h);
    this.itemTally.turned++;
    this.fx('charmMark', E.x[i], E.y[i], { r: E.r[i] * 1.4, life: 0.5 });
  }
  /** P4 + P8: a kill (not an ally) of kind `k` at (x, y), with the victim's max HP, strongest burn and last weapon slot. */
  itemOnKill(k: number, x: number, y: number, hpMax: number, burnD: number, slot = -1): void {
    const L = this.mods.evBuffs;
    for (let q = 0; q < L.length; q++) {
      const b = L[q];
      if (b.hook !== 'onKill') continue;
      if (b.cls && !(slot >= 0 && slot < this.slots.length && this.slots[slot].cls.includes(b.cls))) continue;
      this.itemBuff(b);
    }
    if (this.mods.blast.length && (k === EKind.Mon || k === EKind.Elite)) {
      this.blastQ.push(x, y, hpMax);
      if (!this.blasting) this.itemBlastDrain();
    }
    if (burnD > 0 && this.mods.spread.length) this.itemSpread(x, y, burnD);
  }
  /**
   * 连环计: burst the queued kills, oldest first. A burst strikes every foe within r for pct % of the victim's max HP,
   * raw (no 伤害, no crit, no procs; armour applies); a boss takes at most bossPct % of its own max HP from one burst
   * and is touched by at most bossPerSec bursts a second; at most perSec bursts a second. A burst's kills queue
   * their own bursts here (no recursion).
   */
  private itemBlastDrain(): void {
    this.blasting = true;
    try {
      const E = this.E, Q = this.blastQ;
      for (let q = 0; q < Q.length; q += 3) {
        const x = Q[q], y = Q[q + 1], hpMax = Q[q + 2];
        for (const b of this.mods.blast) {
          if (!this.itemRate(this.blastTimes, b.perSec)) continue;
          this.itemTally.blasts++;
          this.fx('shockRing', x, y, { r: b.r, life: 0.3 });
          const buf = this.q1;
          const cnt = this.hash.gather(x, y, b.r + 64, buf);
          for (let t = 0; t < cnt; t++) {
            const j = buf[t];
            if (!this.targetable(j)) continue;
            const dx = E.x[j] - x, dy = E.y[j] - y, rr = b.r + E.r[j];
            if (dx * dx + dy * dy > rr * rr) continue;
            let dmg = (b.pct / 100) * hpMax;
            if (E.kind[j] === EKind.Boss) {
              const h = E.handle(j), last = this.blastBoss.get(h) ?? -Infinity;
              if (this.t - last < 1 / b.bossPerSec) continue;
              this.blastBoss.set(h, this.t);
              // the cap holds after the boss's vulnerability, too
              const vuln = 1 + (E.vulnT[j] > 0 ? E.vulnV[j] / 100 : 0);
              dmg = Math.min(dmg, ((b.bossPct / 100) * E.hpMax[j]) / vuln);
              this.itemTally.bossBlasts++;
            }
            this.strike(j, dmg, 0, 1, 0, x, y, -1, SRCI.item, HF.noCrit | HF.noProc);
          }
        }
      }
      Q.length = 0;
    } finally { this.blasting = false; }
  }
  /** 星火燎原: a burning kill passes its strongest burn (dps) to the n nearest foes within r, at most perSec a second. */
  private itemSpread(x: number, y: number, dps: number): void {
    const E = this.E;
    for (const sp of this.mods.spread) {
      // (the budget is spent only when a fire actually jumps: see below)
      while (this.spreadTimes.length && this.t - this.spreadTimes[0] >= 1) this.spreadTimes.shift();
      if (this.spreadTimes.length >= sp.perSec) continue;
      const buf = this.q2;
      const cnt = this.hash.gather(x, y, sp.r + 64, buf);
      let took = 0;
      for (let pick = 0; pick < sp.n; pick++) {
        let best = -1, bd = Infinity;
        for (let t = 0; t < cnt; t++) {
          const j = buf[t];
          if (j < 0 || !this.targetable(j)) continue;
          const dx = E.x[j] - x, dy = E.y[j] - y, d2 = dx * dx + dy * dy, rr = sp.r + E.r[j];
          if (d2 <= rr * rr && d2 < bd) { bd = d2; best = t; }
        }
        if (best < 0) break;
        const j = buf[best];
        buf[best] = -1;
        this.statusSlot(j, sp.kind, sp.dur, dps);
        this.fx('burnMark', E.x[j], E.y[j], { r: E.r[j], life: 0.4 });
        took++;
      }
      if (took) { this.spreadTimes.push(this.t); this.itemTally.spreads++; }
    }
  }
  /** 后发先至: a dodge primes every weapon (see engine/weapons.ts fireWeapons), at most once per cd. */
  itemPrime(): void {
    const p = this.mods.prime;
    if (!p || this.t < this.primeReady) return;
    this.primeT = this.t + p.dur;
    this.primeMask = (1 << this.slots.length) - 1;
    this.primeReady = this.t + p.cd;
    this.itemTally.primed++;
    this.fx('critSpark', this.px, this.py, { r: 22, life: 0.35 });
  }
  /** I1 / P3: the live converts' world readings — foes within r of you; unpulled moon-kind 月华 within pickupR + r. */
  itemConvReadings(): void {
    const D = this.D;
    for (const c of this.mods.conv) {
      if (c.from === 'near') c.v = this.countNear(this.px, this.py, c.r);
      else if (c.from === 'moonNear') {
        const R = this.pickupR + c.r, R2 = R * R;
        let v = 0;
        for (let i = 0; i < D.n; i++) {
          if (!D.alive[i] || D.magnet[i]) continue;
          const kd = D.kind[i];
          if (kd !== DK.moonDrop && kd !== DK.moonThick && kd !== DK.moonFull) continue;
          const dx = D.x[i] - this.px, dy = D.y[i] - this.py;
          if (dx * dx + dy * dy <= R2) v += D.worth[i];
        }
        c.v = v;
      }
    }
  }
  /** 厚积薄发 (P15): when each stone slot was placed (engine/weapons.ts placeStone writes, blast / capture read). */
  stoneBorn = new Float64Array(0);
  /** 千金散尽's reused piece buffer and 月华如练's per-drop lists (the foes each piece struck, at most F.itemStream.ring). */
  private readonly scatterPieces: number[] = [];
  private streamRing = new Int32Array(0);
  private streamAt = new Float64Array(0);
  private streamPos = new Uint8Array(0);
  /**
   * 千金散尽 (P11, afterHurt): a blow landed, so pct % of the 月华 in hand (at most max) leaves it and lands beyond
   * your pickup range (pickupR + F.itemScatter.near … far), split into pearls (splitMoon). The pieces are your own:
   * held F.itemScatter.hold s, never fused; taken back they only return (no XP, no 蓄月, no tally); still lying at the
   * wave's end they are lost (beginEnding → result().lost).
   */
  itemScatter(): void {
    const s = this.mods.scatter;
    if (!s || this.phase !== 'wave') return;
    const k = Math.min(s.max, Math.floor((Math.max(0, this.moonHeld) * s.pct) / 100));
    if (k <= 0) return;
    this.moonHeld -= k;
    this.itemTally.scattered += k;
    const C = F.itemScatter, P = splitMoon(k, this.scatterPieces), p = this.pt2;
    for (let q = 0; q < P.length; q++) {
      // a random bearing; at a wall, the first quarter turn that still lands beyond your reach (else the farthest)
      const a0 = this.erng() * TAU, r = this.pickupR + C.near + (C.far - C.near) * this.erng();
      let bx = this.px, by = this.py, bd = -1;
      for (let t = 0; t < 4; t++) {
        const a = a0 + (t * TAU) / 4;
        p.x = this.px + Math.cos(a) * r; p.y = this.py + Math.sin(a) * r;
        this.clampToArena(p, 8);
        const d = Math.hypot(p.x - this.px, p.y - this.py);
        if (d > bd) { bd = d; bx = p.x; by = p.y; }
        if (d >= this.pickupR + C.near) break;
      }
      this.dropOne(moonKindOf(P[q]), bx, by, P[q], -1, { own: true, hold: C.hold, noFuse: true });
    }
    this.fx('petalBurst', this.px, this.py, { r: 26, life: 0.4 });
  }
  /**
   * 月华如练 (P12, onStream): a 月华 pearl flying to you (drop slot i) strikes each foe within F.itemStream.r of it once
   * (it remembers every foe it struck, and stops after F.itemStream.ring of them): (base + Σ scale·stat) × 伤害 × min(maxX, 1 + worth × perWorth / 100),
   * crits roll, no procs, src item.
   */
  itemStream(i: number): void {
    const st = this.mods.stream, D = this.D, E = this.E;
    if (!st || !isMoonKind(D.kind[i])) return;
    const R = F.itemStream.ring;
    if (this.streamAt.length !== D.cap) {
      this.streamRing = new Int32Array(D.cap * R).fill(-1); this.streamAt = new Float64Array(D.cap).fill(-1); this.streamPos = new Uint8Array(D.cap);
    }
    // a piece streams every step until it is taken: a gap means a new piece in this slot (and a clean ring)
    if (this.t - this.streamAt[i] > 0.1) { this.streamRing.fill(-1, i * R, i * R + R); this.streamPos[i] = 0; }
    this.streamAt[i] = this.t;
    // q1: this loop strikes, and a kill may query again one level deeper (q2 is for leaf queries only)
    const buf = this.q1;
    const cnt = this.hash.gather(D.x[i], D.y[i], F.itemStream.r + 64, buf);
    if (!cnt) return;
    let dmg = -1;
    for (let t = 0; t < cnt; t++) {
      const j = buf[t];
      if (!this.targetable(j)) continue;
      const dx = E.x[j] - D.x[i], dy = E.y[j] - D.y[i], rr = F.itemStream.r + E.r[j];
      if (dx * dx + dy * dy > rr * rr) continue;
      const h = E.handle(j);
      let seen = false;
      for (let q = 0; q < this.streamPos[i]; q++) if (this.streamRing[i * R + q] === h) { seen = true; break; }
      if (seen) continue;
      // once per foe, never by eviction: a piece that has struck F.itemStream.ring foes strikes no more
      if (this.streamPos[i] >= R) return;
      this.streamRing[i * R + this.streamPos[i]] = h;
      this.streamPos[i]++;
      if (dmg < 0) dmg = Math.max(1, st.base + this.scaleSum(st.scale)) * this.dmgMultNow() * Math.min(st.maxX, 1 + (D.worth[i] * st.perWorth) / 100);
      this.strike(j, dmg, clamp(this.stats.crit / 100, 0, 1), F.critXDefault + this.stats.critDmg / 100, 0, D.x[i], D.y[i], -1, SRCI.item, HF.noProc);
      this.itemTally.streamHits++;
      if (!D.alive[i]) return;
    }
  }
  // ── m8:hidden ──
  // The hidden companions' World side (hidden.md §2.5, §2.7, §3.4; PLAN §4.H): the 技 button's verb state
  // (engine/verbs.ts), the next cooldown a run asks for, the ring at the figure, the guard window, 露, the
  // telegraph owner and the vines. Content reaches these through WorldApi's optional m8 members or core(w).
  /** The 技 button is down (engine/verbs.ts): since verbT0 (world s); verbMode says what its release does. */
  verbDown = false;
  verbT0 = 0;
  verbMode = 0;
  /** engine/verbs.ts is casting from a press: castSkill leaves a 'hold' run drawing instead of releasing it. */
  verbPress = false;
  /** The press time (world s) of the current cast, and whether it was aimed (a point or drag was given). */
  castT = 0;
  castAimed = false;
  /** The cooldown the current run asks for when it ends (s, before cdX); −1 = the skill's own. */
  cdNext = -1;
  /** 越女's 剑意 (0 … houqi p.blades): it never fades, so it carries into the run's next wave (hiddenReset). */
  hidBlades = 0;
  /** Which run and wave hidBlades belongs to: only the very next wave of the same run keeps it (a retry or a new run starts at 0). */
  private hidOf = '';
  private hidWave = -1;
  /** The ring at the figure (WorldApi.ring): drawn while ringAt is this step's time. */
  readonly ringNow: { key: string; v: number; marks?: readonly number[]; pips?: number; of?: number; tone?: 'lake' | 'vine' | 'sun'; flash?: boolean } = { key: '', v: 0 };
  ringAt = -1;
  /** The guard window (WorldApi.guard): open until guardUntil; guardFn answers each blow that reaches it. */
  guardUntil = -1;
  guardFn: ((w: WorldApi, attacker: number, shot: number, src: string, melee: boolean) => boolean) | null = null;
  /** 露: +exposePct % damage taken until exposeUntil (a hurtScalers factor). */
  exposePct = 0;
  exposeUntil = -1;
  /** The vines asked for this step (WorldApi.tether): enemy handle, sag 0..1 (1 = slack), tint. */
  readonly tethers: { h: number; sag: number; tint: string }[] = [];
  tetherAt = -1;
  /** 后羿's aim line while drawing (a unit vector; x = y = 0: none). */
  readonly aimLine = { x: 0, y: 0 };
  aimAt = -1;

  ring(key: string, v01: number, o?: { marks?: readonly number[]; pips?: number; of?: number; tone?: 'lake' | 'vine' | 'sun'; flash?: boolean }): void {
    const r = this.ringNow;
    r.key = key; r.v = v01 < 0 ? 0 : v01 > 1 ? 1 : v01;
    r.marks = o?.marks; r.pips = o?.pips; r.of = o?.of; r.tone = o?.tone; r.flash = o?.flash;
    this.ringAt = this.t;
  }
  guard(dur: number, onCatch: (w: WorldApi, attacker: number, shot: number, src: string, melee: boolean) => boolean): void {
    this.guardUntil = this.t + Math.max(0, dur);
    this.guardFn = onCatch;
  }
  expose(pct: number, dur: number): void { this.exposePct = pct; this.exposeUntil = this.t + dur; }
  underTele(): number { return this.E.slotOf(this.teleOwner) >= 0 ? this.teleOwner : -1; }
  tether(h: number, sag01: number, tint = '#c9d98a'): void {
    if (this.tetherAt !== this.t) { this.tethers.length = 0; this.tetherAt = this.t; }
    if (this.tethers.length < 8) this.tethers.push({ h, sag: sag01 < 0 ? 0 : sag01 > 1 ? 1 : sag01, tint });
  }
  /** World.guardHook for a 'guard' skill (registerHiddenHooks): the open window answers with a handle. */
  guardCatch(_n: number, attacker: number, shot: number, src: string, melee: boolean): boolean {
    if (this.guardFn === null || this.t > this.guardUntil) return false;
    return this.guardFn(this, attacker >= 0 ? this.E.handle(attacker) : -1, shot, src, melee);
  }
  /** 露 as a hurtScalers factor. */
  exposeX(): number { return this.t <= this.exposeUntil ? 1 + this.exposePct / 100 : 1; }
  /** Every wave starts clean (registerHiddenHooks calls it from begin), except 剑意, which carries into the run's next wave. */
  hiddenReset(): void {
    this.verbDown = false; this.verbMode = 0; this.verbPress = false; this.castT = 0; this.castAimed = false; this.cdNext = -1;
    const of = this.run.seed + '|' + this.run.runIndex + '|' + this.run.char;
    this.hidBlades = of === this.hidOf && this.wave === this.hidWave + 1 ? this.hidBlades : 0;
    this.hidOf = of; this.hidWave = this.wave;
    this.ringAt = -1; this.guardUntil = -1; this.guardFn = null; this.exposePct = 0; this.exposeUntil = -1;
    this.tethers.length = 0; this.tetherAt = -1; this.aimAt = -1;
  }
  /** HudState's m8 skill fields (pushHud). */
  hiddenHud(h: HudState): void {
    const input = this.skillDef?.input;
    if (!input || input === 'tap') { h.skillHeld = undefined; h.skillRecast = undefined; h.ring = undefined; return; }
    h.skillHeld = input === 'hold' && this.verbDown && !!this.skillRun;
    h.skillRecast = input === 'recast' && !!this.skillRun?.recast;
    h.ring = this.t - this.ringAt <= 0.1 ? { ...this.ringNow } : null;
  }
  // ── m8:art ──
  /** splitMoon's reused buffer (dropMoon allocates nothing). */
  private readonly moonPieces: number[] = [];
  /** A 月华 piece (a pearl, 金月华 or 金鲤) reaches you: 蓄月 per whole point of a pearl, the big-piece chime. */
  private collectPiece(k: number, worth: number): void {
    this.collectMoon(worth, moonDraws(k, worth), k === DK.moonFull ? 2 : k === DK.moonThick ? 1 : 0);
  }
}


/** EnemyView over slot `i` (reused; content must not keep it). */
class EnemyViewImpl implements EnemyView {
  i = -1;
  constructor(private w: World) {}
  get h() { return this.i < 0 ? -1 : this.w.E.handle(this.i); }
  get id() { return this.i < 0 ? '' : this.w.E.id[this.i]; }
  get kind() { return this.i < 0 ? 'mon' : KIND_NAMES[this.w.E.kind[this.i]]; }
  get tags() {
    if (this.i < 0) return [];
    const b = this.w.E.tags[this.i];
    return (Object.keys(TAG_BIT) as (keyof typeof TAG_BIT)[]).filter((k) => b & TAG_BIT[k]);
  }
  get hpMax() { return this.i < 0 ? 0 : this.w.E.hpMax[this.i]; }
  get alive() { return this.i >= 0 && this.w.E.alive[this.i] === 1; }
  get x() { return this.i < 0 ? 0 : this.w.E.x[this.i]; } set x(v) { if (this.i >= 0) this.w.E.x[this.i] = v; }
  get y() { return this.i < 0 ? 0 : this.w.E.y[this.i]; } set y(v) { if (this.i >= 0) this.w.E.y[this.i] = v; }
  get vx() { return this.i < 0 ? 0 : this.w.E.vx[this.i]; } set vx(v) { if (this.i >= 0) this.w.E.vx[this.i] = v; }
  get vy() { return this.i < 0 ? 0 : this.w.E.vy[this.i]; } set vy(v) { if (this.i >= 0) this.w.E.vy[this.i] = v; }
  get r() { return this.i < 0 ? 0 : this.w.E.r[this.i]; } set r(v) { if (this.i >= 0) this.w.E.r[this.i] = v; }
  get hp() { return this.i < 0 ? 0 : this.w.E.hp[this.i]; } set hp(v) { if (this.i >= 0) this.w.E.hp[this.i] = v; }
  get armor() { return this.i < 0 ? 0 : this.w.E.armor[this.i]; } set armor(v) { if (this.i >= 0) this.w.E.armor[this.i] = v; }
  get dmg() { return this.i < 0 ? 0 : this.w.E.dmg[this.i]; } set dmg(v) { if (this.i >= 0) this.w.E.dmg[this.i] = v; }
  get speed() { return this.i < 0 ? 0 : this.w.E.speed[this.i]; } set speed(v) { if (this.i >= 0) this.w.E.speed[this.i] = v; }
  get untargetable() { return this.i >= 0 && this.w.E.untarget[this.i] === 1; } set untargetable(v) { if (this.i >= 0) this.w.E.untarget[this.i] = v ? 1 : 0; }
  get invuln() { return this.i >= 0 && this.w.E.invuln[this.i] === 1; } set invuln(v) { if (this.i >= 0) this.w.E.invuln[this.i] = v ? 1 : 0; }
  get mem() { return this.i < 0 ? DUMMY_MEM : this.w.E.mem[this.i]; }
}
const DUMMY_MEM = new Float32Array(8);
