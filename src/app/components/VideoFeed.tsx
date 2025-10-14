// src/components/VideoFeed.tsx - SIMPLIFIED VERSION

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import VideoFeedItemComponent from './VideoFeedItem';
import DesktopVideoFeed from './DesktopVideoFeed';
import { VideoFeedItem } from '@/types/neynar';

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

  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkIsMobile();
    window.addEventListener('resize', checkIsMobile);
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  const fetchVideos = useCallback(async (cursor?: string): Promise<VideoFeedResponse> => {
    const url = new URL('/api/feed', window.location.origin);
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString(), { cache: 'no-store' });
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

  // Intersection observer
  useEffect(() => {
    if (!isMobile || !containerRef.current || videos.length === 0) return;

    const container = containerRef.current;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            console.log(`👁️ Video ${index + 1} is active`);
            setCurrentIndex(index);
            
            if (index >= videos.length - 2 && hasMore && !loadingMore) {
              loadMoreVideos();
            }
          }
        });
      },
      {
        root: container,
        threshold: 0.5,
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
      }
    };
  }, [isMobile, videos.length, hasMore, loadingMore, loadMoreVideos]);

  // Keyboard navigation
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

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, videos.length, isMuted]);

  useEffect(() => {
    loadInitialVideos();
  }, [loadInitialVideos]);

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
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          <style jsx>{`
            div::-webkit-scrollbar { display: none; }
          `}</style>
          
          {/* SIMPLE: Just render ALL videos, no fancy virtual scrolling */}
          {videos.map((video, index) => (
            <div
              key={video.id}
              ref={(el) => {
                if (el) videoRefs.current.set(index, el);
                else videoRefs.current.delete(index);
              }}
              data-index={index}
              className="h-screen w-full snap-start snap-always"
            >
              <VideoFeedItemComponent
                item={video}
                isActive={index === currentIndex}
                isMuted={isMuted}
                onMuteToggle={() => setIsMuted(!isMuted)}
                isMobile={true}
              />
            </div>
          ))}
          
          {loadingMore && (
            <div className="h-20 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
            </div>
          )}
        </div>
      )}

      {!isMobile && (
        <DesktopVideoFeed
          videos={videos}
          currentIndex={currentIndex}
          isMuted={isMuted}
          onMuteToggle={() => setIsMuted(!isMuted)}
          onNext={() => setCurrentIndex(Math.min(currentIndex + 1, videos.length - 1))}
          onPrevious={() => setCurrentIndex(Math.max(currentIndex - 1, 0))}
        />
      )}

      {process.env.NODE_ENV === 'development' && (
        <div className="fixed top-4 right-4 z-50 bg-black/70 rounded px-3 py-2 text-xs text-white">
          <div>Video: {currentIndex + 1} / {videos.length}</div>
        </div>
      )}
    </div>
  );
}