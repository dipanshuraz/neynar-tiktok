// src/app/lib/fetchInitialVideos.ts
// Server-side data fetching for SSR

import { VideoFeedItem } from '@/types/neynar';

interface VideoFeedResponse {
  videos: VideoFeedItem[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Fetch initial videos server-side for SSR
 * This enables the first video to render without JavaScript
 */
export async function fetchInitialVideos(): Promise<VideoFeedResponse> {
  try {
    // Always fetch from API route (which handles local vs. remote data)
    // Use the full URL since we're on the server
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/feed?limit=1`, {
      next: { revalidate: 60 }, // Revalidate every 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch videos: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching initial videos (SSR):', error);
    
    // Fallback: return empty (client will fetch later)
    return {
      videos: [],
      hasMore: false,
    };
  }
}

