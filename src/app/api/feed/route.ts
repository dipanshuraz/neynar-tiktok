// src/app/api/feed/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { NeynarFeedResponse, VideoFeedItem, Cast, CastEmbed, ProcessedVideo } from '@/types/neynar';

// Comprehensive video detection and parsing
class VideoParser {
  private static readonly VIDEO_EXTENSIONS = [
    '.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.3gp', '.flv', '.wmv', '.ogv'
  ];

  private static readonly VIDEO_DOMAINS = [
    'youtube.com', 'youtu.be', 'vimeo.com', 'dailymotion.com', 'twitch.tv',
    'twitter.com', 'x.com', 'instagram.com', 'tiktok.com', 'imgur.com',
    'streamable.com', 'warpcast.com', 'farcaster.xyz'
  ];

  static extractVideosFromCast(cast: Cast): ProcessedVideo[] {
    const videos: ProcessedVideo[] = [];

    for (const embed of cast.embeds) {
      const extractedVideos = this.extractVideosFromEmbed(embed);
      videos.push(...extractedVideos);
    }

    return videos;
  }

  private static extractVideosFromEmbed(embed: CastEmbed): ProcessedVideo[] {
    const videos: ProcessedVideo[] = [];

    // 1. Direct video metadata
    if (embed.metadata?.video) {
      const video = embed.metadata.video;
      videos.push({
        url: video.stream?.stream_url || video.url,
        contentType: video.content_type,
        width: video.width_px,
        height: video.height_px,
        duration: video.duration_s,
        thumbnail: embed.metadata.image?.url,
      });
    }

    // 2. Direct video URLs
    if (embed.url && this.isDirectVideoUrl(embed.url)) {
      videos.push({
        url: embed.url,
        contentType: this.getContentTypeFromUrl(embed.url),
      });
    }

    // 3. Platform video URLs
    if (embed.url && this.isVideoFromSupportedPlatform(embed.url)) {
      videos.push({
        url: embed.url,
        contentType: 'text/html', // Indicates it needs iframe/embedding
        thumbnail: embed.metadata?.image?.url,
      });
    }

    // 4. Check for video content in HTML metadata
    if (embed.metadata?.html && embed.url) {
      const hasVideoIndicators = this.hasVideoIndicatorsInHtml(embed.metadata.html);
      if (hasVideoIndicators) {
        videos.push({
          url: embed.url,
          contentType: 'text/html',
          thumbnail: embed.metadata.html.image || embed.metadata.image?.url,
        });
      }
    }

    return videos;
  }

  private static isDirectVideoUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      return this.VIDEO_EXTENSIONS.some(ext => pathname.includes(ext));
    } catch {
      return false;
    }
  }

  private static isVideoFromSupportedPlatform(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      
      return this.VIDEO_DOMAINS.some(domain => 
        hostname.includes(domain.toLowerCase())
      ) || this.isSpecialVideoUrl(url);
    } catch {
      return false;
    }
  }

  private static isSpecialVideoUrl(url: string): boolean {
    // Twitter/X video patterns
    if (url.includes('twitter.com') || url.includes('x.com')) {
      return url.includes('/status/') || url.includes('/video/');
    }

    // Instagram video patterns
    if (url.includes('instagram.com')) {
      return url.includes('/reel/') || url.includes('/tv/') || url.includes('/p/');
    }

    // TikTok patterns
    if (url.includes('tiktok.com')) {
      return url.includes('/video/') || url.includes('/@');
    }

    return false;
  }

  private static hasVideoIndicatorsInHtml(html: any): boolean {
    const videoIndicators = [
      'video', 'youtube', 'vimeo', 'mp4', 'webm', 'player',
      'stream', 'embed', 'watch', 'play'
    ];

    const textContent = JSON.stringify(html).toLowerCase();
    return videoIndicators.some(indicator => textContent.includes(indicator));
  }

  private static getContentTypeFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      if (pathname.includes('.mp4')) return 'video/mp4';
      if (pathname.includes('.webm')) return 'video/webm';
      if (pathname.includes('.mov')) return 'video/quicktime';
      if (pathname.includes('.avi')) return 'video/x-msvideo';
      if (pathname.includes('.mkv')) return 'video/x-matroska';
      
      return 'video/mp4'; // Default assumption
    } catch {
      return 'video/mp4';
    }
  }
}

// Process casts and extract video items
function processVideoFeed(casts: Cast[]): VideoFeedItem[] {
  const videoItems: VideoFeedItem[] = [];

  for (const cast of casts) {
    const videos = VideoParser.extractVideosFromCast(cast);
    
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

// Simple pagination for static data
function paginateData<T>(data: T[], cursor?: string, limit: number = 25): { 
  items: T[], 
  nextCursor?: string, 
  hasMore: boolean 
} {
  const startIndex = cursor ? parseInt(cursor) : 0;
  const endIndex = startIndex + limit;
  const items = data.slice(startIndex, endIndex);
  const hasMore = endIndex < data.length;
  const nextCursor = hasMore ? endIndex.toString() : undefined;

  return { items, nextCursor, hasMore };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor');
    const limit = parseInt(searchParams.get('limit') || '25');
    
    console.log(`📡 Fetching static data: limit=${limit}, cursor=${cursor || 'none'}`);
    
    // Read static JSON file from /data/casts.json
    const dataDirectory = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDirectory, 'casts.json');
    
    let fileContents: string;
    try {
      fileContents = await fs.readFile(filePath, 'utf8');
    } catch (fileError) {
      console.error('❌ Failed to read /data/casts.json:', fileError);
      return NextResponse.json(
        { 
          error: 'Static data file not found',
          details: 'Please ensure /data/casts.json exists in your project root'
        },
        { status: 404 }
      );
    }

    // Parse JSON data
    let data: NeynarFeedResponse;
    try {
      data = JSON.parse(fileContents);
    } catch (parseError) {
      console.error('❌ Failed to parse JSON:', parseError);
      return NextResponse.json(
        { 
          error: 'Invalid JSON format in casts.json',
          details: 'Please ensure the JSON file is properly formatted'
        },
        { status: 400 }
      );
    }

    console.log(`✅ Loaded ${data.casts?.length || 0} casts from static file`);
    
    // Process and filter video content
    const allVideoItems = processVideoFeed(data.casts || []);
    
    // Apply pagination to the processed video items
    const paginatedResult = paginateData(allVideoItems, cursor, limit);
    
    console.log(`🎬 Returning ${paginatedResult.items.length} video items (total available: ${allVideoItems.length})`);
    
    // Log some debug info about the videos found
    paginatedResult.items.slice(0, 3).forEach((item, i) => {
      console.log(`📹 Video ${i + 1}: ${item.videos.length} video(s), author: @${item.cast.author.username}`);
    });
    
    return NextResponse.json({
      videos: paginatedResult.items,
      nextCursor: paginatedResult.nextCursor,
      hasMore: paginatedResult.hasMore,
      totalFound: paginatedResult.items.length,
      totalAvailable: allVideoItems.length,
    });
    
  } catch (error) {
    console.error('❌ Feed API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch video feed from static data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function POST() {
  try {
    // Check if the static file exists
    const dataDirectory = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDirectory, 'casts.json');
    await fs.access(filePath);
    
    return NextResponse.json({
      status: 'API endpoint is working',
      dataSource: 'static file: /data/casts.json',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      status: 'API endpoint working but static file not found',
      dataSource: 'missing: /data/casts.json',
      error: 'Please add your static data file',
      timestamp: new Date().toISOString(),
    }, { status: 404 });
  }
}