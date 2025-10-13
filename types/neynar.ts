// types/neynar.ts

export interface NeynarUser {
  fid: number;
  custody_address: string;
  username: string;
  display_name: string;
  pfp_url: string;
  profile: {
    bio: {
      text: string;
    };
  };
  follower_count: number;
  following_count: number;
  verifications: string[];
  verified_addresses: {
    eth_addresses: string[];
    sol_addresses: string[];
  };
}

export interface CastEmbedUrl {
  url: string;
}

export interface CastEmbedCastId {
  fid: number;
  hash: string;
}

export interface CastEmbed {
  cast_id?: CastEmbedCastId;
  url?: string;
  metadata?: {
    content_type?: string;
    content_length?: number;
    _status?: string;
    image?: {
      url: string;
      width_px: number;
      height_px: number;
    };
    video?: {
      url: string;
      content_type?: string;
      width_px?: number;
      height_px?: number;
      duration_s?: number;
      stream?: {
        stream_url: string;
      };
    };
    html?: {
      charset?: string;
      content?: string;
      favicon?: string;
      image?: string;
      title?: string;
      description?: string;
      domain?: string;
    };
  };
}

export interface Cast {
  hash: string;
  parent_hash?: string;
  parent_url?: string;
  root_parent_url?: string;
  parent_author?: {
    fid: number;
  };
  author: NeynarUser;
  text: string;
  timestamp: string;
  embeds: CastEmbed[];
  reactions: {
    likes_count: number;
    recasts_count: number;
    likes: Array<{
      fid: number;
      fname: string;
    }>;
    recasts: Array<{
      fid: number;
      fname: string;
    }>;
  };
  replies: {
    count: number;
  };
  mentioned_profiles: NeynarUser[];
  channel?: {
    id: string;
    name: string;
    description: string;
    image_url: string;
    lead: {
      fid: number;
      username: string;
    };
    created_at: number;
    follower_count: number;
  };
}

export interface NeynarFeedResponse {
  casts: Cast[];
  next: {
    cursor: string;
  };
}

export interface ProcessedVideo {
  url: string;
  contentType?: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
}

export interface VideoFeedItem {
  id: string;
  cast: Cast;
  videos: ProcessedVideo[];
}