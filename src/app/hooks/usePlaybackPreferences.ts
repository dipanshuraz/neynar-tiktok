// src/app/hooks/usePlaybackPreferences.ts
// Persist playback preferences in localStorage

'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEYS = {
  MUTE_STATE: 'farcaster-feed-mute-state',
  LAST_VIDEO_INDEX: 'farcaster-feed-last-index',
  LAST_VIDEO_ID: 'farcaster-feed-last-video-id',
  PLAYBACK_SPEED: 'farcaster-feed-playback-speed',
  VOLUME: 'farcaster-feed-volume',
} as const;

interface PlaybackPreferences {
  isMuted: boolean;
  lastVideoIndex: number;
  lastVideoId: string | null;
  playbackSpeed: number;
  volume: number;
}

interface UsePlaybackPreferencesReturn {
  preferences: PlaybackPreferences;
  setMuted: (muted: boolean) => void;
  setLastVideoIndex: (index: number, videoId?: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  clearPreferences: () => void;
}

const DEFAULT_PREFERENCES: PlaybackPreferences = {
  isMuted: true, // Default to muted (autoplay requirement)
  lastVideoIndex: 0,
  lastVideoId: null,
  playbackSpeed: 1.0,
  volume: 0.8, // 80% volume when unmuted
};

/**
 * Hook to manage playback preferences with localStorage persistence
 */
export function usePlaybackPreferences(): UsePlaybackPreferencesReturn {
  const [preferences, setPreferences] = useState<PlaybackPreferences>(DEFAULT_PREFERENCES);
  const [isClient, setIsClient] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    setIsClient(true);
    
    if (typeof window === 'undefined') return;

    try {
      const stored: Partial<PlaybackPreferences> = {
        isMuted: localStorage.getItem(STORAGE_KEYS.MUTE_STATE) === 'true',
        lastVideoIndex: parseInt(localStorage.getItem(STORAGE_KEYS.LAST_VIDEO_INDEX) || '0', 10),
        lastVideoId: localStorage.getItem(STORAGE_KEYS.LAST_VIDEO_ID),
        playbackSpeed: parseFloat(localStorage.getItem(STORAGE_KEYS.PLAYBACK_SPEED) || '1.0'),
        volume: parseFloat(localStorage.getItem(STORAGE_KEYS.VOLUME) || '0.8'),
      };

      setPreferences(prev => ({
        ...prev,
        ...stored,
      }));

      if (process.env.NODE_ENV === 'development') {
        console.log('📼 Loaded playback preferences:', stored);
      }
    } catch (error) {
      console.error('Failed to load playback preferences:', error);
    }
  }, []);

  // Save mute state
  const setMuted = useCallback((muted: boolean) => {
    if (!isClient) return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.MUTE_STATE, String(muted));
      setPreferences(prev => ({ ...prev, isMuted: muted }));
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔇 Mute state saved: ${muted}`);
      }
    } catch (error) {
      console.error('Failed to save mute state:', error);
    }
  }, [isClient]);

  // Save last video position
  const setLastVideoIndex = useCallback((index: number, videoId?: string) => {
    if (!isClient) return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_VIDEO_INDEX, String(index));
      if (videoId) {
        localStorage.setItem(STORAGE_KEYS.LAST_VIDEO_ID, videoId);
      }
      
      setPreferences(prev => ({
        ...prev,
        lastVideoIndex: index,
        lastVideoId: videoId || prev.lastVideoId,
      }));
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📍 Last position saved: index ${index}${videoId ? `, id ${videoId}` : ''}`);
      }
    } catch (error) {
      console.error('Failed to save last video position:', error);
    }
  }, [isClient]);

  // Save playback speed
  const setPlaybackSpeed = useCallback((speed: number) => {
    if (!isClient) return;
    
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYBACK_SPEED, String(speed));
      setPreferences(prev => ({ ...prev, playbackSpeed: speed }));
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚡ Playback speed saved: ${speed}x`);
      }
    } catch (error) {
      console.error('Failed to save playback speed:', error);
    }
  }, [isClient]);

  // Save volume
  const setVolume = useCallback((volume: number) => {
    if (!isClient) return;
    
    try {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      localStorage.setItem(STORAGE_KEYS.VOLUME, String(clampedVolume));
      setPreferences(prev => ({ ...prev, volume: clampedVolume }));
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔊 Volume saved: ${(clampedVolume * 100).toFixed(0)}%`);
      }
    } catch (error) {
      console.error('Failed to save volume:', error);
    }
  }, [isClient]);

  // Clear all preferences
  const clearPreferences = useCallback(() => {
    if (!isClient) return;
    
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        localStorage.removeItem(key);
      });
      
      setPreferences(DEFAULT_PREFERENCES);
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🗑️ Playback preferences cleared');
      }
    } catch (error) {
      console.error('Failed to clear preferences:', error);
    }
  }, [isClient]);

  return {
    preferences,
    setMuted,
    setLastVideoIndex,
    setPlaybackSpeed,
    setVolume,
    clearPreferences,
  };
}

/**
 * Check if localStorage is available
 */
export function isLocalStorageAvailable(): boolean {
  try {
    const test = '__localStorage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get storage size in bytes
 */
export function getStorageSize(): number {
  try {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += localStorage[key].length + key.length;
      }
    }
    return total;
  } catch (error) {
    return 0;
  }
}

/**
 * Format storage size for display
 */
export function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

