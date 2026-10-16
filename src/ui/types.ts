import type { Services } from '../systems/Services';
import type { RunMode } from '../systems/RunSummary';
import type { UIManager } from './UIManager';

export type MenuScreenName = 'menu' | 'garage' | 'vehicles' | 'worlds' | 'missions' | 'achievements' | 'settings';

/** Actions screens can ask the app to perform. */
export interface AppActions {
  startRun(mode?: RunMode): void;
  openChallenge(): void;
  goMenu(): void;
  open(screen: MenuScreenName): void;
  resume(): void;
  restart(): void;
  quitRun(to: 'menu' | 'garage'): void;
  pause(): void;
  refreshDemo(): void;
  openDaily(): void;
  toggleDebug(): void;
  resetProgress(): Promise<void>;
}

export interface UIContext {
  services: Services;
  ui: UIManager;
  app: AppActions;
}
