const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

class AIService {
  constructor() {
    this.genAI = null;
    this.primaryModel = null;
    this.fallbackModel = null;
    this.isInitialized = false;
  }

  init(apiKey) {
    try {
      this.genAI = new GoogleGenerativeAI(apiKey);
      // Restoring original model identifiers from the start of the project
      this.primaryModel = this.genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
      this.fallbackModel = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      this.isInitialized = true;
      console.log('✅ AI Service Initialized.');
    } catch (e) {
      console.error('❌ AI Init Error:', e.message);
    }
  }

  async ask(prompt, payload = null) {
    if (!this.isInitialized) return "AI not initialized. Check API Key.";

    try {
      const contents = [];
      const parts = [{ text: prompt }];

      // FIX #2: Format image as inlineData
      if (payload) {
        if (payload.image) {
          console.log(`📸 [AI-DEBUG] Adding Image. Base64 length: ${payload.image.length}`);
          parts.push({
            inlineData: { mimeType: 'image/jpeg', data: payload.image }
          });
        }
        if (payload.images && Array.isArray(payload.images)) {
          console.log(`📸 [AI-DEBUG] Adding ${payload.images.length} Images from queue.`);
          for (const imgBase64 of payload.images) {
            parts.push({
              inlineData: { mimeType: 'image/jpeg', data: imgBase64 }
            });
          }
        }
      }

      contents.push({ role: 'user', parts });

      const result = await this.primaryModel.generateContent({ contents });
      const response = await result.response;
      return response.text();
    } catch (e) {
      console.error(`❌ [AI-DEBUG] Gemini Error: ${e.message}`);
      throw e;
    }
  }
}

module.exports = new AIService();
