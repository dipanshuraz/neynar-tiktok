
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, lazy, Suspense } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Icon } from '@iconify/react';
import VideoFeedItemComponent from './VideoFeedItem';
import VideoFeedItemSSR from './VideoFeedItemSSR';
import { VideoFeedItem } from '@/types/neynar';
import { rafThrottle } from '../utils/taskScheduler';
import { useFirstInteraction, measureFirstInputDelay } from '../hooks/useFirstInteraction';
import { useComponentMemoryTracking } from '../hooks/useMemoryMonitor';
import { useNetworkQuality, shouldPreloadVideo } from '../hooks/useNetworkQuality';
import { usePlaybackPreferences } from '../hooks/usePlaybackPreferences';

// Lazy load non-critical components for faster initial load
const DesktopVideoFeed = lazy(() => import('./DesktopVideoFeed'));
const PerformanceOverlay = lazy(() => import('./PerformanceOverlay'));

interface VideoFeedResponse {
  videos: VideoFeedItem[];
  nextCursor?: string;
  hasMore: boolean;
}

interface VideoFeedProps {
  initialVideos?: VideoFeedItem[];
  initialCursor?: string;
  initialHasMore?: boolean;
}

export default function VideoFeed({ 
  initialVideos = [], 
  initialCursor,
  initialHasMore = true 
}: VideoFeedProps) {
  // Playback preferences (mute state, last position)
  const { preferences, isLoaded: preferencesLoaded, setMuted, setLastVideoIndex } = usePlaybackPreferences();
  
  const [videos, setVideos] = useState<VideoFeedItem[]>(initialVideos);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(initialVideos.length === 0); // Not loading if we have SSR data
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMuted, setIsMuted] = useState(preferences.isMuted); // Initialize from preferences
  const [isMobile, setIsMobile] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true); // Track play/pause state
  const [restoringPosition, setRestoringPosition] = useState(false); // Track if restoring saved position
  const [isHydrated, setIsHydrated] = useState(false); // Track if client has hydrated (for SSR)

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Track first interaction timing
  const firstInteraction = useFirstInteraction();
  
  // Track memory usage
  useComponentMemoryTracking('VideoFeed');
  
  // Monitor network quality for adaptive preloading
  const networkInfo = useNetworkQuality();
  
  // Mark as hydrated on client mount (for SSR)
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  
  // Sync isMuted state with preferences when they load from localStorage
  useEffect(() => {
    setIsMuted(preferences.isMuted);
  }, [preferences.isMuted]);
  
  // Restore last video position on mount (after videos load)
  useEffect(() => {
    if (videos.length === 0 || preferences.lastVideoIndex === 0) return;
    
    const savedIndex = preferences.lastVideoIndex;
    const hasCursor = preferences.lastCursor !== null && preferences.lastCursor !== undefined;
    
    // Calculate target index based on whether we have a cursor
    let targetIndex: number;
    
    if (hasCursor) {
      // User was in 2nd+ batch: calculate local position within that batch
      // Since we load 25 videos per batch, the local index is savedIndex % 25
      targetIndex = savedIndex % 25;
      if (process.env.NODE_ENV === 'development') {
        console.log(`📍 Restoring with cursor: local position ${targetIndex} (original: ${savedIndex})`);
      }
    } else {
      // User was in 1st batch: saved index IS the actual index
      targetIndex = savedIndex;
      if (process.env.NODE_ENV === 'development') {
        console.log(`📍 Restoring without cursor: position ${targetIndex} (first batch)`);
      }
    }
    
    // If we have the video at that position, restore it
    if (targetIndex < videos.length) {
      setCurrentIndex(targetIndex);
      
      // Scroll to saved position
      setTimeout(() => {
        const savedVideo = videoRefs.current.get(targetIndex);
        if (savedVideo && containerRef.current) {
          savedVideo.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
      }, 100);
    } else {
      // Video not available, start from beginning
      if (process.env.NODE_ENV === 'development') {
        console.log(`⚠️ Could not restore to position ${targetIndex} (only ${videos.length} videos), starting from 0`);
      }
      setCurrentIndex(0);
    }
  }, [videos.length, preferences.lastVideoIndex, preferences.lastCursor]);
  
  // Memoize toggle functions to prevent re-renders
  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      setMuted(newMuted); // Save to preferences
      return newMuted;
    });
  }, [setMuted]);

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkIsMobile();
    
    // Debounce resize for better performance
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(checkIsMobile, 150);
    };
    
    window.addEventListener('resize', debouncedResize, { passive: true });
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  const fetchVideos = useCallback(async (cursor?: string): Promise<VideoFeedResponse> => {
    const url = new URL('/api/feed', window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), { 
      cache: 'no-store',
      priority: 'high' // Mark as high priority for faster initial load
    } as RequestInit);
    if (!response.ok) throw new Error('Failed to fetch');
    
    return response.json();
  }, []);

  const loadInitialVideos = useCallback(async () => {
    const hasSavedIndex = preferences.lastVideoIndex > 0;
    const hasSavedCursor = preferences.lastCursor !== null && preferences.lastCursor !== undefined;
    
    // Case 1: User has saved position with cursor (was in 2nd+ batch)
    // Fetch from that cursor to restore exact position
    if (hasSavedIndex && hasSavedCursor) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`📍 Restoring from saved cursor: ${preferences.lastCursor!.substring(0, 20)}... (index: ${preferences.lastVideoIndex})`);
      }
      
      try {
        setLoading(true);
        setRestoringPosition(true);
        const data = await fetchVideos(preferences.lastCursor!);
        
        if (!data.videos || data.videos.length === 0) {
          // Cursor might be expired, fall back to SSR data or fetch from beginning
          if (initialVideos.length > 0) {
            if (process.env.NODE_ENV === 'development') {
              console.log('⚠️ Cursor expired, using SSR videos');
            }
            setLoading(false);
            setRestoringPosition(false);
            return;
          }
          throw new Error('No videos found with saved cursor');
        }
        
        console.log(`✅ Loaded ${data.videos.length} videos from saved cursor`);
        setVideos(data.videos);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        // Will restore index in separate effect
      } catch (err) {
        console.error('Failed to restore from cursor, loading from beginning:', err);
        // Fall back to SSR data or fetch from beginning
        if (initialVideos.length > 0) {
          if (process.env.NODE_ENV === 'development') {
            console.log('⚠️ Using SSR videos as fallback');
          }
          setLoading(false);
          setRestoringPosition(false);
          return;
        }
        
        try {
          const data = await fetchVideos();
          setVideos(data.videos);
          setNextCursor(data.nextCursor);
          setHasMore(data.hasMore);
        } catch (fallbackErr) {
          setError(fallbackErr instanceof Error ? fallbackErr.message : 'Failed to load');
        }
      } finally {
        setLoading(false);
        setRestoringPosition(false);
      }
      return;
    }
    
    // Case 2: User has saved position but NO cursor (was in 1st batch, 0-24)
    // Use SSR data or fetch from beginning, will restore position in separate effect
    if (hasSavedIndex && !hasSavedCursor) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`📍 Saved position found (index: ${preferences.lastVideoIndex}), no cursor (first batch)`);
      }
      
      // Use SSR data if available, otherwise fetch from beginning
      if (initialVideos.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Using ${initialVideos.length} SSR videos (will restore to index ${preferences.lastVideoIndex})`);
        }
        setLoading(false);
        return;
      } else {
        // Fetch from beginning
        try {
          setLoading(true);
          const data = await fetchVideos();
          
          if (!data.videos || data.videos.length === 0) {
            setError('No videos found');
            return;
          }
          
          console.log(`✅ Loaded ${data.videos.length} videos (will restore to index ${preferences.lastVideoIndex})`);
          setVideos(data.videos);
          setNextCursor(data.nextCursor);
          setHasMore(data.hasMore);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        } finally {
          setLoading(false);
        }
        return;
      }
    }
    
    // Case 3: No saved position - use SSR data if available
    if (initialVideos.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Using ${initialVideos.length} SSR videos (no saved position)`);
      }
      setLoading(false);
      return;
    }

    // Otherwise fetch client-side from beginning
    try {
      setLoading(true);
      const data = await fetchVideos();
      
      if (!data.videos || data.videos.length === 0) {
        setError('No videos found');
        return;
      }
      
      console.log(`✅ Loaded ${data.videos.length} videos (client-side)`);
      setVideos(data.videos);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setCurrentIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fetchVideos, initialVideos.length, preferences.lastVideoIndex, preferences.lastCursor]);

  const loadMoreVideos = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸️ Load more skipped:', { hasMore, loadingMore, hasCursor: !!nextCursor });
      }
      return;
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`📥 Loading more videos with cursor: ${nextCursor.substring(0, 20)}...`);
      }
      setLoadingMore(true);
      const data = await fetchVideos(nextCursor);
      
      if (data.videos && data.videos.length > 0) {
        setVideos(prev => [...prev, ...data.videos]);
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Loaded ${data.videos.length} more videos. Total: ${videos.length + data.videos.length}`);
          console.log(`📄 Next cursor: ${data.nextCursor ? data.nextCursor.substring(0, 20) + '...' : 'none'}`);
        }
      } else {
        setHasMore(false);
        if (process.env.NODE_ENV === 'development') {
          console.log('🏁 No more videos available');
        }
      }
    } catch (err) {
      console.error('❌ Load more error:', err);
      setHasMore(false); // Prevent infinite retry
    } finally {
      setLoadingMore(false);
    }
  }, [fetchVideos, hasMore, loadingMore, nextCursor, videos.length]);

  // Intersection observer - with debouncing for quick swipes
  useEffect(() => {
    if (!isMobile || !containerRef.current || videos.length === 0) return;

    const container = containerRef.current;
    let pendingUpdate: number | null = null;
    let lastActivatedIndex = -1;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the most visible video
        let mostVisible = { index: -1, ratio: 0 };
        
        entries.forEach((entry) => {
          // Lower threshold for faster activation
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            if (entry.intersectionRatio > mostVisible.ratio) {
              mostVisible = { index, ratio: entry.intersectionRatio };
            }
          }
        });

        if (pendingUpdate) {
          clearTimeout(pendingUpdate);
        }

        // Only activate if we found a clearly visible video and it's different from last
        if (mostVisible.index >= 0 && mostVisible.index !== lastActivatedIndex) {
          // Immediate activation for the first video, minimal debounce for others
          const delay = lastActivatedIndex === -1 ? 0 : 16; // 0ms for first, 16ms (~1 frame) for others
          
          pendingUpdate = window.setTimeout(() => {
            lastActivatedIndex = mostVisible.index;
            
            if (process.env.NODE_ENV === 'development') {
              console.log(`👁️ Video ${mostVisible.index + 1} activated (ratio: ${mostVisible.ratio.toFixed(2)})`);
            }
            setCurrentIndex(mostVisible.index);
            
            const videoId = videos[mostVisible.index]?.id;
            // Save position with current cursor for efficient restoration
            setLastVideoIndex(mostVisible.index, videoId, nextCursor);
            
            // Load more videos when user reaches 1/3 through current videos
            const loadMoreTrigger = Math.floor(videos.length / 3);
            if (mostVisible.index >= loadMoreTrigger && hasMore && !loadingMore) {
              if (process.env.NODE_ENV === 'development') {
                console.log(`🔄 Triggering load more at ${mostVisible.index + 1}/${videos.length} (trigger: ${loadMoreTrigger + 1})`);
              }
              loadMoreVideos();
            }
            
            pendingUpdate = null;
          }, delay); // 0ms for first video, 16ms for subsequent videos
        }
      },
      {
        root: container,
        threshold: [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
        rootMargin: '10% 0px', // Reduced for immediate activation
      }
    );

    videoRefs.current.forEach((element) => {
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      videoRefs.current.clear();
    };
  }, [isMobile, videos.length, hasMore, loadingMore, loadMoreVideos, nextCursor, setLastVideoIndex]);

  // Keyboard navigation with passive listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex(currentIndex - 1);
      } else if (e.code === 'ArrowDown' && currentIndex < videos.length - 1) {
        e.preventDefault();
        const newIndex = currentIndex + 1;
        setCurrentIndex(newIndex);
        
        // Trigger load more when keyboard navigating past 1/3 of current videos
        const loadMoreTrigger = Math.floor(videos.length / 3);
        if (newIndex >= loadMoreTrigger && hasMore && !loadingMore) {
          if (process.env.NODE_ENV === 'development') {
            console.log(`🔄 Keyboard navigation triggering load more at ${newIndex + 1}/${videos.length}`);
          }
          loadMoreVideos();
        }
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(!isPlaying);
        if (process.env.NODE_ENV === 'development') {
          console.log(`⌨️ Space pressed: ${!isPlaying ? 'Play' : 'Pause'}`);
        }
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        setIsMuted(!isMuted);
        if (process.env.NODE_ENV === 'development') {
          console.log(`⌨️ M pressed: ${!isMuted ? 'Mute' : 'Unmute'}`);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, videos.length, isMuted, isPlaying, hasMore, loadingMore, loadMoreVideos]);

  // Optimize scroll performance with throttled passive listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isMobile) return;

    // Throttle scroll handler to run at most once per frame
    const handleScroll = rafThrottle(() => {
      // Scroll handling is done by IntersectionObserver
      // This is just for any additional scroll-based logic
    });

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [isMobile]);

  useEffect(() => {
    // Wait for preferences to load before deciding what to fetch
    if (!preferencesLoaded) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏳ Waiting for preferences to load...');
      }
      return;
    }
    
    loadInitialVideos();
  }, [loadInitialVideos, preferencesLoaded]);

  // Ensure first video is active on mount (mobile only)
  // This runs once when videos first load to trigger autoplay
  useEffect(() => {
    if (isMobile && videos.length > 0 && currentIndex === 0) {
      // Force first video to be active immediately after videos load
      // This triggers the video.play() in VideoPlayer
      if (process.env.NODE_ENV === 'development') {
        console.log('🎬 Forcing first video active on mount');
      }
      // Immediately set as active - no delay
      setCurrentIndex(0);
    }
  }, [videos.length, isMobile]); // Only depend on videos.length, not currentIndex

  // Measure First Input Delay in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      const cleanup = measureFirstInputDelay();
      return cleanup;
    }
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <Icon icon="svg-spinners:ring-resize" className="w-12 h-12 text-white mb-4 mx-auto" />
          <p className="text-white">Loading videos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center p-8">
          <AlertTriangle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-white mb-4">{error}</p>
          <button
            onClick={loadInitialVideos}
            className="px-6 py-3 bg-red-600 text-white rounded-full hover:bg-red-700"
          >
            <RefreshCw className="w-4 h-4 inline mr-2" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <p className="text-white">No videos found</p>
      </div>
    );
  }

  return (
    <div className="relative bg-black">
      {isMobile && (
        <div 
          ref={containerRef}
          className="h-screen overflow-y-auto snap-y snap-mandatory"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            willChange: 'scroll-position'
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar { display: none; }
          `}</style>
          
          {/* Virtual scrolling: Keep only 3-5 video DOM nodes mounted */}
          {videos.map((video, index) => {
            const isInRange = Math.abs(index - currentIndex) <= 2; // Keep 2 before/after = 5 videos max (current + 2 before + 2 after)
            // Network-aware preloading: adapts based on connection speed
            const shouldPreload = shouldPreloadVideo(currentIndex, index, networkInfo);
            
            // Use SSR component for first video until hydration completes
            const isFirstVideo = index === 0 && initialVideos.length > 0;
            const useSSR = isFirstVideo && !isHydrated;
            
            return (
              <div
                key={video.id}
                ref={(el) => {
                  if (el) videoRefs.current.set(index, el);
                  else videoRefs.current.delete(index);
                }}
                data-index={index}
                className="h-screen w-full snap-start snap-always"
                style={{
                  contain: 'layout style paint',
                  contentVisibility: isInRange ? 'visible' : 'auto'
                }}
              >
                {isInRange ? (
                  useSSR ? (
                    <VideoFeedItemSSR item={video} />
                  ) : (
                    <VideoFeedItemComponent
                      item={video}
                      isActive={index === currentIndex}
                      isMuted={isMuted}
                      onMuteToggle={handleMuteToggle}
                      isMobile={true}
                      shouldPreload={shouldPreload}
                      networkSpeed={networkInfo.speed}
                      shouldPlay={isPlaying}
                    />
                  )
                ) : (
                  <div className="w-full h-full bg-gray-900" />
                )}
              </div>
            );
          })}
          
          {/* Loading indicator when fetching more videos */}
          {loadingMore && (
            <div className="h-32 flex flex-col items-center justify-center gap-3 bg-black">
              <Icon icon="svg-spinners:ring-resize" className="w-8 h-8 text-white" />
              <p className="text-white/60 text-sm">Loading more videos...</p>
            </div>
          )}
          
          {/* End of feed indicator */}
          {!hasMore && videos.length > 0 && !loadingMore && (
            <div className="h-32 flex flex-col items-center justify-center gap-2 bg-black">
              <p className="text-white/60 text-sm">🎉 You've reached the end!</p>
              <p className="text-white/40 text-xs">Swipe up to see previous videos</p>
            </div>
          )}
        </div>
      )}

      {!isMobile && (
        <Suspense fallback={
          <div className="h-screen bg-black flex items-center justify-center">
            <Icon icon="svg-spinners:ring-resize" className="w-8 h-8 text-white" />
          </div>
        }>
          <DesktopVideoFeed
            videos={videos}
            currentIndex={currentIndex}
            isMuted={isMuted}
            onMuteToggle={handleMuteToggle}
            onNext={() => setCurrentIndex(Math.min(currentIndex + 1, videos.length - 1))}
            onPrevious={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
          />
        </Suspense>
      )}

      {/* Performance Overlay in Development - Lazy loaded */}
      {process.env.NODE_ENV === 'development' && (
        <Suspense fallback={null}>
          <PerformanceOverlay />
        </Suspense>
      )}
      
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 right-4 z-50 bg-black/70 rounded px-3 py-2 text-xs text-white">
          <div>Video: {currentIndex + 1} / {videos.length}</div>
        </div>
      )}
    </div>
  );
}