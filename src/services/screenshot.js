const { desktopCapturer } = require('electron');

/**
 * Captures the primary screen and returns it as a Base64-encoded PNG string.
 * @returns {Promise<string>} Base64-encoded screenshot (without data URI prefix)
 */
async function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 1920, height: 1080 }
  });

  if (!sources || sources.length === 0) {
    throw new Error('No screen sources found');
  }

  // Use the primary display
  const primarySource = sources[0];
  const screenshot = primarySource.thumbnail;

  // Convert NativeImage to Base64 PNG
  const base64 = screenshot.toPNG().toString('base64');
  return base64;
}

module.exports = { captureScreen };
