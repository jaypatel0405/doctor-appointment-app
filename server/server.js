// Local entry: connect to MongoDB, seed starter doctors if empty, listen on PORT.
require("dotenv").config();

const app = require("./app");
const { connectDB } = require("./db");
const { seedDoctors } = require("./utils/seedDoctors");
const { isConfigured: isMailConfigured } = require("./utils/mailer");

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    console.log("MongoDB connected successfully!");

    // Idempotent and cheap: a single count query when doctors already exist.
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

