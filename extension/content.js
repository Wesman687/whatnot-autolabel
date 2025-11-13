// Note: Duplicate detection now handled by server - extension just sends all events
let giveawayCounter = 1;

// CLIENT-SIDE THROTTLING - Prevent spam to server
const recentWins = new Map(); // Key: "name|item|price", Value: timestamp
const THROTTLE_WINDOW = 5000; // 5 seconds

function isRecentlyThrottled(name, item, price) {
    const key = `${name}|${item}|${price || 'no-price'}`;
    const now = Date.now();
    const lastSent = recentWins.get(key);
    
    if (lastSent && (now - lastSent) < THROTTLE_WINDOW) {
        return true; // Silent throttling
    }
    
    recentWins.set(key, now);
    
    // Clean old entries every 50 events
    if (recentWins.size > 50) {
        for (const [key, timestamp] of recentWins.entries()) {
            if (now - timestamp > THROTTLE_WINDOW * 2) {
                recentWins.delete(key);
            }
        }
    }
    
    return false;
}

// Send heartbeat to server every 30 seconds
function sendHeartbeat() {
    try {
        fetch('http://localhost:7777/heartbeat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timestamp: Date.now() })
        }).catch(() => {}); // Silent heartbeat
    } catch (error) {
        // Silent error handling
    }
}

// Start heartbeat immediately and then every 2 seconds
sendHeartbeat();
setInterval(sendHeartbeat, 2000);

// AGGRESSIVE SERVICE WORKER KEEP-ALIVE
let backgroundPort;

function maintainBackgroundConnection() {
    try {
        if (backgroundPort) {
            backgroundPort.disconnect();
        }
        
        backgroundPort = chrome.runtime.connect({ name: 'keepAlive' });
        
        backgroundPort.onDisconnect.addListener(() => {
            backgroundPort = null;
            // Reconnect after a short delay
            setTimeout(maintainBackgroundConnection, 1000);
        });
        
        // Send periodic messages to keep the port active
        const pingInterval = setInterval(() => {
            if (backgroundPort) {
                try {
                    backgroundPort.postMessage({ type: 'ping' });
                } catch (e) {
                    clearInterval(pingInterval);
                    backgroundPort = null;
                    setTimeout(maintainBackgroundConnection, 1000);
                }
            } else {
                clearInterval(pingInterval);
            }
        }, 10000); // Ping every 10 seconds
        
    } catch (error) {
        // If connection fails, retry
        setTimeout(maintainBackgroundConnection, 2000);
    }
}

// Start the background connection immediately
maintainBackgroundConnection();

function findPrice() {
    console.log("🔍 PRICE DETECTION DEBUG - Starting comprehensive search...");
    
    // Strategy 0: Try specialized Whatnot price detection first
    const whatnotPrice = findWhatnotPrice();
    if (whatnotPrice) {
        console.log("✅ FOUND PRICE VIA SPECIALIZED WHATNOT DETECTION:", whatnotPrice);
        return whatnotPrice;
    }
    
    // Strategy 1: Look in modals/popups first (most accurate for win announcements)
    const modalSelectors = [
        '[role="dialog"]',
        '[class*="modal"]', 
        '[class*="popup"]',
        '[class*="overlay"]',
        '[class*="notification"]'
    ];
    
    console.log("🔍 Checking modals/popups...");
    for (const modalSelector of modalSelectors) {
        const modals = document.querySelectorAll(modalSelector);
        console.log(`   Found ${modals.length} elements for selector: ${modalSelector}`);
        
        for (const modal of modals) {
            const modalText = modal.innerText || modal.textContent || '';
            if (modalText.toLowerCase().includes('won')) {
                console.log("   🎯 Found 'won' in modal text:", modalText.substring(0, 200) + "...");
                
                // Look for prices that are standalone (not part of descriptions like "2nd Gen")
                const lines = modalText.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    // Match exact price format: $XX or $XX.XX as standalone text
                    if (/^\$\d+(\.\d{2})?$/.test(trimmedLine)) {
                        console.log("   💰 FOUND EXACT PRICE IN WIN MODAL:", trimmedLine);
                        return trimmedLine;
                    }
                    // Also check for "Sold" context
                    if (trimmedLine.includes('Sold') || trimmedLine.includes('sold')) {
                        const priceMatch = trimmedLine.match(/\$(\d+(?:\.\d{2})?)/);
                        if (priceMatch) {
                            console.log("   💰 FOUND PRICE IN SOLD CONTEXT:", priceMatch[0]);
                            return priceMatch[0];
                        }
                    }
                }
            }
        }
    }
    
    // Strategy 2: Look for Whatnot-specific price elements
    console.log("🔍 Checking Whatnot price elements...");
    const whatnotPriceSelectors = [
        // Exact Whatnot price element pattern
        'strong.text-right.text-neutrals-opaque-50.tabular-nums',
        'strong[class*="text-right"][class*="tabular-nums"]',
        'strong[class*="text-neutrals-opaque-50"]',
        // Broader Whatnot patterns
        'strong[class*="tabular-nums"]',
        'strong[class*="text-right"]',
        '.tabular-nums',
        // Generic bid/price selectors as fallback
        '[data-testid*="bid"]',
        '[data-testid*="price"]', 
        '[class*="bid"]',
        '[class*="price"]',
        '[class*="amount"]'
    ];
    
    for (const selector of whatnotPriceSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`   Found ${elements.length} elements for: ${selector}`);
            
            for (const element of elements) {
                const text = (element.innerText || element.textContent || '').trim();
                if (text && text.includes('$')) {
                    console.log(`      Element text: "${text}"`);
                    console.log(`      Element classes: "${element.className}"`);
                    
                    // Check for exact price format first (avoids "2nd Gen" type issues)
                    if (/^\$\d+(\.\d{2})?$/.test(text)) {
                        console.log(`      💰 FOUND EXACT PRICE FORMAT IN ${selector}: ${text}`);
                        return text;
                    }
                    
                    // Fallback: check if it's a number-only price in a price context
                    const priceMatch = text.match(/^\$(\d+(?:\.\d{2})?)$/);
                    if (priceMatch) {
                        console.log(`      💰 FOUND WHATNOT PRICE IN ${selector}: ${priceMatch[0]}`);
                        return priceMatch[0];
                    }
                }
            }
        }
    }
    
    // Strategy 3: Scan visible text on screen for patterns
    console.log("🔍 Scanning page text for price patterns...");
    const fullPageText = document.body.innerText || '';
    const allPrices = [...fullPageText.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
    
    if (allPrices.length > 0) {
        console.log("   💰 ALL PRICES FOUND ON PAGE:", allPrices.map(m => m[0]));
        
        // Look for prices near "won", "winning", "bid", "sold" keywords
        const keywords = ['won', 'winning', 'bid', 'current', 'sold'];
        for (const keyword of keywords) {
            const keywordIndex = fullPageText.toLowerCase().indexOf(keyword);
            if (keywordIndex !== -1) {
                // Look within 100 characters of the keyword
                const start = Math.max(0, keywordIndex - 100);
                const end = Math.min(fullPageText.length, keywordIndex + 100);
                const context = fullPageText.substring(start, end);
                
                // Look for exact price patterns, avoiding item descriptions
                const lines = context.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    // Match standalone price format
                    if (/^\$\d+(\.\d{2})?$/.test(trimmedLine)) {
                        console.log(`   💰 FOUND EXACT PRICE NEAR '${keyword}': ${trimmedLine}`);
                        console.log(`      Context: "${context}"`);
                        return trimmedLine;
                    }
                    // Or look for "Sold" specific context
                    if (line.toLowerCase().includes('sold') && /\$\d+(\.\d{2})?/.test(line)) {
                        const soldPrice = line.match(/\$(\d+(?:\.\d{2})?)/);
                        if (soldPrice) {
                            console.log(`   💰 FOUND SOLD PRICE: ${soldPrice[0]}`);
                            return soldPrice[0];
                        }
                    }
                }
            }
        }
        
        // Fallback: filter out obvious non-prices and return highest valid price
        const validPrices = allPrices
            .filter(match => {
                const priceStr = match[0];
                const value = parseFloat(priceStr.replace('$', ''));
                
                // Filter out obviously wrong prices
                if (value < 1 || value > 10000) return false; // Reasonable price range
                
                // Check context around the price to avoid item descriptions
                const matchIndex = match.index;
                const start = Math.max(0, matchIndex - 50);
                const end = Math.min(fullPageText.length, matchIndex + 50);
                const context = fullPageText.substring(start, end).toLowerCase();
                
                // Reject if in obvious item description context
                if (context.includes('gen') || context.includes('inch') || 
                    context.includes('gb') || context.includes('pro') ||
                    context.includes('generation')) {
                    console.log(`   ❌ Rejecting price ${priceStr} - item description context: "${context}"`);
                    return false;
                }
                
                return true;
            })
            .map(m => ({ 
                price: m[0], 
                value: parseFloat(m[0].replace('$', '')) 
            }));
        
        if (validPrices.length > 0) {
            const highestPrice = validPrices.sort((a, b) => b.value - a.value)[0];
            console.log("   💰 FALLBACK - HIGHEST VALID PRICE:", highestPrice.price);
            return highestPrice.price;
        }
    }
    
    console.log("❌ NO PRICES FOUND ANYWHERE ON PAGE");
    
    // Strategy 4: Debug - show what elements exist on the page
    console.log("🔍 DEBUG - Available elements with text containing '$':");
    const allElements = document.querySelectorAll('*');
    let foundAny = false;
    for (const el of allElements) {
        const text = el.innerText || el.textContent || '';
        if (text.includes('$') && text.length < 100) {
            console.log(`   Element: ${el.tagName}.${el.className} = "${text}"`);
            foundAny = true;
        }
    }
    if (!foundAny) {
        console.log("   No elements with '$' found!");
    }
    
    return null;    // Strategy 3: Look for price elements on the page
    for (const selector of whatnotSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
            const text = element.innerText || element.textContent || '';
            const priceMatch = text.match(/\$(\d+(?:\.\d{2})?)/);
            if (priceMatch) {
                console.log("💰 Found price in element:", priceMatch[0], "selector:", selector);
                return priceMatch[0];
            }
        }
    }
    
    // Strategy 3: Look for prices near "won" text but exclude item title prices
    const pageText = document.body.innerText || '';
    const wonIndex = pageText.toLowerCase().indexOf('won');
    if (wonIndex !== -1) {
        // Look for prices within 300 characters before and after "won"
        const contextStart = Math.max(0, wonIndex - 300);
        const contextEnd = Math.min(pageText.length, wonIndex + 300);
        const contextText = pageText.substring(contextStart, contextEnd);
        
        // Find all prices in this context
        const contextPrices = [...contextText.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
        for (const match of contextPrices) {
            const price = match[0];
            // Skip if this price appears in the item title
            if (!currentItemTitle.includes(price)) {
                console.log("💰 Found contextual price near 'won':", price);
                return price;
            } else {
                console.log("⚠️ Skipping item title price near 'won':", price);
            }
        }
    }
    
    // Strategy 4: Last resort - look for higher value prices (likely bids, not start prices)
    const allPriceMatches = [...pageText.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
    const validPrices = [];
    
    for (const match of allPriceMatches) {
        const price = match[0];
        const priceValue = parseFloat(price.replace('$', ''));
        
        // Skip prices from item title and very low "start" prices
        if (!currentItemTitle.includes(price) && priceValue >= 2) {
            validPrices.push({ price, value: priceValue });
        }
    }
    
    if (validPrices.length > 0) {
        // Return the highest valid price (most likely the winning bid)
        const highestPrice = validPrices.sort((a, b) => b.value - a.value)[0];
        console.log("💰 Found highest valid price:", highestPrice.price, `(excluded ${allPriceMatches.length - validPrices.length} item title/low prices)`);
        return highestPrice.price;
    }
    
    console.log("❌ No valid bid price found (only item title/start prices detected)");
    return null;
}

function findWhatnotPrice() {
    // Specialized function for the exact Whatnot price element you provided
    console.log("🎯 TARGETED WHATNOT PRICE SEARCH");
    
    // Your exact element pattern
    const exactSelector = 'strong.text-right.text-neutrals-opaque-50.block.font-sans.text-body1.leading-body1.font-semibold.text-pretty.tabular-nums';
    let elements = document.querySelectorAll(exactSelector);
    console.log(`   Exact match selector found ${elements.length} elements`);
    
    if (elements.length === 0) {
        // Try partial matches
        const partialSelectors = [
            'strong[class*="text-right"][class*="tabular-nums"]',
            'strong[class*="text-neutrals-opaque-50"][class*="tabular-nums"]',
            'strong.tabular-nums',
            'strong[class*="tabular-nums"]'
        ];
        
        for (const selector of partialSelectors) {
            elements = document.querySelectorAll(selector);
            console.log(`   Partial selector "${selector}" found ${elements.length} elements`);
            if (elements.length > 0) break;
        }
    }
    
    // Check all found elements
    for (const element of elements) {
        const text = element.innerText || element.textContent || '';
        console.log(`   Checking element: "${text}" with classes: "${element.className}"`);
        
        if (text.match(/^\$\d+(\.\d{2})?$/)) { // Exact price format like $12 or $12.50
            console.log(`   🎯 FOUND WHATNOT PRICE: ${text}`);
            return text;
        }
    }
    
    return null;
}

function sendWin(eventType, name, item, price = null) {
    // CLIENT-SIDE THROTTLING: Don't spam the server with identical events
    if (isRecentlyThrottled(name, item, price)) {
        return; // Skip sending - already sent recently
    }
    
    // Only log actual wins being sent
    console.log(`🎉 WIN: ${name} - ${item}${price ? ' - ' + price : ''} (${eventType})`);

    // Show visual confirmation that win was detected
    const winAlert = document.createElement('div');
    winAlert.style.cssText = `
        position: fixed; top: 50px; right: 10px; z-index: 99999;
        background: #FF4444; color: white; padding: 15px; border-radius: 5px;
        font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    `;
    winAlert.textContent = `🎉 WIN DETECTED: ${name}`;
    document.body.appendChild(winAlert);
    
    setTimeout(() => {
        winAlert.remove();
    }, 5000);

    // Send message with fallback to direct server communication
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

// Fallback: Send directly to server when extension context is invalid
function sendDirectToServer(eventType, name, item, price) {
    
    const payload = {
        type: eventType,
        name: name,
        item: item,
        price: price
    };
    
    fetch('http://localhost:7777/event', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        console.log("📨 Direct server response:", data);
        if (data.status === 'ok') {
            console.log("✅ Win sent directly to server successfully!");
        } else if (data.status === 'duplicate') {
            console.log("🚫 Server detected duplicate - ignored");
        } else {
            console.warn("⚠️ Server response:", data);
        }
    })
    .catch(error => {
        console.error("❌ Direct server communication failed:", error);
        console.log("💡 Make sure WhatnotAutoPrint server is running on port 7777");
    });
}

// SCAN THROTTLING - Prevent excessive scanning
let lastScanTime = 0;
const SCAN_THROTTLE = 1000; // Max 1 scan per second

function scan() {
    const now = Date.now();
    if (now - lastScanTime < SCAN_THROTTLE) {
        return; // Silent throttling
    }
    lastScanTime = now;
    
    // Look for ALL text on page that contains win patterns
    const allText = document.body.innerText || document.body.textContent || '';
    
    // More aggressive logging every 10th scan
    if (Math.random() < 0.1) { // 10% chance to log scan status
        console.log("🔍 SCAN STATUS:", {
            url: window.location.href,
            hasWonText: allText.toLowerCase().includes('won'),
            pageLength: allText.length,
            title: document.title
        });
    }
    
    // Debug: log if we see any "won" text at all
    if (allText.toLowerCase().includes('won')) {
        console.log("🔍 FOUND 'won' text somewhere on page");
        const sample = findTextAroundWon(allText);
        console.log("📝 Sample text around 'won':", sample);
        
        // Look for the EXACT pattern we saw in the screenshot
        const patterns = [
            { pattern: /(\w+)\s+won\s+the\s+auction!/gi, name: "EXACT_MATCH" },
            { pattern: /(\w+)\s+won!/gi, name: "general_win" },
            { pattern: /(\w+)\s+won\s+the\s+giveaway/gi, name: "giveaway_win" },
            { pattern: /(\w+)\s+won\s+this\s+auction/gi, name: "this_auction_win" },
            { pattern: /congratulations\s+(\w+).*won/gi, name: "congrats_win" },
            { pattern: /(\w+).*has\s+won/gi, name: "has_won" }
        ];
        
        // SPECIAL CHECK: Look specifically for "hanksch42376 won the auction!" type patterns
        if (allText.includes('won the auction!')) {
            console.log("🎯 FOUND EXACT PATTERN: 'won the auction!' - This should trigger!");
            console.log("📝 Full text search result:");
            const lines = allText.split('\n');
            lines.forEach((line, i) => {
                if (line.toLowerCase().includes('won the auction')) {
                    console.log(`  Line ${i}: "${line.trim()}"`);
                }
            });
        }
        
        let foundAnyPattern = false;
        
        for (const { pattern, name } of patterns) {
            const matches = [...allText.matchAll(pattern)];
            if (matches.length > 0) {
                console.log(`🎯 PATTERN "${name}" found ${matches.length} matches:`, matches.map(m => m[0]));
                foundAnyPattern = true;
                
                for (const match of matches) {
                    const winner = match[1];
                    const isGiveaway = match[0].toLowerCase().includes('giveaway');
                    
                    // Use different item detection for giveaways vs sales
                    let itemTitle;
                    if (isGiveaway) {
                        itemTitle = findGiveawayTitle(allText);
                    } else {
                        itemTitle = findItemTitle();
                    }
                    
                    // Find price for sale items (not giveaways)
                    let price = null;
                    if (!isGiveaway) {
                        price = findPrice();
                    }
                    
                    console.log("🚀 TRIGGERING WIN EVENT:", {
                        pattern: name,
                        type: isGiveaway ? 'giveaway' : 'sale',
                        winner,
                        item: itemTitle,
                        price: price,
                        fullMatch: match[0],
                        detectionMethod: isGiveaway ? 'giveaway-specific' : 'general'
                    });
                    sendWin(isGiveaway ? 'giveaway' : 'sale', winner, itemTitle, price);
                }
            }
        }
        
        if (!foundAnyPattern) {
            console.log("❌ No win patterns matched. Raw 'won' text contexts:");
            const wonOccurrences = [];
            let index = allText.toLowerCase().indexOf('won');
            while (index !== -1 && wonOccurrences.length < 5) {
                const start = Math.max(0, index - 30);
                const end = Math.min(allText.length, index + 30);
                wonOccurrences.push(allText.substring(start, end));
                index = allText.toLowerCase().indexOf('won', index + 1);
            }
            console.log("📝 All 'won' contexts:", wonOccurrences);
        }
    }
    
    // Also scan individual elements for more specific detection
    const elements = document.querySelectorAll('div, span, p, [class*="modal"], [class*="popup"], [class*="notification"]');
    
    for (const element of elements) {
        const text = element.innerText || element.textContent || '';
        
        if (text.includes('won') && text.length < 200) { // Avoid scanning huge text blocks
            console.log("🔍 Element with 'won':", text.substring(0, 100));
            
            if (/\w+\s+(won|wins)/.test(text)) {
                console.log("📍 Potential win element found:", text);
            }
        }
    }
}

function findTextAroundWon(text) {
    const wonIndex = text.toLowerCase().indexOf('won');
    if (wonIndex === -1) return "No 'won' text found";
    
    const start = Math.max(0, wonIndex - 50);
    const end = Math.min(text.length, wonIndex + 50);
    return text.substring(start, end);
}

function findGiveawayTitle(winText) {
    // Simple approach: just return a fixed title and let duplicate detection handle it
    console.log("🎁 Giveaway detected");
    
    // Extract winner name for a consistent giveaway identifier
    const winnerMatch = winText.match(/(\w+)\s+won/i);
    const winner = winnerMatch ? winnerMatch[1] : 'Unknown';
    
    // Use winner name to create consistent giveaway title
    // This way the same winner's giveaway will have the same title
    const giveawayTitle = `Giveaway - ${winner}`;
    console.log("🎁 Giveaway title:", giveawayTitle);
    return giveawayTitle;
}

function findItemTitle() {
    // Try multiple strategies to find the auction/item title
    const strategies = [
        // Common title selectors
        () => document.querySelector('h1')?.innerText?.trim(),
        () => document.querySelector('[data-testid*="title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="auction"]')?.innerText?.trim(),
        () => document.querySelector('title')?.innerText?.trim()
    ];
    
    for (const strategy of strategies) {
        try {
            const result = strategy();
            if (result && result.length > 0 && result.length < 200) {
                return result;
            }
        } catch (e) {
            // Ignore errors
        }
    }
    
    return "Whatnot Auction Item";
}

// Set up THROTTLED mutation observer
let mutationTimeout;
const obs = new MutationObserver((mutations) => {
    // Debounce mutations - only scan after mutations stop for 500ms
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(() => {
        scan(); // Silent scanning
    }, 500);
});
obs.observe(document.body, { subtree: true, childList: true, characterData: true });

// Reduce periodic scanning to every 10 seconds
setInterval(() => {
    scan(); // Silent periodic scan
}, 10000);

// Removed heartbeat system - no longer needed

// Initial scan and server connection test
setTimeout(scan, 1000);
setTimeout(() => {
    fetch("http://localhost:7777/ping")
        .then(response => response.json())
        .then(data => {
            console.log("✅ Server connection successful:", data);
        })
        .catch(err => {
            console.error("❌ Server connection failed:", err);
            console.log("💡 Make sure server is running on localhost:7777");
        });
}, 2000);

console.log("🔥 Whatnot AutoPrint (Updated 2025 DOM) Loaded");
console.log("🔍 Current page URL:", window.location.href);
console.log("📊 Page title:", document.title);
console.log("⏰ Will scan every 5 seconds and send heartbeats every 10 seconds");

// Add manual testing functions to global scope for console testing
window.testPriceDetection = function() {
    console.log("\n🧪 MANUAL PRICE DETECTION TEST");
    console.log("===============================");
    const price = findPrice();
    console.log("🎯 RESULT:", price || "No price found");
    console.log("===============================\n");
    return price;
};

window.testWhatnotPrice = function() {
    console.log("\n🎯 WHATNOT-SPECIFIC PRICE TEST");
    console.log("==============================");
    const price = findWhatnotPrice();
    console.log("🎯 RESULT:", price || "No Whatnot price found");
    console.log("==============================\n");
    return price;
};

window.simulateWinWithPrice = function() {
    console.log("\n🧪 SIMULATING WIN EVENT WITH PRICE DETECTION");
    console.log("============================================");
    
    // Detect current price on the page
    const detectedPrice = findPrice();
    console.log("💰 Detected price:", detectedPrice);
    
    // Simulate a win with the detected price
    console.log("🎯 Simulating win for 'TestUser' with detected price...");
    sendWin('sale', 'TestUser', 'Manual Win Test with Price Detection', detectedPrice);
    
    console.log("✅ Win event sent! Check browser console for full pipeline logs.");
    console.log("============================================\n");
    
    return {
        detectedPrice: detectedPrice,
        sent: true
    };
};

window.clearDuplicates = function() {
    const oldSize = sent.size;
    sent.clear();
    if (window.recentWins) {
        window.recentWins = {};
    }
    console.log(`🧹 Manually cleared ${oldSize} duplicate detection entries`);
    return oldSize;
};

window.resetGiveawayCounter = function() {
    const oldValue = giveawayCounter;
    giveawayCounter = 1;
    console.log(`🎁 Reset giveaway counter from ${oldValue} to 1`);
    return oldValue;
};

console.log("💡 TIP: Run these functions in console:");
console.log("   • testPriceDetection() - Test full price detection");
console.log("   • testWhatnotPrice() - Test Whatnot-specific detection");
console.log("   • simulateWinWithPrice() - Simulate win event with price detection");
console.log("   • clearDuplicates() - Clear duplicate detection cache");
console.log("   • resetGiveawayCounter() - Reset giveaway numbering to 1");

// Add visual confirmation that extension loaded
if (window.location.href.includes('whatnot.com')) {
    const isLivePage = window.location.href.includes('/live/');
    const isDashboard = window.location.href.includes('/dashboard/live/');
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 10px; right: 10px; z-index: 9999;
        background: ${isLivePage ? '#4CAF50' : '#FF9800'}; color: white; padding: 10px;
        border-radius: 5px; font-size: 14px; font-weight: bold;
    `;
    
    console.log("🎯 Page detection:", { isLivePage, isDashboard, url: window.location.href });
    
    if (isLivePage) {
        const pageType = isDashboard ? 'YOUR STREAM' : 'VIEWING STREAM';
        notification.textContent = `🔥 AutoPrint: ${pageType} - Win Detection Active`;
    } else {
        notification.textContent = '⚠️ AutoPrint: Not a live page - Go to /live/{id}';
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove notification after 6 seconds
    setTimeout(() => {
        notification.remove();
    }, 6000);
    
    console.log("🎯 Page type detection:", isLivePage ? "LIVE PAGE" : "NON-LIVE PAGE");
}
