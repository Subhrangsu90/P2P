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

const { execSync } = require('child_process');

candidates.forEach((dir) => {
  if (fs.existsSync(dir)) {
    // 1. Create .bat launcher
    const batPath = path.join(dir, 'RemoteLink PC Agent.bat');
    fs.writeFileSync(batPath, shortcutContent, 'utf8');
    console.log('✅ Created Desktop shortcut at:', batPath);

    // 2. Create official Windows .lnk shortcut with icon
    const lnkPath = path.join(dir, 'RemoteLink PC Agent.lnk');
    const psScript = `
      $wsh = New-Object -ComObject WScript.Shell
      $s = $wsh.CreateShortcut('${lnkPath.replace(/\\/g, '\\\\')}')
      $s.TargetPath = '${batTarget.replace(/\\/g, '\\\\')}'
      $s.WorkingDirectory = '${workspaceDir.replace(/\\/g, '\\\\')}'
      $s.Save()
    `;
    try {
      execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, { stdio: 'ignore' });
      console.log('✅ Created Windows .lnk shortcut at:', lnkPath);
    } catch (e) {}
  }
});

