/**
 * RemoteLink P2P — Signaling & Static Web Server + Built-in TURN Relay
 * --------------------------------------------------------------------
 * Serves the modern client web application from client/
 * Hosts WebSocket room-based signaling for WebRTC
 * Runs embedded TURN relay (node-turn) for NAT traversal
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Turn = require('node-turn');

const PORT = process.env.PORT || 8080;
const TURN_PORT = process.env.TURN_PORT || 3478;
const TURN_USERNAME = 'remotelink';
const TURN_CREDENTIAL = 'remotelink2024';

const DIST_DIR = path.join(__dirname, '..', 'dist');
const CLIENT_DIR = path.join(__dirname, '..', 'client');

function getActiveStaticDir() {
  return fs.existsSync(DIST_DIR) ? DIST_DIR : CLIENT_DIR;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};


function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// ------------------------------------------
// Embedded TURN Relay Server
// ------------------------------------------
const turnServer = new Turn({
  authMech: 'long-term',
  credentials: {
    [TURN_USERNAME]: TURN_CREDENTIAL
  },
  listeningPort: TURN_PORT,
  debugLevel: 'WARN'
});

try {
  turnServer.start();
  console.log(`🔄 TURN relay server running on port ${TURN_PORT}`);
} catch (err) {
  console.error(`⚠️  TURN server start notice: ${err.message}`);
}

// ------------------------------------------
// HTTP Static File Server
// ------------------------------------------
function serveStaticFile(req, res) {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/') {
    reqPath = '/index.html';
  }

  // Prevent directory traversal
  const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
  const staticDir = getActiveStaticDir();
  let filePath = path.join(staticDir, safePath);

  if (!fs.existsSync(filePath) && staticDir === DIST_DIR) {
    filePath = path.join(CLIENT_DIR, safePath);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, must-revalidate',
      'Content-Length': stats.size
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

// Metered TURN credentials cache
let cachedMeteredIce = null;
let lastMeteredFetch = 0;

async function fetchMeteredIce() {
  const domain = process.env.METERED_DOMAIN;
  const secretKey = process.env.METERED_SECRET_KEY || process.env.METERED_API_KEY;
  if (!domain || !secretKey) return null;

  // Cache for 20 minutes
  if (cachedMeteredIce && (Date.now() - lastMeteredFetch < 20 * 60 * 1000)) {
    return cachedMeteredIce;
  }

  try {
    const formattedDomain = domain.includes('.') ? domain : `${domain}.metered.live`;
    const apiUrl = `https://${formattedDomain}/api/v1/turn/credentials?secretKey=${secretKey}`;
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        cachedMeteredIce = data;
        lastMeteredFetch = Date.now();
        console.log('[TURN] Successfully fetched fresh Metered TURN credentials.');
        return cachedMeteredIce;
      }
    }
  } catch (err) {
    console.warn('[TURN] Error fetching Metered credentials:', err.message);
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url.split('?')[0];

  // Dynamic ICE config endpoint
  if (reqUrl === '/ice-config') {
    const host = req.headers.host?.split(':')[0] || 'localhost';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1';

    let iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ];

    // Check if Metered TURN credentials are configured via environment variables
    const meteredServers = await fetchMeteredIce();
    if (meteredServers) {
      iceServers = iceServers.concat(meteredServers);
    } else if (process.env.TURN_URL) {
      // Support custom TURN server via environment variables
      iceServers.push({
        urls: process.env.TURN_URL.split(',').map((u) => u.trim()),
        username: process.env.TURN_USERNAME || '',
        credential: process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD || ''
      });
    }

    // If running on local development machine, also append the local node-turn server
    if (isLocalhost) {
      iceServers.push({
        urls: [
          `turn:${host}:${TURN_PORT}`,
          `turn:${host}:${TURN_PORT}?transport=tcp`
        ],
        username: TURN_USERNAME,
        credential: TURN_CREDENTIAL
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      iceServers,
      iceCandidatePoolSize: 10
    }));
    return;
  }

  // Health check endpoint
  if (reqUrl === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      activeRooms: rooms.size,
      time: new Date().toISOString()
    }));
    return;
  }

  // Serve static files
  serveStaticFile(req, res);
});

// ------------------------------------------
// WebSocket Signaling Server
// ------------------------------------------
const wss = new WebSocket.Server({ server });

// In-memory room table: { roomCode: { host: ws, viewers: [ws], pin: string|null, requireApproval: boolean } }
const rooms = new Map();

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex'); // e.g. "a1b2c3"
}

wss.on('connection', (ws) => {
  ws.peerId = crypto.randomBytes(4).toString('hex');
  ws.roomCode = null;
  ws.isHost = false;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }

    switch (msg.type) {
      // Device creates a new room (becomes host)
      case 'create-room': {
        const code = generateRoomCode();
        const roomData = {
          host: ws,
          viewers: [],
          pin: msg.pin ? String(msg.pin).trim() : null,
          requireApproval: msg.requireApproval !== false
        };
        rooms.set(code, roomData);
        ws.roomCode = code;
        ws.isHost = true;
        ws.send(JSON.stringify({
          type: 'room-created',
          code,
          peerId: ws.peerId,
          pin: roomData.pin,
          requireApproval: roomData.requireApproval
        }));
        break;
      }

      // Viewer requests to join room
      case 'join-room': {
        const room = rooms.get(msg.code);
        if (!room || !room.host || room.host.readyState !== WebSocket.OPEN) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room not found or host is offline.' }));
        }

        // Check PIN if room has PIN configured
        if (room.pin && (!msg.pin || String(msg.pin).trim() !== room.pin)) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Invalid 4-digit room PIN.' }));
        }

        // Limit maximum concurrent viewers (up to 5 viewers + 1 host = 6 devices)
        if (room.viewers.length >= 5) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room is full (maximum 5 viewers).' }));
        }

        ws.roomCode = msg.code;
        ws.isHost = false;

        // If host requires manual authorization prompt
        if (room.requireApproval) {
          ws.send(JSON.stringify({ type: 'waiting-auth', message: 'Waiting for host approval...' }));
          room.host.send(JSON.stringify({
            type: 'auth-request',
            peerId: ws.peerId,
            code: msg.code,
            deviceInfo: msg.deviceInfo || 'Remote Device'
          }));
        } else {
          // Instant join
          room.viewers.push(ws);
          ws.send(JSON.stringify({ type: 'paired', code: msg.code, peerId: ws.peerId, isHost: false }));
          room.host.send(JSON.stringify({ type: 'peer-joined', code: msg.code, peerId: ws.peerId }));
        }
        break;
      }

      // Host approves or declines an incoming connection request
      case 'auth-response': {
        if (!ws.isHost || !ws.roomCode) return;
        const room = rooms.get(ws.roomCode);
        if (!room) return;

        // Find the requesting client WebSocket
        let requestingWs = null;
        for (const client of wss.clients) {
          if (client.peerId === msg.peerId && client.roomCode === ws.roomCode) {
            requestingWs = client;
            break;
          }
        }

        if (!requestingWs) return;

        if (msg.approved) {
          if (!room.viewers.includes(requestingWs)) {
            room.viewers.push(requestingWs);
          }
          requestingWs.send(JSON.stringify({
            type: 'paired',
            code: ws.roomCode,
            peerId: requestingWs.peerId,
            isHost: false
          }));
          ws.send(JSON.stringify({
            type: 'peer-joined',
            code: ws.roomCode,
            peerId: requestingWs.peerId
          }));
        } else {
          requestingWs.send(JSON.stringify({
            type: 'auth-declined',
            message: 'Host declined your connection request.'
          }));
        }
        break;
      }

      // Relay WebRTC handshake (offer, answer, ICE candidates)
      case 'signal': {
        const room = rooms.get(ws.roomCode);
        if (!room) return;

        // If a specific targetPeerId is provided, route directly to that peer
        if (msg.targetPeerId) {
          for (const client of wss.clients) {
            if (client.peerId === msg.targetPeerId && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'signal',
                senderPeerId: ws.peerId,
                data: msg.data
              }));
              break;
            }
          }
        } else {
          // Otherwise broadcast to other members in the room
          const targets = ws.isHost ? room.viewers : [room.host];
          targets.forEach((target) => {
            if (target && target !== ws && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({
                type: 'signal',
                senderPeerId: ws.peerId,
                data: msg.data
              }));
            }
          });
        }
        break;
      }

      // Hybrid Cloud Relay: Forward control commands and clipboard when WebRTC direct link is blocked
      case 'relay-message': {
        if (!ws.roomCode || !rooms.has(ws.roomCode)) return;
        const room = rooms.get(ws.roomCode);
        const targets = ws.isHost ? room.viewers : (room.host ? [room.host] : []);
        targets.forEach((target) => {
          if (target && target !== ws && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({
              type: 'relayed-message',
              senderPeerId: ws.peerId,
              payload: msg.payload
            }));
          }
        });

        // Forward to PC Native Helper if active in this room
        if (room.helper && room.helper !== ws && room.helper.readyState === WebSocket.OPEN) {
          room.helper.send(JSON.stringify(msg.payload));
        }
        break;
      }

      // Cloud-Connected PC Helper Registration
      case 'register-helper': {
        const code = msg.roomCode ? String(msg.roomCode).trim().toLowerCase() : null;
        if (!code || !rooms.has(code)) {
          return ws.send(JSON.stringify({ type: 'error', message: `Room [${code}] not found or host is offline.` }));
        }
        const room = rooms.get(code);
        room.helper = ws;
        ws.isHelper = true;
        ws.roomCode = code;

        console.log(`[Helper] PC Helper registered for room ${code}`);
        ws.send(JSON.stringify({
          type: 'helper-registered',
          code,
          message: 'Connected to RemoteLink session as PC Native Agent.'
        }));

        // Broadcast to host and viewers that PC Agent is active
        const targets = [room.host, ...room.viewers].filter(Boolean);
        targets.forEach((target) => {
          if (target && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({
              type: 'helper-status',
              status: 'active',
              platform: msg.platform || 'win32'
            }));
          }
        });
        break;
      }

      // Hybrid Cloud Relay: Forward screen frames across cellular CGNAT networks
      case 'screen-frame': {
        if (!ws.roomCode || !rooms.has(ws.roomCode) || !ws.isHost) return;
        const room = rooms.get(ws.roomCode);
        room.viewers.forEach((viewer) => {
          if (viewer && viewer.readyState === WebSocket.OPEN) {
            viewer.send(JSON.stringify({
              type: 'screen-frame',
              senderPeerId: ws.peerId,
              frame: msg.frame
            }));
          }
        });
        break;
      }

      // Hybrid Cloud Relay: Forward file chunks across cellular CGNAT networks
      case 'relay-file-chunk': {
        if (!ws.roomCode || !rooms.has(ws.roomCode)) return;
        const room = rooms.get(ws.roomCode);
        const targets = ws.isHost ? room.viewers : (room.host ? [room.host] : []);
        targets.forEach((target) => {
          if (target && target !== ws && target.readyState === WebSocket.OPEN) {
            target.send(JSON.stringify({
              type: 'relayed-file-chunk',
              senderPeerId: ws.peerId,
              chunk: msg.chunk,
              meta: msg.meta
            }));
          }
        });
        break;
      }

      case 'leave-room': {
        if (ws.roomCode && rooms.has(ws.roomCode)) {
          const room = rooms.get(ws.roomCode);
          if (ws.isHost) {
            room.viewers.forEach((viewer) => {
              if (viewer.readyState === WebSocket.OPEN) {
                viewer.send(JSON.stringify({ type: 'host-disconnected' }));
              }
            });
            if (room.helper && room.helper.readyState === WebSocket.OPEN) {
              room.helper.send(JSON.stringify({ type: 'host-disconnected' }));
            }
            rooms.delete(ws.roomCode);
          } else {
            room.viewers = room.viewers.filter((v) => v !== ws);
            if (room.host && room.host.readyState === WebSocket.OPEN) {
              room.host.send(JSON.stringify({ type: 'peer-disconnected', peerId: ws.peerId, viewerCount: room.viewers.length }));
            }
          }
          ws.roomCode = null;
          ws.isHost = false;
        }
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      const room = rooms.get(ws.roomCode);
      if (ws.isHelper) {
        if (room.helper === ws) {
          room.helper = null;
          const targets = [room.host, ...room.viewers].filter(Boolean);
          targets.forEach((target) => {
            if (target && target.readyState === WebSocket.OPEN) {
              target.send(JSON.stringify({ type: 'helper-status', status: 'inactive' }));
            }
          });
        }
        return;
      }

      if (ws.isHost) {
        // Host disconnected: notify all viewers and remove room
        room.viewers.forEach((viewer) => {
          if (viewer.readyState === WebSocket.OPEN) {
            viewer.send(JSON.stringify({ type: 'host-disconnected' }));
          }
        });
        if (room.helper && room.helper.readyState === WebSocket.OPEN) {
          room.helper.send(JSON.stringify({ type: 'host-disconnected' }));
        }
        rooms.delete(ws.roomCode);
      } else {
        // Viewer disconnected: remove from viewers and notify host
        room.viewers = room.viewers.filter((v) => v !== ws);
        if (room.host && room.host.readyState === WebSocket.OPEN) {
          room.host.send(JSON.stringify({ type: 'peer-disconnected', peerId: ws.peerId, viewerCount: room.viewers.length }));
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('====================================================');
  console.log(`🚀 RemoteLink Server active on port ${PORT}`);
  console.log(`🔄 TURN Relay Server active on port ${TURN_PORT}`);
  console.log(`💻 PC / Local: http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach((ip) => {
      console.log(`📱 Mobile/LAN: http://${ip}:${PORT}`);
    });
  }
  console.log('====================================================');
});

module.exports = { server, wss, turnServer };
