// Express app (no listen). Used by server.js locally, api/index.js on Vercel
// and the tests in server/test.
const crypto = require("node:crypto");
const express = require("express");

const { isProduction } = require("./config");
const { requireDb, ensureConnected, databaseState } = require("./db");
const logger = require("./utils/logger");
const { isDatabaseUnavailable } = require("./utils/errors");
const {
  securityHeaders,
  noStore,
  createCors,
  sanitizeBody,
  apiLimiter,
} = require("./middleware/security");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// Behind Vercel's proxy the client IP is in X-Forwarded-For (one hop). Only
// trust it there (or when TRUST_PROXY is set), otherwise clients could spoof
// their IP to dodge rate limits.
if (process.env.VERCEL || process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

app.disable("x-powered-by");
app.set("json spaces", 0);

// ========================================
// REQUEST ID + ACCESS LOG (debug level; errors are always logged)
// ========================================
app.use((req, res, next) => {
  const incoming = req.headers["x-vercel-id"];
  req.id = typeof incoming === "string" && incoming.length <= 128 ? incoming : crypto.randomUUID();
  res.setHeader("X-Request-Id", req.id);

  const started = process.hrtime.bigint();

  res.on("finish", () => {
    logger.debug("http.request", {
      requestId: req.id,
      method: req.method,
      path: req.path, // no query string: it can contain identifiers
      status: res.statusCode,
      durationMs: Number((process.hrtime.bigint() - started) / 1000000n),
    });
  });

  next();
});

// ========================================
// SECURITY MIDDLEWARE
// ========================================
app.use(securityHeaders);
app.use(createCors());
app.use("/api", noStore);
app.use("/api", apiLimiter);

app.use(express.json({ limit: "20kb", strict: true }));
app.use(sanitizeBody);

// ========================================
// HOME ROUTE
// ========================================
app.get("/", (req, res) => {
  res.status(200).send("Welcome to MediBook+ Backend API");
});

// ========================================
// HEALTH CHECK (cheap: no queries; 503 when the database is unreachable)
// ========================================
const HEALTH_DB_WAIT_MS = 2500;

app.get("/api/health", async (req, res) => {
  if (databaseState() !== "connected") {
    // A cold serverless instance has not connected yet: try briefly.
    let timer;
    await Promise.race([
      ensureConnected().catch(() => {}),
      new Promise((resolve) => {
        timer = setTimeout(resolve, HEALTH_DB_WAIT_MS);
      }),
    ]);
    clearTimeout(timer);
  }

  const database = databaseState();
  const ok = database === "connected";

  res.status(ok ? 200 : 503).json({
    success: ok,
    message: ok ? "MediBook+ API is working!" : "MediBook+ API is up but the database is unavailable",
    database,
  });
});

// ========================================
// API ROUTES (all need the database: fast 503 when it is unreachable)
// ========================================
app.use("/api", requireDb);

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin", adminRoutes);

// ========================================
// 404 ROUTE
// Keep this at the bottom
// ========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`,
  });
});

// ========================================
// ERROR HANDLER
// Client errors get a specific message; everything else gets a generic,
// route-specific message (never the stack or internal error text).
// ========================================
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let message = error.publicMessage || "Something went wrong";
  let errors;

  if (error.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON in request body";
  } else if (error.type === "entity.too.large") {
    status = 413;
    message = "Request body is too large";
  } else if (error.expose && error.status >= 400 && error.status < 500) {
    // HttpError or a body-parser client error (bad charset, etc.)
    status = error.status;
    message = error.message;
    errors = error.errors;
  } else if (error.status === 503 || isDatabaseUnavailable(error)) {
    status = 503;
    message =
      error.status === 503 ? error.message : "Service temporarily unavailable. Please try again shortly.";
    res.setHeader("Retry-After", "5");
  } else if (error.name === "CastError") {
    status = 400;
    message = "Invalid ID";
  } else if (error.name === "ValidationError") {
    status = 400;
    message = "Invalid request data";
  }

  if (error.headers && typeof error.headers === "object") {
    for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
  }

  const logFields = {
    requestId: req.id,
    method: req.method,
    path: req.path,
    status,
    error,
  };

  if (status >= 500) {
    logger.error("http.error", logFields);
  } else {
    logger.debug("http.client_error", logFields);
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;
  if (status >= 500) body.requestId = req.id;
  if (status === 500 && !isProduction() && process.env.NODE_ENV === "development") {
    body.detail = error.message; // opt-in local debugging only
  }

  return res.status(status).json(body);
});

module.exports = app;
