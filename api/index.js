// Vercel serverless function: serves the whole Express API for /api/* (see the
// rewrite in vercel.json). The app connects to MongoDB lazily on the first
// request that needs it and caches the connection across warm invocations
// (server/db.js); when the database is unreachable it answers 503 quickly.
// Seeding and index creation are NOT done here (see README "One-time setup").
const app = require("../server/app");
const { configWarnings, missingEnv } = require("../server/config");
const logger = require("../server/utils/logger");

// Logged once per cold start; values are never logged, only names/problems.
const missing = missingEnv();
if (missing.length) {
  logger.error("config.missing_env", { message: `Missing environment variable(s): ${missing.join(", ")}` });
}
for (const warning of configWarnings()) logger.warn("config.warning", { message: warning });

module.exports = app;
