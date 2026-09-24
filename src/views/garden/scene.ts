// Garden scene composition shared by the Garden view and the Scroll export. STUB — contract only.
import type { Habit } from '../../core/types';
import type { HabitStats } from '../../core/habits';
import type { SceneEnv } from '../../ink/scene-types';

export interface GardenPlant {
  habit: Habit;
  stats: HabitStats;
}

/** Paint a still image of the whole garden (backdrop, plants, rocks, pond) for export. */
export async function renderGardenStill(o: { width: number; height: number; dpr: number; plants: GardenPlant[]; env: SceneEnv }): Promise<HTMLCanvasElement> {
  const c = document.createElement('canvas');
  c.width = o.width * o.dpr; c.height = o.height * o.dpr;
  return c;
}
