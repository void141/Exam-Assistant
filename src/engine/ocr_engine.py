import os
import warnings

# 1. OPTIMIZATION: Silence everything
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["PADDLE_ONEDNN_ENABLE"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"
os.environ["PYTHONWARNINGS"] = "ignore"
os.environ["PADDLE_SDK_LOG_LEVEL"] = "3"

import sys
import json
import cv2
import numpy as np
import traceback
import io
import tempfile

# 2. OPTIMIZATION: Force UTF-8
if not sys.stdout.encoding or sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def log_debug(msg):
    with open("debug_ocr.log", "a", encoding="utf-8") as f:
        f.write(f"[WORKER] {msg}\n")

# 3. GLOBAL SINGLETON
try:
    from paddleocr import PaddleOCR
    log_debug("Initializing Global OCR Engine...")
    OCR_ENGINE = PaddleOCR(lang='en')
    log_debug("Global OCR Engine Ready.")
except Exception as e:
    log_debug(f"INITIALIZATION ERROR:\n{traceback.format_exc()}")
    sys.stdout.write(json.dumps({"error": "Init failed"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

def process_image(image_path):
    try:
        img = cv2.imread(image_path)
        if img is None:
            return {"error": "Could not read image"}

        h, w = img.shape[:2]
        
        # 4. PREPROCESS (CRITICAL FOR ACCURACY)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        # Increase contrast to make text pop
        processed = cv2.convertScaleAbs(gray, alpha=1.5, beta=0)

        # 5. SINGLE PASS OCR
        result = OCR_ENGINE.ocr(processed)
        
        full_text = []
        total_confidence = 0
        count = 0
        
        # Track bounding box
        min_x, min_y = w, h
        max_x, max_y = 0, 0

        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text = line[1][0]
                conf = float(line[1][1])
                
                full_text.append(text)
                total_confidence += conf
                count += 1
                
                for pt in box:
                    min_x = min(min_x, pt[0])
                    max_x = max(max_x, pt[0])
                    min_y = min(min_y, pt[1])
                    max_y = max(max_y, pt[1])

        avg_conf = total_confidence / count if count > 0 else 0.0
        
        # 6. SMART CROP
        crop_path = None
        if count > 0:
            padding = 50
            x1 = max(0, int(min_x - padding))
            y1 = max(0, int(min_y - padding))
            x2 = min(w, int(max_x + padding))
            y2 = min(h, int(max_y + padding))
            
            crop = img[y1:y2, x1:x2]
            
            temp_dir = tempfile.gettempdir()
            crop_path = os.path.join(temp_dir, f"ocr_crop_{os.path.basename(image_path)}")
            cv2.imwrite(crop_path, crop, [cv2.IMWRITE_JPEG_QUALITY, 50])

        return {
            "text": "\n".join(full_text),
            "confidence": float(avg_conf),
            "crop_path": crop_path
        }
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    sys.stdout.write(json.dumps({"status": "READY"}) + "\n")
    sys.stdout.flush()
    
    while True:
        line = sys.stdin.readline()
        if not line: break
        
        img_p = line.strip()
        if not img_p: continue
            
        res = process_image(img_p)
        sys.stdout.write(json.dumps(res) + "\n")
        sys.stdout.flush()
