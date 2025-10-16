// src/components/VideoPlayer.tsx - PERFORMANCE OPTIMIZED

'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { ProcessedVideo } from '@/types/neynar';
import { Play, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import Hls from 'hls.js';
import { useComponentMemoryTracking } from '../hooks/useMemoryMonitor';
import { reportVideoStartup } from '../hooks/useVideoStartupMetrics';
import { NetworkSpeed, getHLSBufferSettings } from '../hooks/useNetworkQuality';
import { reportVideoError, reportVideoLoaded } from '../hooks/useErrorMetrics';

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
  const [retryCount, setRetryCount] = useState(0);
  const [showPoster, setShowPoster] = useState(false);
  const preloadStartTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track memory usage in development
  useComponentMemoryTracking('VideoPlayer');

  const currentVideo = videos?.[0];
  
  // Retry logic with exponential backoff
  const retryVideo = useCallback(() => {
    const maxRetries = 3;
    
    if (retryCount >= maxRetries) {
      if (process.env.NODE_ENV === 'development') {
        console.error(`❌ Max retries (${maxRetries}) reached for video`);
      }
      setShowPoster(true); // Show poster after max retries
      setIsLoading(false);
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s
    const delay = Math.pow(2, retryCount) * 1000;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔄 Retrying video in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
    }
    
    retryTimeoutRef.current = setTimeout(() => {
      setRetryCount(prev => prev + 1);
      setError(null);
      setIsLoading(true);
    }, delay);
  }, [retryCount]);

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
        const errorMsg = `HLS Error: ${data.type} - ${data.details}`;
        
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ HLS Fatal Error:', data);
        }
        
        setError(errorMsg);
        setIsLoading(false);
        
        // Report error
        reportVideoError(data.type, retryCount, false);
        
        // Attempt retry for recoverable errors
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          retryVideo();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          // Try to recover from media errors
          hls.recoverMediaError();
        } else {
          // Non-recoverable error - show poster
          setShowPoster(true);
        }
      }
    });

    hls.attachMedia(video);

    return () => {
      // Clear any pending retry timeouts
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
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
  }, [currentVideo?.url, isActive, shouldPreload, networkSpeed, retryCount, retryVideo]); // Include all dependencies

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
      setShowPoster(false); // Hide poster on successful play
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onLoadedMetadata = () => {
      // Video metadata loaded successfully
      setShowPoster(false);
    };

    const onCanPlay = () => {
      setIsLoading(false);
      
      // Report successful load if there was a previous error
      if (error) {
        reportVideoError(error, retryCount, true); // Recovered!
      } else {
        reportVideoLoaded(); // Normal load
      }
      
      setError(null); // Clear error on successful load
    };
    
    const onError = (e: Event) => {
      const videoEl = e.target as HTMLVideoElement;
      const errorCode = videoEl.error?.code;
      const errorMessage = videoEl.error?.message || 'Unknown error';
      const errorType = errorCode === MediaError.MEDIA_ERR_NETWORK ? 'NETWORK' :
                        errorCode === MediaError.MEDIA_ERR_DECODE ? 'DECODE' :
                        errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? 'FORMAT' :
                        'UNKNOWN';
      
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Video element error:', { code: errorCode, type: errorType, message: errorMessage });
      }
      
      const errorMsg = `${errorType}: ${errorMessage}`;
      setError(errorMsg);
      setIsLoading(false);
      
      // Report error (will report recovery status later if retry succeeds)
      reportVideoError(errorType, retryCount, false);
      
      // Attempt retry for network/loading errors
      if (errorCode === MediaError.MEDIA_ERR_NETWORK || errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        retryVideo();
      } else {
        setShowPoster(true);
      }
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
    };
  }, [retryVideo, error, retryCount]);

  if (!currentVideo) {
    return (
      <div className={`bg-black ${className} flex items-center justify-center`}>
        <p className="text-white">No video</p>
      </div>
    );
  }

  // Manual retry handler
  const handleManualRetry = useCallback(() => {
    setRetryCount(0); // Reset retry count
    setError(null);
    setShowPoster(false);
    setIsLoading(true);
  }, []);

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

      {/* Poster/Thumbnail - Show on error or while loading with poster */}
      {(showPoster || (isLoading && currentVideo.thumbnail)) && currentVideo.thumbnail && (
        <div className="absolute inset-0 z-10">
          <img
            src={currentVideo.thumbnail}
            alt="Video thumbnail"
            className="w-full h-full object-cover"
          />
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      {/* Video Element - ALWAYS RENDERED */}
      <video
        ref={videoRef}
        loop
        muted={isMuted}
        playsInline
        preload={shouldPreload || isActive ? "auto" : "metadata"} // Auto for preload/active, metadata otherwise
        poster={currentVideo.thumbnail} // Native poster attribute as fallback
        className="w-full h-full object-cover cursor-pointer"
        style={{ 
          display: (isLoading && !currentVideo.thumbnail) || showPoster ? 'none' : 'block',
          transform: 'translateZ(0)', // Force GPU acceleration
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onClick={handleVideoClick}
      />
      
      {/* Error Overlay - Non-blocking, allows scrolling */}
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="text-center p-4 pointer-events-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-2" />
            <p className="text-white text-sm mb-3">
              {retryCount > 0 ? `Retrying... (${retryCount}/3)` : 'Failed to load'}
            </p>
            {retryCount >= 3 && (
              <button
                onClick={handleManualRetry}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
              >
                Tap to Retry
              </button>
            )}
          </div>
        </div>
      )}
      
      {/* Loading Overlay */}
      {isLoading && !showPoster && (
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