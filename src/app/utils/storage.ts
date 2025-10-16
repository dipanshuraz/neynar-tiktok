// Enhanced storage utility with IndexedDB and localStorage fallback
// Provides async storage with better mobile/web support

'use client';

const DB_NAME = 'farcaster-feed-db';
const DB_VERSION = 1;
const STORE_NAME = 'preferences';

interface StorageValue {
  key: string;
  value: any;
  timestamp: number;
}

class Storage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private useIndexedDB = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.initPromise = this.init();
    }
  }

  private async init(): Promise<void> {
    // Check if IndexedDB is available
    if (!('indexedDB' in window)) {
      console.warn('IndexedDB not available, falling back to localStorage');
      this.useIndexedDB = false;
      return;
    }

    try {
      this.db = await this.openDB();
      this.useIndexedDB = true;
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ IndexedDB initialized successfully');
      }
    } catch (error) {
      console.warn('Failed to initialize IndexedDB, falling back to localStorage:', error);
      this.useIndexedDB = false;
    }
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          
          if (process.env.NODE_ENV === 'development') {
            console.log('📦 Created IndexedDB object store');
          }
        }
      };
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  async set(key: string, value: any): Promise<void> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      return this.setIndexedDB(key, value);
    } else {
      return this.setLocalStorage(key, value);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      return this.getIndexedDB<T>(key);
    } else {
      return this.getLocalStorage<T>(key);
    }
  }

  async remove(key: string): Promise<void> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      return this.removeIndexedDB(key);
    } else {
      return this.removeLocalStorage(key);
    }
  }

  async clear(): Promise<void> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      return this.clearIndexedDB();
    } else {
      return this.clearLocalStorage();
    }
  }

  async getAllKeys(): Promise<string[]> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      return this.getAllKeysIndexedDB();
    } else {
      return this.getAllKeysLocalStorage();
    }
  }

  // IndexedDB implementation
  private setIndexedDB(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const data: StorageValue = {
        key,
        value,
        timestamp: Date.now(),
      };

      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getIndexedDB<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result as StorageValue | undefined;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  private removeIndexedDB(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private clearIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private getAllKeysIndexedDB(): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('DB not initialized'));
        return;
      }

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAllKeys();

      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });
  }

  // localStorage fallback implementation
  private setLocalStorage(key: string, value: any): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private getLocalStorage<T>(key: string): Promise<T | null> {
    try {
      const item = localStorage.getItem(key);
      if (item === null) return Promise.resolve(null);
      return Promise.resolve(JSON.parse(item) as T);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private removeLocalStorage(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private clearLocalStorage(): Promise<void> {
    try {
      // Only clear our app's keys
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('farcaster-feed-')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private getAllKeysLocalStorage(): Promise<string[]> {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('farcaster-feed-')) {
          keys.push(key);
        }
      }
      return Promise.resolve(keys);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  // Utility methods
  async getSize(): Promise<number> {
    await this.ensureReady();

    if (this.useIndexedDB && this.db) {
      // Estimate size from IndexedDB
      const keys = await this.getAllKeysIndexedDB();
      let totalSize = 0;
      for (const key of keys) {
        const value = await this.getIndexedDB(key);
        totalSize += JSON.stringify(value).length;
      }
      return totalSize;
    } else {
      // Calculate localStorage size
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('farcaster-feed-')) {
          const value = localStorage.getItem(key);
          totalSize += key.length + (value?.length || 0);
        }
      }
      return totalSize;
    }
  }

  isUsingIndexedDB(): boolean {
    return this.useIndexedDB && this.db !== null;
  }

  async migrateFromLocalStorage(): Promise<void> {
    if (!this.useIndexedDB || !this.db) return;

    try {
      const keys = ['mute-state', 'last-index', 'last-video-id', 'last-cursor', 'playback-speed', 'volume'];
      
      for (const key of keys) {
        const fullKey = `farcaster-feed-${key}`;
        const value = localStorage.getItem(fullKey);
        
        if (value !== null) {
          try {
            const parsed = JSON.parse(value);
            await this.setIndexedDB(fullKey, parsed);
          } catch {
            // Not JSON, store as string
            await this.setIndexedDB(fullKey, value);
          }
        }
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Migrated data from localStorage to IndexedDB');
      }
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error);
    }
  }
}

// Create singleton instance
const storage = new Storage();

// Export storage instance and utility functions
export default storage;

export const setItem = (key: string, value: any) => storage.set(key, value);
export const getItem = <T = any>(key: string) => storage.get<T>(key);
export const removeItem = (key: string) => storage.remove(key);
export const clear = () => storage.clear();
export const getAllKeys = () => storage.getAllKeys();
export const getStorageSize = () => storage.getSize();
export const isUsingIndexedDB = () => storage.isUsingIndexedDB();
export const migrateFromLocalStorage = () => storage.migrateFromLocalStorage();

