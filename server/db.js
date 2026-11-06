// Cached MongoDB connection shared by the local server (server.js), the Vercel
// serverless function (api/index.js) and the tests. Warm serverless
// invocations reuse the same connection instead of opening one per request.
//
// Failure behaviour: when the database cannot be reached, requests get a fast
// 503 instead of hanging. After a failed attempt, new attempts are skipped for
// a short cool-down so a dead database does not make every request wait for the
// full server-selection timeout.
const mongoose = require("mongoose");
const { missingEnv } = require("./config");
const { ServiceUnavailableError } = require("./utils/errors");
const logger = require("./utils/logger");

// Fail fast instead of queueing queries forever when the DB is unreachable.
mongoose.set("bufferCommands", false);
// Indexes are created explicitly with `npm run db:indexes` (see README), not on
// every cold start, so a production database is never changed implicitly.
mongoose.set("autoIndex", process.env.MONGO_AUTO_INDEX === "true");

const RETRY_COOLDOWN_MS = 3000;

const cache =
  globalThis.__medibookMongo ||
  (globalThis.__medibookMongo = { promise: null, connectedOnce: false, lastFailureAt: 0 });

function connectionOptions() {
  return {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    maxPoolSize: process.env.VERCEL ? 5 : 10,
    minPoolSize: 0,
    maxIdleTimeMS: 60000,
    appName: "medibook-api",
  };
}

// `onlyMongo`: maintenance scripts need MONGO_URI but not JWT_SECRET.
async function connectDB({ onlyMongo = false } = {}) {
  const missing = onlyMongo ? missingEnv().filter((name) => name === "MONGO_URI") : missingEnv();

  if (missing.length) {
    const error = new Error(`Missing environment variable(s): ${missing.join(", ")}`);
    error.code = "ENV_MISSING";
    throw error;
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGO_URI, connectionOptions())
      .then((connection) => {
        cache.connectedOnce = true;
        cache.lastFailureAt = 0;
        return connection;
      })
      .catch((error) => {
        cache.promise = null; // allow a retry later
        cache.lastFailureAt = Date.now();
        throw error;
      });
  }

  await cache.promise;
  return mongoose.connection;
}

// Request-path variant: resolves when the DB is usable, otherwise throws a
// ServiceUnavailableError (503) quickly.
async function ensureConnected() {
  if (mongoose.connection.readyState === 1) return;

  // Connected before and dropped: the driver reconnects on its own; don't
  // stack new connect() calls, just report unavailability until it is back.
  if (cache.connectedOnce && mongoose.connection.readyState !== 2) {
    throw new ServiceUnavailableError();
  }

  if (!cache.promise && Date.now() - cache.lastFailureAt < RETRY_COOLDOWN_MS) {
    throw new ServiceUnavailableError();
  }

  try {
    await connectDB();
  } catch (error) {
    if (error.code === "ENV_MISSING") {
      logger.error("config.missing_env", { message: error.message });
    } else {
      logger.error("db.connect_failed", { error: { name: error.name, message: error.message } });
    }
    throw new ServiceUnavailableError();
  }
}

// Express middleware for routes that need the database.
async function requireDb(req, res, next) {
  try {
    await ensureConnected();
    next();
  } catch (error) {
    next(error);
  }
}

function databaseState() {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
}

async function disconnectDB() {
  cache.promise = null;
  cache.connectedOnce = false;
  cache.lastFailureAt = 0;
  await mongoose.disconnect();
}

module.exports = { connectDB, ensureConnected, requireDb, databaseState, disconnectDB, missingEnv };
