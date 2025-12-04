// Note: Duplicate detection now handled by server - extension just sends all events
let giveawayCounter = 1;

// Clean price string - remove "Sold for", "Payment Pending", etc. and ensure proper format
function cleanPrice(price) {
    if (!price) return null;
    
    let cleaned = String(price).trim();
    
    // Remove common prefixes
    cleaned = cleaned.replace(/^(Sold\s+for|Payment\s+Pending|Price|Cost):?\s*/i, '');
    
    // Extract just the dollar amount
    const priceMatch = cleaned.match(/\$?(\d+(?:\.\d{2})?)/);
    if (priceMatch) {
        const amount = priceMatch[1];
        // Ensure it has $ prefix
        return '$' + amount;
    }
    
    // If it already starts with $, return as is (if valid format)
    if (/^\$\d+(\.\d{2})?$/.test(cleaned)) {
        return cleaned;
    }
    
    return null;
}

// CLIENT-SIDE THROTTLING - Prevent spam to server
// Permanent duplicate detection - once a win is detected, it never triggers again (for this page session)
const recentWins = new Set(); // Key: "name|item" (permanent for session - no expiration)

function isRecentlyThrottled(name, item, price) {
    try {
        // Validate inputs
        if (!name || !item) {
            return false; // Don't throttle invalid data
        }
        
        // Use name and item only (ignore price variations) to catch duplicates
        const key = `${name}|${item}`;
        
        // Check if we've already processed this exact win
        if (recentWins.has(key)) {
            console.log(`⏸️ [THROTTLE] Blocking duplicate win (already processed): ${name} - ${item}`);
            return true; // Block duplicate - never show again
        }
        
        // Mark as processed (permanent for this session)
        recentWins.add(key);
        console.log(`✅ [THROTTLE] Allowing new win: ${name} - ${item} (added to permanent throttle set)`);
        
        // Clean up if set gets too large (keep last 500 to prevent memory issues)
        if (recentWins.size > 500) {
            // Convert to array, keep last 500, clear and re-add
            const entriesArray = Array.from(recentWins);
            recentWins.clear();
            entriesArray.slice(-500).forEach(entry => recentWins.add(entry));
            console.log(`🧹 [THROTTLE] Cleaned up throttle set, kept last 500 entries`);
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
    // Strategy 0: Try specialized Whatnot price detection first
    const whatnotPrice = findWhatnotPrice();
    if (whatnotPrice) {
        return cleanPrice(whatnotPrice);
    }
    
    // Strategy 1: Look in modals/popups first (most accurate for win announcements)
    const modalSelectors = [
        '[role="dialog"]',
        '[class*="modal"]', 
        '[class*="popup"]',
        '[class*="overlay"]',
        '[class*="notification"]'
    ];
    
    for (const modalSelector of modalSelectors) {
        const modals = document.querySelectorAll(modalSelector);
        
        for (const modal of modals) {
            const modalText = modal.innerText || modal.textContent || '';
            if (modalText.toLowerCase().includes('won')) {
                // Look for prices that are standalone (not part of descriptions like "2nd Gen")
                const lines = modalText.split('\n');
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    // Match exact price format: $XX or $XX.XX as standalone text
                    if (/^\$\d+(\.\d{2})?$/.test(trimmedLine)) {
                        return cleanPrice(trimmedLine);
                    }
                    // Also check for "Sold" context
                    if (trimmedLine.includes('Sold') || trimmedLine.includes('sold')) {
                        const priceMatch = trimmedLine.match(/\$(\d+(?:\.\d{2})?)/);
                        if (priceMatch) {
                            return cleanPrice(priceMatch[0]);
                        }
                    }
                }
            }
        }
    }
    
    // Strategy 2: Look for Whatnot-specific price elements
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
        
        for (const element of elements) {
            const text = (element.innerText || element.textContent || '').trim();
            if (text && text.includes('$')) {
                // Check for exact price format first (avoids "2nd Gen" type issues)
                if (/^\$\d+(\.\d{2})?$/.test(text)) {
                    return cleanPrice(text);
                }
                
                // Fallback: check if it's a number-only price in a price context
                const priceMatch = text.match(/^\$(\d+(?:\.\d{2})?)$/);
                if (priceMatch) {
                    return cleanPrice(priceMatch[0]);
                }
            }
        }
    }
    
    // Strategy 3: Scan visible text on screen for patterns
    const fullPageText = document.body.innerText || '';
    const allPrices = [...fullPageText.matchAll(/\$(\d+(?:\.\d{2})?)/g)];
    
    if (allPrices.length > 0) {
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
                        return cleanPrice(trimmedLine);
                    }
                    // Or look for "Sold" specific context
                    if (line.toLowerCase().includes('sold') && /\$\d+(\.\d{2})?/.test(line)) {
                        const soldPrice = line.match(/\$(\d+(?:\.\d{2})?)/);
                        if (soldPrice) {
                            return cleanPrice(soldPrice[0]);
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
            return cleanPrice(highestPrice.price);
        }
    }
    
    return null;
}

function findWhatnotPrice() {
    // Specialized function for the exact Whatnot price element
    const exactSelector = 'strong.text-right.text-neutrals-opaque-50.block.font-sans.text-body1.leading-body1.font-semibold.text-pretty.tabular-nums';
    let elements = document.querySelectorAll(exactSelector);
    
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
            if (elements.length > 0) break;
        }
    }
    
    // Check all found elements
    for (const element of elements) {
        const text = element.innerText || element.textContent || '';
        
        if (text.match(/^\$\d+(\.\d{2})?$/)) { // Exact price format like $12 or $12.50
            return text;
        }
    }
    
    return null;
}

// Check if payment is pending for a win
function isPaymentPending(name, item) {
    try {
        const allText = document.body?.innerText || document.body?.textContent || '';
        
        // Look for the buyer name and item in context
        // Check if "Payment Pending" appears near the buyer name
        const buyerPattern = new RegExp(`(${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})[\\s\\S]{0,200}Payment Pending`, 'i');
        const match = allText.match(buyerPattern);
        
        if (match) {
            // Found payment pending near this buyer
            // Double-check it's not "Sold for" (which means paid)
            const context = match[0];
            if (context.includes('Sold for') && !context.includes('Payment Pending')) {
                return false; // It's sold/paid
            }
            if (context.includes('Payment Pending')) {
                console.log(`⏸️ [PAYMENT] Payment pending for ${name} - ${item}, holding off on print/announcement`);
                return true; // Payment is pending
            }
        }
        
        return false; // No payment pending found, assume paid
    } catch (error) {
        // On error, default to allowing (backward compatibility)
        console.log(`⚠️ [PAYMENT] Error checking payment status, allowing:`, error.message);
        return false;
    }
}

function sendWin(eventType, name, item, price = null) {
    try {
        // CLIENT-SIDE THROTTLING: Don't spam the server with identical events
        if (isRecentlyThrottled(name, item, price)) {
            return; // Skip sending - already sent recently (silent, no alert)
        }
        
        // Validate inputs to prevent crashes
        if (!name || !item || !eventType) {
            console.log("Invalid win data, skipping:", { eventType, name, item, price });
            return;
        }
        
        // Check if payment is pending - if so, skip printing and announcements
        if (isPaymentPending(name, item)) {
            console.log(`[PAYMENT] Skipping win for ${name} - ${item} (payment pending)`);
            return; // Don't send win, don't print, don't announce
        }
        
        // Clean the price before sending
        const cleanedPrice = cleanPrice(price);
        
        // Debug logging - track price detection at extension level
        console.log(`[DEBUG] EXTENSION - AUTO-PRINT: ${name} - ${item} | PRICE: ${cleanedPrice || 'MISSING'} (${typeof price})`);
        
        // Only log actual wins being sent
        console.log(`WIN: ${name} - ${item}${cleanedPrice ? ' - ' + cleanedPrice : ''} (${eventType})`);
        
        // Check if we should announce to chat (after sending to server, server will tell us)
        checkAndAnnounceToChat(item, name, price);

        // Show visual confirmation that win was detected (with error handling)
        try {
            
            const winAlert = document.createElement('div');
            winAlert.style.cssText = `
                position: fixed; top: 50px; right: 10px; z-index: 99999;
                background: #FF4444; color: white; padding: 15px; border-radius: 5px;
                font-size: 16px; font-weight: bold; box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            `;
            winAlert.textContent = `WIN DETECTED: ${name}`;
            
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
                    payload: { type: eventType, name, item, price: cleanedPrice }
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        sendDirectToServer(eventType, name, item, cleanedPrice);
                    }
                });
            } else {
                sendDirectToServer(eventType, name, item, cleanedPrice);
            }
        } catch (error) {
            sendDirectToServer(eventType, name, item, cleanedPrice);
        }
        
    } catch (error) {
        console.log("SendWin function failed:", error);
    }
}

// Announce wheel win to chat
function announceWheelWinToChat(title, buyer, price) {
    try {
        // Try multiple strategies to find the chat input (prioritize Whatnot-specific selectors)
        const chatInputSelectors = [
            'input[data-cy="chat_text_field"]',  // Whatnot's specific data attribute
            'input.chatInput',                    // Whatnot's chat input class
            'input[placeholder*="Say something"]', // Whatnot's placeholder
            'input[placeholder*="chat"]',
            'input[placeholder*="message"]',
            'textarea[placeholder*="chat"]',
            'textarea[placeholder*="message"]',
            '[data-testid*="chat"] input',
            '[data-testid*="chat"] textarea',
            '[class*="chat"] input',
            '[class*="chat"] textarea'
        ];
        
        let chatInput = null;
        for (const selector of chatInputSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // Check if element is visible and likely the chat input
                const rect = el.getBoundingClientRect();
                const isVisible = rect.width > 0 && rect.height > 0;
                const hasPlaceholder = el.placeholder && (
                    el.placeholder.toLowerCase().includes('say') ||
                    el.placeholder.toLowerCase().includes('chat') ||
                    el.placeholder.toLowerCase().includes('message')
                );
                
                // Prioritize Whatnot-specific selectors
                if (isVisible && (selector.includes('data-cy') || selector.includes('chatInput') || hasPlaceholder)) {
                    chatInput = el;
                    break;
                }
            }
            if (chatInput) break;
        }
        
        if (!chatInput) {
            console.log('❌ [CHAT] Could not find chat input field');
            return false;
        }
        
        console.log('✅ [CHAT] Found chat input:', chatInput);
        
        // Validate inputs
        if (!title) {
            console.log('❌ [CHAT] Cannot announce - missing title');
            return false;
        }
        
        // Use fallback if buyer is empty
        const buyerName = buyer || 'Winner';
        
        // Build the announcement message with proper price formatting
        let priceText = '';
        if (price) {
            // Ensure price has dollar sign - add it if missing
            let formattedPrice = price.trim();
            if (formattedPrice && !formattedPrice.startsWith('$')) {
                // Extract numeric value and add dollar sign
                const numericMatch = formattedPrice.match(/[\d.]+/);
                if (numericMatch) {
                    formattedPrice = '$' + numericMatch[0];
                } else {
                    formattedPrice = '$' + formattedPrice;
                }
            }
            priceText = ` for ${formattedPrice}`;
        }
        const message = `🎡 ${buyerName} won ${title}${priceText}!`;
        
        console.log(`💬 [CHAT] Announcing wheel win: "${message}"`);
        
        // Focus the input
        chatInput.focus();
        chatInput.click();
        
        // Clear any existing value first
        chatInput.value = '';
        
        // Set the value using multiple methods for React compatibility
        chatInput.value = message;
        
        // Trigger input events (React listens for these)
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        chatInput.dispatchEvent(inputEvent);
        chatInput.dispatchEvent(changeEvent);
        
        // React-specific value setting (for controlled components)
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            'value'
        )?.set;
        if (nativeInputValueSetter) {
            nativeInputValueSetter.call(chatInput, message);
            chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Wait a moment for React to update, then send via Enter key
        setTimeout(() => {
            // Verify the value was set
            if (chatInput.value !== message) {
                console.log('⚠️ [CHAT] Value not set correctly, retrying...');
                chatInput.value = message;
                chatInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // Send via Enter key (Whatnot uses Enter to send)
            const enterDownEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            const enterPressEvent = new KeyboardEvent('keypress', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            const enterUpEvent = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            // Dispatch all three events (some apps listen to different ones)
            chatInput.dispatchEvent(enterDownEvent);
            chatInput.dispatchEvent(enterPressEvent);
            chatInput.dispatchEvent(enterUpEvent);
            
            console.log('✅ [CHAT] Sent Enter key to submit message');
        }, 150);
        
        return true;
    } catch (error) {
        console.log(`❌ [CHAT] Error announcing to chat:`, error.message);
        return false;
    }
}

// Send wheel winner to wheel server (wheel server will then send back to main server)
function sendToWheelServer(title, buyer, price) {
    try {
        // Check if payment is pending - CRITICAL: don't send wheel wins if payment pending
        if (isPaymentPending(buyer, title)) {
            console.log(`⏸️ [WHEEL] Payment pending for ${buyer} - ${title}, NOT sending to wheel server`);
            return; // Don't send to wheel server if payment is pending
        }
        
        // Check if wheel spin announcements are enabled
        fetch('http://localhost:7777/status')
        .then(r => r.json())
        .then(statusData => {
            const announceWheelSpins = statusData.announce_wheel_spins !== undefined ? statusData.announce_wheel_spins : true;
            
            if (!announceWheelSpins) {
                console.log("🎡 [WHEEL] Wheel spin announcements disabled, skipping");
                return;
            }
            
            // Validate inputs
            if (!title || !buyer) {
                console.log("🐛 [WHEEL] Skipping - missing title or buyer:", { title, buyer });
                return;
            }
            
            // Ensure price is always a string (use empty string if null/undefined)
            const priceString = price || "";
            
            // Extract numeric amount from price string (e.g., "$15.50" -> "15.50")
            let amount = "";
            if (priceString) {
                const amountMatch = priceString.match(/[\d.]+/);
                amount = amountMatch ? amountMatch[0] : "";
            }
            
            const payload = {
                buyer: buyer,
                amount: amount,
                message: `Thanks for purchasing ${title}!` // optional message
            };
            
            console.log(`🎡 [WHEEL] Sending to wheel server:`, payload);
            
            // Send to wheel server (wheel server will handle announcing via main server)
            fetch('http://localhost:3800/buy-notification', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            })
            .then(response => {
                if (!response || !response.ok) {
                    throw new Error(`Wheel server error: ${response?.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`✅ [WHEEL] Successfully sent to wheel server:`, data);
            })
            .catch(error => {
                console.log(`❌ [WHEEL] Failed to send to wheel server:`, error.message);
                // Silent error handling - wheel server might not be running
            });
        })
        .catch(error => {
            // If status check fails, default to enabled (backward compatibility)
            console.log(`⚠️ [WHEEL] Could not check wheel spin setting, defaulting to enabled`);
            
            // Validate inputs
            if (!title || !buyer) {
                return;
            }
            
            // Extract numeric amount from price string
            const priceString = price || "";
            let amount = "";
            if (priceString) {
                const amountMatch = priceString.match(/[\d.]+/);
                amount = amountMatch ? amountMatch[0] : "";
            }
            
            const payload = {
                buyer: buyer,
                amount: amount,
                message: `Thanks for purchasing ${title}!`
            };
            
            fetch('http://localhost:3800/buy-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).catch(() => {}); // Silent error
        });
        
        // Note: Chat announcement will be handled by polling pending announcements
        
    } catch (error) {
        console.log(`❌ [WHEEL] Error in sendToWheelServer:`, error.message);
        // Silent error handling
    }
}

function escapeRegex(text = "") {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWheelCardForBuyer(buyer) {
    if (!buyer) {
        return false;
    }

    try {
        const normalizedBuyer = buyer.toLowerCase().trim();
        if (!normalizedBuyer) {
            return false;
        }

        const buyerPattern = new RegExp(`buyer\\s*:\\s*${escapeRegex(normalizedBuyer)}`, 'i');
        const cards = document.querySelectorAll('.flex.flex-row.gap-4, [class*="lot-card"], [class*="sale-card"]');

        for (const card of cards) {
            const text = (card.innerText || card.textContent || '').toLowerCase();
            if (!text) {
                continue;
            }
            if (!text.includes('wheel')) {
                continue;
            }
            if (buyerPattern.test(text)) {
                return true;
            }
        }
    } catch (error) {
        console.log("⚠️ [WHEEL] Wheel card detection failed:", error.message);
    }

    return false;
}

// Track processed wheel announcements to prevent duplicates
const processedWheelAnnouncements = new Set();

// Check for pending wheel announcements from wheel server (via status endpoint)
// Polls faster (every 0.5 seconds) for near-instant announcements
let lastWheelCheckTime = 0;
function checkPendingWheelAnnouncements() {
    try {
        const now = Date.now();
        // Throttle to every 0.5 seconds
        if (now - lastWheelCheckTime < 500) {
            return;
        }
        lastWheelCheckTime = now;
        
        fetch('http://localhost:7777/status')
        .then(r => r.json())
        .then(data => {
            const announcements = data.pending_wheel_announcements || [];
            
            if (announcements.length > 0) {
                console.log(`🎡 [WHEEL] Found ${announcements.length} pending wheel announcements`);
                
                // Filter out already processed announcements and validate
                const newAnnouncements = announcements.filter(announcement => {
                    // Skip if missing critical data
                    if (!announcement.title) {
                        console.log(`⚠️ [WHEEL] Skipping announcement - missing title`);
                        return false;
                    }
                    
                    // Create unique key from announcement data (use timestamp if buyer is missing)
                    const buyerKey = announcement.buyer || `no-buyer-${announcement.timestamp}`;
                    const key = `${buyerKey}|${announcement.title}|${announcement.price || ''}|${announcement.timestamp}`;
                    
                    if (processedWheelAnnouncements.has(key)) {
                        console.log(`🚫 [WHEEL] Skipping duplicate announcement: ${buyerKey} - ${announcement.title}`);
                        return false; // Already processed
                    }
                    
                    // Mark as processed
                    processedWheelAnnouncements.add(key);
                    return true; // New announcement
                });
                
                if (newAnnouncements.length === 0) {
                    // All were duplicates or invalid, but we still need to clear them from server
                    fetch('http://localhost:7777/clear-wheel-announcements', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ count: announcements.length })
                    }).catch(() => {});
                    return;
                }
                
                console.log(`🎡 [WHEEL] Processing ${newAnnouncements.length} new announcements (${announcements.length - newAnnouncements.length} duplicates/invalid skipped)`);
                
                // Announce each new one to chat
                newAnnouncements.forEach((announcement, index) => {
                    setTimeout(() => {
                        // Use "Winner" as fallback if buyer is empty
                        const buyer = announcement.buyer || 'Winner';
                        
                        // Format price for logging (add $ if missing)
                        let priceForLog = announcement.price || '';
                        if (priceForLog && !priceForLog.startsWith('$')) {
                            const numericMatch = priceForLog.match(/[\d.]+/);
                            if (numericMatch) {
                                priceForLog = '$' + numericMatch[0];
                            }
                        }
                        
                        console.log(`💬 [WHEEL] Announcing to chat: ${buyer} won ${announcement.title}${priceForLog ? ' for ' + priceForLog : ''}`);
                        announceWheelWinToChat(
                            announcement.title,
                            buyer,
                            announcement.price || ''
                        );
                    }, index * 500); // Stagger announcements by 500ms
                });
                
                // Clear ALL announcements from server (including duplicates)
                fetch('http://localhost:7777/clear-wheel-announcements', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ count: announcements.length })
                })
                .then(() => {
                    console.log(`✅ [WHEEL] Cleared ${announcements.length} announcements from server`);
                })
                .catch(error => {
                    console.log(`❌ [WHEEL] Failed to clear announcements:`, error.message);
                });
                
                // Clean up old processed keys (keep last 100 to prevent memory leak)
                if (processedWheelAnnouncements.size > 100) {
                    const keysArray = Array.from(processedWheelAnnouncements);
                    const keysToRemove = keysArray.slice(0, keysArray.length - 100);
                    keysToRemove.forEach(key => processedWheelAnnouncements.delete(key));
                }
            }
        })
        .catch(error => {
            // Silent error - server might not be running
        });
    } catch (error) {
        // Silent error handling
    }
}

// Check if item should be announced to chat and do it
function checkAndAnnounceToChat(item, buyer, price) {
    try {
        // Get chat announcement settings from server
        fetch('http://localhost:7777/chat-announce-settings')
        .then(r => r.json())
        .then(settings => {
            // Check if chat announcements are enabled
            if (!settings.announce_to_chat) {
                return; // Chat announcements disabled
            }
            
            // Check if item title matches any pattern
            const patterns = settings.chat_announce_patterns || [];
            if (patterns.length === 0) {
                return; // No patterns set
            }
            
            const itemLower = item.toLowerCase();
            const matchesPattern = patterns.some(pattern => {
                const patternLower = pattern.toLowerCase().trim();
                return patternLower && itemLower.includes(patternLower);
            });
            
            if (matchesPattern) {
                console.log(`💬 [CHAT] Item matches chat pattern, announcing: ${item}`);
                announceWheelWinToChat(item, buyer, price || '');
            }
        })
        .catch(error => {
            // Silent error - server might not be running
        });
    } catch (error) {
        // Silent error handling
    }
}

// Send manual print (bypasses pause setting)
function sendManualPrint(eventType, name, item, price) {
    try {
        // Validate inputs
        if (!eventType || !name || !item) {
            return;
        }
        
        // Check if payment is pending - warn user but allow manual print
        if (isPaymentPending(name, item)) {
            console.log(`[MANUAL-PRINT] WARNING: Payment pending for ${name} - ${item}`);
            // Still allow manual print, but log warning
        }
        
        // Clean the price before sending
        const cleanedPrice = cleanPrice(price);
        
        // Debug logging - track price at manual print level
        console.log(`[DEBUG] EXTENSION - MANUAL-PRINT: ${name} - ${item} | PRICE: ${cleanedPrice || 'MISSING'} (${typeof price})`);
        
        const payload = {
            type: eventType,
            name: name,
            item: item,
            price: cleanedPrice
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
            // Only announce to chat if payment is NOT pending
            if (!isPaymentPending(name, item)) {
                checkAndAnnounceToChat(item, name, cleanedPrice);
            } else {
                console.log(`[MANUAL-PRINT] Skipping chat announcement (payment pending)`);
            }
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
    
    // Look for win patterns
    if (allText.toLowerCase().includes('won')) {
        const patterns = [
            { pattern: /(\w+)\s+won\s+the\s+auction!/gi, name: "EXACT_MATCH" },
            { pattern: /(\w+)\s+won\s+the\s+giveaway!/gi, name: "giveaway_win" },
            { pattern: /(\w+)\s+won!/gi, name: "general_win" },
            { pattern: /(\w+)\s+won\s+this\s+auction/gi, name: "this_auction_win" },
            { pattern: /congratulations\s+(\w+).*won/gi, name: "congrats_win" }
        ];
        
        let foundAnyPattern = false;
        
        for (const { pattern, name } of patterns) {
            const matches = [...allText.matchAll(pattern)];
            if (matches.length > 0) {
                foundAnyPattern = true;
                
                for (const match of matches) {
                    const winner = match[1];
                    const isGiveaway = match[0].toLowerCase().includes('giveaway');
                    
                    // Extra validation for giveaways to prevent false matches
                    if (isGiveaway && name !== "giveaway_win") {
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
                    
                    console.log(`[WIN] ${winner} - ${itemTitle}${price ? ' - ' + price : ''} (${isGiveaway ? 'giveaway' : 'sale'})`);
                    sendWin(isGiveaway ? 'giveaway' : 'sale', winner, itemTitle, price);
                    
                    // Check if this is a wheel item and send to wheel server
                    const wheelByTitle = itemTitle.toLowerCase().includes('wheel');
                    const wheelByCard = hasWheelCardForBuyer(winner);
                    if (wheelByTitle || wheelByCard) {
                        sendToWheelServer(itemTitle, winner, price);
                    }
                    
                    // Note: Chat announcements are handled in sendWin() via checkAndAnnounceToChat()
                }
            }
        }
        
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

// Periodic scanning every 10 seconds
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

// Faster polling for wheel announcements (every 0.5 seconds)
try {
    setInterval(() => {
        try {
            checkPendingWheelAnnouncements(); // Check for wheel announcements from wheel server
        } catch (error) {
            // Silent error handling
        }
    }, 500);
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
        // Strategy 1: Use flex container selector pattern (works for both sales and giveaways)
        const flexCards = document.querySelectorAll('.flex.flex-row.gap-4');
        const itemCards = [];
        let fallbackUsed = false;
        
        flexCards.forEach(card => {
            // Look for the first meaningful text element that could be a title
            const textElements = card.querySelectorAll('*');
            for (const element of textElements) {
                const text = (element.innerText || element.textContent || '').trim();
                
                // Check if this looks like an item title
                if (text.length > 3 && text.length < 100 && 
                    !text.includes('Buyer:') && 
                    !text.includes('Payment') && 
                    !text.includes('Sold for') &&
                    !text.includes('Qty:') &&
                    !text.includes('$') &&
                    !text.match(/^\d+$/)) {  // Skip pure numbers
                    
                    // Verify this card has buyer info (sales and giveaways both have buyers)
                    const cardText = card.textContent;
                    if (cardText.includes('Buyer:') && 
                        (cardText.includes('Payment Pending') || 
                         cardText.includes('Sold for') || 
                         cardText.includes('Giveaway') ||
                         cardText.includes('$0'))) {
                        
                        itemCards.push({
                            titleElement: element,
                            cardContainer: card,
                            itemTitle: text
                        });
                        break;
                    }
                }
            }
        });
        
        // Strategy 2: Fallback to original method if no flex cards found
        if (itemCards.length === 0) {
            const allElements = document.querySelectorAll('*');
            fallbackUsed = true;
            allElements.forEach(element => {
                const text = (element.innerText || element.textContent || '').trim();
                
                let parentContainer = element.parentElement;
                for (let i = 0; i < 5 && parentContainer; i++) {
                    const containerText = parentContainer.textContent;
                    
                    if (containerText.includes('Buyer:') && 
                        (containerText.includes('Payment Pending:') || 
                         containerText.includes('Sold for') ||
                         containerText.includes('$0'))) {
                        
                        if (text.length > 5 && text.length < 80 && 
                            !text.includes('Buyer:') && 
                            !text.includes('Payment') && 
                            !text.includes('Sold for') &&
                            !text.includes('Qty:')) {
                            
                            itemCards.push({
                                titleElement: element,
                                cardContainer: parentContainer,
                                itemTitle: text
                            });
                            break;
                        }
                    }
                    parentContainer = parentContainer.parentElement;
                }
            });
        }
        
        let buttonsAdded = 0;
        
        itemCards.forEach((cardInfo, index) => {
            const { titleElement, cardContainer, itemTitle } = cardInfo;
            
            const isWheelText = (itemTitle || '').toLowerCase().includes('wheel');
            const fallbackWheelText = (cardContainer.textContent || '').toLowerCase().includes('wheel');
            const isWheelItem = isWheelText || fallbackWheelText;
            const hasPrintBtn = !!cardContainer.querySelector('.whatnot-autoprint-btn');
            const hasWheelBtn = !!cardContainer.querySelector('.whatnot-wheel-btn');

            const willAddPrint = !hasPrintBtn;
            const willAddWheel = isWheelItem && !hasWheelBtn;

            if (!willAddPrint && !willAddWheel) {
                return;
            }
            
            // Extract buyer and price info (works for sales, giveaways, and $0 items)
            let buyerName = 'Unknown';
            let salePrice = null;
            
            const allText = cardContainer.textContent;
            
            // Extract buyer name - works for all types
            const buyerMatch = allText.match(/Buyer:\s*([a-zA-Z0-9_]+)(?:\s|$|[^a-zA-Z0-9_])/);
            if (buyerMatch) {
                buyerName = buyerMatch[1];
            } else {
                // Fallback: look for colored buyer name text
                const coloredElements = cardContainer.querySelectorAll('*');
                for (const el of coloredElements) {
                    const text = (el.textContent || '').trim();
                    // Look for username-like text (short, no spaces, not system text)
                    if (text.length > 2 && text.length < 25 && 
                        !text.includes('Buyer') && !text.includes('$') && 
                        !text.includes('Item') && !text.includes('Qty') &&
                        !text.includes('Payment') && !text.includes('Sold') &&
                        text.match(/^[a-zA-Z0-9_]+$/)) {
                        buyerName = text;
                        break;
                    }
                }
            }
            
            // Extract price - handle sales, giveaways, and $0 items
            // Match prices with optional cents: $15 or $15.50
            const paymentPendingMatch = allText.match(/Payment Pending:\s*\$(\d+(?:\.\d{2})?)/);
            const soldForMatch = allText.match(/Sold for\s*\$(\d+(?:\.\d{2})?)/);
            
            // Check payment status - if "Payment Pending" exists and "Sold for" doesn't, it's pending
            const hasPaymentPending = paymentPendingMatch !== null;
            const hasSoldFor = soldForMatch !== null;
            const isPaymentPending = hasPaymentPending && !hasSoldFor;
            
            if (paymentPendingMatch) {
                // Extract and clean price
                salePrice = cleanPrice('$' + paymentPendingMatch[1]);
            } else if (soldForMatch) {
                // Extract and clean price (remove "Sold for" text)
                salePrice = cleanPrice('$' + soldForMatch[1]);
            } else if (allText.includes('$0')) {
                salePrice = '$0';
            }
            
            let printBtn = null;
            if (willAddPrint) {
                printBtn = document.createElement('span');
                printBtn.className = 'whatnot-autoprint-btn';
                printBtn.innerHTML = isPaymentPending ? ' ⏸️' : ' 🖨️';
                printBtn.title = isPaymentPending 
                    ? `Payment Pending - Wait for payment before printing ${buyerName} - ${itemTitle}`
                    : `Print label for ${buyerName} - ${itemTitle}`;
                printBtn.style.cssText = `
                    display: inline;
                    margin-left: 8px;
                    color: ${isPaymentPending ? '#FF9800' : '#4CAF50'};
                    font-size: 14px;
                    cursor: ${isPaymentPending ? 'not-allowed' : 'pointer'};
                    user-select: none;
                    transition: all 0.2s ease;
                    opacity: ${isPaymentPending ? '0.6' : '1'};
                `;
                
                if (!isPaymentPending) {
                    printBtn.addEventListener('mouseenter', () => {
                        printBtn.style.color = '#45a049';
                        printBtn.style.transform = 'scale(1.2)';
                    });
                    printBtn.addEventListener('mouseleave', () => {
                        printBtn.style.color = '#4CAF50';
                        printBtn.style.transform = 'scale(1)';
                    });
                }
            }

            let wheelBtn = null;
            if (willAddWheel) {
                wheelBtn = document.createElement('span');
                wheelBtn.className = 'whatnot-wheel-btn';
                wheelBtn.innerHTML = ' 🎡';
                wheelBtn.title = `Send to wheel server: ${buyerName} - ${itemTitle}`;
                wheelBtn.style.cssText = `
                    display: inline;
                    margin-left: 4px;
                    color: #2196F3;
                    font-size: 14px;
                    cursor: pointer;
                    user-select: none;
                    transition: all 0.2s ease;
                `;
                
                // Add hover effects
                wheelBtn.addEventListener('mouseenter', () => {
                    wheelBtn.style.color = '#1976D2';
                    wheelBtn.style.transform = 'scale(1.2)';
                });
                wheelBtn.addEventListener('mouseleave', () => {
                    wheelBtn.style.color = '#2196F3';
                    wheelBtn.style.transform = 'scale(1)';
                });
                
                // Add click handler for manual wheel send
                wheelBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const originalContent = wheelBtn.innerHTML;
                    wheelBtn.innerHTML = ' ⏳';
                    wheelBtn.style.color = '#FF9800';
                    
                    console.log(`🎡 [MANUAL-WHEEL] Sending to wheel server: ${buyerName} - ${itemTitle} - ${salePrice || 'no price'}`);
                    
                    // Extract numeric amount from price
                    let amount = "";
                    if (salePrice) {
                        const amountMatch = salePrice.match(/[\d.]+/);
                        amount = amountMatch ? amountMatch[0] : "";
                    }
                    
                    const payload = {
                        buyer: buyerName,
                        amount: amount,
                        message: `Thanks for purchasing ${itemTitle}!`
                    };
                    
                    // Send to wheel server (manual override - bypasses payment pending check)
                    fetch('http://localhost:3800/buy-notification', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                    })
                    .then(response => {
                        if (!response || !response.ok) {
                            throw new Error(`Wheel server error: ${response?.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log(`✅ [MANUAL-WHEEL] Successfully sent to wheel server:`, data);
                        wheelBtn.innerHTML = ' ✅';
                        wheelBtn.style.color = '#4CAF50';
                        setTimeout(() => {
                            wheelBtn.innerHTML = originalContent;
                            wheelBtn.style.color = '#2196F3';
                        }, 2000);
                    })
                    .catch(error => {
                        console.log(`❌ [MANUAL-WHEEL] Failed to send to wheel server:`, error.message);
                        wheelBtn.innerHTML = ' ❌';
                        wheelBtn.style.color = '#f44336';
                        setTimeout(() => {
                            wheelBtn.innerHTML = originalContent;
                            wheelBtn.style.color = '#2196F3';
                        }, 2000);
                    });
                });
            }
            
            // Add click handler
            if (printBtn) {
                printBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Show confirmation
                const originalContent = printBtn.innerHTML;
                printBtn.innerHTML = ' ✅';
                printBtn.style.color = '#2196F3';
                
                // Determine if this is a giveaway or sale based on price and context
                let eventType = 'sale';  // Default to sale
                
                // Check if it's a giveaway based on multiple indicators:
                const cardText = cardContainer.textContent.toLowerCase();
                if (salePrice === '$0' || 
                    cardText.includes('giveaway') || 
                    cardText.includes('givvy') ||
                    itemTitle.toLowerCase().includes('giveaway') ||
                    itemTitle.toLowerCase().includes('givvy')) {
                    eventType = 'giveaway';
                }
                
                // Check payment status before allowing print/wheel server
                if (isPaymentPending) {
                    // Disable button and show warning
                    printBtn.style.opacity = '0.5';
                    printBtn.style.cursor = 'not-allowed';
                    printBtn.title = 'Payment Pending - Wait for payment before printing';
                    console.log(`⏸️ [MANUAL-PRINT] Payment pending for ${buyerName} - ${itemTitle}, button disabled`);
                    return; // Don't allow manual print if payment pending
                }
                
                // Send to manual print endpoint (bypasses pause setting)
                try {
                    sendManualPrint(eventType, buyerName, itemTitle, salePrice);
                } catch (error) {
                    // Silent error handling
                }
                
                // Check if this is a wheel item and send to wheel server (separate from print)
                // Only if payment is NOT pending
                if (itemTitle.toLowerCase().includes('wheel') && !isPaymentPending) {
                    sendToWheelServer(itemTitle, buyerName, salePrice);
                }
                
                // Note: Chat announcements are handled in sendManualPrint() via checkAndAnnounceToChat()
                
                // Reset button after 2 seconds
                setTimeout(() => {
                    printBtn.innerHTML = originalContent;
                    printBtn.style.color = '#4CAF50';
                }, 2000);
            });
        }
            
            // Add the buttons directly to the title element (inline with the text)
            try {
                // Append directly to the title element so it appears right after the title text
                if (printBtn) {
                    titleElement.appendChild(printBtn);
                }
                if (wheelBtn) {
                    titleElement.appendChild(wheelBtn);
                }
                buttonsAdded++;
            } catch (appendError) {
                // Fallback: try adding to parent
                try {
                    if (titleElement.parentElement) {
                        if (printBtn) {
                            titleElement.parentElement.appendChild(printBtn);
                        }
                        if (wheelBtn) {
                            titleElement.parentElement.appendChild(wheelBtn);
                        }
                        buttonsAdded++;
                    }
                } catch (fallbackError) {
                    // Silent error handling
                }
            }
        });
        
        console.log(`[AutoPrint] injectPrintButtons: cards=${itemCards.length} fallback=${fallbackUsed} added=${buttonsAdded}`);
        return buttonsAdded;
        
    } catch (error) {
        return 0;
    }
}

console.log("🔥 Whatnot AutoPrint (Updated 2025 DOM) Loaded");
console.log("🔍 Current page URL:", window.location.href);
console.log("📊 Page title:", document.title);
console.log("⏰ Will scan every 10 seconds and send heartbeats every 2 seconds");
console.log("🎡 Will check for pending wheel announcements every 2 seconds");

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


// Test payment pending detection
window.testPaymentPending = function(buyerName, itemTitle) {
    console.log("\n🧪 TESTING PAYMENT PENDING DETECTION");
    console.log("====================================");
    
    const testBuyer = buyerName || "TestUser123";
    const testItem = itemTitle || "Test Wheel Item";
    
    // Inject test HTML that mimics payment pending status
    const testContainer = document.createElement('div');
    testContainer.id = 'payment-pending-test';
    testContainer.style.cssText = 'position: fixed; top: 50px; left: 50px; z-index: 99999; background: #1a1a1a; padding: 20px; border: 2px solid #FF9800; border-radius: 8px; color: white; max-width: 400px;';
    testContainer.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>🧪 Payment Pending Test</strong>
        </div>
        <div style="margin-bottom: 10px;">
            Buyer: ${testBuyer}<br>
            Item: ${testItem}<br>
            Payment Pending: $15.50
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #aaa;">
            This simulates a payment pending status. Check console for test results.
        </div>
        <button onclick="document.getElementById('payment-pending-test').remove()" style="margin-top: 10px; padding: 5px 10px; background: #FF9800; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    `;
    document.body.appendChild(testContainer);
    
    // Test the isPaymentPending function
    console.log(`\n1️⃣ Testing isPaymentPending() function:`);
    const isPending = isPaymentPending(testBuyer, testItem);
    console.log(`   Result: ${isPending ? '✅ Payment Pending detected' : '❌ Payment Pending NOT detected'}`);
    
    // Test sendWin with payment pending
    console.log(`\n2️⃣ Testing sendWin() with payment pending:`);
    console.log(`   This should be blocked if payment is pending...`);
    sendWin('sale', testBuyer, testItem, '$15.50');
    
    // Test sendToWheelServer with payment pending
    console.log(`\n3️⃣ Testing sendToWheelServer() with payment pending:`);
    console.log(`   This should be blocked if payment is pending...`);
    sendToWheelServer(testItem, testBuyer, '$15.50');
    
    console.log(`\n✅ Test complete! Check console messages above.`);
    console.log(`💡 The test HTML will remain on page - close it manually or refresh.`);
    console.log("====================================\n");
    
    return {
        buyer: testBuyer,
        item: testItem,
        paymentPending: isPending,
        testElement: testContainer
    };
};

// Test payment PAID scenario
window.testPaymentPaid = function(buyerName, itemTitle) {
    console.log("\n🧪 TESTING PAYMENT PAID SCENARIO");
    console.log("=================================");
    
    const testBuyer = buyerName || "TestUser123";
    const testItem = itemTitle || "Test Wheel Item";
    
    // Inject test HTML that mimics paid status
    const testContainer = document.createElement('div');
    testContainer.id = 'payment-paid-test';
    testContainer.style.cssText = 'position: fixed; top: 50px; left: 50px; z-index: 99999; background: #1a1a1a; padding: 20px; border: 2px solid #4CAF50; border-radius: 8px; color: white; max-width: 400px;';
    testContainer.innerHTML = `
        <div style="margin-bottom: 10px;">
            <strong>✅ Payment Paid Test</strong>
        </div>
        <div style="margin-bottom: 10px;">
            Buyer: ${testBuyer}<br>
            Item: ${testItem}<br>
            Sold for: $15.50
        </div>
        <div style="margin-top: 10px; font-size: 12px; color: #aaa;">
            This simulates a paid status. Check console for test results.
        </div>
        <button onclick="document.getElementById('payment-paid-test').remove()" style="margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer;">Close</button>
    `;
    document.body.appendChild(testContainer);
    
    // Test the isPaymentPending function (should return false)
    console.log(`\n1️⃣ Testing isPaymentPending() function:`);
    const isPending = isPaymentPending(testBuyer, testItem);
    console.log(`   Result: ${isPending ? '❌ Still showing as pending (wrong!)' : '✅ Payment NOT pending (correct - should proceed)'}`);
    
    // Test sendWin with payment paid
    console.log(`\n2️⃣ Testing sendWin() with payment paid:`);
    console.log(`   This should proceed normally...`);
    sendWin('sale', testBuyer, testItem, '$15.50');
    
    // Test sendToWheelServer with payment paid
    console.log(`\n3️⃣ Testing sendToWheelServer() with payment paid:`);
    console.log(`   This should proceed normally...`);
    sendToWheelServer(testItem, testBuyer, '$15.50');
    
    console.log(`\n✅ Test complete! Check console messages above.`);
    console.log("=================================\n");
    
    return {
        buyer: testBuyer,
        item: testItem,
        paymentPending: isPending,
        testElement: testContainer
    };
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
console.log("   • testPaymentPending('Buyer', 'Item') - Test payment pending detection");
console.log("   • testPaymentPaid('Buyer', 'Item') - Test payment paid scenario");

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

