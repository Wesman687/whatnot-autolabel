# Electron GUI Documentation

## 📁 Location: `/gui/` + `/main.js`

## 🎯 Purpose
Provides a system tray application for monitoring server status, controlling printing operations, managing shows, and accessing label history. Designed to be always-accessible but non-intrusive.

## 📋 Files Structure
```
gui/
├── index.html          # Main GUI layout
├── renderer.js         # UI logic and server communication
├── preload.js          # Secure IPC bridge
├── styles.css          # GUI styling
└── main.js             # Electron main process (in root directory)
```

## 🚀 Startup
The GUI is launched via `main.js` in the root directory:
```bash
npm start
# or
npx electron .
```

## 🖥️ main.js - Electron Main Process

### Purpose
Creates and manages the Electron application window, system tray, and handles IPC communication between renderer and main processes.

### Key Functions

#### `createWindow()`
```javascript
function createWindow() {
    const win = new BrowserWindow({
        width: 520,
        height: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'gui', 'preload.js')
        },
        autoHideMenuBar: true,
        resizable: true,
        alwaysOnTop: false
    });
    
    win.loadFile(path.join(__dirname, 'gui', 'index.html'));
    return win;
}
```

**Window Properties**:
- **Size**: 520x700 pixels (optimized for label management)
- **Security**: Context isolation + preload script for secure IPC
- **Menu**: Hidden by default for cleaner interface
- **Resizable**: Users can adjust size as needed
- **Always-on-top**: Configurable via tray menu

#### `createTray()`
```javascript
function createTray() {
    const iconPath = path.join(__dirname, 'gui', 'icon.ico');
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show/Hide Window', click: () => toggleWindow() },
        { type: 'separator' },
        { label: 'Pause Printing', click: () => win.webContents.send('pause') },
        { label: 'Resume Printing', click: () => win.webContents.send('resume') },
        { type: 'separator' },
        { 
            label: 'Always On Top', 
            type: 'checkbox',
            checked: false,
            click: () => toggleAlwaysOnTop()
        },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() }
    ]);
    
    tray.setContextMenu(contextMenu);
    tray.setToolTip('WhatnotAutoPrint - Label System');
}
```

**Tray Features**:
- **Show/Hide**: Toggle window visibility
- **Print Control**: Pause/resume operations via IPC
- **Always On Top**: Keep window above other applications  
- **Status Display**: Visual feedback in tooltip
- **Quick Exit**: Graceful shutdown

#### IPC Communication Handlers
```javascript
// Tray menu actions trigger IPC messages to renderer
ipcMain.on('pause', () => {
    // Renderer handles the actual pause logic
});

ipcMain.on('resume', () => {
    // Renderer handles the actual resume logic  
});

ipcMain.handle('toggle-always-on-top', () => {
    const isAlwaysOnTop = !win.isAlwaysOnTop();
    win.setAlwaysOnTop(isAlwaysOnTop);
    return isAlwaysOnTop;
});
```

### App Lifecycle
```javascript
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

## 🔐 preload.js - Security Bridge

### Purpose
Provides secure communication channel between renderer process and main process, exposing only necessary APIs.

### Exposed API
```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Tray control
    pause: () => ipcRenderer.send('pause'),
    resume: () => ipcRenderer.send('resume'),
    
    // Window management
    setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
    
    // Event listeners
    onPause: (callback) => ipcRenderer.on('pause', callback),
    onResume: (callback) => ipcRenderer.on('resume', callback),
    onAlwaysTopUpdated: (callback) => ipcRenderer.on('always-top-updated', callback)
});
```

### Security Benefits
- **Context Isolation**: Renderer cannot access Node.js APIs directly
- **Controlled Exposure**: Only specific functions available to renderer
- **IPC Filtering**: All communication goes through defined channels

## 🎨 renderer.js - Main UI Logic

### Purpose
Handles all user interface interactions, server communication, and real-time status updates.

### Core Variables
```javascript
const logWindow = document.getElementById('logWindow');
const results = document.getElementById('results');

let lastServerStatus = null;
let lastExtensionStatus = null;
let lastPrintingStatus = null;
let isAlwaysOnTop = false;
```

### Key Functions

#### `updateStatusIndicator(elementId, status, isOnline)`
```javascript
function updateStatusIndicator(elementId, status, isOnline) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = status;
        element.style.background = isOnline ? '#2E7D32' : '#C62828'; // Green/Red
        element.style.color = 'white';
    }
}
```
**Visual Status System**:
- **Green**: Online/Active/Enabled
- **Red**: Offline/Inactive/Disabled/Error
- **Text**: Descriptive status message

#### `checkServerStatus()`
```javascript
function checkServerStatus() {
    fetch('http://localhost:7777/ping')
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(data => {
        const status = 'Server: ONLINE';
        if (status !== lastServerStatus) {
            log('Server: ONLINE');
            lastServerStatus = status;
        }
        updateStatusIndicator('serverStatus', status, true);
        
        return fetch('http://localhost:7777/status');
    })
    .then(r => r.json())
    .then(statusData => {
        // Update printing status
        const printingStatus = `Printing: ${statusData.printing ? 'ENABLED' : 'PAUSED'}`;
        updateStatusIndicator('printingStatus', printingStatus, statusData.printing);
        
        // Sync pause button
        updatePauseButton(!statusData.printing);
        
        // Sync always-on-top
        if (statusData.always_on_top !== isAlwaysOnTop) {
            isAlwaysOnTop = statusData.always_on_top;
            updateAlwaysOnTopUI();
        }
    })
    .catch(error => {
        updateStatusIndicator('serverStatus', 'Server: OFFLINE', false);
        updateStatusIndicator('printingStatus', 'Printing: UNKNOWN', false);
    });
}
```

#### `checkExtensionStatus()`
```javascript
function checkExtensionStatus() {
    fetch('http://localhost:7777/status')
    .then(r => r.json())
    .then(data => {
        let extensionActive = data.extension_active || false;
        let activitySource = 'heartbeat';
        
        // Backup check: recent wins indicate activity
        return fetch('http://localhost:7777/recent-wins')
            .then(r => r.json())
            .then(wins => {
                const now = Date.now();
                const recentWin = wins.find(win => (now - win.timestamp) < 120000); // 2 minutes
                
                if (recentWin && !extensionActive) {
                    extensionActive = true;
                    activitySource = 'recent wins';
                }
                
                const status = extensionActive ? 'Extension: ACTIVE' : 'Extension: NO ACTIVITY';
                updateStatusIndicator('extensionStatus', status, extensionActive);
            });
    })
    .catch(err => {
        updateStatusIndicator('extensionStatus', 'Extension: SERVER DOWN', false);
    });
}
```

**Dual Detection Logic**:
1. **Primary**: Heartbeat from extension (every 2 seconds)
2. **Backup**: Recent wins (within 2 minutes = obviously active)

#### `pollServer()`
```javascript
function pollServer() {
    checkServerStatus();
    
    // Fetch and display recent wins
    fetch('http://localhost:7777/recent-wins')
    .then(r => r.json())
    .then(wins => {
        displayRecentWins(wins);
    });
}

setInterval(pollServer, 5000); // Update every 5 seconds
```

#### Show Management Functions

##### `createNewShow()`
```javascript
function createNewShow() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Create New Show</h3>
            <input type="text" id="showName" placeholder="Show name..." maxlength="50">
            <input type="text" id="showDescription" placeholder="Description (optional)..." maxlength="100">
            <div class="modal-buttons">
                <button onclick="this.closest('.modal').remove()">Cancel</button>
                <button onclick="submitNewShow()">Create</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}
```

##### `loadShows()`
```javascript
function loadShows() {
    fetch('http://localhost:7777/shows')
    .then(r => r.json())
    .then(data => {
        const showSelect = document.getElementById('showSelect');
        showSelect.innerHTML = '<option value="">No Active Show</option>';
        
        Object.keys(data.shows).forEach(showName => {
            const option = document.createElement('option');
            option.value = showName;
            option.textContent = showName;
            showSelect.appendChild(option);
        });
    });
}
```

#### Exclusion Management

##### `addExclusion()`
```javascript
function addExclusion() {
    const name = document.getElementById('newExclusion').value.trim();
    if (!name) return;
    
    fetch('http://localhost:7777/add-exclusion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    })
    .then(() => {
        document.getElementById('newExclusion').value = '';
        loadExclusions(); // Refresh list
        log(`Added exclusion: ${name}`);
    });
}
```

##### `removeExclusion(name)`
```javascript
function removeExclusion(name) {
    fetch('http://localhost:7777/remove-exclusion', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    })
    .then(() => {
        loadExclusions(); // Refresh list
        log(`Removed exclusion: ${name}`);
    });
}
```

### Chat Announcement Management

#### Chat Announcement Checkbox
Located in the print options section:
```html
<label>
    <input type="checkbox" id="announceToChatCheckbox"> Announce to Chat
</label>
```

**Functionality**:
- Enables/disables chat announcements globally
- Saved to `config.announce_to_chat`
- Synced with server on startup and status polling
- When enabled, items matching title patterns will be announced to chat

#### Wheel Spin Announcement Checkbox
Located in the print options section:
```html
<label>
    <input type="checkbox" id="announceWheelSpinsCheckbox" checked> Announce Wheel Spins to Server
</label>
```

**Functionality**:
- Controls whether wheel item buys are sent to wheel server (port 3800)
- Saved to `config.announce_wheel_spins`
- Defaults to enabled (checked)
- When disabled, wheel items won't be sent to wheel server

#### Chat Announcement Title Patterns
Located below exclusions section:
```html
<div class="exclusion-container">
    <label for="chatAnnounceBox">Announce to chat if title contains (comma separated):</label>
    <input id="chatAnnounceBox" placeholder="e.g. wheel, wheel spin, giveaway" />
    <button id="saveChatAnnounceBtn">Save Patterns</button>
    <button id="clearChatAnnounceBtn">Clear All</button>
    <div id="currentChatAnnounce" class="current-exclusions">
        <em>No patterns set</em>
    </div>
</div>
```

**Functionality**:
- Comma-separated title patterns (e.g., "wheel, wheel spin, giveaway")
- Case-insensitive substring matching
- Items matching any pattern will be announced to chat
- Patterns displayed as clickable tags (click to remove)
- Saved to `config.chat_announce_patterns`

**Handler Functions**:
```javascript
// Save patterns
document.getElementById('saveChatAnnounceBtn').onclick = () => {
    const patterns = chatAnnounceBox.value.split(',').map(p => p.trim()).filter(p => p);
    fetch('http://localhost:7777/chat-announce-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            announce_to_chat: currentSettings.announce_to_chat,
            chat_announce_patterns: patterns,
            announce_wheel_spins: currentSettings.announce_wheel_spins
        })
    });
};

// Load on startup
function loadChatAnnounceSettings() {
    fetch('http://localhost:7777/chat-announce-settings')
    .then(r => r.json())
    .then(data => {
        displayChatAnnouncePatterns(data.chat_announce_patterns);
        document.getElementById('announceToChatCheckbox').checked = data.announce_to_chat || false;
        document.getElementById('announceWheelSpinsCheckbox').checked = data.announce_wheel_spins !== undefined ? data.announce_wheel_spins : true;
    });
}
```

### Label Management

#### `displayRecentWins(wins)`
```javascript
function displayRecentWins(wins) {
    const winsDiv = document.getElementById('recentWins');
    
    if (wins.length === 0) {
        winsDiv.innerHTML = '<em>No wins detected yet...</em>';
        return;
    }
    
    const winsHtml = wins.map(win => {
        const timeAgo = win.timeAgo < 60 ? `${win.timeAgo}s ago` : `${Math.floor(win.timeAgo/60)}m ago`;
        const priceText = win.price ? ` - ${win.price}` : '';
        
        return `
            <div class="win-entry">
                <div>
                    <strong>${win.name}${priceText}</strong> - ${win.item}<br>
                    <small>${timeAgo} (${win.type})</small>
                </div>
                <button onclick="reprintLabel('${win.name}', '${win.item}', '${win.price || ''}')" 
                        class="reprint-btn">Reprint</button>
            </div>
        `;
    }).join('');
    
    winsDiv.innerHTML = winsHtml;
}
```

#### `reprintLabel(name, item, price)`
```javascript
function reprintLabel(name, item, price) {
    fetch('http://localhost:7777/reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, item, price })
    })
    .then(r => r.json())
    .then(data => {
        if (data.status === 'printed') {
            log(`Reprinted: ${name} - ${item}`);
        } else {
            log(`Reprint failed: ${data.reason || 'Unknown error'}`);
        }
    });
}
```

### Control Functions

#### Pause/Resume System
```javascript
let paused = false;
const pauseBtn = document.getElementById("pauseBtn");

function updatePauseButton(isPaused) {
    paused = isPaused;
    pauseBtn.innerText = isPaused ? "Resume" : "Pause";
    pauseBtn.style.background = isPaused ? '#4CAF50' : '#f44336';
}

pauseBtn.onclick = () => {
    const endpoint = paused ? 'resume' : 'pause';
    fetch(`http://localhost:7777/${endpoint}`, { method: 'POST' })
    .then(r => r.json())
    .then(data => {
        updatePauseButton(!data.printing);
        log(data.printing ? 'Printing resumed' : 'Printing paused');
    });
};
```

#### Settings Management
```javascript
// Giveaway printing toggle
document.getElementById('giveawayToggle').onchange = function() {
    fetch('http://localhost:7777/toggle-giveaways', { method: 'POST' })
    .then(r => r.json())
    .then(data => {
        log(`Giveaway printing: ${data.print_giveaways ? 'ENABLED' : 'DISABLED'}`);
    });
};

// Always-on-top toggle
document.getElementById('alwaysOnTopCheckbox').onchange = function() {
    if (window.electronAPI && window.electronAPI.setAlwaysOnTop) {
        window.electronAPI.setAlwaysOnTop(this.checked);
    }
    
    fetch('http://localhost:7777/toggle-always-on-top', { method: 'POST' })
    .then(r => r.json())
    .then(data => {
        log(`Always on top: ${data.always_on_top ? 'ON' : 'OFF'}`);
    });
};
```

## 🎨 styles.css - Visual Design

### Design Principles
- **Dark Theme**: Easy on eyes during long auction sessions
- **High Contrast**: Clear status indicators (green/red)
- **Compact Layout**: Maximum information in minimal space
- **Responsive Elements**: Adapts to window resizing

### Key Styles

#### Status Indicators
```css
.status-indicator {
    padding: 8px 12px;
    border-radius: 4px;
    font-weight: bold;
    text-align: center;
    margin: 2px;
    transition: all 0.3s ease;
}

.status-online {
    background-color: #2E7D32 !important;
    color: white;
}

.status-offline {
    background-color: #C62828 !important;
    color: white;
}
```

#### Modal Dialogs
```css
.modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background: #2a2a2a;
    padding: 20px;
    border-radius: 8px;
    max-width: 400px;
    width: 90%;
}
```

#### Win Entries
```css
.win-entry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid #333;
    transition: background-color 0.2s;
}

.win-entry:hover {
    background-color: rgba(255,255,255,0.05);
}

.reprint-btn {
    padding: 4px 8px;
    background: #D4AF37;
    color: #000;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
}
```

## 🔄 Real-Time Updates

### Polling System
- **Frequency**: Every 5 seconds
- **Endpoints**: `/ping`, `/status`, `/recent-wins`
- **Efficiency**: Only updates UI when status actually changes

### Status Tracking
```javascript
// Prevents unnecessary UI updates
if (status !== lastServerStatus) {
    log('Server status changed');
    lastServerStatus = status;
    updateStatusIndicator('serverStatus', status, true);
}
```

### Live Log Display
```javascript
function log(msg) {
    const div = document.createElement('div');
    div.textContent = `${new Date().toLocaleTimeString()} - ${msg}`;
    div.className = 'log-entry';
    logWindow.prepend(div);
    
    // Limit log entries to prevent memory issues
    while (logWindow.children.length > 50) {
        logWindow.removeChild(logWindow.lastChild);
    }
}
```

## 🎛️ User Interface Sections

### 1. Status Dashboard
- **Server Status**: Online/Offline indicator
- **Extension Status**: Active/No Activity based on heartbeat + recent wins
- **Printing Status**: Enabled/Paused with color coding

### 2. Control Panel  
- **Pause/Resume Button**: Master printing control
- **Settings Toggles**: Giveaway printing, always-on-top
- **Show Selection**: Dropdown to change active show

### 3. Show Management
- **Create New Show**: Modal dialog for new auction events
- **Active Show Display**: Current show name and label count
- **Show History**: Access to all previous shows

### 4. Exclusions Management
- **Add User**: Input field + button to block users
- **Exclusion List**: Visual list with individual remove buttons
- **Bulk Actions**: Select multiple exclusions for removal

### 5. Recent Wins Display
- **Scrollable List**: Recent wins with timestamps
- **Reprint Buttons**: One-click label reprinting
- **Win Details**: Name, item, price, type, time ago

### 6. Activity Log
- **Real-Time Events**: Server connections, print jobs, errors
- **Timestamps**: Precise timing information
- **Auto-Scroll**: Most recent entries at top
- **Limited History**: Prevents memory bloat

## 🔧 Debugging Features

### Development Console
```javascript
// Enable dev tools for debugging
// win.webContents.openDevTools();
```

### Error Handling
```javascript
fetch('http://localhost:7777/endpoint')
.catch(error => {
    log(`Error: ${error.message}`);
    updateStatusIndicator('serverStatus', 'Server: CONNECTION ERROR', false);
});
```

### IPC Communication Logging
```javascript
// Log all IPC messages in development
ipcRenderer.on('debug', (event, message) => {
    console.log('IPC Debug:', message);
});
```

## 📱 Responsive Design

### Window Sizing
- **Minimum**: 400x500 pixels
- **Default**: 520x700 pixels  
- **Maximum**: Unlimited (user resizable)

### Layout Adaptation
- **Flexible Containers**: CSS Flexbox for component arrangement
- **Scrollable Sections**: Win list and exclusions handle overflow
- **Collapsible Sections**: Advanced settings can be minimized

## 🎯 User Experience Goals

### Always Accessible
- **System Tray**: Always available regardless of window state
- **Hotkey Support**: Quick show/hide via tray click
- **Startup Integration**: Can auto-start with Windows

### Non-Intrusive  
- **Background Operation**: Window can be minimized to tray
- **Silent Updates**: Status changes don't interrupt user workflow
- **Minimal Resources**: Lightweight polling and efficient updates

### Informative
- **Clear Status**: Immediate visual feedback on system health
- **Detailed Logs**: Full audit trail of system events
- **Historical Data**: Access to all past wins and shows

### Reliable
- **Error Recovery**: Graceful handling of server disconnections
- **State Persistence**: Settings survive application restart
- **Offline Resilience**: Continues functioning when server temporarily down