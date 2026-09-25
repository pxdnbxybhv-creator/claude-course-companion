// STUB — the character models. Every id in data/characters.ts must have a factory here.
import type { CharacterRegistry } from './types';

export const FACTORIES: Partial<CharacterRegistry> = {};

/** A small painted portrait (2D canvas, ink style) for cards outside the 3D world. */
export function paintPortrait(canvas: HTMLCanvasElement, id: string, locked: boolean): void {
  void canvas; void id; void locked;
}
