class IngestionError extends Error {
  constructor(code, message, { retryable = false, status, retryAfterMs, details } = {}) {
    super(message);
    this.name = "IngestionError";
    Object.assign(this, { code, retryable, status, retryAfterMs, details });
  }
}

function validateRetryOptions({ maxAttempts = 4, baseDelayMs = 1000, maxDelayMs = 30000, retryNetwork = true, retryHttpStatuses = [], stopOnHttpError = true } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10 ||
      !Number.isInteger(baseDelayMs) || baseDelayMs < 0 ||
      !Number.isInteger(maxDelayMs) || maxDelayMs < baseDelayMs || maxDelayMs > 300000) {
    throw new IngestionError("CONFIG_INVALID", "Retry options require 1–10 attempts and 0 <= baseDelayMs <= maxDelayMs <= 300000.");
  }
  if (typeof retryNetwork !== "boolean" || typeof stopOnHttpError !== "boolean" || !Array.isArray(retryHttpStatuses) || retryHttpStatuses.some(status => ![408, 429, 500, 502, 503, 504].includes(status))) {
    throw new IngestionError("CONFIG_INVALID", "Invalid retry policy; only transient HTTP statuses may be retried.");
  }
  return { maxAttempts, baseDelayMs, maxDelayMs, retryNetwork, retryHttpStatuses, stopOnHttpError };
}

async function withGeminiRetry(operation, options = {}, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), onRetry = () => {} } = {}) {
  const { maxAttempts, baseDelayMs, maxDelayMs, retryNetwork, retryHttpStatuses } = validateRetryOptions(options);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (!(error instanceof IngestionError)) throw error;
      const allowed = error.code === "API_HTTP" ? retryHttpStatuses.includes(error.status)
        : ["API_NETWORK", "API_TIMEOUT"].includes(error.code) && retryNetwork;
      if (!(error instanceof IngestionError) || !error.retryable || !allowed || attempt === maxAttempts) throw error;
      const requested = Number.isFinite(error.retryAfterMs) ? Math.max(0, error.retryAfterMs) : 0;
      const delayMs = Math.min(maxDelayMs, Math.max(baseDelayMs * 2 ** (attempt - 1), requested));
      onRetry({ attempt, code: error.code, ...(error.status ? { status: error.status } : {}), delayMs });
      await sleep(delayMs);
    }
  }
}

module.exports = { IngestionError, validateRetryOptions, withGeminiRetry };
