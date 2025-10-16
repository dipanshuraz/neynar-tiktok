
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
        console.log(`✅ Found ${videoInfo.type.toUpperCase()} video:`, embed.url);
        
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
            console.log(`✅ Found ${videoInfo.type.toUpperCase()} video in metadata:`, videoUrl);
            
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

  console.log(`🔍 Processing ${casts.length} casts for videos (all formats)...`);

  for (const cast of casts) {
    const videos = UniversalVideoParser.extractVideosFromCast(cast);
    
    if (videos.length > 0) {
      const types = videos.map(v => v.videoType.toUpperCase()).join(', ');
      console.log(`✅ Cast by @${cast.author.username} has ${videos.length} video(s): ${types}`);
      videoItems.push({
        id: cast.hash,
        cast,
        videos,
      });
    }
  }

  console.log(`📊 Total video items: ${videoItems.length}`);
  return videoItems;
}

async function fetchFromNeynar(cursor?: string, fid?: string): Promise<NeynarFeedResponse> {
  if (!NEYNAR_API_KEY) {
    throw new Error('NEXT_PUBLIC_NEYNAR_API_KEY is not configured');
  }

  const url = new URL(NEYNAR_API_URL);
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'global_trending');
  url.searchParams.set('with_recasts', 'true');
  url.searchParams.set('limit', '100'); // Fetch more to find HLS videos
  url.searchParams.set('fid', fid || DEFAULT_FID);
  
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  console.log(`🌐 Fetching from Neynar...`);

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

  const data = await response.json();
  console.log(`✅ Fetched ${data.casts?.length || 0} casts from Neynar`);
  
  return data;
}

async function fetchFromLocal(fid?: string): Promise<NeynarFeedResponse> {
  const filePath = path.join(process.cwd(), 'data', 'casts-2.json');
  const fileContents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContents);
  console.log(`✅ Loaded ${data.casts?.length || 0} casts from local file`);
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const fid = searchParams.get('fid') || undefined;
    const limit = parseInt(searchParams.get('limit') || '25');
    
    console.log(`\n📡 === Feed API Request ===`);
    console.log(`Mode: ${USE_LOCAL_DATA ? 'LOCAL' : 'NEYNAR'}`);
    console.log(`FID: ${fid || DEFAULT_FID}`);
    console.log(`Cursor: ${cursor || 'none'}`);
    console.log(`Limit: ${limit}`);
    
    const neynarData = USE_LOCAL_DATA 
      ? await fetchFromLocal(fid) 
      : await fetchFromNeynar(cursor, fid);

    // Extract ONLY HLS videos
    const allVideoItems = processVideoFeed(neynarData.casts || []);
    
    if (allVideoItems.length === 0) {
      console.warn('⚠️ No HLS videos found in the feed');
      
      // Log sample cast to help debug
      if (neynarData.casts && neynarData.casts.length > 0) {
        const sampleCast = neynarData.casts[0];
        console.log('📝 Sample cast structure:', {
          author: sampleCast.author.username,
          embedsCount: sampleCast.embeds.length,
          firstEmbed: sampleCast.embeds[0],
        });
      }
      
      return NextResponse.json({
        videos: [],
        nextCursor: undefined,
        hasMore: false,
        totalFound: 0,
        message: 'No HLS (.m3u8) videos found. Try a different feed or check your data.'
      });
    }

    // Pagination
    let paginatedItems = allVideoItems;
    let nextCursor: string | undefined;
    let hasMore = false;

    if (USE_LOCAL_DATA) {
      // Simple pagination for local data
      const startIndex = cursor ? parseInt(cursor) : 0;
      const endIndex = startIndex + limit;
      console.log(`📄 Pagination: startIndex=${startIndex}, endIndex=${endIndex}, total=${allVideoItems.length}, limit=${limit}`);
      paginatedItems = allVideoItems.slice(startIndex, endIndex);
      hasMore = endIndex < allVideoItems.length;
      nextCursor = hasMore ? endIndex.toString() : undefined;
      console.log(`✂️ After slice: ${paginatedItems.length} items`);
    } else {
      // For Neynar, return all found videos with original cursor
      paginatedItems = allVideoItems.slice(0, limit);
      nextCursor = neynarData.next?.cursor;
      hasMore = !!nextCursor;
    }

    console.log(`✅ Returning ${paginatedItems.length} videos (out of ${allVideoItems.length} total)`);
    console.log(`Has more: ${hasMore}`);
    
    // Log first video for debugging
    if (paginatedItems.length > 0) {
      const firstVideo = paginatedItems[0];
      console.log('📹 First video:', {
        author: firstVideo.cast.author.username,
        videoCount: firstVideo.videos.length,
        firstUrl: firstVideo.videos[0]?.url,
      });
    }
    
    return NextResponse.json({
      videos: paginatedItems,
      nextCursor,
      hasMore,
      totalFound: paginatedItems.length,
      totalAvailable: allVideoItems.length,
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