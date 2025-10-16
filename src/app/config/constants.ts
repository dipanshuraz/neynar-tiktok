// src/app/config/constants.ts
// Application-wide constants and configuration

/**
 * Performance Configuration
 */
export const PERFORMANCE = {
  // Virtual scrolling
  RENDER_BUFFER: 1, // Number of videos before/after current to keep mounted
  
  // Intersection Observer
  INTERSECTION_THRESHOLDS: [0, 0.3, 0.5, 0.8, 1.0],
  ROOT_MARGIN: '100% 0px', // Preload adjacent videos
  
  // Debounce/Throttle
  RESIZE_DEBOUNCE_MS: 150,
  SCROLL_THROTTLE_MS: 16, // ~60fps
  
  // Memory monitoring
  MEMORY_CHECK_INTERVAL_MS: 2000,
  MEMORY_LEAK_THRESHOLD_MB: 50,
  
  // First interaction
  FID_GOOD_MS: 100,
  FID_NEEDS_IMPROVEMENT_MS: 300,
} as const;

/**
 * Video Configuration
 */
export const VIDEO = {
  // HLS Buffer settings (ms)
  BUFFER: {
    FAST: {
      maxBufferLength: 10,
      maxMaxBufferLength: 20,
      maxBufferSize: 30 * 1000 * 1000, // 30MB
    },
    MEDIUM: {
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
      maxBufferSize: 50 * 1000 * 1000, // 50MB
    },
    SLOW: {
      maxBufferLength: 20,
      maxMaxBufferLength: 40,
      maxBufferSize: 70 * 1000 * 1000, // 70MB
    },
  },
  
  // Timeouts (ms)
  TIMEOUT: {
    MANIFEST_LOADING: 5000,
    MANIFEST_LOADING_MOBILE: 2500,
    FRAGMENT_LOADING: 10000,
    FRAGMENT_LOADING_MOBILE: 5000,
    XHR: 5000,
    XHR_MOBILE: 2500,
  },
  
  // Retry configuration
  RETRY: {
    MAX_ATTEMPTS: 3,
    DELAY_BASE_MS: 1000, // Exponential: 1s, 2s, 4s
    MANIFEST_MAX_RETRY_FAST: 1,
    MANIFEST_MAX_RETRY_NORMAL: 2,
    FRAGMENT_MAX_RETRY_FAST: 1,
    FRAGMENT_MAX_RETRY_NORMAL: 2,
    RETRY_DELAY_MS: 500,
  },
  
  // Startup metrics
  STARTUP: {
    PRELOAD_GOOD_MS: 100,
    PLAYBACK_GOOD_MS: 200,
  },
} as const;

/**
 * Network Configuration
 */
export const NETWORK = {
  // Connection types
  FAST_CONNECTIONS: ['4g', 'wifi'],
  
  // Speed thresholds (Mbps)
  SPEED_THRESHOLD: {
    FAST: 5,
    SLOW: 1,
  },
  
  // RTT thresholds (ms)
  RTT_THRESHOLD: {
    FAST: 100,
    SLOW: 400,
  },
  
  // Preload configuration
  PRELOAD: {
    FAST_COUNT: 2, // Preload 2 videos on fast connection
    MEDIUM_COUNT: 1, // Preload 1 video on medium connection
    SLOW_COUNT: 0, // No preload on slow connection
    DATA_SAVER_COUNT: 0, // No preload with data saver
  },
} as const;

/**
 * API Configuration
 */
export const API = {
  // Endpoints
  FEED_ENDPOINT: '/api/feed',
  
  // Caching
  REVALIDATE_SECONDS: 60,
  
  // Pagination
  DEFAULT_LIMIT: 25,
  
  // Neynar API
  NEYNAR_API_URL: 'https://api.neynar.com/v2/farcaster/feed',
} as const;

/**
 * UI Configuration
 */
export const UI = {
  // Breakpoints
  MOBILE_MAX_WIDTH: 1024,
  
  // Z-index layers
  Z_INDEX: {
    VIDEO: 1,
    OVERLAY: 10,
    LOADING: 20,
    ERROR: 30,
    PERFORMANCE_OVERLAY: 9999,
  },
  
  // Colors
  COLORS: {
    BLACK: '#000000',
    WHITE: '#FFFFFF',
    PURPLE: '#8B5CF6',
  },
} as const;

/**
 * Development Configuration
 */
export const DEV = {
  // Feature flags
  ENABLE_PERFORMANCE_OVERLAY: process.env.NODE_ENV === 'development',
  ENABLE_CONSOLE_LOGS: process.env.NODE_ENV === 'development',
  ENABLE_MEMORY_TRACKING: process.env.NODE_ENV === 'development',
  
  // Performance overlay position
  OVERLAY_POSITION: 'top-right' as const,
} as const;

/**
 * Environment Variables
 */
export const ENV = {
  USE_LOCAL_DATA: process.env.NEXT_PUBLIC_USE_DUMMY_DATA === 'true',
  NEYNAR_API_KEY: process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
  DEFAULT_FID: process.env.NEXT_PUBLIC_DEFAULT_FID || '9152',
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
  NODE_ENV: process.env.NODE_ENV || 'development',
} as const;

/**
 * Feature Detection
 */
export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
};

export const isDesktopDevice = () => {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= UI.MOBILE_MAX_WIDTH;
};

/**
 * Validation
 */
export const validateEnv = () => {
  const errors: string[] = [];
  
  if (!ENV.USE_LOCAL_DATA && !ENV.NEYNAR_API_KEY) {
    errors.push('NEXT_PUBLIC_NEYNAR_API_KEY is required when not using local data');
  }
  
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    return false;
  }
  
  return true;
};

