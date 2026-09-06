/**
 * RemoteLink Client — Main Entry Point (Vite / ES Module Bundle)
 */

import '../css/style.css';
import './app.js';
import './webrtc.js';
import './remote-control.js';
import './file-explorer.js';

// Register Service Worker for PWA
if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[SW] Registration notice:', err);
    });
  });
}
