# 📁 Project Structure

## Overview

This document describes the file organization and architecture of the Farcaster Video Feed application.

---

## 🏗️ Architecture

The application follows a **modular, layered architecture**:

```
├── Presentation Layer (Components)
├── Business Logic Layer (Hooks + Utils)
├── Data Layer (API Routes + Lib)
└── Configuration Layer (Config + Types)
```

---

## 📂 Directory Structure

### `/src/app/`
Main application directory (Next.js 14 App Router)

#### `/api/`
API routes for server-side logic

```
api/
└── feed/
    └── route.ts              # Video feed API endpoint
                              # Fetches from Neynar or local data
                              # Processes HLS videos
```

**Key Functions**:
- `GET()` - Fetch paginated video feed
- `HLSVideoParser` - Extract HLS videos from Farcaster casts
- Cursor-based pagination
- Error handling with fallbacks

---

#### `/components/`
React components (Client Components)

```
components/
├── VideoFeed.tsx             # Main feed container (413 lines)
│   ├── Virtual scrolling
│   ├── Intersection Observer
│   ├── Network-aware preloading
│   └── State management
│
├── VideoFeedItem.tsx         # Individual video card (220 lines)
│   ├── User info overlay
│   ├── Channel badge
│   ├── Cast text
│   ├── Stats (likes, comments)
│   └── Action buttons
│
├── VideoPlayer.tsx           # HLS video player (538 lines)
│   ├── HLS.js integration
│   ├── Auto-pause logic
│   ├── Error handling
│   ├── Retry with backoff
│   └── Performance tracking
│
├── VideoFeedItemSSR.tsx      # SSR version (optional)
│   └── Static HTML for first video
│
├── DesktopVideoFeed.tsx      # Desktop layout
│   └── Grid view with sidebar
│
└── PerformanceOverlay.tsx    # Dev metrics overlay
    ├── FPS monitor
    ├── Memory usage
    ├── Network stats
    └── Video startup times
```

**Component Hierarchy**:
```
VideoFeed (Parent)
  ├── VideoFeedItem (Child, memoized)
  │   └── VideoPlayer (Grandchild, memoized)
  └── PerformanceOverlay (Lazy loaded)
```

---

#### `/config/`
Application-wide configuration and constants

```
config/
└── constants.ts              # All app constants (190 lines)
    ├── PERFORMANCE           # Virtual scrolling, thresholds
    ├── VIDEO                 # HLS buffer, timeouts, retry
    ├── NETWORK               # Speed thresholds, preload
    ├── API                   # Endpoints, caching
    ├── UI                    # Breakpoints, z-index, colors
    ├── DEV                   # Feature flags
    └── ENV                   # Environment variables
```

**Philosophy**: All magic numbers and configuration in one place.

---

#### `/hooks/`
Custom React hooks for reusable logic

```
hooks/
├── index.ts                  # Barrel export for all hooks
│
├── useMemoryMonitor.ts       # Memory usage tracking (154 lines)
│   ├── useMemoryMonitor()    # Real-time heap monitoring
│   └── useComponentMemoryTracking() # Component mount/unmount
│
├── useNetworkQuality.ts      # Network detection (180 lines)
│   ├── useNetworkQuality()   # Connection type, speed, RTT
│   ├── shouldPreloadVideo()  # Preload decision logic
│   └── getHLSBufferSettings() # Adaptive buffer sizes
│
├── useVideoStartupMetrics.ts # Video startup timing (120 lines)
│   ├── useVideoStartupMetrics() # Hook
│   ├── reportVideoStartup()  # Report timing
│   └── getVideoStartupMetrics() # Get stats
│
├── useErrorMetrics.ts        # Error tracking (110 lines)
│   ├── useErrorMetrics()     # Hook
│   ├── reportVideoError()    # Report error
│   ├── reportVideoLoaded()   # Report success
│   └── getErrorMetrics()     # Get stats
│
├── useFirstInteraction.ts    # First Input Delay (154 lines)
│   ├── useFirstInteraction() # Hook
│   └── measureFirstInputDelay() # Measure FID
│
└── useLongTaskMonitor.ts     # Long task detection (80 lines)
    └── useLongTaskMonitor()  # Track tasks > 50ms
```

**Usage Example**:
```typescript
import { useMemoryMonitor, useNetworkQuality } from '@/app/hooks';

const { memoryUsage, trend } = useMemoryMonitor();
const networkInfo = useNetworkQuality();
```

---

#### `/lib/`
Server-side utilities (Server Components only)

```
lib/
└── fetchInitialVideos.ts     # SSR data fetcher (70 lines)
    └── fetchInitialVideos()  # Fetch videos server-side
                              # ISR with 60s revalidation
                              # Triple fallback strategy
```

**Key Features**:
- Runs on server only
- Uses `fs` for local data
- ISR caching
- Fallback to local data if API fails

---

#### `/utils/`
Client-side utilities (pure functions)

```
utils/
├── index.ts                  # Barrel export for all utils
│
├── performance.ts            # Performance monitoring (263 lines)
│   ├── FPSMonitor            # Track scroll FPS
│   ├── MemoryMonitor         # Track heap size
│   └── LongTaskMonitor       # Track main-thread tasks
│
├── taskScheduler.ts          # Main-thread optimization (233 lines)
│   ├── yieldToMain()         # Let browser breathe
│   ├── processArrayInChunks() # Non-blocking array processing
│   ├── rafThrottle()         # RequestAnimationFrame throttle
│   └── observeLongTasks()    # PerformanceObserver wrapper
│
├── hls.ts                    # HLS.js utilities (NEW, 140 lines)
│   ├── isHLSSupported()      # Check HLS.js support
│   ├── isNativeHLSSupported() # Check Safari native
│   ├── createHLSInstance()   # Create configured HLS
│   ├── loadHLSSource()       # Load video source
│   ├── destroyHLS()          # Cleanup
│   └── handleHLSError()      # Error recovery
│
├── video.ts                  # Video utilities (NEW, 120 lines)
│   ├── calculateRetryDelay() # Exponential backoff
│   ├── shouldRetryVideo()    # Retry decision
│   ├── formatDuration()      # Format seconds
│   ├── getVideoAspectRatio() # Calculate aspect ratio
│   ├── isHLSUrl()            # Check if URL is HLS
│   ├── pauseVideo()          # Safe pause
│   ├── playVideo()           # Safe play
│   └── getVideoLoadState()   # Check load state
│
├── dom.ts                    # DOM utilities (NEW, 110 lines)
│   ├── isClient()            # SSR check
│   ├── isMobile()            # Mobile detection
│   ├── isDesktop()           # Desktop detection
│   ├── getViewportDimensions() # Width/height
│   ├── scrollToElement()     # Smooth scroll
│   ├── isElementInViewport() # Visibility check
│   ├── copyToClipboard()     # Clipboard API
│   ├── debounce()            # Debounce function
│   └── throttle()            # Throttle function
│
└── format.ts                 # Formatting utilities (NEW, 100 lines)
    ├── formatNumber()        # 1,000,000
    ├── formatCompactNumber() # 1M, 1K
    ├── formatBytes()         # 1.5 MB
    ├── formatMilliseconds()  # 2.5s
    ├── formatRelativeTime()  # 2 hours ago
    ├── formatDate()          # Jan 1, 2024
    ├── truncateText()        # Text...
    ├── formatFPS()           # 60 FPS
    └── formatPercentage()    # 95.5%
```

**Usage Example**:
```typescript
import { createHLSInstance, formatBytes, isMobile } from '@/app/utils';

const hls = createHLSInstance('fast');
const size = formatBytes(1024000); // "1 MB"
const mobile = isMobile(); // true/false
```

---

#### Root Files

```
app/
├── layout.tsx                # Root layout (Server Component)
│   ├── Metadata exports
│   ├── Font loading
│   └── Global structure
│
├── page.tsx                  # Home page (Server Component)
│   ├── fetchInitialVideos()
│   └── Pass SSR data to VideoFeed
│
├── viewport.ts               # Viewport metadata
│   └── Mobile-optimized viewport
│
├── globals.css               # Global styles
│   ├── Tailwind directives
│   ├── Custom CSS
│   └── GPU acceleration
│
├── error.tsx                 # Error boundary
├── global-error.tsx          # Root error boundary
└── not-found.tsx             # 404 page
```

---

### `/data/`
Local cached data for development

```
data/
├── casts.json                # Primary dataset (50 videos)
└── casts-1.json              # Alternative dataset
```

**Usage**: Set `NEXT_PUBLIC_USE_DUMMY_DATA=true` to use local data.

---

### `/types/`
TypeScript type definitions

```
types/
└── neynar.ts                 # Neynar API types
    ├── Cast                  # Farcaster cast
    ├── User                  # User profile
    ├── Channel               # Channel info
    ├── Reactions             # Likes, recasts
    ├── ProcessedVideo        # Video metadata
    ├── VideoFeedItem         # Feed item
    └── NeynarFeedResponse    # API response
```

**Philosophy**: Strict typing for all external data.

---

### `/public/`
Static assets

```
public/
├── default-avatar.png        # Fallback avatar
├── default-channel.png       # Fallback channel icon
├── favicon.ico               # Site favicon
└── *.svg                     # Icon assets
```

---

## 📊 File Size Analysis

### Large Files (Need Refactoring?)

| File | Lines | Status | Reason |
|------|-------|--------|--------|
| `VideoPlayer.tsx` | 538 | ✅ OK | Complex video logic (HLS, errors, retry) |
| `VideoFeed.tsx` | 413 | ✅ OK | Main container (state, observers, preload) |
| `performance.ts` | 263 | ✅ OK | 3 separate monitor classes |
| `taskScheduler.ts` | 233 | ✅ OK | Multiple scheduling utilities |
| `VideoFeedItem.tsx` | 220 | ✅ OK | Complete video card with actions |
| `constants.ts` | 190 | ✅ OK | Comprehensive configuration |

**Verdict**: All files are appropriately sized for their responsibilities.

---

## 🔄 Data Flow

### 1. Initial Load (SSR)

```
Server (page.tsx)
  └── fetchInitialVideos()
      ├── Try API route
      ├── Fallback: local data
      └── Fallback: empty
          ↓
Client (VideoFeed)
  └── useState(initialVideos)  # Hydration
      └── Skip client-side fetch
```

### 2. Scroll & Pagination

```
User scrolls
  ↓
IntersectionObserver fires
  ↓
setCurrentIndex(newIndex)
  ↓
Video becomes active
  ├── Previous video: destroys HLS
  ├── Current video: starts playing
  └── Next video: preloads (if fast network)
  ↓
Near end of list?
  └── loadMoreVideos()
      └── fetch('/api/feed?cursor=...')
```

### 3. Error Handling

```
Video fails to load
  ↓
HLS error event
  ↓
handleHLSError()
  ├── Network error → retry
  ├── Media error → recoverMediaError()
  └── Fatal error → show poster
      ↓
Retry with exponential backoff
  ├── Attempt 1: 1 second
  ├── Attempt 2: 2 seconds
  ├── Attempt 3: 4 seconds
  └── Max retries → show error UI
```

---

## 🎯 Import Strategy

### Barrel Exports

**Hooks**: `import { useMemoryMonitor } from '@/app/hooks'`
**Utils**: `import { formatBytes } from '@/app/utils'`
**Config**: `import { VIDEO, PERFORMANCE } from '@/app/config/constants'`

### Benefits
- Clean imports
- Easy refactoring
- Consistent API
- Better tree-shaking

---

## 🧪 Testing Strategy

### Unit Tests
```
__tests__/
├── utils/
│   ├── video.test.ts
│   ├── format.test.ts
│   └── dom.test.ts
├── hooks/
│   └── useNetworkQuality.test.ts
└── components/
    └── VideoPlayer.test.tsx
```

### Integration Tests
- API route (`/api/feed`)
- SSR data fetching
- Component hydration

### E2E Tests
- Full scroll flow
- Video playback
- Error recovery
- Network throttling

---

## 📈 Performance Optimization Points

### 1. Components
- ✅ Memoization (`memo`)
- ✅ Callback memoization (`useCallback`)
- ✅ Virtual scrolling (3 videos max)
- ✅ Lazy loading (desktop components)

### 2. Data Fetching
- ✅ SSR for first load
- ✅ ISR with 60s revalidation
- ✅ Cursor-based pagination
- ✅ Network priority hints

### 3. Video Playback
- ✅ HLS adaptive bitrate
- ✅ Network-aware buffering
- ✅ Adjacent video preloading
- ✅ Auto-pause off-screen

### 4. Memory Management
- ✅ HLS cleanup on unmount
- ✅ Event listener cleanup
- ✅ WeakMap for caching
- ✅ Passive event listeners

---

## 🚀 Build Output

### Production Build

```
Route (app)                         Size     First Load JS
┌ ○ /                               5.2 kB          120 kB
├ ○ /api/feed                       0 B                0 B
└ ○ /test                           2.1 kB           95 kB

○ (Static)  prerendered as static content

First Load JS shared by all         87 kB
  ├ chunks/main.js                  31 kB
  ├ chunks/framework.js             42 kB
  └ other chunks                    14 kB
```

### Bundle Analysis

| Package | Size | Purpose |
|---------|------|---------|
| React | 42 KB | Core framework |
| Next.js | 31 KB | Routing, SSR |
| HLS.js | 125 KB | Video streaming |
| Lucide | 18 KB | Icons |
| Tailwind | 14 KB | Styles |
| **Total** | **230 KB** | (gzipped) |

---

## 🔐 Security Considerations

### Environment Variables
- ✅ API keys in `.env.local` (not committed)
- ✅ Server-only secrets in API routes
- ✅ Client-safe variables prefixed with `NEXT_PUBLIC_`

### Content Security
- ✅ HLS video URLs validated
- ✅ Image URLs validated
- ✅ XSS prevention (React escaping)
- ✅ CORS configured

### Rate Limiting
- ⚠️ TODO: Add rate limiting to API routes
- ⚠️ TODO: Add request deduplication

---

## 📝 Code Style Guide

### Naming Conventions
- **Components**: PascalCase (`VideoFeed.tsx`)
- **Utils**: camelCase (`formatBytes`)
- **Constants**: UPPER_SNAKE_CASE (`VIDEO.RETRY.MAX_ATTEMPTS`)
- **Hooks**: camelCase with `use` prefix (`useMemoryMonitor`)
- **Types**: PascalCase (`VideoFeedItem`)

### File Organization
```typescript
// 1. Imports (external first, then internal)
import React from 'react';
import { ProcessedVideo } from '@/types/neynar';

// 2. Types/Interfaces
interface VideoPlayerProps { }

// 3. Constants
const MAX_RETRIES = 3;

// 4. Main component/function
export function VideoPlayer() { }

// 5. Helper functions
function calculateDelay() { }
```

### Comments
- ✅ JSDoc for public functions
- ✅ Inline comments for complex logic
- ✅ TODO comments for future improvements
- ❌ No commented-out code in production

---

## 🎓 Learning Resources

### Key Concepts Used
1. **Virtual Scrolling** - Render only visible items
2. **Intersection Observer** - Detect when elements enter viewport
3. **HLS.js** - HTTP Live Streaming in browser
4. **React 18** - Server Components, Suspense, startTransition
5. **Next.js 14** - App Router, SSR, ISR, API routes
6. **Performance API** - FPS, memory, long tasks monitoring

### Recommended Reading
- [Next.js App Router](https://nextjs.org/docs/app)
- [HLS.js Documentation](https://github.com/video-dev/hls.js/)
- [Web Vitals](https://web.dev/vitals/)
- [React Performance](https://react.dev/learn/render-and-commit)

---

*Last Updated: October 16, 2025*

