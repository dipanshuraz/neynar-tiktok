// Persist playback preferences with IndexedDB (localStorage fallback)

'use client';

import { useState, useEffect, useCallback } from 'react';
import storage from '../utils/storage';

const STORAGE_KEYS = {
  MUTE_STATE: 'farcaster-feed-mute-state',
  LAST_VIDEO_INDEX: 'farcaster-feed-last-index',
  LAST_VIDEO_ID: 'farcaster-feed-last-video-id',
  LAST_CURSOR: 'farcaster-feed-last-cursor',
  PLAYBACK_SPEED: 'farcaster-feed-playback-speed',
  VOLUME: 'farcaster-feed-volume',
} as const;

interface PlaybackPreferences {
  isMuted: boolean;
  lastVideoIndex: number;
  lastVideoId: string | null;
  lastCursor: string | null;
  playbackSpeed: number;
  volume: number;
}

interface UsePlaybackPreferencesReturn {
  preferences: PlaybackPreferences;
  isLoaded: boolean; // True when preferences have been loaded from storage
  setMuted: (muted: boolean) => void;
  setLastVideoIndex: (index: number, videoId?: string, cursor?: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setVolume: (volume: number) => void;
  clearPreferences: () => void;
}

const DEFAULT_PREFERENCES: PlaybackPreferences = {
  isMuted: true, // Default to muted (autoplay requirement)
  lastVideoIndex: 0,
  lastVideoId: null,
  lastCursor: null,
  playbackSpeed: 1.0,
  volume: 0.8, // 80% volume when unmuted
};

/**
 * Hook to manage playback preferences with localStorage persistence
 */
export function usePlaybackPreferences(): UsePlaybackPreferencesReturn {
  const [preferences, setPreferences] = useState<PlaybackPreferences>(DEFAULT_PREFERENCES);
  const [isClient, setIsClient] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    if (typeof window === 'undefined') return;

    const loadPreferences = async () => {
      try {
        const [isMuted, lastVideoIndex, lastVideoId, lastCursor, playbackSpeed, volume] = await Promise.all([
          storage.get<string>(STORAGE_KEYS.MUTE_STATE),
          storage.get<string>(STORAGE_KEYS.LAST_VIDEO_INDEX),
          storage.get<string>(STORAGE_KEYS.LAST_VIDEO_ID),
          storage.get<string>(STORAGE_KEYS.LAST_CURSOR),
          storage.get<string>(STORAGE_KEYS.PLAYBACK_SPEED),
          storage.get<string>(STORAGE_KEYS.VOLUME),
        ]);

        const stored: Partial<PlaybackPreferences> = {
          isMuted: isMuted === 'true',
          lastVideoIndex: parseInt(lastVideoIndex || '0', 10),
          lastVideoId: lastVideoId,
          lastCursor: lastCursor,
          playbackSpeed: parseFloat(playbackSpeed || '1.0'),
          volume: parseFloat(volume || '0.8'),
        };

        setPreferences(prev => ({
          ...prev,
          ...stored,
        }));

        if (process.env.NODE_ENV === 'development') {
          console.log('📼 Loaded playback preferences from', storage.isUsingIndexedDB() ? 'IndexedDB' : 'localStorage', stored);
        }
        
        setIsLoaded(true); // Mark as loaded
      } catch (error) {
        console.error('Failed to load playback preferences:', error);
        setIsLoaded(true); // Mark as loaded even on error
      }
    };

    loadPreferences();
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    if (!isClient) return;
    
    storage.set(STORAGE_KEYS.MUTE_STATE, String(muted))
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔇 Mute state saved: ${muted}`);
        }
      })
      .catch(error => console.error('Failed to save mute state:', error));
    
    setPreferences(prev => ({ ...prev, isMuted: muted }));
  }, [isClient]);

  const setLastVideoIndex = useCallback((index: number, videoId?: string, cursor?: string) => {
    if (!isClient) return;
    
    const updates = [
      storage.set(STORAGE_KEYS.LAST_VIDEO_INDEX, String(index)),
    ];
    
    if (videoId) {
      updates.push(storage.set(STORAGE_KEYS.LAST_VIDEO_ID, videoId));
    }
    if (cursor) {
      updates.push(storage.set(STORAGE_KEYS.LAST_CURSOR, cursor));
    }
    
    Promise.all(updates)
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`📍 Last position saved: index ${index}${videoId ? `, id ${videoId.substring(0, 10)}...` : ''}${cursor ? `, cursor ${cursor.substring(0, 10)}...` : ''}`);
        }
      })
      .catch(error => console.error('Failed to save last video position:', error));
    
    setPreferences(prev => ({
      ...prev,
      lastVideoIndex: index,
      lastVideoId: videoId || prev.lastVideoId,
      lastCursor: cursor || prev.lastCursor,
    }));
  }, [isClient]);

  const setPlaybackSpeed = useCallback((speed: number) => {
    if (!isClient) return;
    
    storage.set(STORAGE_KEYS.PLAYBACK_SPEED, String(speed))
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`⚡ Playback speed saved: ${speed}x`);
        }
      })
      .catch(error => console.error('Failed to save playback speed:', error));
    
    setPreferences(prev => ({ ...prev, playbackSpeed: speed }));
  }, [isClient]);

  const setVolume = useCallback((volume: number) => {
    if (!isClient) return;
    
    const clampedVolume = Math.max(0, Math.min(1, volume));
    
    storage.set(STORAGE_KEYS.VOLUME, String(clampedVolume))
      .then(() => {
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔊 Volume saved: ${(clampedVolume * 100).toFixed(0)}%`);
        }
      })
      .catch(error => console.error('Failed to save volume:', error));
    
    setPreferences(prev => ({ ...prev, volume: clampedVolume }));
  }, [isClient]);

  const clearPreferences = useCallback(async () => {
    if (!isClient) return;
    
    try {
      const removePromises = Object.values(STORAGE_KEYS).map(key => storage.remove(key));
      await Promise.all(removePromises);
      
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
    isLoaded,
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

