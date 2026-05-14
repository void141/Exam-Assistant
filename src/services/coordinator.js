const fs = require('fs');
const path = require('path');
const ocrService = require('./ocr');
const aiService = require('./ai');
const sharp = require('sharp');

/**
 * Attempt to delete a file, retrying if the OS reports it locked.
 */
async function safeUnlink(filePath, retries = 5, delayMs = 200) {
  for (let i = 0; i < retries; i++) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    } catch (err) {
      if ((err.code === 'EPERM' || err.code === 'EBUSY') && i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      } else if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

class Coordinator {
  async processScreenshot(base64) {
    const tempPath = path.join(process.cwd(), `temp_ocr_${Date.now()}.jpg`);
    const results = [];

    try {
      // 1. Convert to JPEG and Save (Forces white background for transparency)
      // Ensure we strip the Data URL prefix if it exists
      const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(cleanBase64, 'base64');
      
      await sharp(buffer)
        .flatten({ background: { r: 255, g: 255, b: 255 } }) 
        .jpeg({ quality: 90 })
        .toFile(tempPath);
      
      // Safety delay to ensure file is flushed
      await new Promise(r => setTimeout(r, 200));

      console.log(`[COORD-DEBUG] File saved. Size: ${(fs.statSync(tempPath).size / 1024).toFixed(1)} KB`);

      const ocrResult = await ocrService.runOCR(tempPath);
      const confidence = ocrResult.confidence || 0;
      const text = ocrResult.text || "";
      const boxes = ocrResult.boxes || [];
      const stats = ocrResult.debug || { mean: 0, min: 0, max: 0 };

      console.log(`[OCR-DEBUG] Text Length: ${text.length}, Confidence: ${confidence.toFixed(1)}%`);
      console.log(`[IMG-DEBUG] Stats -> Mean: ${stats.mean.toFixed(2)}, Min: ${stats.min}, Max: ${stats.max}`);

      // 2. IMAGE PROCESSING (Sharp)
      let compressedCropBase64 = null;
      try {
        let sharpInstance = sharp(tempPath);
        const metadata = await sharpInstance.metadata();

        if (boxes.length > 0) {
          let minX = metadata.width, minY = metadata.height, maxX = 0, maxY = 0;
          boxes.forEach(box => {
            box.forEach(pt => {
              minX = Math.min(minX, pt[0]);
              maxX = Math.max(maxX, pt[0]);
              minY = Math.min(minY, pt[1]);
              maxY = Math.max(maxY, pt[1]);
            });
          });

          const pad = 50;
          const left = Math.max(0, Math.floor(minX - pad));
          const top = Math.max(0, Math.floor(minY - pad));
          const width = Math.min(metadata.width - left, Math.ceil(maxX - minX + 2 * pad));
          const height = Math.min(metadata.height - top, Math.ceil(maxY - minY + 2 * pad));

          console.log(`[IMG-DEBUG] Cropping to: ${width}x${height} at ${left},${top}`);
          sharpInstance = sharpInstance.extract({ left, top, width, height });
        }

        const jpegBuffer = await sharpInstance
          .jpeg({ quality: 60 })
          .toBuffer();
        
        compressedCropBase64 = jpegBuffer.toString('base64');
        console.log(`[IMG-DEBUG] JPEG Conversion Success. Buffer Size: ${(jpegBuffer.length / 1024).toFixed(1)} KB`);
      } catch (imgError) {
        console.error(`❌ [IMG-DEBUG] Sharp Error: ${imgError.message}`);
      }

      // 3. ROUTING LOGIC
      let payload;
      let promptPrefix = "";

      if (confidence > 90 && text.trim().length > 0) {
        console.log("🚀 [PIPELINE] ROUTE: TEXT-ONLY");
        payload = { type: 'text', content: text };
      } 
      else if (confidence > 10 && text.trim().length > 0) {
        console.log("🚀 [PIPELINE] ROUTE: HYBRID (Text + Crop)");
        payload = { type: 'hybrid', content: text, image: compressedCropBase64 };
        promptPrefix = `OCR found text: "${text}". Please verify with image and answer.`;
      } 
      else {
        console.log("🚀 [PIPELINE] ROUTE: VISION-ONLY (Cropped/Full)");
        payload = { type: 'vision', image: compressedCropBase64 };
      }

      results.push({ payload, promptPrefix });

    } catch (e) {
      console.error(`❌ [COORD-DEBUG] Pipeline Error: ${e.message}`);
    } finally {
      // Use the safe retry-based unlink
      await safeUnlink(tempPath);
    }

    return results;
  }
}

module.exports = new Coordinator();
