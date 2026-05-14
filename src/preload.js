const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge between main process and renderer.
 * Exposes both IPC listeners and action triggers for mouse controls.
 */
contextBridge.exposeInMainWorld('examAPI', {
  // === Listeners (main → renderer) ===
  onAnswer: (callback) => {
    ipcRenderer.on('answer', (_event, data) => callback(data));
  },
  onStatus: (callback) => {
    ipcRenderer.on('status', (_event, status) => callback(status));
  },

  onScreenshotAdded: (callback) => {
    ipcRenderer.on('screenshot-added', (_event, count) => callback(count));
  },

  // === Actions (renderer → main, triggered by mouse clicks) ===
  requestCapture: () => {
    ipcRenderer.send('request-capture');
  },
  requestSendAll: () => {
    ipcRenderer.send('request-send-all');
  },
  requestClearQueue: () => {
    ipcRenderer.send('request-clear-queue');
  },
  requestInteractiveMode: () => {
    ipcRenderer.send('request-interactive-mode');
  },
  requestHide: () => {
    ipcRenderer.send('request-hide');
  },
  requestQuit: () => {
    ipcRenderer.send('request-quit');
  },
  requestClickThrough: () => {
    ipcRenderer.send('request-clickthrough');
  },
  setIgnoreMouseEvents: (ignore, options) => {
    ipcRenderer.send('set-ignore-mouse-events', ignore, options);
  }
});
