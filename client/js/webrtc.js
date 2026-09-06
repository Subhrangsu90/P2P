/**
 * RemoteLink Client — WebRTC Connection & Signaling Manager
 */

let signalingWs = null;
let pc = null;
let dataChannel = null;
let iceCandidateQueue = [];
let localStream = null;
let isMakingOffer = false;
let ignoreOffer = false;

// Fallback ICE Servers
let rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10
};

// Fetch dynamic ICE / TURN config from signaling server
async function loadIceConfig() {
  try {
    const res = await fetch('/ice-config');
    if (res.ok) {
      const data = await res.json();
      if (data.iceServers && data.iceServers.length > 0) {
        rtcConfig = data;
        console.log('[ICE] Dynamically loaded ICE/TURN configuration:', data);
      }
    }
  } catch (e) {
    console.warn('[ICE] Could not fetch dynamic ICE config; using fallback STUN.');
  }
}

// ------------------------------------------
// WebSocket Signaling
// ------------------------------------------
function connectSignaling() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // If running on Vite dev server (port 5173), direct WebSocket connection to signaling server on port 8080
  const port = window.location.port === '5173' ? '8080' : window.location.port;
  const host = `${window.location.hostname}${port ? ':' + port : ''}`;
  const wsUrl = `${protocol}//${host}`;

  signalingWs = new WebSocket(wsUrl);

  signalingWs.onopen = () => {
    window.appState.signalingConnected = true;
    window.updateStatusBadges();
    console.log('[Signaling] Connected to signaling server.');
  };

  signalingWs.onclose = () => {
    window.appState.signalingConnected = false;
    window.appState.peerConnected = false;
    window.updateStatusBadges();
    console.log('[Signaling] Disconnected. Reconnecting in 3s...');
    setTimeout(connectSignaling, 3000);
  };

  signalingWs.onerror = (err) => {
    console.error('[Signaling] WebSocket error:', err);
  };

  signalingWs.onmessage = async (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'room-created': {
        window.appState.isHost = true;
        window.setRoomCode(msg.code);
        window.showToast(`Room created: ${msg.code}`, 'success');
        break;
      }

      case 'paired': {
        window.setRoomCode(msg.code);
        window.showToast('Peer joined room! Initiating P2P connection...', 'success');
        setupPeerConnection();

        if (window.appState.isHost) {
          createAndSendDataChannel();
          await sendOffer();
        }
        break;
      }

      case 'signal': {
        handleSignal(msg.data);
        break;
      }

      case 'peer-disconnected': {
        window.appState.peerConnected = false;
        window.updateStatusBadges();
        window.showToast('Peer disconnected from room.', 'warning');
        cleanupPeerConnection();
        break;
      }

      case 'error': {
        window.showToast(msg.message, 'error');
        break;
      }
    }
  };
}

// ------------------------------------------
// PeerConnection Lifecycle
// ------------------------------------------
function setupPeerConnection() {
  if (pc) return;

  pc = new RTCPeerConnection(rtcConfig);

  // ICE Candidate event
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log(`[ICE] Local candidate: ${event.candidate.type} | ${event.candidate.candidate}`);
      signalingWs.send(JSON.stringify({
        type: 'signal',
        data: { candidate: event.candidate }
      }));
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      window.appState.peerConnected = true;
      window.updateStatusBadges();
      window.showToast('P2P Direct Connection Established!', 'success');
    } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      window.appState.peerConnected = false;
      window.updateStatusBadges();
      if (pc.connectionState === 'failed') {
        window.showToast('P2P Connection failed. Attempting ICE restart...', 'warning');
        restartIce();
      }
    }
  };

  // Remote screen track receiver
  pc.ontrack = (event) => {
    const remoteVideo = document.getElementById('remoteVideo');
    const placeholder = document.getElementById('screenPlaceholder');
    const screenWrapper = document.getElementById('screenWrapper');
    if (remoteVideo && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
      if (placeholder) placeholder.style.display = 'none';
      if (screenWrapper) screenWrapper.classList.add('streaming');
      window.showToast('📺 Receiving live screen stream', 'info');
    }
  };

  // Incoming DataChannel (Client side)
  pc.ondatachannel = (event) => {
    console.log('[DataChannel] Received remote channel:', event.channel.label);
    setupDataChannelEvents(event.channel);
  };
}

function createAndSendDataChannel() {
  if (!pc) return;
  const channel = pc.createDataChannel('control-and-files', {
    ordered: true
  });
  setupDataChannelEvents(channel);
}

function setupDataChannelEvents(channel) {
  dataChannel = channel;
  dataChannel.binaryType = 'arraybuffer';

  dataChannel.onopen = () => {
    console.log('[DataChannel] Channel is OPEN.');
    window.appState.peerConnected = true;
    window.updateStatusBadges();

    // Sync initial privacy permissions
    if (window.sendControlMessage) {
      window.sendControlMessage({
        type: 'permissions-sync',
        permissions: window.appState.localPermissions
      });
    }
  };

  dataChannel.onclose = () => {
    console.log('[DataChannel] Channel closed.');
  };

  dataChannel.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const msg = JSON.parse(event.data);
        handleControlMessage(msg);
      } catch (e) {
        console.error('Invalid JSON message on DataChannel:', e);
      }
    } else if (event.data instanceof ArrayBuffer) {
      if (window.handleIncomingFileChunk) {
        window.handleIncomingFileChunk(event.data);
      }
    }
  };
}

async function sendOffer() {
  try {
    isMakingOffer = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    signalingWs.send(JSON.stringify({
      type: 'signal',
      data: { sdp: pc.localDescription }
    }));
  } catch (err) {
    console.error('[WebRTC] Error sending offer:', err);
  } finally {
    isMakingOffer = false;
  }
}

async function handleSignal(data) {
  if (!pc) setupPeerConnection();

  if (data.sdp) {
    const description = new RTCSessionDescription(data.sdp);
    const isOffer = description.type === 'offer';
    const isCollision = isOffer && (isMakingOffer || pc.signalingState !== 'stable');

    ignoreOffer = !window.appState.isHost && isCollision;
    if (ignoreOffer) {
      console.warn('[WebRTC] Offer collision detected; rolling back or ignoring.');
      return;
    }

    if (isCollision) {
      await Promise.all([
        pc.setLocalDescription({ type: 'rollback' }),
        pc.setRemoteDescription(description)
      ]);
    } else {
      // Guard against stale answers arriving after an ICE restart
      if (description.type === 'answer' && pc.signalingState !== 'have-local-offer') {
        console.warn('[WebRTC] Stale answer arrived while in state:', pc.signalingState);
        return;
      }
      await pc.setRemoteDescription(description);
    }

    // Flush queued ICE candidates
    while (iceCandidateQueue.length > 0) {
      const candidate = iceCandidateQueue.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        console.warn('[ICE] Failed adding queued candidate:', e);
      }
    }

    if (isOffer) {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signalingWs.send(JSON.stringify({
        type: 'signal',
        data: { sdp: pc.localDescription }
      }));
    }
  } else if (data.candidate) {
    const candidate = new RTCIceCandidate(data.candidate);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('[ICE] Failed to add candidate:', err);
      }
    } else {
      iceCandidateQueue.push(candidate);
    }
  }
}

async function restartIce() {
  if (!pc || !window.appState.isHost) return;
  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    signalingWs.send(JSON.stringify({
      type: 'signal',
      data: { sdp: pc.localDescription }
    }));
    console.log('[ICE] Restart offer sent.');
  } catch (err) {
    console.error('[ICE] Restart failed:', err);
  }
}

function cleanupPeerConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  iceCandidateQueue = [];
}

// ------------------------------------------
// Messaging & Dispatch
// ------------------------------------------
function sendControlMessage(obj) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(obj));
  }
}

function handleControlMessage(msg) {
  switch (msg.type) {
    case 'permissions-sync': {
      window.appState.remotePermissions = msg.permissions;
      if (window.updatePermissionsDisplay) {
        window.updatePermissionsDisplay();
      }
      break;
    }

    case 'file-meta': {
      if (window.handleIncomingFileMeta) {
        window.handleIncomingFileMeta(msg);
      }
      break;
    }

    case 'file-end': {
      if (window.handleIncomingFileEnd) {
        window.handleIncomingFileEnd();
      }
      break;
    }

    case 'file-cancel': {
      if (window.handleIncomingFileCancel) {
        window.handleIncomingFileCancel(msg.reason);
      }
      break;
    }

    default: {
      // Pass through to remote control handler (mouse, click, key)
      if (window.handleIncomingControlCommand) {
        window.handleIncomingControlCommand(msg);
      }
    }
  }
}

// Button Listeners for Room Setup
document.getElementById('createRoomBtn')?.addEventListener('click', () => {
  if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
    signalingWs.send(JSON.stringify({ type: 'create-room' }));
  } else {
    window.showToast('Signaling server offline. Check connection.', 'error');
  }
});

document.getElementById('joinRoomBtn')?.addEventListener('click', () => {
  const input = document.getElementById('joinRoomInput');
  const code = input?.value.trim().toLowerCase();
  if (!code) return window.showToast('Please enter a room code.', 'warning');

  if (signalingWs && signalingWs.readyState === WebSocket.OPEN) {
    window.appState.isHost = false;
    signalingWs.send(JSON.stringify({ type: 'join-room', code }));
  } else {
    window.showToast('Signaling server offline.', 'error');
  }
});

// Init on Load
loadIceConfig().then(connectSignaling);

window.sendControlMessage = sendControlMessage;
window.getDataChannel = () => dataChannel;
window.getPeerConnection = () => pc;
