
'use client';

import { useState, memo, useCallback } from 'react';
import { Heart, MessageCircle, Share, Plus } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { VideoFeedItem } from '@/types/neynar';
import { NetworkSpeed } from '../hooks/useNetworkQuality';

interface VideoFeedItemProps {
  item: VideoFeedItem;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  isMobile?: boolean;
  shouldPreload?: boolean; // Pass through to VideoPlayer
  networkSpeed?: NetworkSpeed; // Network quality info
  shouldPlay?: boolean; // Pass through for keyboard control
}

function VideoFeedItemComponent({ 
  item, 
  isActive,
  isMuted,
  onMuteToggle,
  isMobile = true,
  shouldPreload = false,
  networkSpeed = 'medium',
  shouldPlay = true
}: VideoFeedItemProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const { cast, videos } = item;

  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    return `${Math.max(1, diffMinutes)}m`;
  };

  const handleLike = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLiked(!isLiked);
  }, [isLiked]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const shareData = {
      title: `Video by @${cast.author.username}`,
      text: cast.text,
      url: `https://warpcast.com/${cast.author.username}/${cast.hash.slice(0, 10)}`,
    };

    if (navigator.share && navigator.canShare?.(shareData)) {
      navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(shareData.url);
    }
  }, [cast.author.username, cast.text, cast.hash]);

  const handleComment = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const warpcastUrl = `https://warpcast.com/${cast.author.username}/${cast.hash.slice(0, 10)}`;
    window.open(warpcastUrl, '_blank');
  }, [cast.author.username, cast.hash]);

  const handleFollow = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFollowing(!isFollowing);
  }, [isFollowing]);

  if (isMobile) {
    return (
      <div 
        className="relative w-full h-screen bg-black"
        style={{ 
          willChange: isActive ? 'transform' : 'auto',
          contain: 'layout style paint'
        }}
      >
        {/* Video Player - Full Screen */}
        <VideoPlayer
          videos={videos}
          isActive={isActive}
          isMuted={isMuted}
          onMuteToggle={onMuteToggle}
          className="w-full h-full"
          shouldPreload={shouldPreload}
          networkSpeed={networkSpeed}
          shouldPlay={shouldPlay}
          castHash={cast.hash}
          authorUsername={cast.author.username}
          castText={cast.text}
        />

        {/* TikTok-Style Overlays */}
        
        {/* Bottom Left - User Info & Caption */}
        <div className="absolute bottom-0 left-0 right-20 p-4 pb-8">
          <div className="space-y-3">
            {/* User Info */}
            <div className="flex items-center space-x-3">
              <img
                src={cast.author.pfp_url || '/default-avatar.png'}
                alt={cast.author.display_name}
                className="w-10 h-10 rounded-full border-2 border-white object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-avatar.png';
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-white text-base">
                    @{cast.author.username}
                  </span>
                  <span className="text-white/70 text-sm">
                    {formatTimeAgo(cast.timestamp)}
                  </span>
                </div>
                {cast.author.display_name !== cast.author.username && (
                  <p className="text-white/80 text-sm truncate">
                    {cast.author.display_name}
                  </p>
                )}
              </div>
            </div>

            {/* Caption */}
            {cast.text && (
              <div className="pr-4">
                <p className="text-white text-sm leading-relaxed break-words">
                  {cast.text.length > 150 ? `${cast.text.slice(0, 150)}...` : cast.text}
                </p>
              </div>
            )}

            {/* Channel */}
            {cast.channel && (
              <div className="flex items-center space-x-2">
                <img
                  src={cast.channel.image_url || '/default-channel.png'}
                  alt={cast.channel.name}
                  className="w-5 h-5 rounded object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-channel.png';
                  }}
                />
                <span className="text-white/80 text-sm font-medium">
                  /{cast.channel.id}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Action Buttons (TikTok Style) */}
        <div className="absolute bottom-16 right-3 flex flex-col items-center space-y-6">
          {/* Avatar with Follow Button */}
          <div className="relative">
            <button className="block" aria-label={`View ${cast.author.username}'s profile`}>
              <img
                src={cast.author.pfp_url || '/default-avatar.png'}
                alt={cast.author.display_name}
                className="w-12 h-12 rounded-full border-2 border-white object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/default-avatar.png';
                }}
              />
            </button>
            <button
              onClick={handleFollow}
              className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-6 h-6 rounded-full border-2 border-black flex items-center justify-center text-xs font-bold transition-all ${
                isFollowing
                  ? 'bg-gray-500 text-white'
                  : 'bg-tiktok-red text-white hover:bg-red-600'
              }`}
              aria-label={isFollowing ? `Unfollow ${cast.author.username}` : `Follow ${cast.author.username}`}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Like Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleLike}
              className={`w-12 h-12 flex items-center justify-center transition-transform active:scale-95 ${
                isLiked ? 'animate-heart-beat' : ''
              }`}
              aria-label={isLiked ? 'Unlike video' : 'Like video'}
            >
              <Heart 
                className={`w-8 h-8 ${
                  isLiked 
                    ? 'fill-tiktok-red text-tiktok-red' 
                    : 'fill-none text-white'
                }`} 
              />
            </button>
            <span className="text-white text-xs font-semibold mt-1">
              {formatCount(cast.reactions.likes_count + (isLiked ? 1 : 0))}
            </span>
          </div>

          {/* Comment Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleComment}
              className="w-12 h-12 flex items-center justify-center transition-transform active:scale-95"
              aria-label="Comment on video"
            >
              <MessageCircle className="w-7 h-7 text-white fill-none" />
            </button>
            <span className="text-white text-xs font-semibold mt-1">
              {formatCount(cast.replies.count)}
            </span>
          </div>

          {/* Share Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={handleShare}
              className="w-12 h-12 flex items-center justify-center transition-transform active:scale-95"
              aria-label="Share video"
            >
              <Share className="w-7 h-7 text-white fill-none" />
            </button>
          </div>

          {/* Record Disc (Spinning Animation) */}
          <div className="mt-4">
            <div 
              className={`w-12 h-12 rounded-full bg-gradient-to-r from-gray-800 to-gray-600 border-2 border-gray-700 flex items-center justify-center ${
                isActive ? 'animate-record-spin' : ''
              }`}
            >
              <div className="w-3 h-3 bg-black rounded-full"></div>
            </div>
          </div>
        </div>

        {/* Video Count Indicator */}
        {videos.length > 1 && (
          <div className="absolute top-16 left-4 bg-black/60 rounded-full px-3 py-1 backdrop-blur-sm">
            <span className="text-white text-xs font-medium">
              {videos.length} videos
            </span>
          </div>
        )}
      </div>
    );
  }

  // Desktop Layout (will be implemented in next component)
  return (
    <div className="desktop-layout">
      {/* Desktop implementation will go here */}
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export default memo(VideoFeedItemComponent, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.isMuted === nextProps.isMuted &&
    prevProps.isMobile === nextProps.isMobile &&
    prevProps.shouldPreload === nextProps.shouldPreload &&
    prevProps.networkSpeed === nextProps.networkSpeed &&
    prevProps.shouldPlay === nextProps.shouldPlay
  );
});