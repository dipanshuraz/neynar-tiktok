// src/app/lib/fetchInitialVideos.ts
// Server-side data fetching for SSR

import { VideoFeedItem } from '@/types/neynar';
import { promises as fs } from 'fs';
import path from 'path';

// Environment check
const USE_LOCAL_DATA = process.env.NEXT_PUBLIC_USE_DUMMY_DATA === 'true';

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
    // For local development, use cached data
    if (USE_LOCAL_DATA) {
      const filePath = path.join(process.cwd(), 'data', 'casts.json');
      const fileContents = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContents);
      
      return {
        videos: data.videos || [],
        nextCursor: data.nextCursor,
        hasMore: data.hasMore || false,
      };
    }

    // For production, fetch from API route
    // Use the full URL since we're on the server
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/feed`, {
      // Use cache for SSR, but revalidate
      next: { revalidate: 60 }, // Revalidate every 60 seconds
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch videos: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching initial videos:', error);
    
    // Fallback: Try to use cached data
    try {
      const filePath = path.join(process.cwd(), 'data', 'casts.json');
      const fileContents = await fs.readFile(filePath, 'utf8');
      const data = JSON.parse(fileContents);
      
      return {
        videos: data.videos || [],
        nextCursor: data.nextCursor,
        hasMore: data.hasMore || false,
      };
    } catch (fallbackError) {
      // Last resort: return empty
      console.error('Fallback also failed:', fallbackError);
      return {
        videos: [],
        hasMore: false,
      };
    }
  }
}

