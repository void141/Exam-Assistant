const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { captureScreen } = require('./services/screenshot');
const aiService = require('./services/ai');
const coordinator = require('./services/coordinator');
const ocrService = require('./services/ocr');

let overlayWindow = null;
let tray = null;
let isClickThrough = true;
let isVisible = true;
let isQuitting = false;
let useOCR = true; // NEW: Control the hybrid pipeline
let screenshotQueue = [];

/**
 * Create the invisible overlay window.
 * This window is visible on the physical monitor but INVISIBLE to screen capture.
 */
function createOverlay() {
  ocrService.init();
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  // HIDDEN PARENT TRICK: On Windows, the most reliable way to hide from the taskbar
  // is to create a tiny, hidden parent window.
  const parentWindow = new BrowserWindow({
    show: false,
    skipTaskbar: true,
    frame: false,
    width: 0,
    height: 0,
    focusable: false
  });

  overlayWindow = new BrowserWindow({
    width: 420,
    height: 520,
    x: width - 440,       // Position at right edge
    y: height - 540,      // Position at bottom edge
    parent: parentWindow,  // Set the hidden window as parent
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    resizable: false,
    focusable: false,      // Don't steal focus from the exam
    type: 'toolbar',       // Extra stealth on Windows
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // ===== THE MAGIC LINE =====
  // This makes the window INVISIBLE to all screen capture software
  // Note: On Windows, this prevents the window from being captured by most screen sharing apps.
  overlayWindow.setContentProtection(true);

  // Start in click-through mode so user can interact with exam
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  // Keep it always on top at the screen-saver level (highest possible)
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');

  // Load the overlay UI
  overlayWindow.loadFile(path.join(__dirname, 'overlay', 'index.html'));

  // Prevent the window from being closed accidentally (unless quitting)
  overlayWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
    }
  });

  // Re-apply protection every time it's shown, just in case the OS resets it
  overlayWindow.on('show', () => {
    overlayWindow.setContentProtection(true);
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  });
}

/**
 * Register global hotkeys that work even when the app is not focused.
 */
function registerHotkeys() {
  // Ctrl+Shift+S — Capture screenshot and add to queue
  const s1 = globalShortcut.register('CommandOrControl+Shift+S', async () => {
    if (!overlayWindow) return;

    try {
      // Ensure window is shown before capture logic
      if (!isVisible) {
        overlayWindow.show();
        isVisible = true;
      }

      overlayWindow.webContents.send('status', 'capturing');

      // Use Opacity 0 instead of hide() to keep the window state stable
      overlayWindow.setOpacity(0.0);
      await new Promise(resolve => setTimeout(resolve, 300));

      const screenshot = await captureScreen();

      overlayWindow.setOpacity(1.0);
      screenshotQueue.push(screenshot);
      overlayWindow.webContents.send('screenshot-added', screenshotQueue.length);
      overlayWindow.webContents.send('status', 'ready');

    } catch (error) {
      console.error('Capture error:', error);
      overlayWindow.setOpacity(1.0);
      overlayWindow.webContents.send('answer', `❌ Error: ${error.message}`);
      overlayWindow.webContents.send('status', 'error');
    }
  });
  console.log(`  Ctrl+Shift+S registered: ${s1}`);

  // Ctrl+Shift+H — Toggle overlay visibility
  const s2 = globalShortcut.register('CommandOrControl+Shift+H', () => {
    toggleVisibility();
  });
  console.log(`  Ctrl+Shift+H registered: ${s2}`);

  // Ctrl+Shift+M — Toggle Mouse Mode (Interactive vs Click-through)
  const s3 = globalShortcut.register('CommandOrControl+Shift+M', () => {
    isClickThrough = !isClickThrough;
    toggleMouseMode(!isClickThrough);
  });
  console.log(`  Ctrl+Shift+M registered: ${s3}`);

  // Ctrl+Shift+X — Quit the app
  const s4 = globalShortcut.register('CommandOrControl+Shift+X', () => {
    console.log('Quit hotkey pressed — exiting...');
    isQuitting = true;
    globalShortcut.unregisterAll();
    if (overlayWindow) {
      overlayWindow.destroy();
    }
    app.quit();
    // Fallback in case app.quit doesn't exit
    setTimeout(() => process.exit(0), 1000);
  });
  console.log(`  Ctrl+Shift+X registered: ${s4}`);
}

/**
 * Create the System Tray icon and menu (the 'arrow mark' area).
 */
function createTray() {
  // Create a simple 16x16 blue circle icon using a Data URL (no external file needed)
  const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMUlEQVR42mP8/5+hnoGBAUYis6mpqfHKlSszEAnGqVOnYmD4//8/AyWAmU6m0O8EALp6M1EisA0TAAAAAElFTkSuQmCC');
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Exam Assistant', enabled: false },
    { type: 'separator' },
    { label: '📸 Capture (Add to Queue)', click: () => {
      // Trigger capture via IPC simulate
      ipcMain.emit('request-capture');
    }},
    { label: '🚀 Send to AI', click: () => {
      ipcMain.emit('request-send-all');
    }},
    { type: 'separator' },
    { label: '🖱️ Enable Mouse Mode', type: 'checkbox', checked: !isClickThrough, click: (item) => {
      isClickThrough = !item.checked;
      toggleMouseMode(!isClickThrough);
    }},
    { label: '👁️ Hide/Show Overlay', click: () => {
      toggleVisibility();
    }},
    { type: 'separator' },
    { label: '❌ Quit', click: () => {
      isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setToolTip('Exam Assistant');
  tray.setContextMenu(contextMenu);

  // Single click on tray icon toggles visibility
  tray.on('click', () => {
    toggleVisibility();
  });
}

/**
 * Helper to toggle Mouse Mode consistently
 */
function toggleMouseMode(interactive) {
  if (!overlayWindow) return;
  
  isClickThrough = !interactive;

  if (isClickThrough) {
    overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    overlayWindow.setFocusable(false);
    overlayWindow.webContents.send('status', 'click-through');
  } else {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setFocusable(true);
    overlayWindow.show();
    overlayWindow.webContents.send('status', 'interactive');
  }
  
  // Re-create tray menu to update checkmark (since getContextMenu is not a function)
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Exam Assistant', enabled: false },
      { type: 'separator' },
      { label: '📸 Capture (Add to Queue)', click: () => ipcMain.emit('request-capture') },
      { label: '🚀 Send to AI', click: () => ipcMain.emit('request-send-all') },
      { type: 'separator' },
      { label: '🖱️ Enable Mouse Mode', type: 'checkbox', checked: interactive, click: (item) => {
        toggleMouseMode(item.checked);
      }},
      { label: '👁️ Hide/Show Overlay', click: () => toggleVisibility() },
      { type: 'separator' },
      { label: '❌ Quit', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
  }
}

/**
 * Helper to toggle visibility consistently
 */
function toggleVisibility() {
  if (!overlayWindow) return;
  if (isVisible) {
    overlayWindow.hide();
    isVisible = false;
  } else {
    overlayWindow.show();
    isVisible = true;
  }
}

/**
 * App lifecycle
 */
app.whenReady().then(() => {
  // Initialize Gemini AI
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: GEMINI_API_KEY not found in .env file!');
    app.quit();
    return;
  }
  aiService.init(apiKey);

  // Create the overlay
  createOverlay();
  
  // Create System Tray
  createTray();

  // Register hotkeys
  registerHotkeys();

  // Handle smart click-through (ignore mouse events except when over UI)
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setIgnoreMouseEvents(ignore, options);
    }
  });

  // Handle capture requests from renderer (mouse button)
  ipcMain.on('request-capture', async () => {
    if (!overlayWindow) return;

    try {
      overlayWindow.webContents.send('status', 'capturing');
      overlayWindow.setOpacity(0.0);
      await new Promise(resolve => setTimeout(resolve, 300));

      const screenshot = await captureScreen();
      overlayWindow.setOpacity(1.0);
      
      screenshotQueue.push(screenshot);
      overlayWindow.webContents.send('screenshot-added', screenshotQueue.length);
      overlayWindow.webContents.send('status', 'ready');
    } catch (error) {
      overlayWindow.setOpacity(1.0);
      overlayWindow.webContents.send('answer', `❌ Error: ${error.message}`);
      overlayWindow.webContents.send('status', 'error');
    }
  });

  // Handle send-all request from renderer
  ipcMain.on('request-send-all', async () => {
    if (screenshotQueue.length === 0) return;

    try {
      overlayWindow.webContents.send('status', 'thinking');
      
      let answer = "";
      if (useOCR) {
        console.log("🚀 Using Hybrid OCR Pipeline...");
        try {
          // Process the first screenshot in the queue for hybrid OCR
          const results = await coordinator.processScreenshot(screenshotQueue[0]);
          
          // Execute AI requests for each result part
          for (const res of results) {
            const partAnswer = await aiService.ask(res.promptPrefix + " Solve this exam question.", res.payload);
            answer += partAnswer + "\n\n";
          }
        } catch (ocrError) {
          console.warn("OCR Pipeline failed, falling back to full vision:", ocrError.message);
          answer = await aiService.ask("Solve these exam questions based on the images.", { type: 'vision', images: screenshotQueue });
        }
      } else {
        answer = await aiService.ask("Solve these exam questions based on the images.", { type: 'vision', images: screenshotQueue });
      }

      overlayWindow.webContents.send('answer', answer);
      overlayWindow.webContents.send('status', 'ready');
      // Clear queue after sending
      screenshotQueue = [];
      overlayWindow.webContents.send('screenshot-added', 0);
    } catch (error) {
      overlayWindow.webContents.send('answer', `❌ Error: ${error.message}`);
      overlayWindow.webContents.send('status', 'error');
    }
  });

  // Handle clear queue request
  ipcMain.on('request-clear-queue', () => {
    screenshotQueue = [];
    overlayWindow.webContents.send('screenshot-added', 0);
  });

  // Handle request for interactive mode from click-through badge
  ipcMain.on('request-interactive-mode', () => {
    toggleMouseMode(true);
  });

  // Handle hide request from renderer (mouse button)
  ipcMain.on('request-hide', () => {
    toggleVisibility();
  });

  // Handle quit request from renderer (mouse button)
  ipcMain.on('request-quit', () => {
    console.log('Quit requested via mouse button — exiting...');
    isQuitting = true;
    globalShortcut.unregisterAll();
    if (overlayWindow) {
      overlayWindow.destroy();
    }
    app.quit();
    setTimeout(() => process.exit(0), 1000);
  });

  // Handle click-through toggle from renderer (mouse button)
  ipcMain.on('request-clickthrough', () => {
    toggleMouseMode(false);
  });

  console.log('✅ Exam Assistant running. Overlay is invisible to screen capture.');
  console.log('Hotkeys:');
  console.log('  Ctrl+Shift+S  →  Capture screenshot (added to queue)');
  console.log('  Ctrl+Shift+H  →  Toggle Visibility');
  console.log('  Ctrl+Shift+M  →  Mouse Mode (shows toolbar)');
  console.log('  Ctrl+Shift+X  →  Quit');
});

app.on('will-quit', () => {
  ocrService.stop();
  globalShortcut.unregisterAll();
});

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}
