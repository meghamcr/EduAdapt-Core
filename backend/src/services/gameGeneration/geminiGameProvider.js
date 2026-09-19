'use strict';

const { callGemini } = require('../curriculumIngestion/curriculumParser');
const { requireRequest } = require('./generationRequest');
const { schema } = require('./gameContract');

// Opt-in adapter. Importing this module never reads .env or performs I/O. Keys and
// model are read only at execution from environment; no fallback, retry or logging.
function createGeminiGameProvider() {
  return Object.freeze({ async generateStructuredGame(payload) {
    requireRequest(payload.kind === 'REPAIR' ? payload.originalRequest : payload);
    try {
      return await callGemini(JSON.stringify(payload), {
        model: process.env.GEMINI_MODEL, apiKey: process.env.GEMINI_API_KEY,
        responseSchema: schema, responseMimeType: 'application/json', maxOutputTokens: 16384, timeoutMs: 90000
      });
    } catch { throw new Error('GAME_PROVIDER_FAILURE'); }
  } });
}
module.exports = { createGeminiGameProvider };
