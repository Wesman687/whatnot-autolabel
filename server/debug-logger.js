const fs = require('fs');
const path = require('path');

const DEBUG_LOG_DIR = path.join(__dirname, 'debug-logs');
const DEBUG_LOG_FILE = path.join(DEBUG_LOG_DIR, `debug-${new Date().toISOString().split('T')[0]}.log`);

// Ensure debug logs directory exists
if (!fs.existsSync(DEBUG_LOG_DIR)) {
    fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
}

function logDebug(source, eventType, data) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        source, // 'extension', 'server-event', 'server-manual', 'printer', 'python'
        eventType, // 'auto-print', 'manual-print', 'reprint'
        data: {
            name: data.name || data.buyer || null,
            item: data.item || null,
            price: data.price || null,
            type: data.type || null,
            priceType: typeof data.price,
            hasPrice: 'price' in data,
            priceValue: data.price,
            rawData: data
        }
    };
    
    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
        fs.appendFileSync(DEBUG_LOG_FILE, logLine, 'utf8');
    } catch (err) {
        console.error('Failed to write debug log:', err.message);
    }
    
    // Also log to console with emoji for visibility
    const priceInfo = data.price ? `PRICE: ${data.price} (${typeof data.price})` : 'PRICE: MISSING';
    console.log(`[DEBUG] ${source.toUpperCase()} - ${eventType}: ${data.name || 'Unknown'} - ${data.item || 'Unknown'} | ${priceInfo}`);
}

module.exports = { logDebug };


