# 🎥 Video Format Analysis

Analysis of video formats in Farcaster cast embeds.

---

## 📊 Data Analysis Results

### Files Analyzed:
- `data/casts-1.json` (15,402 lines)
- `data/casts-2.json` (1,235 lines)

### Content Types Found:

```json
[
  "application/vnd.apple.mpegurl",  // HLS streaming (.m3u8)
  "image/jpeg",                      // Images
  "image/webp",                      // Images
  "image/gif",                       // Animated images
  "text/html",                       // Links/websites
  null                               // No content type
]
```

### Video Formats in Current Data:

**Only HLS Videos Found:**
- Content Type: `application/vnd.apple.mpegurl`
- Extension: `.m3u8`
- Example: `https://stream.farcaster.xyz/v1/video/{id}.m3u8`
- Count: ~5 videos in sample data

**Embed Structure:**
```json
{
  "url": "https://stream.farcaster.xyz/v1/video/xyz.m3u8",
  "metadata": {
    "content_type": "application/vnd.apple.mpegurl",
    "video": {
      "streams": [
        {
          "height_px": 1080,
          "width_px": 1890,
          "codec_name": "h264"
        }
      ],
      "duration_s": 105.7
    }
  }
}
```

---

## 🔍 Current Implementation

### What We Support Now:
✅ **HLS Streaming** (`.m3u8`)
- Using HLS.js for playback
- Adaptive bitrate streaming
- Multiple quality levels (1080p, 720p, 480p, 360p, 240p)

### What We DON'T Support:
❌ Direct MP4 videos (`video/mp4`)
❌ WebM videos (`video/webm`)
❌ MOV videos (`video/quicktime`)
❌ Other video formats

---

## 🎯 Recommendation: Expand Video Support

While current Farcaster data only contains HLS videos, we should support **all video formats** for:

1. **Future-proofing**: Other formats may be added later
2. **External embeds**: Users may link non-Farcaster videos
3. **Better compatibility**: Some platforms prefer MP4
4. **Fallback support**: If HLS fails, try direct video

### Proposed Support:

| Format | MIME Type | Extension | Player | Priority |
|--------|-----------|-----------|--------|----------|
| **HLS** | `application/vnd.apple.mpegurl` | `.m3u8` | HLS.js | 🔥 High (current) |
| **MP4** | `video/mp4` | `.mp4` | Native `<video>` | ⭐ Medium |
| **WebM** | `video/webm` | `.webm` | Native `<video>` | ⭐ Medium |
| **MOV** | `video/quicktime` | `.mov` | Native `<video>` | ⭐ Medium |
| **OGG** | `video/ogg` | `.ogg` | Native `<video>` | ⚡ Low |

---

## 💻 Implementation Plan

### 1. Update Video Parser

**Current (HLS-only):**
```typescript
private static isHLSUrl(url: string): boolean {
  return url.includes('.m3u8') || url.includes('stream.farcaster.xyz');
}
```

**Proposed (All formats):**
```typescript
private static isVideoUrl(url: string): boolean {
  // Check for HLS
  if (url.includes('.m3u8') || url.includes('stream.farcaster.xyz')) {
    return true;
  }
  
  // Check for direct video files
  const videoExtensions = ['.mp4', '.webm', '.mov', '.ogg', '.avi', '.mkv'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext));
}

private static getVideoType(url: string): 'hls' | 'direct' {
  if (url.includes('.m3u8') || url.includes('stream.farcaster.xyz')) {
    return 'hls';
  }
  return 'direct';
}
```

### 2. Update Video Player

**Current:**
- Always uses HLS.js

**Proposed:**
```typescript
// In VideoPlayer component
if (videoType === 'hls') {
  // Use HLS.js (current implementation)
  const hls = new Hls();
  hls.loadSource(videoUrl);
  hls.attachMedia(video);
} else {
  // Use native <video> element
  video.src = videoUrl;
  video.load();
}
```

### 3. Update Type Definitions

```typescript
interface ProcessedVideo {
  url: string;
  contentType: string;
  videoType: 'hls' | 'direct';  // NEW
  width?: number;
  height?: number;
  duration?: number;
  thumbnail?: string;
}
```

---

## 🧪 Testing Strategy

### Test Cases:

1. **HLS Video** (existing):
   - URL: `https://stream.farcaster.xyz/v1/video/xyz.m3u8`
   - Expected: HLS.js playback

2. **Direct MP4**:
   - URL: `https://example.com/video.mp4`
   - Expected: Native `<video>` playback

3. **Direct WebM**:
   - URL: `https://example.com/video.webm`
   - Expected: Native `<video>` playback

4. **Mixed Formats**:
   - Cast with multiple video embeds
   - Expected: All videos detected and playable

### Validation:

```typescript
// Test data structure
const testVideos = [
  { url: 'https://stream.farcaster.xyz/v1/video/test.m3u8', expected: 'hls' },
  { url: 'https://example.com/video.mp4', expected: 'direct' },
  { url: 'https://example.com/video.webm', expected: 'direct' },
];
```

---

## 📋 Current Status

### In Production Data:
- ✅ **100% HLS videos** (`stream.farcaster.xyz`)
- ❌ **0% direct MP4/WebM**

### Parser Status:
- ✅ HLS detection: Working
- ❌ MP4 detection: Not implemented
- ❌ WebM detection: Not implemented
- ❌ Other formats: Not implemented

### Player Status:
- ✅ HLS playback: Fully optimized
- ❌ Direct video playback: Not implemented

---

## 🚀 Next Steps

1. **Analyze Live API**:
   - Check if Neynar API returns other video formats
   - Test with real-time data

2. **Update Parser**:
   - Add support for all video formats
   - Detect video type (HLS vs direct)
   - Extract metadata for all types

3. **Update Player**:
   - Add conditional rendering based on video type
   - Keep HLS.js for HLS videos
   - Use native `<video>` for direct videos

4. **Test**:
   - Verify all formats work
   - Ensure performance isn't affected
   - Check mobile compatibility

5. **Document**:
   - Update README
   - Add format support table
   - Document fallback behavior

---

## 🎯 Conclusion

**Current State:**
- Only HLS videos in data
- Parser is HLS-only
- Works perfectly for current use case ✅

**Recommendation:**
- Expand to support all video formats
- Future-proof the application
- Better user experience for edge cases

**Effort:**
- Low (1-2 hours)
- Minimal risk
- High value for future

---

**Date**: October 16, 2025  
**Analyst**: Video Format Analysis  
**Status**: Ready for implementation

