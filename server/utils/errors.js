// Error helpers shared by routes and the central error handler (app.js).

// An error whose message is safe to show to the client.
class HttpError extends Error {
  constructor(status, message, { errors, headers } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = true;
    if (errors) this.errors = errors;
    if (headers) this.headers = headers;
  }
}

// Raised when MongoDB cannot be reached (or the server is not configured).
class ServiceUnavailableError extends HttpError {
  constructor(message = "Service temporarily unavailable. Please try again shortly.") {
    super(503, message, { headers: { "Retry-After": "5" } });
    this.name = "ServiceUnavailableError";
  }
}

const DB_UNAVAILABLE_NAMES = new Set([
  "MongooseServerSelectionError",
  "MongoServerSelectionError",
  "MongoNetworkError",
  "MongoNetworkTimeoutError",
  "MongoNotConnectedError",
  "MongoTopologyClosedError",
  "MongoPoolClearedError",
]);

function isDatabaseUnavailable(error) {
  if (!error) return false;
  if (DB_UNAVAILABLE_NAMES.has(error.name)) return true;

  // Thrown by Mongoose when bufferCommands is false and there is no connection.
  return /before initial connection is complete|Client must be connected/i.test(
    error.message || ""
  );
}

function isDuplicateKey(error) {
  return Boolean(error) && error.code === 11000;
}

// Wraps an async route handler so an unexpected failure reaches the central
// error handler with a route-specific, client-safe fallback message
// (e.g. "Unable to book appointment") instead of a generic one.
function handle(fallbackMessage, handler) {
  return async function wrappedHandler(req, res, next) {
    try {
      await handler(req, res, next);
    } catch (error) {
      if (error && typeof error === "object" && !error.publicMessage) {
        error.publicMessage = fallbackMessage;
      }
      next(error);
    }
  };
}

module.exports = {
  HttpError,
  ServiceUnavailableError,
  isDatabaseUnavailable,
  isDuplicateKey,
  handle,
};
