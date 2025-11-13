const express = require('express');
const fs = require('fs');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LABELS_PATH = path.join(__dirname, 'labels.json');

// Ensure labels directory exists
const labelsDir = path.join(__dirname, 'labels');
if (!fs.existsSync(labelsDir)) {
    fs.mkdirSync(labelsDir);
    console.log("📁 Created labels directory");
}

function loadConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH));
}

function getCurrentLabelsPath() {
    const cfg = loadConfig();
    if (!cfg.current_show || !cfg.shows[cfg.current_show]) {
        // No active show - return a temp path that won't be used
        return path.join(__dirname, 'labels', 'temp-no-show.json');
    }
    const currentShow = cfg.shows[cfg.current_show];
    return path.join(__dirname, 'labels', currentShow.labels_file);
}

function getLabels() {
    const labelsPath = getCurrentLabelsPath();
    if (!fs.existsSync(labelsPath)) {
        // Create empty labels file if it doesn't exist
        fs.writeFileSync(labelsPath, '[]');
        return [];
    }
    
    try {
        const fileContent = fs.readFileSync(labelsPath, 'utf8').trim();
        if (!fileContent) {
            fs.writeFileSync(labelsPath, '[]');
            return [];
        }
        return JSON.parse(fileContent);
    } catch (e) {
        // If corrupted, reset to empty array
        console.log("Labels file corrupted, resetting");
        fs.writeFileSync(labelsPath, '[]');
        return [];
    }
}

function saveLabel(labelObj) {
    const labelsPath = getCurrentLabelsPath();
    let labels = [];
    if (fs.existsSync(labelsPath)) {
        try {
            const fileContent = fs.readFileSync(labelsPath, 'utf8').trim();
            if (fileContent) {
                labels = JSON.parse(fileContent);
            }
        } catch (e) {
            console.log("Corrupted labels file, resetting to empty array");
            labels = [];
        }
    }
    
    labels.push(labelObj);
    
    // Keep only last 100 entries to prevent infinite growth
    if (labels.length > 100) {
        labels = labels.slice(-100);
    }
    
    try {
        fs.writeFileSync(labelsPath, JSON.stringify(labels, null, 2));
    } catch (e) {
        console.log("Error writing labels file:", e.message);
    }
}

app.post('/event', (req, res) => {
    const cfg = loadConfig();
    const { type, name, item, price } = req.body;

    console.log("🎯 WIN EVENT RECEIVED:", { type, name, item, price });
    console.log("💰 SERVER PRICE DEBUG:", {
        priceValue: price,
        priceType: typeof price,
        priceInBody: 'price' in req.body,
        fullBody: req.body
    });
    
    // SERVER-SIDE DUPLICATE DETECTION - NO DUPLICATES EVER
    const existingLabels = getLabels();
    const now = Date.now();
    
    // Check for ANY duplicate (no time limit)
    const duplicate = existingLabels.find(label => {
        if (type === 'giveaway') {
            // Giveaways: match by exact name AND item 
            return label.type === 'giveaway' && label.name === name && label.item === item;
        } else {
            // Sales: match by exact name AND item AND price
            return label.type === 'sale' && 
                   label.name === name && 
                   label.item === item && 
                   label.price === price;
        }
    });
    
    if (duplicate) {
        console.log("🚫 DUPLICATE WIN DETECTED - REJECTING:");
        console.log(`   Existing: ${duplicate.name} - ${duplicate.item} - ${duplicate.price || 'no price'} (${new Date(duplicate.timestamp).toLocaleString()})`);
        console.log(`   New:      ${name} - ${item} - ${price || 'no price'}`);
        res.json({ status: "duplicate", reason: "Exact duplicate already exists" });
        return;
    }
    
    // Check if there's an active show
    if (!cfg.current_show || !cfg.shows[cfg.current_show]) {
        console.log("🚫 No active show - win logged but not saved or printed");
        res.json({ status: "no_active_show", reason: "No active show - create a new show to start printing" });
        return;
    }

    // Check exclusions
    const exclusions = cfg.exclusions || [];
    const isExcluded = exclusions.some(exclusion => {
        const pattern = exclusion.toLowerCase().trim();
        return pattern && item.toLowerCase().includes(pattern);
    });

    const labelObj = {
        timestamp: Date.now(),
        type,
        name,
        item,
        price: price || null
    };
    saveLabel(labelObj);

    if (isExcluded) {
        console.log("🚫 Item excluded from printing:", item, "- matches exclusion patterns");
        res.json({ status: "excluded", reason: "Item matches exclusion filter" });
        return;
    }

    // Check giveaway printing setting
    if (type === 'giveaway' && !cfg.print_giveaways) {
        console.log("🎁 Giveaway excluded from printing - giveaway printing disabled");
        res.json({ status: "excluded", reason: "Giveaway printing disabled" });
        return;
    }

    if (cfg.printing_enabled) {
        console.log("📄 Printing enabled - sending to printer");
        const printer = require('./printer');
        printer.printLabel(labelObj);
    } else {
        console.log("⏸️ Printing paused - win logged but not printed");
    }

    res.json({ status: "ok" });
});

app.post('/pause', (req, res) => {
    const cfg = loadConfig();
    cfg.printing_enabled = false;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    res.json({ printing: false });
});

app.post('/resume', (req, res) => {
    const cfg = loadConfig();
    cfg.printing_enabled = true;
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    res.json({ printing: true });
});

// Extension heartbeat tracking
let lastExtensionHeartbeat = null;

app.post('/heartbeat', (req, res) => {
    lastExtensionHeartbeat = Date.now();
    res.json({ status: 'ok', timestamp: lastExtensionHeartbeat });
});

app.get('/status', (req, res) => {
    const cfg = loadConfig();
    const now = Date.now();
    const extensionActive = lastExtensionHeartbeat && (now - lastExtensionHeartbeat) < 10000; // 10 seconds
    
    res.json({ 
        printing: cfg.printing_enabled,
        exclusions: cfg.exclusions || [],
        port: cfg.port,
        print_giveaways: cfg.print_giveaways,
        always_on_top: cfg.always_on_top || false,
        current_show: cfg.current_show,
        shows: cfg.shows || {},
        has_active_show: !!(cfg.current_show && cfg.shows[cfg.current_show]),
        extension_active: extensionActive,
        last_extension_heartbeat: lastExtensionHeartbeat
    });
});

app.get('/print-last', (req, res) => {
    let labels = getLabels();
    if (labels.length === 0) return res.json({ error: "none" });

    const printer = require('./printer');
    printer.printLabel(labels[labels.length - 1]);

    res.json({ status: "printed" });
});

app.get('/search', (req, res) => {
    const q = (req.query.q || "").toLowerCase();
    let labels = getLabels();
    const results = labels.filter(l => 
        l.name.toLowerCase().includes(q) ||
        l.item.toLowerCase().includes(q)
    );
    res.json(results);
});

app.get("/test-print", (req, res) => {
    console.log("SERVER: Test print requested");
    const printer = require('./printer');
    printer.printLabel({ type: "test", name: "Test User", item: "Test Print" });
    res.send("OK");
});

// Reset current show data
app.post('/reset', (req, res) => {
    try {
        const labelsPath = getCurrentLabelsPath();
        fs.writeFileSync(labelsPath, '[]');
        console.log("📊 Data reset - current show labels cleared");
        res.json({ status: "reset complete" });
    } catch (e) {
        console.log("❌ Reset failed:", e.message);
        res.status(500).json({ error: "reset failed" });
    }
});

// Reprint a specific label
app.post('/reprint', (req, res) => {
    const { name, item, price } = req.body;
    const priceText = price ? ` (${price})` : '';
    console.log(`🔄 Reprint requested: ${name}${priceText} - ${item}`);
    
    const printer = require('./printer');
    printer.printLabel({ 
        type: "reprint", 
        name: name || "Unknown", 
        item: item || "Unknown Item",
        price: price || null
    });
    
    res.json({ status: "reprint sent" });
});

// Simple health check endpoint
app.get("/ping", (req, res) => {
    res.json({ status: "ok", time: new Date().toLocaleTimeString() });
});

app.get("/recent-wins", (req, res) => {
    let labels = getLabels();
    // Return ALL wins for current show, most recent first
    const allWins = labels.reverse().map(win => ({
        ...win,
        timeAgo: Math.floor((Date.now() - win.timestamp) / 1000)
    }));
    res.json(allWins);
});

// Get current exclusions
app.get("/exclusions", (req, res) => {
    const cfg = loadConfig();
    res.json({ exclusions: cfg.exclusions || [] });
});

// Update exclusions
app.post("/exclusions", (req, res) => {
    try {
        const { exclusions } = req.body;
        const cfg = loadConfig();
        cfg.exclusions = exclusions || [];
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        console.log("🚫 Exclusions updated:", cfg.exclusions);
        res.json({ status: "exclusions saved", exclusions: cfg.exclusions });
    } catch (e) {
        console.log("❌ Failed to save exclusions:", e.message);
        res.status(500).json({ error: "failed to save exclusions" });
    }
});

// Toggle giveaway printing
app.post("/toggle-giveaways", (req, res) => {
    try {
        const { print_giveaways } = req.body;
        const cfg = loadConfig();
        cfg.print_giveaways = print_giveaways;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        console.log("🎁 Giveaway printing:", print_giveaways ? "ENABLED" : "DISABLED");
        res.json({ status: "giveaway setting updated", print_giveaways });
    } catch (e) {
        console.log("❌ Failed to update giveaway setting:", e.message);
        res.status(500).json({ error: "failed to update giveaway setting" });
    }
});

// Save always-on-top preference
app.post("/save-always-on-top", (req, res) => {
    try {
        const { always_on_top } = req.body;
        const cfg = loadConfig();
        cfg.always_on_top = always_on_top;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        console.log("📌 Always on top:", always_on_top ? "ENABLED" : "DISABLED");
        res.json({ status: "always on top setting saved", always_on_top });
    } catch (e) {
        console.log("❌ Failed to save always on top setting:", e.message);
        res.status(500).json({ error: "failed to save always on top setting" });
    }
});

// Create new show
app.post("/create-show", (req, res) => {
    try {
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ error: "Show name required" });
        }
        
        const cfg = loadConfig();
        const showId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const labelsFile = `labels-${showId}.json`;
        
        cfg.shows[showId] = {
            name: name.trim(),
            labels_file: labelsFile,
            created: new Date().toISOString()
        };
        
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        
        // Create empty labels file for the new show in labels folder
        const labelsPath = path.join(__dirname, 'labels', labelsFile);
        fs.writeFileSync(labelsPath, '[]');
        
        console.log("📺 New show created:", name, "->", showId);
        res.json({ status: "show created", showId, show: cfg.shows[showId] });
    } catch (e) {
        console.log("❌ Failed to create show:", e.message);
        res.status(500).json({ error: "failed to create show" });
    }
});

// Switch show
app.post("/switch-show", (req, res) => {
    try {
        const { showId } = req.body;
        const cfg = loadConfig();
        
        if (!cfg.shows[showId]) {
            return res.status(400).json({ error: "Show not found" });
        }
        
        cfg.current_show = showId;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        
        console.log("📺 Switched to show:", cfg.shows[showId].name);
        res.json({ status: "show switched", current_show: showId });
    } catch (e) {
        console.log("❌ Failed to switch show:", e.message);
        res.status(500).json({ error: "failed to switch show" });
    }
});

// End current show
app.post("/end-show", (req, res) => {
    try {
        const cfg = loadConfig();
        const currentShowId = cfg.current_show;
        
        if (!cfg.shows[currentShowId] || currentShowId === 'default') {
            return res.status(400).json({ error: "No active show to end" });
        }
        
        // Mark show as ended
        cfg.shows[currentShowId].ended = new Date().toISOString();
        cfg.shows[currentShowId].status = 'ended';
        
        // Clear current show (set to null to indicate no active show)
        cfg.current_show = null;
        
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        
        console.log("📺 Ended show:", cfg.shows[currentShowId].name);
        res.json({ status: "show ended", showId: currentShowId });
    } catch (e) {
        console.log("❌ Failed to end show:", e.message);
        res.status(500).json({ error: "failed to end show" });
    }
});

// Delete show
app.post("/delete-show", (req, res) => {
    try {
        const { showId } = req.body;
        const cfg = loadConfig();
        
        if (showId === 'default') {
            return res.status(400).json({ error: "Cannot delete default show" });
        }
        
        if (!cfg.shows[showId]) {
            return res.status(400).json({ error: "Show not found" });
        }
        
        // Delete the labels file
        const labelsFile = cfg.shows[showId].labels_file;
        const labelsPath = path.join(__dirname, labelsFile);
        if (fs.existsSync(labelsPath)) {
            fs.unlinkSync(labelsPath);
        }
        
        // Remove from config
        delete cfg.shows[showId];
        
        // If this was the current show, clear it
        if (cfg.current_show === showId) {
            cfg.current_show = null;
        }
        
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
        
        console.log("📺 Deleted show:", showId);
        res.json({ status: "show deleted", showId });
    } catch (e) {
        console.log("❌ Failed to delete show:", e.message);
        res.status(500).json({ error: "failed to delete show" });
    }
});

const cfg = loadConfig();
app.listen(cfg.port, () => {
    console.log("Server running on port", cfg.port);
    console.log("🔍 Extension debugging enabled - check /heartbeat and /extension-status");
});
