/**
 * RemoteLink Client — Remote Control, Touchpad, Keyboard & Screen Share
 */

let helperWs = null;

// ------------------------------------------
// Local PC Helper Connection (ws://127.0.0.1:8081)
// ------------------------------------------
let helperRetries = 0;
const MAX_HELPER_RETRIES = 1;

function connectLocalHelper() {
  // Mobile devices are controllers/viewers; they never run the Windows PC native helper
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    return;
  }

  // Modern browsers block insecure ws://127.0.0.1 from an HTTPS production origin (Mixed Content)
  if (window.location.protocol === 'https:') {
    // Gracefully bypass local ws:// when hosted on HTTPS
    return;
  }

  if (helperRetries >= MAX_HELPER_RETRIES) {
    return;
  }

  try {
    helperWs = new WebSocket('ws://127.0.0.1:8081');

    helperWs.onopen = () => {
      helperRetries = 0;
      window.appState.helperConnected = true;
      window.updateStatusBadges();
      window.showToast('Connected to local PC Agent', 'success');
      console.log('[Helper] Connected to local PC Agent on port 8081.');
    };

    helperWs.onclose = () => {
      window.appState.helperConnected = false;
      window.updateStatusBadges();
      helperRetries++;
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
    // Silent fail if local helper not running
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
let lastHelperWarningTime = 0;

function handleIncomingControlCommand(cmd) {
  // Screen frame receiver (do not treat as input command)
  if (cmd.type === 'screen-frame') {
    if (window.handleIncomingScreenFrame) {
      window.handleIncomingScreenFrame(cmd.frame);
    }
    return;
  }

  if (cmd.type === 'clipboard-sync') {
    if (window.handleIncomingClipboard) {
      window.handleIncomingClipboard(cmd.text);
    }
    return;
  }

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
    // Only alert for action triggers (clicks, keys), never high-frequency moves or frames
    if (cmd.type !== 'mouse-move') {
      const now = Date.now();
      if (now - lastHelperWarningTime > 6000) {
        lastHelperWarningTime = now;
        window.showToast('PC Agent inactive on Windows host. Run "npm run helper" on PC to execute native mouse clicks.', 'info');
      }
    }
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
  const relayScreenCanvas = document.getElementById('relayScreenCanvas');
  const screenWrapper = document.getElementById('screenWrapper');
  const placeholder = document.getElementById('screenPlaceholder');

  let localScreenStream = null;
  let relayFrameTimer = null;

  // Inbound screen frame receiver (WebSocket Cloud Relay fallback)
  const relayImage = new Image();
  const relayCtx = relayScreenCanvas ? relayScreenCanvas.getContext('2d') : null;

  relayImage.onload = () => {
    // If WebRTC is actively playing, prefer hardware video
    if (remoteVideo && remoteVideo.srcObject && remoteVideo.videoWidth > 0) {
      if (relayScreenCanvas) relayScreenCanvas.style.display = 'none';
      if (remoteVideo) remoteVideo.style.display = 'block';
      return;
    }

    if (placeholder) placeholder.style.display = 'none';
    if (screenWrapper) screenWrapper.classList.add('streaming');
    if (remoteVideo) remoteVideo.style.display = 'none';
    if (relayScreenCanvas && relayCtx) {
      relayScreenCanvas.style.display = 'block';
      relayScreenCanvas.width = relayImage.width;
      relayScreenCanvas.height = relayImage.height;
      relayCtx.drawImage(relayImage, 0, 0);
    }
  };

  window.handleIncomingScreenFrame = (frameData) => {
    relayImage.src = frameData;
  };

  startBtn?.addEventListener('click', async () => {
    if (!window.appState.localPermissions.screenShare) {
      return window.showToast('Screen sharing is disabled in Privacy Settings.', 'warning');
    }

    if (!window.appState.roomCode) {
      return window.showToast('Please create or join a session first.', 'warning');
    }

    try {
      localScreenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always', frameRate: { ideal: 30 } },
        audio: true
      });

      const pc = window.getPeerConnection();
      if (pc) {
        localScreenStream.getTracks().forEach((track) => {
          pc.addTrack(track, localScreenStream);
          track.onended = stopScreenShare;
        });

        // Create new renegotiation offer
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          window.sendControlMessage({
            type: 'signal',
            data: { sdp: offer }
          });
        } catch (e) {
          console.warn('[Screen] WebRTC renegotiation offer skipped:', e.message);
        }
      }

      // Hybrid Cloud Relay: Background frame capture for cellular/cross-network fallback
      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.srcObject = localScreenStream;
      hiddenVideo.play().catch(() => {});

      const offscreenCanvas = document.createElement('canvas');
      const offscreenCtx = offscreenCanvas.getContext('2d');

      relayFrameTimer = setInterval(() => {
        const activePc = window.getPeerConnection();
        // If direct WebRTC video is connected, skip websocket frames
        if (activePc && activePc.connectionState === 'connected') return;

        if (hiddenVideo.videoWidth > 0 && hiddenVideo.videoHeight > 0) {
          const scale = Math.min(1, 960 / hiddenVideo.videoWidth);
          offscreenCanvas.width = Math.round(hiddenVideo.videoWidth * scale);
          offscreenCanvas.height = Math.round(hiddenVideo.videoHeight * scale);
          offscreenCtx.drawImage(hiddenVideo, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
          const frameData = offscreenCanvas.toDataURL('image/jpeg', 0.52);

          if (window.sendControlMessage) {
            window.sendControlMessage({
              type: 'screen-frame',
              frame: frameData
            });
          }
        }
      }, 100); // 10 fps fallback for smooth cellular streaming

      startBtn.style.display = 'none';
      stopBtn.style.display = 'inline-flex';
      window.showToast('Sharing screen to peer', 'success');
    } catch (err) {
      console.warn('Screen share cancelled:', err);
    }
  });

  stopBtn?.addEventListener('click', stopScreenShare);

  function stopScreenShare() {
    if (relayFrameTimer) {
      clearInterval(relayFrameTimer);
      relayFrameTimer = null;
    }
    if (localScreenStream) {
      localScreenStream.getTracks().forEach((track) => track.stop());
      localScreenStream = null;
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (screenWrapper) screenWrapper.classList.remove('streaming');
    if (remoteVideo) remoteVideo.style.display = 'block';
    if (relayScreenCanvas) relayScreenCanvas.style.display = 'none';

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

// ------------------------------------------
// Direct Touch-on-Screen Click Mapping
// ------------------------------------------
function createTouchRipple(clientX, clientY) {
  const ripple = document.createElement('div');
  ripple.className = 'touch-ripple';
  ripple.style.left = `${clientX}px`;
  ripple.style.top = `${clientY}px`;
  document.body.appendChild(ripple);
  setTimeout(() => ripple.remove(), 420);
}

function initDirectTouch() {
  const touchBtn = document.getElementById('touchScreenBtn');
  const remoteVideo = document.getElementById('remoteVideo');
  const relayScreenCanvas = document.getElementById('relayScreenCanvas');
  let directTouchActive = false;

  touchBtn?.addEventListener('click', () => {
    directTouchActive = !directTouchActive;
    if (directTouchActive) {
      touchBtn.classList.remove('btn-secondary');
      touchBtn.classList.add('btn-primary');
      if (remoteVideo) remoteVideo.style.cursor = 'crosshair';
      if (relayScreenCanvas) relayScreenCanvas.style.cursor = 'crosshair';
      window.showToast('Direct Touch enabled: tap stream to click remote PC', 'success');
    } else {
      touchBtn.classList.remove('btn-primary');
      touchBtn.classList.add('btn-secondary');
      if (remoteVideo) remoteVideo.style.cursor = 'default';
      if (relayScreenCanvas) relayScreenCanvas.style.cursor = 'default';
      window.showToast('Direct Touch disabled', 'info');
    }
  });

  function triggerScreenClick(clientX, clientY, button = 'left', targetEl) {
    if (!directTouchActive || !targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const normX = (clientX - rect.left) / rect.width;
    const normY = (clientY - rect.top) / rect.height;

    if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
      window.sendControlMessage({
        type: 'screen-click',
        normX,
        normY,
        button
      });
      createTouchRipple(clientX, clientY);
    }
  }

  [remoteVideo, relayScreenCanvas].forEach((el) => {
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (directTouchActive) {
        triggerScreenClick(e.clientX, e.clientY, 'left', el);
      }
    });

    el.addEventListener('contextmenu', (e) => {
      if (directTouchActive) {
        e.preventDefault();
        triggerScreenClick(e.clientX, e.clientY, 'right', el);
      }
    });

    el.addEventListener('touchstart', (e) => {
      if (directTouchActive && e.touches.length === 1) {
        triggerScreenClick(e.touches[0].clientX, e.touches[0].clientY, 'left', el);
      }
    }, { passive: true });
  });
}

// ------------------------------------------
// Media Deck & Presentation Clicker
// ------------------------------------------
function initMediaAndPresentationControls() {
  document.querySelectorAll('.media-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (!action) return;
      window.sendControlMessage({ type: 'media-key', key: action });
      window.showToast(`Media: ${action}`, 'control');
    });
  });

  document.querySelectorAll('.slide-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (!action) return;
      window.sendControlMessage({ type: 'media-key', key: action });
      window.showToast(`Slide: ${action}`, 'control');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  connectLocalHelper();
  initTouchpad();
  initControls();
  initScreenShare();
  initDirectTouch();
  initMediaAndPresentationControls();
});

