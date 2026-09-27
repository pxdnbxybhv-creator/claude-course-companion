// 水月幻镜 · the tab's entry: App.tsx loads MirrorView lazily through this path's default export.
// Nothing eager belongs here (it would pull the registry into the main bundle); the tab's ink dot
// reads src/app/mirror.ts directly.
export { default } from './MirrorView';
