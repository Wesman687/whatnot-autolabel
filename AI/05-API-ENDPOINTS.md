# API Endpoints Reference

## 🌐 Base URL: `http://localhost:7777`

## 📋 Complete Endpoint Documentation

### 🏥 Health & Status Endpoints

#### `GET /ping`
**Purpose**: Health check endpoint to verify server is running

**Request**: No parameters
**Response**:
```json
{
  "status": "ok",
  "time": "2:57:02 PM"
}
```

**Status Codes**:
- `200 OK`: Server is healthy
- Connection refused: Server is down

**Example**:
```bash
curl http://localhost:7777/ping
```

---

#### `GET /status`
**Purpose**: Comprehensive system status including all component states

**Request**: No parameters
**Response**:
```json
{
  "printing": true,
  "exclusions": {
    "scammer123": true,
    "problemuser": true
  },
  "port": 7777,
  "print_giveaways": false,
  "always_on_top": true,
  "current_show": "my-auction-2024",
  "shows": {
    "my-auction-2024": "Pokemon cards auction",
    "coins-show": "Rare coins event",
    "default": ""
  },
  "has_active_show": true,
  "extension_active": true,
  "last_extension_heartbeat": 1699920000000,
  "announce_to_chat": false,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true,
  "pending_wheel_announcements": []
}
```

**Field Descriptions**:
- `printing`: Master printing enabled/disabled
- `exclusions`: Dictionary of blocked usernames
- `port`: Server port number
- `print_giveaways`: Whether giveaway wins trigger printing
- `always_on_top`: GUI window behavior setting
- `current_show`: Active show name (only this show prints labels)
- `shows`: All available shows with descriptions
- `has_active_show`: Boolean indicating if printing is possible
- `extension_active`: Chrome extension heartbeat status
- `last_extension_heartbeat`: Timestamp of last extension ping

**Example**:
```bash
curl http://localhost:7777/status
```

---

### 🎯 Core Win Processing

#### `POST /event`
**Purpose**: Main endpoint for processing win events from Chrome extension

**Request Body**:
```json
{
  "type": "sale|giveaway",
  "name": "winner_username",
  "item": "Auction Item Description",
  "price": "$25.00"
}
```

**Field Requirements**:
- `type`: Must be "sale" or "giveaway"
- `name`: Winner's username (any string)
- `item`: Item description (any string)
- `price`: Price string (optional, "$0.00" format preferred)

**Success Response**:
```json
{
  "status": "printed",
  "message": "Label printed successfully"
}
```

**Error Responses**:

*Duplicate Win*:
```json
{
  "status": "duplicate",
  "reason": "Exact duplicate already exists"
}
```

*No Active Show*:
```json
{
  "status": "no_active_show",
  "reason": "No active show - create a new show to start printing"
}
```

*User Excluded*:
```json
{
  "status": "excluded", 
  "reason": "User scammer123 is in exclusion list"
}
```

*Giveaway Disabled*:
```json
{
  "status": "giveaway_disabled",
  "reason": "Giveaway printing is disabled"
}
```

*Printing Paused*:
```json
{
  "status": "paused",
  "reason": "Printing is currently paused"
}
```

**Processing Logic**:
1. Parse and validate JSON request
2. Check for exact duplicates against ALL historical labels
3. Verify active show exists
4. Check if user is in exclusion list
5. Validate giveaway printing setting
6. Save label to show-specific JSON file
7. Trigger Python printing script
8. Return appropriate response

**Example**:
```bash
curl -X POST http://localhost:7777/event \
  -H "Content-Type: application/json" \
  -d '{"type":"sale","name":"winner123","item":"Rare Coin","price":"$15.00"}'
```

---

#### `POST /heartbeat`
**Purpose**: Extension keep-alive signal to track Chrome extension activity

**Request Body**:
```json
{
  "timestamp": 1699920000000
}
```

**Response**:
```json
{
  "status": "ok",
  "timestamp": 1699920000000
}
```

**Usage**: 
- Chrome extension sends every 2 seconds
- Server considers extension inactive after 10 seconds without heartbeat
- Used by GUI to display "Extension: ACTIVE" vs "Extension: NO ACTIVITY"

**Example**:
```bash
curl -X POST http://localhost:7777/heartbeat \
  -H "Content-Type: application/json" \
  -d '{"timestamp": 1699920000000}'
```

---

### 🎛️ Control Endpoints

#### `POST /pause`
**Purpose**: Pause all label printing (wins still logged but not printed)

**Request**: No body required
**Response**:
```json
{
  "printing": false
}
```

**Effect**: 
- Sets `config.printing_enabled = false`
- New wins will be logged but not printed
- Existing wins can still be reprinted manually

**Example**:
```bash
curl -X POST http://localhost:7777/pause
```

---

#### `POST /resume`
**Purpose**: Resume label printing

**Request**: No body required
**Response**:
```json
{
  "printing": true
}
```

**Effect**:
- Sets `config.printing_enabled = true` 
- New wins will be printed normally

**Example**:
```bash
curl -X POST http://localhost:7777/resume
```

---

#### `POST /toggle-giveaways`
**Purpose**: Toggle whether giveaway wins trigger label printing

**Request**: No body required
**Response**:
```json
{
  "print_giveaways": true
}
```

**Behavior**:
- Toggles current setting
- When disabled, giveaway wins are logged but not printed
- Sale wins are always printed (when printing enabled)

**Example**:
```bash
curl -X POST http://localhost:7777/toggle-giveaways
```

---

#### `POST /toggle-always-on-top`
**Purpose**: Toggle GUI window always-on-top behavior

**Request**: No body required
**Response**:
```json
{
  "always_on_top": true
}
```

**Effect**:
- Toggles window behavior setting in config
- GUI reads this setting and adjusts window accordingly

**Example**:
```bash
curl -X POST http://localhost:7777/toggle-always-on-top
```

---

### 🎪 Show Management

#### `POST /create-show`
**Purpose**: Create a new show/auction event

**Request Body**:
```json
{
  "name": "my-new-show",
  "description": "Optional description of the show"
}
```

**Response**:
```json
{
  "success": true
}
```

**Error Response**:
```json
{
  "error": "Show name already exists"
}
```

**Effect**:
- Creates new show in config.shows
- Creates empty JSON file in `/server/labels/` directory
- Show is created but not automatically set as active

**Validation**:
- Show name must be unique
- Name must be valid filename (no special characters)
- Description is optional

**Example**:
```bash
curl -X POST http://localhost:7777/create-show \
  -H "Content-Type: application/json" \
  -d '{"name": "pokemon-auction-2024", "description": "Monthly Pokemon card auction"}'
```

---

#### `POST /set-active-show`
**Purpose**: Set which show is currently active (only active show prints labels)

**Request Body**:
```json
{
  "show": "my-show-name"
}
```

**Response**:
```json
{
  "success": true,
  "current_show": "my-show-name"
}
```

**Error Response**:
```json
{
  "error": "Show 'invalid-show' not found"
}
```

**Effect**:
- Updates `config.current_show`
- Only the active show will have new labels printed
- Existing labels from other shows remain accessible

**Example**:
```bash
curl -X POST http://localhost:7777/set-active-show \
  -H "Content-Type: application/json" \
  -d '{"show": "pokemon-auction-2024"}'
```

---

#### `GET /shows`
**Purpose**: List all available shows

**Request**: No parameters
**Response**:
```json
{
  "shows": {
    "pokemon-auction-2024": "Monthly Pokemon card auction",
    "coins-show": "Rare coins event", 
    "default": ""
  }
}
```

**Example**:
```bash
curl http://localhost:7777/shows
```

---

### 🚫 Exclusion Management

#### `POST /add-exclusion`
**Purpose**: Block a user from having labels printed

**Request Body**:
```json
{
  "name": "username_to_block"
}
```

**Response**:
```json
{
  "success": true
}
```

**Effect**:
- Adds username to `config.exclusions`
- Future wins from this user will be logged but not printed
- Returns "excluded" status in win event responses

**Use Cases**:
- Block known scammers
- Block users who don't pay
- Block test accounts

**Example**:
```bash
curl -X POST http://localhost:7777/add-exclusion \
  -H "Content-Type: application/json" \
  -d '{"name": "scammer123"}'
```

---

#### `POST /remove-exclusion`
**Purpose**: Unblock a previously excluded user

**Request Body**:
```json
{
  "name": "username_to_unblock"
}
```

**Response**:
```json
{
  "success": true
}
```

**Effect**:
- Removes username from `config.exclusions`
- User can now have labels printed normally

**Example**:
```bash
curl -X POST http://localhost:7777/remove-exclusion \
  -H "Content-Type: application/json" \
  -d '{"name": "former_scammer"}'
```

---

### 💬 Chat Announcement Settings

#### `GET /chat-announce-settings`
**Purpose**: Get current chat announcement configuration

**Request**: No parameters

**Response**:
```json
{
  "announce_to_chat": false,
  "chat_announce_patterns": ["wheel", "wheel spin", "giveaway"],
  "announce_wheel_spins": true
}
```

**Field Descriptions**:
- `announce_to_chat`: Master enable/disable for chat announcements
- `chat_announce_patterns`: Array of title patterns to match (case-insensitive)
- `announce_wheel_spins`: Enable/disable sending wheel buys to wheel server

**Example**:
```bash
curl http://localhost:7777/chat-announce-settings
```

---

#### `POST /chat-announce-settings`
**Purpose**: Update chat announcement configuration

**Request Body**:
```json
{
  "announce_to_chat": true,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true
}
```

**Response**:
```json
{
  "status": "chat settings saved",
  "announce_to_chat": true,
  "chat_announce_patterns": ["wheel", "wheel spin"],
  "announce_wheel_spins": true
}
```

**Effect**:
- Updates `config.announce_to_chat`
- Updates `config.chat_announce_patterns` (array of strings)
- Updates `config.announce_wheel_spins`
- Extension checks these settings before announcing to chat

**Example**:
```bash
curl -X POST http://localhost:7777/chat-announce-settings \
  -H "Content-Type: application/json" \
  -d '{"announce_to_chat": true, "chat_announce_patterns": ["wheel"], "announce_wheel_spins": true}'
```

---

### 🎡 Wheel Server Integration

#### `POST /wheel-win`
**Purpose**: Receive wheel spin results from wheel server for chat announcements

**Request Body**:
```json
{
  "title": "Silver Canadian Dime",
  "buyer": "CoolUser123",
  "price": "$15.50"
}
```

**Field Requirements**:
- `title`: Required - The wheel item title
- `buyer`: Required - The buyer/winner username
- `price`: Optional - The price (can be empty string)

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

**Effect**:
- Stores announcement in in-memory queue
- Extension polls every 2 seconds via `/status` endpoint
- Extension announces to chat when found
- Queue limited to last 100 announcements (prevents memory leak)

**Example**:
```bash
curl -X POST http://localhost:7777/wheel-win \
  -H "Content-Type: application/json" \
  -d '{"title": "Silver Canadian Dime", "buyer": "CoolUser123", "price": "$15.50"}'
```

---

#### `GET /pending-wheel-announcements`
**Purpose**: Get pending wheel announcements (used by extension polling)

**Request**: No parameters

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

**Note**: This endpoint is primarily used internally. The extension gets announcements via `/status` endpoint which includes `pending_wheel_announcements` field.

---

#### `POST /clear-wheel-announcements`
**Purpose**: Clear processed wheel announcements from queue

**Request Body**:
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

**Effect**:
- Removes oldest N announcements from queue (where N = count)
- If count not provided, clears all announcements
- Called by extension after processing announcements

**Example**:
```bash
curl -X POST http://localhost:7777/clear-wheel-announcements \
  -H "Content-Type: application/json" \
  -d '{"count": 1}'
```

---

### 📄 Label Management

#### `GET /recent-wins`
**Purpose**: Get recent wins across all shows with time information

**Request**: No parameters
**Response**:
```json
[
  {
    "name": "winner1",
    "item": "Rare Pokemon Card",
    "price": "$25.00",
    "type": "sale",
    "timestamp": 1699920000000,
    "timeAgo": 45,
    "show": "pokemon-auction-2024"
  },
  {
    "name": "winner2", 
    "item": "Giveaway Prize",
    "price": null,
    "type": "giveaway",
    "timestamp": 1699919800000,
    "timeAgo": 245,
    "show": "pokemon-auction-2024"
  }
]
```

**Field Descriptions**:
- `timeAgo`: Seconds since the win occurred
- `timestamp`: Unix timestamp of win
- All other fields from original win data

**Sorting**: Most recent wins first
**Limit**: No limit, but typically shows last 50-100 wins

**Example**:
```bash
curl http://localhost:7777/recent-wins
```

---

#### `GET /labels/:show`
**Purpose**: Get all labels for a specific show

**Request**: 
- `:show` - Show name in URL path

**Response**:
```json
[
  {
    "name": "winner1",
    "item": "Pokemon Card #1",
    "price": "$15.00",
    "type": "sale",
    "timestamp": 1699920000000,
    "show": "pokemon-auction-2024"
  }
]
```

**Example**:
```bash
curl http://localhost:7777/labels/pokemon-auction-2024
```

---

#### `GET /search`
**Purpose**: Search labels across shows with filters

**Query Parameters**:
- `q` - Search term (searches name and item fields)
- `show` - Specific show name to search within
- `type` - Filter by "sale" or "giveaway"
- `limit` - Maximum results to return (default: 50)

**Response**:
```json
[
  {
    "name": "winner1",
    "item": "Pokemon Card containing search term",
    "price": "$20.00", 
    "type": "sale",
    "timestamp": 1699920000000,
    "show": "pokemon-auction-2024"
  }
]
```

**Search Logic**:
- Case-insensitive text search
- Searches both name and item fields
- Can combine with other filters

**Examples**:
```bash
# Search for "pokemon" across all shows
curl http://localhost:7777/search?q=pokemon

# Search within specific show
curl http://localhost:7777/search?q=card&show=pokemon-auction-2024

# Search only sales
curl http://localhost:7777/search?q=rare&type=sale

# Limit results
curl http://localhost:7777/search?q=winner&limit=10
```

---

### 🖨️ Printing Endpoints

#### `GET /print-last`
**Purpose**: Reprint the most recent label

**Request**: No parameters
**Response**:
```json
{
  "status": "printed"
}
```

**Error Response**:
```json
{
  "error": "none"
}
```

**Behavior**:
- Finds most recent label across all shows
- Sends to printer regardless of current printing status
- Useful for reprinting if label didn't print properly

**Example**:
```bash
curl http://localhost:7777/print-last
```

---

#### `POST /manual-print`
**Purpose**: Print label on-demand from extension print buttons (bypasses pause setting)

**Request Body**:
```json
{
  "type": "sale|giveaway",
  "name": "buyer_username",
  "item": "Item Description",
  "price": "$25.00"
}
```

**Response**:
```json
{
  "status": "manual_print_sent"
}
```

**Error Response**:
```json
{
  "status": "no_active_show",
  "reason": "No active show - create a new show first"
}
```

**Behavior**:
- Always prints regardless of `printing_enabled` setting
- Still requires active show
- Still respects exclusions and giveaway settings
- Saves label to current show's JSON file
- Respects print cooldown (1.5 seconds)

**Example**:
```bash
curl -X POST http://localhost:7777/manual-print \
  -H "Content-Type: application/json" \
  -d '{"type": "sale", "name": "buyer123", "item": "Rare Coin", "price": "$15.00"}'
```

---

#### `POST /reprint`
**Purpose**: Reprint a specific label by identifying details

**Request Body**:
```json
{
  "name": "winner_username",
  "item": "Item description", 
  "price": "$25.00"
}
```

**Response**:
```json
{
  "status": "reprint sent"
}
```

**Matching Logic**:
- Uses provided name, item, and price to create label
- Does not search for existing label
- Always prints (bypasses pause, but requires active show)

**Example**:
```bash
curl -X POST http://localhost:7777/reprint \
  -H "Content-Type: application/json" \
  -d '{"name": "winner123", "item": "Rare Coin", "price": "$15.00"}'
```

---

## 🔧 Error Handling

### Standard Error Response Format
```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": 1699920000000
}
```

### Common HTTP Status Codes
- `200 OK`: Successful request
- `400 Bad Request`: Invalid JSON or missing required fields
- `404 Not Found`: Endpoint doesn't exist
- `500 Internal Server Error`: Server-side error (file system, printer, etc.)

### Error Categories

#### Validation Errors
- Missing required fields in request body
- Invalid JSON format
- Invalid enum values (type must be "sale" or "giveaway")

#### Business Logic Errors  
- Duplicate win detection
- User in exclusion list
- No active show configured
- Printing disabled/paused

#### System Errors
- File system errors (can't write label files)
- Printer communication failures
- Configuration file corruption

## 📊 Response Time Expectations

### Fast Endpoints (< 50ms)
- `/ping` - Health check
- `/status` - Status information
- `/pause`, `/resume` - Simple config updates

### Medium Endpoints (50-200ms)
- `/event` - Win processing (includes duplicate check + file I/O)
- `/recent-wins` - File reading and processing
- `/search` - Text search across label files

### Slow Endpoints (200ms+)
- `/print-last`, `/reprint` - Includes printer communication
- `/create-show` - File system operations

## 🔄 Rate Limiting

### Current Limits
- **No enforced rate limits** - server handles requests as fast as possible
- **Extension throttling** - Chrome extension limits to 1 scan per second
- **Heartbeat frequency** - 2 seconds between heartbeats

### Recommended Usage
- **Win events**: As needed (typically 1-10 per minute during active auctions)
- **Status checks**: Every 5 seconds maximum
- **Heartbeats**: Every 2 seconds (handled automatically by extension)

## 🛡️ Security Considerations

### Local-Only Access
- Server only binds to `localhost` (127.0.0.1)
- No external network access required or allowed
- All communication stays on local machine

### Input Validation
- JSON parsing with error handling
- String length limits on text fields
- Username validation for exclusions

### File System Security
- All file operations within project directory
- No arbitrary file path access
- Atomic file writes prevent corruption

## 📈 Usage Examples

### Complete Workflow Example
```bash
# 1. Check server health
curl http://localhost:7777/ping

# 2. Create new show
curl -X POST http://localhost:7777/create-show \
  -H "Content-Type: application/json" \
  -d '{"name": "new-auction", "description": "My auction"}'

# 3. Set active show  
curl -X POST http://localhost:7777/set-active-show \
  -H "Content-Type: application/json" \
  -d '{"show": "new-auction"}'

# 4. Add exclusion
curl -X POST http://localhost:7777/add-exclusion \
  -H "Content-Type: application/json" \
  -d '{"name": "baduser"}'

# 5. Send win event
curl -X POST http://localhost:7777/event \
  -H "Content-Type: application/json" \
  -d '{"type": "sale", "name": "winner1", "item": "Cool Item", "price": "$20"}'

# 6. Check recent wins
curl http://localhost:7777/recent-wins

# 7. Reprint if needed
curl -X POST http://localhost:7777/reprint \
  -H "Content-Type: application/json" \
  -d '{"name": "winner1", "item": "Cool Item", "price": "$20"}'
```

### Monitoring Script Example
```bash
#!/bin/bash
# Simple monitoring script

while true; do
    echo "=== $(date) ==="
    
    # Check server health
    if curl -s http://localhost:7777/ping > /dev/null; then
        echo "✅ Server: Online"
        
        # Get status
        STATUS=$(curl -s http://localhost:7777/status)
        PRINTING=$(echo $STATUS | jq -r '.printing')
        EXTENSION=$(echo $STATUS | jq -r '.extension_active')
        
        echo "🖨️  Printing: $PRINTING"
        echo "🔌 Extension: $EXTENSION"
        
    else
        echo "❌ Server: Offline"
    fi
    
    sleep 30
done
```