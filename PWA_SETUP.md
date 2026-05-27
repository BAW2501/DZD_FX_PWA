# DZD Currency Converter - PWA Setup Guide

## What is manifest.json?

`manifest.json` is a JSON file that tells mobile browsers how to display your app when installed as a Progressive Web App (PWA). It includes:

- **App metadata** (name, description, icons)
- **Display behavior** (standalone mode = fullscreen app, not browser)
- **Theme colors** (status bar, splash screen)
- **Start URL** (where to load when launched)
- **Screenshots** (for app stores, play store listings)
- **Shortcuts** (quick actions on home screen)

## PWA Offline Features

Your app now includes:

### 1. **manifest.json**
Defines the app as installable on mobile devices and app stores.

### 2. **service-worker.js**
Background service that enables offline functionality:
- **Caches** essential files (HTML, CSS, JS)
- **Network-first** strategy for API calls (uses network if available, falls back to cache)
- **Cache-first** strategy for assets (instant loading from cache)
- **Periodic updates** (checks for new content every 60 seconds)

### 3. **Offline Support**
- Users can open the app without internet
- Cached exchange rates display from last session
- Status indicator shows "Online" or "Offline (cached data)"
- Automatic update notifications when new version available

### 4. **Installation**
Users can:
- Add to home screen (iOS/Android)
- Open as standalone app (fullscreen, no address bar)
- Launch from app drawer
- Create shortcuts

## How to Test

### Desktop (Chrome/Edge)
1. Open DevTools (F12)
2. Go to Application → Service Workers
3. Check "Offline" box
4. Refresh page - app still works!

### Mobile (Real Device)
1. Open in browser
2. Tap menu (⋯) → "Add to Home Screen"
3. Tap "Add"
4. Launch from home screen
5. Works offline automatically

### Testing Offline Mode
1. Installed app → Airplane mode → App still loads
2. Network tab shows cached responses
3. Status bar shows "Offline (cached data)"

## File Structure

```
DZD_FX_PWA/
├── index.html          ← Main app (updated with SW registration)
├── app.js              ← App logic
├── style.css           ← Styling
├── manifest.json       ← PWA metadata (NEW)
└── service-worker.js   ← Offline caching (NEW)
```

## Deployment Requirements

For production:
1. **HTTPS required** (Service Workers only work on HTTPS, except localhost)
2. **Valid manifest.json** linked in HTML ✓
3. **Proper cache headers** (set Cache-Control for assets)
4. **MIME types** (manifest.json should be `application/json`)

## Performance Benefits

✅ **Instant loading** - Assets served from cache  
✅ **Offline access** - Uses cached data  
✅ **Reduced bandwidth** - API responses cached  
✅ **Smooth experience** - No loading spinners for cached content  
✅ **App-like feel** - Standalone display mode  

## Update Your API Calls

If your `app.js` makes API calls, the Service Worker automatically:
1. Tries network first
2. Caches successful responses
3. Serves from cache when offline

Example in your app:
```javascript
// This just works - SW handles caching automatically!
fetch('https://api.example.com/rates')
  .then(r => r.json())
  .then(data => {
    // data comes from network or cache
  })
```

## Troubleshooting

**App not installing on mobile?**
- Check manifest.json is valid JSON (use jsonlint.com)
- Ensure icons load correctly
- Requires HTTPS in production

**Changes not reflecting after update?**
- Service Worker caches for performance
- Hard refresh (Ctrl+Shift+R) clears cache
- Or wait for auto-update check (every 60 seconds)

**Offline features not working?**
- Service Worker requires HTTPS (except localhost)
- Check DevTools → Application → Service Workers
- Check for errors in console

## Next Steps

1. Deploy to HTTPS server (required for production)
2. Test offline functionality on real devices
3. Monitor Service Worker updates in DevTools
4. Submit to Google Play Store (PWA support)

---

Your app is now a full Progressive Web App! 🚀
