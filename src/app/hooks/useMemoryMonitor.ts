
'use client';

import { useEffect, useState, useRef } from 'react';

interface MemoryMetrics {
  usedHeapSize: number;
  totalHeapSize: number;
  heapLimit: number;
  percentage: number;
  isLeaking: boolean;
  trend: 'stable' | 'increasing' | 'decreasing';
}

/**
 * Hook to monitor memory usage and detect potential leaks
 * @param checkInterval - How often to check memory (ms)
 * @param leakThreshold - Consecutive increases to flag as leak
 */
export function useMemoryMonitor(
  checkInterval: number = 5000,
  leakThreshold: number = 5
): MemoryMetrics | null {
  const [metrics, setMetrics] = useState<MemoryMetrics | null>(null);
  const historyRef = useRef<number[]>([]);
  const increasesRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!('memory' in performance)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Memory API not available. Use Chrome with --enable-precise-memory-info flag');
      }
      return;
    }

    const checkMemory = () => {
      const memory = (performance as any).memory;
      
      const current = memory.usedJSHeapSize;
      const total = memory.totalJSHeapSize;
      const limit = memory.jsHeapSizeLimit;
      const percentage = Math.round((current / limit) * 100);

      // Track history
      historyRef.current.push(current);
      if (historyRef.current.length > 10) {
        historyRef.current.shift();
      }

      // Detect trend
      let trend: 'stable' | 'increasing' | 'decreasing' = 'stable';
      let isLeaking = false;

      if (historyRef.current.length >= 3) {
        const recent = historyRef.current.slice(-3);
        const isIncreasing = recent.every((val, i) => i === 0 || val > recent[i - 1]);
        const isDecreasing = recent.every((val, i) => i === 0 || val < recent[i - 1]);

        if (isIncreasing) {
          trend = 'increasing';
          increasesRef.current++;
        } else if (isDecreasing) {
          trend = 'decreasing';
          increasesRef.current = 0;
        } else {
          trend = 'stable';
          increasesRef.current = 0;
        }

        // Flag as leak if increasing for too long
        isLeaking = increasesRef.current >= leakThreshold;
      }

      setMetrics({
        usedHeapSize: current,
        totalHeapSize: total,
        heapLimit: limit,
        percentage,
        isLeaking,
        trend,
      });

      if (isLeaking && process.env.NODE_ENV === 'development') {
        console.warn(
          `⚠️ Potential memory leak detected! Heap increasing for ${increasesRef.current} consecutive checks`
        );
        console.warn(`Current: ${formatBytes(current)} / ${formatBytes(limit)}`);
      }
    };

    // Initial check
    checkMemory();

    // Periodic checks
    const intervalId = setInterval(checkMemory, checkInterval);

    return () => clearInterval(intervalId);
  }, [checkInterval, leakThreshold]);

  return metrics;
}

/**
 * Force garbage collection (for testing only, requires Chrome flags)
 */
export function triggerGC(): boolean {
  if (typeof window === 'undefined') return false;

  // @ts-ignore - gc is available in Chrome with --expose-gc flag
  if (typeof window.gc === 'function') {
    // @ts-ignore
    window.gc();
    if (process.env.NODE_ENV === 'development') {
      console.log('🗑️ Manual garbage collection triggered');
    }
    return true;
  }

  if (process.env.NODE_ENV === 'development') {
    console.warn('GC not available. Run Chrome with --expose-gc flag');
  }
  return false;
}

/**
 * Create a heap snapshot (Chrome DevTools only)
 */
export function takeHeapSnapshot(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('📸 To take heap snapshot:');
    console.log('1. Open Chrome DevTools');
    console.log('2. Go to Memory tab');
    console.log('3. Click "Take snapshot"');
  }
}

/**
 * Format bytes to human-readable format
 */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

/**
 * Hook to track object creation/destruction for leak detection
 */
export function useObjectTracker(objectType: string) {
  const countRef = useRef(0);

  useEffect(() => {
    countRef.current++;
    const currentCount = countRef.current;

    if (process.env.NODE_ENV === 'development') {
      console.log(`✨ Created ${objectType} #${currentCount}`);
    }

    return () => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🗑️ Destroyed ${objectType} #${currentCount}`);
      }
    };
  }, [objectType]);
}

/**
 * WeakMap-based cache that doesn't prevent GC
 */
export class MemoryEfficientCache<K extends object, V> {
  private cache = new WeakMap<K, V>();

  set(key: K, value: V): void {
    this.cache.set(key, value);
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }
}

/**
 * Monitor a specific component for memory leaks
 */
export function useComponentMemoryTracking(componentName: string) {
  const mountTimeRef = useRef<number>(0);

  useEffect(() => {
    mountTimeRef.current = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 [${componentName}] Mounted - tracking memory`);
    }

    return () => {
      const lifetime = Date.now() - mountTimeRef.current;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 [${componentName}] Unmounted after ${lifetime}ms`);
      }
    };
  }, [componentName]);
}

