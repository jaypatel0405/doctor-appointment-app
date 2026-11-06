// Shared test setup: an in-memory MongoDB (never Atlas) and the Express app.
// Environment variables must be set before the app is required.
const { MongoMemoryServer } = require("mongodb-memory-server");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing";
process.env.BCRYPT_ROUNDS = "4";
process.env.RATE_LIMIT_REGISTER_MAX = "1000";
process.env.RATE_LIMIT_BOOKING_MAX = "1000";
process.env.RATE_LIMIT_LOGIN_MAX = "8";
delete process.env.VERCEL;
delete process.env.CORS_ORIGINS;
delete process.env.SMTP_HOST; // never send real email from tests

let mongod;

async function startTestApp() {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri("medibook-test");

  const app = require("../app");
  const { connectDB } = require("../db");
  const models = ["User", "Doctor", "Appointment", "Notification"].map((name) =>
    require(`../models/${name}`)
  );

  await connectDB();
  // autoIndex is off in the app; create indexes the way `npm run db:indexes` does.
  await Promise.all(models.map((model) => model.createIndexes()));

  return app;
}

async function stopTestApp() {
  const { disconnectDB } = require("../db");
  await disconnectDB().catch(() => {});
  if (mongod) await mongod.stop();
  mongod = null;
}

async function stopDatabaseOnly() {
  if (mongod) await mongod.stop();
  mongod = null;
}

module.exports = { startTestApp, stopTestApp, stopDatabaseOnly };
