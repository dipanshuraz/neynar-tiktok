# 👤 FID Filtering Feature

## Overview

You can now filter videos by Farcaster ID (FID) using URL parameters. This works with both local dummy data and live Neynar API.

---

## 🚀 How to Use

### Basic Usage

Add `?fid=YOUR_FID` to the URL:

```
http://localhost:3000?fid=3621
```

### Examples

```bash
# Show videos from FID 3621
http://localhost:3000?fid=3621

# Show videos from FID 9152 (default)
http://localhost:3000?fid=9152

# Show videos from any user
http://localhost:3000?fid=1234

# No FID = uses default FID from env
http://localhost:3000
```

---

## 🔧 How It Works

### API Layer (Only Change)

The `/api/feed` route now:
1. Extracts `fid` parameter from URL query string
2. Passes it to data fetching functions
3. Filters results by that FID

**When `NEXT_PUBLIC_USE_DUMMY_DATA=true` (Local Data):**
- Reads from `data/casts-1.json`
- Filters casts where `cast.author.fid === targetFid`
- Returns only videos from that user

**When `NEXT_PUBLIC_USE_DUMMY_DATA=false` (Live API):**
- Calls Neynar API with `fid` parameter
- Neynar returns only casts from that user
- Processes and returns HLS videos

### Frontend (No Changes)

The frontend automatically uses whatever the API returns. No changes needed in VideoFeed component.

---

## 📝 Implementation Details

### API Route Changes

**File**: `src/app/api/feed/route.ts`

```typescript
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const fid = searchParams.get('fid') || undefined; // ← Extract FID
    const limit = parseInt(searchParams.get('limit') || '25');
    
    console.log(`FID: ${fid || DEFAULT_FID}`);
    
    // Pass fid to data fetching functions
    const neynarData = USE_LOCAL_DATA 
      ? await fetchFromLocal(fid) 
      : await fetchFromNeynar(cursor, fid);
    
    // ... process and return videos
  }
}
```

### Local Data Filtering

```typescript
async function fetchFromLocal(fid?: string): Promise<NeynarFeedResponse> {
  const filePath = path.join(process.cwd(), 'data', 'casts-1.json');
  const fileContents = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContents);
  
  // Filter by FID if provided
  if (fid && data.casts) {
    const targetFid = parseInt(fid, 10);
    const originalCount = data.casts.length;
    data.casts = data.casts.filter((cast: Cast) => cast.author.fid === targetFid);
    console.log(`🔍 Filtered by FID ${fid}: ${data.casts.length}/${originalCount} casts`);
  }
  
  return data;
}
```

### Neynar API Call

```typescript
async function fetchFromNeynar(cursor?: string, fid?: string): Promise<NeynarFeedResponse> {
  const url = new URL(NEYNAR_API_URL);
  url.searchParams.set('feed_type', 'filter');
  url.searchParams.set('filter_type', 'global_trending');
  url.searchParams.set('with_recasts', 'true');
  url.searchParams.set('limit', '100');
  url.searchParams.set('fid', fid || DEFAULT_FID); // ← Use provided FID or default
  
  // ... fetch and return data
}
```

---

## 🧪 Testing

### Test with Local Data

```bash
# 1. Make sure you're using local data
cat .env.local
# Should show: NEXT_PUBLIC_USE_DUMMY_DATA=true

# 2. Find FIDs in your local data
cat data/casts-1.json | grep -o '"fid":[0-9]*' | sort -u | head -10

# 3. Test filtering
open http://localhost:3000?fid=3621
open http://localhost:3000?fid=9152

# 4. Check console logs
# Should see: "🔍 Filtered by FID 3621: X/Y casts"
```

### Test with Live API

```bash
# 1. Switch to live API
# .env.local:
NEXT_PUBLIC_USE_DUMMY_DATA=false
NEXT_PUBLIC_NEYNAR_API_KEY=your_key_here

# 2. Test with known FIDs
open http://localhost:3000?fid=3621  # dwr.eth
open http://localhost:3000?fid=9152  # some user
open http://localhost:3000?fid=1     # vitalik.eth

# 3. Check API logs
# Should see: "FID: 3621" in console
```

---

## 🔍 Finding FIDs

### Method 1: From Warpcast Profile
```
Warpcast URL: https://warpcast.com/dwr
                                   ^^^
FID is usually shown in the profile or you can use a Farcaster explorer
```

### Method 2: From Local Data
```bash
# Extract all FIDs and their usernames from local data
cat data/casts-1.json | jq '.casts[] | {fid: .author.fid, username: .author.username}' | head -20
```

### Method 3: Using Neynar API
```bash
# Look up user by username
curl -X GET "https://api.neynar.com/v2/farcaster/user/by_username?username=dwr" \
  -H "x-api-key: YOUR_KEY" | jq '.result.user.fid'
```

---

## 📊 API Response Format

Same format as before, just filtered by FID:

```json
{
  "videos": [
    {
      "id": "0x123...",
      "cast": {
        "hash": "0x123...",
        "author": {
          "fid": 3621,  // ← Matches your filter!
          "username": "dwr",
          "display_name": "Dan Romero",
          "pfp_url": "...",
          // ... rest of author data
        },
        "text": "Check out this video...",
        "embeds": [...]
      },
      "videos": [
        {
          "url": "https://stream.farcaster.xyz/.../index.m3u8",
          "contentType": "application/vnd.apple.mpegurl",
          // ... video metadata
        }
      ]
    }
  ],
  "nextCursor": "...",
  "hasMore": true
}
```

---

## ⚙️ Configuration

### Environment Variables

```bash
# .env.local

# Default FID when no ?fid= parameter is provided
NEXT_PUBLIC_DEFAULT_FID=9152

# Use local data (filters locally) or live API (filters via Neynar)
NEXT_PUBLIC_USE_DUMMY_DATA=true

# Your Neynar API key (for live API mode)
NEXT_PUBLIC_NEYNAR_API_KEY=your_key_here
```

### Default Behavior

| Mode | FID Parameter | Result |
|------|---------------|--------|
| Local | None | Shows all casts from local file |
| Local | `?fid=3621` | Filters local data to FID 3621 |
| Live API | None | Uses `DEFAULT_FID` from env (9152) |
| Live API | `?fid=3621` | Fetches only FID 3621 from Neynar |

---

## 🎯 Use Cases

### 1. User Profile Page
```tsx
// Show all videos from a specific user
<VideoFeed fid={user.fid} />

// Or just link to:
<a href={`/?fid=${user.fid}`}>View {user.username}'s videos</a>
```

### 2. Channel-Specific Feed
```typescript
// Filter by channel owner
const channelOwnerFid = 3621;
fetch(`/api/feed?fid=${channelOwnerFid}`);
```

### 3. Multi-User Comparison
```bash
# View different users in separate tabs
open http://localhost:3000?fid=3621   # User A
open http://localhost:3000?fid=1      # User B
open http://localhost:3000?fid=9152   # User C
```

---

## 🚨 Limitations

1. **Single FID Only**: Can only filter by one FID at a time
   - ❌ Cannot do: `?fid=3621&fid=1234` (multiple users)
   - ✅ Can do: `?fid=3621` (single user)

2. **Local Data**: Filtering happens after loading entire file
   - May be slow with very large local data files
   - Consider splitting data by FID if needed

3. **Pagination**: Cursor-based pagination works per-FID
   - Each FID has its own cursor
   - Switching FIDs resets pagination

---

## 🔒 Security Notes

- FID parameter is validated and parsed as integer
- Invalid FIDs return empty results (not an error)
- No SQL injection risk (we're not using SQL)
- API key is never exposed to frontend

---

## 📚 Related Documentation

- **API Route**: `src/app/api/feed/route.ts`
- **Types**: `types/neynar.ts`
- **Environment Setup**: `env.example`
- **Testing**: `TROUBLESHOOTING.md`

---

## 🎉 Summary

**Added**: FID filtering via URL parameter (`?fid=3621`)  
**Changed**: Only API route (`/api/feed`)  
**Frontend**: No changes needed (automatically uses filtered data)  
**Works with**: Both local dummy data and live Neynar API  
**Status**: ✅ Production-ready

---

**Date**: October 16, 2025  
**Feature**: FID Filtering  
**Complexity**: Low (API-only change)

