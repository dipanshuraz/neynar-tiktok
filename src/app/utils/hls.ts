// src/app/utils/hls.ts
// HLS.js utilities and configuration

import Hls from 'hls.js';
import { NetworkSpeed, getHLSBufferSettings } from '../hooks/useNetworkQuality';
import { VIDEO, DEV } from '../config/constants';

/**
 * Check if HLS.js is supported in the browser
 */
export function isHLSSupported(): boolean {
  return Hls.isSupported();
}

/**
 * Check if native HLS is supported (Safari)
 */
export function isNativeHLSSupported(videoElement: HTMLVideoElement): boolean {
  return videoElement.canPlayType('application/vnd.apple.mpegurl') !== '';
}

/**
 * Create and configure HLS instance with network-aware settings
 */
export function createHLSInstance(
  networkSpeed: NetworkSpeed = 'medium'
): Hls {
  const bufferSettings = getHLSBufferSettings(networkSpeed);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const timeoutMultiplier = isMobile ? 0.5 : 1;

  return new Hls({
    // Performance
    debug: false,
    enableWorker: true,
    
    // Network-adaptive buffer settings
    maxBufferLength: bufferSettings.maxBufferLength,
    maxMaxBufferLength: bufferSettings.maxMaxBufferLength,
    maxBufferSize: bufferSettings.maxBufferSize,
    maxBufferHole: 0.5,
    lowLatencyMode: true,
    backBufferLength: 0,
    
    // Aggressive manifest loading
    manifestLoadingTimeOut: VIDEO.TIMEOUT.MANIFEST_LOADING * timeoutMultiplier,
    manifestLoadingMaxRetry: networkSpeed === 'slow' 
      ? VIDEO.RETRY.MANIFEST_MAX_RETRY_FAST 
      : VIDEO.RETRY.MANIFEST_MAX_RETRY_NORMAL,
    manifestLoadingRetryDelay: VIDEO.RETRY.RETRY_DELAY_MS,
    
    // Aggressive fragment loading
    fragLoadingTimeOut: VIDEO.TIMEOUT.FRAGMENT_LOADING * timeoutMultiplier,
    fragLoadingMaxRetry: networkSpeed === 'slow' 
      ? VIDEO.RETRY.FRAGMENT_MAX_RETRY_FAST 
      : VIDEO.RETRY.FRAGMENT_MAX_RETRY_NORMAL,
    fragLoadingRetryDelay: VIDEO.RETRY.RETRY_DELAY_MS,
    
    // Start playback ASAP
    liveSyncDurationCount: 1,
    liveMaxLatencyDurationCount: 3,
    
    // Abort controller for stalled requests
    xhrSetup: function(xhr: XMLHttpRequest) {
      xhr.timeout = VIDEO.TIMEOUT.XHR * timeoutMultiplier;
    },
  });
}

/**
 * Load HLS source into video element
 */
export function loadHLSSource(
  hls: Hls,
  videoElement: HTMLVideoElement,
  url: string,
  onManifestParsed?: () => void,
  onError?: (error: any) => void
): void {
  // Attach media element
  hls.attachMedia(videoElement);
  
  // Load source
  hls.on(Hls.Events.MEDIA_ATTACHED, () => {
    if (DEV.ENABLE_CONSOLE_LOGS) {
      console.log('📺 HLS media attached');
    }
    hls.loadSource(url);
  });
  
  // Manifest parsed
  if (onManifestParsed) {
    hls.on(Hls.Events.MANIFEST_PARSED, onManifestParsed);
  }
  
  // Error handling
  if (onError) {
    hls.on(Hls.Events.ERROR, (_event, data) => onError(data));
  }
}

/**
 * Destroy HLS instance and clean up resources
 */
export function destroyHLS(hls: Hls | null): void {
  if (hls) {
    if (DEV.ENABLE_CONSOLE_LOGS) {
      console.log('🧹 Destroying HLS instance');
    }
    hls.destroy();
  }
}

/**
 * Handle HLS errors with recovery strategies
 */
export function handleHLSError(
  hls: Hls,
  data: any,
  onFatalError: () => void
): void {
  if (DEV.ENABLE_CONSOLE_LOGS) {
    console.error('HLS Error:', data);
  }

  if (data.fatal) {
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        if (DEV.ENABLE_CONSOLE_LOGS) {
          console.log('🔄 HLS Network error, attempting retry...');
        }
        onFatalError();
        break;

      case Hls.ErrorTypes.MEDIA_ERROR:
        if (DEV.ENABLE_CONSOLE_LOGS) {
          console.log('🔄 HLS Media error, attempting recovery...');
        }
        hls.recoverMediaError();
        break;

      default:
        if (DEV.ENABLE_CONSOLE_LOGS) {
          console.error('❌ HLS Fatal error, cannot recover');
        }
        onFatalError();
        break;
    }
  }
}

/**
 * Get HLS statistics for monitoring
 */
export function getHLSStats(hls: Hls) {
  const levels = hls.levels;
  const currentLevel = hls.currentLevel;
  
  return {
    levels: levels.length,
    currentLevel,
    currentBitrate: levels[currentLevel]?.bitrate || 0,
    buffered: hls.media?.buffered.length || 0,
  };
}

