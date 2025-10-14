// src/components/VideoPlayer.tsx - FIXED VERSION

'use client';

import { useEffect, useRef, useState } from 'react';
import { ProcessedVideo } from '@/types/neynar';
import { Play, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import Hls from 'hls.js';

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
  const hlsRef = useRef<Hls | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const currentVideo = videos?.[0];

  // Setup HLS - SIMPLIFIED, no isMounted check
  useEffect(() => {
    if (!videoRef.current || !currentVideo?.url) {
      console.log('⏳ Waiting for video element...', { 
        hasRef: !!videoRef.current, 
        hasUrl: !!currentVideo?.url 
      });
      return;
    }

    const video = videoRef.current;
    const videoUrl = currentVideo.url;

    console.log('🎬 Setting up HLS for:', videoUrl);
    setIsLoading(true);
    setError(null);

    // Clean up previous
    if (hlsRef.current) {
      console.log('🧹 Destroying previous HLS');
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Safari native HLS
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      console.log('✅ Using native HLS (Safari)');
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

    console.log('✅ Creating HLS.js instance');
    const hls = new Hls({
      debug: true,
      enableWorker: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
    });

    hlsRef.current = hls;

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('📺 Media attached - loading source');
      hls.loadSource(videoUrl);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('✅ MANIFEST PARSED SUCCESS!');
      setIsLoading(false);
      setError(null);
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS Error:', data);
      if (data.fatal) {
        setError(`HLS Error: ${data.details}`);
        setIsLoading(false);
      }
    });

    console.log('🔗 Attaching media to video element');
    hls.attachMedia(video);

    return () => {
      console.log('🧹 Cleanup HLS');
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [currentVideo?.url]); // Only depend on URL change

  // Playback control
  useEffect(() => {
    const video = videoRef.current;
    
    if (!video || isLoading || error) {
      return;
    }

    video.muted = isMuted;

    if (isActive) {
      console.log('▶️ ATTEMPTING TO PLAY');
      video.play()
        .then(() => {
          console.log('✅ PLAYING!');
          setShowPlayButton(false);
        })
        .catch(err => {
          console.warn('⚠️ Play failed:', err.message);
          setShowPlayButton(true);
        });
    } else {
      console.log('⏸️ PAUSING');
      video.pause();
    }
  }, [isActive, isMuted, isLoading, error]);

  // Video events
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      console.log('🎬 Video playing event');
      setIsPlaying(true);
      setShowPlayButton(false);
    };

    const onPause = () => {
      console.log('⏸️ Video pause event');
      setIsPlaying(false);
    };

    const onLoadedMetadata = () => {
      console.log('📊 Video metadata loaded');
    };

    const onCanPlay = () => {
      console.log('✅ Video can play');
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

  return (
    <div className={`relative bg-black ${className}`}>
      {/* Mute Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onMuteToggle();
        }}
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
        preload="auto"
        className="w-full h-full object-cover cursor-pointer"
        style={{ display: isLoading ? 'none' : 'block' }}
        onClick={() => {
          if (videoRef.current) {
            if (isPlaying) videoRef.current.pause();
            else videoRef.current.play();
          }
        }}
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