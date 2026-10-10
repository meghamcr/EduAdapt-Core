'use strict';

const { callGemini } = require('../curriculumIngestion/curriculumParser');
const { requireRequest } = require('./generationRequest');
const { schema } = require('./gameContract');
const { providerSchema } = require('./geminiProviderSchema');

// Opt-in adapter. Importing this module never reads .env or performs I/O. Keys and
// model are read only at execution from environment; no fallback, retry or logging.
function createGeminiGameProvider() {
  return Object.freeze({ async generateStructuredGame(payload) {
    requireRequest(payload.kind === 'REPAIR' ? payload.originalRequest : payload);
    try {
      return await callGemini(JSON.stringify(payload), {
        model: process.env.GEMINI_MODEL, apiKey: process.env.GEMINI_API_KEY,
        responseSchema: providerSchema(schema), responseMimeType: 'application/json', maxOutputTokens: 16384, timeoutMs: 90000
      });
    } catch (error) {
      throw Object.assign(new Error('GAME_PROVIDER_FAILURE'), {
        providerCode: ['API_HTTP','API_NETWORK','API_TIMEOUT','CONFIG_INVALID','OUTPUT_TRUNCATED','OUTPUT_INCOMPLETE','OUTPUT_EMPTY'].includes(error.code) ? error.code : 'PROVIDER_FAILURE',
        ...(Number.isInteger(error.status) ? {httpStatus:error.status} : {})
      });
    }
  } });
}
module.exports = { createGeminiGameProvider };
