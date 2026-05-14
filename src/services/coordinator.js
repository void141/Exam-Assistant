const { analyzeHybridPayloads } = require('./ai');
const ocrService = require('./ocr');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Hybrid Coordinator — Optimized with Persistent Worker & Absolute Paths.
 */

async function processScreenshotsHybrid(base64Screenshots) {
  const results = [];
  
  for (const base64 of base64Screenshots) {
    // 1. Save temp image for OCR (Using Absolute Temp Path)
    const tempPath = path.join(os.tmpdir(), `exam_capture_${Date.now()}.png`);
    const buffer = Buffer.from(base64, 'base64');
    fs.writeFileSync(tempPath, buffer);

    let ocrResult;
    try {
      // 2. Run Fast OCR via Persistent Worker
      ocrResult = await ocrService.runOCR(tempPath);
      const confidence = ocrResult.confidence || 0;
      const text = ocrResult.text || "";
      const cropPath = ocrResult.crop_path;

      console.log(`✅ OCR Confidence: ${(confidence * 100).toFixed(1)}%`);

      let payload;
      let promptPrefix = "";
      let cropBase64 = null;

      // Read crop image if it exists
      if (cropPath && confidence <= 0.90) {
        if (fs.existsSync(cropPath)) {
          cropBase64 = fs.readFileSync(cropPath, { encoding: 'base64' });
        }
      }

      // FALLBACK: If we need an image but the crop failed, use the full screenshot
      if (!cropBase64 && confidence <= 0.90) {
        console.log("⚠️ [PIPELINE] No crop found, falling back to full screenshot.");
        cropBase64 = fs.readFileSync(tempPath, { encoding: 'base64' });
      }

      // 3. ROUTING LOGIC
      if (confidence > 0.90) {
        // HIGH CONFIDENCE: Send text only (CHEAPEST)
        console.log("-------------------------------------------");
        console.log("🚀 [PIPELINE] ROUTE: TEXT-ONLY");
        console.log(`✅ [CONFIDENCE]: ${(confidence * 100).toFixed(1)}%`);
        console.log("💰 [SAVINGS]: Maximum (Zero Ingress Image Tokens)");
        console.log("-------------------------------------------");
        payload = { type: 'text', content: text };
      } 
      else if (confidence > 0.60) {
        // MEDIUM CONFIDENCE: Send text + compressed image (OPTIMIZED HYBRID)
        console.log("-------------------------------------------");
        console.log("🚀 [PIPELINE] ROUTE: HYBRID (Text + Compressed Crop)");
        console.log(`⚖️ [CONFIDENCE]: ${(confidence * 100).toFixed(1)}%`);
        console.log("💰 [SAVINGS]: Moderate (Small Compressed Cropped Image)");
        console.log("-------------------------------------------");
        payload = { type: 'hybrid', content: text, image: cropBase64 };
        promptPrefix = `OCR extracted: "${text}". Verify and answer using the image.`;
      } 
      else {
        // LOW CONFIDENCE: Fallback to compressed vision crop
        console.log("-------------------------------------------");
        console.log("🚀 [PIPELINE] ROUTE: VISION FALLBACK (Cropped)");
        console.log(`⚠️ [CONFIDENCE]: ${(confidence * 100).toFixed(1)}%`);
        console.log("💰 [SAVINGS]: Low (Sending Cropped Image)");
        console.log("-------------------------------------------");
        payload = { type: 'vision', image: cropBase64 };
      }

      results.push({ payload, promptPrefix });

    } finally {
      // Cleanup temp image and crop
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (ocrResult && ocrResult.crop_path && fs.existsSync(ocrResult.crop_path)) {
        fs.unlinkSync(ocrResult.crop_path);
      }
    }
  }

  // 4. Send the routing-optimized payloads to Gemini
  return await analyzeHybridPayloads(results);
}

module.exports = { processScreenshotsHybrid };
