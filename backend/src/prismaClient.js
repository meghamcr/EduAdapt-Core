const path = require("node:path");
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

// Resolve the backend environment independently of the caller's working directory.
// Existing process configuration takes precedence; never log loaded values.
require("dotenv").config({ path: path.resolve(__dirname, "../.env"), quiet: true });

function configurationError() {
  const error = new Error("DATABASE_URL must be configured as a PostgreSQL connection URL for application runtime.");
  error.code = "PRISMA_RUNTIME_CONFIG_INVALID";
  return error;
}

const connectionString = process.env.DATABASE_URL;
if (typeof connectionString !== "string" || !connectionString.trim()) throw configurationError();
try {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) throw configurationError();
} catch {
  // URL parser errors can include credentials: do not retain their message/cause.
  throw configurationError();
}

const cacheKey = Symbol.for("eduadapt.prisma.runtime");
const cached = process.env.NODE_ENV !== "production" && globalThis[cacheKey];
const prisma = cached || new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});
// CommonJS caching centralizes normal imports; this also survives development reloads.
if (process.env.NODE_ENV !== "production") globalThis[cacheKey] = prisma;

module.exports = prisma;
