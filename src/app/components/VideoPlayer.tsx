
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

  // Setup Video - Load when active OR when should preload (HLS + Direct Videos)
  useEffect(() => {
    const shouldLoad = isActive || shouldPreload;
    
    // Cleanup function for when component becomes inactive
    const cleanup = () => {
      if (hlsRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🧹 Destroying HLS due to inactive');
        }
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (!isActive && isLoading) {
        setIsLoading(false);
      }
    };
    
    if (!videoRef.current || !currentVideo?.url || !shouldLoad) {
      // Clean up if becoming inactive
      cleanup();
      
      if (process.env.NODE_ENV === 'development' && videoRef.current && currentVideo?.url) {
        console.log('⏸️ Video inactive, cleaning up...', { 
          isActive,
          shouldPreload 
        });
      }
      return;
    }

    const video = videoRef.current;
    const videoUrl = currentVideo.url;
    const videoType = currentVideo.videoType;

    // Track preload start time
    if (shouldPreload && !isActive) {
      preloadStartTimeRef.current = performance.now();
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔄 Preloading ${videoType.toUpperCase()} video:`, videoUrl);
      }
    } else if (isActive && process.env.NODE_ENV === 'development') {
      console.log(`🎬 Setting up ${videoType.toUpperCase()} video:`, videoUrl);
    }
    
    setIsLoading(true);
    setError(null);

    // Clean up previous
    cleanup();

    // Handle direct video formats (MP4, WebM, MOV, OGG)
    if (videoType !== 'hls') {
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Using native HTML5 video for ${videoType.toUpperCase()}`);
      }
      video.src = videoUrl;
      video.load();
      // Let video events handle isLoading state
      return;
    }

    // HLS format - use Safari native or HLS.js
    // Safari native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Using native HLS (Safari)');
      }
      video.src = videoUrl;
      video.load();
      // Don't set isLoading to false - let the video events handle it
      return;
    }

    // HLS.js
    if (!Hls.isSupported()) {
      console.error('❌ HLS.js not supported');
      setError('HLS not supported in this browser');
      setIsLoading(false);
      return;
    }

    const bufferSettings = getHLSBufferSettings(networkSpeed);
    
    // Aggressive timeouts for mobile to prevent long waits
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const timeoutMultiplier = isMobile ? 0.5 : 1; // Half timeouts on mobile
    
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
      // Aggressive manifest loading for mobile
      manifestLoadingTimeOut: 5000 * timeoutMultiplier, // 5s desktop, 2.5s mobile
      manifestLoadingMaxRetry: networkSpeed === 'slow' ? 1 : 2,
      manifestLoadingRetryDelay: 500, // Faster retry
      // Aggressive fragment loading for mobile
      fragLoadingTimeOut: 10000 * timeoutMultiplier, // 10s desktop, 5s mobile
      fragLoadingMaxRetry: networkSpeed === 'slow' ? 1 : 2,
      fragLoadingRetryDelay: 500,
      liveSyncDurationCount: 1,
      liveMaxLatencyDurationCount: 3,
      // Abort controller for stalled requests
      xhrSetup: function(xhr: XMLHttpRequest) {
        xhr.timeout = 5000 * timeoutMultiplier; // 5s desktop, 2.5s mobile
      },
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
      // Don't set isLoading to false here - wait for canplay event
      setError(null);
    });
    
    hls.on(Hls.Events.FRAG_LOADED, () => {
      // First fragment loaded - video should be ready soon
      if (process.env.NODE_ENV === 'development') {
        console.log('📦 HLS fragment loaded');
      }
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
        
        // Handle specific error types
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          // Network errors - retry
          retryVideo();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          // Media errors - try to recover
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 Attempting media error recovery...');
          }
          hls.recoverMediaError();
        } else if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
          // Manifest errors - retry with delay
          if (process.env.NODE_ENV === 'development') {
            console.log('📋 Manifest error - retrying...');
          }
          retryVideo();
        } else {
          // Other fatal errors - show poster and allow manual retry
          if (process.env.NODE_ENV === 'development') {
            console.log('❌ Non-recoverable error - showing poster');
          }
          setShowPoster(true);
        }
      }
    });

    hls.attachMedia(video);

    return () => {
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
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Video can play');
      }
      
      setIsLoading(false);
      
      // Report successful load if there was a previous error
      if (error) {
        reportVideoError(error, retryCount, true); // Recovered!
      } else {
        reportVideoLoaded(); // Normal load
      }
      
      setError(null); // Clear error on successful load
    };
    
    const onLoadStart = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('⏳ Video load started');
      }
      setIsLoading(true);
    };
    
    const onLoadedData = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('📦 Video data loaded');
      }
      // Video has loaded enough to start playing
      setIsLoading(false);
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
    video.addEventListener('loadstart', onLoadStart);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadstart', onLoadStart);
      video.removeEventListener('loadeddata', onLoadedData);
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
        className="w-full h-full object-cover cursor-pointer" // object-cover for mobile fullscreen
        style={{ 
          display: showPoster ? 'none' : 'block',
          transform: 'translateZ(0)', // Force GPU acceleration
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: '#000'
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
      
      {/* Loading Overlay - Simple circular loader only */}
      {isLoading && !showPoster && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
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