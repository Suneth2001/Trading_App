@echo off
title ApexAlgo Pro - 24/7 AI Trading Engine Watchdog
cd /d "%~dp0backend"
:loop
echo [%date% %time%] Starting ApexAlgo Pro 24/7 Trading Engine...
node src\index.js
echo [%date% %time%] Engine exited. Restarting in 3 seconds...
timeout /t 3 /nobreak >nul
goto loop
