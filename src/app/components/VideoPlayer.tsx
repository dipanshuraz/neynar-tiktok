
'use client';

import { useEffect, useLayoutEffect, useRef, useState, memo, useCallback } from 'react';
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
if (typeof window !== 'undefined') {
  getHls().catch(() => {});
}

interface VideoPlayerProps {
  videos: ProcessedVideo[];
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  className?: string;
  shouldPreload?: boolean;
  networkSpeed?: NetworkSpeed;
  shouldPlay?: boolean;
  onPlayPauseToggle?: () => void;
  castHash?: string;
  authorUsername?: string;
  castText?: string;
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
  onPlayPauseToggle,
  castHash,
  authorUsername,
  castText
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(!isActive);
  const [retryCount, setRetryCount] = useState(0);
  const [showPoster, setShowPoster] = useState(false);
  const [isVerticalVideo, setIsVerticalVideo] = useState(true);
  const [showShareToast, setShowShareToast] = useState(false);
  const preloadStartTimeRef = useRef<number>(0);
  const playbackStartTimeRef = useRef<number>(0);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track if pause was triggered by user (not programmatic)
  const userPausedRef = useRef(false);
  // Track if we're in the middle of a play attempt
  const playingRef = useRef(false);

  useComponentMemoryTracking('VideoPlayer');

  const currentVideo = videos?.[0];
  
  // Reset vertical state when video URL changes
  useEffect(() => {
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
        const isVertical = aspectRatio >= 0.5 && aspectRatio <= 0.6;
        setIsVerticalVideo(isVertical);
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`📐 Video aspect ratio: ${aspectRatio.toFixed(3)} (${width}x${height}) - ${isVertical ? 'Vertical' : 'Non-vertical'}`);
        }
      }
    };

    video.addEventListener('loadedmetadata', checkAspectRatio);
    if (video.readyState >= 1) checkAspectRatio();

    return () => video.removeEventListener('loadedmetadata', checkAspectRatio);
  }, [currentVideo?.width, currentVideo?.height, currentVideo?.url]);

  // Share handler
  const handleShare = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
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
      setShowPoster(true);
      setIsLoading(false);
      return;
    }
    
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

  // Setup Video - Load video source
  useEffect(() => {
    if (!videoRef.current || !currentVideo?.url) return;

    const video = videoRef.current;
    const videoUrl = currentVideo.url;
    const videoType = currentVideo.videoType;

    preloadStartTimeRef.current = performance.now();
    
    if (process.env.NODE_ENV === 'development') {
      const status = isActive ? '🎬 Active' : (shouldPreload ? '⚡ Preload' : '📦 Background');
      console.log(`${status} loading ${videoType.toUpperCase()}:`, videoUrl.substring(0, 50) + '...');
    }
    
    // Loading spinner logic
    if (isActive) {
      const loadingTimer = setTimeout(() => setIsLoading(true), 300);
      const cleanup = () => clearTimeout(loadingTimer);
      video.addEventListener('canplay', cleanup, { once: true });
      video.addEventListener('error', cleanup, { once: true });
      
      // Safety timeout
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const safetyTimeout = isMobile ? 20000 : 10000;
      loadingTimeoutRef.current = setTimeout(() => {
        if (video.readyState < 2 && video.networkState !== HTMLMediaElement.NETWORK_IDLE) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⏱️ Video loading timeout', {
              readyState: video.readyState,
              networkState: video.networkState,
            });
          }
          setError('Video took too long to load. Please try again.');
          setIsLoading(false);
          setShowPoster(true);
        }
      }, safetyTimeout);
    } else {
      setIsLoading(true);
    }
    setError(null);

    // Clean up previous HLS instance if URL changed
    if (hlsRef.current) {
      const prevUrl = hlsRef.current.url;
      if (prevUrl !== videoUrl) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🧹 Destroying previous HLS (URL changed)');
        }
        hlsRef.current.destroy();
        hlsRef.current = null;
      } else {
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
      return;
    }

    // Safari native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Using native HLS (Safari)');
      }
      video.src = videoUrl;
      video.load();
      return;
    }

    // HLS.js setup
    const setupHls = async () => {
      const HlsClass = await getHls();
      
      if (!HlsClass.isSupported()) {
        console.error('❌ HLS.js not supported');
        setError('HLS not supported in this browser');
        setIsLoading(false);
        return;
      }

      const bufferSettings = getHLSBufferSettings(networkSpeed);
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const timeoutMultiplier = isMobile ? 2 : 1;
      const isPreloading = shouldPreload && !isActive;
      
      const hls = new HlsClass({
        debug: false,
        enableWorker: true,
        maxBufferLength: isPreloading ? 2 : (isMobile ? 10 : bufferSettings.maxBufferLength),
        maxMaxBufferLength: isPreloading ? 3 : (isMobile ? 15 : bufferSettings.maxMaxBufferLength),
        maxBufferSize: isPreloading ? 0.5 * 1000 * 1000 : bufferSettings.maxBufferSize,
        maxBufferHole: 0.5,
        lowLatencyMode: !isMobile,
        backBufferLength: 0,
        manifestLoadingTimeOut: 8000 * timeoutMultiplier,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 10000 * timeoutMultiplier,
        fragLoadingMaxRetry: 3,
        fragLoadingRetryDelay: 1000,
        liveSyncDurationCount: 1,
        liveMaxLatencyDurationCount: 2,
        xhrSetup: function(xhr: XMLHttpRequest) {
          xhr.timeout = 10000 * timeoutMultiplier;
        },
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
        setError(null);
      });
      
      hls.on(HlsClass.Events.FRAG_LOADED, () => {
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
          reportVideoError(data.type, retryCount, false);
          
          if (data.type === HlsClass.ErrorTypes.NETWORK_ERROR) {
            retryVideo();
          } else if (data.type === HlsClass.ErrorTypes.MEDIA_ERROR) {
            if (process.env.NODE_ENV === 'development') {
              console.log('🔄 Attempting media error recovery...');
            }
            hls.recoverMediaError();
          } else if (data.details === 'manifestLoadError' || data.details === 'manifestParsingError') {
            if (process.env.NODE_ENV === 'development') {
              console.log('📋 Manifest error - retrying...');
            }
            retryVideo();
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('❌ Non-recoverable error - showing poster');
            }
            setShowPoster(true);
          }
        }
      });

      hls.attachMedia(video);
    };
    
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
        try {
          hlsRef.current.stopLoad();
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
  }, [currentVideo?.url, isActive, shouldPreload, networkSpeed, retryCount, retryVideo]);
  
  // Component unmount cleanup
  useEffect(() => {
    const video = videoRef.current;
    
    return () => {
      if (video) {
        video.pause();
        video.muted = true;
        video.volume = 0;
        video.src = '';
        
        if (process.env.NODE_ENV === 'development') {
          console.log('🧹 VideoPlayer unmounted - cleaned up video');
        }
      }
      
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
          hlsRef.current = null;
        } catch (err) {
          // Ignore
        }
      }
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  // CRITICAL FIX: Use useLayoutEffect for SYNCHRONOUS pause/play control
  // Runs BEFORE browser paint, preventing any visual glitches or audio overlap
  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video || error) return;

    if (!isActive) {
      // ═══════════════════════════════════════════════════════════
      // INACTIVE: Stop ALL audio and video IMMEDIATELY & SYNCHRONOUSLY
      // ═══════════════════════════════════════════════════════════
      video.pause();
      video.muted = true;
      video.volume = 0;
      playingRef.current = false;
      
      try {
        video.currentTime = 0;
      } catch (err) {
        // Ignore - might not be seekable yet
      }
      
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
        } catch (err) {
          // Ignore errors
        }
      }
      
      video.dataset.active = 'false';
      
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸️ Video STOPPED (inactive) - synchronous pause');
      }
      return;
    }

    // ═══════════════════════════════════════════════════════════
    // ACTIVE: Setup and potentially play
    // ═══════════════════════════════════════════════════════════
    
    // First, pause ALL other videos on the page (global safety)
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
    
    video.dataset.active = 'true';
    video.muted = isMuted;
    video.volume = isMuted ? 0 : 1;
    
    if (hlsRef.current) {
      try {
        hlsRef.current.startLoad();
      } catch (err) {
        // Ignore errors
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('▶️ Video activated');
    }

    // Now handle play/pause
    if (!shouldPlay) {
      // User explicitly paused (keyboard shortcut) or video requires manual play
      video.pause();
      userPausedRef.current = true;
      setShowPlayButton(true);
      // Ensure loading spinner is hidden when paused and ready
      if (video.readyState >= 2) {
        setIsLoading(false);
      } else {
        // Wait for video to be ready, then hide loading
        const onReadyWhenPaused = () => {
          setIsLoading(false);
          setShowPlayButton(true);
        };
        video.addEventListener('canplay', onReadyWhenPaused, { once: true });
      }
      if (process.env.NODE_ENV === 'development') {
        console.log('⏸️ Video paused (shouldPlay=false)');
      }
      return;
    }

    // Should play - attempt playback
    userPausedRef.current = false;
    playingRef.current = true;
    playbackStartTimeRef.current = performance.now();
    
    const attemptPlay = () => {
      if (!playingRef.current || !isActive) return; // Double-check we should still play
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🎬 Attempting to play video', {
          readyState: video.readyState,
          paused: video.paused,
          currentTime: video.currentTime,
          muted: video.muted
        });
      }
      
      video.play()
        .then(() => {
          if (!isActive || !playingRef.current) {
            // Video became inactive during play attempt - pause it
            video.pause();
            return;
          }
          
          const startupTime = performance.now() - playbackStartTimeRef.current;
          reportVideoStartup(startupTime, shouldPreload);
          
          if (process.env.NODE_ENV === 'development') {
            const status = startupTime < 200 ? '✅' : '⚠️';
            console.log(`${status} Video playing! Startup: ${startupTime.toFixed(0)}ms`);
          }
          
          setShowPlayButton(false);
          setIsLoading(false);
          setShowPoster(false);
          
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        })
        .catch(err => {
          if (!isActive || !playingRef.current) return; // Became inactive - ignore error
          
          console.error('❌ Play failed:', {
            error: err.name,
            message: err.message,
            readyState: video.readyState,
            networkState: video.networkState,
            paused: video.paused
          });
          
          if (err.name === 'NotAllowedError') {
            // Browser requires user interaction
            console.log('⚠️ NotAllowedError - showing play button for user interaction');
            setShowPlayButton(true);
            setIsLoading(false);
            userPausedRef.current = true;
          } else if (video.readyState < 2) {
            // Video not ready - wait for canplay event
            console.log('⏳ Video not ready, waiting for canplay event...');
            const onCanPlay = () => {
              if (isActive && playingRef.current) {
                attemptPlay();
              }
            };
            video.addEventListener('canplay', onCanPlay, { once: true });
          } else {
            // Other error - show play button
            console.error('⚠️ Unknown play error, showing play button');
            setShowPlayButton(true);
            setIsLoading(false);
          }
        });
    };
    
    if (video.readyState >= 2) {
      // Video is ready - play immediately
      attemptPlay();
    } else {
      // Wait for video to be ready - use multiple event listeners for better coverage
      const onCanPlay = () => {
        if (isActive && playingRef.current) {
          attemptPlay();
        }
      };
      
      // Add multiple listeners to ensure we catch when video is ready
      video.addEventListener('canplay', onCanPlay, { once: true });
      video.addEventListener('loadeddata', onCanPlay, { once: true });
      
      // Also try to play on canplaythrough for smoother experience
      const onCanPlayThrough = () => {
        if (isActive && playingRef.current && video.paused) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🎬 Attempting play on canplaythrough');
          }
          attemptPlay();
        }
      };
      video.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
    }
    
  }, [isActive, isMuted, shouldPlay, error, shouldPreload]);

  // Auto-play when video URL changes and video is active
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isActive || !currentVideo?.url) return;
    
    // When a new video loads and becomes active, ensure autoplay
    const handleLoadedData = () => {
      if (isActive && shouldPlay && playingRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🎬 Auto-playing new video on loadeddata');
        }
        video.play().catch((err) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Autoplay on loadeddata failed:', err.message);
          }
        });
      }
    };
    
    video.addEventListener('loadeddata', handleLoadedData);
    
    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [currentVideo?.url, isActive, shouldPlay]);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      setShowPlayButton(false);
      setShowPoster(false);
    };

    const onPause = () => {
      setIsPlaying(false);
      // Only show play button if user manually paused (not programmatic)
      if (isActive && userPausedRef.current) {
        setShowPlayButton(true);
      }
    };

    const onLoadedMetadata = () => {
      setShowPoster(false);
      setIsLoading(false);
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };

    const onCanPlay = () => {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Video can play');
      }
      
      // Always hide loading spinner when video can play, even if paused
      setIsLoading(false);
      setShowPoster(false);
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      
      if (error) {
        reportVideoError(error, retryCount, true);
      } else {
        reportVideoLoaded();
      }
      
      setError(null);
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
      setIsLoading(false);
      setShowPoster(false);
      
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
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
      reportVideoError(errorType, retryCount, false);
      
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
    setRetryCount(0);
    setError(null);
    setShowPoster(false);
    setIsLoading(true);
  }, []);

  const handleVideoClick = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        userPausedRef.current = true;
      } else {
        videoRef.current.play();
        userPausedRef.current = false;
      }
      // Notify parent component of play/pause toggle
      if (onPlayPauseToggle) {
        onPlayPauseToggle();
      }
    }
  }, [isPlaying, onPlayPauseToggle]);

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
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
      {/* Control Buttons */}
      <div className="absolute top-4 right-4 z-50 flex gap-2">
        {castHash && authorUsername && (
          <button
            onClick={handleShare}
            className="w-11 h-11 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors active:scale-95"
            aria-label="Share video"
          >
            <Share2 className="w-5 h-5 text-white" />
          </button>
        )}
        
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
      
      {showShareToast && (
        <div className="absolute top-20 right-4 z-50 bg-black/80 text-white px-4 py-2 rounded-lg text-sm animate-fade-in">
          ✓ Link copied to clipboard
        </div>
      )}

      {showPoster && currentVideo.thumbnail && (
        <div className="absolute inset-0 z-10">
          <img
            src={currentVideo.thumbnail}
            alt="Video thumbnail"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      )}

      <video
        ref={videoRef}
        loop
        muted={isMuted}
        playsInline
        preload="auto"
        {...((isActive || shouldPreload) ? { fetchpriority: 'high' as const } : {})}
        className={`cursor-pointer ${isVerticalVideo ? 'w-full h-full object-cover' : 'max-w-full max-h-full object-contain'}`}
        style={{ 
          display: 'block',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          backgroundColor: '#000',
          visibility: showPoster ? 'hidden' : 'visible'
        }}
        onClick={handleVideoClick}
      />
      
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
      
      {isLoading && !showPoster && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10">
          <Icon icon="svg-spinners:ring-resize" className="w-12 h-12 text-white" />
        </div>
      )}

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

export default memo(VideoPlayer, (prevProps, nextProps) => {
  return (
    prevProps.videos[0]?.url === nextProps.videos[0]?.url &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isMuted === nextProps.isMuted &&
    prevProps.shouldPlay === nextProps.shouldPlay &&
    prevProps.castHash === nextProps.castHash
  );
});
