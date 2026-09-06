# RemoteLink — P2P Screen Share, Remote Control & File Transfer

**RemoteLink** connects your phone and PC directly over a private peer-to-peer (WebRTC) connection with zero intermediary servers touching your actual data.

---

## 🌟 Key Features

1. **Bidirectional Screen Sharing**:
   - Stream PC screen to phone (view or monitor desktop on mobile).
   - Stream phone screen to PC (presentations, app testing).
   - Fullscreen and Picture-in-Picture support.

2. **Remote Control (Virtual Touchpad & Keyboard)**:
   - **Trackpad Gestures on Phone**:
     - **1-finger swipe**: Smooth relative mouse cursor movement.
     - **1-finger tap**: Left Click.
     - **2-finger tap**: Right Click.
     - **2-finger drag**: Vertical mouse scroll wheel.
   - **On-Screen Keyboard & Hotkeys**: Send typed text or special keys (`Enter`, `Backspace`, `Tab`, `Esc`, `Arrow keys`, `Space`) directly to PC.
   - Powered by a native Windows PC Helper (`pc-helper.js`) using high-speed OS APIs (no sluggish lag, zero native compilation issues).

3. **Direct P2P File Transfer**:
   - Transfer files of any size directly between devices over WebRTC `RTCDataChannel`.
   - **Chunked streaming** (16 KB chunks) with backpressure handling (`bufferedAmount` check) to prevent browser buffer overloads.
   - Live progress bar, transfer stats, and automatic browser download.
   - Optional automatic saving to the PC's `Downloads` folder when the PC Helper is running.

4. **Privacy-First Permission Toggles**:
   - Each device maintains its own permission switches:
     - `Allow Screen Share`
     - `Allow Remote Control`
     - `Allow File Transfer`
   - **Local enforcement**: Regardless of what the other device requests, your local browser strictly blocks unauthorized actions before execution.
   - Live permission status synchronization displays the peer's capabilities in real time.

---

## 🏗️ Architecture

```
[Phone Webapp] ◄──────────────► [Signaling Server] ◄──────────────► [PC Webapp]
      │                                                                   ▲
      │                                                                   │ Local WebSocket
      │                        WebRTC Direct P2P                          ▼ (127.0.0.1:8081)
      └────────────────────────────────────────────────────────► [PC Native Helper]
                         • Screen Frames (Video)                    • Win32 Mouse
                         • Control Commands (Touchpad/Keys)         • Win32 Keyboard
                         • File Chunks (Binary)                     • Filesystem Save
```

- **Signaling Server (`server.js`)**: Runs on port `8080`. Serves the web app and exchanges initial WebRTC handshakes (SDP offer/answer and ICE candidates). **Never sees screen frames, files, or keystrokes.**
- **Web App (`index.html`)**: Runs in modern web browsers on both PC and mobile.
- **PC Helper (`pc-helper.js`)**: A lightweight Node.js daemon running locally on the PC on loopback (`127.0.0.1:8081`). Connects to the PC browser tab to simulate Windows mouse movements and keystrokes natively.

---

## 🚀 Step-by-Step Setup Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or newer installed on your PC).
- Both PC and Phone connected to the same local Wi-Fi network (or reachable over the network).

---

### Step 1: Install Dependencies
Open a terminal in the project directory:
```bash
npm install
```

---

### Step 2: Start the Signaling & Web Server
```bash
npm start
```
You will see output showing your local addresses:
```text
====================================================
🚀 Signaling & Web Server is running on port 8080
💻 Local:   http://localhost:8080
📱 Network: http://192.168.1.5:8080  (Open this on your phone)
====================================================
```

---

### Step 3: Open the Web App on Both Devices
1. **On your PC**: Open your browser and go to:
   ```text
   http://localhost:8080
   ```
2. **On your Phone**: Open your phone browser (Chrome, Safari, Firefox) and enter the Network URL printed in the terminal (e.g., `http://192.168.1.5:8080`).

---

### Step 4: Pair the Devices
1. On your **PC**, click **"Connect Server"**, then click **"➕ Create Room (PC / Host)"**.
2. A 6-character room code will appear (e.g. `a1b2c3`).
3. On your **Phone**, click **"Connect Server"**, enter the 6-character room code in the input box, and tap **"Join Room"**.
4. Both devices will display **"P2P: Connected"** with a green badge once the WebRTC handshake completes!

---

### Step 5: (Optional but Recommended) Start the PC Helper for OS Mouse/Keyboard Control
To enable real OS-level mouse cursor control and keystrokes on Windows:
1. Open a second terminal window on your PC.
2. Run:
   ```bash
   npm run helper
   ```
3. The PC browser tab will automatically show **"Helper: Active (OS Control)"** in the top right header badge.
4. Now, swiping on your phone's **Remote Control** touchpad moves your actual PC mouse cursor!

---

## 🎮 How to Use Each Feature

### 1. View PC Screen on Phone
1. On your PC, go to the **📺 Screen View** tab and click **"📤 Share My Screen"**.
2. Choose entire screen or a specific window.
3. The phone displays the video stream in real-time. Tap **"⛶ Fullscreen"** on the phone for full-display viewing.

### 2. Control PC Mouse & Keyboard from Phone
1. On your phone, switch to the **🎮 Remote Control** tab.
2. **Move Cursor**: Drag one finger anywhere in the trackpad surface.
3. **Left Click**: Tap once on the trackpad or press the "Left Click" button.
4. **Right Click**: Tap with two fingers or press the "Right Click" button.
5. **Scroll**: Drag up or down with two fingers.
6. **Typing**: Type into the text input and tap "Send Text", or tap quick hotkey buttons (`Enter`, `Backspace`, `Esc`, arrow keys).

### 3. Send Files (Either Direction)
1. Go to the **📁 File Transfer** tab on either device.
2. Drag and drop a file or tap to select one from your device.
3. The file is split into 16 KB chunks and streamed over the peer-to-peer data channel.
4. The receiving device displays a progress bar and automatically downloads the completed file.
5. If the PC Helper is running on the receiving PC, the file is also saved directly into your `Downloads` directory.

### 4. Privacy Control
1. Switch to the **🛡️ Privacy Toggles** tab.
2. Independently toggle on or off:
   - **Allow Screen Share**
   - **Allow Remote Control**
   - **Allow File Transfer**
3. If you turn off "Allow Remote Control", incoming mouse movements and keystrokes will be blocked immediately.

---

## 🔒 Security & Privacy Notes
- **Direct P2P**: Video streams and files travel directly between your phone and PC over WebRTC. Nothing is stored on any cloud server.
- **Local Loopback Helper**: `pc-helper.js` listens only on `127.0.0.1:8081` (localhost only), preventing unauthorized network access from outside your PC.
- **Single-Use Rooms**: Room codes are random and allow a maximum of 2 devices per session.

---

## 🐙 Git Repository Setup

If you want to track changes or push this project to GitHub / GitLab:

1. **Check status**:
   ```bash
   git status
   ```
2. **Stage files**:
   ```bash
   git add .
   ```
3. **Commit changes**:
   ```bash
   git commit -m "feat: initial commit for RemoteLink P2P remote control, screen share, and file transfer"
   ```
4. **Push to Remote (e.g. GitHub)**:
   ```bash
   # Add your remote repository URL
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git

   # Push to main
   git branch -M main
   git push -u origin main
   ```

