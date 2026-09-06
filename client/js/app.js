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
      badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Server: Online</span>';
    } else {
      badgeSignaling.className = 'status-badge disconnected';
      badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Server: Offline</span>';
    }
  }

  if (badgeP2P) {
    if (window.appState.peerConnected) {
      badgeP2P.className = 'status-badge connected';
      badgeP2P.innerHTML = '<span class="status-dot"></span> <span class="badge-text">P2P: Connected</span>';
    } else {
      badgeP2P.className = 'status-badge disconnected';
      badgeP2P.innerHTML = '<span class="status-dot"></span> <span class="badge-text">P2P: Waiting</span>';
    }
  }

  if (badgeHelper) {
    if (window.appState.helperConnected) {
      badgeHelper.className = 'status-badge connected';
      badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Helper: Ready</span>';
    } else {
      badgeHelper.className = 'status-badge';
      badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Helper: Inactive</span>';
    }
  }
}

// Room Display & Copying
function setRoomCode(code) {
  window.appState.roomCode = code;
  if (activeRoomCodeEl) {
    activeRoomCodeEl.textContent = code;
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
  updateStatusBadges();
  checkUrlRoomParam();
});

window.updateStatusBadges = updateStatusBadges;
window.setRoomCode = setRoomCode;
