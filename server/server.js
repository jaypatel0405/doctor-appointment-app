// Local / long-running entry: listen on PORT, connect to MongoDB (retrying in
// the background), seed starter doctors if the collection is empty.
// While the database is unreachable the API answers 503 instead of exiting.
require("dotenv").config({ quiet: true });

const app = require("./app");
const { connectDB, disconnectDB } = require("./db");
const { missingEnv, configWarnings } = require("./config");
const { seedDoctors } = require("./utils/seedDoctors");
const { isConfigured: isMailConfigured } = require("./utils/mailer");
const logger = require("./utils/logger");

const PORT = Number(process.env.PORT) || 5000;

const missing = missingEnv();

if (missing.length) {
  logger.error("config.missing_env", {
    message: `Missing environment variable(s): ${missing.join(", ")}. Copy server/.env.example to server/.env.`,
  });
  process.exit(1);
}

for (const warning of configWarnings()) logger.warn("config.warning", { message: warning });

const server = app.listen(PORT, () => {
  logger.info("server.started", {
    port: PORT,
    email: isMailConfigured() ? "enabled" : "disabled (no SMTP settings)",
    health: `http://localhost:${PORT}/api/health`,
  });
});

// Bound slow clients (slowloris) and keep-alive behind proxies.
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;

server.on("error", (error) => {
  logger.error("server.listen_failed", { port: PORT, error });
  process.exit(1);
});

async function connectWithRetry(attempt = 1) {
  try {
    await connectDB();
    logger.info("db.connected");

    // Idempotent and cheap: a single count query when doctors already exist.
    const seeded = await seedDoctors();
    if (seeded > 0) logger.info("db.seeded_doctors", { count: seeded });
  } catch (error) {
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    const hint = /whitelist|ECONNREFUSED|querySrv|ENOTFOUND|Could not connect/i.test(error.message)
      ? "Check that MongoDB is running and, for Atlas, that your current IP address is allowed under Network Access."
      : undefined;

    logger.error("db.connect_failed", {
      attempt,
      retryInMs: delay,
      error: { name: error.name, message: error.message },
      hint,
    });

    setTimeout(() => connectWithRetry(attempt + 1), delay).unref();
  }
}

connectWithRetry();

// ========================================
// GRACEFUL SHUTDOWN
// ========================================
let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info("server.stopping", { signal });

  const force = setTimeout(() => process.exit(1), 10000);
  force.unref();

  server.close(async () => {
    try {
      await disconnectDB();
    } finally {
      process.exit(0);
    }
  });
  server.closeIdleConnections?.();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("process.unhandled_rejection", {
    error: reason instanceof Error ? reason : { message: String(reason) },
  });
});
