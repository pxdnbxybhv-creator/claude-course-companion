// 家园 · the homestead's features: building (./build) and life (./life).
import type { WorldFeature } from '../../types';
import { HOME_BUILD_FEATURES } from './build';
import { HOME_LIFE_FEATURES } from './life';

export const HOME_FEATURES: WorldFeature[] = [...HOME_BUILD_FEATURES, ...HOME_LIFE_FEATURES];
