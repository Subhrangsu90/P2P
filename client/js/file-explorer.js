/**
 * RemoteLink Client — File Transfer & Interactive File Explorer Hub
 * -----------------------------------------------------------------
 * Replaces direct auto-download with an interactive Received Files Explorer:
 *  - Interactive file gallery with icons, sizes, and timestamps
 *  - In-browser file preview (images, text/code, audio, video, pdf)
 *  - Native "Save As..." via File System Access API (showSaveFilePicker)
 *  - Native Windows File Explorer integration via PC Helper ("Reveal in Explorer", "Open File")
 *  - Drag & drop multi-file sender with backpressure flow control
 */

const CHUNK_SIZE = 16 * 1024; // 16 KB WebRTC data channel chunk

// State
let receivedFiles = [];
let incomingFileMeta = null;
let incomingChunks = [];
let incomingReceivedBytes = 0;
let transferStartTime = 0;

// DOM Elements
const dropzone = document.getElementById('dropzone');
const filePicker = document.getElementById('filePicker');
const transferProgressCard = document.getElementById('transferProgressCard');
const progressFileName = document.getElementById('progressFileName');
const progressFill = document.getElementById('progressFill');
const progressPercent = document.getElementById('progressPercent');
const progressSpeed = document.getElementById('progressSpeed');
const filesList = document.getElementById('filesList');
const openDownloadsFolderBtn = document.getElementById('openDownloadsFolderBtn');

// Preview Modal Elements
const previewModal = document.getElementById('previewModal');
const previewModalTitle = document.getElementById('previewModalTitle');
const previewModalBody = document.getElementById('previewModalBody');
const previewCloseBtn = document.getElementById('previewCloseBtn');

// Helper for file type icons
function getFileIcon(fileName, mimeType = '') {
  const ext = fileName.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext) || mimeType.startsWith('image/')) return '🖼️';
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext) || mimeType.startsWith('video/')) return '🎬';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext) || mimeType.startsWith('audio/')) return '🎵';
  if (['pdf'].includes(ext) || mimeType === 'application/pdf') return '📕';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return '📦';
  if (['js', 'ts', 'html', 'css', 'json', 'py', 'cs', 'cpp', 'java', 'xml', 'md'].includes(ext)) return '💻';
  if (['txt', 'log', 'csv'].includes(ext) || mimeType.startsWith('text/')) return '📄';
  if (['doc', 'docx'].includes(ext)) return '📘';
  if (['xls', 'xlsx'].includes(ext)) return '📊';
  if (['ppt', 'pptx'].includes(ext)) return '📙';
  return '📁';
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ------------------------------------------
// Sending Files (with Flow Control)
// ------------------------------------------
dropzone?.addEventListener('click', () => filePicker.click());
filePicker?.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    sendFilesQueue(Array.from(e.target.files));
  }
});

dropzone?.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});
dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    sendFilesQueue(Array.from(e.dataTransfer.files));
  }
});

async function sendFilesQueue(files) {
  for (const file of files) {
    await sendSingleFile(file);
  }
}

async function sendSingleFile(file) {
  if (!window.appState.localPermissions.fileTransfer) {
    return window.showToast('File transfer is disabled in your Privacy Settings.', 'warning');
  }
  if (!window.appState.remotePermissions.fileTransfer) {
    return window.showToast('Remote peer has disabled incoming file transfers.', 'warning');
  }

  const dc = window.getDataChannel();
  if (!dc || dc.readyState !== 'open') {
    return window.showToast('P2P Connection not open yet.', 'error');
  }

  window.showToast(`📤 Sending ${file.name}...`, 'file');
  showProgress(`Sending: ${file.name} (${formatBytes(file.size)})`);

  window.sendControlMessage({
    type: 'file-meta',
    name: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream'
  });

  const buffer = await file.arrayBuffer();
  let offset = 0;
  transferStartTime = Date.now();

  dc.bufferedAmountLowThreshold = 64 * 1024; // 64KB threshold

  return new Promise((resolve) => {
    function sendChunks() {
      while (offset < buffer.byteLength) {
        if (dc.bufferedAmount > 256 * 1024) {
          // Pause and wait for buffer drain
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            sendChunks();
          };
          return;
        }

        const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
        dc.send(chunk);
        offset += chunk.byteLength;

        const pct = Math.round((offset / buffer.byteLength) * 100);
        updateProgress(pct, offset, buffer.byteLength);
      }

      window.sendControlMessage({ type: 'file-end' });
      hideProgress();
      window.showToast(`✅ Sent: ${file.name}`, 'success');
      resolve();
    }

    sendChunks();
  });
}

// ------------------------------------------
// Receiving Files (No Direct Download)
// ------------------------------------------
function handleIncomingFileMeta(meta) {
  if (!window.appState.localPermissions.fileTransfer) {
    window.sendControlMessage({
      type: 'file-cancel',
      reason: 'Recipient has disabled file transfers.'
    });
    window.showToast(`🛡️ Blocked file: "${meta.name}" (Privacy toggle OFF)`, 'warning');
    return;
  }

  incomingFileMeta = meta;
  incomingChunks = [];
  incomingReceivedBytes = 0;
  transferStartTime = Date.now();

  showProgress(`Receiving: ${meta.name} (${formatBytes(meta.size)})`);
}

function handleIncomingFileChunk(chunk) {
  if (!incomingFileMeta) return;

  incomingChunks.push(chunk);
  incomingReceivedBytes += chunk.byteLength;

  if (incomingFileMeta.size > 0) {
    const pct = Math.round((incomingReceivedBytes / incomingFileMeta.size) * 100);
    updateProgress(pct, incomingReceivedBytes, incomingFileMeta.size);
  }
}

function handleIncomingFileEnd() {
  if (!incomingFileMeta) return;

  const blob = new Blob(incomingChunks, {
    type: incomingFileMeta.mimeType || 'application/octet-stream'
  });
  const url = URL.createObjectURL(blob);

  const fileEntry = {
    id: 'f_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    name: incomingFileMeta.name,
    size: incomingFileMeta.size,
    mimeType: incomingFileMeta.mimeType || blob.type,
    blob: blob,
    url: url,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    savedPath: null
  };

  receivedFiles.unshift(fileEntry);
  renderReceivedFiles();

  // If local PC Helper is active, save silently to Downloads folder so user has local file path
  if (window.sendHelperMessage) {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      window.sendHelperMessage({
        type: 'save-file',
        name: fileEntry.name,
        data: base64
      });
    };
    reader.readAsDataURL(blob);
  }

  hideProgress();
  window.showToast(`📁 File received: ${fileEntry.name}`, 'file');

  incomingFileMeta = null;
  incomingChunks = [];
}

function handleIncomingFileCancel(reason) {
  hideProgress();
  window.showToast(`❌ Transfer cancelled: ${reason || 'Remote peer cancelled'}`, 'warning');
  incomingFileMeta = null;
  incomingChunks = [];
}

// ------------------------------------------
// Received Files Explorer Rendering
// ------------------------------------------
function renderReceivedFiles() {
  if (!filesList) return;

  if (receivedFiles.length === 0) {
    filesList.innerHTML = `
      <div class="empty-explorer">
        <span class="empty-explorer-icon">📂</span>
        <span>No files received yet. Drag & drop above to transfer peer-to-peer.</span>
      </div>
    `;
    return;
  }

  filesList.innerHTML = '';

  receivedFiles.forEach((file) => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.id = file.id;

    const icon = getFileIcon(file.name, file.mimeType);

    item.innerHTML = `
      <div class="file-info">
        <span class="file-icon">${icon}</span>
        <div class="file-meta">
          <span class="file-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
          <span class="file-sub">
            <span>${formatBytes(file.size)}</span>
            <span>•</span>
            <span>${file.timestamp}</span>
            ${file.savedPath ? `<span style="color: var(--emerald);">• Saved to PC</span>` : ''}
          </span>
        </div>
      </div>
      <div class="file-actions">
        <button class="btn btn-secondary btn-sm" onclick="previewFile('${file.id}')" title="Preview file in browser">
          👁️ Preview
        </button>
        <button class="btn btn-primary btn-sm" onclick="saveFileAs('${file.id}')" title="Save file to chosen folder">
          💾 Save As...
        </button>
        ${file.savedPath ? `
          <button class="btn btn-emerald btn-sm" onclick="revealInExplorer('${file.id}')" title="Highlight in Windows Explorer">
            📂 Reveal in Explorer
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openFileNative('${file.id}')" title="Open with default Windows app">
            ⚡ Open
          </button>
        ` : ''}
      </div>
    `;

    filesList.appendChild(item);
  });
}

// ------------------------------------------
// File Actions: Preview, Save As, Explorer
// ------------------------------------------

// 1. Preview Modal
window.previewFile = function(fileId) {
  const file = receivedFiles.find((f) => f.id === fileId);
  if (!file) return;

  previewModalTitle.textContent = `Preview: ${file.name}`;
  previewModalBody.innerHTML = '';

  const ext = file.name.split('.').pop().toLowerCase();
  const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext) || file.mimeType.startsWith('image/');
  const isVideo = ['mp4', 'webm', 'mov'].includes(ext) || file.mimeType.startsWith('video/');
  const isAudio = ['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || file.mimeType.startsWith('audio/');
  const isText = ['txt', 'json', 'js', 'ts', 'html', 'css', 'md', 'csv', 'log', 'py', 'cs'].includes(ext) || file.mimeType.startsWith('text/');

  if (isImage) {
    const img = document.createElement('img');
    img.src = file.url;
    img.className = 'modal-preview-media';
    previewModalBody.appendChild(img);
  } else if (isVideo) {
    const video = document.createElement('video');
    video.src = file.url;
    video.controls = true;
    video.autoplay = true;
    video.className = 'modal-preview-media';
    previewModalBody.appendChild(video);
  } else if (isAudio) {
    const audio = document.createElement('audio');
    audio.src = file.url;
    audio.controls = true;
    audio.autoplay = true;
    previewModalBody.appendChild(audio);
  } else if (isText) {
    const reader = new FileReader();
    reader.onload = () => {
      const pre = document.createElement('pre');
      pre.className = 'modal-preview-text';
      pre.textContent = reader.result;
      previewModalBody.appendChild(pre);
    };
    reader.readAsText(file.blob);
  } else if (ext === 'pdf' || file.mimeType === 'application/pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = file.url;
    iframe.style.width = '100%';
    iframe.style.height = '60vh';
    iframe.style.borderRadius = '8px';
    previewModalBody.appendChild(iframe);
  } else {
    previewModalBody.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <span style="font-size: 3rem;">${getFileIcon(file.name, file.mimeType)}</span>
        <p style="margin-top: 12px; color: var(--text-muted);">
          Direct preview is not supported for this file format.<br>Use <b>Save As...</b> or <b>Reveal in Explorer</b> to view on your device.
        </p>
      </div>
    `;
  }

  previewModal.classList.add('active');
};

previewCloseBtn?.addEventListener('click', () => {
  previewModal.classList.remove('active');
  previewModalBody.innerHTML = '';
});

// 2. Save As Dialog (Uses modern window.showSaveFilePicker if supported)
window.saveFileAs = async function(fileId) {
  const file = receivedFiles.find((f) => f.id === fileId);
  if (!file) return;

  // Modern Native File System Access API
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: file.name
      });
      const writable = await handle.createWritable();
      await writable.write(file.blob);
      await writable.close();
      window.showToast(`Saved to selected folder!`, 'success');
      return;
    } catch (err) {
      if (err.name === 'AbortError') return; // User cancelled dialog
      console.warn('showSaveFilePicker fallback:', err);
    }
  }

  // Standard manual download fallback
  const a = document.createElement('a');
  a.href = file.url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.showToast(`Downloading: ${file.name}`, 'file');
};

// 3. Reveal in Windows Explorer
window.revealInExplorer = function(fileId) {
  const file = receivedFiles.find((f) => f.id === fileId);
  if (file && file.savedPath && window.sendHelperMessage) {
    window.sendHelperMessage({
      type: 'reveal-in-explorer',
      path: file.savedPath
    });
    window.showToast('Opened Windows File Explorer', 'success');
  }
};

// 4. Open with Default Windows App
window.openFileNative = function(fileId) {
  const file = receivedFiles.find((f) => f.id === fileId);
  if (file && file.savedPath && window.sendHelperMessage) {
    window.sendHelperMessage({
      type: 'open-file',
      path: file.savedPath
    });
    window.showToast(`Opening ${file.name}...`, 'success');
  }
};

// 5. Open Downloads Folder button
openDownloadsFolderBtn?.addEventListener('click', () => {
  if (window.sendHelperMessage) {
    window.sendHelperMessage({ type: 'open-downloads-folder' });
    window.showToast('Opening Downloads Folder...', 'info');
  } else {
    window.showToast('PC Helper not connected.', 'warning');
  }
});

// PC Helper notification of saved file
window.onHelperFileSaved = function(msg) {
  // Find matching file and update savedPath
  const target = receivedFiles.find((f) => f.name === msg.name || f.size === msg.size);
  if (target) {
    target.savedPath = msg.path;
    renderReceivedFiles();
  }
};

// ------------------------------------------
// Progress Bar Helpers
// ------------------------------------------
function showProgress(title) {
  if (!transferProgressCard) return;
  progressFileName.textContent = title;
  progressFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressSpeed.textContent = 'Calculating...';
  transferProgressCard.style.display = 'flex';
}

function updateProgress(pct, currentBytes, totalBytes) {
  if (!transferProgressCard) return;
  progressFill.style.width = `${pct}%`;
  progressPercent.textContent = `${pct}%`;

  const elapsedSec = (Date.now() - transferStartTime) / 1000;
  if (elapsedSec > 0.3) {
    const bytesPerSec = currentBytes / elapsedSec;
    progressSpeed.textContent = `${formatBytes(bytesPerSec)}/s`;
  }
}

function hideProgress() {
  setTimeout(() => {
    if (transferProgressCard) {
      transferProgressCard.style.display = 'none';
    }
  }, 1200);
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

document.addEventListener('DOMContentLoaded', () => {
  renderReceivedFiles();
});

window.handleIncomingFileMeta = handleIncomingFileMeta;
window.handleIncomingFileChunk = handleIncomingFileChunk;
window.handleIncomingFileEnd = handleIncomingFileEnd;
window.handleIncomingFileCancel = handleIncomingFileCancel;
