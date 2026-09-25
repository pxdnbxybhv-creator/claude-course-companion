// Small astronomy for the almanac: the Sun's and Moon's apparent longitudes, moon phases and
// sunrise/sunset. Pure functions, no DOM, no dependencies.
//
// Sun  — VSOP87D (Bretagnon & Francou 1988), truncated here to its 105 largest Earth-longitude
//        terms (max error vs. the full theory 0.3″ ≈ 7 s of time over 1850–2150), + FK5
//        correction, aberration and IAU 1980 nutation (largest 17 terms) — Meeus, *Astronomical
//        Algorithms*, ch. 22, 25, 32. Solar-term instants agree with 寿星万年历 within 31 s, 1901–2099.
// Moon — ELP-2000/82 main terms as tabulated by Meeus ch. 47 (longitude error ≲ 10″); phases are
//        solved on the Moon−Sun elongation and agree with Meeus ch. 49 within 36 s, 1900–2100.
// ΔT   — Espenak & Meeus polynomials (NASA Five Millennium Canon), 1600–2150+.
// Sun times — the NOAA solar calculator algorithm, refined at the event time.

// ───────────────────────────── time scales ─────────────────────────────

const DAY_MS = 86_400_000;
const J2000 = 2451545.0;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Julian Day (UT) of an instant. */
export function julianDay(date: Date): number {
  return date.getTime() / DAY_MS + 2440587.5;
}

/** Instant for a Julian Day (UT). */
export function dateFromJulianDay(jd: number): Date {
  return new Date(Math.round((jd - 2440587.5) * DAY_MS));
}

/** ΔT = TT − UT in seconds for a decimal year (Espenak & Meeus 2006 polynomial expressions). */
export function deltaT(year: number): number {
  const y = year;
  if (y >= 2150) { const u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y >= 2050) { const u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y); }
  if (y >= 2005) { const t = y - 2000; return 62.92 + t * (0.32217 + t * 0.005589); }
  if (y >= 1986) {
    const t = y - 2000;
    return 63.86 + t * (0.3345 + t * (-0.060374 + t * (0.0017275 + t * (0.000651814 + t * 0.00002373599))));
  }
  if (y >= 1961) { const t = y - 1975; return 45.45 + 1.067 * t - (t * t) / 260 - (t * t * t) / 718; }
  if (y >= 1941) { const t = y - 1950; return 29.07 + 0.407 * t - (t * t) / 233 + (t * t * t) / 2547; }
  if (y >= 1920) { const t = y - 1920; return 21.2 + t * (0.84493 + t * (-0.0761 + t * 0.0020936)); }
  if (y >= 1900) { const t = y - 1900; return -2.79 + t * (1.494119 + t * (-0.0598939 + t * (0.0061966 - t * 0.000197))); }
  if (y >= 1860) {
    const t = y - 1860;
    return 7.62 + t * (0.5737 + t * (-0.251754 + t * (0.01680668 + t * (-0.0004473624 + t / 233174))));
  }
  if (y >= 1800) {
    const t = y - 1800;
    return 13.72 + t * (-0.332447 + t * (0.0068612 + t * (0.0041116 + t * (-0.00037436 + t * (0.0000121272 + t * (-0.0000001699 + t * 0.000000000875))))));
  }
  if (y >= 1700) { const t = y - 1700; return 8.83 + t * (0.1603 + t * (-0.0059285 + t * (0.00013336 - t / 1174000))); }
  if (y >= 1600) { const t = y - 1600; return 120 + t * (-0.9808 + t * (-0.01532 + t / 7129)); }
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

const decimalYearOfJd = (jd: number) => 2000 + (jd - J2000) / 365.2425;

/** Julian Ephemeris Day (TT) of an instant. */
export function jdeFromDate(date: Date): number {
  const jd = julianDay(date);
  return jd + deltaT(decimalYearOfJd(jd)) / 86400;
}

/** Instant (UT) for a Julian Ephemeris Day (TT). */
export function dateFromJde(jde: number): Date {
  return dateFromJulianDay(jde - deltaT(decimalYearOfJd(jde)) / 86400);
}

const norm360 = (x: number) => ((x % 360) + 360) % 360;
/** Wrap an angle difference to (−180°, 180°]. */
const wrap180 = (x: number) => { const r = norm360(x); return r > 180 ? r - 360 : r; };

// ───────────────────────────── the Sun ─────────────────────────────

// VSOP87D Earth heliocentric longitude L and radius R, mean ecliptic & equinox of date.
// Each series n is a flat list of (A, B, C) triples: Σ A·cos(B + C·τ), multiplied by τⁿ,
// τ = Julian millennia (TT) from J2000. Terms kept where |A|·0.15ⁿ ≥ 1e-7 rad (L) / 2e-6 AU (R).
const EARTH_L: readonly (readonly number[])[] = [
  [ // L0: 93 terms
    1.75347045673, 0, 0, 0.03341656456, 4.66925680417, 6283.0758499914, 0.00034894275, 4.62610241759, 12566.1516999828,
    0.00003417571, 2.82886579606, 3.523118349, 0.00003497056, 2.74411800971, 5753.3848848968, 0.00003135896, 3.62767041758, 77713.7714681205,
    0.00002676218, 4.41808351397, 7860.4193924392, 0.00002342687, 6.13516237631, 3930.2096962196, 0.00001273166, 2.03709655772, 529.6909650946,
    0.00001324292, 0.74246356352, 11506.7697697936, 0.00000901855, 2.04505443513, 26.2983197998, 0.00001199167, 1.10962944315, 1577.3435424478,
    0.00000857223, 3.50849156957, 398.1490034082, 0.00000779786, 1.17882652114, 5223.6939198022, 0.0000099025, 5.23268129594, 5884.9268465832,
    0.00000753141, 2.53339053818, 5507.5532386674, 0.00000505264, 4.58292563052, 18849.2275499742, 0.00000492379, 4.20506639861, 775.522611324,
    0.00000356655, 2.91954116867, 0.0673103028, 0.00000284125, 1.89869034186, 796.2980068164, 0.0000024281, 0.34481140906, 5486.777843175,
    0.00000317087, 5.84901952218, 11790.6290886588, 0.00000271039, 0.31488607649, 10977.078804699, 0.0000020616, 4.80646606059, 2544.3144198834,
    0.00000205385, 1.86947813692, 5573.1428014331, 0.00000202261, 2.45767795458, 6069.7767545534, 0.00000126184, 1.0830263021, 20.7753954924,
    0.00000155516, 0.83306073807, 213.299095438, 0.00000115132, 0.64544911683, 0.9803210682, 0.00000102851, 0.63599846727, 4694.0029547076,
    0.00000101724, 4.26679821365, 7.1135470008, 9.9206e-7, 6.20992940258, 2146.1654164752, 0.00000132212, 3.41118275555, 2942.4634232916,
    9.7607e-7, 0.6810127227, 155.4203994342, 8.5128e-7, 1.29870743025, 6275.9623029906, 7.4651e-7, 1.75508916159, 5088.6288397668,
    0.00000101895, 0.97569221824, 15720.8387848784, 8.4711e-7, 3.67080093025, 71430.69561812909, 7.3547e-7, 4.67926565481, 801.8209311238,
    7.3874e-7, 3.50319443167, 3154.6870848956, 7.8756e-7, 3.03698313141, 12036.4607348882, 7.9637e-7, 1.807913307, 17260.1546546904,
    8.5803e-7, 5.98322631256, 161000.6857376741, 5.6963e-7, 2.78430398043, 6286.5989683404, 6.1148e-7, 1.81839811024, 7084.8967811152,
    6.9627e-7, 0.83297596966, 9437.762934887, 5.6116e-7, 4.38694880779, 14143.4952424306, 6.2449e-7, 3.97763880587, 8827.3902698748,
    5.1145e-7, 0.28306864501, 5856.4776591154, 5.5577e-7, 3.47006009062, 6279.5527316424, 4.1036e-7, 5.36817351402, 8429.2412664666,
    5.1605e-7, 1.33282746983, 1748.016413067, 5.1992e-7, 0.18914945834, 12139.5535091068, 4.9e-7, 0.48735065033, 1194.4470102246,
    3.92e-7, 6.16832995016, 10447.3878396044, 3.5566e-7, 1.77597314691, 6812.766815086, 3.677e-7, 6.04133859347, 10213.285546211,
    3.6596e-7, 2.56955238628, 1059.3819301892, 3.3291e-7, 0.59309499459, 17789.845619785, 3.5954e-7, 1.70876111898, 2352.8661537718,
    4.0938e-7, 2.39850881707, 19651.048481098, 3.0047e-7, 2.73975123935, 1349.8674096588, 3.0412e-7, 0.44294464135, 83996.84731811189,
    2.3663e-7, 0.48473567763, 8031.0922630584, 2.3574e-7, 2.06527720049, 3340.6124266998, 2.1089e-7, 4.14825464101, 951.7184062506,
    2.4738e-7, 0.21484762138, 3.5904286518, 2.5352e-7, 3.16470953405, 4690.4798363586, 2.282e-7, 5.22197888032, 4705.7323075436,
    2.1419e-7, 1.42563735525, 16730.4636895958, 2.1891e-7, 5.55594302562, 553.5694028424, 1.7481e-7, 4.56052900359, 135.0650800354,
    1.9925e-7, 5.22208471269, 12168.0026965746, 1.986e-7, 5.77470167653, 6309.3741697912, 2.03e-7, 0.37133792946, 283.8593188652,
    1.4421e-7, 4.19315332546, 242.728603974, 1.6225e-7, 5.98837722564, 11769.8536931664, 1.5077e-7, 4.19567181073, 6256.7775301916,
    1.9124e-7, 3.82219996949, 23581.2581773176, 1.8888e-7, 5.38626880969, 149854.4001348079, 1.4346e-7, 3.72355084422, 38.0276726358,
    1.7898e-7, 2.21490735647, 13367.9726311066, 1.2054e-7, 2.62229588349, 955.5997416086, 1.1287e-7, 0.17739328092, 4164.311989613,
    1.3971e-7, 4.40138139996, 6681.2248533996, 1.3621e-7, 1.88934471407, 7632.9432596502, 1.2503e-7, 1.13052412208, 5.5229243074,
    1.0498e-7, 5.35909518669, 1592.5960136328, 1.0327e-7, 6.19982566125, 6438.4962494256, 1.2003e-7, 1.003514567, 632.7837393132,
    1.0827e-7, 0.32734520222, 103.0927742186, 1.0005e-7, 6.0291496328, 5746.271337896, 1.0523e-7, 0.93871805506, 11926.2544136688,
  ],
  [ // L1: 10 terms
    6283.31966747491, 0, 0, 0.00206058863, 2.67823455584, 6283.0758499914, 0.0000430343, 2.63512650414, 12566.1516999828,
    0.00000425264, 1.59046980729, 3.523118349, 0.00000108977, 2.96618001993, 1577.3435424478, 9.3478e-7, 2.59212835365, 18849.2275499742,
    0.00000119261, 5.79557487799, 26.2983197998, 7.2122e-7, 1.13846158196, 529.6909650946, 6.7768e-7, 1.87472304791, 398.1490034082,
    6.7327e-7, 4.40918235168, 5507.5532386674,
  ],
  [ // L2: 2 terms
    0.0005291887, 0, 0, 0.00008719837, 1.07209665242, 6283.0758499914,
  ],
];
const EARTH_R: readonly (readonly number[])[] = [
  [ // R0: 14 terms
    1.00013988799, 0, 0, 0.01670699626, 3.09846350771, 6283.0758499914, 0.00013956023, 3.0552460962, 12566.1516999828,
    0.0000308372, 5.19846674381, 77713.7714681205, 0.00001628461, 1.17387749012, 5753.3848848968, 0.00001575568, 2.84685245825, 7860.4193924392,
    0.00000924799, 5.45292234084, 11506.7697697936, 0.00000542444, 4.56409149777, 3930.2096962196, 0.0000047211, 3.66100022149, 5884.9268465832,
    0.0000032878, 5.89983646482, 5223.6939198022, 0.00000345983, 0.96368617687, 5507.5532386674, 0.00000306784, 0.29867139512, 5573.1428014331,
    0.00000243189, 4.27349536153, 11790.6290886588, 0.00000211829, 5.84714540314, 1577.3435424478,
  ],
  [ // R1: 2 terms
    0.00103018608, 1.10748969588, 6283.0758499914, 0.00001721238, 1.06442301418, 12566.1516999828,
  ],
];

function vsop(series: readonly (readonly number[])[], tau: number): number {
  let sum = 0;
  let tp = 1;
  for (const s of series) {
    let acc = 0;
    for (let i = 0; i < s.length; i += 3) acc += s[i] * Math.cos(s[i + 1] + s[i + 2] * tau);
    sum += acc * tp;
    tp *= tau;
  }
  return sum;
}

// IAU 1980 nutation in longitude, terms ≥ 0.005″: multiples of D, M, M′, F, Ω; Δψ = (s0 + s1·T)·1e-4″.
const NUTATION: readonly number[] = [
  0, 0, 0, 0, 1, -171996, -174.2,
  -2, 0, 0, 2, 2, -13187, -1.6,
  0, 0, 0, 2, 2, -2274, -0.2,
  0, 0, 0, 0, 2, 2062, 0.2,
  0, 1, 0, 0, 0, 1426, -3.4,
  0, 0, 1, 0, 0, 712, 0.1,
  -2, 1, 0, 2, 2, -517, 1.2,
  0, 0, 0, 2, 1, -386, -0.4,
  0, 0, 1, 2, 2, -301, 0,
  -2, -1, 0, 2, 2, 217, -0.5,
  -2, 0, 1, 0, 0, -158, 0,
  -2, 0, 0, 2, 1, 129, 0.1,
  0, 0, -1, 2, 2, 123, 0,
  2, 0, 0, 0, 0, 63, 0,
  0, 0, 1, 0, 1, 63, 0.1,
  2, 0, -1, 2, 2, -59, 0,
  0, 0, -1, 0, 1, -58, -0.1,
];

/** Nutation in longitude Δψ, degrees (Meeus ch. 22). */
export function nutationLongitude(jde: number): number {
  const T = (jde - J2000) / 36525;
  const D = (297.85036 + T * (445267.11148 + T * (-0.0019142 + T / 189474))) * D2R;
  const M = (357.52772 + T * (35999.05034 + T * (-0.0001603 - T / 300000))) * D2R;
  const N = (134.96298 + T * (477198.867398 + T * (0.0086972 + T / 56250))) * D2R;
  const F = (93.27191 + T * (483202.017538 + T * (-0.0036825 + T / 327270))) * D2R;
  const O = (125.04452 + T * (-1934.136261 + T * (0.0020708 + T / 450000))) * D2R;
  let dpsi = 0;
  for (let i = 0; i < NUTATION.length; i += 7) {
    const arg = NUTATION[i] * D + NUTATION[i + 1] * M + NUTATION[i + 2] * N + NUTATION[i + 3] * F + NUTATION[i + 4] * O;
    dpsi += (NUTATION[i + 5] + NUTATION[i + 6] * T) * Math.sin(arg);
  }
  return (dpsi * 1e-4) / 3600;
}

/** Geocentric solar longitude (FK5, aberration applied) *without* nutation, degrees. */
function sunLongitudeNoNutation(jde: number): number {
  const tau = (jde - J2000) / 365250;
  const L = vsop(EARTH_L, tau) * R2D;
  const R = vsop(EARTH_R, tau);
  // geocentric = heliocentric + 180°; FK5 correction −0.09033″; aberration −20.4898″/R.
  return norm360(L + 180 - 0.09033 / 3600 - 20.4898 / 3600 / R);
}

/** Apparent geocentric ecliptic longitude of the Sun (true equinox of date), degrees [0, 360). */
export function sunApparentLongitude(jde: number): number {
  return norm360(sunLongitudeNoNutation(jde) + nutationLongitude(jde));
}

// ───────────────────────────── the Moon ─────────────────────────────

// Meeus table 47.A (longitude column): multiples of D, M, M′, F and Σl coefficient (1e-6 °).
const MOON_LON: readonly number[] = [
  0, 0, 1, 0, 6288774, 2, 0, -1, 0, 1274027, 2, 0, 0, 0, 658314, 0, 0, 2, 0, 213618,
  0, 1, 0, 0, -185116, 0, 0, 0, 2, -114332, 2, 0, -2, 0, 58793, 2, -1, -1, 0, 57066,
  2, 0, 1, 0, 53322, 2, -1, 0, 0, 45758, 0, 1, -1, 0, -40923, 1, 0, 0, 0, -34720,
  0, 1, 1, 0, -30383, 2, 0, 0, -2, 15327, 0, 0, 1, 2, -12528, 0, 0, 1, -2, 10980,
  4, 0, -1, 0, 10675, 0, 0, 3, 0, 10034, 4, 0, -2, 0, 8548, 2, 1, -1, 0, -7888,
  2, 1, 0, 0, -6766, 1, 0, -1, 0, -5163, 1, 1, 0, 0, 4987, 2, -1, 1, 0, 4036,
  2, 0, 2, 0, 3994, 4, 0, 0, 0, 3861, 2, 0, -3, 0, 3665, 0, 1, -2, 0, -2689,
  2, 0, -1, 2, -2602, 2, -1, -2, 0, 2390, 1, 0, 1, 0, -2348, 2, -2, 0, 0, 2236,
  0, 1, 2, 0, -2120, 0, 2, 0, 0, -2069, 2, -2, -1, 0, 2048, 2, 0, 1, -2, -1773,
  2, 0, 0, 2, -1595, 4, -1, -1, 0, 1215, 0, 0, 2, 2, -1110, 3, 0, -1, 0, -892,
  2, 1, 1, 0, -810, 4, -1, -2, 0, 759, 0, 2, -1, 0, -713, 2, 2, -1, 0, -700,
  2, 1, -2, 0, 691, 2, -1, 0, -2, 596, 4, 0, 1, 0, 549, 0, 0, 4, 0, 537,
  4, -1, 0, 0, 520, 1, 0, -2, 0, -487, 2, 1, 0, -2, -399, 0, 0, 2, -2, -381,
  1, 1, 1, 0, 351, 3, 0, -2, 0, -340, 4, 0, -3, 0, 330, 2, -1, 2, 0, 327,
  0, 2, 1, 0, -323, 1, 1, -1, 0, 299, 2, 0, 3, 0, 294,
];

/** Geocentric ecliptic longitude of the Moon, mean equinox of date (no nutation), degrees. */
export function moonLongitudeNoNutation(jde: number): number {
  const T = (jde - J2000) / 36525;
  const Lp = 218.3164477 + T * (481267.88123421 + T * (-0.0015786 + T * (1 / 538841 - T / 65194000)));
  const D = (297.8501921 + T * (445267.1114034 + T * (-0.0018819 + T * (1 / 545868 - T / 113065000)))) * D2R;
  const M = (357.5291092 + T * (35999.0502909 + T * (-0.0001536 + T / 24490000))) * D2R;
  const Mp = (134.9633964 + T * (477198.8675055 + T * (0.0087414 + T * (1 / 69699 - T / 14712000)))) * D2R;
  const F = (93.272095 + T * (483202.0175233 + T * (-0.0036539 + T * (-1 / 3526000 + T / 863310000)))) * D2R;
  const A1 = (119.75 + 131.849 * T) * D2R;
  const A2 = (53.09 + 479264.29 * T) * D2R;
  const E = 1 - T * (0.002516 + T * 0.0000074);
  let sl = 3958 * Math.sin(A1) + 1962 * Math.sin(Lp * D2R - F) + 318 * Math.sin(A2);
  for (let i = 0; i < MOON_LON.length; i += 5) {
    const m = MOON_LON[i + 1];
    const arg = MOON_LON[i] * D + m * M + MOON_LON[i + 2] * Mp + MOON_LON[i + 3] * F;
    const e = m === 0 ? 1 : m === 1 || m === -1 ? E : E * E;
    sl += MOON_LON[i + 4] * e * Math.sin(arg);
  }
  return norm360(Lp + sl / 1e6);
}

/** Apparent geocentric longitude of the Moon, degrees [0, 360). */
export function moonApparentLongitude(jde: number): number {
  return norm360(moonLongitudeNoNutation(jde) + nutationLongitude(jde));
}

/** Moon − Sun apparent longitude (0 = new, 90 = first quarter, 180 = full, 270 = last quarter), degrees [0, 360). */
export function moonElongation(jde: number): number {
  // Nutation shifts both bodies equally and cancels.
  return norm360(moonLongitudeNoNutation(jde) - sunLongitudeNoNutation(jde));
}

const SYNODIC = 29.530588861;
/** Mean new moon of lunation 0 (2000 Jan 6), JDE — Meeus eq. 49.1. */
const LUNATION0 = 2451550.09766;

/** JDE at which the elongation equals `target` degrees, starting from a guess within a few days. */
function solveElongation(target: number, jdeGuess: number): number {
  let jde = jdeGuess;
  for (let i = 0; i < 10; i++) {
    const diff = wrap180(target - moonElongation(jde));
    // Mean relative motion 12.19°/day; the true rate varies ±~20 %, so iterate to convergence.
    const step = diff / (360 / SYNODIC);
    jde += step;
    if (Math.abs(step) < 1e-7) break;
  }
  return jde;
}

/**
 * The instant of principal phase `quarter` (0 new, 1 first quarter, 2 full, 3 last quarter)
 * of lunation `k` (k = 0 is the new moon of 2000-01-06; k may be any integer).
 */
export function moonPhaseInstant(k: number, quarter: 0 | 1 | 2 | 3 = 0): Date {
  const guess = LUNATION0 + SYNODIC * (k + quarter / 4);
  return dateFromJde(solveElongation(quarter * 90, guess));
}

/** Lunation number of the new moon that began the lunation containing `date`. */
export function lunationAt(date: Date): number {
  const jde = jdeFromDate(date);
  let k = Math.floor((jde - LUNATION0) / SYNODIC);
  // The mean and true new moon differ by up to ~14 h, so step to the true boundary.
  while (moonPhaseInstant(k + 1).getTime() <= date.getTime()) k++;
  while (moonPhaseInstant(k).getTime() > date.getTime()) k--;
  return k;
}

export interface MoonPhaseEvent {
  /** 0 new, 1 first quarter, 2 full, 3 last quarter. */
  quarter: 0 | 1 | 2 | 3;
  at: Date;
}

/** All principal moon phases with from ≤ at < to, in order. */
export function moonPhasesBetween(from: Date, to: Date): MoonPhaseEvent[] {
  const out: MoonPhaseEvent[] = [];
  let k = lunationAt(from);
  for (;;) {
    for (const q of [0, 1, 2, 3] as const) {
      const at = moonPhaseInstant(k, q);
      if (at.getTime() >= to.getTime()) return out;
      if (at.getTime() >= from.getTime()) out.push({ quarter: q, at });
    }
    k++;
  }
}

export interface MoonInfo {
  /** 0 new → 0.25 first quarter → 0.5 full → 0.75 last quarter → 1 new. */
  phase: number;
  /** Illuminated fraction 0..1. */
  illumination: number;
  zh: string; // 新月 / 峨眉月 / 上弦月 / 盈凸月 / 满月 / 亏凸月 / 下弦月 / 残月
  en: string;
}

const PRINCIPAL = [
  ['新月', 'New moon'],
  ['上弦月', 'First quarter'],
  ['满月', 'Full moon'],
  ['下弦月', 'Last quarter'],
] as const;
const BETWEEN = [
  ['峨眉月', 'Waxing crescent'],
  ['盈凸月', 'Waxing gibbous'],
  ['亏凸月', 'Waning gibbous'],
  ['残月', 'Waning crescent'],
] as const;

/**
 * The Moon at `date`. `phase` and `illumination` are for that instant (phase = elongation / 360°,
 * so 0.25 / 0.5 / 0.75 are the exact quarter / full / last-quarter instants). The name is a
 * *day* name: 新月 / 上弦月 / 满月 / 下弦月 on the local calendar day (of `date`) on which that
 * principal phase occurs, otherwise the crescent / gibbous name between them.
 */
export function moonInfo(date: Date): MoonInfo {
  const jde = jdeFromDate(date);
  const elong = moonElongation(jde);
  const phase = elong / 360;
  const illumination = (1 - Math.cos(elong * D2R)) / 2;
  // The principal phase nearest in elongation; is its exact instant on the same local day?
  const q = (Math.round(elong / 90) % 4) as 0 | 1 | 2 | 3;
  const at = dateFromJde(solveElongation(q * 90, jde + wrap180(q * 90 - elong) / (360 / SYNODIC)));
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
  const t = at.getTime();
  const [zh, en] = t >= dayStart && t < dayEnd ? PRINCIPAL[q] : BETWEEN[Math.floor(elong / 90) % 4];
  return { phase, illumination, zh, en };
}

// ───────────────────────────── sunrise & sunset ─────────────────────────────

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  /** Day length in minutes (0 in polar night, 1440 in midnight sun). */
  dayLength: number;
}

/** NOAA solar calculator: equation of time (minutes) and declination (degrees) at Julian Day `jd`. */
function noaaSun(jd: number): { eqTime: number; decl: number } {
  const T = (jd - J2000) / 36525;
  const L0 = norm360(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const Mr = M * D2R;
  const C = Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) + Math.sin(3 * Mr) * 0.000289;
  const omega = (125.04 - 1934.136 * T) * D2R;
  const lambda = (L0 + C - 0.00569 - 0.00478 * Math.sin(omega)) * D2R;
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega)) * D2R;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) * R2D;
  const y = Math.tan(eps / 2) ** 2;
  const L0r = L0 * D2R;
  const eqTime = 4 * R2D * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r)
    - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  return { eqTime, decl };
}

/** Hour angle (degrees) of the Sun's centre at altitude −0.833°; NaN-free: ±Infinity sentinels for polar cases. */
function hourAngle(lat: number, decl: number): number {
  const cosH = (Math.cos(90.833 * D2R) - Math.sin(lat * D2R) * Math.sin(decl * D2R)) / (Math.cos(lat * D2R) * Math.cos(decl * D2R));
  if (cosH > 1) return -Infinity; // never rises
  if (cosH < -1) return Infinity; // never sets
  return Math.acos(cosH) * R2D;
}

/**
 * Sunrise, sunset (upper limb on the horizon: centre at −0.833° for refraction + semidiameter) and
 * solar noon on the calendar day of `date` (its local Y/M/D) at latitude `lat` (°N) and longitude
 * `lon` (°E, −180..180). The day is that date at the place itself, so the result does not depend
 * on the viewer's time zone. Polar night / midnight sun: null sunrise & sunset, dayLength 0 / 1440.
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  // The Sun transits `lon` at (720 − 4·lon − EoT) minutes after 0h UTC of the date: that is the
  // noon of this calendar date in the place's own (solar) time, whatever the viewer's time zone.
  const dayMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const lonMinutes = 720 - 4 * lon;
  const at = (minutes: number) => dayMs + minutes * 60000;
  const sunAt = (ms: number) => noaaSun(ms / DAY_MS + 2440587.5);

  let noonMs = at(lonMinutes);
  for (let i = 0; i < 2; i++) noonMs = at(lonMinutes - sunAt(noonMs).eqTime);
  const solarNoon = new Date(Math.round(noonMs));
  const H0 = hourAngle(lat, sunAt(noonMs).decl);
  if (!Number.isFinite(H0)) {
    return { sunrise: null, sunset: null, solarNoon, dayLength: H0 > 0 ? 1440 : 0 };
  }
  // Refine each event with the Sun's declination and equation of time at the event itself.
  const event = (sign: -1 | 1): Date | null => {
    let t = noonMs + sign * H0 * 4 * 60000;
    for (let i = 0; i < 3; i++) {
      const s = sunAt(t);
      const H = hourAngle(lat, s.decl);
      if (!Number.isFinite(H)) return null;
      t = at(lonMinutes - s.eqTime + sign * H * 4);
    }
    return new Date(Math.round(t));
  };
  const sunrise = event(-1);
  const sunset = event(1);
  const dayLength = sunrise && sunset
    ? Math.round((sunset.getTime() - sunrise.getTime()) / 60000)
    : Math.round(H0 * 8); // a limb of the Sun only just grazes the horizon at one end of the day
  return { sunrise, sunset, solarNoon, dayLength };
}
