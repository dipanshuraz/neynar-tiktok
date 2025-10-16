// src/hooks/useLongTaskMonitor.ts - Monitor and report long tasks

'use client';

import { useEffect, useState } from 'react';

interface LongTaskStats {
  count: number;
  longestDuration: number;
  averageDuration: number;
  recentTasks: Array<{
    duration: number;
    timestamp: number;
    name: string;
  }>;
}

export function useLongTaskMonitor(threshold: number = 50) {
  const [stats, setStats] = useState<LongTaskStats>({
    count: 0,
    longestDuration: 0,
    averageDuration: 0,
    recentTasks: [],
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const longTasks: Array<{
      duration: number;
      timestamp: number;
      name: string;
    }> = [];

    // Try to use PerformanceObserver for longtask
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > threshold) {
              const task = {
                duration: entry.duration,
                timestamp: entry.startTime,
                name: entry.name || 'unknown',
              };
              
              longTasks.push(task);
              
              // Keep only last 10 tasks
              if (longTasks.length > 10) {
                longTasks.shift();
              }
              
              // Update stats
              const totalDuration = longTasks.reduce((sum, t) => sum + t.duration, 0);
              const maxDuration = Math.max(...longTasks.map(t => t.duration));
              
              setStats({
                count: longTasks.length,
                longestDuration: maxDuration,
                averageDuration: totalDuration / longTasks.length,
                recentTasks: [...longTasks],
              });
              
              if (process.env.NODE_ENV === 'development') {
                console.warn(
                  `⚠️ Long task detected: ${entry.name} (${entry.duration.toFixed(2)}ms)`
                );
              }
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });

        return () => observer.disconnect();
      } catch (error) {
        console.warn('Long task monitoring not supported:', error);
      }
    }

    // Fallback: Monitor performance.now() gaps
    let lastTime = performance.now();
    let rafId: number;

    const checkFrameTime = () => {
      const now = performance.now();
      const frameDuration = now - lastTime;

      if (frameDuration > threshold) {
        const task = {
          duration: frameDuration,
          timestamp: now,
          name: 'frame-gap',
        };

        longTasks.push(task);
        
        if (longTasks.length > 10) {
          longTasks.shift();
        }

        const totalDuration = longTasks.reduce((sum, t) => sum + t.duration, 0);
        const maxDuration = Math.max(...longTasks.map(t => t.duration));

        setStats({
          count: longTasks.length,
          longestDuration: maxDuration,
          averageDuration: totalDuration / longTasks.length,
          recentTasks: [...longTasks],
        });
      }

      lastTime = now;
      rafId = requestAnimationFrame(checkFrameTime);
    };

    rafId = requestAnimationFrame(checkFrameTime);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [threshold]);

  return stats;
}

