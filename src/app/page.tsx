// src/app/page.tsx
// Server Component with SSR for first video

import VideoFeed from "./components/VideoFeed";
import { fetchInitialVideos } from "./lib/fetchInitialVideos";

export default async function Home() {
  // Fetch initial videos server-side for SSR
  // This allows the first video to render without JavaScript
  const initialData = await fetchInitialVideos();
  
  // Get first video thumbnail for early preload
  const firstVideoThumbnail = initialData.videos[0]?.videos[0]?.thumbnail;

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
        <link rel="preload" href="/default-avatar.png" as="image" />
        <link rel="preload" href="/default-channel.png" as="image" />
        {firstVideoThumbnail && (
          <link rel="preload" href={firstVideoThumbnail} as="image" />
        )}
      </div>
    </main>
  );
}