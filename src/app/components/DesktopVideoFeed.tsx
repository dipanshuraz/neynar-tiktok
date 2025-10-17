
'use client';

import { useState, useEffect } from 'react';
import { Heart, MessageCircle, Share, Plus, MoreHorizontal } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { VideoFeedItem } from '@/types/neynar';

interface DesktopVideoFeedProps {
  videos: VideoFeedItem[];
  currentIndex: number;
  isMuted: boolean;
  onMuteToggle: () => void;
  onNext: () => void;
  onPrevious: () => void;
}

export default function DesktopVideoFeed({ 
  videos, 
  currentIndex, 
  isMuted, 
  onMuteToggle,
  onNext,
  onPrevious
}: DesktopVideoFeedProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false); // Track play state - starts paused

  const currentVideo = videos[currentIndex];
  
  // Reset play state when video changes (require manual play for each video)
  useEffect(() => {
    setIsPlaying(false);
  }, [currentIndex]);
  
  // Toggle play/pause state
  const handlePlayPauseToggle = () => {
    setIsPlaying(prev => !prev);
  };
  
  if (!currentVideo) return null;

  const { cast } = currentVideo;

  const formatCount = (count: number): string => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now.getTime() - time.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return `${Math.max(1, diffMinutes)}m ago`;
  };

  return (
    <div className="min-h-screen bg-black flex">
      {/* Left Sidebar - Navigation */}
      <div className="w-20 flex-shrink-0 bg-black border-r border-gray-800">
        <div className="h-full flex flex-col items-center py-6">
          {/* Logo */}
          <div className="w-10 h-10 tiktok-gradient rounded-lg flex items-center justify-center mb-8">
            <span className="text-white font-bold text-lg">F</span>
          </div>
          
          {/* Navigation items placeholder */}
          <div className="space-y-6">
            <div className="w-8 h-8 bg-gray-700 rounded-lg"></div>
            <div className="w-8 h-8 bg-gray-700 rounded-lg"></div>
            <div className="w-8 h-8 bg-gray-700 rounded-lg"></div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Video Player Container */}
        <div className="flex-1 flex items-center justify-center bg-black">
          <div className="relative w-[380px] h-[678px] bg-black rounded-lg overflow-hidden shadow-2xl">
            {/* Video Player */}
            <VideoPlayer
              videos={currentVideo.videos}
              isActive={true}
              isMuted={isMuted}
              onMuteToggle={onMuteToggle}
              className="w-full h-full"
              shouldPlay={isPlaying}
              onPlayPauseToggle={handlePlayPauseToggle}
              castHash={cast.hash}
              authorUsername={cast.author.username}
              castText={cast.text}
            />

            {/* Video Navigation Arrows */}
            {currentIndex > 0 && (
              <button
                onClick={onPrevious}
                className="absolute left-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
                aria-label="Previous video"
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}

            {currentIndex < videos.length - 1 && (
              <button
                onClick={onNext}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center backdrop-blur-sm transition-all"
                aria-label="Next video"
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              </button>
            )}

            {/* Bottom Overlay - User Info */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center space-x-3">
                <img
                  src={cast.author.pfp_url || '/default-avatar.png'}
                  alt={cast.author.display_name}
                  className="w-10 h-10 rounded-full border-2 border-white"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-avatar.png';
                  }}
                />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-white font-semibold">
                      @{cast.author.username}
                    </span>
                    <span className="text-white/70 text-sm">
                      {formatTimeAgo(cast.timestamp)}
                    </span>
                  </div>
                  {cast.author.display_name !== cast.author.username && (
                    <p className="text-white/80 text-sm">
                      {cast.author.display_name}
                    </p>
                  )}
                </div>
              </div>
              
              {/* Caption */}
              {cast.text && (
                <p className="text-white text-sm mt-2 leading-relaxed">
                  {cast.text}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar - Actions & Info */}
        <div className="w-80 bg-black border-l border-gray-800 overflow-hidden">
          <div className="h-full flex flex-col">
            {/* Action Buttons */}
            <div className="p-4 border-b border-gray-800">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-white font-semibold text-lg">Actions</h3>
                <button 
                  className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
                  aria-label="More options"
                >
                  <MoreHorizontal className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Follow Button */}
                <button
                  onClick={() => setIsFollowing(!isFollowing)}
                  className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-lg font-semibold transition-all ${
                    isFollowing
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-tiktok-red text-white hover:bg-red-600'
                  }`}
                  aria-label={isFollowing ? `Unfollow ${cast.author.username}` : `Follow ${cast.author.username}`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{isFollowing ? 'Following' : 'Follow'}</span>
                </button>

                {/* Action Buttons Row */}
                <div className="flex items-center space-x-4">
                  {/* Like */}
                  <button
                    onClick={() => setIsLiked(!isLiked)}
                    className="flex-1 flex flex-col items-center space-y-1 p-3 hover:bg-gray-800 rounded-lg transition-colors"
                    aria-label={isLiked ? 'Unlike video' : 'Like video'}
                  >
                    <Heart 
                      className={`w-6 h-6 ${
                        isLiked 
                          ? 'fill-tiktok-red text-tiktok-red' 
                          : 'text-white'
                      }`} 
                    />
                    <span className="text-white text-xs">
                      {formatCount(cast.reactions.likes_count + (isLiked ? 1 : 0))}
                    </span>
                  </button>

                  {/* Comment */}
                  <button
                    onClick={() => setShowComments(!showComments)}
                    className="flex-1 flex flex-col items-center space-y-1 p-3 hover:bg-gray-800 rounded-lg transition-colors"
                    aria-label="View comments"
                  >
                    <MessageCircle className="w-6 h-6 text-white" />
                    <span className="text-white text-xs">
                      {formatCount(cast.replies.count)}
                    </span>
                  </button>

                  {/* Share */}
                  <button 
                    className="flex-1 flex flex-col items-center space-y-1 p-3 hover:bg-gray-800 rounded-lg transition-colors"
                    aria-label="Share video"
                  >
                    <Share className="w-6 h-6 text-white" />
                    <span className="text-white text-xs">Share</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Video Details */}
            <div className="p-4 border-b border-gray-800">
              <h3 className="text-white font-semibold text-lg mb-4">Details</h3>
              
              {/* Channel */}
              {cast.channel && (
                <div className="flex items-center space-x-3 mb-4">
                  <img
                    src={cast.channel.image_url || '/default-channel.png'}
                    alt={cast.channel.name}
                    className="w-8 h-8 rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/default-channel.png';
                    }}
                  />
                  <div>
                    <p className="text-white font-medium">/{cast.channel.id}</p>
                    <p className="text-white/60 text-sm">Channel</p>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-white font-medium">
                    {formatCount(cast.author.follower_count)}
                  </p>
                  <p className="text-white/60">Followers</p>
                </div>
                <div>
                  <p className="text-white font-medium">
                    {formatCount(cast.author.following_count)}
                  </p>
                  <p className="text-white/60">Following</p>
                </div>
              </div>
            </div>

            {/* Comments Section */}
            <div className="flex-1 flex flex-col">
              <div className="p-4 border-b border-gray-800">
                <h3 className="text-white font-semibold text-lg">Comments</h3>
              </div>
              
              <div className="flex-1 p-4 space-y-4">
                {/* Placeholder comments */}
                <div className="text-center py-8">
                  <p className="text-white/60 text-sm">
                    Comments will be loaded here
                  </p>
                  <button 
                    onClick={() => window.open(`https://warpcast.com/${cast.author.username}/${cast.hash.slice(0, 10)}`, '_blank')}
                    className="mt-3 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition-colors"
                    aria-label="View this video on Warpcast"
                  >
                    View on Warpcast
                  </button>
                </div>
              </div>
            </div>

            {/* Progress Indicator */}
            <div className="p-4 border-t border-gray-800">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-white text-sm">
                  {currentIndex + 1} of {videos.length}
                </span>
                <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-tiktok-red transition-all duration-300"
                    style={{ width: `${((currentIndex + 1) / videos.length) * 100}%` }}
                  />
                </div>
              </div>
              <p className="text-white/60 text-xs">
                Use arrow keys or click arrows to navigate
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}