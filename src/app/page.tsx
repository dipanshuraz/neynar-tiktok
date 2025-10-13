// src/app/page.tsx

import VideoFeed from "./components/VideoFeed";


export default function Home() {
  return (
    <main className="relative bg-black">
      {/* Full-screen video feed - no headers on mobile */}
      <VideoFeed />

      {/* Invisible preload hints for better performance */}
      <div className="hidden">
        <link rel="preload" href="/default-avatar.png" as="image" />
        <link rel="preload" href="/default-channel.png" as="image" />
      </div>
    </main>
  );
}