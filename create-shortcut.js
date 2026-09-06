const fs = require('fs');
const path = require('path');
const os = require('os');

// Check desktop paths (Standard and OneDrive Desktop)
const candidates = [
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'OneDrive', 'Desktop')
];

const workspaceDir = path.resolve(__dirname);
const batTarget = path.join(workspaceDir, 'run-helper.bat');
const shortcutContent = `@echo off\r\ncd /d "${workspaceDir}"\r\ncall run-helper.bat\r\n`;

candidates.forEach((dir) => {
  if (fs.existsSync(dir)) {
    const filePath = path.join(dir, 'RemoteLink PC Agent.bat');
    fs.writeFileSync(filePath, shortcutContent, 'utf8');
    console.log('✅ Created Desktop shortcut at:', filePath);
  }
});
