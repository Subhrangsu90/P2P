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
const qrCanvas = document.getElementById('qrCanvas');

// Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';
  if (type === 'file') icon = '📁';
  if (type === 'control') icon = '🎮';

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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
  if (window.appState.signalingConnected) {
    badgeSignaling.className = 'status-badge connected';
    badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Server: Online</span>';
  } else {
    badgeSignaling.className = 'status-badge disconnected';
    badgeSignaling.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Server: Offline</span>';
  }

  if (window.appState.peerConnected) {
    badgeP2P.className = 'status-badge connected';
    badgeP2P.innerHTML = '<span class="status-dot"></span> <span class="badge-text">P2P: Connected</span>';
  } else {
    badgeP2P.className = 'status-badge disconnected';
    badgeP2P.innerHTML = '<span class="status-dot"></span> <span class="badge-text">P2P: Waiting</span>';
  }

  if (window.appState.helperConnected) {
    badgeHelper.className = 'status-badge connected';
    badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Helper: Ready</span>';
  } else {
    badgeHelper.className = 'status-badge';
    badgeHelper.innerHTML = '<span class="status-dot"></span> <span class="badge-text">Helper: Inactive</span>';
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

copyRoomBtn.addEventListener('click', () => {
  if (window.appState.roomCode) {
    navigator.clipboard.writeText(window.appState.roomCode).then(() => {
      showToast('Room code copied to clipboard!', 'success');
    });
  }
});

// QR Code Generator (SVG-based or Canvas without external library)
qrBtn.addEventListener('click', () => {
  if (!window.appState.roomCode) return;
  const joinUrl = `${window.location.origin}/?room=${window.appState.roomCode}`;
  
  // Use quick Google Chart QR code API image for crystal clarity
  const qrImg = document.getElementById('qrImg');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(joinUrl)}`;
  }
  qrModal.classList.add('active');
});

qrCloseBtn.addEventListener('click', () => {
  qrModal.classList.remove('active');
});

// Privacy Toggles Coordinator
function initPrivacyToggles() {
  const toggleScreen = document.getElementById('toggleScreen');
  const toggleControl = document.getElementById('toggleControl');
  const toggleFiles = document.getElementById('toggleFiles');

  function sync() {
    window.appState.localPermissions = {
      screenShare: toggleScreen.checked,
      remoteControl: toggleControl.checked,
      fileTransfer: toggleFiles.checked
    };
    if (window.sendControlMessage) {
      window.sendControlMessage({
        type: 'permissions-sync',
        permissions: window.appState.localPermissions
      });
    }
  }

  toggleScreen.addEventListener('change', sync);
  toggleControl.addEventListener('change', sync);
  toggleFiles.addEventListener('change', sync);
}

// Auto Join from URL params (?room=xxx)
function checkUrlRoomParam() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');
  if (room) {
    const input = document.getElementById('joinRoomInput');
    if (input) input.value = room;
    // Auto switch to pairing tab if needed
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
