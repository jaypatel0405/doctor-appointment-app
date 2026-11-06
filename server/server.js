const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/authRoutes");
const profileRoutes = require("./routes/profileRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const appointmentRoutes = require("./routes/appointmentRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const { seedDoctors } = require("./utils/seedDoctors");
const { isConfigured: isMailConfigured } = require("./utils/mailer");

const app = express();

// ========================================
// MIDDLEWARE
// ========================================
const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    // When CLIENT_ORIGIN is not set, allow any origin (handy in development).
    origin: allowedOrigins.length ? allowedOrigins : true,
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

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing from .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully!");

    const seeded = await seedDoctors();

    if (seeded > 0) {
      console.log(`Seeded ${seeded} starter doctors.`);
    }

    app.listen(PORT, () => {
      console.log("----------------------------------");
      console.log("MediBook+ Backend Started");
      console.log("----------------------------------");
      console.log(`Server running on port ${PORT}`);
      console.log(`Email notifications: ${isMailConfigured() ? "enabled" : "disabled (no SMTP settings)"}`);
      console.log("GET    /api/health");
      console.log("POST   /api/auth/register");
      console.log("POST   /api/auth/login");
      console.log("POST   /api/auth/admin-login");
      console.log("GET    /api/auth/me");
      console.log("GET    /api/profile");
      console.log("PUT    /api/profile");
      console.log("GET    /api/doctors");
      console.log("POST   /api/doctors            (admin)");
      console.log("PUT    /api/doctors/:id        (admin)");
      console.log("DELETE /api/doctors/:id        (admin)");
      console.log("POST   /api/appointments");
      console.log("GET    /api/appointments");
      console.log("GET    /api/appointments/booked");
      console.log("GET    /api/appointments/admin (admin)");
      console.log("PUT    /api/appointments/:id/status (admin)");
      console.log("PUT    /api/appointments/:id/cancel");
      console.log("PUT    /api/appointments/:id/reschedule");
      console.log("GET    /api/notifications");
      console.log("PUT    /api/notifications/read-all");
      console.log("GET    /api/admin/stats        (admin)");
      console.log("GET    /api/admin/patients     (admin)");
      console.log("----------------------------------");
    });
  } catch (error) {
    console.error("Server startup error:", error.message);

    if (/whitelist|ECONNREFUSED|querySrv|ENOTFOUND/i.test(error.message)) {
      console.error(
        "Hint: check that MongoDB is running and, for Atlas, that your current IP address is allowed under Network Access."
      );
    }

    process.exit(1);
  }
}

startServer();

module.exports = app;
