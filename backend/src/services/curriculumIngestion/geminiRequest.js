// Shared pure builder: production and diagnostic probes serialize this object.
function buildGeminiRequest(prompt, { mediaParts = [], responseMimeType = "application/json", responseSchema, maxOutputTokens = 16384 } = {}) {
  return { contents: [{ role: "user", parts: [{ text: prompt }, ...mediaParts] }], generationConfig: {
    temperature: 0.1,
    ...(responseMimeType ? { responseMimeType } : {}),
    ...(responseSchema ? { responseJsonSchema: responseSchema } : {}),
    maxOutputTokens
  } };
}
module.exports = { buildGeminiRequest };
