// src/components/VideoPlayer.tsx - PERFORMANCE OPTIMIZED

'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { ProcessedVideo } from '@/types/neynar';
import { Play, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import Hls from 'hls.js';
import { useComponentMemoryTracking } from '../hooks/useMemoryMonitor';
import { reportVideoStartup } from '../hooks/useVideoStartupMetrics';
import { NetworkSpeed, getHLSBufferSettings } from '../hooks/useNetworkQuality';

interface VideoPlayerProps {
  videos: ProcessedVideo[];
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  className?: string;
  shouldPreload?: boolean; // Preload video in background for fast startup
  networkSpeed?: NetworkSpeed; // Adapt HLS settings based on network
}

function VideoPlayer({ 
  videos, 
  isActive, 
  isMuted, 
  onMuteToggle, 
  className = '',
  shouldPreload = false,
  networkSpeed = 'medium'
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const preloadStartTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);

  // Track memory usage in development
  useComponentMemoryTracking('VideoPlayer');

  const currentVideo = videos?.[0];

  // Setup HLS - Load when active OR when should preload
  useEffect(() => {
    const shouldLoad = isActive || shouldPreload;
    
    if (!videoRef.current || !currentVideo?.url || !shouldLoad) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏳ Waiting for video element...', { 
          hasRef: !!videoRef.current, 
          hasUrl: !!currentVideo?.url,
          isActive,
          shouldPreload 
        });
      }
      return;
    }

    const video = videoRef.current;
    const videoUrl = currentVideo.url;

    // Track preload start time
    if (shouldPreload && !isActive) {
      preloadStartTimeRef.current = performance.now();
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Preloading video:', videoUrl);
      }
    } else if (isActive && process.env.NODE_ENV === 'development') {
      console.log('🎬 Setting up HLS for active video:', videoUrl);
    }
    
    setIsLoading(true);
    setError(null);

    // Clean up previous
    if (hlsRef.current) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🧹 Destroying previous HLS');
      }
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Using native HLS (Safari)');
      }
      video.src = videoUrl;
      video.load();
      setIsLoading(false);
      return;
    }

    // HLS.js
    if (!Hls.isSupported()) {
      console.error('❌ HLS.js not supported');
      setError('HLS not supported in this browser');
      setIsLoading(false);
      return;
    }

    // Get network-aware buffer settings
    const bufferSettings = getHLSBufferSettings(networkSpeed);
    
    const hls = new Hls({
      debug: false, // Disable debug in production for performance
      enableWorker: true,
      // Network-adaptive buffer settings
      maxBufferLength: bufferSettings.maxBufferLength,
      maxMaxBufferLength: bufferSettings.maxMaxBufferLength,
      maxBufferSize: bufferSettings.maxBufferSize,
      maxBufferHole: 0.5, // Jump over small holes
      lowLatencyMode: true,
      backBufferLength: 0, // Don't keep old segments
      // Fast manifest loading
      manifestLoadingTimeOut: 10000,
      manifestLoadingMaxRetry: networkSpeed === 'slow' ? 1 : 2, // Fewer retries on slow connections
      manifestLoadingRetryDelay: 1000,
      // Fast fragment loading
      fragLoadingTimeOut: 20000,
      fragLoadingMaxRetry: networkSpeed === 'slow' ? 2 : 3, // Fewer retries on slow connections
      fragLoadingRetryDelay: 1000,
      // Start playback ASAP
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 3,
    });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📶 HLS config for ${networkSpeed} network:`, bufferSettings);
    }

    hlsRef.current = hls;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(videoUrl);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const loadTime = performance.now() - preloadStartTimeRef.current;
      if (process.env.NODE_ENV === 'development') {
        if (shouldPreload && !isActive) {
          console.log(`✅ Video preloaded in ${loadTime.toFixed(0)}ms`);
        } else {
          console.log(`✅ HLS manifest parsed in ${loadTime.toFixed(0)}ms`);
        }
      }
      setIsLoading(false);
      setError(null);
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        console.error('❌ HLS Error:', data);
        setError(`HLS Error: ${data.details}`);
        setIsLoading(false);
      }
    });

    hls.attachMedia(video);

    return () => {
      if (hlsRef.current) {
        // Proper cleanup to prevent memory leaks
        hlsRef.current.detachMedia();
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      
      // Clear video source
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.load();
      }
    };
  }, [currentVideo?.url, isActive, shouldPreload, networkSpeed]); // Include networkSpeed dependency

  // Playback control
  useEffect(() => {
    const video = videoRef.current;
    
    if (!video || isLoading || error) {
      return;
    }

    video.muted = isMuted;

    if (isActive) {
      // Track time from entering view to playback start
      playbackStartTimeRef.current = performance.now();
      
      video.play()
        .then(() => {
          const startupTime = performance.now() - playbackStartTimeRef.current;
          
          // Report startup time for metrics tracking
          reportVideoStartup(startupTime, shouldPreload);
          
          if (process.env.NODE_ENV === 'development') {
            const status = startupTime < 200 ? '✅' : '⚠️';
            console.log(`${status} Video startup: ${startupTime.toFixed(0)}ms (target: < 200ms)`);
          }
          setShowPlayButton(false);
        })
        .catch(err => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Play failed:', err.message);
          }
          setShowPlayButton(true);
        });
    } else {
      video.pause();
    }
  }, [isActive, isMuted, isLoading, error]);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setShowPlayButton(false);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onLoadedMetadata = () => {
      // Video metadata loaded
    };

    const onCanPlay = () => {
      setIsLoading(false);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  if (!currentVideo) {
    return (
      <div className={`bg-black ${className} flex items-center justify-center`}>
        <p className="text-white">No video</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`relative bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center p-6">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-white mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  const handleVideoClick = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) videoRef.current.pause();
      else videoRef.current.play();
    }
  }, [isPlaying]);

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMuteToggle();
  }, [onMuteToggle]);

  return (
    <div 
      className={`relative bg-black ${className}`}
      style={{ 
        contain: 'layout style paint',
        willChange: isActive ? 'transform' : 'auto'
      }}
    >
      {/* Mute Button */}
      <button
        onClick={handleMuteToggle}
        className="absolute top-4 right-4 z-50 w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
      >
        {isMuted ? (
          <VolumeX className="w-5 h-5 text-white" />
        ) : (
          <Volume2 className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Video Element - ALWAYS RENDERED */}
      <video
        ref={videoRef}
        loop
        muted={isMuted}
        playsInline
        preload={shouldPreload || isActive ? "auto" : "metadata"} // Auto for preload/active, metadata otherwise
        className="w-full h-full object-cover cursor-pointer"
        style={{ 
          display: isLoading ? 'none' : 'block',
          transform: 'translateZ(0)', // Force GPU acceleration
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onClick={handleVideoClick}
      />
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          <div className="text-center p-4">
            <div className="w-12 h-12 border-3 border-white/30 border-t-white rounded-full animate-spin mb-3 mx-auto"></div>
            <p className="text-white text-sm mb-2">Loading video...</p>
            <p className="text-white/60 text-xs">Active: {isActive ? 'Yes' : 'No'}</p>
            <p className="text-white/60 text-xs">Has Ref: {videoRef.current ? 'Yes' : 'No'}</p>
          </div>
        </div>
      )}

      {/* Play Button Overlay */}
      {showPlayButton && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center hover:scale-110 transition-transform">
            <Play className="w-10 h-10 text-white fill-white ml-1" />
          </div>
        </div>
      )}
    </div>
  );
}

// Memoize VideoPlayer to prevent re-renders when props haven't changed
export default memo(VideoPlayer, (prevProps, nextProps) => {
  return (
    prevProps.videos[0]?.url === nextProps.videos[0]?.url &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isMuted === nextProps.isMuted
  );
});