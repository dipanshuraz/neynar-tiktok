// src/components/VideoPlayer.tsx

'use client';

import { useEffect, useRef, useState } from 'react';
import { ProcessedVideo } from '@/types/neynar';
import { Play, Volume2, VolumeX } from 'lucide-react';

interface VideoPlayerProps {
  videos: ProcessedVideo[];
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  className?: string;
}

export default function VideoPlayer({ 
  videos, 
  isActive, 
  isMuted, 
  onMuteToggle, 
  className = '' 
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playerType, setPlayerType] = useState<'video' | 'iframe' | 'link'>('video');

  const currentVideo = videos[currentVideoIndex];

  // Determine player type
  useEffect(() => {
    if (!currentVideo) return;

    if (currentVideo.contentType === 'text/html') {
      if (isEmbeddableVideo(currentVideo.url)) {
        setPlayerType('iframe');
      } else {
        setPlayerType('link');
      }
    } else {
      setPlayerType('video');
    }
    
    setIsLoading(false);
    setError(null);
  }, [currentVideo]);

  // Auto play/pause based on visibility with performance optimization
  useEffect(() => {
    if (playerType !== 'video') return;
    
    const video = videoRef.current;
    if (!video) return;

    video.muted = isMuted;

    // Use requestAnimationFrame for smoother transitions
    const handleVideoState = () => {
      if (isActive) {
        // Preload video for smoother playback
        if (video.readyState < 2) {
          video.load();
        }
        
        video.play()
          .then(() => {
            setIsPlaying(true);
            setShowPlayButton(false);
          })
          .catch((err) => {
            console.error('Auto-play failed:', err);
            setIsPlaying(false);
            setShowPlayButton(true);
          });
      } else {
        video.pause();
        setIsPlaying(false);
      }
    };

    // Delay video operations slightly to avoid blocking scroll
    const timeoutId = setTimeout(handleVideoState, 16);
    
    return () => clearTimeout(timeoutId);
  }, [isActive, playerType, currentVideoIndex, isMuted]);

  // Handle video events
  useEffect(() => {
    if (playerType !== 'video') return;
    
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedData = () => {
      setIsLoading(false);
      setError(null);
    };

    const handleError = () => {
      setError('Failed to load video');
      setIsLoading(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      setShowPlayButton(false);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setShowPlayButton(true);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setShowPlayButton(true);
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('error', handleError);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
    };
  }, [playerType, currentVideoIndex]);

  const isEmbeddableVideo = (url: string): boolean => {
    return url.includes('youtube.com') || 
           url.includes('youtu.be') || 
           url.includes('vimeo.com');
  };

  const getEmbedUrl = (url: string): string => {
    if (url.includes('youtube.com/watch?v=')) {
      const videoId = url.split('v=')[1]?.split('&')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=${isActive ? 1 : 0}&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0`;
    }
    if (url.includes('youtu.be/')) {
      const videoId = url.split('youtu.be/')[1]?.split('?')[0];
      return `https://www.youtube.com/embed/${videoId}?autoplay=${isActive ? 1 : 0}&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0`;
    }
    
    if (url.includes('vimeo.com/')) {
      const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
      return `https://player.vimeo.com/video/${videoId}?autoplay=${isActive ? 1 : 0}&muted=${isMuted ? 1 : 0}&controls=0`;
    }
    
    return url;
  };

  const togglePlay = () => {
    if (playerType !== 'video') return;
    
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch((err) => {
        console.error('Play failed:', err);
      });
    }
  };

  const handleVideoClick = () => {
    togglePlay();
  };

  // Loading state
  if (isLoading) {
    return (
      <div className={`relative bg-black flex items-center justify-center ${className}`}>
        <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
      </div>
    );
  }

  // Error state
  if (error || !currentVideo) {
    return (
      <div className={`relative bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-white text-center p-8">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-sm opacity-75 mb-4">
            {error || 'Video unavailable'}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-white/20 rounded-lg text-sm hover:bg-white/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Mute/Unmute Button - Top Right */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMuteToggle();
        }}
        className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-black/70 transition-colors"
      >
        {isMuted ? (
          <VolumeX className="w-5 h-5 text-white" />
        ) : (
          <Volume2 className="w-5 h-5 text-white" />
        )}
      </button>

      {/* Video Player */}
      {playerType === 'video' && (
        <>
          <video
            ref={videoRef}
            src={currentVideo.url}
            poster={currentVideo.thumbnail}
            loop
            muted={isMuted}
            playsInline
            preload="metadata"
            className="w-full h-full object-cover cursor-pointer"
            onClick={handleVideoClick}
            style={{
              // Hardware acceleration for smooth playback
              transform: 'translateZ(0)',
              willChange: isPlaying ? 'transform' : 'auto'
            }}
          />
          
          {/* Play Button Overlay - Only show when paused */}
          {showPlayButton && (
            <div 
              className="absolute inset-0 flex items-center justify-center cursor-pointer"
              onClick={handleVideoClick}
            >
              <div className="w-16 h-16 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Play className="w-8 h-8 text-white fill-white ml-1" />
              </div>
            </div>
          )}
        </>
      )}

      {/* Embedded Video */}
      {playerType === 'iframe' && (
        <iframe
          ref={iframeRef}
          src={getEmbedUrl(currentVideo.url)}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* External Link */}
      {playerType === 'link' && (
        <div 
          className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center cursor-pointer"
          style={{
            backgroundImage: currentVideo.thumbnail ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.7)), url(${currentVideo.thumbnail})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          onClick={() => window.open(currentVideo.url, '_blank')}
        >
          <div className="text-center">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <Play className="w-8 h-8 text-white fill-white ml-1" />
            </div>
            <p className="text-white text-sm font-medium">Tap to watch</p>
            <p className="text-white/70 text-xs mt-1">Opens in new tab</p>
          </div>
        </div>
      )}

      {/* Multiple Videos Indicator */}
      {videos.length > 1 && (
        <div className="absolute top-4 left-4 bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
          <span className="text-white text-xs font-medium">
            {currentVideoIndex + 1}/{videos.length}
          </span>
        </div>
      )}
    </div>
  );
}