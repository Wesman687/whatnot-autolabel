const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let win;
let tray;

function createWindow() {
    win = new BrowserWindow({
        width: 450,
        height: 600,
        alwaysOnTop: false,
        webPreferences: {
            preload: path.join(__dirname, 'gui', 'preload.js')  // ✅ FIXED PATH
        }
    });

    // ✅ FIXED: load the GUI HTML file in the correct folder
    win.loadFile(path.join(__dirname, 'gui', 'index.html'));
}

app.whenReady().then(() => {
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
        if (!win) return;
        const current = win.isAlwaysOnTop();
        const next = !current;
        win.setAlwaysOnTop(next);

        // Send updated state back to renderer
        win.webContents.send('always-top-updated', next);
    });
});

// IPC Relay Events

ipcMain.on('pause', () => win.webContents.send('pause'));
ipcMain.on('resume', () => win.webContents.send('resume'));
ipcMain.on('test-print', () => win.webContents.send('test-print'));
ipcMain.on('print-last', () => win.webContents.send('print-last'));
