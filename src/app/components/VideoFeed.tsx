
'use client';

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, lazy, Suspense } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { Icon } from '@iconify/react';
import VideoFeedItemComponent from './VideoFeedItem';
import VideoFeedItemSSR from './VideoFeedItemSSR';
import { KeyboardHint } from './KeyboardHint';
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
  
  // Signal page is ready for browser tab (mark as hydrated immediately)
  useEffect(() => {
    // Mark as hydrated on mount to signal browser the page is ready
    setIsHydrated(true);
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🎬 VideoFeed mounted:', {
        initialVideosCount: initialVideos.length,
        videosCount: videos.length,
        loading,
        hasMore,
        nextCursor: nextCursor?.substring(0, 15) + '...',
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isPaginatingRef = useRef(false); // Track if we're currently paginating
  const lastActivatedIndexRef = useRef(-1); // Track last activated video (persists across re-renders)
  
  // Track first interaction timing
  const firstInteraction = useFirstInteraction();
  
  // Track memory usage
  useComponentMemoryTracking('VideoFeed');
  
  // Monitor network quality for adaptive preloading
  const networkInfo = useNetworkQuality();
  
  // Note: setIsHydrated already called in mount effect above (line 57)
  
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
      
      // Scroll to saved position - use RAF to ensure DOM is ready
      // Double RAF for extra reliability (first schedules, second executes after paint)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const savedVideo = videoRefs.current.get(targetIndex);
          if (savedVideo && containerRef.current) {
            savedVideo.scrollIntoView({ behavior: 'auto', block: 'start' });
          }
        });
      });
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

  // Race condition protection: use ref for synchronous state check
  const loadingMoreRef = useRef(false);
  
  const loadMoreVideos = useCallback(async () => {
    // Synchronous check to prevent race conditions
    if (!hasMore || loadingMoreRef.current || !nextCursor) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸️ Load more skipped:', { hasMore, loadingMore: loadingMoreRef.current, hasCursor: !!nextCursor });
      }
      return;
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log(`📥 Loading more videos with cursor: ${nextCursor.substring(0, 20)}...`);
        console.log(`   Current video index: ${currentIndex + 1}`);
      }
      loadingMoreRef.current = true;
      isPaginatingRef.current = true; // Block observer during pagination
      setLoadingMore(true);
      const data = await fetchVideos(nextCursor);
      
      if (data.videos && data.videos.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Loaded ${data.videos.length} more videos. Total: ${videos.length} + ${data.videos.length} = ${videos.length + data.videos.length}`);
        }
        
        // Deduplicate videos by ID before appending (prevents circular loop)
        setVideos(prev => {
          const existingIds = new Set(prev.map(v => v.id));
          const newVideos = data.videos.filter(v => !existingIds.has(v.id));
          
          if (process.env.NODE_ENV === 'development') {
            const duplicates = data.videos.length - newVideos.length;
            if (duplicates > 0) {
              console.warn(`⚠️ Filtered out ${duplicates} duplicate video(s)`);
            }
          }
          
          return [...prev, ...newVideos];
        });
        setNextCursor(data.nextCursor);
        setHasMore(data.hasMore);
        
        // Unblock observer after DOM update completes
        // Use double RAF to ensure new videos are painted and laid out
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isPaginatingRef.current = false;
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Pagination complete - observer unblocked`);
            }
          });
        });
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`📄 Next cursor: ${data.nextCursor ? data.nextCursor.substring(0, 20) + '...' : 'none'}`);
          console.log(`🔄 Has more: ${data.hasMore}`);
        }
      } else {
        isPaginatingRef.current = false;
        setHasMore(false);
        if (process.env.NODE_ENV === 'development') {
          console.log('🏁 No more videos available');
        }
      }
    } catch (err) {
      console.error('❌ Load more error:', err);
      isPaginatingRef.current = false;
      setHasMore(false); // Prevent infinite retry
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchVideos, hasMore, nextCursor, currentIndex]);

  // Intersection observer - CREATE ONCE, never recreate (prevents jump on pagination)
  useEffect(() => {
    if (!isMobile || !containerRef.current) return;

    const container = containerRef.current;
    let pendingUpdate: number | null = null;

    // Create observer ONCE - don't depend on videos.length
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          // Skip processing if we're currently paginating (prevent scroll jumps)
          if (isPaginatingRef.current) {
            if (process.env.NODE_ENV === 'development') {
              console.log('⏸️ Skipping observer update during pagination');
            }
            return;
          }
          
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
          if (mostVisible.index >= 0 && mostVisible.index !== lastActivatedIndexRef.current) {
            // Immediate activation for the first video, minimal debounce for others
            const delay = lastActivatedIndexRef.current === -1 ? 0 : 16; // 0ms for first, 16ms (~1 frame) for others
            
            pendingUpdate = window.setTimeout(() => {
              lastActivatedIndexRef.current = mostVisible.index;
              
              if (process.env.NODE_ENV === 'development') {
                console.log(`👁️ Video ${mostVisible.index + 1} activated (ratio: ${mostVisible.ratio.toFixed(2)})`);
              }
              setCurrentIndex(mostVisible.index);
              
              // These will use the latest values from closure
            }, delay); // 0ms for first video, 16ms for subsequent videos
          }
        },
        {
          root: container,
          threshold: [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
          rootMargin: '10% 0px', // Reduced for immediate activation
        }
      );
    }

    return () => {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
    };
  }, [isMobile]);
  
  // Separate effect for video activation logic (uses latest state)
  useEffect(() => {
    if (!isMobile || currentIndex < 0) return;
    
    // Save position whenever currentIndex changes
    const videoId = videos[currentIndex]?.id;
    if (videoId) {
      setLastVideoIndex(currentIndex, videoId, nextCursor);
    }
    
    // Load more videos when user reaches 2/3 through current videos
    const loadMoreTrigger = Math.floor((videos.length * 2) / 3);
    if (currentIndex >= loadMoreTrigger && hasMore && !loadingMore && !loadingMoreRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Triggering load more at video ${currentIndex + 1}/${videos.length} (trigger point: ${loadMoreTrigger + 1})`);
        console.log(`   State: hasMore=${hasMore}, loadingMore=${loadingMore}, nextCursor=${nextCursor?.substring(0, 15)}...`);
      }
      loadMoreVideos();
    }
  }, [isMobile, currentIndex, videos, videos.length, hasMore, loadingMore, nextCursor, setLastVideoIndex, loadMoreVideos]);
  
  // Cleanup observer on component unmount
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);
  
  // Separate effect to observe new video elements as they're added
  useEffect(() => {
    if (!isMobile || !observerRef.current) return;
    
    // Observe all current video refs
    videoRefs.current.forEach((element) => {
      if (element) {
        observerRef.current!.observe(element);
      }
    });
    
    // Cleanup: unobserve elements that were removed
    return () => {
      // Don't disconnect the whole observer, just let elements be garbage collected
    };
  }, [isMobile, videos.length]); // This can depend on videos.length - just observes new elements

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
            console.log(`🔄 Keyboard navigation triggering load more at ${newIndex + 1}/${videos.length} (trigger: ${loadMoreTrigger + 1})`);
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
  }, [currentIndex, videos.length, isMuted, isPlaying, loadMoreVideos]);

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
    // If we already have videos from SSR, don't fetch again
    if (initialVideos.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Already have SSR videos, skipping fetch');
      }
      return;
    }
    
    // Wait for preferences to load before deciding what to fetch
    // But don't wait forever - timeout after 2 seconds
    if (!preferencesLoaded) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏳ Waiting for preferences to load...');
      }
      const timeout = setTimeout(() => {
        if (!preferencesLoaded) {
          console.warn('⚠️ Preferences took too long to load, proceeding anyway...');
          loadInitialVideos();
        }
      }, 2000);
      return () => clearTimeout(timeout);
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🚀 Calling loadInitialVideos...');
    }
    loadInitialVideos();
  }, [loadInitialVideos, preferencesLoaded, initialVideos.length]);

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
      {/* Keyboard navigation hint */}
      {isMobile && <KeyboardHint />}
      
      {isMobile && (
        <div 
          ref={containerRef}
          className="h-screen overflow-y-auto snap-y snap-mandatory"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            willChange: 'scroll-position',
            WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            transform: 'translateZ(0)', // Hardware acceleration
            scrollSnapStop: 'always', // Force stop at each video - one video per swipe
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar { display: none; }
          `}</style>
          
          {/* Virtual scrolling: Keep only 3-5 video DOM nodes mounted */}
          {videos.map((video, index) => {
            const isInRange = Math.abs(index - currentIndex) <= 2; // Keep 2 before/after = 5 videos max (current + 2 before + 2 after)
            // Mobile-optimized preloading: only next 1 video to avoid memory issues
            const distanceFromCurrent = index - currentIndex;
            const preloadDistance = isMobile ? 1 : 2; // Mobile: 1, Desktop: 2
            const shouldPreload = distanceFromCurrent >= 0 && distanceFromCurrent <= preloadDistance;
            
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
                className="h-screen w-full snap-start"
                style={{
                  contain: 'layout style paint',
                  contentVisibility: isInRange ? 'visible' : 'auto',
                  // Smooth rendering on mobile
                  willChange: isInRange ? 'transform' : 'auto',
                  backfaceVisibility: 'hidden',
                  transform: 'translate3d(0,0,0)', // Force GPU acceleration
                  scrollSnapStop: 'always', // Force stop at this element
                  scrollSnapAlign: 'start', // Snap to the start of this element
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