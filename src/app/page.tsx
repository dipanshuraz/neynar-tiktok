// src/app/page.tsx
// Server Component with SSR for first video

import VideoFeed from "./components/VideoFeed";
import { fetchInitialVideos } from "./lib/fetchInitialVideos";

export default async function Home() {
  // Fetch initial videos server-side for SSR
  // This allows the first video to render without JavaScript
  const initialData = await fetchInitialVideos();
  
  // Get first video info for preloading
  const firstVideo = initialData.videos[0]?.videos[0];
  const firstVideoUrl = firstVideo?.url;
  const firstVideoThumbnail = firstVideo?.thumbnail;
  const isHLS = firstVideo?.videoType === 'hls';

  return (
    <main className="relative bg-black">
      {/* Full-screen video feed - first video rendered server-side */}
      <VideoFeed 
        initialVideos={initialData.videos}
        initialCursor={initialData.nextCursor}
        initialHasMore={initialData.hasMore}
      />

      {/* Resource hints for better performance */}
      <div className="hidden">
        {/* Preload HLS.js module for instant video playback */}
        {isHLS && (
          <link rel="modulepreload" href="/_next/static/chunks/hls.js" />
        )}
        
        {/* Preload first video URL */}
        {firstVideoUrl && (
          <link rel="preload" href={firstVideoUrl} as={isHLS ? 'fetch' : 'video'} />
        )}
        
        {/* Preload first video thumbnail for LCP */}
        {firstVideoThumbnail && (
          <link rel="preload" href={firstVideoThumbnail} as="image" fetchPriority="high" />
        )}
        
        <link rel="preload" href="/default-avatar.png" as="image" />
        <link rel="preload" href="/default-channel.png" as="image" />
      </div>
    </main>
  );
}