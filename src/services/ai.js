const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
let primaryModel = null;
let fallbackModel = null;

const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

/**
 * Initialize the Gemini AI client with primary + fallback models.
 * @param {string} apiKey - Gemini API key
 */
function initAI(apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
  primaryModel = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
  fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
  console.log(`AI initialized: ${PRIMARY_MODEL} (fallback: ${FALLBACK_MODEL})`);
}

/**
 * Send multiple screenshots to Gemini Vision and get an answer.
 * Tries primary model first, falls back to secondary on failure.
 * @param {string[]} base64Screenshots - Array of Base64-encoded PNG screenshots
 * @returns {Promise<string>} AI-generated answer text
 */
async function analyzeScreenshots(base64Screenshots) {
  if (!primaryModel) {
    throw new Error('AI not initialized. Call initAI() first.');
  }

  const systemPrompt = `You are an expert exam assistant. Analyze the provided screenshots carefully and:

1. Identify ALL visible questions or problems across all images.
2. Provide clear, concise, and correct answers for each question.
3. If it's multiple choice, state the correct option letter AND brief explanation.
4. If it's a written/coding question, provide the solution directly.
5. Be concise — no unnecessary filler text.
6. Format your response cleanly with question numbers.

IMPORTANT: Only answer what's visible. If no questions are visible, say "No questions detected in the screenshots."`;

  const imageParts = base64Screenshots.map(base64 => ({
    inlineData: {
      data: base64,
      mimeType: 'image/png'
    }
  }));

  // Try primary model first
  try {
    const result = await primaryModel.generateContent([systemPrompt, ...imageParts]);
    const response = await result.response;
    return response.text();
  } catch (primaryError) {
    console.warn(`Primary model (${PRIMARY_MODEL}) failed:`, primaryError.message);
    console.log(`Falling back to ${FALLBACK_MODEL}...`);

    // Try fallback model
    try {
      const result = await fallbackModel.generateContent([systemPrompt, ...imageParts]);
      const response = await result.response;
      return `*(fallback model)*\n\n${response.text()}`;
    } catch (fallbackError) {
      console.error('Both models failed:', fallbackError);
      if (fallbackError.message?.includes('API_KEY')) {
        throw new Error('Invalid Gemini API key. Check your .env file.');
      }
      throw new Error(`AI Error: ${fallbackError.message}`);
    }
  }
}

/**
 * Processes hybrid payloads (text, hybrid, or vision) from the coordinator.
 * @param {Array} payloads - Array of { payload, promptPrefix }
 */
async function analyzeHybridPayloads(payloads) {
  if (!primaryModel) {
    throw new Error('AI not initialized. Call initAI() first.');
  }

  const systemPrompt = `You are an expert exam assistant. Analyze the provided content (text or images) carefully and:
1. Provide clear, concise, and correct answers.
2. If OCR text is provided, verify it if an image is also present.
3. Be concise and professional.`;

  const contents = [systemPrompt];

  for (const item of payloads) {
    const { payload, promptPrefix } = item;

    if (payload.type === 'text') {
      contents.push(`\nQuestion (Extracted via High-Confidence OCR):\n${payload.content}`);
    } 
    else if (payload.type === 'hybrid') {
      contents.push(`\n${promptPrefix}`);
      contents.push({
        inlineData: {
          data: payload.image,
          mimeType: 'image/png'
        }
      });
    } 
    else {
      contents.push("\nQuestion (Full Vision Fallback):");
      contents.push({
        inlineData: {
          data: payload.image,
          mimeType: 'image/png'
        }
      });
    }
  }

  // Try primary model first
  try {
    const result = await primaryModel.generateContent(contents);
    const response = await result.response;
    return response.text();
  } catch (primaryError) {
    console.warn(`Primary model failed in hybrid mode:`, primaryError.message);
    // Fallback logic could be added here
    throw primaryError;
  }
}

module.exports = { initAI, analyzeScreenshots, analyzeHybridPayloads };
