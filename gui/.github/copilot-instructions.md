# Copilot / AI Assistant Instructions — WhatnotAutoPrint

Short: This is a small Electron-based tray/GUI app (Whatnot AutoPrint). The main process creates a BrowserWindow that loads the UI from the `gui/` folder and exposes a preload script. Changes to app behavior typically involve edits to the main process (`main.js`), the GUI files under `gui/`, or the preload/renderer bridge.

Key files
- `main.js` (workspace root) — main Electron entry; creates `BrowserWindow` and `Tray`; loads `index.html` and `preload.js` from the workspace root.
- `gui/main.js` — duplicate/alternate main-process file sometimes present; check for duplication before editing both.
- `index.html` — top-level UI markup.
- `preload.js` — preload bridge (used for secure ipc exposure). When adding renderer APIs, expose them here.
- `renderer.js` — UI logic that listens to IPC and implements printing controls.
- `icon128.png` — tray icon referenced by `Tray(path.join(__dirname, 'icon128.png'))`.

Observed IPC channels and patterns (use these exact names)
- Channels sent from Main -> Renderer via `win.webContents.send(...)`:
  - `pause` — pause printing
  - `resume` — resume printing
  - `test-print` — trigger a test print flow
  - `print-last` — print the last item
- Toggle/UX events
  - `toggle-always-top` — main receives this and toggles `win.setAlwaysOnTop(...)`

How the main process wires UI events
- The tray menu in `main.js` calls `win.webContents.send('pause')` / `resume` etc. If you add a new tray action, follow this pattern:
  1. Add menu item in `Menu.buildFromTemplate(...)` inside `main.js`.
  2. Use `win.webContents.send('<channel>')` to notify renderer.
  3. Ensure renderer listens (via `ipcRenderer.on('<channel>', handler)`) or expose via `preload.js`.

Agent editing rules (concrete, repo-specific)
- When changing IPC channels, update both ends: `ipcMain.on(...)` in `main.js` (if main receives) and `ipcRenderer.on(...)` in renderer. The codebase uses `ipcMain.on('pause', () => win.webContents.send('pause'))` as the relay pattern — preserve that relay behaviour when adding new flows.
- Avoid editing the tray icon path without checking `icon128.png` exists in the workspace root.
- There may be duplicate `main.js` files (workspace root and `gui/main.js`). Do not modify only one; check which is used by package.json or by how the app is started. If package.json is missing, prefer editing the root `main.js` file that loads the UI.

Run / debug (assumptions below)
- Typical Electron start (if `package.json` has a start script):
  PowerShell:
  ```powershell
  npm start
  ```
- If no `package.json` start script exists, start with Electron directly:
  ```powershell
  npx electron .
  ```
- To open the renderer devtools, call `win.webContents.openDevTools()` in `createWindow()` or use remote debugging flags when launching Electron.

Assumptions & missing-file notes
- I couldn't read the project's `package.json` from the current workspace. Please confirm whether the Electron start script is defined; if not, the `npx electron .` approach works.
- If `preload.js` uses `contextBridge`, prefer exposing small named APIs (e.g. `window.api.printTest()`) rather than exposing `ipcRenderer` directly.

If you want me to continue
- I can merge this into an existing `.github/copilot-instructions.md` if you have one (I searched and didn't find an existing file in this workspace).
- I can open and summarize `preload.js` and `renderer.js` if you grant read access or paste them here — then I'll add exact examples for exposing functions via `contextBridge` and the renderer listeners to modify printing behavior.

Failure modes the agent should watch for
- `win` may be undefined if `createWindow()` hasn't run; ensure `win` is checked before calling `win.webContents.send(...)`.
- Duplicate `main.js` copies can cause inconsistent behavior.

Please review and tell me any missing files or workflows you want added (e.g., packaging, unit tests, CI commands).
