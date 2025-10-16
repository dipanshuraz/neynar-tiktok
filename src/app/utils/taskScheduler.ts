// src/utils/taskScheduler.ts - Break up long tasks for smooth rendering

/**
 * Yields to the main thread to prevent blocking
 * Uses scheduler API when available, falls back to setTimeout
 */
export async function yieldToMain(): Promise<void> {
  // Try scheduler.yield() first (Chrome 94+)
  if ('scheduler' in window && 'yield' in (window.scheduler as any)) {
    return (window.scheduler as any).yield();
  }
  
  // Fallback: Use setTimeout(0) to yield
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

/**
 * Execute a task during idle time
 * @param callback - Function to execute
 * @param options - Timeout options
 */
export function scheduleIdleTask(
  callback: () => void,
  options?: { timeout?: number }
): number {
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  }
  
  // Fallback for browsers without requestIdleCallback
  return window.setTimeout(callback, 1) as any;
}

/**
 * Cancel an idle task
 * @param handle - Handle returned from scheduleIdleTask
 */
export function cancelIdleTask(handle: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle);
  } else {
    clearTimeout(handle);
  }
}

/**
 * Process an array in chunks to avoid blocking the main thread
 * @param items - Array to process
 * @param processor - Function to process each item
 * @param chunkSize - Number of items to process before yielding (default: 50)
 */
export async function processArrayInChunks<T>(
  items: T[],
  processor: (item: T, index: number) => void,
  chunkSize: number = 50
): Promise<void> {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    
    // Process chunk
    chunk.forEach((item, idx) => {
      processor(item, i + idx);
    });
    
    // Yield to main thread after each chunk
    if (i + chunkSize < items.length) {
      await yieldToMain();
    }
  }
}

/**
 * Debounce a function with requestAnimationFrame for better performance
 * @param callback - Function to debounce
 */
export function rafDebounce<T extends (...args: any[]) => any>(
  callback: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  
  return (...args: Parameters<T>) => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
    }
    
    rafId = requestAnimationFrame(() => {
      callback(...args);
      rafId = null;
    });
  };
}

/**
 * Throttle a function to run at most once per frame
 * @param callback - Function to throttle
 */
export function rafThrottle<T extends (...args: any[]) => any>(
  callback: T
): (...args: Parameters<T>) => void {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;
  
  return (...args: Parameters<T>) => {
    lastArgs = args;
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        if (lastArgs !== null) {
          callback(...lastArgs);
        }
        rafId = null;
        lastArgs = null;
      });
    }
  };
}

/**
 * Measure task duration and warn if it exceeds threshold
 * @param taskName - Name of the task for logging
 * @param task - Function to measure
 * @param threshold - Warning threshold in ms (default: 50ms)
 */
export async function measureTask<T>(
  taskName: string,
  task: () => T | Promise<T>,
  threshold: number = 50
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await task();
    const duration = performance.now() - startTime;
    
    if (duration > threshold && process.env.NODE_ENV === 'development') {
      console.warn(
        `⚠️ Long task detected: "${taskName}" took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
      );
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`❌ Task "${taskName}" failed after ${duration.toFixed(2)}ms:`, error);
    throw error;
  }
}

/**
 * Run tasks with priority using scheduler.postTask when available
 * @param task - Function to run
 * @param priority - Task priority: 'user-blocking' | 'user-visible' | 'background'
 */
export async function runWithPriority<T>(
  task: () => T | Promise<T>,
  priority: 'user-blocking' | 'user-visible' | 'background' = 'user-visible'
): Promise<T> {
  // Use scheduler.postTask if available (Chrome 94+)
  if ('scheduler' in window && 'postTask' in (window.scheduler as any)) {
    return (window.scheduler as any).postTask(task, { priority });
  }
  
  // Fallback: Execute immediately for user-blocking, defer others
  if (priority === 'user-blocking') {
    return await task();
  } else {
    await yieldToMain();
    return await task();
  }
}

/**
 * Batch multiple state updates into a single render
 * Uses React's automatic batching in React 18+
 */
export function batchUpdates<T>(updates: () => T): T {
  // In React 18+, all state updates are automatically batched
  // This is a no-op but kept for backwards compatibility
  return updates();
}

/**
 * Check if the current frame budget allows for more work
 * @param threshold - Remaining ms threshold (default: 10ms)
 * @returns true if there's time left in the frame
 */
export function hasFrameBudget(threshold: number = 10): boolean {
  // Estimate: Aim for 60fps = 16.67ms per frame
  const FRAME_BUDGET = 16.67;
  
  if ('performance' in window && 'now' in performance) {
    const frameStart = performance.now();
    const timeSinceFrameStart = frameStart % FRAME_BUDGET;
    const remainingTime = FRAME_BUDGET - timeSinceFrameStart;
    
    return remainingTime > threshold;
  }
  
  return true; // Default to allowing work if we can't measure
}

/**
 * Create a long task observer to monitor performance
 * @param callback - Called when a long task is detected
 * @returns Cleanup function
 */
export function observeLongTasks(
  callback: (entry: PerformanceEntry) => void
): () => void {
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            callback(entry);
          }
        }
      });
      
      observer.observe({ entryTypes: ['longtask'] });
      
      return () => observer.disconnect();
    } catch (error) {
      console.warn('Long task monitoring not supported:', error);
    }
  }
  
  return () => {}; // No-op cleanup
}

