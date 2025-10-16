# 🎬 Neynar API Integration - Unlimited Videos

This document explains how the app integrates with Neynar's API to provide unlimited video content with efficient pagination.

## 🎯 Overview

The app uses Neynar's `embed_types=video` filter to fetch **only video content** from Farcaster, eliminating the need to filter through non-video casts.

### API Endpoint

According to the [Neynar API documentation](https://docs.neynar.com/reference/fetch-feed), we use:

```bash
GET https://api.neynar.com/v2/farcaster/feed/
```

With these parameters:
- `feed_type=filter` - Use filtered feed
- `filter_type=embed_types` - Filter by content type
- `embed_types=video` - Only return video content
- `with_recasts=true` - Include recasts
- `limit=25` - Number of videos per request
- `cursor=...` - For pagination

## 📊 How It Works

### 1. Initial Load (SSR)
```typescript
// Server-side: fetchInitialVideos.ts
fetch('/api/feed?limit=10')
```
- Fetches **10 videos** during server-side rendering
- Fast initial page load
- First video renders instantly

### 2. Automatic Pagination
```typescript
// Client-side: VideoFeed.tsx
// Triggers when user scrolls to 5 videos from end
if (currentIndex >= videos.length - 5) {
  loadMoreVideos(cursor);
}
```
- Fetches **25 more videos** in background
- Uses cursor from previous response
- Seamless - no loading interruption

### 3. Cursor-Based Pagination
```json
{
  "videos": [...], // 25 videos
  "nextCursor": "eyJvZmZzZXQiOiAiMjAyNC0wMy0xOVQxN...",
  "hasMore": true
}
```
- Each response includes a `cursor` for the next page
- Efficient - no offset-based queries
- Handles large datasets well

## 🔧 Implementation Details

### API Route (`/api/feed/route.ts`)

```typescript
async function fetchFromNeynar(cursor?: string, limit: number = 25) {
  const url = new URL('https://api.neynar.com/v2/farcaster/feed');
  
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'embed_types');
  url.searchParams.set('embed_types', 'video');
  url.searchParams.set('with_recasts', 'true');
  url.searchParams.set('limit', limit.toString());
  
  if (cursor) {
    url.searchParams.set('cursor', cursor);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': NEYNAR_API_KEY,
      'x-neynar-experimental': 'false',
    },
  });

  return response.json();
}
```

### VideoFeed Component

```typescript
const loadMoreVideos = async () => {
  if (!hasMore || loadingMore || !nextCursor) return;

  setLoadingMore(true);
  const data = await fetchVideos(nextCursor);
  
  // Append new videos to existing list
  setVideos(prev => [...prev, ...data.videos]);
  setNextCursor(data.nextCursor);
  setHasMore(data.hasMore);
  setLoadingMore(false);
};

// Trigger when user is 5 videos from end
if (currentIndex >= videos.length - 5 && hasMore) {
  loadMoreVideos();
}
```

## 📈 Performance Benefits

### Before (Old Approach)
- Fetch 100 casts
- Filter for videos (~10-20 videos)
- Many wasted API calls
- Unpredictable results

### After (Current Approach)
- Fetch 25 videos directly
- All results are videos
- Efficient API usage
- Predictable, unlimited content

## 🎯 Pagination Strategy

### Load Triggers

| User Position | Action | Videos Loaded |
|---------------|--------|---------------|
| Opens app | SSR | 10 initial |
| Reaches video #6 | Auto-load | +25 (total: 35) |
| Reaches video #31 | Auto-load | +25 (total: 60) |
| Reaches video #56 | Auto-load | +25 (total: 85) |
| ... | ... | Infinite |

### Buffer Strategy

**5-video buffer**: Load more when 5 videos remaining
- ✅ Smooth experience (no waiting)
- ✅ Efficient (not too eager)
- ✅ Works on slow connections

## 🔍 API Response Example

```json
{
  "casts": [
    {
      "hash": "0x...",
      "author": {
        "fid": 3,
        "username": "dwr.eth"
      },
      "embeds": [
        {
          "url": "https://stream.farcaster.xyz/v1/video/xxx.m3u8",
          "metadata": {
            "content_type": "application/vnd.apple.mpegurl",
            "video": {
              "width_px": 1920,
              "height_px": 1080,
              "duration_s": 30
            }
          }
        }
      ]
    }
    // ... 24 more video casts
  ],
  "next": {
    "cursor": "eyJvZmZzZXQiOiAiMjAyNC0wMy0xOVQxNzo..."
  }
}
```

## 🚀 Usage

### Development with Dummy Data

```bash
# .env.local
NEXT_PUBLIC_USE_DUMMY_DATA=true
```

Uses local `data/casts-3.json` file for testing without API calls.

### Production with Real API

```bash
# .env.local
NEXT_PUBLIC_USE_DUMMY_DATA=false
NEXT_PUBLIC_NEYNAR_API_KEY=your_actual_key_here
```

Fetches unlimited real videos from Neynar.

## 📊 Monitoring

The app logs detailed pagination info in development:

```
📡 === Feed API Request ===
Mode: NEYNAR
Cursor: none
Limit: 10

🌐 Fetching initial videos from Neynar (limit: 10)...
✅ Fetched 10 video casts from Neynar
📄 Next cursor available: eyJvZmZzZXQiOiAiMjAy...
✅ Returning 10 videos
🔄 Has more: true
```

Then when scrolling:

```
📥 Loading more videos with cursor: eyJvZmZzZXQiOiAiMjAy...
✅ Loaded 25 more videos. Total: 35
📄 Next cursor: eyJvZmZzZXQiOiAiMjAyNC0wM...
```

## 🎛️ Configuration

Adjust pagination behavior in `VideoFeed.tsx`:

```typescript
// Initial SSR load
const response = await fetch('/api/feed?limit=10');

// Subsequent loads
const response = await fetch(`/api/feed?limit=25&cursor=${nextCursor}`);

// Trigger point (5 videos from end)
if (currentIndex >= videos.length - 5) {
  loadMoreVideos();
}
```

## 🔗 References

- [Neynar Feed API Documentation](https://docs.neynar.com/reference/fetch-feed)
- [Neynar Dashboard](https://neynar.com/)
- [Farcaster Protocol](https://docs.farcaster.xyz/)

## 💡 Tips

1. **Free Tier Limits**: 1000 requests/day
   - Initial load: 1 request (10 videos)
   - Each scroll: 1 request (25 videos)
   - ~650 videos viewable per day

2. **Optimize Requests**:
   - Increase initial limit for fewer requests
   - Adjust trigger point (currently 5 videos from end)

3. **Error Handling**:
   - API automatically retries on failure
   - Falls back to no more videos if cursor expires

4. **Local Development**:
   - Use `NEXT_PUBLIC_USE_DUMMY_DATA=true` to avoid API usage
   - Test pagination with local data first

---

## 📍 Last Position Persistence

The app automatically saves and restores your viewing position across sessions.

### How It Works

**On Every Scroll:**
```typescript
// Saves current position to localStorage
setLastVideoIndex(currentIndex, videoId);
```

**On Page Load:**
```typescript
// 1. Check saved position (e.g., video #45)
const savedIndex = preferences.lastVideoIndex; // 45

// 2. Load initial batch (10 videos)
const initialVideos = await fetchVideos(limit=10);

// 3. If saved position > loaded videos, load more
while (savedIndex >= videos.length && hasMore) {
  await loadMoreVideos(); // Fetch 25 more
}

// 4. Scroll to saved position
scrollToVideo(savedIndex);
```

### Smart Loading Algorithm

```typescript
Saved position: 45
Initial load: 10 videos (0-9)

Check: 45 >= 10? Yes → Load more
Batch 1: +25 videos (total: 35)

Check: 45 >= 35? Yes → Load more  
Batch 2: +25 videos (total: 60)

Check: 45 >= 60? No → Stop
✅ Restore position at #45
```

### Storage Keys

```typescript
localStorage:
  'farcaster-feed-last-index': '45'        // Video number
  'farcaster-feed-last-video-id': '0x...'  // Video hash
  'farcaster-feed-mute-state': 'true'      // Mute preference
```

### Example Flow

```
📱 Session 1:
  User watches videos 1 → 50
  Leaves at video #45
  → Saves: index=45, id=0xabc123

📱 Session 2 (Return):
  1. Load 10 initial videos
  2. Check: saved=45 > loaded=10
  3. Load batch 1 (+25) = 35 total
  4. Check: saved=45 > loaded=35
  5. Load batch 2 (+25) = 60 total
  6. Check: saved=45 < loaded=60 ✅
  7. Scroll to video #45
  8. Resume playback 🎬
```

### Safety Features

**Maximum Attempts**: 10 batches (250 videos)
```typescript
const maxAttempts = 10;
if (attempts >= maxAttempts) {
  console.warn('Could not reach saved position, starting from beginning');
  setCurrentIndex(0);
}
```

**Fallback Behavior**:
- If saved position unreachable → Start from beginning
- If videos changed → Start from beginning
- If API error → Start from beginning

### Console Output

```
📍 Saved position at 45, but only 10 videos loaded. Loading more...
📥 Loading batch 1 to reach saved position...
📥 Loading batch 2 to reach saved position...
✅ Reached saved position after 2 batches
📍 Restoring last position: index 45
```

---

**Last Updated**: October 16, 2025
**API Version**: Neynar v2
**Status**: ✅ Production Ready

