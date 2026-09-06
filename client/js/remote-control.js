/**
 * RemoteLink Client — Remote Control, Touchpad, Keyboard & Screen Share
 */

let helperWs = null;

// ------------------------------------------
// Local PC Helper Connection (ws://127.0.0.1:8081)
// ------------------------------------------
function connectLocalHelper() {
  try {
    helperWs = new WebSocket('ws://127.0.0.1:8081');

    helperWs.onopen = () => {
      window.appState.helperConnected = true;
      window.updateStatusBadges();
      window.showToast('Connected to local PC Helper', 'success');
      console.log('[Helper] Connected to local PC Helper on port 8081.');
    };

    helperWs.onclose = () => {
      window.appState.helperConnected = false;
      window.updateStatusBadges();
      setTimeout(connectLocalHelper, 4000);
    };

    helperWs.onerror = () => {
      window.appState.helperConnected = false;
      window.updateStatusBadges();
    };

    helperWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'file-saved' && window.onHelperFileSaved) {
          window.onHelperFileSaved(msg);
          window.showToast(`Saved to Downloads: ${msg.name}`, 'success');
        } else if (msg.type === 'helper-status') {
          window.appState.remoteHelperInfo = msg;
        }
      } catch (e) {}
    };
  } catch (err) {
    console.warn('[Helper] Could not initiate helper connection:', err);
  }
}

function sendHelperMessage(obj) {
  if (helperWs && helperWs.readyState === WebSocket.OPEN) {
    helperWs.send(JSON.stringify(obj));
  }
}

window.sendHelperMessage = sendHelperMessage;

// ------------------------------------------
// Remote Control Execution (Host PC side)
// ------------------------------------------
function handleIncomingControlCommand(cmd) {
  if (!window.appState.localPermissions.remoteControl) {
    window.sendControlMessage({
      type: 'alert',
      message: 'Remote control was rejected: host has disabled remote control in Privacy Settings.'
    });
    return;
  }

  // Forward to local Windows PC Helper
  if (helperWs && helperWs.readyState === WebSocket.OPEN) {
    helperWs.send(JSON.stringify(cmd));
  } else {
    window.showToast(`Input received (${cmd.type}), but PC Helper is inactive`, 'control');
  }
}

window.handleIncomingControlCommand = handleIncomingControlCommand;

// ------------------------------------------
// Virtual Touchpad & Mobile Gestures
// ------------------------------------------
function initTouchpad() {
  const pad = document.getElementById('touchpad');
  if (!pad) return;

  let touchStartX = 0;
  let touchStartY = 0;
  let lastTouchX = 0;
  let lastTouchY = 0;
  let touchStartTime = 0;
  let touchCount = 0;
  let hasMoved = false;

  // Touch Events (Mobile)
  pad.addEventListener('touchstart', (e) => {
    touchCount = e.touches.length;
    touchStartTime = Date.now();
    hasMoved = false;
    pad.classList.add('active');

    if (touchCount === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      lastTouchX = touchStartX;
      lastTouchY = touchStartY;
    } else if (touchCount === 2) {
      lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
  }, { passive: false });

  pad.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent page pull-to-refresh
    if (!window.appState.remotePermissions.remoteControl) return;

    if (e.touches.length === 1) {
      const curX = e.touches[0].clientX;
      const curY = e.touches[0].clientY;
      const dx = (curX - lastTouchX) * 1.6;
      const dy = (curY - lastTouchY) * 1.6;

      if (Math.abs(curX - touchStartX) > 4 || Math.abs(curY - touchStartY) > 4) {
        hasMoved = true;
      }

      window.sendControlMessage({ type: 'mouse-move', dx, dy });
      lastTouchX = curX;
      lastTouchY = curY;
    } else if (e.touches.length === 2) {
      // 2-finger scroll
      hasMoved = true;
      const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaY = (currentY - lastTouchY) * 3;
      window.sendControlMessage({ type: 'mouse-scroll', deltaY });
      lastTouchY = currentY;
    }
  }, { passive: false });

  pad.addEventListener('touchend', (e) => {
    pad.classList.remove('active');
    const elapsed = Date.now() - touchStartTime;

    // Single tap -> Left Click
    if (touchCount === 1 && !hasMoved && elapsed < 280) {
      window.sendControlMessage({ type: 'mouse-click', button: 'left' });
    }
    // Two-finger tap -> Right Click
    else if (touchCount === 2 && !hasMoved && elapsed < 350) {
      window.sendControlMessage({ type: 'mouse-click', button: 'right' });
    }
  });

  // Mouse Simulation on Desktop
  let isMouseDown = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  pad.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    pad.classList.add('active');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isMouseDown) return;
    const dx = (e.clientX - lastMouseX) * 1.4;
    const dy = (e.clientY - lastMouseY) * 1.4;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    window.sendControlMessage({ type: 'mouse-move', dx, dy });
  });

  window.addEventListener('mouseup', () => {
    if (isMouseDown) {
      isMouseDown = false;
      pad.classList.remove('active');
    }
  });
}

// ------------------------------------------
// Mouse Click Buttons & Hotkeys
// ------------------------------------------
function initControls() {
  document.getElementById('btnMouseLeft')?.addEventListener('click', () => {
    window.sendControlMessage({ type: 'mouse-click', button: 'left' });
  });

  document.getElementById('btnMouseRight')?.addEventListener('click', () => {
    window.sendControlMessage({ type: 'mouse-click', button: 'right' });
  });

  // Hotkey Buttons
  document.querySelectorAll('.hotkey-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-key');
      window.sendControlMessage({ type: 'key-press', key });
      window.showToast(`Hotkey: ${key}`, 'control');
    });
  });

  // Text Injection
  const keyInput = document.getElementById('keyboardInput');
  const btnSendText = document.getElementById('btnSendText');

  btnSendText?.addEventListener('click', () => {
    const text = keyInput?.value;
    if (!text) return;
    window.sendControlMessage({ type: 'key-press', text });
    keyInput.value = '';
    window.showToast('Text injected into remote PC', 'control');
  });

  keyInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSendText.click();
    }
  });
}

// ------------------------------------------
// Screen Share Controls
// ------------------------------------------
function initScreenShare() {
  const startBtn = document.getElementById('startShareBtn');
  const stopBtn = document.getElementById('stopShareBtn');
  const fullscreenBtn = document.getElementById('toggleFullscreenBtn');
  const pipBtn = document.getElementById('pipBtn');
  const remoteVideo = document.getElementById('remoteVideo');
  const screenWrapper = document.getElementById('screenWrapper');

  let localScreenStream = null;

  startBtn?.addEventListener('click', async () => {
    if (!window.appState.localPermissions.screenShare) {
      return window.showToast('Screen sharing is disabled in Privacy Settings.', 'warning');
    }

    const pc = window.getPeerConnection();
    if (!pc) {
      return window.showToast('P2P connection not active yet.', 'error');
    }

    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30 } },
        audio: true
      });

      localScreenStream.getTracks().forEach((track) => {
        pc.addTrack(track, localScreenStream);
        track.onended = stopScreenShare;
      });

      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
      window.showToast('Sharing screen to peer', 'success');

      // Create new renegotiation offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      window.sendControlMessage({
        type: 'signal',
        data: { sdp: offer }
      });
    } catch (err) {
      console.warn('Screen share cancelled:', err);
    }
  });

  stopBtn?.addEventListener('click', stopScreenShare);

  function stopScreenShare() {
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((track) => track.stop());
      localScreenStream = null;
    }
    const placeholder = document.getElementById('screenPlaceholder');
    const screenWrapper = document.getElementById('screenWrapper');
    if (placeholder) placeholder.style.display = 'flex';
    if (screenWrapper) screenWrapper.classList.remove('streaming');

    if (startBtn) startBtn.style.display = 'inline-flex';
    if (stopBtn) stopBtn.style.display = 'none';
    window.showToast('Screen sharing stopped', 'info');
  }

  fullscreenBtn?.addEventListener('click', () => {
    if (!document.fullscreenElement && screenWrapper) {
      screenWrapper.requestFullscreen().catch((err) => console.warn(err));
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  });

  pipBtn?.addEventListener('click', async () => {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled && remoteVideo && remoteVideo.srcObject) {
      await remoteVideo.requestPictureInPicture();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  connectLocalHelper();
  initTouchpad();
  initControls();
  initScreenShare();
});
