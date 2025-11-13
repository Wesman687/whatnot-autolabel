# WhatnotAutoPrint - Clean Project Structure

## 🚀 How to Start
**Double-click:** `WhatnotAutoPrint.bat` (completely silent startup)

## 📁 Project Structure

### Core Files
- `WhatnotAutoPrint.bat` - Main launcher (silent)
- `start-invisible.vbs` - VBScript for invisible startup
- `main.js` - Electron main process
- `print-label.py` - M221 printer integration
- `package.json` - Project dependencies

### Components
- `extension/` - Chrome extension (detects wins)
- `gui/` - Electron GUI (tray app & monitoring)
- `server/` - Express server (processes wins & printing)
- `labels/` - Label storage (organized by show)

### Dependencies
- `.venv/` - Python virtual environment
- `node_modules/` - Node.js dependencies
- `.github/` - AI coding instructions

## 🔧 System Flow
Extension detects wins → Server processes → Python prints → GUI monitors

## 🎯 Production Ready
All unnecessary test files, duplicates, and experimental code removed.