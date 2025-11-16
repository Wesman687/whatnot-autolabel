// Note: Duplicate detection now handled by server - extension just sends all events
let giveawayCounter = 1;

// CLIENT-SIDE THROTTLING - Prevent spam to server
const recentWins = new Map(); // Key: "name|item|price", Value: timestamp
const THROTTLE_WINDOW = 5000; // 5 seconds

function isRecentlyThrottled(name, item, price) {
    try {
        // Validate inputs
        if (!name || !item) {
            return false; // Don't throttle invalid data
        }
        
        const key = `${name}|${item}|${price || 'no-price'}`;
        const now = Date.now();
        const lastSent = recentWins.get(key);
        
        if (lastSent && (now - lastSent) < THROTTLE_WINDOW) {
            return true; // Silent throttling
        }
        
        recentWins.set(key, now);
        
        // Clean old entries every 50 events
        if (recentWins.size > 50) {
            try {
                for (const [entryKey, timestamp] of recentWins.entries()) {
                    if (now - timestamp > THROTTLE_WINDOW * 2) {
                        recentWins.delete(entryKey);
                    }
                }
            } catch (cleanupError) {
                // If cleanup fails, clear the entire map to prevent memory issues
                recentWins.clear();
            }
        }
        
        return false;
    } catch (error) {
        console.log("Throttling check failed:", error);
        return false; // Default to not throttling on error
    }
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
    try {
        // CLIENT-SIDE THROTTLING: Don't spam the server with identical events
        if (isRecentlyThrottled(name, item, price)) {
            return; // Skip sending - already sent recently
        }
        
        // Validate inputs to prevent crashes
        if (!name || !item || !eventType) {
            console.log("Invalid win data, skipping:", { eventType, name, item, price });
            return;
        }
        
        // Only log actual wins being sent
        console.log(`🎉 WIN: ${name} - ${item}${price ? ' - ' + price : ''} (${eventType})`);

        // Show visual confirmation that win was detected (with error handling)
        try {
            const winAlert = document.createElement('div');
            winAlert.style.cssText = `
                position: fixed; top: 50px; right: 10px; z-index: 99999;
                background: #FF4444; color: white; padding: 15px; border-radius: 5px;
                font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            `;
            winAlert.textContent = `🎉 WIN DETECTED: ${name}`;
            
            if (document.body) {
                document.body.appendChild(winAlert);
                
                setTimeout(() => {
                    try {
                        if (winAlert.parentNode) {
                            winAlert.remove();
                        }
                    } catch (removeError) {
                        // Ignore removal errors
                    }
                }, 5000);
            }
        } catch (alertError) {
            console.log("Visual alert failed, continuing with win processing...");
        }

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
        
    } catch (error) {
        console.log("SendWin function failed:", error);
    }
}

// Send manual print (bypasses pause setting)
function sendManualPrint(eventType, name, item, price) {
    try {
        // Validate inputs
        if (!eventType || !name || !item) {
            return;
        }
        
        const payload = {
            type: eventType,
            name: name,
            item: item,
            price: price
        };
        
        fetch('http://localhost:7777/manual-print', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response || !response.ok) {
                throw new Error(`Server error: ${response?.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Silent success
        })
        .catch(error => {
            // Silent error handling
        });
    } catch (error) {
        // Silent error handling
    }
}

// Fallback: Send directly to server when extension context is invalid
function sendDirectToServer(eventType, name, item, price) {
    try {
        // Validate inputs
        if (!eventType || !name || !item) {
            console.log("Invalid data for direct server send:", { eventType, name, item, price });
            return;
        }
        
        const payload = {
            type: eventType,
            name: name,
            item: item,
            price: price
        };
        
        console.log("Sending directly to server:", payload);
        
        fetch('http://localhost:7777/event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (!response) {
                throw new Error('No response from server');
            }
            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("📨 Direct server response:", data);
            if (data && data.status === 'ok') {
                console.log("✅ Win sent directly to server successfully!");
            } else if (data && data.status === 'duplicate') {
                console.log("🚫 Server detected duplicate - ignored");
            } else {
                console.warn("⚠️ Server response:", data);
            }
        })
        .catch(error => {
            console.log("❌ Direct server communication failed:", error.message || error);
            console.log("💡 Make sure WhatnotAutoPrint server is running on port 7777");
        });
    } catch (error) {
        console.log("SendDirectToServer function failed:", error);
    }
}

// SCAN THROTTLING - Prevent excessive scanning
let lastScanTime = 0;
const SCAN_THROTTLE = 1000; // Max 1 scan per second

function scan() {
    try {
        const now = Date.now();
        if (now - lastScanTime < SCAN_THROTTLE) {
            return; // Silent throttling
        }
        lastScanTime = now;
        
        // Safe DOM access with fallbacks
        let allText = '';
        try {
            allText = document.body?.innerText || document.body?.textContent || '';
        } catch (e) {
            console.log("DOM access error, skipping scan");
            return;
        }
        
        if (!allText || allText.length === 0) {
            return; // No content to scan
        }
    
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
            { pattern: /(\w+)\s+won\s+the\s+giveaway!/gi, name: "giveaway_win" }, // More specific - require exclamation
            { pattern: /(\w+)\s+won!/gi, name: "general_win" },
            { pattern: /(\w+)\s+won\s+this\s+auction/gi, name: "this_auction_win" },
            { pattern: /congratulations\s+(\w+).*won/gi, name: "congrats_win" }
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
                    
                    // Extra validation for giveaways to prevent false matches
                    if (isGiveaway && name !== "giveaway_win") {
                        console.log("🚫 Skipping non-specific giveaway pattern");
                        continue;
                    }
                    
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
    
        // Also scan individual elements for more specific detection (with error handling)
        try {
            const elements = document.querySelectorAll('div, span, p, [class*="modal"], [class*="popup"], [class*="notification"]');
            
            for (const element of elements) {
                try {
                    const text = element?.innerText || element?.textContent || '';
                    
                    if (text.includes('won') && text.length < 200) { // Avoid scanning huge text blocks
                        console.log("🔍 Element with 'won':", text.substring(0, 100));
                        
                        if (/\w+\s+(won|wins)/.test(text)) {
                            console.log("📍 Potential win element found:", text);
                        }
                    }
                } catch (elementError) {
                    // Skip problematic elements, continue with others
                    continue;
                }
            }
        } catch (querySelectorError) {
            console.log("Element scanning failed, continuing...");
        }
    
    } catch (error) {
        console.log("Scan error (non-critical):", error.message);
        // Continue execution - don't let scan errors crash the extension
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
    
    // For giveaways, use a simple generic title
    // The winner's name is already captured in the main detection loop
    const giveawayTitle = "Giveaway Prize";
    console.log("🎁 Using generic giveaway title:", giveawayTitle);
    return giveawayTitle;
}

function findItemTitle() {
    // Try multiple strategies to find the auction/item title from seller's stream
    const strategies = [
        // EXACT MATCH: Target the specific div structure you provided
        () => {
            const divs = document.querySelectorAll('div[style*="flex: 1 1 0%"][style*="font-weight: 600"]');
            for (const div of divs) {
                const text = (div.innerText || div.textContent || '').trim();
                if (text && text.length > 0 && text.length < 200) {
                    console.log(`🎯 Found exact style match: "${text}"`);
                    return text;
                }
            }
            return null;
        },
        
        // Look for divs with font-weight 600 (common for titles)
        () => {
            const divs = document.querySelectorAll('div[style*="font-weight: 600"], div[style*="font-weight:600"]');
            for (const div of divs) {
                const text = (div.innerText || div.textContent || '').trim();
                // Look for "Item in hand XXX" pattern or similar
                if (/^(Item in hand|Item \d+|Lot \d+|#\d+).{0,100}$/i.test(text)) {
                    console.log(`🎯 Found weighted div with item pattern: "${text}"`);
                    return text;
                }
            }
            return null;
        },
        
        // Whatnot-specific selectors for seller stream
        () => document.querySelector('[data-testid="listing-title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="listing"][class*="title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="item"][class*="title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="auction"][class*="title"]')?.innerText?.trim(),
        
        // Look for text near "See Less" or "Item in hand" patterns in any element
        () => {
            const elements = document.querySelectorAll('div, span, p');
            for (const el of elements) {
                const text = el.innerText || el.textContent || '';
                // Look for "Item in hand XXX" pattern or similar
                if (/^(Item in hand|Item \d+|Lot \d+|#\d+).{0,100}$/i.test(text.trim())) {
                    console.log(`🎯 Found item pattern in ${el.tagName}: "${text.trim()}"`);
                    return text.trim();
                }
            }
            return null;
        },
        
        // Look in modal or popup content
        () => document.querySelector('[role="dialog"] h1, [role="dialog"] h2, [role="dialog"] [class*="title"]')?.innerText?.trim(),
        
        // Generic fallbacks
        () => document.querySelector('h1')?.innerText?.trim(),
        () => document.querySelector('h2')?.innerText?.trim(),
        () => document.querySelector('[data-testid*="title"]')?.innerText?.trim(),
        () => document.querySelector('[class*="title"]:not([class*="page"]):not([class*="nav"])')?.innerText?.trim()
    ];
    
    console.log("🔍 Searching for item title...");
    
    for (let i = 0; i < strategies.length; i++) {
        try {
            const result = strategies[i]();
            if (result && result.length > 0 && result.length < 200) {
                console.log(`✅ Found item title via strategy ${i + 1}: "${result}"`);
                return result;
            }
        } catch (e) {
            // Ignore errors, try next strategy
        }
    }
    
    console.log("❌ No specific item title found, using generic");
    return "Whatnot Item";
}

// Set up THROTTLED mutation observer
let mutationTimeout;
try {
    const obs = new MutationObserver((mutations) => {
        try {
            // Debounce mutations - only scan after mutations stop for 500ms
            clearTimeout(mutationTimeout);
            mutationTimeout = setTimeout(() => {
                scan(); // Silent scanning
                injectPrintButtons(); // Add print buttons to new items
            }, 500);
        } catch (error) {
            // Silent error handling
        }
    });
    
    if (document.body) {
        obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    }
} catch (error) {
    // Silent error handling
}

// Reduce periodic scanning to every 10 seconds
try {
    setInterval(() => {
        try {
            scan(); // Silent periodic scan
            injectPrintButtons(); // Ensure print buttons are present
        } catch (error) {
            // Silent error handling
        }
    }, 10000);
} catch (error) {
    // Silent error handling
}

// Removed heartbeat system - no longer needed

// Initial scan and server connection test
try {
    setTimeout(() => {
        try {
            scan();
            injectPrintButtons(); // Add initial print buttons
        } catch (error) {
            // Silent error handling
        }
    }, 1000);
    
    setTimeout(() => {
        try {
            fetch("http://localhost:7777/ping")
                .then(response => response.json())
                .then(data => {
                    // Silent connection check
                })
                .catch(err => {
                    // Silent error handling
                });
        } catch (error) {
            // Silent error handling
        }
    }, 2000);
} catch (error) {
    // Silent error handling
}

// Inject custom print buttons into item cards
function injectPrintButtons() {
    try {
        // Look for item cards in the left sidebar - find ANY item title
        const itemCards = [];
        
        // Find item cards by looking for elements with buyer/sold information
        const allElements = document.querySelectorAll('*');
        allElements.forEach(element => {
            const text = (element.innerText || element.textContent || '').trim();
            
            // Look for item titles - they appear above buyer/price info
            // Check if this element's parent container has buyer/price info
            let parentContainer = element.parentElement;
            for (let i = 0; i < 5 && parentContainer; i++) {
                const containerText = parentContainer.textContent;
                
                // If container has buyer AND (payment/sold) info, this might be an item title
                if (containerText.includes('Buyer:') && 
                    (containerText.includes('Payment Pending:') || containerText.includes('Sold for'))) {
                    
                    // Make sure this element looks like a title (short, meaningful text)
                    if (text.length > 5 && text.length < 80 && 
                        !text.includes('Buyer:') && 
                        !text.includes('Payment') && 
                        !text.includes('Sold for') &&
                        !text.includes('Qty:')) {
                        
                        itemCards.push(element);
                        break;
                    }
                }
                parentContainer = parentContainer.parentElement;
            }
        });
        
        let buttonsAdded = 0;
        
        itemCards.forEach((titleElement, index) => {
            const itemTitle = (titleElement.innerText || titleElement.textContent || '').trim();
            
            // Find the item card container - look for the card that contains this title
            let cardContainer = titleElement;
            
            // Go up the DOM to find the main item card container
            for (let i = 0; i < 10; i++) {
                if (!cardContainer.parentElement) break;
                cardContainer = cardContainer.parentElement;
                
                // Look for a container that represents the full item card
                const hasPaymentInfo = cardContainer.textContent.includes('Payment Pending') || cardContainer.textContent.includes('Sold for');
                const hasItemInfo = cardContainer.textContent.includes(itemTitle);
                const hasReasonableSize = cardContainer.offsetHeight > 100;
                
                if (hasPaymentInfo && hasItemInfo && hasReasonableSize) {
                    break;
                }
            }
            
            // Check if we already added a button to this card
            if (cardContainer.querySelector('.whatnot-autoprint-btn')) {
                return;
            }
            
            // Extract buyer and price info from this specific layout
            let buyerName = 'Unknown';
            let salePrice = null;
            
            // Look for buyer name after "Buyer:" label - be more careful about extraction
            const allText = cardContainer.textContent;
            // More specific regex to avoid capturing extra text
            const buyerMatch = allText.match(/Buyer:\s*([a-zA-Z0-9_]+)(?:\s|$|[^a-zA-Z0-9_])/);
            if (buyerMatch) {
                buyerName = buyerMatch[1];
            } else {
                // Fallback: look for blue-colored text that might be the buyer name
                const blueElements = cardContainer.querySelectorAll('*');
                for (const el of blueElements) {
                    const style = getComputedStyle(el);
                    const text = (el.textContent || '').trim();
                    if (style.color && (style.color.includes('rgb(59, 130, 246)') || style.color.includes('blue')) && 
                        text.length > 3 && text.length < 25 && !text.includes('Buyer') && !text.includes('$')) {
                        buyerName = text;
                        break;
                    }
                }
            }
            
            // Look for payment info - be more specific
            const paymentPendingMatch = allText.match(/Payment Pending:\s*\$(\d+)/);
            const soldForMatch = allText.match(/Sold for\s*\$(\d+)/);
            
            if (paymentPendingMatch) {
                salePrice = '$' + paymentPendingMatch[1];
            } else if (soldForMatch) {
                salePrice = '$' + soldForMatch[1];
            }
            
            // Create the print button - small and inline with title
            const printBtn = document.createElement('span');
            printBtn.className = 'whatnot-autoprint-btn';
            printBtn.innerHTML = ' 🖨️';
            printBtn.title = `Print label for ${buyerName} - ${itemTitle}`;
            printBtn.style.cssText = `
                display: inline;
                margin-left: 8px;
                color: #4CAF50;
                font-size: 14px;
                cursor: pointer;
                user-select: none;
                transition: all 0.2s ease;
            `;
            
            // Add hover effect
            printBtn.addEventListener('mouseenter', () => {
                printBtn.style.background = '#45a049';
                printBtn.style.transform = 'scale(1.05)';
            });
            printBtn.addEventListener('mouseleave', () => {
                printBtn.style.background = '#4CAF50';
                printBtn.style.transform = 'scale(1)';
            });
            
            // Add hover effects
            printBtn.addEventListener('mouseenter', () => {
                printBtn.style.color = '#45a049';
                printBtn.style.transform = 'scale(1.2)';
            });
            printBtn.addEventListener('mouseleave', () => {
                printBtn.style.color = '#4CAF50';
                printBtn.style.transform = 'scale(1)';
            });
            
            // Add click handler
            printBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Show confirmation
                const originalContent = printBtn.innerHTML;
                printBtn.innerHTML = ' ✅';
                printBtn.style.color = '#2196F3';
                
                // Determine if this is a giveaway or sale based on price and context
                let eventType = 'sale';  // Default to sale
                
                // Check if it's a giveaway based on:
                // 1. Price is $0 or no price
                // 2. Contains giveaway-related text
                const cardText = cardContainer.textContent.toLowerCase();
                if (!salePrice || salePrice === '$0' || cardText.includes('giveaway')) {
                    eventType = 'giveaway';
                }
                
                // Send to manual print endpoint (bypasses pause setting)
                try {
                    sendManualPrint(eventType, buyerName, itemTitle, salePrice);
                } catch (error) {
                    // Silent error handling
                }
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    printBtn.innerHTML = originalContent;
                    printBtn.style.color = '#4CAF50';
                }, 2000);
            });
            
            // Add the button directly to the title element (inline with the text)
            try {
                // Append directly to the title element so it appears right after the title text
                titleElement.appendChild(printBtn);
                buttonsAdded++;
            } catch (appendError) {
                // Fallback: try adding to parent
                try {
                    if (titleElement.parentElement) {
                        titleElement.parentElement.appendChild(printBtn);
                        buttonsAdded++;
                    }
                } catch (fallbackError) {
                    // Silent error handling
                }
            }
        });
        
        return buttonsAdded;
        
    } catch (error) {
        return 0;
    }
}

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

window.addPrintButtons = function() {
    console.log("\n🖨️ MANUALLY ADDING PRINT BUTTONS");
    console.log("=================================");
    const added = injectPrintButtons();
    const buttons = document.querySelectorAll('.whatnot-autoprint-btn');
    console.log(`✅ Added ${added} new buttons`);
    console.log(`✅ Total print buttons on page: ${buttons.length}`);
    
    if (buttons.length === 0) {
        console.log("\n🔍 DEBUGGING - No buttons found. Let's check what's on the page:");
        
        // Check for item title elements
        const titleDivs = document.querySelectorAll('div');
        let itemCount = 0;
        titleDivs.forEach((div, i) => {
            const text = (div.innerText || div.textContent || '').trim();
            if (text.match(/^(Item in hand|Item \d+|Lot \d+).*/i)) {
                console.log(`  Item ${++itemCount}: "${text}" (${div.tagName})`);
            }
        });
        
        if (itemCount === 0) {
            console.log("  ❌ No item title patterns found on page");
            console.log("  💡 Try navigating to a page with sold items");
        }
    }
    
    console.log("=================================\n");
    return buttons.length;
};

window.debugItemTitles = function() {
    console.log("\n🔍 DEBUGGING AVAILABLE ITEM TITLES");
    console.log("==================================");
    
    // Check common title elements
    const titleSelectors = [
        'h1', 'h2', 'h3',
        '[data-testid*="title"]',
        '[class*="title"]',
        '[class*="listing"]',
        '[class*="item"]',
        '[class*="auction"]',
        '[role="dialog"] *'
    ];
    
    titleSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`\n📍 ${selector}:`);
            elements.forEach((el, i) => {
                const text = (el.innerText || el.textContent || '').trim();
                if (text && text.length < 200) {
                    console.log(`  ${i + 1}: "${text}"`);
                }
            });
        }
    });
    
    // Look for text that matches item patterns
    console.log("\n🎯 POTENTIAL ITEM TITLES:");
    const allElements = document.querySelectorAll('div, span, p');
    const itemPatterns = [];
    
    allElements.forEach(el => {
        const text = (el.innerText || el.textContent || '').trim();
        if (text && /^(Item in hand|Item \d+|Lot \d+|#\d+).{1,100}$/i.test(text)) {
            itemPatterns.push(text);
        }
    });
    
    if (itemPatterns.length > 0) {
        itemPatterns.forEach((pattern, i) => {
            console.log(`  ${i + 1}: "${pattern}"`);
        });
    } else {
        console.log("  No item patterns found");
    }
    
    console.log("\n🎯 CURRENT DETECTED TITLE:", findItemTitle());
    console.log("==================================\n");
    
    return {
        availableTitles: titleSelectors.map(sel => ({ 
            selector: sel, 
            elements: Array.from(document.querySelectorAll(sel)).map(el => (el.innerText || el.textContent || '').trim().substring(0, 100))
        })),
        itemPatterns: itemPatterns,
        currentTitle: findItemTitle()
    };
};

// Immediate test function that works without reload
window.testPrintButtons = function() {
    console.log("🖨️ TESTING PRINT BUTTONS");
    console.log("========================");
    
    // Remove any existing buttons first
    const existingButtons = document.querySelectorAll('.whatnot-autoprint-btn');
    existingButtons.forEach(btn => btn.remove());
    console.log(`Removed ${existingButtons.length} existing buttons`);
    
    // Run the injection
    const added = injectPrintButtons();
    console.log(`Added ${added} new print buttons`);
    
    return added;
};

// Debug function to show what data would be extracted for each item
window.debugItemData = function() {
    console.log("\n🔍 DEBUGGING ITEM DATA EXTRACTION");
    console.log("=================================");
    
    // Find all potential item containers
    const allElements = document.querySelectorAll('*');
    let itemCount = 0;
    
    allElements.forEach((element, index) => {
        const text = (element.innerText || element.textContent || '').trim();
        
        // Look for item titles
        let parentContainer = element.parentElement;
        for (let i = 0; i < 5 && parentContainer; i++) {
            const containerText = parentContainer.textContent;
            
            if (containerText.includes('Buyer:') && 
                (containerText.includes('Payment Pending:') || containerText.includes('Sold for'))) {
                
                if (text.length > 5 && text.length < 80 && 
                    !text.includes('Buyer:') && 
                    !text.includes('Payment') && 
                    !text.includes('Sold for') &&
                    !text.includes('Qty:')) {
                    
                    itemCount++;
                    console.log(`\n📦 ITEM ${itemCount}: "${text}"`);
                    
                    // Extract buyer
                    const buyerMatch = containerText.match(/Buyer:\s*([a-zA-Z0-9_]+)/);
                    const buyer = buyerMatch ? buyerMatch[1] : 'Unknown';
                    
                    // Extract price
                    const priceMatch = containerText.match(/(?:Payment Pending|Sold for):\s*\$(\d+)/);
                    const price = priceMatch ? '$' + priceMatch[1] : 'No price';
                    
                    console.log(`   Buyer: "${buyer}"`);
                    console.log(`   Price: "${price}"`);
                    console.log(`   Container text sample: "${containerText.substring(0, 200)}..."`);
                    
                    break;
                }
            }
            parentContainer = parentContainer.parentElement;
        }
    });
    
    console.log(`\n✅ Found ${itemCount} items total`);
    console.log("=================================\n");
    return itemCount;
};

console.log("💡 TIP: Run these functions in console:");
console.log("   • testPrintButtons() - Force add print buttons (works immediately!)");
console.log("   • debugItemData() - Show buyer/price data for each item");
console.log("   • addPrintButtons() - Manually add print buttons to item cards");
console.log("   • testPriceDetection() - Test full price detection");
console.log("   • testWhatnotPrice() - Test Whatnot-specific detection");
console.log("   • simulateWinWithPrice() - Simulate win event with price detection");
console.log("   • debugItemTitles() - Debug what item titles are available on page");
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
