# RemoteLink — P2P Screen Share, Remote Control & File Explorer Hub

**RemoteLink** connects your mobile phone and PC directly over a private peer-to-peer (WebRTC) connection with a built-in TURN relay, native Windows input injection, and an interactive File Explorer hub. Zero intermediary servers touch your screen frames or files.

---

## 🌟 Key Features

1. **Interactive File Explorer Hub (No Direct Unwanted Downloads)**:
   - **Catalog Received Files**: Shows file type icons, name, file size, timestamp, and PC storage status.
   - **File Preview**: In-browser preview modal for images, code/text, video, audio, and PDF documents.
   - **Native "Save As..."**: Uses the modern browser File System Access API (`showSaveFilePicker`) so you can select the destination folder and name via the Windows Explorer Save Dialog.
   - **Windows Explorer Integration**:
     - **📂 Reveal in Explorer**: Highlight the saved file in Windows File Explorer (`explorer.exe /select`).
     - **⚡ Open File**: Launch the file directly with its default Windows application.
     - **📂 Open Downloads Folder**: Quick 1-click access to your Downloads directory.
   - **Multi-File Drag & Drop Sender**: Streamlined chunked sending with backpressure flow control, transfer speed (KB/s - MB/s), and progress bar.

2. **Bidirectional Screen Sharing**:
   - Stream PC screen to phone (monitor desktop on mobile).
   - Stream phone screen to PC (presentations, app testing).
   - Fullscreen mode and Picture-in-Picture (PiP) support.

3. **Remote Control (Virtual Touchpad & Keyboard)**:
   - **Trackpad Gestures on Phone**:
     - **1-finger swipe**: Smooth relative mouse cursor movement.
     - **1-finger tap**: Left Click.
     - **2-finger tap**: Right Click.
     - **2-finger drag**: Mouse scroll wheel.
   - **Quick Windows Hotkeys**: `Win+D`, `Alt+Tab`, `Ctrl+Shift+Esc` (Task Manager), `Enter`, `Backspace`, `Esc`, `Space`, `F5`, `F11`.
   - **Text Injection**: Type or paste text on mobile to type directly onto the PC.

4. **Built-in TURN Relay Server**:
   - Embedded `node-turn` server running on port `3478`.
   - Automatically handles NAT traversal when Chrome hides local IPs behind mDNS (`.local` addresses).

5. **Privacy-First Permission Toggles**:
   - Granular on/off switches for Screen Share, Remote Control, and File Transfer.
   - Local enforcement: Your browser blocks unauthorized commands before they execute.

---

## 🏗️ Project Architecture

```
P2P/
├── client/                     # Modern modular web frontend
│   ├── index.html              # Responsive tabbed user interface
│   ├── css/
│   │   └── style.css           # Glassmorphic dark design system
│   └── js/
│       ├── app.js              # State manager, tabs & toast notifications
│       ├── webrtc.js           # Dynamic ICE/TURN, WebRTC P2P & DataChannel
│       ├── file-explorer.js    # File chunking, File Explorer Hub & preview modal
│       └── remote-control.js   # Touchpad gestures, hotkeys & screen share
├── server/
│   └── server.js               # Signaling server, TURN relay & static asset server
├── helper/
│   ├── pc-helper.js            # Native Windows companion (Explorer & input injection)
│   ├── InputDriver.cs          # C# Windows input simulation source
│   └── InputDriver.exe         # Pre-compiled high-performance binary
├── server.js                   # Root launcher for npm start
├── pc-helper.js                # Root launcher for npm run helper
├── package.json                # Project dependencies & scripts
└── README.md
```

---

## 🚀 How to Run

### 1. Start the Server & TURN Relay
In a terminal:
```bash
npm start
```
- Web dashboard: `http://localhost:8080`
- Mobile network address: `http://<your-lan-ip>:8080` (printed in terminal)
- TURN relay: Port `3478`

### 2. Start the Windows PC Helper
In a second terminal:
```bash
npm run helper
```
- Helper runs on `ws://127.0.0.1:8081` to enable Windows Explorer actions and mouse/keyboard injection.

### 3. Connect Devices
1. Open `http://localhost:8080` on your PC.
2. Click **Generate Room Code** (e.g. `a1b2c3`) or click **QR Code**.
3. Open the network URL on your phone and enter the 6-character code (or scan the QR code).
4. Direct WebRTC P2P connection will establish instantly!
