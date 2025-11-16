# WhatnotAutoPrint PowerShell Launcher
# More reliable than VBScript approach

Write-Host "🚀 Starting WhatnotAutoPrint System..."

# Get script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Check if Node.js is available
try {
    $null = Get-Command node -ErrorAction Stop
    Write-Host "✅ Node.js found"
} catch {
    Write-Host "❌ Error: Node.js not found!"
    Write-Host "Please install Node.js from: https://nodejs.org"
    Read-Host "Press Enter to exit"
    exit 1
}

# Kill any existing processes
Write-Host "🧹 Cleaning up existing processes..."
try {
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
    Get-Process -Name "electron" -ErrorAction SilentlyContinue | Stop-Process -Force
} catch {
    # Ignore errors if no processes to kill
}

# Start server
Write-Host "🖥️  Starting server..."
$serverPath = Join-Path $scriptDir "server"
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $serverPath -WindowStyle Hidden

# Wait for server to start
Write-Host "⏳ Waiting for server to start..."
Start-Sleep -Seconds 3

# Test server
try {
    $response = Invoke-RestMethod -Uri "http://localhost:7777/ping" -TimeoutSec 5
    Write-Host "✅ Server is running: $($response.status)"
} catch {
    Write-Host "❌ Server failed to start!"
    Read-Host "Press Enter to exit"
    exit 1
}

# Start GUI
Write-Host "🖼️  Starting GUI..."
Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $scriptDir -WindowStyle Hidden

Write-Host "✅ System started successfully!"
Write-Host "💡 Use Ctrl+C to stop this launcher (processes will continue running)"
Write-Host ""
Write-Host "System Status:"
Write-Host "- Server: http://localhost:7777"
Write-Host "- GUI: Should appear as system tray icon"
Write-Host "- Extension: Load manually in Chrome: chrome://extensions -> Load unpacked -> select extension/ folder"

# Keep launcher running
try {
    Write-Host ""
    Write-Host "Press Ctrl+C to stop launcher..."
    while ($true) {
        Start-Sleep -Seconds 60
        # Optional: Add health checks here
    }
} finally {
    Write-Host ""
    Write-Host "Launcher stopped. Background processes continue running."
}