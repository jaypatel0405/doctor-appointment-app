// Central runtime configuration read from environment variables.
// Values are read lazily (functions) where tests or scripts may change the
// environment after this module is first required.

const isProduction = () =>
  process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

const isTest = () => process.env.NODE_ENV === "test";

function intFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Recommended minimum length of JWT_SECRET (256 bits of entropy for HS256 when
// generated randomly, e.g. `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).
const JWT_MIN_SECRET_LENGTH = 32;

const REQUIRED_ENV = ["MONGO_URI", "JWT_SECRET"];

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// Returns human-readable configuration warnings (never includes values).
function configWarnings() {
  const warnings = [];
  const secret = process.env.JWT_SECRET || "";

  if (secret && secret.length < JWT_MIN_SECRET_LENGTH) {
    warnings.push(
      `JWT_SECRET is shorter than ${JWT_MIN_SECRET_LENGTH} characters; use a long random value.`
    );
  }

  if (isProduction() && !process.env.CORS_ORIGINS && !process.env.CLIENT_ORIGIN) {
    warnings.push(
      "CORS_ORIGINS is not set; only same-origin and local development origins are allowed."
    );
  }

  return warnings;
}

module.exports = {
  isProduction,
  isTest,
  intFromEnv,
  missingEnv,
  configWarnings,
  JWT_MIN_SECRET_LENGTH,
  jwt: {
    algorithm: "HS256",
    expiresIn: () => process.env.JWT_EXPIRES_IN || "1d",
  },
  // bcrypt cost factor for new password hashes (existing hashes keep working).
  bcryptRounds: () => Math.min(Math.max(intFromEnv("BCRYPT_ROUNDS", 12), 4), 15),
  // IANA time zone used to decide what "today" is when validating dates.
  timeZone: () => process.env.APP_TIMEZONE || "Asia/Kolkata",
};
