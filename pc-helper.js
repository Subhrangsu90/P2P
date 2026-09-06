/**
 * PC Native Helper for Remote Control & OS Operations
 * ----------------------------------------------------
 * Runs locally on the host PC, listening on ws://127.0.0.1:8081.
 * Connects directly to the PC webapp tab to execute:
 *  - Native Windows mouse movements (relative & absolute)
 *  - Mouse clicks, double clicks, scrolls
 *  - Keystroke injection
 *  - Direct file saving to user Downloads directory
 */

const WebSocket = require('ws');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HELPER_PORT = process.env.HELPER_PORT || 8081;
const DRIVER_EXE = path.join(__dirname, 'InputDriver.exe');
const DRIVER_SRC = path.join(__dirname, 'InputDriver.cs');

// Ensure InputDriver.exe is compiled if on Windows
function ensureDriver() {
  if (process.platform !== 'win32') {
    console.log('⚠️ Non-Windows platform detected; OS input simulation requires Windows.');
    return null;
  }

  if (!fs.existsSync(DRIVER_EXE)) {
    console.log('⚙️ Compiling InputDriver.exe with .NET csc.exe...');
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
    if (fs.existsSync(cscPath) && fs.existsSync(DRIVER_SRC)) {
      try {
        execSync(`"${cscPath}" /target:exe /out:"${DRIVER_EXE}" /r:System.Windows.Forms.dll,System.Drawing.dll "${DRIVER_SRC}"`, { stdio: 'inherit' });
        console.log('✅ InputDriver.exe compiled successfully.');
      } catch (err) {
        console.error('❌ Failed to compile InputDriver.exe:', err.message);
        return null;
      }
    } else {
      console.error('❌ C# compiler or source file not found.');
      return null;
    }
  }
  return DRIVER_EXE;
}

ensureDriver();

let driverProcess = null;

function startDriver() {
  if (process.platform !== 'win32' || !fs.existsSync(DRIVER_EXE)) return;

  try {
    driverProcess = spawn(DRIVER_EXE, [], { stdio: ['pipe', 'pipe', 'pipe'] });
    driverProcess.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg === 'READY') {
        console.log('🎮 Native Input Driver initialized and ready.');
      }
    });
    driverProcess.stderr.on('data', (data) => {
      console.warn('⚠️ Input driver warning:', data.toString().trim());
    });
    driverProcess.on('exit', (code) => {
      console.log(`Input driver exited with code ${code}. Restarting...`);
      driverProcess = null;
      setTimeout(startDriver, 1000);
    });
  } catch (err) {
    console.error('❌ Error starting input driver:', err.message);
  }
}

startDriver();

function sendDriverCommand(cmd) {
  if (driverProcess && driverProcess.stdin && !driverProcess.stdin.destroyed) {
    driverProcess.stdin.write(cmd + '\n');
  }
}

// WebSocket server on local loopback ONLY
const wss = new WebSocket.Server({ port: HELPER_PORT, host: '127.0.0.1' });

console.log('====================================================');
console.log(`🖥️  PC Helper running on ws://127.0.0.1:${HELPER_PORT}`);
console.log('Ready to receive remote control commands & save files.');
console.log('====================================================');

wss.on('connection', (ws) => {
  console.log('🔗 PC Webapp connected to Native Helper.');

  // Notify webapp that helper is active
  ws.send(JSON.stringify({
    type: 'helper-status',
    status: 'active',
    platform: process.platform,
    driverReady: !!driverProcess
  }));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'ping': {
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
      }

      // Relative mouse move
      case 'mouse-move': {
        if (typeof msg.dx === 'number' && typeof msg.dy === 'number') {
          sendDriverCommand(`M ${Math.round(msg.dx)} ${Math.round(msg.dy)}`);
        } else if (typeof msg.x === 'number' && typeof msg.y === 'number' && msg.absolute) {
          sendDriverCommand(`A ${Math.round(msg.x)} ${Math.round(msg.y)}`);
        }
        break;
      }

      // Mouse click
      case 'mouse-click': {
        const btn = msg.button || 'left';
        sendDriverCommand(`C ${btn}`);
        break;
      }

      // Mouse down / up for dragging
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
          // Invert or scale scroll for Windows mouse_event wheel
          const delta = Math.round(msg.deltaY * -1);
          sendDriverCommand(`W ${delta}`);
        }
        break;
      }

      // Keystroke injection
      case 'key-press': {
        if (msg.text) {
          // Escape special characters for SendKeys: + ^ % ~ ( ) { } [ ]
          const escaped = msg.text.replace(/([+^%~(){}[\]])/g, '{$1}');
          sendDriverCommand(`K ${escaped}`);
        } else if (msg.key) {
          let k = msg.key;
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
            'Space': ' '
          };
          const mapped = keyMap[k] || (k.length === 1 ? k.replace(/([+^%~(){}[\]])/g, '{$1}') : null);
          if (mapped) {
            sendDriverCommand(`K ${mapped}`);
          }
        }
        break;
      }

      // Direct file save to Downloads folder
      case 'save-file': {
        try {
          const downloadDir = path.join(os.homedir(), 'Downloads');
          const safeName = path.basename(msg.name || 'received-file');
          const filePath = path.join(downloadDir, safeName);
          const buffer = Buffer.from(msg.data, 'base64');

          fs.writeFile(filePath, buffer, (err) => {
            if (err) {
              ws.send(JSON.stringify({ type: 'file-save-error', message: err.message, name: safeName }));
            } else {
              console.log(`📁 Saved file to: ${filePath} (${buffer.length} bytes)`);
              ws.send(JSON.stringify({ type: 'file-saved', path: filePath, name: safeName, size: buffer.length }));
            }
          });
        } catch (err) {
          ws.send(JSON.stringify({ type: 'file-save-error', message: err.message }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    console.log('🔌 PC Webapp disconnected from Native Helper.');
  });
});

process.on('SIGINT', () => {
  if (driverProcess) {
    sendDriverCommand('EXIT');
    driverProcess.kill();
  }
  process.exit(0);
});
