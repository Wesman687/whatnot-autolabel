const { exec } = require("child_process");
const path = require("path");

let lastPrintTime = 0;
const PRINT_COOLDOWN = 1500; // 1.5 seconds

module.exports.printLabel = function (data) {
    const now = Date.now();
    
    // Prevent double prints from rapid WIN events
    if (now - lastPrintTime < PRINT_COOLDOWN) {
        console.log("⏳ Cooldown active — skipped duplicate print");
        return;
    }
    lastPrintTime = now;

    const buyer = data.name || "Unknown";
    const item = data.item || "Whatnot Item";
    const price = data.price || null;

    console.log(`🖨 PRINT: ${buyer} - ${item}${price ? ' - ' + price : ''}`);

    // Get the path to the Python script and venv Python executable
    const pythonScript = path.join(__dirname, "..", "print-label.py");
    const pythonExe = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    
    // Build command with optional price parameter
    let command = `"${pythonExe}" "${pythonScript}" "${buyer}" "${item}"`;
    if (price) {
        command += ` "${price}"`;
    }
    
    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.log("❌ PRINT FAILED:", err.message);
        } else {
            console.log("✅ PRINTED");
        }
    });
};

