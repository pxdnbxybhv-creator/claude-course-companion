// Region scenery modules (see map.ts REGIONS). The garden itself is built by the core.
import type { RegionModule } from '../types';
import { bambooRegion } from './bamboo';
import { plumRegion } from './plum';
import { mountainRegion } from './mountain';
import { village } from './village';
import { lake } from './lake';
import { homeRegion } from './home';

export const REGION_MODULES: RegionModule[] = [bambooRegion, plumRegion, mountainRegion, village, lake, homeRegion];
