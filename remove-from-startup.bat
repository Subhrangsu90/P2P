@echo off
echo Removing RemoteLink from Windows Startup...
del /f /q "C:\Users\USER\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\RemoteLink PC Agent.lnk" 2>nul
del /f /q "C:\Users\USER\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\RemoteLink-Agent.vbs" 2>nul
echo RemoteLink successfully removed from Windows Startup.
pause
