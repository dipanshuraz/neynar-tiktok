// src/components/VideoFeed.tsx - SIMPLIFIED VERSION

'use client';

import { useState, useEffect, useRef, useCallback, useMemo, startTransition, lazy, Suspense } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import VideoFeedItemComponent from './VideoFeedItem';
import { VideoFeedItem } from '@/types/neynar';
import { rafThrottle } from '../utils/taskScheduler';
import { useFirstInteraction, measureFirstInputDelay } from '../hooks/useFirstInteraction';
import { useComponentMemoryTracking } from '../hooks/useMemoryMonitor';
import { useNetworkQuality, shouldPreloadVideo } from '../hooks/useNetworkQuality';

// Lazy load non-critical components for faster initial load
const DesktopVideoFeed = lazy(() => import('./DesktopVideoFeed'));
const PerformanceOverlay = lazy(() => import('./PerformanceOverlay'));

interface VideoFeedResponse {
  videos: VideoFeedItem[];
  nextCursor?: string;
  hasMore: boolean;
}

export default function VideoFeed() {
  const [videos, setVideos] = useState<VideoFeedItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isMobile, setIsMobile] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Track first interaction timing
  const firstInteraction = useFirstInteraction();
  
  // Track memory usage
  useComponentMemoryTracking('VideoFeed');
  
  // Monitor network quality for adaptive preloading
  const networkInfo = useNetworkQuality();
  
  // Memoize toggle functions to prevent re-renders
  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

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
    try {
      setLoading(true);
      const data = await fetchVideos();
      
      if (!data.videos || data.videos.length === 0) {
        setError('No HLS videos found');
        return;
      }
      
      console.log(`✅ Loaded ${data.videos.length} videos`);
      setVideos(data.videos);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
      setCurrentIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [fetchVideos]);

  const loadMoreVideos = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;

    try {
      setLoadingMore(true);
      const data = await fetchVideos(nextCursor);
      setVideos(prev => [...prev, ...data.videos]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchVideos, hasMore, loadingMore, nextCursor]);

  // Intersection observer - optimized for performance with React 18 transitions
  useEffect(() => {
    if (!isMobile || !containerRef.current || videos.length === 0) return;

    const container = containerRef.current;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Use requestAnimationFrame to batch updates
        requestAnimationFrame(() => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
              const index = parseInt(entry.target.getAttribute('data-index') || '0');
              
              // Use startTransition for non-urgent updates
              startTransition(() => {
                if (process.env.NODE_ENV === 'development') {
                  console.log(`👁️ Video ${index + 1} is active`);
                }
                setCurrentIndex(index);
              });
              
              // Load more videos if needed (urgent)
              if (index >= videos.length - 2 && hasMore && !loadingMore) {
                loadMoreVideos();
              }
            }
          });
        });
      },
      {
        root: container,
        threshold: 0.5,
        // Add rootMargin to preload adjacent videos
        rootMargin: '100% 0px',
      }
    );

    videoRefs.current.forEach((element) => {
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      // Clear video refs to allow GC
      videoRefs.current.clear();
    };
  }, [isMobile, videos.length, hasMore, loadingMore, loadMoreVideos]);

  // Keyboard navigation with passive listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        setCurrentIndex(currentIndex - 1);
      } else if (e.code === 'ArrowDown' && currentIndex < videos.length - 1) {
        e.preventDefault();
        setCurrentIndex(currentIndex + 1);
      } else if (e.code === 'KeyM' || e.code === 'Space') {
        e.preventDefault();
        setIsMuted(!isMuted);
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, videos.length, isMuted]);

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
    loadInitialVideos();
  }, [loadInitialVideos]);

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
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto"></div>
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
          
          {/* Virtual scrolling: Only render visible videos */}
          {videos.map((video, index) => {
            const isInRange = Math.abs(index - currentIndex) <= 1;
            // Network-aware preloading: adapts based on connection speed
            const shouldPreload = shouldPreloadVideo(currentIndex, index, networkInfo);
            
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
                  <VideoFeedItemComponent
                    item={video}
                    isActive={index === currentIndex}
                    isMuted={isMuted}
                    onMuteToggle={handleMuteToggle}
                    isMobile={true}
                    shouldPreload={shouldPreload}
                    networkSpeed={networkInfo.speed}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-900" />
                )}
              </div>
            );
          })}
          
          {loadingMore && (
            <div className="h-20 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {!isMobile && (
        <Suspense fallback={
          <div className="h-screen bg-black flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
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