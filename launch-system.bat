@echo off
REM Simple launcher that calls the PowerShell script
echo Starting WhatnotAutoPrint System...
powershell -ExecutionPolicy Bypass -File "%~dp0launch-system.ps1"
pause