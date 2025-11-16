@echo off
title WhatnotAutoPrint Debug Mode
color 0a
echo ====================================
echo    WhatnotAutoPrint Debug Mode
echo ====================================
echo.
echo Starting server with visible output...
echo Press Ctrl+C to stop
echo.

cd /d "%~dp0\server"
node server.js

pause