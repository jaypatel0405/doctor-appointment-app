// HTTP hardening: security headers, CORS, body sanitising and rate limits.
const helmet = require("helmet");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");
const { intFromEnv, isProduction } = require("../config");

// ========================================
// SECURITY HEADERS (API-only: the SPA itself is served by Vercel, not Express)
// ========================================
const securityHeaders = helmet({
  // JSON responses never need to load anything or be framed.
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  // The frontend may call the API from another origin (VITE_API_URL); CORS
  // decides who can read responses, so don't additionally block them here.
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "no-referrer" },
});

// API responses carry personal data: never let browsers or CDNs cache them.
function noStore(req, res, next) {
  res.setHeader("Cache-Control", "no-store");
  next();
}

// ========================================
// CORS
// CORS_ORIGINS (or legacy CLIENT_ORIGIN) is a comma-separated allow list.
// Always allowed: requests without an Origin header (curl, server-to-server),
// same-origin requests (frontend and API on one Vercel domain) and the local
// Vite dev/preview origins. Outside production, with no list configured, any
// origin is allowed for convenience.
// Auth uses a Bearer token (no cookies), so CORS is not a CSRF boundary here;
// it only limits which sites can read API responses in a browser.
// ========================================
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

function configuredOrigins() {
  const origins = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.push(`https://${process.env.VERCEL_BRANCH_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }

  return origins;
}

function createCors() {
  const allowList = new Set([...DEV_ORIGINS, ...configuredOrigins()]);
  const allowAnyOrigin =
    !process.env.CORS_ORIGINS && !process.env.CLIENT_ORIGIN && !isProduction();

  function isAllowedOrigin(origin, req) {
    if (!origin || allowAnyOrigin || allowList.has(origin)) return true;

    try {
      // Same-origin: the page and the API are served from the same host.
      const host = req.headers["x-forwarded-host"] || req.headers.host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  return cors((req, callback) => {
    callback(null, {
      origin: isAllowedOrigin(req.headers.origin, req),
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["X-Request-Id", "Retry-After", "RateLimit", "RateLimit-Policy"],
      maxAge: 600,
    });
  });
}

// ========================================
// BODY SANITISING
// Drops keys that MongoDB would treat as operators or paths ("$gt",
// "a.b") and prototype-pollution keys from JSON bodies. Validation (see
// validate.js) additionally enforces exact types for every field.
// ========================================
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function stripDangerousKeys(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map((item) => stripDangerousKeys(item, depth + 1));
  }

  const clean = {};

  for (const [key, item] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".") || FORBIDDEN_KEYS.has(key)) continue;
    clean[key] = stripDangerousKeys(item, depth + 1);
  }

  return clean;
}

function sanitizeBody(req, res, next) {
  // Express 5 leaves req.body undefined when there is no (JSON) body.
  req.body = req.body === undefined ? {} : stripDangerousKeys(req.body);
  next();
}

// ========================================
// RATE LIMITING
// In-memory store: limits apply per server instance. On Vercel each warm
// function instance keeps its own counters, so the effective limit can be a
// few times higher under load - acceptable as abuse protection for this app.
// A shared store (e.g. Redis/Upstash) would make them global.
// ========================================
function limitHandler(message) {
  return (req, res, next, options) => {
    res.status(options.statusCode).json({ success: false, message });
  };
}

function createLimiter({ windowMs, limit, message, ...rest }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: limitHandler(message),
    ...rest,
  });
}

const MINUTE = 60 * 1000;

// Whole API, per IP: generous ceiling against scraping/flooding.
const apiLimiter = createLimiter({
  windowMs: MINUTE,
  limit: () => intFromEnv("RATE_LIMIT_API_MAX", 300),
  message: "Too many requests. Please slow down and try again shortly.",
});

// Patient and admin login, per IP. Only failed attempts count.
const loginLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: () => intFromEnv("RATE_LIMIT_LOGIN_MAX", 10),
  skipSuccessfulRequests: true,
  message: "Too many failed login attempts. Please wait 15 minutes and try again.",
});

// Registration, per IP.
const registerLimiter = createLimiter({
  windowMs: 60 * MINUTE,
  limit: () => intFromEnv("RATE_LIMIT_REGISTER_MAX", 10),
  message: "Too many accounts created from this network. Please try again later.",
});

// Booking and rescheduling, per signed-in user (runs after authMiddleware).
const bookingLimiter = createLimiter({
  windowMs: 15 * MINUTE,
  limit: () => intFromEnv("RATE_LIMIT_BOOKING_MAX", 20),
  keyGenerator: (req) => `user:${req.user.userId}`,
  message: "Too many booking attempts. Please wait a few minutes and try again.",
});

module.exports = {
  securityHeaders,
  noStore,
  createCors,
  sanitizeBody,
  stripDangerousKeys,
  apiLimiter,
  loginLimiter,
  registerLimiter,
  bookingLimiter,
};
