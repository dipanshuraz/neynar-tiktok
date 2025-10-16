// Server-Side Rendered version of VideoFeedItem (static HTML, no interactivity until hydration)

import { VideoFeedItem } from '@/types/neynar';
import { Heart, MessageCircle, Share2, UserPlus } from 'lucide-react';

interface VideoFeedItemSSRProps {
  item: VideoFeedItem;
}

/**
 * SSR version of VideoFeedItem
 * Renders static HTML for the first video card
 * Client component will hydrate on top of this
 */
export default function VideoFeedItemSSR({ item }: VideoFeedItemSSRProps) {
  const { cast } = item;
  const firstVideo = item.videos[0]; // Get first video from the item

  return (
    <div
      className="relative w-full h-screen bg-black"
      data-ssr-video="true"
      style={{
        willChange: 'transform',
        contain: 'layout style paint'
      }}
    >
      {/* Video placeholder with poster */}
      <div className="absolute inset-0 bg-black">
        {firstVideo?.thumbnail && (
          <img
            src={firstVideo.thumbnail}
            alt="Video thumbnail"
            className="w-full h-full object-cover"
            style={{
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
            }}
          />
        )}
      </div>

      {/* User info overlay */}
      <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
        <img
          src={cast.author.pfp_url || '/default-avatar.png'}
          alt={cast.author.display_name}
          className="w-10 h-10 rounded-full border-2 border-white object-cover"
        />
        <div className="text-white">
          <div className="font-semibold text-sm">
            {cast.author.display_name}
          </div>
          <div className="text-xs opacity-90">
            @{cast.author.username}
          </div>
        </div>
      </div>

      {/* Channel badge */}
      {cast.channel && (
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 rounded-full px-3 py-1.5 backdrop-blur-sm z-10">
          {cast.channel.image_url && (
            <img
              src={cast.channel.image_url}
              alt={cast.channel.name}
              className="w-5 h-5 rounded-full object-cover"
            />
          )}
          <span className="text-white text-xs font-medium">
            /{cast.channel.name}
          </span>
        </div>
      )}

      {/* Bottom info section */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
        {/* Cast text */}
        {cast.text && (
          <div className="text-white text-sm mb-3 line-clamp-3">
            {cast.text}
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 text-white text-xs mb-3">
          <div className="flex items-center gap-1">
            <Heart className="w-4 h-4" />
            <span>{cast.reactions.likes_count || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <MessageCircle className="w-4 h-4" />
            <span>{cast.replies.count || 0}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute bottom-24 right-4 flex flex-col gap-4 z-10">
        {/* Like button */}
        <button
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Like"
          suppressHydrationWarning
        >
          <Heart className="w-6 h-6" />
        </button>

        {/* Comment button */}
        <button
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Comment"
          suppressHydrationWarning
        >
          <MessageCircle className="w-6 h-6" />
        </button>

        {/* Share button */}
        <button
          className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
          aria-label="Share"
          suppressHydrationWarning
        >
          <Share2 className="w-6 h-6" />
        </button>

        {/* Follow button */}
        <button
          className="w-12 h-12 rounded-full bg-purple-500/90 backdrop-blur-sm flex items-center justify-center text-white hover:bg-purple-600/90 transition-colors"
          aria-label="Follow"
          suppressHydrationWarning
        >
          <UserPlus className="w-6 h-6" />
        </button>

        {/* Author avatar */}
        <div className="relative">
          <img
            src={cast.author.pfp_url || '/default-avatar.png'}
            alt={cast.author.display_name}
            className="w-12 h-12 rounded-full border-2 border-white object-cover"
          />
        </div>
      </div>

    </div>
  );
}

