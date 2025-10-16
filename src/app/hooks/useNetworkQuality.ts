// src/hooks/useNetworkQuality.ts - Monitor network quality and adapt behavior

'use client';

import { useEffect, useState, useRef } from 'react';

export type NetworkQuality = '4g' | '3g' | '2g' | 'slow-2g' | 'unknown';
export type NetworkSpeed = 'fast' | 'medium' | 'slow';

interface NetworkInfo {
  effectiveType: NetworkQuality;
  downlink?: number; // Mbps
  rtt?: number; // Round-trip time in ms
  saveData: boolean;
  speed: NetworkSpeed;
  shouldPreloadAggressive: boolean;
  maxPreloadCount: number; // How many videos to preload
  preloadDirection: 'both' | 'forward' | 'none';
}

/**
 * Hook to detect network quality and provide adaptive recommendations
 */
export function useNetworkQuality(): NetworkInfo {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    effectiveType: 'unknown',
    downlink: undefined,
    rtt: undefined,
    saveData: false,
    speed: 'medium',
    shouldPreloadAggressive: true,
    maxPreloadCount: 2,
    preloadDirection: 'both',
  });

  const lastUpdateRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const updateNetworkInfo = () => {
      // Throttle updates to every 5 seconds
      const now = Date.now();
      if (now - lastUpdateRef.current < 5000) return;
      lastUpdateRef.current = now;

      // Check if Network Information API is available
      const connection = (navigator as any).connection || 
                        (navigator as any).mozConnection || 
                        (navigator as any).webkitConnection;

      if (!connection) {
        // Default to medium quality if API not available
        setNetworkInfo({
          effectiveType: 'unknown',
          downlink: undefined,
          rtt: undefined,
          saveData: false,
          speed: 'medium',
          shouldPreloadAggressive: true,
          maxPreloadCount: 1, // Conservative default
          preloadDirection: 'forward',
        });
        return;
      }

      const effectiveType = connection.effectiveType || 'unknown';
      const downlink = connection.downlink; // Mbps
      const rtt = connection.rtt; // ms
      const saveData = connection.saveData || false;

      // Determine speed category
      let speed: NetworkSpeed = 'medium';
      let shouldPreloadAggressive = true;
      let maxPreloadCount = 2;
      let preloadDirection: 'both' | 'forward' | 'none' = 'both';

      // Analyze connection quality
      if (saveData) {
        // User has enabled data saver mode
        speed = 'slow';
        shouldPreloadAggressive = false;
        maxPreloadCount = 0; // No preloading in data saver mode
        preloadDirection = 'none';
      } else if (effectiveType === '4g' && (!downlink || downlink > 10)) {
        // Fast 4G connection (> 10 Mbps)
        speed = 'fast';
        shouldPreloadAggressive = true;
        maxPreloadCount = 2; // Preload 2 videos
        preloadDirection = 'both'; // Preload both directions
      } else if (effectiveType === '4g' || (downlink && downlink > 5)) {
        // Regular 4G or good connection (> 5 Mbps)
        speed = 'medium';
        shouldPreloadAggressive = true;
        maxPreloadCount = 1; // Preload 1 video
        preloadDirection = 'forward'; // Only forward
      } else if (effectiveType === '3g' || (downlink && downlink > 1.5)) {
        // 3G connection (1.5-5 Mbps)
        speed = 'medium';
        shouldPreloadAggressive = false;
        maxPreloadCount = 1; // Preload 1 video
        preloadDirection = 'forward';
      } else {
        // Slow connection (2G or < 1.5 Mbps)
        speed = 'slow';
        shouldPreloadAggressive = false;
        maxPreloadCount = 0; // No preloading on slow connections
        preloadDirection = 'none';
      }

      // Consider RTT (round-trip time)
      if (rtt && rtt > 500) {
        // High latency - reduce preloading
        speed = 'slow';
        shouldPreloadAggressive = false;
        maxPreloadCount = Math.min(maxPreloadCount, 1);
      }

      setNetworkInfo({
        effectiveType,
        downlink,
        rtt,
        saveData,
        speed,
        shouldPreloadAggressive,
        maxPreloadCount,
        preloadDirection,
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('📶 Network Quality:', {
          type: effectiveType,
          speed,
          downlink: downlink ? `${downlink.toFixed(1)} Mbps` : 'N/A',
          rtt: rtt ? `${rtt}ms` : 'N/A',
          preload: `${maxPreloadCount} videos (${preloadDirection})`,
        });
      }
    };

    // Initial check
    updateNetworkInfo();

    // Listen for connection changes
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;

    if (connection) {
      connection.addEventListener('change', updateNetworkInfo);
      
      return () => {
        connection.removeEventListener('change', updateNetworkInfo);
      };
    }

    // Fallback: periodic check if no change events
    const intervalId = setInterval(updateNetworkInfo, 30000); // Check every 30s
    return () => clearInterval(intervalId);
  }, []);

  return networkInfo;
}

/**
 * Get recommended HLS buffer settings based on network quality
 */
export function getHLSBufferSettings(speed: NetworkSpeed) {
  switch (speed) {
    case 'fast':
      return {
        maxBufferLength: 5,
        maxMaxBufferLength: 15,
        maxBufferSize: 60 * 1000 * 1000, // 60 MB
      };
    case 'medium':
      return {
        maxBufferLength: 4,
        maxMaxBufferLength: 10,
        maxBufferSize: 40 * 1000 * 1000, // 40 MB
      };
    case 'slow':
      return {
        maxBufferLength: 3,
        maxMaxBufferLength: 6,
        maxBufferSize: 20 * 1000 * 1000, // 20 MB
      };
  }
}

/**
 * Format network speed for display
 */
export function formatNetworkSpeed(downlink?: number): string {
  if (!downlink) return 'N/A';
  
  if (downlink >= 1) {
    return `${downlink.toFixed(1)} Mbps`;
  } else {
    return `${(downlink * 1000).toFixed(0)} Kbps`;
  }
}

/**
 * Get color for network quality indicator
 */
export function getNetworkQualityColor(speed: NetworkSpeed): string {
  switch (speed) {
    case 'fast': return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'slow': return 'text-red-400';
  }
}

/**
 * Check if we should preload a video based on network and position
 */
export function shouldPreloadVideo(
  currentIndex: number,
  videoIndex: number,
  networkInfo: NetworkInfo
): boolean {
  const { maxPreloadCount, preloadDirection, saveData } = networkInfo;

  // Never preload in data saver mode
  if (saveData || preloadDirection === 'none') {
    return false;
  }

  const distance = videoIndex - currentIndex;
  const absDistance = Math.abs(distance);

  // Check if within preload range
  if (absDistance === 0 || absDistance > maxPreloadCount) {
    return false;
  }

  // Check direction
  if (preloadDirection === 'forward') {
    return distance > 0; // Only preload videos ahead
  } else {
    return true; // Preload both directions
  }
}

