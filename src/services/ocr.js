const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');

class OCRService {
  constructor() {
    this.worker = null;
    this.isReady = false;
    this.queue = [];
    this.currentTask = null;
    this.startupTimeout = null;
  }

  init() {
    if (this.worker) return;

    console.log('🚀 [OCR] Starting Persistent Worker...');
    const scriptPath = path.join(__dirname, '..', 'engine', 'ocr_engine.py');
    
    // FIX #3: Explicit stdio configuration
    this.worker = spawn('python', [scriptPath], {
      env: { ...process.env, PYTHONWARNINGS: 'ignore' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // FIX #1: Use readline for line-based IPC
    const rl = readline.createInterface({
      input: this.worker.stdout
    });

    rl.on('line', (line) => {
      try {
        const json = JSON.parse(line);
        
        if (json.status === 'READY') {
          console.log('✅ [OCR] Worker Ready and Listening.');
          this.isReady = true;
          if (this.startupTimeout) clearTimeout(this.startupTimeout);
          this.processQueue();
        } else if (this.currentTask) {
          this.currentTask.resolve(json);
          this.currentTask = null;
          this.processQueue();
        }
      } catch (e) {
        console.error('❌ [OCR] JSON Parse Error:', e.message, 'Line:', line);
      }
    });

    this.worker.stderr.on('data', (data) => {
      // Buffer stderr to prevent blocking, but log it for debugging
      console.log(`⚠️ [OCR-LOG]: ${data.toString().trim()}`);
    });

    // FIX #2: Log exit code
    this.worker.on('close', (code) => {
      console.log(`🛑 [OCR] Worker Stopped. Exit code: ${code}`);
      this.worker = null;
      this.isReady = false;
      if (this.startupTimeout) clearTimeout(this.startupTimeout);
    });

    // FIX #5: Startup Timeout (60s)
    this.startupTimeout = setTimeout(() => {
      if (!this.isReady) {
        console.error('❌ [OCR] Worker timed out during initialization.');
        this.stop();
      }
    }, 60000);
  }

  processQueue() {
    if (!this.isReady || this.queue.length === 0 || this.currentTask) return;

    this.currentTask = this.queue.shift();
    const request = JSON.stringify({
      id: Date.now().toString(),
      image_path: this.currentTask.imagePath
    });
    this.worker.stdin.write(request + '\n');
  }

  async runOCR(imagePath) {
    return new Promise((resolve, reject) => {
      this.queue.push({ imagePath, resolve, reject });
      this.processQueue();
    });
  }

  stop() {
    if (this.worker) {
      this.worker.kill();
      this.worker = null;
    }
  }
}

module.exports = new OCRService();
