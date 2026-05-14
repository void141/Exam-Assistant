import os
import sys
import json
import traceback
import io
import numpy as np
from pathlib import Path
from PIL import Image

# SILENCE LOGS AND DISABLE ONEDNN
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["PADDLE_SDK_LOG_LEVEL"] = "3"
os.environ["FLAGS_use_onednn"] = "0"

# FORCE UTF-8
if not sys.stdout.encoding or sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

def log_debug(msg):
    with open("debug_ocr.log", "a", encoding="utf-8") as f:
        f.write(f"[WORKER] {msg}\n")

# 1. ENGINE INIT (Minimal args for stability)
try:
    from paddleocr import PaddleOCR
    log_debug("Initializing Composite-Ready OCR Engine...")
    OCR_ENGINE = PaddleOCR(lang='en')
    log_debug("Composite-Ready OCR Engine Ready.")
except Exception as e:
    log_debug(f"INIT ERROR: {traceback.format_exc()}")
    sys.stdout.write(json.dumps({"error": "Init failed"}) + "\n")
    sys.stdout.flush()
    sys.exit(1)

def load_image_safe(image_path: str) -> np.ndarray:
    """
    Handles Electron's RGBA/premultiplied alpha PNGs by compositing onto a white background.
    """
    pil_img = Image.open(image_path)

    # If the image has an alpha channel, composite it onto white
    if pil_img.mode in ("RGBA", "LA", "PA"):
        background = Image.new("RGB", pil_img.size, (255, 255, 255))
        if pil_img.mode == "RGBA":
            background.paste(pil_img, mask=pil_img.split()[3])  # channel 3 = Alpha
        else:
            background.paste(pil_img, mask=pil_img.convert("RGBA").split()[3])
        return np.array(background)

    return np.array(pil_img.convert("RGB"))

def debug_image(img_array: np.ndarray, path: str) -> dict:
    return {
        "path": path,
        "shape": list(img_array.shape),
        "mean": round(float(img_array.mean()), 2),
        "min": int(img_array.min()),
        "max": int(img_array.max()),
    }

def run_ocr(image_path: str) -> dict:
    try:
        if not os.path.exists(image_path):
            return {"success": False, "error": f"File not found: {image_path}"}
            
        img = load_image_safe(image_path)
        stats = debug_image(img, image_path)

        # Save a debug copy to verify the composite worked
        Image.fromarray(img).save("debug_composite_final.jpg")

        if stats["max"] == 0:
            return {"success": False, "error": "Image is still black after composite", "debug": stats}

        result = OCR_ENGINE.ocr(img)

        full_text = []
        total_confidence = 0
        count = 0
        boxes = []

        if result and result[0]:
            for line in result[0]:
                box = line[0]
                text = line[1][0]
                conf = float(line[1][1])
                full_text.append(text)
                total_confidence += conf
                count += 1
                boxes.append(box)

        avg_conf = (total_confidence / count * 100) if count > 0 else 0.0

        return {
            "success": True,
            "text": "\n".join(full_text),
            "confidence": round(avg_conf, 1),
            "boxes": boxes,
            "debug": stats
        }
    except Exception as e:
        return {"success": False, "error": str(e), "traceback": traceback.format_exc()}

if __name__ == "__main__":
    # Signal readiness
    sys.stdout.write(json.dumps({"status": "READY"}) + "\n")
    sys.stdout.flush()
    
    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line: continue
        
        try:
            request = json.loads(raw_line)
            image_path = request.get("image_path", "")
            req_id = request.get("id", "unknown")
            
            res = run_ocr(image_path)
            res["id"] = req_id
            sys.stdout.write(json.dumps(res) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"error": str(e)}) + "\n")
            sys.stdout.flush()
