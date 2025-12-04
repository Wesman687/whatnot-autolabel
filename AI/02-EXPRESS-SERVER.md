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
  "print_giveaways": true,
  "always_on_top": true,
  "current_show": "wheel-11-16-25",
  "exclusions": [
    "Wheel Spin"
  ],
  "announce_to_chat": false,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true,
  "shows": {
    "default": {
      "name": "Default Show",
      "labels_file": "labels.json",
      "created": "2024-01-01"
    },
    "wheel-11-16-25": {
      "name": "Wheel 11-16-25",
      "labels_file": "labels-wheel-11-16-25.json",
      "created": "2025-11-16T20:37:36.861Z"
    },
    "test": {
      "name": "Test",
      "labels_file": "labels-test.json",
      "created": "2025-11-13T14:41:24.329Z",
      "ended": "2025-11-13T16:52:42.498Z",
      "status": "ended"
    }
  }
}
```

### Configuration Fields
- `printing_enabled`: Master switch for all printing
- `port`: Server port (usually 7777)
- `print_giveaways`: Whether to print giveaway wins
- `always_on_top`: GUI window behavior
- `current_show`: Active show ID (only this show prints labels)
- `shows`: Dictionary of all shows (showId -> show object)
  - `name`: Display name of the show
  - `labels_file`: JSON filename in `/server/labels/` directory
  - `created`: ISO timestamp when show was created
  - `ended`: Optional ISO timestamp when show ended
  - `status`: Optional status ("ended" when show is closed)
- `exclusions`: Array of item text patterns to exclude (case-insensitive substring match)
- `announce_to_chat`: Boolean - Enable/disable chat announcements globally
- `chat_announce_patterns`: Array of title patterns to match for chat announcements (case-insensitive)
- `announce_wheel_spins`: Boolean - Enable/disable sending wheel buys to wheel server (defaults to true)

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
1. **Duplicate Detection**: Check against ALL existing labels in current show
   - Sales: Exact match on `name + item + price`
   - Giveaways: Exact match on `name + item` (no price comparison)
2. **Show Validation**: Ensure active show exists
3. **Exclusion Check**: Block items containing excluded text patterns (case-insensitive)
4. **Giveaway Filter**: Respect giveaway printing setting
5. **Label Storage**: Save to show-specific JSON file in `/server/labels/`
6. **Print Trigger**: Call Python printing script (with 1.5-second cooldown)

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
  "last_extension_heartbeat": 1234567890,
  "announce_to_chat": false,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true,
  "pending_wheel_announcements": []
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
**Request**: 
```json
{
  "name": "My New Show"
}
```

**Response**: 
```json
{
  "status": "show created",
  "showId": "my-new-show",
  "show": {
    "name": "My New Show",
    "labels_file": "labels-my-new-show.json",
    "created": "2025-11-16T20:37:36.861Z"
  }
}
```

**Behavior**:
- Creates show ID from name (lowercase, special chars replaced with hyphens)
- Creates empty labels file in `/server/labels/` directory
- Does NOT automatically set as active (must call `/switch-show`)

#### POST `/switch-show` - Switch Active Show
**Request**: 
```json
{
  "showId": "my-show-id"
}
```

**Response**: 
```json
{
  "status": "show switched",
  "current_show": "my-show-id"
}
```

**Error Response**:
```json
{
  "error": "Show not found"
}
```

#### POST `/end-show` - End Current Show
**Request**: No body required

**Response**: 
```json
{
  "status": "show ended",
  "showId": "ended-show-id"
}
```

**Behavior**:
- Marks show with `ended` timestamp and `status: "ended"`
- Sets `current_show` to `null`
- Preserves all label data (can still reprint)
- Cannot end default show

#### POST `/delete-show` - Delete Show
**Request**: 
```json
{
  "showId": "show-to-delete"
}
```

**Response**: 
```json
{
  "status": "show deleted",
  "showId": "deleted-show-id"
}
```

**Behavior**:
- Permanently deletes show from config
- Deletes labels file from `/server/labels/` directory
- Cannot delete default show
- If deleted show was active, sets `current_show` to `null`

#### GET `/shows` - List All Shows
**Response**: 
```json
{
  "shows": {
    "show1": {
      "name": "Show 1",
      "labels_file": "labels-show1.json",
      "created": "2025-11-16T20:37:36.861Z"
    }
  }
}
```

### Exclusion Management

#### GET `/exclusions` - Get Current Exclusions
**Response**: 
```json
{
  "exclusions": ["Wheel Spin", "silver grams"]
}
```

#### POST `/exclusions` - Update Exclusions
**Request**: 
```json
{
  "exclusions": ["Wheel Spin", "silver grams", "mercury"]
}
```

**Response**: 
```json
{
  "status": "exclusions saved",
  "exclusions": ["Wheel Spin", "silver grams", "mercury"]
}
```

**Behavior**:
- Replaces entire exclusion list (not additive)
- Exclusions are item text patterns (not usernames)
- Case-insensitive substring matching
- Comma-separated in GUI, array in API

### Chat Announcement Management

#### GET `/chat-announce-settings`
**Purpose**: Get current chat announcement configuration

**Response**:
```json
{
  "announce_to_chat": false,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true
}
```

#### POST `/chat-announce-settings`
**Purpose**: Update chat announcement configuration

**Request**:
```json
{
  "announce_to_chat": true,
  "chat_announce_patterns": ["wheel", "wheel spin", "giveaway"],
  "announce_wheel_spins": true
}
```

**Response**:
```json
{
  "status": "chat settings saved",
  "announce_to_chat": true,
  "chat_announce_patterns": ["wheel", "wheel spin", "giveaway"],
  "announce_wheel_spins": true
}
```

**Behavior**:
- Updates `config.announce_to_chat` (master enable/disable)
- Updates `config.chat_announce_patterns` (array of title patterns)
- Updates `config.announce_wheel_spins` (enable/disable wheel server sends)
- Extension checks these settings before announcing to chat

### Wheel Server Integration

#### POST `/wheel-win`
**Purpose**: Receive wheel spin results from wheel server for chat announcements

**Request**:
```json
{
  "title": "Silver Canadian Dime",
  "buyer": "CoolUser123",
  "price": "$15.50"
}
```

**Response**:
```json
{
  "status": "wheel win received",
  "announcement": {
    "title": "Silver Canadian Dime",
    "buyer": "CoolUser123",
    "price": "$15.50",
    "timestamp": 1699920000000
  }
}
```

**Behavior**:
- Stores announcement in in-memory queue (`pendingWheelAnnouncements`)
- Extension polls every 2 seconds via `/status` endpoint
- Extension announces to chat when found
- Queue limited to last 100 announcements (prevents memory leak)
- Called by wheel server after processing a spin

#### GET `/pending-wheel-announcements`
**Purpose**: Get pending wheel announcements (primarily for debugging)

**Response**:
```json
{
  "announcements": [
    {
      "title": "Silver Canadian Dime",
      "buyer": "CoolUser123",
      "price": "$15.50",
      "timestamp": 1699920000000
    }
  ]
}
```

**Note**: Extension gets announcements via `/status` endpoint which includes `pending_wheel_announcements` field.

#### POST `/clear-wheel-announcements`
**Purpose**: Clear processed wheel announcements from queue

**Request**:
```json
{
  "count": 1
}
```

**Response**:
```json
{
  "status": "announcements cleared",
  "remaining": 0
}
```

**Behavior**:
- Removes oldest N announcements (where N = count)
- If count not provided, clears all announcements
- Called by extension after processing announcements

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
// Check for ANY duplicate in current show (no time limit)
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
- **No Time Limit**: Checks against ALL labels in current show, not just recent
- **Show-Scoped**: Duplicates only checked within current show (not across shows)

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
├── labels.json                          # Default show labels
├── labels-wheel-11-16-25.json          # Show-specific labels
├── labels-11-14-2025-silver-auction.json
└── labels-test.json
```

### Label Data Structure
```json
{
  "timestamp": 1699920000000,
  "type": "sale",
  "name": "winner_username",
  "item": "Auction Item Description",
  "price": "$25.00"
}
```

**Note**: Label objects do NOT include `show` field - show is determined by which file they're stored in.

### Show Management
- **Active Show**: Only one show can be active at a time (stored in `config.current_show`)
- **Label Isolation**: Each show has separate JSON file (filename stored in show object)
- **Historical Access**: All shows remain accessible (even ended shows)
- **Show-Scoped Search**: Search only searches current show's labels
- **Show Lifecycle**: Shows can be created → active → ended → deleted

## 🖨️ Print Integration

### Flow
1. **Event Received** → Validation → **Label Saved** → **Print Triggered**
2. **Print Call**: `printer.printLabel(labelData)`
3. **Python Execution**: Calls `print-label.py` with command-line arguments
   - Uses virtual environment Python: `.venv/Scripts/python.exe`
   - Arguments: `buyer item [price]`

### Print Conditions
- ✅ Printing enabled (`printing_enabled: true`) OR manual print request
- ✅ Active show exists
- ✅ Item not excluded (pattern matching)
- ✅ Not a duplicate
- ✅ Giveaway printing enabled (if giveaway win)

### Print Cooldown
- **1.5-second cooldown** between prints to prevent rapid duplicate prints
- Implemented in `printer.js` using `lastPrintTime` tracking
- Manual prints also respect cooldown

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