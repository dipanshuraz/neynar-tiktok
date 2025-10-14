// src/app/test/page.tsx

'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle, Clock, ExternalLink, Play, Pause } from 'lucide-react';
import Hls from 'hls.js';

interface TestResult {
  url: string;
  type: string;
  status: 'loading' | 'success' | 'error';
  error?: string;
  metadata?: any;
}

export default function VideoTestPage() {
  const [apiData, setApiData] = useState<any>(null);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Test video URLs
  const testVideos = [
    {
      url: 'https://stream.farcaster.xyz/v1/video/0199d3df-3f82-f194-d7c3-057aad887a73.m3u8',
      type: 'HLS Stream from Farcaster',
      contentType: 'application/vnd.apple.mpegurl'
    },
    {
      url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      type: 'Test HLS Stream (Mux)',
      contentType: 'application/vnd.apple.mpegurl'
    },
    {
      url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      type: 'Test HLS Stream (Unified Streaming)',
      contentType: 'application/vnd.apple.mpegurl'
    }
  ];

  // Fetch API data
  useEffect(() => {
    async function fetchApiData() {
      try {
        setLoading(true);
        const response = await fetch('/api/feed');
        
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setApiData(data);
        
        // Extract video URLs for testing
        const videoUrls = data.videos?.flatMap((item: any) => 
          item.videos.map((v: any) => ({
            url: v.url,
            type: `Cast by @${item.cast.author.username}`,
            contentType: v.contentType || 'application/vnd.apple.mpegurl'
          }))
        ) || [];
        
        // Test all videos
        testVideoUrls([...testVideos, ...videoUrls.slice(0, 10)]);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchApiData();
  }, []);

  // Test video URLs
  const testVideoUrls = (videos: any[]) => {
    const results: TestResult[] = videos.map(v => ({
      url: v.url,
      type: v.type,
      status: 'loading' as const
    }));
    
    setTestResults(results);

    videos.forEach(async (video, index) => {
      try {
        // Test with a simple HEAD request
        const response = await fetch(video.url, { 
          method: 'HEAD',
          mode: 'cors'
        });

        if (response.ok) {
          setTestResults(prev => prev.map((result, i) => 
            i === index 
              ? { 
                  ...result, 
                  status: 'success' as const, 
                  metadata: { 
                    accessible: true,
                    contentType: response.headers.get('content-type')
                  } 
                }
              : result
          ));
        } else {
          throw new Error(`HTTP ${response.status}`);
        }

      } catch (err) {
        // Try alternative check - just mark as unknown
        setTestResults(prev => prev.map((result, i) => 
          i === index 
            ? { 
                ...result, 
                status: 'error' as const, 
                error: err instanceof Error ? err.message : 'Cannot verify accessibility' 
              }
            : result
        ));
      }
    });
  };

  // Setup HLS player
  useEffect(() => {
    if (!selectedVideo || !videoRef.current) return;

    const video = videoRef.current;
    
    // Clean up previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    console.log('🎬 Setting up player for:', selectedVideo);

    // Check if it's an HLS stream
    const isHLS = selectedVideo.includes('.m3u8');

    if (isHLS) {
      // Check for native HLS support (Safari)
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        console.log('✅ Using native HLS support (Safari)');
        video.src = selectedVideo;
      } 
      // Use HLS.js for other browsers
      else if (Hls.isSupported()) {
        console.log('✅ Using HLS.js');
        const hls = new Hls({
          debug: true,
          enableWorker: true,
          lowLatencyMode: false,
        });

        hlsRef.current = hls;

        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          console.log('📺 Media attached');
          hls.loadSource(selectedVideo);
        });

        hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
          console.log('📋 Manifest parsed:', data);
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('❌ HLS Error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.log('Network error, retrying...');
                hls.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.log('Media error, recovering...');
                hls.recoverMediaError();
                break;
              default:
                console.error('Fatal error, cannot recover');
                break;
            }
          }
        });

        hls.attachMedia(video);
      } else {
        console.error('❌ HLS not supported');
      }
    } else {
      // Regular video
      video.src = selectedVideo;
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedVideo]);

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'loading': return <Clock className="w-5 h-5 text-yellow-500 animate-spin" />;
      case 'success': return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'error': return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Video Test Page</h1>
          <div className="flex items-center space-x-3">
            <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span>Loading API data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8" data-page="test">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">HLS Video Test & Debug Page</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-6">
            {/* API Status */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">API Status</h2>
              
              {error ? (
                <div className="flex items-start space-x-3 text-red-400">
                  <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">API Error</p>
                    <p className="text-sm opacity-80">{error}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start space-x-3 text-green-400">
                  <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium">API Working</p>
                    <p className="text-sm opacity-80">
                      Found {apiData?.videos?.length || 0} video items
                    </p>
                    {apiData?.message && (
                      <p className="text-sm opacity-80 mt-1">{apiData.message}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Browser Capabilities */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Browser Capabilities</h2>
              
              <div className="space-y-3">
                <h3 className="font-medium text-sm text-gray-400">HLS Support</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    {Hls.isSupported() ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span>HLS.js Supported: {Hls.isSupported() ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {(() => {
                      const video = document.createElement('video');
                      const canPlay = video.canPlayType('application/vnd.apple.mpegurl');
                      return (
                        <>
                          {canPlay ? (
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                          )}
                          <span>Native HLS: {canPlay ? 'Yes (Safari)' : 'No (will use HLS.js)'}</span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="flex items-center space-x-2">
                    {'MediaSource' in window ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span>MediaSource API: {'MediaSource' in window ? 'Yes' : 'No'}</span>
                  </div>
                </div>

                <h3 className="font-medium text-sm text-gray-400 mt-4">Other Features</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span>Browser: {navigator.userAgent.match(/(Chrome|Safari|Firefox|Edge)/)?.[0] || 'Unknown'}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {navigator.onLine ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span>Network: {navigator.onLine ? 'Online' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Video Test Results */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Video Accessibility Tests</h2>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {testResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedVideo(result.url)}
                    className={`w-full flex items-start space-x-3 p-3 rounded-lg transition-colors text-left ${
                      selectedVideo === result.url
                        ? 'bg-blue-600'
                        : 'bg-gray-800 hover:bg-gray-700'
                    }`}
                  >
                    {getStatusIcon(result.status)}
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{result.type}</p>
                      <p className="text-xs text-gray-400 truncate">{result.url}</p>
                      {result.status === 'error' && result.error && (
                        <p className="text-red-400 text-xs mt-1">{result.error}</p>
                      )}
                    </div>
                    
                    <ExternalLink 
                      className="w-4 h-4 flex-shrink-0 opacity-50 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(result.url, '_blank');
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Video Player */}
          <div className="space-y-6">
            {/* Video Player */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">HLS Video Player</h2>
              
              {selectedVideo ? (
                <div className="space-y-4">
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={videoRef}
                      className="w-full h-full"
                      controls
                      playsInline
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onError={(e) => {
                        const video = e.target as HTMLVideoElement;
                        const error = video.error;
                        console.error('Video error:', error);
                      }}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handlePlayPause}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center space-x-2 transition-colors"
                    >
                      {isPlaying ? (
                        <>
                          <Pause className="w-4 h-4" />
                          <span>Pause</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          <span>Play</span>
                        </>
                      )}
                    </button>
                    
                    <button
                      onClick={() => window.open(selectedVideo, '_blank')}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center space-x-2 transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Open Direct</span>
                    </button>
                  </div>

                  <div className="text-xs bg-black p-3 rounded">
                    <p className="text-gray-400 mb-1">Current URL:</p>
                    <p className="text-white break-all">{selectedVideo}</p>
                  </div>
                </div>
              ) : (
                <div className="aspect-video bg-gray-800 rounded-lg flex items-center justify-center">
                  <p className="text-gray-400">Select a video from the list to test playback</p>
                </div>
              )}
            </div>

            {/* Debug Console */}
            <div className="bg-gray-900 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Debug Info</h2>
              
              <div className="space-y-2 text-xs">
                <div className="bg-black p-3 rounded">
                  <p className="text-gray-400">HLS.js Version:</p>
                  <p className="text-white">{Hls.version || 'N/A'}</p>
                </div>
                
                <div className="bg-black p-3 rounded">
                  <p className="text-gray-400">HLS.js Supported:</p>
                  <p className="text-white">{Hls.isSupported() ? 'Yes ✅' : 'No ❌'}</p>
                </div>

                <div className="bg-black p-3 rounded">
                  <p className="text-gray-400">Selected Video Type:</p>
                  <p className="text-white">
                    {selectedVideo?.includes('.m3u8') ? 'HLS Stream (.m3u8)' : selectedVideo ? 'Regular Video' : 'None'}
                  </p>
                </div>

                {apiData && (
                  <div className="bg-black p-3 rounded">
                    <p className="text-gray-400 mb-1">API Response:</p>
                    <pre className="text-white overflow-auto max-h-32">
                      {JSON.stringify({
                        totalVideos: apiData.videos?.length,
                        hasMore: apiData.hasMore,
                        message: apiData.message
                      }, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 p-4 bg-blue-900/20 border border-blue-500/20 rounded-lg">
          <h3 className="font-medium text-blue-200 mb-2">How to use this test page:</h3>
          <ul className="text-sm text-blue-100 space-y-1">
            <li>• Check if HLS.js is supported in your browser</li>
            <li>• Verify that your API is returning HLS video URLs</li>
            <li>• Click on any video in the list to test playback</li>
            <li>• The player will use HLS.js (Chrome, Firefox) or native HLS (Safari)</li>
            <li>• Check the browser console (F12) for detailed logs</li>
            <li>• Green checkmarks = working, Red/Yellow = issues</li>
          </ul>
        </div>
      </div>
    </div>
  );
}