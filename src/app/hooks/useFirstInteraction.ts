// src/hooks/useFirstInteraction.ts - Track first interaction timing

'use client';

import { useEffect, useState } from 'react';

interface FirstInteractionMetrics {
  timeToFirstInteraction: number | null;
  isInteractive: boolean;
}

/**
 * Hook to measure time to first interaction
 * Tracks when the page becomes interactive after load
 */
export function useFirstInteraction(): FirstInteractionMetrics {
  const [metrics, setMetrics] = useState<FirstInteractionMetrics>({
    timeToFirstInteraction: null,
    isInteractive: false,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const pageLoadTime = performance.now();
    let interactionRecorded = false;

    const recordInteraction = (eventType: string) => {
      if (interactionRecorded) return;

      const interactionTime = performance.now();
      const timeToInteraction = interactionTime - pageLoadTime;

      interactionRecorded = true;

      setMetrics({
        timeToFirstInteraction: timeToInteraction,
        isInteractive: true,
      });

      if (process.env.NODE_ENV === 'development') {
        const status = timeToInteraction < 150 ? '✅' : '⚠️';
        console.log(
          `${status} First ${eventType}: ${timeToInteraction.toFixed(2)}ms (target: < 150ms)`
        );
      }

      // Clean up listeners after first interaction
      cleanup();
    };

    const handleInteraction = (e: Event) => {
      recordInteraction(e.type);
    };

    // Listen for various interaction types
    const events = ['click', 'touchstart', 'keydown', 'scroll', 'wheel'];
    events.forEach(event => {
      document.addEventListener(event, handleInteraction, { 
        once: true, 
        passive: true 
      });
    });

    const cleanup = () => {
      events.forEach(event => {
        document.removeEventListener(event, handleInteraction);
      });
    };

    // Also mark as interactive after a timeout (fallback)
    const timeoutId = setTimeout(() => {
      if (!interactionRecorded) {
        setMetrics(prev => ({ ...prev, isInteractive: true }));
      }
    }, 3000);

    return () => {
      cleanup();
      clearTimeout(timeoutId);
    };
  }, []);

  return metrics;
}

/**
 * Hook to optimize initial render priority
 * Defers non-critical work until after first paint
 */
export function useDeferredWork<T>(
  work: () => T,
  delay: number = 100
): T | null {
  const [result, setResult] = useState<T | null>(null);

  useEffect(() => {
    // Defer work until after initial render
    const timeoutId = setTimeout(() => {
      const workResult = work();
      setResult(workResult);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [work, delay]);

  return result;
}

/**
 * Measure and log First Input Delay (FID) / Interaction to Next Paint (INP)
 */
export function measureFirstInputDelay(): () => void {
  if (typeof window === 'undefined') return () => {};

  let firstInputRecorded = false;

  const handleFirstInput = (event: PerformanceEventTiming) => {
    if (firstInputRecorded) return;

    firstInputRecorded = true;
    const fid = event.processingStart - event.startTime;

    if (process.env.NODE_ENV === 'development') {
      const status = fid < 100 ? '✅' : fid < 300 ? '⚠️' : '❌';
      console.log(
        `${status} First Input Delay: ${fid.toFixed(2)}ms (good: < 100ms, needs improvement: < 300ms)`
      );
    }
  };

  // Use PerformanceObserver to capture first input
  if ('PerformanceObserver' in window) {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!firstInputRecorded) {
            handleFirstInput(entry as PerformanceEventTiming);
          }
        }
      });

      observer.observe({ type: 'first-input', buffered: true });

      return () => observer.disconnect();
    } catch (error) {
      console.warn('First Input Delay monitoring not supported');
    }
  }

  return () => {};
}

