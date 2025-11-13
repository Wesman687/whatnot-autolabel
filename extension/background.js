// Aggressive service worker keep-alive system
let keepAliveIntervalId;
let portFromCS;

// Multi-layered keep-alive approach
function keepAlive() {
    // Method 1: Simple timer heartbeat
    if (chrome.runtime && chrome.runtime.id) {
        // Still alive, do nothing
    }
    
    // Method 2: Create and immediately close a connection
    try {
        chrome.runtime.connect({ name: 'keepAlive' }).disconnect();
    } catch (e) {
        // Ignore errors
    }
}

function startKeepAlive() {
    if (keepAliveIntervalId) return;
    
    // Very frequent keep-alive (every 15 seconds)
    keepAliveIntervalId = setInterval(keepAlive, 15000);
    
    // Immediate keep-alive
    keepAlive();
}

function stopKeepAlive() {
    if (keepAliveIntervalId) {
        clearInterval(keepAliveIntervalId);
        keepAliveIntervalId = null;
    }
}

// Start aggressive keep-alive immediately
startKeepAlive();

// Method 3: Long-lived port connection from content script
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'keepAlive') {
        portFromCS = port;
        port.onDisconnect.addListener(() => {
            portFromCS = null;
        });
        // Keep the port alive
        port.onMessage.addListener(() => {});
    }
});

// Service worker activation events
chrome.runtime.onStartup.addListener(() => {
    startKeepAlive();
});

chrome.runtime.onInstalled.addListener(() => {
    startKeepAlive();
});

// Listen for tab updates to restart keep-alive if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('whatnot.com')) {
        startKeepAlive(); // Restart on any Whatnot page
    }
});

// Wake up on any chrome event
chrome.tabs.onActivated.addListener(() => {
    startKeepAlive();
});

chrome.windows.onFocusChanged.addListener(() => {
    startKeepAlive();
});

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "WIN_EVENT") {
        console.log("🚀 BACKGROUND: Forwarding win event to server:", msg.payload);
        console.log("💰 BACKGROUND: Price in payload:", {
            price: msg.payload.price,
            type: typeof msg.payload.price,
            hasPrice: 'price' in msg.payload
        });
        
        const jsonPayload = JSON.stringify(msg.payload);
        console.log("📦 BACKGROUND: JSON payload being sent:", jsonPayload);
        
        fetch("http://localhost:7777/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: jsonPayload
        })
        .then(response => {
            console.log("✅ BACKGROUND: Server responded:", response.status);
            return response.text();
        })
        .then(data => {
            console.log("📝 BACKGROUND: Server response:", data);
        })
        .catch(error => {
            console.error("❌ BACKGROUND: Failed to send to server:", error);
        });
    }
});
