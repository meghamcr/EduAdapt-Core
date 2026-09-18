// Only numerical counters, booleans and locally allowlisted labels leave this
// module. Never preserve provider prose, headers, response bodies or parser errors.
const FINISH_REASONS = new Set(["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL", "FINISH_REASON_UNSPECIFIED", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_OTHER", "NO_IMAGE"]);
function responseMetadata(response, data, text) {
  const candidate = data?.candidates?.[0];
  const mime = response.headers?.get?.("content-type")?.split(";")[0]?.trim();
  const usage = {};
  for (const key of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount", "thoughtsTokenCount", "cachedContentTokenCount"]) {
    const value = data?.usageMetadata?.[key];
    if (Number.isSafeInteger(value) && value >= 0) usage[key] = value;
  }
  return {
    ...(Number.isInteger(response.status) ? { httpStatus: response.status } : {}),
    responseMimeType: ["application/json", "text/plain"].includes(mime) ? mime : "UNKNOWN",
    candidatePresent: !!candidate, candidateTextPresent: !!text.trim(),
    candidateCount: Array.isArray(data?.candidates) ? data.candidates.length : 0,
    finishReason: FINISH_REASONS.has(candidate?.finishReason) ? candidate.finishReason : candidate?.finishReason === undefined ? "MISSING" : "UNKNOWN",
    promptBlocked: !!data?.promptFeedback?.blockReason,
    returnedTextCharacters: text.length, usage
  };
}
function jsonFailureKind(error) {
  // Classification only; SyntaxError messages can contain source excerpts.
  const message = typeof error?.message === "string" ? error.message : "";
  return /unexpected end|unterminated string/i.test(message) ? "UNEXPECTED_END_OR_UNTERMINATED_STRING" : "INVALID_JSON_SYNTAX";
}
function networkMetadata(error, signal, timeoutMs) {
  const names = new Set(["Error", "TypeError", "AggregateError", "AbortError", "TimeoutError"]);
  const codes = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EACCES", "EPERM", "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "ERR_TLS_CERT_ALTNAME_INVALID"]);
  const safeError = value => ({
    name: names.has(value?.name) ? value.name : "UNKNOWN",
    ...(codes.has(value?.code) ? { code: value.code } : {}),
    ...(["getaddrinfo", "connect", "read", "write"].includes(value?.syscall) ? { syscall: value.syscall } : {}),
    ...(value?.hostname === "generativelanguage.googleapis.com" ? { hostname: value.hostname } : {})
  });
  const cause = error?.cause;
  return { error: safeError(error), ...(cause ? { cause: safeError(cause) } : {}),
    ...(Array.isArray(cause?.errors) ? { connectionErrors: cause.errors.slice(0, 8).map(safeError) } : {}),
    signalAborted: signal.aborted, abortError: error?.name === "AbortError", timeoutMs };
}
module.exports = { responseMetadata, jsonFailureKind, networkMetadata };
