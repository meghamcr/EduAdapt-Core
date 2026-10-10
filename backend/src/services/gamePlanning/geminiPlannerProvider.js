'use strict';
const { callGemini } = require('../curriculumIngestion/curriculumParser');
const { requirePlanningRequest } = require('./gamePlanner');
const { schema } = require('./plannerContract');
const { providerSchema } = require('../gameGeneration/geminiProviderSchema');
// Explicit opt-in only; no env loading, provider call or retries on import.
function createGeminiPlannerProvider() {
  return Object.freeze({ async planStructuredGame(request) {
    requirePlanningRequest(request);
    try {
      return await callGemini(JSON.stringify(request), { model: process.env.GEMINI_MODEL, apiKey: process.env.GEMINI_API_KEY,
        responseSchema: providerSchema(schema), responseMimeType: 'application/json', maxOutputTokens: 8192, timeoutMs: 90000 });
    } catch (error) {
      throw Object.assign(new Error('PLANNER_PROVIDER_FAILURE'), {
        providerCode: ['API_HTTP','API_NETWORK','API_TIMEOUT','CONFIG_INVALID','OUTPUT_TRUNCATED','OUTPUT_INCOMPLETE','OUTPUT_EMPTY'].includes(error.code) ? error.code : 'PROVIDER_FAILURE',
        ...(Number.isInteger(error.status) ? {httpStatus:error.status} : {})
      });
    }
  } });
}
module.exports = { createGeminiPlannerProvider };
