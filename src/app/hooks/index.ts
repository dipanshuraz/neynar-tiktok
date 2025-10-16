// src/app/hooks/index.ts
// Centralized exports for all custom hooks

// Performance hooks
export { useComponentMemoryTracking, useMemoryMonitor } from './useMemoryMonitor';
export { useLongTaskMonitor } from './useLongTaskMonitor';
export { useFirstInteraction, measureFirstInputDelay } from './useFirstInteraction';

// Video hooks
export {
  useVideoStartupMetrics,
  reportVideoStartup,
} from './useVideoStartupMetrics';

export {
  useErrorMetrics,
  reportVideoError,
  reportVideoLoaded,
} from './useErrorMetrics';

// Network hooks
export {
  useNetworkQuality,
  shouldPreloadVideo,
  getHLSBufferSettings,
  type NetworkSpeed,
} from './useNetworkQuality';

// Playback preferences
export {
  usePlaybackPreferences,
  isLocalStorageAvailable,
  getStorageSize,
  formatStorageSize,
} from './usePlaybackPreferences';

