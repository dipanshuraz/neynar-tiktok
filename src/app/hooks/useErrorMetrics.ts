// src/hooks/useErrorMetrics.ts - Track video loading errors and retries

'use client';

import { useEffect, useState, useRef } from 'react';

interface ErrorMetrics {
  totalErrors: number;
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  lastErrorType: string | null;
  errorRate: number; // Percentage of videos that error
  avgRetriesPerError: number;
}

interface ErrorEvent {
  type: string;
  timestamp: number;
  retryCount: number;
  recovered: boolean;
}

/**
 * Hook to track video error metrics across the session
 */
export function useErrorMetrics(): ErrorMetrics {
  const [metrics, setMetrics] = useState<ErrorMetrics>({
    totalErrors: 0,
    totalRetries: 0,
    successfulRetries: 0,
    failedRetries: 0,
    lastErrorType: null,
    errorRate: 0,
    avgRetriesPerError: 0,
  });

  const errorHistoryRef = useRef<ErrorEvent[]>([]);
  const totalVideosRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Listen for error events
    const handleVideoError = ((event: CustomEvent) => {
      const { errorType, retryCount, recovered } = event.detail;

      // Track error
      errorHistoryRef.current.push({
        type: errorType,
        timestamp: Date.now(),
        retryCount,
        recovered,
      });

      // Keep only last 50 errors
      if (errorHistoryRef.current.length > 50) {
        errorHistoryRef.current.shift();
      }

      // Calculate metrics
      const totalErrors = errorHistoryRef.current.length;
      const totalRetries = errorHistoryRef.current.reduce((sum, e) => sum + e.retryCount, 0);
      const successfulRetries = errorHistoryRef.current.filter(e => e.recovered).length;
      const failedRetries = totalErrors - successfulRetries;
      const errorRate = totalVideosRef.current > 0
        ? Math.round((totalErrors / totalVideosRef.current) * 100)
        : 0;
      const avgRetriesPerError = totalErrors > 0
        ? Math.round((totalRetries / totalErrors) * 10) / 10
        : 0;

      setMetrics({
        totalErrors,
        totalRetries,
        successfulRetries,
        failedRetries,
        lastErrorType: errorType,
        errorRate,
        avgRetriesPerError,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Error Metrics:', {
          totalErrors,
          totalRetries,
          successfulRetries,
          failedRetries,
          errorRate: `${errorRate}%`,
        });
      }
    }) as EventListener;

    // Listen for video load events (to track total videos)
    const handleVideoLoad = (() => {
      totalVideosRef.current++;
    }) as EventListener;

    window.addEventListener('videoError', handleVideoError);
    window.addEventListener('videoLoaded', handleVideoLoad);

    return () => {
      window.removeEventListener('videoError', handleVideoError);
      window.removeEventListener('videoLoaded', handleVideoLoad);
    };
  }, []);

  return metrics;
}

/**
 * Report a video error (call from VideoPlayer)
 */
export function reportVideoError(
  errorType: string,
  retryCount: number,
  recovered: boolean = false
) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('videoError', {
        detail: { errorType, retryCount, recovered },
      })
    );
  }
}

/**
 * Report a successful video load (call from VideoPlayer)
 */
export function reportVideoLoaded() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('videoLoaded'));
  }
}

/**
 * Get error severity level
 */
export function getErrorSeverity(errorRate: number): 'good' | 'warning' | 'critical' {
  if (errorRate < 5) return 'good';       // < 5% errors
  if (errorRate < 15) return 'warning';   // 5-15% errors
  return 'critical';                       // > 15% errors
}

/**
 * Get error recovery rate
 */
export function getRecoveryRate(metrics: ErrorMetrics): number {
  if (metrics.totalErrors === 0) return 100;
  return Math.round((metrics.successfulRetries / metrics.totalErrors) * 100);
}

