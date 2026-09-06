/**
 * RemoteLink Client — Application Coordinator & UI Controller
 */

// Global State
window.appState = {
  roomCode: null,
  isHost: false,
  signalingConnected: false,
  peerConnected: false,
  helperConnected: false,
  remoteHelperInfo: null,
  localPermissions: {
    screenShare: true,
    remoteControl: true,
    fileTransfer: true
  },
  remotePermissions: {
    screenShare: true,
    remoteControl: true,
    fileTransfer: true
  }
};

// UI Elements
const badgeSignaling = document.getElementById('badgeSignaling');
const badgeP2P = document.getElementById('badgeP2P');
const badgeHelper = document.getElementById('badgeHelper');
const activeRoomCodeEl = document.getElementById('activeRoomCode');
const activeRoomCard = document.getElementById('activeRoomCard');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const qrBtn = document.getElementById('qrBtn');
const qrModal = document.getElementById('qrModal');
const qrCloseBtn = document.getElementById('qrCloseBtn');

// Production SVG Toast Notification System (Zero Emojis)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else if (type === 'file') {
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  } else if (type === 'control') {
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/></svg>';
  } else {
    // info
    iconSvg = '<svg class="toast-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  // Clean any remaining emoji characters in message
  const cleanMsg = message.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

  toast.innerHTML = `<span class="toast-icon-wrap">${iconSvg}</span><span class="toast-msg">${cleanMsg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(6px)';
    toast.style.transition = 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

window.showToast = showToast;

// Tab Navigation
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetPanelId = tab.getAttribute('data-tab');
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPanel = document.getElementById(targetPanelId);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }
    });
  });
}

// Status Badges Update
function updateStatusBadges() {
  if (badgeSignaling) {
    if (window.appState.signalingConnected) {
      badgeSignaling.className = 'status-badge connected';
      badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Network: Online</span>';
    } else {
      badgeSignaling.className = 'status-badge disconnected';
      badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Network: Offline</span>';
    }
  }

  if (badgeP2P) {
    if (window.appState.peerConnected) {
      badgeP2P.className = 'status-badge connected';
      const modeLabel = window.appState.connectionMode === 'relay' ? 'Cloud Relay' : 'Direct Link';
      badgeP2P.innerHTML = `<span class="status-dot"></span> <span class="badge-text">Device: ${modeLabel}</span>`;
    } else {
      badgeP2P.className = 'status-badge disconnected';
      badgeP2P.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Device: Waiting</span>';
    }
  }

  if (badgeHelper) {
    if (window.appState.helperConnected) {
      badgeHelper.className = 'status-badge connected';
      badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">PC Agent: Ready</span>';
    } else {
      badgeHelper.className = 'status-badge';
      badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">PC Agent: Inactive</span>';
    }
  }
}

// Room Display & Copying
function setRoomCode(code) {
  window.appState.roomCode = code;
  if (activeRoomCodeEl) {
    activeRoomCodeEl.textContent = code;
  }
  const helperCmd = document.getElementById('helperCliCommand');
  if (helperCmd) {
    helperCmd.textContent = `npm run helper ${code}`;
  }
  if (activeRoomCard) {
    activeRoomCard.style.display = 'flex';
  }
}

copyRoomBtn?.addEventListener('click', () => {
  if (window.appState.roomCode) {
    navigator.clipboard.writeText(window.appState.roomCode).then(() => {
      showToast('Room code copied to clipboard!', 'success');
    });
  }
});

// QR Code Generator Modal
qrBtn?.addEventListener('click', () => {
  if (!window.appState.roomCode) return;
  const joinUrl = `${window.location.origin}/?room=${window.appState.roomCode}`;
  
  const qrImg = document.getElementById('qrImg');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}`;
  }
  qrModal?.classList.add('active');
});

qrCloseBtn?.addEventListener('click', () => {
  qrModal?.classList.remove('active');
});

// ------------------------------------------
// Universal Real-Time Clipboard Sync
// ------------------------------------------
function appendClipboardHistoryItem(text, direction = 'sent') {
  const historyList = document.getElementById('clipboardHistory');
  if (!historyList) return;

  const emptyText = historyList.querySelector('.clipboard-empty-text');
  if (emptyText) emptyText.remove();

  const item = document.createElement('div');
  item.className = 'clipboard-item';

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isSent = direction === 'sent';
  const badgeClass = isSent ? 'chip-sent' : 'chip-received';
  const badgeText = isSent ? 'Sent' : 'Received';

  item.innerHTML = `
    <div class="clipboard-meta">
      <span class="clipboard-badge ${badgeClass}">${badgeText}</span>
      <span class="clipboard-time">${timeStr}</span>
    </div>
    <div class="clipboard-text">${escapeHtml(text)}</div>
    <button class="btn-icon btn-sm clipboard-copy-btn" title="Copy to clipboard">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
      </svg>
    </button>
  `;

  item.querySelector('.clipboard-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Copied to local clipboard!', 'success');
    });
  });

  historyList.prepend(item);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function initClipboardSync() {
  const sendBtn = document.getElementById('sendClipboardBtn');
  const manualBtn = document.getElementById('sendManualClipboardBtn');
  const input = document.getElementById('clipboardInput');

  // Push Device Clipboard
  sendBtn?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text.trim() === '') {
        return showToast('Your system clipboard is empty.', 'warning');
      }
      window.sendControlMessage({ type: 'clipboard-sync', text });
      appendClipboardHistoryItem(text, 'sent');
      showToast('Pushed clipboard to remote peer!', 'success');
    } catch (err) {
      showToast('Please allow clipboard permission to read.', 'warning');
    }
  });

  // Manual Text Push
  function sendManual() {
    const text = input?.value.trim();
    if (!text) return;
    window.sendControlMessage({ type: 'clipboard-sync', text });
    appendClipboardHistoryItem(text, 'sent');
    input.value = '';
    showToast('Clipboard synced to remote peer!', 'success');
  }

  manualBtn?.addEventListener('click', sendManual);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendManual();
  });
}

function handleIncomingClipboard(text) {
  if (!text) return;
  appendClipboardHistoryItem(text, 'received');

  // Try writing to browser clipboard if focused
  if (navigator.clipboard && document.hasFocus && document.hasFocus()) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  // Forward to local PC helper so Windows system clipboard is directly updated
  if (window.sendHelperMessage) {
    window.sendHelperMessage({ type: 'clipboard-write', text });
  }

  showToast('Clipboard received from peer & copied!', 'success');
}

window.handleIncomingClipboard = handleIncomingClipboard;

// ------------------------------------------
// Diagnostics HUD Toggle
// ------------------------------------------
function initDiagnosticsHUDToggle() {
  const btn = document.getElementById('btnToggleHud');
  const hud = document.getElementById('diagnosticsHud');
  if (!btn || !hud) return;

  btn.addEventListener('click', () => {
    const isVisible = hud.style.display !== 'none';
    hud.style.display = isVisible ? 'none' : 'grid';
    btn.classList.toggle('active', !isVisible);
  });
}

// ------------------------------------------
// PWA Mobile Install Prompt
// ------------------------------------------
let deferredInstallPrompt = null;

function initPwaInstall() {
  const installBtn = document.getElementById('btnPwaInstall');
  if (!installBtn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    installBtn.style.display = 'inline-flex';
  });

  installBtn.addEventListener('click', async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        showToast('RemoteLink installed successfully!', 'success');
      }
      deferredInstallPrompt = null;
      installBtn.style.display = 'none';
    }
  });

  window.addEventListener('appinstalled', () => {
    installBtn.style.display = 'none';
    showToast('RemoteLink app installed.', 'success');
  });
}

// ------------------------------------------
// Host Authorization Modal Workflow
// ------------------------------------------
let pendingAuthPeerId = null;

function showAuthModal(peerId, deviceInfo) {
  pendingAuthPeerId = peerId;
  const modal = document.getElementById('authModal');
  const deviceEl = document.getElementById('authPeerDevice');
  if (deviceEl) {
    deviceEl.textContent = deviceInfo || 'Remote Device';
  }
  modal?.classList.add('active');
}

function initAuthModal() {
  const modal = document.getElementById('authModal');
  const btnAuthorize = document.getElementById('btnAuthorizePeer');
  const btnDecline = document.getElementById('btnDeclinePeer');

  btnAuthorize?.addEventListener('click', () => {
    if (pendingAuthPeerId && window.sendAuthResponse) {
      window.sendAuthResponse(pendingAuthPeerId, true);
      showToast('Authorized connection for peer.', 'success');
    }
    modal?.classList.remove('active');
    pendingAuthPeerId = null;
  });

  btnDecline?.addEventListener('click', () => {
    if (pendingAuthPeerId && window.sendAuthResponse) {
      window.sendAuthResponse(pendingAuthPeerId, false);
      showToast('Declined connection request.', 'warning');
    }
    modal?.classList.remove('active');
    pendingAuthPeerId = null;
  });
}

window.showAuthModal = showAuthModal;

// Privacy Toggles Coordinator
function initPrivacyToggles() {
  const toggleScreen = document.getElementById('toggleScreen');
  const toggleControl = document.getElementById('toggleControl');
  const toggleFiles = document.getElementById('toggleFiles');

  function sync() {
    window.appState.localPermissions = {
      screenShare: toggleScreen ? toggleScreen.checked : true,
      remoteControl: toggleControl ? toggleControl.checked : true,
      fileTransfer: toggleFiles ? toggleFiles.checked : true
    };
    if (window.sendControlMessage) {
      window.sendControlMessage({
        type: 'permissions-sync',
        permissions: window.appState.localPermissions
      });
    }
  }

  toggleScreen?.addEventListener('change', sync);
  toggleControl?.addEventListener('change', sync);
  toggleFiles?.addEventListener('change', sync);
}

// Auto Join from URL params (?room=xxx)
function checkUrlRoomParam() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    const input = document.getElementById('joinRoomInput');
    if (input) input.value = room;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initPrivacyToggles();
  initClipboardSync();
  initDiagnosticsHUDToggle();
  initPwaInstall();
  initAuthModal();
  updateStatusBadges();
  checkUrlRoomParam();
});

window.updateStatusBadges = updateStatusBadges;
window.setRoomCode = setRoomCode;

