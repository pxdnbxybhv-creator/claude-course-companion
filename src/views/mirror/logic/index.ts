// 水月幻镜 · logic: pure functions over data (plus the session, the one module with writes).
// API.md §2 names; the UI, engine and sim import from here.
export * from './rng';
export * from './formulas';
export * from './arena';
export * from './spawn';
export * from './items';
export * from './run';
export * from './levelup';
export * from './shop';
export * from './economy';
export * from './meta';
export * from './save';
// ── m8 (PLAN §3.3 S10): each lane appends one export line for its own new file
export * from './hidden';
export * from './lend';
export * from './tuning';
