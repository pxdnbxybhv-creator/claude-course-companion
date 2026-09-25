// 家园 · the homestead's ground: the plot (map.ts HOME_PLOT) with its lawn, a low bamboo fence and
// a gate-house under the homestead's name, and whatever the owner has built there (app/home.ts),
// batched by material and rebuilt as it changes. The work is done by the homestead's stage
// (features/home/build/stage.ts); the build mode (营造) and the homestead's life find it by ctx.
import type { RegionModule } from '../types';
import { HomeStage } from '../features/home/build/stage';

let stage: HomeStage | null = null;

export const homeRegion: RegionModule = {
  id: 'home',
  build(ctx) {
    stage?.dispose();
    stage = new HomeStage(ctx);
    stage.build();
  },
  dispose() {
    stage?.dispose();
    stage = null;
  },
};
