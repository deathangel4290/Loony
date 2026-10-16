import { hashString } from '../core/math';
import type { StorageBackend } from './Storage';
import { createDefaultSave, sanitizeSave, SAVE_VERSION, type SaveData } from './SaveData';

const PRIMARY_KEY = 'loony.save';
const BACKUP_KEY = 'loony.save.bak';

interface Envelope {
  v: number;
  sum: number;
  data: string;
}

export type LoadSource = 'primary' | 'backup' | 'new';

/**
 * Persists the player profile. Saves are wrapped in a checksummed envelope and
 * the last known-good save is kept as a backup, so a torn write or corrupted
 * value falls back gracefully instead of wiping progress.
 */
export class SaveManager {
  data: SaveData = createDefaultSave();
  loadSource: LoadSource = 'new';
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private storage: StorageBackend, private debounceMs = 400) {}

  async load(): Promise<SaveData> {
    const primary = await this.read(PRIMARY_KEY);
    if (primary) {
      this.data = primary;
      this.loadSource = 'primary';
      return this.data;
    }
    const backup = await this.read(BACKUP_KEY);
    if (backup) {
      this.data = backup;
      this.loadSource = 'backup';
      this.markDirty();
      return this.data;
    }
    this.data = createDefaultSave();
    this.loadSource = 'new';
    return this.data;
  }

  private async read(key: string): Promise<SaveData | null> {
    try {
      const raw = await this.storage.get(key);
      if (!raw) return null;
      const env = JSON.parse(raw) as Envelope;
      if (!env || typeof env.data !== 'string' || hashString(env.data) !== env.sum) return null;
      const parsed = JSON.parse(env.data);
      return sanitizeSave(migrate(parsed));
    } catch {
      return null;
    }
  }

  markDirty(): void {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return this.writing;
    this.dirty = false;
    const json = JSON.stringify(this.data);
    const env: Envelope = { v: SAVE_VERSION, sum: hashString(json), data: json };
    const payload = JSON.stringify(env);
    this.writing = this.writing.then(async () => {
      try {
        const previous = await this.storage.get(PRIMARY_KEY);
        if (previous && isValidEnvelope(previous)) await this.storage.set(BACKUP_KEY, previous);
        await this.storage.set(PRIMARY_KEY, payload);
      } catch {
        this.dirty = true;
      }
    });
    return this.writing;
  }

  async reset(): Promise<void> {
    this.data = createDefaultSave();
    await this.storage.remove(PRIMARY_KEY);
    await this.storage.remove(BACKUP_KEY);
    this.dirty = true;
    await this.flush();
  }
}

const isValidEnvelope = (raw: string): boolean => {
  try {
    const env = JSON.parse(raw) as Envelope;
    return typeof env.data === 'string' && hashString(env.data) === env.sum;
  } catch {
    return false;
  }
};

/** Version migrations. Each step upgrades one version. */
const migrate = (data: unknown): unknown => {
  const d = data as { version?: number };
  if (!d || typeof d !== 'object') return data;
  // v1 is the first shipped format; future migrations go here, e.g.
  // if (d.version === 1) { ...; d.version = 2; }
  return d;
};
