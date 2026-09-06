const fs = require('fs');
const path = require('path');
const os = require('os');

// 1. Locate the Windows Startup folder
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const startupDir = path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');

if (!fs.existsSync(startupDir)) {
  console.error('❌ Windows Startup directory not found at:', startupDir);
  process.exit(1);
}

const workspaceDir = path.resolve(__dirname);
const startupLnkPath = path.join(startupDir, 'RemoteLink PC Agent.lnk');
const desktopLnk = path.join(os.homedir(), 'OneDrive', 'Desktop', 'RemoteLink PC Agent.lnk');
const stdDesktopLnk = path.join(os.homedir(), 'Desktop', 'RemoteLink PC Agent.lnk');

if (fs.existsSync(desktopLnk)) {
  fs.copyFileSync(desktopLnk, startupLnkPath);
  console.log('✅ Copied RemoteLink PC Agent to Windows Startup folder:');
  console.log('   Location:', startupLnkPath);
} else if (fs.existsSync(stdDesktopLnk)) {
  fs.copyFileSync(stdDesktopLnk, startupLnkPath);
  console.log('✅ Copied RemoteLink PC Agent to Windows Startup folder:');
  console.log('   Location:', startupLnkPath);
} else {
  // Fallback: create shortcut via create-shortcut.js first
  require('./create-shortcut.js');
  if (fs.existsSync(desktopLnk)) {
    fs.copyFileSync(desktopLnk, startupLnkPath);
  }
}

// 2. Create uninstaller script
const removeScript = `@echo off
echo Removing RemoteLink from Windows Startup...
del /f /q "${startupLnkPath}" 2>nul
echo RemoteLink has been removed from Windows Startup.
pause
`;
const removeBatPath = path.join(workspaceDir, 'remove-from-startup.bat');
fs.writeFileSync(removeBatPath, removeScript, 'utf8');
console.log('✅ Created uninstaller script at:', removeBatPath);
