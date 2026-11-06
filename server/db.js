// Cached MongoDB connection shared by the local server (server.js) and the
// Vercel serverless function (api/index.js). Warm serverless invocations reuse
// the same connection instead of opening a new one per request.
const mongoose = require("mongoose");

// Fail fast instead of queueing queries forever when the DB is unreachable.
mongoose.set("bufferCommands", false);

const cache = globalThis.__medibookMongo || (globalThis.__medibookMongo = { promise: null });

function missingEnv() {
  return ["MONGO_URI", "JWT_SECRET"].filter((name) => !process.env[name]);
}

async function connectDB() {
  const missing = missingEnv();

  if (missing.length) {
    const error = new Error(`Missing environment variable(s): ${missing.join(", ")}`);
    error.code = "ENV_MISSING";
    throw error;
  }

  if (mongoose.connection.readyState === 1) return mongoose.connection;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 5,
      })
      .catch((error) => {
        cache.promise = null; // allow a retry on the next request
        throw error;
      });
  }

  await cache.promise;
  return mongoose.connection;
}

module.exports = { connectDB, missingEnv };
