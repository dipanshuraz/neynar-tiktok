// src/app/utils/video.ts
// Video-related utilities

import { VIDEO, DEV } from '../config/constants';

/**
 * Calculate exponential backoff delay for retries
 */
export function calculateRetryDelay(attemptNumber: number): number {
  return Math.pow(2, attemptNumber) * VIDEO.RETRY.DELAY_BASE_MS;
}

/**
 * Check if video should retry based on attempt count
 */
export function shouldRetryVideo(attemptNumber: number): boolean {
  return attemptNumber < VIDEO.RETRY.MAX_ATTEMPTS;
}

/**
 * Format video duration for display
 */
export function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Get video aspect ratio
 */
export function getVideoAspectRatio(width?: number, height?: number): number {
  if (!width || !height) return 9 / 16; // Default TikTok ratio
  return width / height;
}

/**
 * Check if video URL is HLS
 */
export function isHLSUrl(url: string): boolean {
  return url.includes('.m3u8') || url.includes('m3u8');
}

/**
 * Log video event (development only)
 */
export function logVideoEvent(event: string, details?: any): void {
  if (DEV.ENABLE_CONSOLE_LOGS) {
    console.log(`🎬 Video: ${event}`, details || '');
  }
}

/**
 * Get video preload attribute based on state
 */
export function getPreloadAttribute(
  isActive: boolean,
  shouldPreload: boolean
): 'auto' | 'metadata' | 'none' {
  if (isActive || shouldPreload) return 'auto';
  return 'metadata';
}

/**
 * Check if video is playing
 */
export function isVideoPlaying(video: HTMLVideoElement): boolean {
  return !video.paused && !video.ended && video.readyState > 2;
}

/**
 * Pause video safely
 */
export async function pauseVideo(video: HTMLVideoElement): Promise<void> {
  try {
    if (!video.paused) {
      await video.pause();
      logVideoEvent('Paused');
    }
  } catch (error) {
    if (DEV.ENABLE_CONSOLE_LOGS) {
      console.error('Error pausing video:', error);
    }
  }
}

/**
 * Play video safely
 */
export async function playVideo(video: HTMLVideoElement): Promise<void> {
  try {
    await video.play();
    logVideoEvent('Playing');
  } catch (error) {
    if (DEV.ENABLE_CONSOLE_LOGS) {
      console.error('Error playing video:', error);
    }
    throw error;
  }
}

/**
 * Reset video to beginning
 */
export function resetVideo(video: HTMLVideoElement): void {
  video.currentTime = 0;
  logVideoEvent('Reset');
}

/**
 * Get video load state
 */
export function getVideoLoadState(video: HTMLVideoElement): {
  canPlay: boolean;
  isBuffering: boolean;
  hasError: boolean;
} {
  return {
    canPlay: video.readyState >= 3,
    isBuffering: video.readyState < 3 && !video.paused,
    hasError: video.error !== null,
  };
}

