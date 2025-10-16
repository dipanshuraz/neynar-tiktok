# 🔧 Troubleshooting Guide

## Common Issues and Solutions

### ❌ Error: "Cannot find module './422.js'" (or similar numbered modules)

**Symptoms:**
- Next.js shows "Server Error"
- Error message: `Error: Cannot find module './422.js'` (or other numbered files)
- Long require stack trace pointing to `.next/server/` directory

**Root Cause:**
- Corrupted Next.js build cache (`.next` directory)
- Happens after code changes, interrupted builds, or git operations
- Next.js sometimes doesn't clean up old chunks properly

**Solution:**
```bash
# 1. Stop the dev server (Ctrl+C or Command+C)

# 2. Clean the cache
rm -rf .next
rm -rf node_modules/.cache

# 3. Restart dev server
pnpm run dev

# Should be working now! ✅
```

**Prevention:**
- If you see weird build errors, always try cleaning `.next` first
- After pulling code changes: `rm -rf .next && pnpm run dev`
- After switching git branches: clean cache before starting

---

### ❌ Port Already in Use

**Symptoms:**
- Error: `EADDRINUSE: address already in use :::3000`
- Dev server won't start

**Solution:**
```bash
# Option 1: Kill the process using port 3000
killall node

# Option 2: Find and kill specific process
lsof -ti:3000 | xargs kill -9

# Then restart
pnpm run dev
```

---

### ❌ Module Not Found / Import Errors

**Symptoms:**
- `Module not found: Can't resolve 'xyz'`
- Import errors after adding new dependencies

**Solution:**
```bash
# 1. Reinstall dependencies
pnpm install

# 2. Clean cache
rm -rf .next
rm -rf node_modules/.cache

# 3. Restart
pnpm run dev
```

---

### ❌ TypeScript Errors

**Symptoms:**
- Red squiggly lines in IDE
- Type errors during build

**Solution:**
```bash
# Check for errors
pnpm run type-check

# If errors persist, restart TypeScript server in VSCode:
# Command Palette (Cmd+Shift+P) → "TypeScript: Restart TS Server"
```

---

### ❌ Build Fails in Production

**Symptoms:**
- `pnpm run build` fails
- Works in dev but not in production build

**Solution:**
```bash
# 1. Clean everything
rm -rf .next
rm -rf node_modules/.cache

# 2. Fresh install
rm -rf node_modules
pnpm install

# 3. Try build again
pnpm run build

# 4. Check for console.log statements that break SSR
# 5. Check for browser-only APIs used in Server Components
```

---

### ❌ Slow Performance / Memory Issues

**Symptoms:**
- App becomes slow over time
- High memory usage
- Videos stuttering

**Solution:**
```bash
# 1. Check performance overlay (dev mode only)
# Open http://localhost:3000 and check top-right corner

# 2. Clear browser cache
# DevTools → Application → Clear storage → Clear site data

# 3. Check for memory leaks
# DevTools → Memory → Take heap snapshot
# Look for detached DOM nodes or growing arrays

# 4. Restart dev server
# Sometimes Next.js dev server accumulates memory
killall node && pnpm run dev
```

---

### ❌ Videos Not Loading

**Symptoms:**
- Infinite loading spinner
- "Loading video..." message
- Videos show poster but don't play

**Solution:**
```bash
# 1. Check network tab in DevTools
# Look for failed requests to video URLs

# 2. Verify API is working
# Open http://localhost:3000/api/feed
# Should return JSON with videos array

# 3. Check console for HLS errors
# Look for "HLS Error" messages

# 4. Try clearing localStorage
localStorage.clear()
location.reload()

# 5. Check if videos are actually HLS streams
# Some videos might be direct MP4s (not supported yet)
```

---

### ❌ Mute State Not Persisting

**Symptoms:**
- Unmute video → refresh → muted again

**Status:** ✅ FIXED (Oct 16, 2025)
**See:** [PLAYBACK_PREFERENCES_FIX.md](./PLAYBACK_PREFERENCES_FIX.md)

---

### ❌ Video Not Autoplaying on Load

**Symptoms:**
- Page loads but video doesn't start playing
- Stuck on loading screen or thumbnail

**Status:** ✅ FIXED (Oct 16, 2025)
**See:** [AUTOPLAY_FIX.md](./AUTOPLAY_FIX.md)

---

## Quick Fixes Checklist

When something goes wrong, try these in order:

- [ ] **Refresh the page** (F5 or Cmd+R)
- [ ] **Clear cache:** `rm -rf .next && pnpm run dev`
- [ ] **Restart dev server:** Stop (Ctrl+C) and `pnpm run dev`
- [ ] **Kill all node processes:** `killall node && pnpm run dev`
- [ ] **Reinstall dependencies:** `rm -rf node_modules && pnpm install`
- [ ] **Clear browser storage:** DevTools → Application → Clear storage
- [ ] **Check for errors:** Look at browser console and terminal
- [ ] **Read error messages carefully:** They usually tell you what's wrong!

---

## Emergency Reset (Nuclear Option)

If nothing else works:

```bash
# ⚠️ This will delete everything and reinstall from scratch

# 1. Stop all servers
killall node

# 2. Clean everything
rm -rf .next
rm -rf node_modules
rm -rf node_modules/.cache
rm -rf .next/cache

# 3. Fresh install
pnpm install

# 4. Rebuild
pnpm run build

# 5. Start fresh
pnpm run dev

# ✅ Should be working now!
```

---

## Getting Help

If you're still stuck:

1. **Check the documentation:**
   - `README.md` - Setup and overview
   - `PROJECT_STRUCTURE.md` - Code organization
   - `PERFORMANCE_SUMMARY.md` - Performance details

2. **Check specific fix docs:**
   - `PLAYBACK_PREFERENCES_FIX.md` - Mute state persistence
   - `AUTOPLAY_FIX.md` - Video autoplay issues
   - `VERIFY_FIX.md` - Verification steps

3. **Check the console:**
   - Browser DevTools → Console
   - Terminal where dev server is running
   - Look for error messages with stack traces

4. **Check git status:**
   ```bash
   git status
   git diff
   # Make sure you don't have uncommitted changes causing issues
   ```

5. **Try a fresh clone:**
   ```bash
   cd ..
   git clone <repo-url> farcaster-feed-fresh
   cd farcaster-feed-fresh
   pnpm install
   pnpm run dev
   ```

---

## Prevention Tips

**To avoid common issues:**

✅ **Always clean cache after:**
- Pulling code changes
- Switching git branches
- Installing/updating dependencies
- Seeing weird errors

✅ **Use version control:**
- Commit working code frequently
- Use descriptive commit messages
- Create branches for experimental changes

✅ **Monitor performance:**
- Check the performance overlay in dev mode
- Watch for memory leaks
- Profile with Chrome DevTools when needed

✅ **Keep dependencies updated:**
```bash
# Check for updates
pnpm outdated

# Update (carefully!)
pnpm update

# Test after updating!
pnpm run build
```

---

## Environment Issues

### Node Version
```bash
# Check Node version
node -v
# Should be 18.x or 20.x

# If wrong version, use nvm:
nvm install 20
nvm use 20
```

### pnpm Issues
```bash
# Reinstall pnpm if needed
npm install -g pnpm

# Or use npm instead:
npm install
npm run dev
```

---

**Last Updated:** October 16, 2025  
**App Version:** Farcaster Video Feed v1.0  
**Next.js Version:** 14.2.15

