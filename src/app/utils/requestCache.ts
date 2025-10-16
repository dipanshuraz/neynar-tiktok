// Request deduplication and caching utility

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
}

class RequestCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pendingRequests = new Map<string, Promise<any>>();
  private readonly TTL = 30000; // 30 seconds cache

  /**
   * Get cached data or execute request with deduplication
   */
  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: { ttl?: number; skipCache?: boolean } = {}
  ): Promise<T> {
    const ttl = options.ttl || this.TTL;

    // Check if there's a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Deduplicating request: ${key}`);
      }
      return pending as Promise<T>;
    }

    // Check cache unless explicitly skipped
    if (!options.skipCache) {
      const cached = this.cache.get(key);
      if (cached && Date.now() - cached.timestamp < ttl) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Cache hit: ${key}`);
        }
        return cached.data as T;
      }
    }

    // Execute new request
    if (process.env.NODE_ENV === 'development') {
      console.log(`🌐 New request: ${key}`);
    }

    const promise = fetcher()
      .then((data) => {
        // Cache the result
        this.cache.set(key, {
          data,
          timestamp: Date.now(),
        });
        
        // Remove from pending
        this.pendingRequests.delete(key);
        
        return data;
      })
      .catch((error) => {
        // Remove from pending on error
        this.pendingRequests.delete(key);
        throw error;
      });

    // Store as pending
    this.pendingRequests.set(key, promise);

    return promise;
  }

  /**
   * Clear cache for a specific key
   */
  invalidate(key: string): void {
    this.cache.delete(key);
    this.pendingRequests.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.pendingRequests.clear();
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key);
      }
    }
  }
}

// Export singleton instance
export const requestCache = new RequestCache();

// Cleanup expired entries every minute
if (typeof window !== 'undefined') {
  setInterval(() => requestCache.cleanup(), 60000);
}

