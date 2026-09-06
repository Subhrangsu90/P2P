@echo off
title RemoteLink PC Native Agent
echo ====================================================
echo   RemoteLink PC Native Agent for Windows
echo ====================================================
echo.

node "%~dp0helper\pc-helper.js" %1
if %errorlevel% neq 0 (
    echo.
    pause
)
