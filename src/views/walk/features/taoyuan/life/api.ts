// 桃源 · 二期: where a world's LifeApi can be found without importing life/index.ts (which imports every
// builder's module: importing it back would make a cycle). life/index.ts sets it when the feature
// starts and clears it on dispose. Pure. Owner: L.
import type { WorldCtx } from '../../../types';
import type { LifeApi } from './types';

const apis = new WeakMap<WorldCtx, LifeApi>();

/** This world's life API (null before the feature starts, after it is disposed, or where 桃源 is absent). */
export function lifeOf(ctx: WorldCtx): LifeApi | null {
  return apis.get(ctx) ?? null;
}

/** (life/index.ts) register, or clear, a world's API. */
export function setLife(ctx: WorldCtx, api: LifeApi | null): void {
  if (api) apis.set(ctx, api);
  else apis.delete(ctx);
}
