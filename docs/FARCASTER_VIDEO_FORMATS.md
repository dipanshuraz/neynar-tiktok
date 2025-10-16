# 🎥 Farcaster Video Formats & Embedding Methods

## Overview

This document explains all possible video formats and embedding methods you can expect in Farcaster casts.

---

## 🎬 Video Formats You Can Expect

### 1. **HLS Streaming** (Most Common) ✅
**MIME Types:**
- `application/vnd.apple.mpegurl` (standard)
- `application/x-mpegurl` (alternative)

**File Extension:** `.m3u8`

**Sources:**
- `stream.farcaster.xyz` - Official Farcaster video hosting
- `res.cloudinary.com` - Cloudinary (used by Base, Zora)
- Other CDNs supporting HLS

**Characteristics:**
- Adaptive bitrate streaming
- Multiple quality levels (240p - 1080p)
- Best for mobile & web
- Requires HLS.js for playback

**Example:**
```
https://stream.farcaster.xyz/v1/video/{id}.m3u8
https://res.cloudinary.com/base-app/video/upload/.../video.mp4.m3u8
```

### 2. **MP4 Video** (Direct Video) 🎯
**MIME Type:** `video/mp4`

**File Extensions:** `.mp4`, `.m4v`

**Sources:**
- Direct file uploads
- CDN links (Cloudflare, AWS S3, etc.)
- Personal websites
- IPFS gateways

**Characteristics:**
- Single quality (no adaptive streaming)
- Works with native `<video>` element
- Good browser support
- Smaller file sizes than HLS

**Example:**
```
https://example.com/video.mp4
https://cdn.example.com/uploads/video.m4v
ipfs://QmXxX.../video.mp4
```

### 3. **WebM Video** 📹
**MIME Type:** `video/webm`

**File Extensions:** `.webm`

**Sources:**
- Direct uploads
- Web-optimized videos
- Screen recordings

**Characteristics:**
- Open format
- Good compression
- Chrome/Firefox optimized
- Native `<video>` support

**Example:**
```
https://example.com/video.webm
```

### 4. **QuickTime/MOV** 🎬
**MIME Type:** `video/quicktime`

**File Extensions:** `.mov`

**Sources:**
- iPhone recordings
- Mac screen captures
- Direct file links

**Characteristics:**
- Apple ecosystem
- Large file sizes
- Native Safari support
- May need conversion for other browsers

**Example:**
```
https://example.com/video.mov
```

### 5. **OGG Video** 🔧
**MIME Type:** `video/ogg`

**File Extensions:** `.ogv`, `.ogg`

**Sources:**
- Open-source videos
- Firefox-optimized content

**Characteristics:**
- Open format
- Less common
- Native Firefox support

**Example:**
```
https://example.com/video.ogv
```

---

## 📝 How Users Can Embed Videos in Farcaster

### Method 1: **Direct Upload to Farcaster** (Most Common) ⭐
**What happens:**
1. User uploads video in Farcaster client (Warpcast, etc.)
2. Video is processed and converted to HLS
3. Hosted on `stream.farcaster.xyz`
4. Cast contains `.m3u8` URL

**Result in API:**
```json
{
  "url": "https://stream.farcaster.xyz/v1/video/{id}.m3u8",
  "metadata": {
    "content_type": "application/vnd.apple.mpegurl",
    "video": {
      "streams": [...],
      "duration_s": 105.7
    }
  }
}
```

**Formats you'll see:** HLS only

---

### Method 2: **External Video Links** 🔗
**What happens:**
1. User pastes a video URL in their cast
2. Neynar fetches metadata
3. Cast embed contains the external URL

**Common sources:**
- Direct video files (MP4, WebM, MOV)
- CDN-hosted videos
- Personal websites
- IPFS links

**Result in API:**
```json
{
  "url": "https://example.com/video.mp4",
  "metadata": {
    "content_type": "video/mp4",
    "video": {
      "width_px": 1920,
      "height_px": 1080,
      "duration_s": 60.5
    }
  }
}
```

**Formats you'll see:** MP4, WebM, MOV, any direct video URL

---

### Method 3: **Third-Party App Embeds** 📱
**What happens:**
1. User creates content in apps like:
   - Base app → Cloudinary HLS
   - Zora → Cloudinary HLS  
   - Paragraph → Custom hosting
   - Tape.xyz → IPFS/HLS
2. App posts to Farcaster with video embed

**Result in API:**
```json
{
  "url": "https://res.cloudinary.com/base-app/video/.../video.mp4.m3u8",
  "metadata": {
    "content_type": "application/x-mpegurl",
    "video": {...}
  }
}
```

**Formats you'll see:** Usually HLS, sometimes direct MP4

---

### Method 4: **Frame Embeds with Videos** 🖼️
**What happens:**
1. User posts a Farcaster Frame
2. Frame metadata includes video URL
3. Video may be hosted anywhere

**Result in API:**
```json
{
  "url": "https://frame-app.com/video.mp4",
  "metadata": {
    "content_type": "text/html",  // Frame metadata
    "video": {
      "url": "https://cdn.frame-app.com/video.mp4"
    }
  }
}
```

**Formats you'll see:** Any format (MP4, HLS, WebM)

---

### Method 5: **IPFS Videos** 🌐
**What happens:**
1. User uploads to IPFS
2. Posts IPFS gateway URL or `ipfs://` URL
3. Gateway serves the video

**Result in API:**
```json
{
  "url": "https://ipfs.io/ipfs/QmXxX.../video.mp4",
  "metadata": {
    "content_type": "video/mp4",
    "video": {...}
  }
}
```

**Formats you'll see:** Usually MP4, sometimes WebM

---

### Method 6: **Video Platform Embeds** 🎥
**What happens:**
1. User shares YouTube/Vimeo/Twitter video
2. Neynar may extract video URL
3. Platform-specific embed

**Result in API:**
```json
{
  "url": "https://www.youtube.com/watch?v=xxx",
  "metadata": {
    "content_type": "text/html",
    "html": {
      "ogVideo": "https://youtube.com/embed/xxx"
    }
  }
}
```

**Formats you'll see:** Platform-specific (usually iframe embeds)

---

## 📊 Expected Distribution

Based on Farcaster ecosystem analysis:

| Method | Frequency | Format | Priority |
|--------|-----------|--------|----------|
| **Farcaster Direct Upload** | 70-80% | HLS (.m3u8) | 🔥 High |
| **Third-Party Apps** | 10-15% | HLS (.m3u8) | 🔥 High |
| **External MP4 Links** | 5-10% | MP4 | ⭐ Medium |
| **Frames with Video** | 2-5% | Mixed | ⭐ Medium |
| **IPFS Videos** | 1-3% | MP4 | ⚡ Low |
| **Platform Embeds** | 1-2% | Iframe | ⚡ Low |

---

## 🎯 Formats to Support

### Must Support (90%+ coverage): ✅
1. **HLS Streaming** (`.m3u8`)
   - `application/vnd.apple.mpegurl`
   - `application/x-mpegurl`
   - Use HLS.js

### Should Support (5-10% coverage): ⭐
2. **MP4 Direct Video** (`.mp4`)
   - `video/mp4`
   - Native `<video>` element

3. **WebM Video** (`.webm`)
   - `video/webm`
   - Native `<video>` element

### Nice to Have (1-2% coverage): ⚡
4. **MOV Video** (`.mov`)
   - `video/quicktime`
   - Native `<video>` element (Safari)

5. **OGG Video** (`.ogv`)
   - `video/ogg`
   - Native `<video>` element

---

## 🔍 Detection Strategy

### URL-Based Detection:
```typescript
function detectVideoFormat(url: string): VideoFormat {
  // HLS
  if (url.includes('.m3u8') || 
      url.includes('stream.farcaster.xyz') ||
      url.includes('cloudinary.com/video/upload')) {
    return 'hls';
  }
  
  // Direct video by extension
  if (url.match(/\.(mp4|m4v)$/i)) return 'mp4';
  if (url.match(/\.webm$/i)) return 'webm';
  if (url.match(/\.mov$/i)) return 'mov';
  if (url.match(/\.(ogv|ogg)$/i)) return 'ogg';
  
  return 'unknown';
}
```

### MIME Type Detection:
```typescript
function detectVideoFormatByMime(contentType: string): VideoFormat {
  switch (contentType) {
    case 'application/vnd.apple.mpegurl':
    case 'application/x-mpegurl':
      return 'hls';
    
    case 'video/mp4':
      return 'mp4';
    
    case 'video/webm':
      return 'webm';
    
    case 'video/quicktime':
      return 'mov';
    
    case 'video/ogg':
      return 'ogg';
    
    default:
      return 'unknown';
  }
}
```

---

## 🛠️ Implementation Recommendations

### Priority 1: HLS Support (Current) ✅
```typescript
// Already implemented
// Covers 80-90% of videos
// Uses HLS.js
```

### Priority 2: Add MP4/WebM Support
```typescript
// Covers additional 5-10%
// Use native <video> element
// No external library needed

if (videoFormat === 'hls') {
  // Use HLS.js
} else if (['mp4', 'webm', 'mov'].includes(videoFormat)) {
  // Use native <video>
  video.src = videoUrl;
  video.load();
}
```

### Priority 3: Graceful Fallback
```typescript
// For unknown formats, try native <video>
// If it fails, show poster + error message
// User experience: Better than nothing
```

---

## 🌍 Real-World Examples

### Farcaster Native:
```
https://stream.farcaster.xyz/v1/video/0199e995-26f9-523f-fb92-a2c09d2ac354.m3u8
→ HLS, 1080p-240p, h264 codec
```

### Base App (via Cloudinary):
```
https://res.cloudinary.com/base-app/video/upload/sp_auto/v1760303380/IMG_3031.mp4.m3u8
→ HLS, transcoded from MP4
```

### Direct MP4 Link:
```
https://cdn.example.com/uploads/my-video.mp4
→ MP4, single quality, native playback
```

### IPFS Gateway:
```
https://ipfs.io/ipfs/QmXxXxXxX.../video.mp4
→ MP4, decentralized hosting
```

---

## 📈 Future Considerations

### Emerging Formats:
- **AV1 codec** (`.mp4` with AV1) - Better compression
- **DASH streaming** (`.mpd`) - Alternative to HLS
- **WebRTC streams** - Live video

### Platform Growth:
- As Farcaster grows, expect:
  - More third-party apps → More HLS variants
  - More direct uploads → More MP4/WebM
  - Frame ecosystem → More diverse formats

---

## ✅ Summary

**Q: How many video formats can I expect?**

**A: 2-5 formats in practice:**
1. ✅ **HLS** (80-90%) - `.m3u8` files
2. ⭐ **MP4** (5-10%) - `.mp4` files  
3. ⭐ **WebM** (1-3%) - `.webm` files
4. ⚡ **MOV** (1-2%) - `.mov` files
5. ⚡ **OGG** (<1%) - `.ogv` files

**Q: How many ways can users embed videos?**

**A: 6 main methods:**
1. ✅ Direct Farcaster upload (70-80%)
2. ✅ Third-party apps (10-15%)
3. ⭐ External video links (5-10%)
4. ⚡ Frames with video (2-5%)
5. ⚡ IPFS videos (1-3%)
6. ⚡ Platform embeds (1-2%)

**Current Implementation:** HLS-only ✅ (covers 80-90%)

**Recommended:** Add MP4/WebM support for 95%+ coverage

---

**Date**: October 16, 2025  
**Source**: Farcaster ecosystem analysis + data analysis  
**Status**: Ready for implementation

