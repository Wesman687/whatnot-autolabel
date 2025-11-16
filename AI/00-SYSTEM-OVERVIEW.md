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
- **Show Management**: Create shows, set active show, organize labels by event
- **Exclusions**: Block specific users from printing (scammers, problem buyers)
- **Duplicate Detection**: Server-side prevention of duplicate labels
- **Throttling**: Client-side prevention of spam detection

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
- Each show has its own JSON file in `/labels/`
- Only one show can be "active" at a time
- Labels are only printed for the active show
- Historical shows remain accessible for reprinting

## 🛡️ Safety Features

- **Duplicate Detection**: Prevents same win from being printed twice
- **Exclusion System**: Block problematic users from printing
- **Show Validation**: Only prints labels when a show is active
- **Throttling**: Prevents extension from spamming the server
- **Error Recovery**: Multiple fallback communication methods

## 🔧 Production Features

- **Silent Operation**: No visible command prompts when running
- **System Tray Control**: Minimalist interface always accessible
- **Auto-Startup**: Can be configured to start with Windows
- **Status Monitoring**: Real-time feedback on all components
- **Always-On-Top**: GUI can stay visible over other windows

## 📊 Key Metrics Tracked

- Extension activity status (heartbeat-based)
- Server online/offline status  
- Printing enabled/paused status
- Total wins per show
- Recent wins (with timestamps)
- Duplicate rejections
- Error counts and types

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
- **Search Functionality**: Find specific wins across all shows
- **Export Capability**: Label data stored in standard JSON format

This system is designed for sellers who run multiple Whatnot auctions and need automated, reliable label printing for shipping management.