const { exec } = require("child_process");
const path = require("path");
const { logDebug } = require('./debug-logger');

let lastPrintTime = 0;
const PRINT_COOLDOWN = 1500; // 1.5 seconds

module.exports.printLabel = function (data) {
    const now = Date.now();
    
    // Prevent double prints from rapid WIN events
    if (now - lastPrintTime < PRINT_COOLDOWN) {
        console.log("[COOLDOWN] Skipped duplicate print");
        return;
    }
    lastPrintTime = now;

    const buyer = data.name || "Unknown";
    const item = data.item || "Whatnot Item";
    // Better price handling: check for null, undefined, empty string, or string "null"/"undefined"
    let price = data.price;
    if (!price || price === 'null' || price === 'undefined' || price === '' || price === null || price === undefined) {
        price = null;
    } else {
        // Ensure price is a string and has proper format
        price = String(price).trim();
        // If it doesn't start with $, add it (unless it's empty)
        if (price && !price.startsWith('$') && price !== '0' && price !== '$0') {
            // Check if it's already a number, add $ prefix
            if (/^\d+(\.\d{2})?$/.test(price)) {
                price = '$' + price;
            }
        }
    }

    // Debug logging - track price at printer level
    const eventType = data.manual ? 'manual-print' : 'auto-print';
    logDebug('printer', eventType, { name: buyer, item, price, type: data.type, rawPrice: data.price });

    console.log(`[PRINT] ${buyer} - ${item}${price ? ' - ' + price : ' (NO PRICE)'}`);

    // Get the path to the Python script and venv Python executable
    const pythonScript = path.join(__dirname, "..", "print-label.py");
    const pythonExe = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    
    // Build command with optional price parameter
    let command = `"${pythonExe}" "${pythonScript}" "${buyer}" "${item}"`;
    if (price && price !== 'null' && price !== 'undefined' && price !== '') {
        command += ` "${price}"`;
        console.log(`[PRICE] Included in command: ${price}`);
    } else {
        // Debug: log when price is missing
        console.log(`[WARNING] No price provided for ${buyer} - ${item}`);
        logDebug('printer', eventType, { 
            name: buyer, 
            item, 
            price: null, 
            warning: 'PRICE MISSING IN PRINT COMMAND',
            rawData: data 
        });
    }
    
    // Debug: log the actual command being executed
    logDebug('printer', eventType, { 
        name: buyer, 
        item, 
        price, 
        command: command.substring(0, 200), // Truncate for readability
        hasPriceInCommand: command.includes('"$') || command.includes('"$')
    });
    
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.log("[PRINT FAILED]", err.message);
            logDebug('printer', eventType, { 
                name: buyer, 
                item, 
                price, 
                error: err.message,
                stderr: stderr 
            });
        } else {
            console.log("[PRINTED]");
            logDebug('printer', eventType, { 
                name: buyer, 
                item, 
                price, 
                status: 'printed_successfully',
                stdout: stdout 
            });
        }
    });
};

