# WhatnotAutoPrint System Overview

## 🎯 What This System Does

WhatnotAutoPrint is an automated label printing system that detects when you win auctions on Whatnot.com and automatically prints shipping labels to a Brother M221 label printer. It runs completely silently in the background and requires zero user intervention once set up.

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Chrome         │    │  Express        │    │  Electron       │    │  Brother M221   │
│  Extension      │───▶│  Server         │───▶│  GUI            │    │  Printer        │
│  (Detection)    │    │  (Processing)   │    │  (Monitoring)   │    │  (Output)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
                                │                       │
                                ▼                       ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  Python Script  │    │  System Tray    │
                       │  (Printing)     │    │  (Control)      │
                       └─────────────────┘    └─────────────────┘
```

## 🔄 Data Flow

1. **Win Detection**: Chrome extension monitors Whatnot pages for win notifications
2. **Event Processing**: Express server receives win data, checks for duplicates, validates against active shows
3. **Label Generation**: Server formats win data into printable label format
4. **Printing**: Python script sends formatted label to M221 printer
5. **Monitoring**: Electron GUI provides real-time status and control via system tray
6. **Storage**: All wins are logged to JSON files organized by show

## 🎛️ Control Mechanisms

- **System Tray**: Pause/resume printing, always-on-top toggle, status monitoring
- **Show Management**: Create shows, switch between shows, end shows, organize labels by event
- **Exclusions**: Block items containing specific text patterns (e.g., "Wheel Spin", "silver grams")
- **Duplicate Detection**: Server-side prevention of duplicate labels (exact match on name+item+price for sales, name+item for giveaways)
- **Throttling**: Client-side prevention of spam detection (5-second window)
- **Manual Print Buttons**: Click-to-print buttons on item cards in Whatnot dashboard (bypasses pause setting)
- **Manual Wheel Button**: 🎡 button next to print button for wheel items - manual override to send to wheel server
- **Wheel Server Integration**: Sends wheel item buys to separate server on port 3800, receives spin results for chat announcements
- **Chat Announcements**: Automatically announces wins to Whatnot chat based on configurable title patterns
- **Payment Pending Detection**: Blocks printing and announcements until payment is confirmed

## 📁 File Organization

```
WhatnotAutoPrint/
├── 🚀 WhatnotAutoPrint.bat     # Main launcher (double-click to start)
├── 🤖 AI/                      # Documentation (this folder)
├── 🔧 extension/               # Chrome extension
├── 🖥️ gui/                     # Electron GUI
├── 🌐 server/                  # Express server
├── 📄 labels/                  # Label storage (JSON files)
├── ⚙️ main.js                  # Electron main process
├── 🖨️ print-label.py          # Python printer integration
└── 👻 start-invisible.vbs     # Silent startup script
```

## 🎪 Show-Based Organization

The system organizes all wins by "shows" - individual auction events:
- Each show has its own JSON file in `/server/labels/` (e.g., `labels-wheel-11-16-25.json`)
- Shows have structured data: `name`, `labels_file`, `created`, optional `ended` and `status`
- Only one show can be "active" at a time (stored in `config.current_show`)
- Labels are only printed for the active show
- Shows can be ended (marked as ended, but data preserved)
- Historical shows remain accessible for reprinting
- Default show always exists for fallback

## 🛡️ Safety Features

- **Duplicate Detection**: Prevents same win from being printed twice (exact match required)
- **Exclusion System**: Block items containing specific text patterns (case-insensitive substring match)
- **Show Validation**: Only prints labels when a show is active
- **Throttling**: Client-side (5-second window) and server-side (1.5-second print cooldown)
- **Error Recovery**: Multiple fallback communication methods (service worker → direct server)
- **Print Cooldown**: Prevents rapid duplicate prints from same event
- **Payment Pending Protection**: Automatically blocks printing, wheel server sends, and chat announcements when payment is pending

## 🔧 Production Features

- **Silent Operation**: No visible command prompts when running
- **System Tray Control**: Minimalist interface always accessible
- **Auto-Startup**: Can be configured to start with Windows
- **Status Monitoring**: Real-time feedback on all components
- **Always-On-Top**: GUI can stay visible over other windows

## 📊 Key Metrics Tracked

- Extension activity status (heartbeat-based, every 2 seconds, 10-second timeout)
- Server online/offline status  
- Printing enabled/paused status
- Total wins per show
- Recent wins (with timestamps and time-ago calculations)
- Duplicate rejections
- Active show name and status
- Exclusion patterns count
- Giveaway printing enabled/disabled

## 🎨 User Experience

1. **Setup Once**: Configure shows, exclusions, printer settings
2. **Start Silent**: Double-click launcher, system runs invisibly  
3. **Monitor Via Tray**: Check status, pause/resume as needed
4. **Automatic Operation**: Win detection and printing happens automatically
5. **Historical Access**: Review and reprint past labels anytime

## 🔐 Security Considerations

- **Local Only**: All communication happens on localhost (port 7777)
- **No External APIs**: No data sent outside your local machine
- **Chrome Extension Isolation**: Extension only accesses Whatnot pages
- **File Permissions**: Label data stored in local project directory

## 📈 Scalability

- **Multi-Show Support**: Unlimited number of shows/events
- **Batch Operations**: Can reprint multiple labels
- **Search Functionality**: Find specific wins within current show
- **Export Capability**: Label data stored in standard JSON format
- **Manual Print Buttons**: On-demand printing from Whatnot dashboard
- **Wheel Integration**: Separate server integration for wheel items (port 3800)

## 🆕 Recent Features

- **Manual Print Buttons**: 🖨️ icons appear on item cards in Whatnot seller dashboard
  - Bypasses pause setting (always prints when clicked)
  - Extracts buyer name, item title, and price automatically
  - Works for both sales and giveaways
  - Shows ⏸️ icon when payment is pending (disabled)

- **Manual Wheel Button**: 🎡 button appears next to print button for wheel items
  - Manual override if extension doesn't detect win
  - Bypasses payment pending checks (always sends)
  - Sends directly to wheel server (`/buy-notification`)
  - Visual feedback: ⏳ → ✅/❌ → 🎡
  
- **Wheel Server Integration**: 
  - Sends wheel item buys to separate server on `localhost:3800`
  - Endpoint: `POST /buy-notification`
  - Payload: `{ buyer, amount, message }`
  - Receives spin results from wheel server via `POST /wheel-win` on main server
  - Automatically announces wheel wins to chat

- **Chat Announcements**:
  - GUI checkbox to enable/disable announcements
  - Title pattern matching (comma-separated patterns)
  - Automatic chat posting when items match patterns
  - Message format: `🎡 {buyer} won {title} for {price}!`
  - Polls for wheel server announcements every 2 seconds

- **Payment Pending Detection**:
  - Automatically detects "Payment Pending" status on items
  - Blocks auto-printing when payment is pending
  - Blocks wheel server sends when payment is pending
  - Blocks chat announcements when payment is pending
  - Manual print buttons show pause icon (⏸️) when payment pending
  - Only processes wins when status shows "Sold for" (paid)

- **Enhanced Show Management**: 
  - Create shows with custom names
  - Switch between shows
  - End shows (preserves data, marks as ended)
  - Delete shows (removes data permanently)
  - Auto-prompt to create show if none active

- **Item Pattern Exclusions**: Exclusion system now matches item descriptions (not just usernames)
  - Comma-separated patterns
  - Case-insensitive substring matching
  - Example: "Wheel Spin, silver grams, mercury"

This system is designed for sellers who run multiple Whatnot auctions and need automated, reliable label printing for shipping management.