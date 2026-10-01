// 水月幻镜 · m8 · the 模拟场's pieces RunView mounts (types only: RunView imports nothing of the sandbox's code;
// MirrorView loads the sandbox chunk and hands these in). SANDBOX owns it.
import type { ComponentType } from 'preact';
import type { HudState, RunSave } from '../../types';
import type { MirrorEngine } from '../../engine';
import type { SandSession } from './session';

export interface DockProps {
  sess: SandSession;
  engine: () => MirrorEngine | null;
  run: RunSave;
  midWave: boolean;
  /** A change between waves (sheet, weapons, items, 月华, level): saved in memory and shown, like a shop action. */
  onRun: (r: RunSave) => void;
  /** 重开此重 / 应用并重开此重: the wave again from the run as it was before it, with every edit. */
  onRestart: () => void;
  /** Back between waves at this run (跳到第 N 重, 现在开店); a wave in play is stopped first. */
  onBetween: (r: RunSave) => void;
  /** The phone sheet is open during a wave: hold the engine (a desktop panel never holds). */
  onHold: (on: boolean) => void;
}
export interface DeathProps {
  sess: SandSession;
  onReplay: () => void;
  onBack: () => void;
}
export interface PauseProps {
  open: boolean;
  run: RunSave;
  midWave: boolean;
  live: HudState | null;
  onResume: () => void;
  /** 回场前: nothing to settle, back to the setup page. */
  onBack: () => void;
}
export interface SandUi {
  Dock: ComponentType<DockProps>;
  Death: ComponentType<DeathProps>;
  /** The sandbox's pause sheet (no 暂离 count, no 弃镜 settlement: nothing here is paid or recorded). */
  Pause: ComponentType<PauseProps>;
}
