// src/app/lib/fetchInitialVideos.ts
// Server-side data fetching for SSR

import { promises as fs } from 'fs';
import path from 'path';
import { VideoFeedItem, NeynarFeedResponse, Cast, ProcessedVideo, VideoType } from '@/types/neynar';

// Configuration
const USE_LOCAL_DATA = process.env.NEXT_PUBLIC_USE_DUMMY_DATA === 'true';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/feed';

interface VideoFeedResponse {
  videos: VideoFeedItem[];
  nextCursor?: string;
  hasMore: boolean;
}

// Universal video parser (same as API route)
class UniversalVideoParser {
  static extractVideosFromCast(cast: Cast): ProcessedVideo[] {
    const videos: ProcessedVideo[] = [];

    for (const embed of cast.embeds) {
      if (!embed.url) continue;

      const videoInfo = this.detectVideoType(embed.url);
      if (videoInfo) {
        videos.push({
          url: embed.url,
          contentType: videoInfo.contentType,
          videoType: videoInfo.type,
          width: embed.metadata?.video?.width_px,
          height: embed.metadata?.video?.height_px,
          duration: embed.metadata?.video?.duration_s,
          thumbnail: embed.metadata?.image?.url,
        });
      }
      else if (embed.metadata?.video) {
        const videoUrl = embed.metadata.video.stream?.stream_url || 
                        embed.metadata.video.url || 
                        embed.url;
        
        if (videoUrl) {
          const videoInfo = this.detectVideoType(videoUrl);
          if (videoInfo) {
            videos.push({
              url: videoUrl,
              contentType: embed.metadata.video.content_type || videoInfo.contentType,
              videoType: videoInfo.type,
              width: embed.metadata.video.width_px,
              height: embed.metadata.video.height_px,
              duration: embed.metadata.video.duration_s,
              thumbnail: embed.metadata?.image?.url,
            });
          }
        }
      }
    }

    return videos;
  }

  private static detectVideoType(url: string): { type: VideoType; contentType: string } | null {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('.m3u8') || lowerUrl.includes('stream.farcaster.xyz')) {
      return { type: 'hls', contentType: 'application/vnd.apple.mpegurl' };
    }
    
    if (lowerUrl.endsWith('.mp4') || lowerUrl.includes('.mp4?') || lowerUrl.includes('.mp4#')) {
      return { type: 'mp4', contentType: 'video/mp4' };
    }
    
    if (lowerUrl.endsWith('.webm') || lowerUrl.includes('.webm?') || lowerUrl.includes('.webm#')) {
      return { type: 'webm', contentType: 'video/webm' };
    }
    
    if (lowerUrl.endsWith('.mov') || lowerUrl.includes('.mov?') || lowerUrl.includes('.mov#')) {
      return { type: 'mov', contentType: 'video/quicktime' };
    }
    
    if (lowerUrl.endsWith('.ogg') || lowerUrl.endsWith('.ogv') || lowerUrl.includes('.ogg?')) {
      return { type: 'ogg', contentType: 'video/ogg' };
    }

    return null;
  }
}

function processVideoFeed(casts: Cast[]): VideoFeedItem[] {
  const videoItems: VideoFeedItem[] = [];

  for (const cast of casts) {
    const videos = UniversalVideoParser.extractVideosFromCast(cast);
    
    if (videos.length > 0) {
      videoItems.push({
        id: cast.hash,
        cast,
        videos,
      });
    }
  }

  return videoItems;
}

async function fetchFromNeynar(limit: number = 25): Promise<NeynarFeedResponse> {
  if (!NEYNAR_API_KEY) {
    throw new Error('NEXT_PUBLIC_NEYNAR_API_KEY is not configured');
  }

  const url = new URL(NEYNAR_API_URL);
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'embed_types');
  url.searchParams.set('embed_types', 'video');
  url.searchParams.set('with_recasts', 'true');
  url.searchParams.set('limit', limit.toString());

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': NEYNAR_API_KEY,
      'x-neynar-experimental': 'false',
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Neynar API error: ${response.status}`);
  }

  return await response.json();
}

async function loadLocalData(limit: number = 25): Promise<Cast[]> {
  const dataPath = path.join(process.cwd(), 'data', 'casts-3.json');
  const fileContent = await fs.readFile(dataPath, 'utf-8');
  const data = JSON.parse(fileContent);
  const casts = data.casts || data;
  return casts.slice(0, limit);
}

/**
 * Fetch initial videos server-side for SSR
 * This enables the first video to render without JavaScript
 * Directly calls data logic instead of HTTP request to avoid SSR issues
 */
export async function fetchInitialVideos(): Promise<VideoFeedResponse> {
  try {
    const limit = 25; // Full first batch for position restoration
    
    if (USE_LOCAL_DATA) {
      // Load from local JSON
      const casts = await loadLocalData(limit);
      const videoItems = processVideoFeed(casts);
      
      return {
        videos: videoItems.slice(0, limit),
        nextCursor: undefined,
        hasMore: videoItems.length > limit,
      };
    } else {
      // Fetch from Neynar API
      const data = await fetchFromNeynar(limit);
      const videoItems = processVideoFeed(data.casts || []);
      
      return {
        videos: videoItems,
        nextCursor: data.next?.cursor,
        hasMore: !!data.next?.cursor,
      };
    }
  } catch (error) {
    console.error('❌ Error fetching initial videos (SSR):', error);
    
    // Fallback: return empty (client will fetch later)
    return {
      videos: [],
      hasMore: false,
    };
  }
}

