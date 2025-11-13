const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let win;
let tray;

function createWindow() {
    win = new BrowserWindow({
        width: 520,
        height: 700,
        alwaysOnTop: false,
        autoHideMenuBar: true,  // Hide the menu bar
        webPreferences: {
            preload: path.join(__dirname, 'gui', 'preload.js')  // ✅ FIXED PATH
        }
    });

    // ✅ FIXED: load the GUI HTML file in the correct folder
    win.loadFile(path.join(__dirname, 'gui', 'index.html'));

    // Send initial always-on-top state when window is ready
    win.webContents.once('did-finish-load', () => {
        const initialState = win.isAlwaysOnTop();
        win.webContents.send("always-top-updated", initialState);
    });
}

app.whenReady().then(() => {
    console.log("MAIN __dirname:", __dirname);
    console.log("LOADING:", path.join(__dirname, 'gui', 'index.html'));
    createWindow();

    // Tray Icon
    tray = new Tray(path.join(__dirname, 'icon128.png'));
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show', click: () => win.show() },
        { label: 'Pause Printing', click: () => win.webContents.send('pause') },
        { label: 'Resume Printing', click: () => win.webContents.send('resume') },
        { label: 'Quit', click: () => app.quit() }
    ]);
    tray.setToolTip('Whatnot AutoPrint');
    tray.setContextMenu(contextMenu);

    ipcMain.on('toggle-always-top', () => {
        console.log("🔧 IPC: toggle-always-top received");
        if (!win) {
            console.log("❌ No window available");
            return;
        }

        const current = win.isAlwaysOnTop();
        const next = !current;
        
        console.log("🔧 Current always-on-top:", current, "-> Setting to:", next);
        
        try {
            win.setAlwaysOnTop(next);
            const actualState = win.isAlwaysOnTop();
            console.log("✅ Always On Top set to:", actualState);
            win.webContents.send("always-top-updated", actualState);
        } catch (error) {
            console.error("❌ Error setting always on top:", error);
        }
    });

    ipcMain.on('set-always-top', (event, state) => {
        console.log("🔧 IPC: set-always-top received, state:", state);
        if (!win) {
            console.log("❌ No window available");
            return;
        }

        try {
            win.setAlwaysOnTop(state);
            const actualState = win.isAlwaysOnTop();
            console.log("✅ Always On Top set to:", actualState);
            win.webContents.send("always-top-updated", actualState);
        } catch (error) {
            console.error("❌ Error setting always on top:", error);
        }
    });
});

// IPC Relay Events
ipcMain.on('pause', () => win.webContents.send('pause'));
ipcMain.on('resume', () => win.webContents.send('resume'));
ipcMain.on('test-print', () => win.webContents.send('test-print'));
ipcMain.on('print-last', () => win.webContents.send('print-last'));
