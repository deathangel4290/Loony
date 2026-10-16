import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

/** Async key/value storage so we can swap localStorage for native storage. */
export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStorage implements StorageBackend {
  private map = new Map<string, string>();
  async get(key: string) { return this.map.get(key) ?? null; }
  async set(key: string, value: string) { this.map.set(key, value); }
  async remove(key: string) { this.map.delete(key); }
}

export class LocalStorageBackend implements StorageBackend {
  async get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  async set(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* quota / private mode */ }
  }
  async remove(key: string) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

/** iOS can purge WKWebView localStorage under pressure; native prefs are durable. */
export class NativePreferencesBackend implements StorageBackend {
  async get(key: string) { return (await Preferences.get({ key })).value; }
  async set(key: string, value: string) { await Preferences.set({ key, value }); }
  async remove(key: string) { await Preferences.remove({ key }); }
}

export const createStorage = (): StorageBackend => {
  try {
    if (Capacitor.isNativePlatform()) return new NativePreferencesBackend();
  } catch { /* not running under Capacitor */ }
  try {
    const k = '__loony_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return new LocalStorageBackend();
  } catch {
    return new MemoryStorage();
  }
};
