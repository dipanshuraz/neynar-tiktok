
'use client';

import { useEffect, useRef, useState, memo, useCallback } from 'react';
import { ProcessedVideo } from '@/types/neynar';
import { Play, Volume2, VolumeX, AlertCircle, Share2 } from 'lucide-react';
import { Icon } from '@iconify/react';
import { useComponentMemoryTracking } from '../hooks/useMemoryMonitor';
import { reportVideoStartup } from '../hooks/useVideoStartupMetrics';
import { NetworkSpeed, getHLSBufferSettings } from '../hooks/useNetworkQuality';
import { reportVideoError, reportVideoLoaded } from '../hooks/useErrorMetrics';

// Dynamically import HLS.js only when needed (reduces initial bundle)
type HlsType = import('hls.js').default;
let HlsClass: typeof import('hls.js').default | null = null;
let hlsPromise: Promise<typeof import('hls.js')> | null = null;

async function getHls() {
  if (HlsClass) return HlsClass;
  if (!hlsPromise) {
    hlsPromise = import('hls.js');
  }
  const module = await hlsPromise;
  HlsClass = module.default;
  return HlsClass;
}

// Eagerly start loading HLS.js on first module load (parallel with app init)
// This reduces the delay when the first video needs it
if (typeof window !== 'undefined') {
  getHls().catch(() => {
    // Silently ignore errors - will retry when needed
  });
}

interface VideoPlayerProps {
  videos: ProcessedVideo[];
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  className?: string;
  shouldPreload?: boolean; // Preload video in background for fast startup
  networkSpeed?: NetworkSpeed; // Adapt HLS settings based on network
  shouldPlay?: boolean; // External play/pause control (for keyboard shortcuts)
  castHash?: string; // For sharing
  authorUsername?: string; // For sharing
  castText?: string; // For sharing
}

function VideoPlayer({ 
  videos, 
  isActive, 
  isMuted, 
  onMuteToggle, 
  className = '',
  shouldPreload = false,
  networkSpeed = 'medium',
  shouldPlay = true,
  castHash,
  authorUsername,
  castText
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!isActive); // Start optimistic for active video
  const [retryCount, setRetryCount] = useState(0);
  const [showPoster, setShowPoster] = useState(false);
  const [isVerticalVideo, setIsVerticalVideo] = useState(true); // Track if video is 9:16 (vertical)
  const [showShareToast, setShowShareToast] = useState(false); // Share feedback
  const preloadStartTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Safety timeout for infinite loading

  // Track memory usage in development
  useComponentMemoryTracking('VideoPlayer');

  const currentVideo = videos?.[0];
  
  // Reset vertical state when video URL changes
  useEffect(() => {
    // Reset to true (assume vertical) when URL changes, will update after metadata loads
    setIsVerticalVideo(true);
  }, [currentVideo?.url]);
  
  // Detect video aspect ratio when metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkAspectRatio = () => {
      const width = currentVideo?.width || video.videoWidth;
      const height = currentVideo?.height || video.videoHeight;
      
      if (width && height) {
        const aspectRatio = width / height;
        // 9:16 aspect ratio is 0.5625. Allow some tolerance (0.5 to 0.6)
        // This catches 9:16, but not 16:9 (1.777) or square (1.0)
        const isVertical = aspectRatio >= 0.5 && aspectRatio <= 0.6;
        setIsVerticalVideo(isVertical);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`📐 Video aspect ratio: ${aspectRatio.toFixed(3)} (${width}x${height}) - ${isVertical ? 'Vertical (cover)' : 'Non-vertical (contain)'}`);
        }
      }
    };

    video.addEventListener('loadedmetadata', checkAspectRatio);
    
    // Check immediately if metadata already loaded
    if (video.readyState >= 1) {
      checkAspectRatio();
    }

    return () => {
      video.removeEventListener('loadedmetadata', checkAspectRatio);
    };
  }, [currentVideo?.width, currentVideo?.height, currentVideo?.url]);

  // Share handler
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!castHash || !authorUsername) return;
    
    const shareUrl = `https://warpcast.com/${authorUsername}/${castHash.slice(0, 10)}`;
    const shareData = {
      title: `Video by @${authorUsername}`,
      text: castText || `Check out this video by @${authorUsername}`,
      url: shareUrl,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Shared via Web Share API');
        }
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Link copied to clipboard');
        }
      }
    } catch (error) {
      console.error('Failed to share:', error);
    }
  }, [castHash, authorUsername, castText]);
  
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

  // Setup Video - ALWAYS load video as soon as component mounts (aggressive preloading)
  useEffect(() => {
    // ALWAYS load video immediately for instant playback
    // Don't wait for shouldPreload or isActive
    if (!videoRef.current || !currentVideo?.url) {
      return;
    }

    const video = videoRef.current;
    const videoUrl = currentVideo.url;
    const videoType = currentVideo.videoType;

    // Track load start time
    preloadStartTimeRef.current = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      const status = isActive ? '🎬 Active' : (shouldPreload ? '⚡ Preload' : '📦 Background');
      console.log(`${status} loading ${videoType.toUpperCase()}:`, videoUrl.substring(0, 50) + '...');
    }
    
    // Only show loading spinner after a delay for active videos (avoid flicker)
    if (isActive) {
      const loadingTimer = setTimeout(() => setIsLoading(true), 300);
      const cleanup = () => clearTimeout(loadingTimer);
      video.addEventListener('canplay', cleanup, { once: true });
      video.addEventListener('error', cleanup, { once: true });
      
      // Safety timeout: If video doesn't load within 20 seconds on mobile (10s desktop), show error
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const safetyTimeout = isMobile ? 20000 : 10000;
      loadingTimeoutRef.current = setTimeout(() => {
        if (isLoading) {
          console.warn('⏱️ Video loading timeout - forcing error state');
          setError('Video took too long to load. Please try again.');
          setIsLoading(false);
          setShowPoster(true);
        }
      }, safetyTimeout);
    } else {
      setIsLoading(true);
    }
    setError(null);

    // Clean up previous HLS instance only if URL is changing
    if (hlsRef.current) {
      const prevUrl = hlsRef.current.url;
      if (prevUrl !== videoUrl) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🧹 Destroying previous HLS (URL changed)');
        }
        hlsRef.current.destroy();
        hlsRef.current = null;
      } else {
        // Same URL - reuse existing HLS instance
        if (process.env.NODE_ENV === 'development') {
          console.log('♻️ Reusing HLS instance for same URL');
        }
        return;
      }
    }

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

    // HLS.js - Load dynamically to reduce initial bundle
    const setupHls = async () => {
      const HlsClass = await getHls();
      
      if (!HlsClass.isSupported()) {
        console.error('❌ HLS.js not supported');
        setError('HLS not supported in this browser');
        setIsLoading(false);
        return;
      }

      const bufferSettings = getHLSBufferSettings(networkSpeed);
      
      // Mobile-friendly timeouts - mobile networks can be slower than desktop
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const timeoutMultiplier = isMobile ? 2 : 1; // LONGER timeouts on mobile (not shorter!)
      
      // Ultra-low latency settings for preloading
      const isPreloading = shouldPreload && !isActive;
      
      const hls = new HlsClass({
        debug: false, // Disable debug in production for performance
        enableWorker: true,
        // Ultra-low buffer for fast startup on preload, larger buffer on active for smooth playback
        maxBufferLength: isPreloading ? 2 : (isMobile ? 10 : bufferSettings.maxBufferLength), // Larger buffer on mobile active video
        maxMaxBufferLength: isPreloading ? 3 : (isMobile ? 15 : bufferSettings.maxMaxBufferLength),
        maxBufferSize: isPreloading ? 0.5 * 1000 * 1000 : bufferSettings.maxBufferSize,
        maxBufferHole: 0.5, // More tolerant of gaps
        lowLatencyMode: !isMobile, // Disable low latency mode on mobile for stability
        backBufferLength: 0, // Don't keep old segments
        // More generous manifest loading timeouts for mobile networks
        manifestLoadingTimeOut: 8000 * timeoutMultiplier, // 8s desktop, 16s mobile
        manifestLoadingMaxRetry: 3, // More retries for reliability
        manifestLoadingRetryDelay: 1000, // 1s retry delay
        // More generous fragment loading timeouts
        fragLoadingTimeOut: 10000 * timeoutMultiplier, // 10s desktop, 20s mobile
        fragLoadingMaxRetry: 3, // More retries
        fragLoadingRetryDelay: 1000,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        // More generous XHR timeout for mobile networks
        xhrSetup: function(xhr: XMLHttpRequest) {
          xhr.timeout = 10000 * timeoutMultiplier; // 10s desktop, 20s mobile
        },
        // Start loading immediately
        startPosition: 0,
        autoStartLoad: true,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📶 HLS config for ${networkSpeed} network:`, bufferSettings);
      }

      hlsRef.current = hls;

      hls.on(HlsClass.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(videoUrl);
      });

      hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
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
      
      hls.on(HlsClass.Events.FRAG_LOADED, () => {
        // First fragment loaded - video should be ready soon
        if (process.env.NODE_ENV === 'development') {
          console.log('📦 HLS fragment loaded');
        }
      });

      hls.on(HlsClass.Events.ERROR, (event, data) => {
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
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            // Network errors - retry
            retryVideo();
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
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
    };
    
    // Start HLS setup (async)
    setupHls();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      if (hlsRef.current) {
        // Proper cleanup to prevent memory leaks and audio glitches
        try {
          hlsRef.current.stopLoad(); // Stop loading segments
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (err) {
          // Ignore cleanup errors
        }
        hlsRef.current = null;
      }
      
      if (videoRef.current) {
        const video = videoRef.current;
        video.pause();
        video.muted = true;
        video.src = '';
        video.load();
      }
    };
  }, [currentVideo?.url, isActive, shouldPreload, networkSpeed, retryCount, retryVideo]); // Include all dependencies

  // CRITICAL: Immediate pause when becoming inactive (prevent audio overlap)
  // This MUST run BEFORE any play effects - use layout effect timing
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isActive) {
      // PENTUPLE SAFETY: Aggressively stop ALL audio
      
      // 1. Pause IMMEDIATELY (synchronous)
      video.pause();
      
      // 2. Mute and zero volume (double safety)
      video.muted = true;
      video.volume = 0;
      
      // 3. Set currentTime to 0 (prevents audio glitches)
      try {
        video.currentTime = 0;
      } catch (err) {
        // Ignore - might not be seekable yet
      }
      
      // 4. Stop HLS loading to prevent buffering audio
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
        } catch (err) {
          // Ignore errors
        }
      }
      
      // 5. Set data attribute to mark as inactive (for CSS/debug)
      video.dataset.active = 'false';
      
      // 6. Use requestAnimationFrame for extra safety (next frame)
      requestAnimationFrame(() => {
        if (video && !video.paused) {
          video.pause();
          video.muted = true;
          video.volume = 0;
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Video was still playing after pause! Force stopped again.');
          }
        }
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸️ Video STOPPED (inactive) - 5-layer audio kill');
      }
    } else if (isActive) {
      // GLOBAL SAFETY: Pause ALL other videos on the page
      // This catches any videos that might have slipped through
      if (typeof document !== 'undefined') {
        const allVideos = document.querySelectorAll('video');
        allVideos.forEach((otherVideo) => {
          if (otherVideo !== video && !otherVideo.paused) {
            otherVideo.pause();
            otherVideo.muted = true;
            otherVideo.volume = 0;
            if (process.env.NODE_ENV === 'development') {
              console.warn('🚨 Found rogue playing video! Force stopped.');
            }
          }
        });
      }
      
      // Mark as active
      video.dataset.active = 'true';
      
      // Restore mute state
      video.muted = isMuted;
      video.volume = isMuted ? 0 : 1;
      
      // Resume HLS loading
      if (hlsRef.current) {
        try {
          hlsRef.current.startLoad();
        } catch (err) {
          // Ignore errors
        }
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('▶️ Video activated - ready to play');
      }
    }
  }, [isActive, isMuted]);

  // Playback control - ONLY play when active
  useEffect(() => {
    const video = videoRef.current;
    
    if (!video || error) {
      return;
    }

    // CRITICAL: Ensure inactive videos are ALWAYS paused
    if (!isActive) {
      video.pause();
      video.muted = true;
      video.volume = 0;
      return;
    }

    // Only proceed if active
    video.muted = isMuted;
    video.volume = isMuted ? 0 : 1;

    if (shouldPlay) {
      // Track time from entering view to playback start
      playbackStartTimeRef.current = performance.now();
      
      // Try to play immediately, even if still loading
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
          setIsLoading(false); // Clear loading on successful play
          
          // Clear safety timeout - video is playing now
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        })
        .catch(err => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Play failed:', err.message);
          }
          // Only show play button if it's a user interaction error
          if (err.name === 'NotAllowedError') {
            setShowPlayButton(true);
          }
          // Don't block playback for other errors - let it try again
        });
    } else {
      // Pause when shouldPlay is false (keyboard shortcut)
      video.pause();
      setShowPlayButton(true);
    }
  }, [isActive, isMuted, error, shouldPreload, shouldPlay]);

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
      // Show play button when paused manually (if active)
      if (isActive) {
        setShowPlayButton(true);
      }
    };

    const onLoadedMetadata = () => {
      // Video metadata loaded successfully
      setShowPoster(false);
      setIsLoading(false); // Clear loading as soon as metadata is ready
      
      // Clear safety timeout - video is loading successfully
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      // Try to play if active and video is ready
      if (isActive && video.readyState >= 2) { // HAVE_CURRENT_DATA or better
        video.play().catch(() => {
          // Ignore errors, will retry when canplay fires
        });
      }
    };

    const onCanPlay = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Video can play');
      }
      
      setIsLoading(false);
      
      // Clear safety timeout - video can play now
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
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
      
      // Clear safety timeout - video has data now
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      // Aggressively try to play as soon as data is loaded
      if (isActive) {
        video.play().catch(() => {
          // Ignore errors, will retry in main playback effect
        });
      }
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
  }, [retryVideo, error, retryCount, isActive]);

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
      className={`relative bg-black ${className} flex items-center justify-center`}
      style={{ 
        contain: 'layout style paint',
        willChange: isActive ? 'transform' : 'auto'
      }}
    >
      {/* Control Buttons - Top Right */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {/* Share Button */}
        {castHash && authorUsername && (
          <button
            onClick={handleShare}
            className="w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
            aria-label="Share video"
          >
            <Share2 className="w-5 h-5 text-white" />
          </button>
        )}
        
        {/* Mute Button */}
        <button
          onClick={handleMuteToggle}
          className="w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5 text-white" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
        </button>
      </div>
      
      {/* Share Toast Notification */}
      {showShareToast && (
        <div className="absolute top-20 right-4 z-50 bg-black/80 text-white px-4 py-2 rounded-lg text-sm animate-fade-in">
          ✓ Link copied to clipboard
        </div>
      )}

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
        preload="auto" // Always auto-load for instant playback
        poster={currentVideo.thumbnail} // Native poster attribute as fallback
        {...((isActive || shouldPreload) ? { fetchpriority: 'high' as const } : {})} // High priority for active and preloading videos
        className={`cursor-pointer ${isVerticalVideo ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'}`} // Vertical: fill screen, Horizontal: center with max dimensions
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
                aria-label="Retry loading video"
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
          <Icon icon="svg-spinners:ring-resize" className="w-12 h-12 text-white" />
        </div>
      )}

      {/* Play Button Overlay */}
      {showPlayButton && !isLoading && (
        <div 
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-30"
          onClick={handleVideoClick}
          role="button"
          aria-label="Play video"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleVideoClick();
            }
          }}
        >
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center hover:scale-110 transition-transform active:scale-95">
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
    prevProps.isMuted === nextProps.isMuted &&
    prevProps.shouldPlay === nextProps.shouldPlay &&
    prevProps.castHash === nextProps.castHash
  );
});