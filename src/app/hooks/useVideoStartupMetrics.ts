
'use client';

import { useEffect, useRef, useState } from 'react';

interface StartupMetrics {
  lastStartupTime: number;
  avgStartupTime: number;
  minStartupTime: number;
  maxStartupTime: number;
  totalStartups: number;
  preloadCount: number;
  target: number; // Target startup time (200ms)
}

/**
 * Hook to monitor video startup performance
 * Tracks how quickly videos start playing after entering view
 */
export function useVideoStartupMetrics() {
  const [metrics, setMetrics] = useState<StartupMetrics>({
    lastStartupTime: 0,
    avgStartupTime: 0,
    minStartupTime: Infinity,
    maxStartupTime: 0,
    totalStartups: 0,
    preloadCount: 0,
    target: 200, // Target: < 200ms
  });

  const startupTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Listen for custom startup events
    const handleStartup = ((event: CustomEvent) => {
      const { startupTime, wasPreloaded } = event.detail;
      
      // Track startup time
      startupTimesRef.current.push(startupTime);
      if (startupTimesRef.current.length > 20) {
        startupTimesRef.current.shift(); // Keep last 20
      }

      // Calculate metrics
      const total = startupTimesRef.current.length;
      const sum = startupTimesRef.current.reduce((a, b) => a + b, 0);
      const avg = sum / total;
      const min = Math.min(...startupTimesRef.current);
      const max = Math.max(...startupTimesRef.current);

      setMetrics(prev => ({
        lastStartupTime: startupTime,
        avgStartupTime: Math.round(avg),
        minStartupTime: min,
        maxStartupTime: max,
        totalStartups: prev.totalStartups + 1,
        preloadCount: prev.preloadCount + (wasPreloaded ? 1 : 0),
        target: 200,
      }));

      if (process.env.NODE_ENV === 'development') {
        const status = startupTime < 200 ? '✅' : '⚠️';
        console.log(
          `${status} Video startup: ${startupTime.toFixed(0)}ms (avg: ${avg.toFixed(0)}ms)`
        );
      }
    }) as EventListener;

    window.addEventListener('videoStartup', handleStartup);

    return () => {
      window.removeEventListener('videoStartup', handleStartup);
    };
  }, []);

  return metrics;
}

/**
 * Dispatch a video startup event (call this from VideoPlayer)
 */
export function reportVideoStartup(startupTime: number, wasPreloaded: boolean = false) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('videoStartup', {
        detail: { startupTime, wasPreloaded },
      })
    );
  }
}

/**
 * Get startup performance assessment
 */
export function getStartupPerformanceStatus(
  avgTime: number,
  target: number = 200
): 'excellent' | 'good' | 'warning' | 'poor' {
  const ratio = avgTime / target;
  
  if (ratio < 0.5) return 'excellent'; // < 100ms
  if (ratio < 0.75) return 'good';      // < 150ms
  if (ratio < 1) return 'warning';      // < 200ms
  return 'poor';                         // > 200ms
}

