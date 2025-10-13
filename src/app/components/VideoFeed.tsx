// src/components/VideoFeed.tsx

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import VideoFeedItemComponent from './VideoFeedItem';
import DesktopVideoFeed from './DesktopVideoFeed';
import { VideoFeedItem } from '@/types/neynar';

interface VideoFeedResponse {
  videos: VideoFeedItem[];
  nextCursor?: string;
  hasMore: boolean;
  totalFound?: number;
}

// Virtual scrolling configuration
const VIEWPORT_BUFFER = 1; // Number of videos to render above/below viewport
const PRELOAD_DISTANCE = 3; // Start loading more when this many videos from end

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
  const [isScrolling, setIsScrolling] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const observerRef = useRef<IntersectionObserver | null>(null);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScrollTime = useRef<number>(0);
  const scrollVelocity = useRef<number>(0);

  // Performance monitoring
  const frameTime = useRef<number>(0);
  const lastFrameTime = useRef<number>(performance.now());

  // Detect mobile/desktop
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    checkIsMobile();
    window.addEventListener('resize', checkIsMobile, { passive: true });
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  // Optimized fetch with AbortController
  const fetchVideos = useCallback(async (cursor?: string, signal?: AbortSignal): Promise<VideoFeedResponse> => {
    try {
      const url = new URL('/api/feed', window.location.origin);
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await fetch(url.toString(), {
        cache: 'no-store',
        signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data: VideoFeedResponse = await response.json();
      return data;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Fetch aborted');
        throw err;
      }
      throw err;
    }
  }, []);

  // Optimized initial load
  const loadInitialVideos = useCallback(async () => {
    const controller = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      
      const data = await fetchVideos(undefined, controller.signal);
      
      if (!data.videos || data.videos.length === 0) {
        setError('No videos found');
        return;
      }
      
      setVideos(data.videos);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        const errorMessage = err.message;
        setError(getErrorMessage(errorMessage));
      }
    } finally {
      setLoading(false);
    }

    return () => controller.abort();
  }, [fetchVideos]);

  // Throttled load more with debouncing
  const loadMoreVideos = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;

    const controller = new AbortController();

    try {
      setLoadingMore(true);
      const data = await fetchVideos(nextCursor, controller.signal);
      
      setVideos(prev => [...prev, ...data.videos]);
      setNextCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        console.error('Failed to load more videos:', err);
      }
    } finally {
      setLoadingMore(false);
    }

    return () => controller.abort();
  }, [fetchVideos, hasMore, loadingMore, nextCursor]);

  // Virtual scrolling - only render visible + buffer videos
  const visibleVideoIndices = useMemo(() => {
    if (!isMobile || videos.length === 0) return videos.map((_, i) => i);

    const start = Math.max(0, currentIndex - VIEWPORT_BUFFER);
    const end = Math.min(videos.length - 1, currentIndex + VIEWPORT_BUFFER);
    
    const indices = [];
    for (let i = start; i <= end; i++) {
      indices.push(i);
    }
    
    return indices;
  }, [currentIndex, videos.length, isMobile]);

  // Performance-optimized intersection observer
  useEffect(() => {
    if (!isMobile || !containerRef.current || videos.length === 0) return;

    const container = containerRef.current;

    // Use passive observer with minimal threshold for better performance
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Use requestAnimationFrame to batch DOM updates
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current);
        }

        rafRef.current = requestAnimationFrame(() => {
          entries.forEach((entry) => {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            
            if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
              setCurrentIndex(index);
              
              // Preload more videos when approaching end
              if (index >= videos.length - PRELOAD_DISTANCE && hasMore && !loadingMore) {
                loadMoreVideos();
              }
            }
          });
        });
      },
      {
        root: container,
        threshold: 0.7, // Slightly lower threshold for better performance
        rootMargin: '10px', // Small margin for smoother transitions
      }
    );

    // Only observe visible video refs
    visibleVideoIndices.forEach(index => {
      const element = videoRefs.current.get(index);
      if (element && observerRef.current) {
        observerRef.current.observe(element);
      }
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [videos.length, hasMore, loadingMore, loadMoreVideos, isMobile, visibleVideoIndices]);

  // Optimized scroll event handling with throttling
  useEffect(() => {
    if (!isMobile || !containerRef.current) return;

    const container = containerRef.current;

    const handleScrollStart = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };

    const handleScrollEnd = () => {
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 150);
    };

    // Throttled scroll handler using requestAnimationFrame
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const now = performance.now();
          const deltaTime = now - lastScrollTime.current;
          
          if (deltaTime > 16) { // ~60fps throttle
            handleScrollStart();
            handleScrollEnd();
            lastScrollTime.current = now;
          }
          
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('touchstart', handleScrollStart, { passive: true });
    container.addEventListener('touchend', handleScrollEnd, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('touchstart', handleScrollStart);
      container.removeEventListener('touchend', handleScrollEnd);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [isMobile]);

  // High-performance touch handling
  useEffect(() => {
    if (!isMobile || !containerRef.current) return;

    const container = containerRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY;
      touchStartTime.current = Date.now();
      scrollVelocity.current = 0;
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Track scroll velocity for momentum
      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY.current - currentY;
      const deltaTime = Date.now() - touchStartTime.current;
      
      if (deltaTime > 0) {
        scrollVelocity.current = deltaY / deltaTime;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      
      const touchEndY = e.changedTouches[0].clientY;
      const touchEndTime = Date.now();
      const deltaY = touchStartY.current - touchEndY;
      const deltaTime = touchEndTime - touchStartTime.current;
      
      // High-velocity swipe detection
      const velocity = Math.abs(scrollVelocity.current);
      
      if (Math.abs(deltaY) > 50 && deltaTime < 300 && velocity > 0.5) {
        if (deltaY > 0 && currentIndex < videos.length - 1) {
          scrollToVideo(currentIndex + 1);
        } else if (deltaY < 0 && currentIndex > 0) {
          scrollToVideo(currentIndex - 1);
        }
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [currentIndex, videos.length, isMobile]);

  // Optimized keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default behavior for better performance
      if (['ArrowUp', 'ArrowDown', ' ', 'KeyM'].includes(e.code)) {
        e.preventDefault();
      }

      switch (e.code) {
        case 'ArrowUp':
          if (currentIndex > 0) scrollToVideo(currentIndex - 1);
          break;
        case 'ArrowDown':
          if (currentIndex < videos.length - 1) scrollToVideo(currentIndex + 1);
          break;
        case 'Space':
        case 'KeyM':
          setIsMuted(!isMuted);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, videos.length, isMuted]);

  // Performance-optimized scroll to video
  const scrollToVideo = useCallback((index: number) => {
    if (!isMobile) return;
    
    const element = videoRefs.current.get(index);
    if (element && containerRef.current) {
      // Use transform for hardware acceleration
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
      });
    }
  }, [isMobile]);

  // Optimized video ref management
  const setVideoRef = useCallback((index: number, element: HTMLDivElement | null) => {
    if (element) {
      videoRefs.current.set(index, element);
      
      if (observerRef.current && isMobile && visibleVideoIndices.includes(index)) {
        observerRef.current.observe(element);
      }
    } else {
      videoRefs.current.delete(index);
    }
  }, [isMobile, visibleVideoIndices]);

  // Initial load
  useEffect(() => {
    loadInitialVideos();
  }, [loadInitialVideos]);

  const getErrorMessage = (error: string): string => {
    if (error.includes('402')) return 'API quota exceeded. Check your Neynar API key.';
    if (error.includes('401')) return 'Invalid API key. Check your NEYNAR_API_KEY.';
    return 'Failed to load videos. Try again.';
  };

  const handleMuteToggle = useCallback(() => {
    setIsMuted(prev => !prev);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-3 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto"></div>
          <p className="text-white text-lg font-medium">Loading videos...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center p-8 max-w-sm">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-white text-xl font-bold mb-3">Something went wrong</h2>
          <p className="text-white/80 text-sm leading-relaxed mb-6">{error}</p>
          <button
            onClick={loadInitialVideos}
            className="flex items-center justify-center px-6 py-3 bg-tiktok-red text-white rounded-full font-semibold hover:bg-red-600 transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (videos.length === 0) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center p-8">
          <div className="w-20 h-20 bg-gray-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-3xl">🎬</span>
          </div>
          <h2 className="text-white text-xl font-bold mb-3">No videos found</h2>
          <p className="text-white/70 text-sm mb-6">Check back later for new content</p>
          <button
            onClick={loadInitialVideos}
            className="px-6 py-3 bg-white/10 text-white rounded-full font-medium hover:bg-white/20 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-black">
      {/* Mobile Layout */}
      {isMobile && (
        <div 
          ref={containerRef}
          className="h-screen overflow-y-auto snap-y snap-mandatory scrollbar-none"
          style={{ 
            scrollbarWidth: 'none', 
            msOverflowStyle: 'none',
            // Hardware acceleration
            transform: 'translateZ(0)',
            willChange: isScrolling ? 'scroll-position' : 'auto'
          }}
        >
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          
          {/* Virtual scrolling - only render visible videos */}
          {videos.map((video, index) => {
            const isVisible = visibleVideoIndices.includes(index);
            
            if (!isVisible) {
              // Render placeholder for non-visible videos to maintain scroll height
              return (
                <div
                  key={video.id}
                  className="h-screen w-full snap-start snap-always bg-black"
                />
              );
            }

            return (
              <div
                key={video.id}
                ref={(el) => setVideoRef(index, el)}
                data-index={index}
                className="h-screen w-full snap-start snap-always"
                style={{ 
                  // Hardware acceleration for visible videos
                  transform: 'translateZ(0)',
                  willChange: index === currentIndex ? 'transform' : 'auto'
                }}
              >
                <VideoFeedItemComponent
                  item={video}
                  isActive={index === currentIndex && !isScrolling}
                  isMuted={isMuted}
                  onMuteToggle={handleMuteToggle}
                  isMobile={true}
                />
              </div>
            );
          })}
          
          {/* Loading more indicator */}
          {loadingMore && (
            <div className="h-20 flex items-center justify-center bg-black">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {/* Desktop Layout */}
      {!isMobile && (
        <DesktopVideoFeed
          videos={videos}
          currentIndex={currentIndex}
          isMuted={isMuted}
          onMuteToggle={handleMuteToggle}
          onNext={() => setCurrentIndex(Math.min(currentIndex + 1, videos.length - 1))}
          onPrevious={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
        />
      )}

      {/* Performance indicator (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 left-4 z-50 bg-black/70 rounded-lg px-3 py-2 text-xs text-white">
          <div>Video: {currentIndex + 1} / {videos.length}</div>
          <div>Visible: {visibleVideoIndices.length}</div>
          <div>Scrolling: {isScrolling ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  );
}