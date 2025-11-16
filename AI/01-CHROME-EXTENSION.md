# Chrome Extension Documentation

## 📁 Location: `/extension/`

## 🎯 Purpose
Detects win notifications on Whatnot.com pages and sends them to the local server for processing and printing.

## 📋 Files Structure
```
extension/
├── manifest.json       # Extension configuration
├── background.js       # Service worker (message forwarding)
├── content.js         # Main detection logic
└── icon128.png        # Extension icon
```

## 🔧 Installation
1. Open Chrome: `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `/extension/` folder

## 📄 manifest.json Configuration

```json
{
  "manifest_version": 3,
  "name": "Whatnot Auto Print",
  "version": "1.0",
  "permissions": ["scripting", "activeTab", "tabs", "background"],
  "host_permissions": [
    "http://localhost:7777/*",
    "https://*.whatnot.com/*"
  ],
  "content_scripts": [{
    "matches": [
      "https://www.whatnot.com/live/*",
      "https://whatnot.com/live/*", 
      "https://www.whatnot.com/dashboard/live/*",
      "https://whatnot.com/dashboard/live/*"
    ],
    "js": ["content.js"],
    "run_at": "document_end"
  }],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### Permissions Explained
- `scripting` + `activeTab`: Inject content scripts into Whatnot pages
- `tabs` + `background`: Keep service worker alive and detect page changes
- `host_permissions`: Access localhost server and Whatnot domains

## 🤖 background.js - Service Worker

### Purpose
Forwards messages from content scripts to the local server and maintains service worker keep-alive.

### Key Functions

#### `keepAlive()`
```javascript
function keepAlive() {
    if (chrome.runtime && chrome.runtime.id) {
        // Service worker still alive
    }
    try {
        chrome.runtime.connect({ name: 'keepAlive' }).disconnect();
    } catch (e) {
        // Ignore errors
    }
}
```
- Runs every 15 seconds to prevent Chrome from terminating the service worker
- Uses multiple keep-alive strategies (timers + connections)

#### `startKeepAlive()`
- Initializes aggressive keep-alive system
- Triggers on extension startup, tab changes, window focus

#### Message Forwarding
```javascript
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WIN_EVENT") {
        fetch("http://localhost:7777/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(msg.payload)
        })
    }
});
```

### Service Worker Events
- `chrome.runtime.onStartup` - Extension startup
- `chrome.runtime.onInstalled` - First install or update
- `chrome.tabs.onUpdated` - Page navigation
- `chrome.tabs.onActivated` - Tab switching
- `chrome.windows.onFocusChanged` - Window focus

## 🕵️ content.js - Win Detection Engine

### Purpose
Scans Whatnot pages for win notifications and extracts winner data (name, item, price).

### Key Variables

#### Throttling System
```javascript
const recentWins = new Map(); // Key: "name|item|price", Value: timestamp
const THROTTLE_WINDOW = 5000; // 5 seconds
```

#### Scanning Control
```javascript
let lastScanTime = 0;
const SCAN_THROTTLE = 1000; // Max 1 scan per second
```

### Core Functions

#### `sendHeartbeat()`
```javascript
function sendHeartbeat() {
    fetch('http://localhost:7777/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: Date.now() })
    }).catch(() => {}); // Silent heartbeat
}
```
- Sends heartbeat every 2 seconds to prove extension is active
- Server uses this for extension status detection

#### `isRecentlyThrottled(name, item, price)`
```javascript
function isRecentlyThrottled(name, item, price) {
    const key = `${name}|${item}|${price || 'no-price'}`;
    const now = Date.now();
    const lastSent = recentWins.get(key);
    
    if (lastSent && (now - lastSent) < THROTTLE_WINDOW) {
        return true; // Skip - too recent
    }
    
    recentWins.set(key, now);
    return false;
}
```
- Prevents sending identical win events within 5 seconds
- Uses Map for O(1) lookup performance
- Auto-cleans old entries to prevent memory leaks

#### `scan()`
```javascript
function scan() {
    const now = Date.now();
    if (now - lastScanTime < SCAN_THROTTLE) {
        return; // Throttled - max 1 scan per second
    }
    lastScanTime = now;
    
    const allText = document.body.innerText || document.body.textContent || '';
    // ... win detection logic
}
```
- Scans entire page text for win patterns
- Throttled to maximum 1 scan per second
- Triggered by DOM mutations and periodic intervals

#### `parseWins(text)`
Detects win patterns in page text:

**Sale Win Patterns:**
```javascript
/(\w+)\s+won!\s*(?:.*?)(?:\$(\d+(?:\.\d{2})?))?/gi
/(\w+)\s+won\s+the\s+auction[!.]?\s*(?:.*?)(?:\$(\d+(?:\.\d{2})?))?/gi
```

**Giveaway Win Patterns:**
```javascript
/(\w+)\s+won\s+the\s+giveaway[!.]?/gi
/congratulations\s+(\w+).*?giveaway/gi
```

#### `findPrice()`
Advanced price detection with multiple strategies:

1. **Whatnot-specific selectors**:
   ```javascript
   '[data-testid*="price"]'
   '[class*="price"]'
   '.currency, .amount, .bid'
   ```

2. **Modal/popup priority**: Searches win announcement modals first
3. **Regex patterns**: `$XX.XX` format detection
4. **Context filtering**: Excludes shipping, tax, non-auction prices

#### `sendWin(eventType, name, item, price)`
```javascript
function sendWin(eventType, name, item, price) {
    // Client-side throttling check
    if (isRecentlyThrottled(name, item, price)) {
        return;
    }
    
    // Visual confirmation
    const winAlert = document.createElement('div');
    winAlert.textContent = `🎉 WIN DETECTED: ${name}`;
    
    // Dual-path communication
    try {
        if (chrome.runtime && chrome.runtime.sendMessage && chrome.runtime.id) {
            chrome.runtime.sendMessage({
                type: "WIN_EVENT",
                payload: { type: eventType, name, item, price }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    sendDirectToServer(eventType, name, item, price);
                }
            });
        } else {
            sendDirectToServer(eventType, name, item, price);
        }
    } catch (error) {
        sendDirectToServer(eventType, name, item, price);
    }
}
```

#### `sendDirectToServer(eventType, name, item, price)`
Fallback communication when service worker fails:
```javascript
fetch('http://localhost:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: eventType, name, item, price })
})
```

### Background Connection Keep-Alive

#### `maintainBackgroundConnection()`
```javascript
function maintainBackgroundConnection() {
    backgroundPort = chrome.runtime.connect({ name: 'keepAlive' });
    
    backgroundPort.onDisconnect.addListener(() => {
        backgroundPort = null;
        setTimeout(maintainBackgroundConnection, 1000); // Reconnect
    });
    
    // Send pings every 10 seconds
    const pingInterval = setInterval(() => {
        if (backgroundPort) {
            backgroundPort.postMessage({ type: 'ping' });
        }
    }, 10000);
}
```

### DOM Monitoring

#### Mutation Observer (Debounced)
```javascript
const obs = new MutationObserver((mutations) => {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
        scan(); // Debounced scan after DOM settles
    }, 500);
});
obs.observe(document.body, { subtree: true, childList: true, characterData: true });
```

#### Periodic Scanning
```javascript
setInterval(() => {
    scan(); // Backup scan every 10 seconds
}, 10000);
```

## 🎯 Win Detection Logic

### Page Type Detection
```javascript
const isLivePage = window.location.href.includes('/live/');
const isDashboard = window.location.href.includes('/dashboard/live/');
```

### Text Processing
1. **Full Page Scan**: `document.body.innerText`
2. **Pattern Matching**: Multiple regex patterns for different win types
3. **Price Extraction**: Context-aware price detection
4. **Item Detection**: Extracts auction item names from surrounding text

### Error Recovery
- **Service worker termination**: Direct server communication
- **Extension context invalidation**: Fallback fetch() calls  
- **Network errors**: Silent failure with retry logic
- **DOM parsing errors**: Graceful degradation

## 🔧 Debugging Features

### Console Output
- Extension activity logs (minimal in production)
- Win detection confirmations
- Throttling notifications  
- Connection status updates

### Visual Notifications
- Win detection alerts (5-second display)
- Page type indicators (6-second display)
- Extension status notifications

## ⚠️ Known Limitations

1. **Chrome Service Worker**: May terminate after 30 seconds of inactivity
2. **DOM Dependent**: Relies on Whatnot's HTML structure
3. **Pattern Matching**: May need updates if Whatnot changes win text
4. **Local Only**: Requires localhost server to be running

## 🔄 Update Process

1. Modify extension files
2. Go to `chrome://extensions/`  
3. Click "Reload" button for Whatnot Auto Print extension
4. Test on Whatnot live pages
5. Check browser console for errors

## 📊 Performance Metrics

- **Scan Frequency**: Max 1/second + DOM change debouncing
- **Memory Usage**: Map cleanup prevents growth
- **CPU Impact**: Minimal (regex + DOM text extraction)
- **Network Calls**: 2-second heartbeat + win events only