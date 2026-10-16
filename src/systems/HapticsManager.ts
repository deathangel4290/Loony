import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type Kind = 'tap' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'select';

const MIN_INTERVAL: Record<Kind, number> = {
  tap: 40, light: 70, medium: 90, heavy: 120, success: 300, warning: 300, select: 40,
};

/**
 * Thin wrapper over Capacitor Haptics (Taptic Engine on iOS, vibrate on web /
 * Android). Rate-limited so streams of coin pickups never feel buzzy.
 */
export class HapticsManager {
  enabled = true;
  private last: Partial<Record<Kind, number>> = {};

  private gate(kind: Kind): boolean {
    if (!this.enabled) return false;
    const now = performance.now();
    if (now - (this.last[kind] ?? -1e9) < MIN_INTERVAL[kind]) return false;
    this.last[kind] = now;
    return true;
  }

  private run(fn: () => Promise<unknown>): void {
    try {
      fn().catch(() => undefined);
    } catch {
      /* unsupported */
    }
  }

  tap(): void { if (this.gate('tap')) this.run(() => Haptics.impact({ style: ImpactStyle.Light })); }
  select(): void { if (this.gate('select')) this.run(() => Haptics.selectionChanged()); }
  light(): void { if (this.gate('light')) this.run(() => Haptics.impact({ style: ImpactStyle.Light })); }
  medium(): void { if (this.gate('medium')) this.run(() => Haptics.impact({ style: ImpactStyle.Medium })); }
  heavy(): void { if (this.gate('heavy')) this.run(() => Haptics.impact({ style: ImpactStyle.Heavy })); }
  success(): void { if (this.gate('success')) this.run(() => Haptics.notification({ type: NotificationType.Success })); }
  warning(): void { if (this.gate('warning')) this.run(() => Haptics.notification({ type: NotificationType.Warning })); }
}
