@echo off
title RemoteLink PC Native Agent
echo ====================================================
echo   RemoteLink PC Native Agent for Windows
echo ====================================================
echo.

if "%~1"=="" (
    set /p ROOM_CODE="Enter your 6-character Connection Code (from browser on PC): "
) else (
    set ROOM_CODE=%~1
)

echo.
echo Linking to RemoteLink Cloud Session [%ROOM_CODE%]...
node "%~dp0helper\pc-helper.js" %ROOM_CODE%
pause
