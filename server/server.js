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

// In-memory room table: { roomCode: [ws1, ws2] }
const rooms = new Map();

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

const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];

  // Dynamic ICE config endpoint
  if (reqUrl === '/ice-config') {
    const host = req.headers.host?.split(':')[0] || 'localhost';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: [
            `turn:${host}:${TURN_PORT}`,
            `turn:${host}:${TURN_PORT}?transport=tcp`
          ],
          username: TURN_USERNAME,
          credential: TURN_CREDENTIAL
        }
      ],
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

function generateRoomCode() {
  return crypto.randomBytes(3).toString('hex'); // e.g. "a1b2c3"
}

wss.on('connection', (ws) => {
  ws.roomCode = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    }

    switch (msg.type) {
      // Device creates a new room
      case 'create-room': {
        const code = generateRoomCode();
        rooms.set(code, [ws]);
        ws.roomCode = code;
        ws.send(JSON.stringify({ type: 'room-created', code }));
        break;
      }

      // Device joins room using code
      case 'join-room': {
        const peers = rooms.get(msg.code);
        if (!peers) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room not found. Check code.' }));
        }
        if (peers.length >= 2) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room is full (maximum 2 devices).' }));
        }
        peers.push(ws);
        ws.roomCode = msg.code;

        // Notify both peers of pairing
        peers.forEach((peer) => peer.send(JSON.stringify({ type: 'paired', code: msg.code })));
        break;
      }

      // Relay WebRTC handshake (offer, answer, ICE candidates)
      case 'signal': {
        const peers = rooms.get(ws.roomCode) || [];
        peers
          .filter((peer) => peer !== ws && peer.readyState === WebSocket.OPEN)
          .forEach((peer) => peer.send(JSON.stringify({ type: 'signal', data: msg.data })));
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  });

  ws.on('close', () => {
    if (ws.roomCode && rooms.has(ws.roomCode)) {
      const peers = rooms.get(ws.roomCode).filter((peer) => peer !== ws);
      if (peers.length === 0) {
        rooms.delete(ws.roomCode);
      } else {
        rooms.set(ws.roomCode, peers);
        peers.forEach((peer) => peer.send(JSON.stringify({ type: 'peer-disconnected' })));
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
