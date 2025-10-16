
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { NeynarFeedResponse, VideoFeedItem, Cast, CastEmbed, ProcessedVideo } from '@/types/neynar';

// Configuration
const USE_LOCAL_DATA = process.env.NEXT_PUBLIC_USE_DUMMY_DATA === 'true';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;
const DEFAULT_FID = process.env.NEXT_PUBLIC_DEFAULT_FID || '9152';
const NEYNAR_API_URL = 'https://api.neynar.com/v2/farcaster/feed';

// HLS-ONLY video parser - simplified
class HLSVideoParser {
  static extractHLSVideosFromCast(cast: Cast): ProcessedVideo[] {
    const videos: ProcessedVideo[] = [];

    for (const embed of cast.embeds) {
      // Skip non-URL embeds
      if (!embed.url) continue;

      if (this.isHLSUrl(embed.url)) {
        console.log('✅ Found HLS video:', embed.url);
        
        videos.push({
          url: embed.url,
          contentType: 'application/vnd.apple.mpegurl',
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
        
        if (videoUrl && this.isHLSUrl(videoUrl)) {
          console.log('✅ Found HLS video in metadata:', videoUrl);
          
          videos.push({
            url: videoUrl,
            contentType: 'application/vnd.apple.mpegurl',
            width: embed.metadata.video.width_px,
            height: embed.metadata.video.height_px,
            duration: embed.metadata.video.duration_s,
            thumbnail: embed.metadata.image?.url,
          });
        }
      }
    }

    return videos;
  }

  private static isHLSUrl(url: string): boolean {
    // Simple check: does it end with .m3u8 or contain stream.farcaster.xyz?
    return url.includes('.m3u8') || url.includes('stream.farcaster.xyz');
  }
}

// Process casts and extract ONLY HLS videos
function processHLSVideoFeed(casts: Cast[]): VideoFeedItem[] {
  const videoItems: VideoFeedItem[] = [];

  console.log(`🔍 Processing ${casts.length} casts for HLS videos...`);

  for (const cast of casts) {
    const videos = HLSVideoParser.extractHLSVideosFromCast(cast);
    
    if (videos.length > 0) {
      console.log(`✅ Cast by @${cast.author.username} has ${videos.length} HLS video(s)`);
      videoItems.push({
        id: cast.hash,
        cast,
        videos,
      });
    }
  }

  console.log(`📊 Total HLS video items: ${videoItems.length}`);
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
  const filePath = path.join(process.cwd(), 'data', 'casts-1.json');
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
    const allVideoItems = processHLSVideoFeed(neynarData.casts || []);
    
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
      paginatedItems = allVideoItems.slice(startIndex, endIndex);
      hasMore = endIndex < allVideoItems.length;
      nextCursor = hasMore ? endIndex.toString() : undefined;
    } else {
      // For Neynar, return all found videos with original cursor
      paginatedItems = allVideoItems.slice(0, limit);
      nextCursor = neynarData.next?.cursor;
      hasMore = !!nextCursor;
    }

    console.log(`✅ Returning ${paginatedItems.length} HLS videos`);
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