// Express app (no listen). Used by server.js locally and api/index.js on Vercel.
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

// ========================================
// MIDDLEWARE
// ========================================
// CORS: CORS_ORIGINS (or legacy CLIENT_ORIGIN) is a comma-separated allow list.
// Local dev origins and same-origin requests (frontend + API on one Vercel
// domain) are always allowed. With no list configured and not running on
// Vercel, any origin is allowed (handy in development).
const DEV_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (process.env.VERCEL_URL) configuredOrigins.push(`https://${process.env.VERCEL_URL}`);
if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
  configuredOrigins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
}

const allowAnyOrigin =
  !process.env.CORS_ORIGINS && !process.env.CLIENT_ORIGIN && !process.env.VERCEL;

function isAllowedOrigin(origin, req) {
  if (!origin || allowAnyOrigin) return true;
  if (DEV_ORIGINS.includes(origin) || configuredOrigins.includes(origin)) return true;

  try {
    // Same-origin: the page and the API are served from the same host.
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.use(
  cors((req, callback) => {
    callback(null, { origin: isAllowedOrigin(req.headers.origin, req) });
  })
);

app.use(express.json({ limit: "100kb" }));

// ========================================
// HOME ROUTE
// ========================================
app.get("/", (req, res) => {
  res.status(200).send("Welcome to MediBook+ Backend API");
});

// ========================================
// HEALTH CHECK
// ========================================
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "MediBook+ API is working!",
    database:
      mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ========================================
// API ROUTES
// ========================================
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
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ========================================
// ERROR HANDLER (malformed JSON, unexpected failures)
// ========================================
app.use((error, req, res, next) => {
  if (error.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON in request body",
    });
  }

  console.error("Unhandled error:", error);

  return res.status(500).json({
    success: false,
    message: "Something went wrong",
  });
});

module.exports = app;
