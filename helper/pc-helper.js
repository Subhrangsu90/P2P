/**
 * RemoteLink PC Native Helper
 * ----------------------------
 * High-performance native companion for Windows:
 *  - Native mouse movement & click injection (relative / absolute)
 *  - Keystroke & text injection
 *  - File saving to Downloads directory with automatic name conflict resolution
 *  - Native Windows File Explorer integration ("Reveal in Explorer", "Open File", "Open Downloads")
 */

const WebSocket = require('ws');
const { spawn, execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HELPER_PORT = process.env.HELPER_PORT || 8081;

// Paths for InputDriver
const DRIVER_LOCAL_EXE = path.join(__dirname, 'InputDriver.exe');
const DRIVER_ROOT_EXE = path.join(__dirname, '..', 'InputDriver.exe');
const DRIVER_SRC = fs.existsSync(path.join(__dirname, 'InputDriver.cs'))
  ? path.join(__dirname, 'InputDriver.cs')
  : path.join(__dirname, '..', 'InputDriver.cs');

function resolveDriverExe() {
  if (process.platform !== 'win32') {
    console.log('⚠️ Non-Windows platform; native input simulation disabled.');
    return null;
  }
  if (fs.existsSync(DRIVER_LOCAL_EXE)) return DRIVER_LOCAL_EXE;
  if (fs.existsSync(DRIVER_ROOT_EXE)) return DRIVER_ROOT_EXE;

  // Attempt compilation with .NET Framework csc.exe
  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  if (fs.existsSync(cscPath) && fs.existsSync(DRIVER_SRC)) {
    try {
      console.log('⚙️ Compiling InputDriver.exe...');
      execSync(`"${cscPath}" /target:exe /out:"${DRIVER_LOCAL_EXE}" /r:System.Windows.Forms.dll,System.Drawing.dll "${DRIVER_SRC}"`, { stdio: 'inherit' });
      console.log('✅ InputDriver.exe compiled successfully.');
      return DRIVER_LOCAL_EXE;
    } catch (err) {
      console.error('❌ Failed to compile InputDriver.exe:', err.message);
    }
  }
  return null;
}

const driverExe = resolveDriverExe();
let driverProcess = null;

function startDriver() {
  if (!driverExe || !fs.existsSync(driverExe)) return;
  try {
    driverProcess = spawn(driverExe, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    driverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg === 'READY') {
        console.log('🎮 Native Input Driver ready.');
      }
    });
    driverProcess.stderr.on('data', (data) => {
      console.warn('⚠️ Input driver warning:', data.toString().trim());
    });
    driverProcess.on('exit', (code) => {
      driverProcess = null;
      setTimeout(startDriver, 1200);
    });
  } catch (err) {
    console.error('❌ Error launching input driver:', err.message);
  }
}

startDriver();

function sendDriverCommand(cmd) {
  if (driverProcess && driverProcess.stdin && !driverProcess.stdin.destroyed) {
    driverProcess.stdin.write(cmd + '\n');
  }
}

// Get non-conflicting filename
function getUniqueFilePath(dir, fileName) {
  let targetPath = path.join(dir, fileName);
  if (!fs.existsSync(targetPath)) return targetPath;

  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let counter = 1;
  while (fs.existsSync(path.join(dir, `${base} (${counter})${ext}`))) {
    counter++;
  }
  return path.join(dir, `${base} (${counter})${ext}`);
}

// Screen resolution cache
let screenResolution = { width: 1920, height: 1080 };
if (process.platform === 'win32') {
  try {
    const res = execSync('powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height"', { encoding: 'utf8' });
    const lines = res.trim().split(/\r?\n/).map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (lines.length >= 2) {
      screenResolution.width = lines[0];
      screenResolution.height = lines[1];
    }
  } catch (e) {}
}

// WebSocket server for PC Helper (loopback only)
function handleHelperCommand(msg, sendResponse) {
  switch (msg.type) {
    case 'ping': {
      sendResponse({ type: 'pong' });
      break;
    }

    // Direct Screen Click from normalized coordinates (0.0 to 1.0)
    case 'screen-click': {
      if (typeof msg.normX === 'number' && typeof msg.normY === 'number') {
        const x = Math.round(msg.normX * screenResolution.width);
        const y = Math.round(msg.normY * screenResolution.height);
        sendDriverCommand(`A ${x} ${y}`);
        sendDriverCommand(`C ${msg.button || 'left'}`);
      }
      break;
    }

    // Mouse movements
    case 'mouse-move': {
      if (typeof msg.dx === 'number' && typeof msg.dy === 'number') {
        sendDriverCommand(`M ${Math.round(msg.dx)} ${Math.round(msg.dy)}`);
      } else if (typeof msg.x === 'number' && typeof msg.y === 'number' && msg.absolute) {
        sendDriverCommand(`A ${Math.round(msg.x)} ${Math.round(msg.y)}`);
      }
      break;
    }

    // Mouse clicks
    case 'mouse-click': {
      sendDriverCommand(`C ${msg.button || 'left'}`);
      break;
    }

    // Media Deck & Presentation Keys
    case 'media-key': {
      if (process.platform === 'win32') {
        const key = msg.key;
        const vbsMap = {
          'VolumeUp': 175,
          'VolumeDown': 174,
          'VolumeMute': 173,
          'MediaPlayPause': 179,
          'MediaNext': 176,
          'MediaPrev': 177,
          'MediaStop': 178
        };
        if (vbsMap[key]) {
          exec(`powershell -NoProfile -Command "(New-Object -ComObject WScript.Shell).SendKeys([char]${vbsMap[key]})"`);
        } else if (key === 'NextSlide') {
          sendDriverCommand('K {PGDN}');
        } else if (key === 'PrevSlide') {
          sendDriverCommand('K {PGUP}');
        } else if (key === 'SlideShow') {
          sendDriverCommand('K {F5}');
        } else if (key === 'BlankSlide') {
          sendDriverCommand('K b');
        }
      }
      break;
    }

    // Universal Real-Time Clipboard Write
    case 'clipboard-write': {
      if (process.platform === 'win32' && typeof msg.text === 'string') {
        const sanitized = msg.text.replace(/'/g, "''");
        exec(`powershell -NoProfile -Command "Set-Clipboard -Value '${sanitized}'"`, (err) => {
          if (!err) {
            sendResponse({ type: 'clipboard-updated', text: msg.text });
          }
        });
      }
      break;
    }

    // Mouse drag down/up
    case 'mouse-down': {
      sendDriverCommand(`D ${msg.button || 'left'}`);
      break;
    }
    case 'mouse-up': {
      sendDriverCommand(`U ${msg.button || 'left'}`);
      break;
    }

    // Wheel scroll
    case 'mouse-scroll': {
      if (typeof msg.deltaY === 'number') {
        const delta = Math.round(msg.deltaY * -1);
        sendDriverCommand(`W ${delta}`);
      }
      break;
    }

    // Keystrokes & Text injection
    case 'key-press': {
      if (msg.text) {
        const escaped = msg.text.replace(/([+^%~(){}[\]])/g, '{$1}');
        sendDriverCommand(`K ${escaped}`);
      } else if (msg.key) {
        const keyMap = {
          'Enter': '{ENTER}',
          'Backspace': '{BACKSPACE}',
          'Tab': '{TAB}',
          'Escape': '{ESC}',
          'ArrowUp': '{UP}',
          'ArrowDown': '{DOWN}',
          'ArrowLeft': '{LEFT}',
          'ArrowRight': '{RIGHT}',
          'Delete': '{DELETE}',
          'Home': '{HOME}',
          'End': '{END}',
          'PageUp': '{PGUP}',
          'PageDown': '{PGDN}',
          'Space': ' ',
          'F5': '{F5}',
          'F11': '{F11}'
        };
        const mapped = keyMap[msg.key] || (msg.key.length === 1 ? msg.key.replace(/([+^%~(){}[\]])/g, '{$1}') : null);
        if (mapped) {
          sendDriverCommand(`K ${mapped}`);
        }
      }
      break;
    }

    // Save received file to Downloads
    case 'save-file': {
      try {
        const downloadDir = path.join(os.homedir(), 'Downloads');
        const safeName = path.basename(msg.name || 'received-file');
        const finalPath = getUniqueFilePath(downloadDir, safeName);
        const buffer = Buffer.from(msg.data, 'base64');

        fs.writeFile(finalPath, buffer, (err) => {
          if (err) {
            sendResponse({ type: 'file-save-error', message: err.message, name: safeName });
          } else {
            console.log(`📁 File saved to: ${finalPath} (${buffer.length} bytes)`);
            sendResponse({
              type: 'file-saved',
              path: finalPath,
              name: path.basename(finalPath),
              size: buffer.length
            });
          }
        });
      } catch (err) {
        sendResponse({ type: 'file-save-error', message: err.message });
      }
      break;
    }

    // Open file in Windows Explorer (highlight the file)
    case 'reveal-in-explorer': {
      if (process.platform === 'win32' && msg.path && fs.existsSync(msg.path)) {
        exec(`explorer.exe /select,"${msg.path}"`, (err) => {
          if (err) console.error('Error revealing in explorer:', err.message);
        });
      }
      break;
    }

    // Launch file in its default Windows viewer
    case 'open-file': {
      if (process.platform === 'win32' && msg.path && fs.existsSync(msg.path)) {
        exec(`cmd.exe /c start "" "${msg.path}"`, (err) => {
          if (err) console.error('Error launching file:', err.message);
        });
      }
      break;
    }

    // Open Downloads folder in Windows Explorer
    case 'open-downloads-folder': {
      if (process.platform === 'win32') {
        const downloadDir = path.join(os.homedir(), 'Downloads');
        exec(`explorer.exe "${downloadDir}"`, (err) => {
          if (err) console.error('Error opening Downloads directory:', err.message);
        });
      }
      break;
    }
  }
}

// ------------------------------------------
// 1. Local Loopback WebSocket Server (for dev: ws://127.0.0.1:8081)
// ------------------------------------------
let wss = null;
try {
  wss = new WebSocket.Server({ port: HELPER_PORT, host: '127.0.0.1' });

  wss.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`ℹ️ Local port ${HELPER_PORT} is already in use by another instance.`);
    } else {
      console.warn('⚠️ Local helper server notice:', err.message);
    }
  });

  console.log('====================================================');
  console.log(`🖥️  RemoteLink PC Helper initialized`);
  console.log(`Display Resolution: ${screenResolution.width}x${screenResolution.height}`);
  console.log(`Local Loopback: ws://127.0.0.1:${HELPER_PORT}`);
  console.log('====================================================');

  wss.on('connection', (ws) => {
    console.log('🔗 Local browser dashboard connected to PC Helper.');

  // Notify client of status
  ws.send(JSON.stringify({
    type: 'helper-status',
    status: 'active',
    platform: process.platform,
    driverReady: !!driverProcess,
    screenResolution: screenResolution,
    downloadsPath: path.join(os.homedir(), 'Downloads')
  }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    handleHelperCommand(msg, (data) => ws.send(JSON.stringify(data)));
  });

  ws.on('close', () => {
    console.log('🔌 Local browser dashboard disconnected from PC Helper.');
  });
});
} catch (err) {
  console.log(`ℹ️ Local port ${HELPER_PORT} notice: ${err.message}`);
}

// ------------------------------------------
// 2. Production Cloud Relay Client (Connect via Session Code)
// ------------------------------------------
const cliArgs = process.argv.slice(2);
const targetRoomCode = cliArgs[0] || process.env.ROOM_CODE;
const cloudServerUrl = process.env.SIGNALING_URL || 'wss://p2p-9jva.onrender.com';

function connectToCloudRelay(code) {
  const cleanCode = code.trim().toLowerCase();
  console.log(`🌐 Connecting PC Helper to cloud relay at ${cloudServerUrl}...`);

  const cloudWs = new WebSocket(cloudServerUrl);

  cloudWs.on('open', () => {
    console.log(`📡 Linked to cloud signaling. Registering PC Agent for session [${cleanCode.toUpperCase()}]...`);
    cloudWs.send(JSON.stringify({
      type: 'register-helper',
      roomCode: cleanCode,
      platform: process.platform,
      screenResolution
    }));
  });

  cloudWs.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === 'helper-registered') {
      console.log('====================================================');
      console.log(`✅ PC NATIVE AGENT IS ACTIVE!`);
      console.log(`Session Code: [${cleanCode.toUpperCase()}]`);
      console.log(`Your phone can now control this PC from anywhere in the world!`);
      console.log('Press Ctrl+C to stop.');
      console.log('====================================================');
      return;
    }

    if (msg.type === 'error') {
      console.error(`❌ Cloud Relay Error: ${msg.message}`);
      return;
    }

    handleHelperCommand(msg, (data) => {
      if (cloudWs.readyState === WebSocket.OPEN) {
        cloudWs.send(JSON.stringify({
          type: 'relay-message',
          payload: data
        }));
      }
    });
  });

  cloudWs.on('close', () => {
    console.log('⚠️ Disconnected from cloud relay. Reconnecting in 3s...');
    setTimeout(() => connectToCloudRelay(cleanCode), 3000);
  });

  cloudWs.on('error', (err) => {
    console.warn('⚠️ Cloud relay connection notice:', err.message);
  });
}

function getClipboardCode() {
  if (process.platform !== 'win32') return null;
  try {
    const text = execSync('powershell -NoProfile -Command "Get-Clipboard"', { encoding: 'utf8', timeout: 1800 }).trim();
    const match = text.match(/\b([a-fA-F0-9]{6})\b/);
    if (match) return match[1].toLowerCase();
  } catch (e) {}
  return null;
}

// Auto-start cloud link: from command line argument, or automatically from Windows clipboard
const autoDetectedCode = targetRoomCode || getClipboardCode();

if (autoDetectedCode) {
  console.log(`📋 Auto-detected session code: [${autoDetectedCode.toUpperCase()}]`);
  connectToCloudRelay(autoDetectedCode);
} else if (process.stdin.isTTY) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('👉 Enter your 6-character Connection Code (or press Enter for local dev): ', (answer) => {
    const code = answer.trim();
    if (code) {
      connectToCloudRelay(code);
    } else {
      console.log('No code entered. Running in local loopback mode (ws://127.0.0.1:8081).');
    }
    rl.close();
  });
} else {
  console.log('Running in local loopback mode (ws://127.0.0.1:8081).');
}

process.on('SIGINT', () => {
  if (driverProcess) {
    sendDriverCommand('EXIT');
    driverProcess.kill();
  }
  process.exit(0);
});

module.exports = { wss };
