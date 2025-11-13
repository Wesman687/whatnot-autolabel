const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    toggleTop: () => ipcRenderer.send('toggle-always-top'),
    setAlwaysOnTop: (state) => ipcRenderer.send('set-always-top', state),
    onAlwaysTopUpdated: (func) => ipcRenderer.on("always-top-updated", (event, state) => func(state))
});
