# WhatnotAutoPrint - AI Agent Instructions

## Architecture Overview
This is a **multi-component system** that automatically detects Whatnot auction wins and prints shipping labels. It consists of:

1. **Browser Extension** (`extension/`) - Detects wins on whatnot.com/dashboard/live/* 
2. **Express Server** (`server/`) - Receives events, manages printing queue, handles label formatting
3. **Electron GUI** (`gui/` + `main.js`) - Tray app for monitoring/control with pause/resume functionality

**Data Flow**: Browser extension → HTTP POST to localhost:7777 → Server processes/prints → GUI displays status

## Key File Patterns

### Server Component (`server/`)
- `server.js` - Express app on port 7777, handles `/event` POST from extension
- `printer.js` - Contains `printLabel(data)` function that formats and "prints" (currently just echoes)
- `print-template.js` - `formatLabel(data)` returns formatted label string with name/item/branding
- `config.json` - Simple JSON: `{"printing_enabled": true, "port": 7777}`
- `labels.json` - Persistent log of all printed labels (auto-created)

### Extension Component (`extension/`)
- `content.js` - MutationObserver on Whatnot live dashboard, parses win modals for "jmgov won!" patterns
- `background.js` - Service worker that forwards WIN_EVENT messages to localhost:7777/event
- Uses `chrome.runtime.sendMessage()` → `fetch()` pattern for extension-to-server communication

### GUI Component (`gui/` + root)
- `main.js` (root) - Electron main process, creates tray with pause/resume menu items
- `gui/preload.js` - Secure IPC bridge using `contextBridge.exposeInMainWorld('electronAPI', ...)`
- `gui/renderer.js` - UI logic that polls server status via fetch to localhost:7777
- Tray pattern: Menu click → `win.webContents.send('pause')` → renderer handles via IPC

## Development Workflows

### Running the System
```powershell
# Terminal 1: Start server
npm run server
# or: cd server; node server.js

# Terminal 2: Start GUI  
npm start
# or: npx electron .

# Load extension manually in Chrome: chrome://extensions → Load unpacked → select extension/
```

### Debugging Tips
- Server logs all events to console with "PRINT:" prefix in `printer.js`
- Add `win.webContents.openDevTools()` in `createWindow()` for renderer debugging
- Extension console available in Chrome DevTools for the extension service worker

## Critical Patterns

### IPC Communication (Electron)
All tray actions use this relay pattern in `main.js`:
```javascript
{ label: 'Pause', click: () => win.webContents.send('pause') }
```
Renderer listens via exposed API in `preload.js`:
```javascript
contextBridge.exposeInMainWorld('electronAPI', {
    pause: () => ipcRenderer.send('pause')
});
```

### Win Detection (Extension)
Content script searches for modal elements with specific text patterns:
- Sale wins: `"jmgov won!"` (excludes giveaway)
- Giveaway wins: `"user won the giveaway"`
Uses `sentEvents` Set to prevent duplicate sends for same win

### Label Processing (Server)
POST to `/event` with `{type, name, item}` → stored in labels.json → formatted via `print-template.js` → printed via `printer.js`

## Project-Specific Conventions
- **No test suite** - manual testing by triggering wins on Whatnot
- **File paths**: GUI files in `gui/` subfolder, main.js loads `path.join(__dirname, 'gui', 'index.html')`
- **Port hardcoded**: All components assume localhost:7777 (server config.json can change port but other components won't follow)
- **Error handling**: Minimal - failed prints just log to console, no retry logic
- **State**: Server is stateless except for labels.json append-only log

## When Editing
- **Adding IPC channels**: Update both `preload.js` contextBridge exposure AND renderer usage
- **Changing win detection**: Modify DOM selectors in `content.js` parseWins() function
- **Label format changes**: Edit `print-template.js formatLabel()` - this is the single source for label layout
- **Print integration**: Replace `exec('echo "..."')` in `printer.js` with actual printer commands