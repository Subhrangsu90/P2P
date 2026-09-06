/**
 * Minimal WebRTC Signaling Server
 * ---------------------------------
 * Purpose: introduces two devices (phone + PC) to each other so they can
 * establish a direct peer-to-peer WebRTC connection. Once connected,
 * actual screen/control/file data never touches this server — it only
 * relays the initial handshake (offer/answer/ICE candidates).
 *
 * Pairing model: simple "room code" — both devices join the same room
 * using a shared code (generated on one device, entered on the other).
 * Only 2 devices are allowed per room.
 */

const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = process.env.PORT || 8080;

// In-memory room table: { roomCode: [ws1, ws2] }
const rooms = new Map();

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4 and not internal loopback
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  // Normalize URL
  const reqUrl = req.url.split('?')[0];

  if (reqUrl === '/' || reqUrl === '/index.html') {
    const indexPath = path.join(__dirname, 'index.html');
    fs.readFile(indexPath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    });
    return;
  }

  // Health check endpoint
  if (reqUrl === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', activeRooms: rooms.size }));
    return;
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

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
      // Device A creates a new room
      case 'create-room': {
        const code = generateRoomCode();
        rooms.set(code, [ws]);
        ws.roomCode = code;
        ws.send(JSON.stringify({ type: 'room-created', code }));
        break;
      }

      // Device B joins room using the code from Device A
      case 'join-room': {
        const peers = rooms.get(msg.code);
        if (!peers) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        }
        if (peers.length >= 2) {
          return ws.send(JSON.stringify({ type: 'error', message: 'Room is full (max 2 devices)' }));
        }
        peers.push(ws);
        ws.roomCode = msg.code;

        // Notify both peers that pairing succeeded
        peers.forEach((peer) => peer.send(JSON.stringify({ type: 'paired', code: msg.code })));
        break;
      }

      // Relay WebRTC handshake data (offer, answer, ICE candidates)
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
  console.log(`🚀 Signaling & Web Server is running on port ${PORT}`);
  console.log(`💻 Local:   http://localhost:${PORT}`);
  if (ips.length > 0) {
    ips.forEach((ip) => {
      console.log(`📱 Network: http://${ip}:${PORT}  (Open this on your phone)`);
    });
  }
  console.log('====================================================');
});

