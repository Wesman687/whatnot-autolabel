# Express Server Documentation

## 📁 Location: `/server/`

## 🎯 Purpose
Central processing hub that receives win events from the Chrome extension, validates them against business rules, manages show data, handles duplicate detection, and triggers label printing.

## 📋 Files Structure
```
server/
├── server.js           # Main Express application
├── printer.js         # Printing logic and Python integration  
├── print-template.js   # Label formatting functions
├── config.json        # Server configuration (auto-generated)
├── package.json       # Node.js dependencies
└── labels/            # Show-based label storage directory
```

## 🚀 Startup
```bash
cd server
node server.js
```
**Port**: 7777 (configurable in config.json)

## 📄 config.json Structure
```json
{
  "printing_enabled": true,
  "port": 7777,
  "print_giveaways": false,
  "always_on_top": false,
  "current_show": "my-auction-event",
  "shows": {
    "my-auction-event": "",
    "default": "",
    "test": ""
  },
  "exclusions": {
    "scammer123": true,
    "problembuyer": true
  }
}
```

### Configuration Fields
- `printing_enabled`: Master switch for all printing
- `port`: Server port (usually 7777)
- `print_giveaways`: Whether to print giveaway wins
- `always_on_top`: GUI window behavior
- `current_show`: Active show name (only this show prints labels)
- `shows`: Dictionary of all shows (name -> description)
- `exclusions`: Blocked usernames (name -> true)

## 🌐 API Endpoints

### Core Endpoints

#### POST `/event` - Win Event Processing
**Purpose**: Receives win events from Chrome extension

**Request Body**:
```json
{
  "type": "sale|giveaway",
  "name": "winner_username",
  "item": "Auction Item Description", 
  "price": "$25.00"
}
```

**Response Examples**:
```json
// Success
{
  "status": "printed",
  "message": "Label printed successfully"
}

// Duplicate detected
{
  "status": "duplicate", 
  "reason": "Exact duplicate already exists"
}

// No active show
{
  "status": "no_active_show",
  "reason": "No active show - create a new show to start printing"
}

// Excluded user
{
  "status": "excluded",
  "reason": "User jmgov is in exclusion list"
}

// Giveaway printing disabled
{
  "status": "giveaway_disabled",
  "reason": "Giveaway printing is disabled"
}
```

**Processing Logic**:
1. **Duplicate Detection**: Check against ALL existing labels
2. **Show Validation**: Ensure active show exists
3. **Exclusion Check**: Block excluded usernames
4. **Giveaway Filter**: Respect giveaway printing setting
5. **Label Storage**: Save to show-specific JSON file
6. **Print Trigger**: Call Python printing script

#### POST `/heartbeat` - Extension Keep-Alive
**Purpose**: Receives heartbeat from Chrome extension to track activity

**Request**: `{}`
**Response**: `{"status": "ok", "timestamp": 1234567890}`

### Status & Information

#### GET `/status` - System Status
**Response**:
```json
{
  "printing": true,
  "exclusions": {"scammer": true},
  "port": 7777,
  "print_giveaways": false, 
  "always_on_top": true,
  "current_show": "my-show",
  "shows": {"my-show": "", "test": ""},
  "has_active_show": true,
  "extension_active": true,
  "last_extension_heartbeat": 1234567890
}
```

#### GET `/ping` - Health Check
**Response**: `{"status": "ok", "time": "2:57:02 PM"}`

#### GET `/recent-wins` - Recent Win History
**Response**:
```json
[
  {
    "name": "winner1",
    "item": "Coin Set", 
    "price": "$15.00",
    "type": "sale",
    "timestamp": 1234567890,
    "timeAgo": 45
  }
]
```

### Control Endpoints

#### POST `/pause` - Pause Printing
**Response**: `{"printing": false}`

#### POST `/resume` - Resume Printing  
**Response**: `{"printing": true}`

#### POST `/toggle-giveaways` - Toggle Giveaway Printing
**Response**: `{"print_giveaways": true}`

#### POST `/toggle-always-on-top` - Toggle GUI Window Behavior
**Response**: `{"always_on_top": true}`

### Show Management

#### POST `/create-show` - Create New Show
**Request**: `{"name": "my-new-show", "description": "Optional description"}`
**Response**: `{"success": true}`

#### POST `/set-active-show` - Set Active Show
**Request**: `{"show": "my-show"}`  
**Response**: `{"success": true, "current_show": "my-show"}`

#### GET `/shows` - List All Shows
**Response**: `{"shows": {"show1": "desc", "show2": ""}}`

### Exclusion Management

#### POST `/add-exclusion` - Block User
**Request**: `{"name": "username"}`
**Response**: `{"success": true}`

#### POST `/remove-exclusion` - Unblock User  
**Request**: `{"name": "username"}`
**Response**: `{"success": true}`

### Label Management

#### GET `/print-last` - Reprint Last Label
**Response**: `{"status": "printed"}`

#### POST `/reprint` - Reprint Specific Label
**Request**: `{"name": "user", "item": "item", "price": "$10"}`

#### GET `/search` - Search Labels
**Query**: `?q=searchterm&show=showname&type=sale`
**Response**: Array of matching labels

#### GET `/labels/:show` - Get Show Labels
**Response**: Array of all labels for specified show

## 🔧 Core Functions

### `loadConfig()`
```javascript
function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig = {
            printing_enabled: true,
            port: 7777,
            print_giveaways: false,
            always_on_top: false,
            current_show: null,
            shows: {},
            exclusions: {}
        };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2));
        return defaultConfig;
    }
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}
```

### `getLabels(show)`
```javascript
function getLabels(show = null) {
    const cfg = loadConfig();
    const targetShow = show || cfg.current_show;
    
    if (!targetShow) return [];
    
    const labelFile = path.join(labelsDir, `${targetShow}.json`);
    if (!fs.existsSync(labelFile)) return [];
    
    return JSON.parse(fs.readFileSync(labelFile, 'utf8'));
}
```

### `saveLabel(labelData)`
```javascript
function saveLabel(labelData) {
    const cfg = loadConfig();
    if (!cfg.current_show) return false;
    
    const labelFile = path.join(labelsDir, `${cfg.current_show}.json`);
    let labels = getLabels();
    
    labels.push({
        ...labelData,
        timestamp: Date.now(),
        show: cfg.current_show
    });
    
    fs.writeFileSync(labelFile, JSON.stringify(labels, null, 2));
    return true;
}
```

## 🛡️ Duplicate Detection Logic

### Algorithm
```javascript
// Check for ANY duplicate (no time limit)
const duplicate = existingLabels.find(label => {
    if (type === 'giveaway') {
        // Giveaways: match by exact name AND item 
        return label.type === 'giveaway' && 
               label.name === name && 
               label.item === item;
    } else {
        // Sales: match by exact name AND item AND price
        return label.type === 'sale' && 
               label.name === name && 
               label.item === item && 
               label.price === price;
    }
});
```

### Rules
- **Sales**: Must match `name + item + price` exactly
- **Giveaways**: Must match `name + item` exactly (no price comparison)
- **No Time Limit**: Checks against ALL historical labels, not just recent
- **Cross-Show**: Duplicates checked across all shows

### Examples
```javascript
// ✅ ALLOWED (different prices = different auctions)
{name: "user1", item: "Coin", price: "$5", type: "sale"}
{name: "user1", item: "Coin", price: "$8", type: "sale"}

// ❌ BLOCKED (exact duplicate)
{name: "user1", item: "Coin", price: "$5", type: "sale"}  
{name: "user1", item: "Coin", price: "$5", type: "sale"} // DUPLICATE

// ❌ BLOCKED (giveaway duplicate)
{name: "user1", item: "Prize", type: "giveaway"}
{name: "user1", item: "Prize", type: "giveaway"} // DUPLICATE
```

## 📂 Label Storage System

### File Organization
```
server/labels/
├── my-show-2024.json      # Show-specific labels
├── pokemon-auction.json   # Another show
└── default.json          # Default show labels
```

### Label Data Structure
```json
{
  "name": "winner_username",
  "item": "Auction Item Description",
  "price": "$25.00",
  "type": "sale",
  "timestamp": 1699920000000,
  "show": "my-show-2024"
}
```

### Show Management
- **Active Show**: Only one show can be active at a time
- **Label Isolation**: Each show has separate JSON file
- **Historical Access**: All shows remain accessible
- **Cross-Show Search**: Can search across multiple shows

## 🖨️ Print Integration

### Flow
1. **Event Received** → Validation → **Label Saved** → **Print Triggered**
2. **Print Call**: `printer.printLabel(labelData)`
3. **Template Formatting**: `formatLabel()` creates printable text
4. **Python Execution**: Calls `print-label.py` with formatted data

### Print Conditions
- ✅ Printing enabled (`printing_enabled: true`)
- ✅ Active show exists
- ✅ User not excluded
- ✅ Not a duplicate
- ✅ Giveaway printing enabled (if giveaway win)

## 🔄 Extension Communication

### Heartbeat System
- **Frequency**: Extension sends heartbeat every 2 seconds
- **Timeout**: Server considers extension inactive after 10 seconds
- **Status**: Tracked in `/status` endpoint as `extension_active`

### Win Event Processing
1. **Receive**: POST to `/event` endpoint
2. **Validate**: Check all business rules
3. **Store**: Save to active show's JSON file  
4. **Print**: Trigger Python script
5. **Respond**: Send status back to extension

## ⚡ Performance Considerations

### File I/O Optimization
- **Lazy Loading**: Config loaded on-demand
- **Atomic Writes**: JSON files written atomically
- **Memory Efficiency**: Labels loaded per-request, not cached

### Concurrency
- **Single-Threaded**: Node.js event loop handles multiple requests
- **File Locking**: JSON writes are atomic to prevent corruption
- **Race Conditions**: Duplicate detection uses file-based locking

### Error Handling
- **Graceful Degradation**: Server continues running even if printing fails
- **Logging**: All errors logged to console with context
- **Recovery**: Config auto-created if missing

## 🔧 Maintenance Operations

### Adding New Shows
```bash
curl -X POST http://localhost:7777/create-show \
  -H "Content-Type: application/json" \
  -d '{"name": "new-show", "description": "My New Auction"}'
```

### Bulk Exclusions
```bash
# Add multiple exclusions
curl -X POST http://localhost:7777/add-exclusion -d '{"name": "user1"}'
curl -X POST http://localhost:7777/add-exclusion -d '{"name": "user2"}'
```

### Data Migration
```bash
# Move labels between shows (manual JSON editing)
# Copy labels from old-show.json to new-show.json
# Update "show" field in each label object
```

### Backup Strategy
```bash
# Backup all show data
tar -czf labels-backup-$(date +%Y%m%d).tar.gz server/labels/
cp server/config.json config-backup-$(date +%Y%m%d).json
```

## 🚨 Troubleshooting

### Common Issues

**Port Already in Use**:
```bash
# Find process using port 7777
netstat -ano | findstr :7777
# Kill the process
taskkill /PID <process_id> /F
```

**Config Corruption**:
- Delete `config.json` - server will recreate with defaults
- Check JSON syntax with online validator

**Label File Corruption**:
- Check JSON syntax of `.json` files in `/labels/`
- Restore from backup or recreate empty array: `[]`

**Extension Not Detected**:
- Check `/heartbeat` endpoint receiving requests
- Verify extension is loaded and active on Whatnot pages
- Check Chrome console for extension errors

### Debug Endpoints
```bash
# Test server
curl http://localhost:7777/ping

# Check status  
curl http://localhost:7777/status

# Test win event
curl -X POST http://localhost:7777/event \
  -H "Content-Type: application/json" \
  -d '{"type":"sale","name":"testuser","item":"test item","price":"$10"}'
```

## 📊 Monitoring & Metrics

### Key Metrics
- **Total Labels**: Count across all shows
- **Active Show Stats**: Current show label count
- **Duplicate Rate**: Rejected vs accepted events
- **Extension Uptime**: Based on heartbeat frequency
- **Print Success Rate**: Successful vs failed prints

### Log Analysis
```bash
# Monitor server logs
tail -f server-logs.txt

# Count events by type
grep "WIN EVENT RECEIVED" server-logs.txt | wc -l

# Find duplicate rejections  
grep "DUPLICATE WIN DETECTED" server-logs.txt
```