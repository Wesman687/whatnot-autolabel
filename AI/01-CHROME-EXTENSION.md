# Chrome Extension Documentation

## 📁 Location: `/extension/`

## 🎯 Purpose
Detects win notifications on Whatnot.com pages and sends them to the local server for processing and printing. Also provides manual print buttons on item cards in the seller dashboard for on-demand printing.

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
- Server considers extension inactive after 10 seconds without heartbeat
- Used by GUI to display "Extension: ACTIVE" vs "Extension: NO ACTIVITY"

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

#### `findPrice()` and `findWhatnotPrice()`
Advanced price detection with multiple strategies (in order of priority):

1. **Specialized Whatnot Price Detection** (`findWhatnotPrice()`):
   - Targets exact Whatnot price element: `strong.text-right.text-neutrals-opaque-50.tabular-nums`
   - Falls back to partial selectors if exact match fails
   - Looks for exact price format: `$XX` or `$XX.XX` as standalone text

2. **Modal/Popup Priority**: Searches win announcement modals first
   - Looks for standalone prices in modal text
   - Checks for "Sold" context with price

3. **Whatnot-Specific Selectors**:
   ```javascript
   'strong.text-right.text-neutrals-opaque-50.tabular-nums'
   'strong[class*="tabular-nums"]'
   '[data-testid*="price"]'
   '[class*="price"]'
   ```

4. **Page Text Scanning**: 
   - Scans full page text for price patterns near "won", "winning", "bid", "sold" keywords
   - Filters out item description prices (e.g., "2nd Gen", "inch", "gb")
   - Returns highest valid price (most likely winning bid)

5. **Context Filtering**: 
   - Excludes shipping, tax, non-auction prices
   - Rejects prices in item description context
   - Validates reasonable price range ($1-$10,000)

#### `sendWin(eventType, name, item, price)`
```javascript
function sendWin(eventType, name, item, price) {
    // Client-side throttling check
    if (isRecentlyThrottled(name, item, price)) {
        return;
    }
    
    // Payment pending check - CRITICAL: block if payment pending
    if (isPaymentPending(name, item)) {
        console.log(`⏸️ [PAYMENT] Skipping win for ${name} - ${item} (payment pending)`);
        return; // Don't send win, don't print, don't announce
    }
    
    // Visual confirmation
    const winAlert = document.createElement('div');
    winAlert.textContent = `🎉 WIN DETECTED: ${name}`;
    
    // Check if we should announce to chat
    checkAndAnnounceToChat(item, name, price);
    
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

#### `sendManualPrint(eventType, name, item, price)`
Sends manual print request (bypasses pause setting):
```javascript
// Checks payment pending (warns but still allows manual print)
if (isPaymentPending(name, item)) {
    console.log(`⚠️ [MANUAL-PRINT] WARNING: Payment pending for ${name} - ${item}`);
}

fetch('http://localhost:7777/manual-print', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, name, item, price })
})
.then(() => {
    // Only announce to chat if payment is NOT pending
    if (!isPaymentPending(name, item)) {
        checkAndAnnounceToChat(item, name, price);
    }
})
```
- Used by manual print buttons
- Always prints regardless of pause setting
- Still requires active show
- Warns if payment pending but allows override
- Blocks chat announcements if payment pending

#### `sendToWheelServer(title, buyer, price)`
Sends wheel item buys to separate wheel server:
```javascript
// Extracts numeric amount from price (e.g., "$15.50" -> "15.50")
const amount = price.match(/[\d.]+/)?.[0] || "";

fetch('http://localhost:3800/buy-notification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        buyer: buyer,
        amount: amount,
        message: `Thanks for purchasing ${title}!`
    })
})
```
- Only called for items containing "wheel" in title
- Checks payment pending status before sending (blocks if pending)
- Checks GUI setting for wheel spin announcements
- Silent error handling (wheel server may not be running)
- Separate from main label printing system

#### `announceWheelWinToChat(title, buyer, price)`
Announces wheel wins to Whatnot chat:
```javascript
// Finds chat input using Whatnot-specific selectors
const chatInput = document.querySelector('input[data-cy="chat_text_field"]');
// Sets message: "🎡 {buyer} won {title} for {price}!"
// Sends via Enter key
```
- Uses Whatnot-specific selectors: `input[data-cy="chat_text_field"]`, `input.chatInput`
- React-compatible value setting
- Sends via Enter key (Whatnot's method)
- Handles multiple send button strategies with Enter key fallback

#### `checkPendingWheelAnnouncements()`
Polls for pending wheel announcements from wheel server:
```javascript
fetch('http://localhost:7777/status')
.then(r => r.json())
.then(data => {
    const announcements = data.pending_wheel_announcements || [];
    // Announces each to chat, then clears from queue
})
```
- Polls every 2 seconds (faster than regular scanning)
- Gets announcements from `/status` endpoint
- Announces each to chat with 500ms stagger
- Clears announcements after processing

#### `checkAndAnnounceToChat(item, buyer, price)`
Checks if item should be announced to chat based on title patterns:
```javascript
fetch('http://localhost:7777/chat-announce-settings')
.then(r => r.json())
.then(settings => {
    if (settings.announce_to_chat && matchesPattern(item, settings.chat_announce_patterns)) {
        announceWheelWinToChat(item, buyer, price);
    }
})
```
- Checks GUI setting for chat announcements enabled
- Matches item title against configured patterns (case-insensitive)
- Only announces if enabled and pattern matches

#### `isPaymentPending(name, item)`
Checks if payment is pending for a win:
```javascript
const allText = document.body?.innerText || '';
const buyerPattern = new RegExp(`(${name})[\\s\\S]{0,200}Payment Pending`, 'i');
const match = allText.match(buyerPattern);
// Returns true if "Payment Pending" found near buyer name (and not "Sold for")
```
- Searches for "Payment Pending" near buyer name
- Distinguishes between "Payment Pending" and "Sold for" (paid)
- Returns false on error (backward compatibility)
- Used to block printing, wheel server sends, and chat announcements

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

## 🖨️ Manual Print Buttons Feature

### Overview
The extension automatically injects print buttons (🖨️) onto item cards in the Whatnot seller dashboard, allowing on-demand printing without waiting for automatic win detection.

### Button Injection (`injectPrintButtons()`)

**Location**: Item cards in seller dashboard with buyer/payment information

**Detection Strategy**:
1. Finds flex container cards (`.flex.flex-row.gap-4`)
2. Identifies item titles (text elements that aren't buyer/payment info)
3. Verifies card contains buyer information
4. Extracts buyer name, item title, and price from card text

**Data Extraction**:
- **Buyer Name**: Extracted from "Buyer: username" pattern or colored username text
- **Item Title**: Uses actual item title from card (e.g., "Item in hand 124")
- **Price**: Extracted from "Payment Pending: $XX" or "Sold for $XX" patterns
- **Event Type**: Auto-detects sales vs giveaways based on price ($0 = giveaway) and context

**Button Behavior**:
- Appears inline with item title text
- Shows ✅ briefly when clicked to confirm action
- Shows ⏸️ icon (orange) when payment is pending (disabled)
- Sends to `/manual-print` endpoint (bypasses pause setting)
- Also sends to wheel server if item title contains "wheel" (only if payment NOT pending)
- Blocks click if payment is pending

**Wheel Button (🎡)**:
- Appears next to print button for wheel items only
- Manual override - always works (bypasses payment pending)
- Sends directly to wheel server (`/buy-notification`)
- Visual feedback: ⏳ → ✅/❌ → 🎡
- Separate from print button functionality

**Injection Triggers**:
- DOM mutations (debounced 500ms)
- Periodic scan every 10 seconds
- Initial page load (1 second delay)

### Console Debug Functions

Available in browser console for testing:

```javascript
// Force refresh print buttons
testPrintButtons()

// Debug extracted item data
debugItemData()

// Manually add print buttons
addPrintButtons()

// Debug available item titles
debugItemTitles()
```

## 🔧 Debugging Features

### Console Output
- Extension activity logs (minimal in production)
- Win detection confirmations
- Throttling notifications  
- Connection status updates
- Price detection debugging (comprehensive logging)

### Visual Notifications
- Win detection alerts (5-second display)
- Page type indicators (6-second display)
- Extension status notifications
- Print button confirmation (✅ icon)

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
- **Wheel Announcement Polling**: Every 2 seconds (separate from scanning)

## 🎡 Manual Wheel Button

A manual wheel button (🎡) is automatically added next to the print button for items with "wheel" in the title, allowing manual override if the extension doesn't detect a win.

### Location
- Appears inline with item title (next to print button 🖨️)
- Only shows for items containing "wheel" in the title (case-insensitive)
- Blue wheel icon (🎡) with hover effects

### Functionality
- **Manual Override**: Bypasses payment pending checks (always sends)
- **Direct Send**: Sends directly to wheel server: `POST http://localhost:3800/buy-notification`
- **Payload Format**: `{ buyer, amount, message }`
- **Auto-Formatting**: Extracts numeric amount from price, adds $ if missing
- **Visual Feedback**:
  - ⏳ While sending (orange)
  - ✅ On success (green, 2 seconds)
  - ❌ On error (red, 2 seconds)
  - Returns to 🎡 after feedback

### Use Case
If the extension doesn't automatically detect a wheel win:
1. Click the 🎡 button next to the wheel item
2. Immediately sends to wheel server (bypasses all checks)
3. Wheel server processes and sends result to main server via `POST /wheel-win`
4. Extension polls every 2 seconds and finds announcement
5. Extension announces to chat automatically

### Console Logging
- `🎡 [MANUAL-WHEEL] Sending to wheel server: {buyer} - {item} - {price}`
- `✅ [MANUAL-WHEEL] Successfully sent to wheel server:`
- `❌ [MANUAL-WHEEL] Failed to send to wheel server: {error}`