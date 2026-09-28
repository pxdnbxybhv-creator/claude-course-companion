// 水月幻镜 · the tutorial's pacing (「初入镜中」, d-tutorial §1.6): spawn counts, distances, telegraph
// times and the gentle wave scaling. Only the tutorial reads this table; real runs never do, so no
// balance number of the game lives here.

export const TUT = {
  /** The fixed seed of the practice run (unrelated to real seeds, which are fresh crypto values). */
  seed: 0x7a11c0de,
  /** The gentle scaling of every tutorial wave (tutor/run.ts tutorPlan). */
  hpX: 0.7,
  dmgX: 0.6,
  spdX: 0.85,
  /** Wave 1 · walk and fight. */
  w1: {
    /** Seconds before the walking lesson. */
    moveAt: 0.6,
    /** Walking counts as learnt after this many seconds of movement, or this much distance. */
    moveSec: 1.2,
    moveDist: 240,
    /** The script moves on by itself after this long (the coach's skip). */
    moveMax: 20,
    /** The first three blots: distance and spread ahead of you (degrees). */
    firstN: 3,
    firstDist: 280,
    firstSpread: 120,
    firstMax: 25,
    /** Pickups that finish the moonlight lesson, or seconds. */
    pickups: 3,
    pickupMax: 10,
    /** The packs after the first three: [delay s, monster, count, distance]. */
    packs: [[1, 'blot', 6, 300], [5, 'tadpole', 6, 320], [5, 'blot', 8, 300]] as const,
    packsMax: 35,
    /** Seconds on the clock once the packs are gone. */
    endClock: 10,
  },
  /** Wave 2 · dodge. */
  w2: {
    pauseAt: 0.5,
    teleAt: 2,
    teleR: 70,
    teleDur: 1.7,
    teleEvery: 2.5,
    teleHurt: 3,
    dodges: 2,
    teleTries: 5,
    lanternDist: 320,
    blotsWithLanterns: 4,
    lanternMax: 35,
    crowdN: 10,
    crowdDist: 400,
    castMax: 25,
    endAfter: 3,
    endClock: 12,
    trickleEvery: 2.5,
    trickleN: 2,
    papermanAt: 4,
  },
  /** Wave 3 · the big one. */
  w3: {
    blotsN: 4,
    blotsAt: [0, 4] as const,
    foeAt: 6,
    foe: 'whitesnake' as const,
    foeDist: 300,
    hpEvery: 0.25,
    crowdEvery: 7,
    crowdN: 3,
    endAfter: 2,
  },
  /** The lethal guard: HP after a blow that would have put you down, and the grace after it. */
  saveHp: 0.6,
  saveInvuln: 1.5,
  /** Seconds between two gold rings the script draws on what it points at. */
  ringEvery: 1.2,
} as const;
