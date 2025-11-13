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

    console.log("=== PRINTING LABEL VIA PYTHON ===");
    console.log(`Buyer: ${buyer}`);
    console.log(`Item: ${item}`);
    console.log(`Price: ${price || 'N/A'}`);
    console.log("=================================");

    // Get the path to the Python script and venv Python executable
    const pythonScript = path.join(__dirname, "..", "print-label.py");
    const pythonExe = path.join(__dirname, "..", ".venv", "Scripts", "python.exe");
    
    // Build command with optional price parameter
    let command = `"${pythonExe}" "${pythonScript}" "${buyer}" "${item}"`;
    if (price) {
        command += ` "${price}"`;
    }
    
    console.log(`🖨 Running: ${command}`);

    exec(command, (err, stdout, stderr) => {
        if (err) {
            console.log("❌ PYTHON PRINT ERROR:", err.message);
            console.log("❗ stderr:", stderr);
            console.log("❗ Make sure Python is installed and print-label.py exists");
            console.log("❗ Manual print required:");
            console.log(`   Buyer: ${buyer}`);
            console.log(`   Item: ${item}`);
            console.log(`   Price: ${price || 'N/A'}`);
        } else {
            console.log("✅ PYTHON PRINT SUCCESS!");
            if (stdout) console.log("stdout:", stdout);
        }
    });
};

