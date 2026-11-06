// Vercel serverless function: serves the whole Express API for /api/* (see the
// rewrite in vercel.json). The MongoDB connection is cached across warm
// invocations; seeding is NOT done here (run `npm run seed:doctors` once).
const app = require("../server/app");
const { connectDB } = require("../server/db");

module.exports = async function handler(req, res) {
  try {
    await connectDB();
  } catch (error) {
    console.error("Database connection error:", error.message);

    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    return res.end(
      JSON.stringify({
        success: false,
        message:
          error.code === "ENV_MISSING"
            ? "Server is not configured: " + error.message
            : "Database connection failed",
      })
    );
  }

  return app(req, res);
};
