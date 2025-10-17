
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { NeynarFeedResponse, VideoFeedItem, Cast, CastEmbed, ProcessedVideo, VideoType } from '@/types/neynar';

// Configuration
const USE_LOCAL_DATA = process.env.NEXT_PUBLIC_USE_DUMMY_DATA === 'true';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
const DEFAULT_FID = process.env.NEXT_PUBLIC_DEFAULT_FID || '9152';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/feed';

class UniversalVideoParser {
  static extractVideosFromCast(cast: Cast): ProcessedVideo[] {
    const videos: ProcessedVideo[] = [];

    for (const embed of cast.embeds) {
      if (!embed.url) continue;

      const videoInfo = this.detectVideoType(embed.url);
      if (videoInfo) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Found ${videoInfo.type.toUpperCase()} video:`, embed.url);
        }
        
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
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Found ${videoInfo.type.toUpperCase()} video in metadata:`, videoUrl);
            }
            
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

  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 Processing ${casts.length} casts for videos (all formats)...`);
  }

  for (const cast of casts) {
    const videos = UniversalVideoParser.extractVideosFromCast(cast);
    
    if (videos.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        const types = videos.map(v => v.videoType.toUpperCase()).join(', ');
        console.log(`✅ Cast by @${cast.author.username} has ${videos.length} video(s): ${types}`);
      }
      videoItems.push({
        id: cast.hash,
        cast,
        videos,
      });
    }
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`📊 Total video items: ${videoItems.length}`);
  }
  return videoItems;
}

async function fetchFromNeynar(cursor?: string, limit: number = 25): Promise<NeynarFeedResponse> {
  if (!NEYNAR_API_KEY) {
    throw new Error('NEXT_PUBLIC_NEYNAR_API_KEY is not configured');
  }

  const url = new URL(NEYNAR_API_URL);
  
  // Use embed_types filter to get only video content
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'embed_types');
  url.searchParams.set('embed_types', 'video');
  url.searchParams.set('members_only', 'true'); // Only show casts from Farcaster members
  url.searchParams.set('with_recasts', 'true');
  url.searchParams.set('limit', limit.toString());
  
  if (cursor) {
    url.searchParams.set('cursor', cursor);
    if (process.env.NODE_ENV === 'development') {
      console.log(`🌐 Fetching from Neynar with cursor: ${cursor.substring(0, 20)}...`);
    }
  } else {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🌐 Fetching initial videos from Neynar (limit: ${limit})...`);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': NEYNAR_API_KEY,
      'x-neynar-experimental': 'false',
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Neynar API error: ${response.status} - ${errorText}`);
    throw new Error(`Neynar API error: ${response.status}`);
  }

  const data = await response.json();
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ Fetched ${data.casts?.length || 0} video casts from Neynar`);
    
    if (data.next?.cursor) {
      console.log(`📄 Next cursor available: ${data.next.cursor.substring(0, 20)}...`);
    } else {
      console.log(`🏁 No more videos available`);
    }
  }
  
  return data;
}

async function fetchFromLocal(fid?: string): Promise<NeynarFeedResponse> {
  const filePath = path.join(process.cwd(), 'data', 'casts-3.json');
  const fileContents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContents);
  if (process.env.NODE_ENV === 'development') {
    console.log(`✅ Loaded ${data.casts?.length || 0} casts from local file`);
  }
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25');
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`\n📡 === Feed API Request ===`);
      console.log(`Mode: ${USE_LOCAL_DATA ? 'LOCAL' : 'NEYNAR'}`);
      console.log(`Cursor: ${cursor || 'none'}`);
      console.log(`Limit: ${limit}`);
    }
    
    const neynarData = USE_LOCAL_DATA 
      ? await fetchFromLocal() 
      : await fetchFromNeynar(cursor, limit);

    // Extract videos from casts (all video formats)
    const allVideoItems = processVideoFeed(neynarData.casts || []);
    
    if (allVideoItems.length === 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ No videos found in the feed');
        
        // Log sample cast to help debug
        if (neynarData.casts && neynarData.casts.length > 0) {
          const sampleCast = neynarData.casts[0];
          console.log('📝 Sample cast structure:', {
            author: sampleCast.author.username,
            embedsCount: sampleCast.embeds.length,
            firstEmbed: sampleCast.embeds[0],
          });
        }
      }
      
      return NextResponse.json({
        videos: [],
        nextCursor: undefined,
        hasMore: false,
        totalFound: 0,
        message: USE_LOCAL_DATA 
          ? 'No videos found in local data. Try using NEXT_PUBLIC_USE_DUMMY_DATA=false for real API.'
          : 'No videos found. The Neynar API might be returning empty results.'
      });
    }

    // Pagination handling
    let paginatedItems = allVideoItems;
    let nextCursor: string | undefined;
    let hasMore = false;

    if (USE_LOCAL_DATA) {
      // Simple index-based pagination for local data
      const startIndex = cursor ? parseInt(cursor) : 0;
      const endIndex = startIndex + limit;
      if (process.env.NODE_ENV === 'development') {
        console.log(`📄 Local pagination: ${startIndex} to ${endIndex} of ${allVideoItems.length}`);
      }
      paginatedItems = allVideoItems.slice(startIndex, endIndex);
      hasMore = endIndex < allVideoItems.length;
      nextCursor = hasMore ? endIndex.toString() : undefined;
    } else {
      // For Neynar API, use the cursor from the response
      // Since we're using embed_types=video filter, all results should already be videos
      paginatedItems = allVideoItems;
      nextCursor = neynarData.next?.cursor;
      hasMore = !!nextCursor;
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 Neynar pagination details:`);
        console.log(`   - Requested limit: ${limit}`);
        console.log(`   - Casts returned: ${neynarData.casts?.length || 0}`);
        console.log(`   - Videos extracted: ${allVideoItems.length}`);
        console.log(`   - Next cursor present: ${!!nextCursor}`);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Returning ${paginatedItems.length} videos`);
      console.log(`📄 Next cursor: ${nextCursor ? nextCursor.substring(0, 20) + '...' : 'none'}`);
      console.log(`🔄 Has more: ${hasMore}`);
      
      // Log first video for debugging
      if (paginatedItems.length > 0) {
        const firstVideo = paginatedItems[0];
        console.log('📹 First video:', {
          author: firstVideo.cast.author.username,
          videoCount: firstVideo.videos.length,
          videoType: firstVideo.videos[0]?.videoType,
          url: firstVideo.videos[0]?.url?.substring(0, 50) + '...',
        });
      }
    }
    
    return NextResponse.json({
      videos: paginatedItems,
      nextCursor,
      hasMore,
      totalFound: paginatedItems.length,
    });
    
  } catch (error) {
    console.error('❌ Feed API error:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch video feed',
        details: error instanceof Error ? error.message : 'Unknown error',
        mode: USE_LOCAL_DATA ? 'local' : 'neynar',
      },
      { status: 500 }
    );
  }
}

// Health check
export async function POST() {
  const mode = USE_LOCAL_DATA ? 'LOCAL' : 'NEYNAR';
  const apiKeyConfigured = !!NEYNAR_API_KEY;
  
  return NextResponse.json({
    status: 'healthy',
    mode,
    apiKeyConfigured: mode === 'NEYNAR' ? apiKeyConfigured : true,
    hlsOnly: true,
    timestamp: new Date().toISOString(),
  });
}