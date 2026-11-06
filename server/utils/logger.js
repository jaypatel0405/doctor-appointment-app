// Minimal structured logger: one JSON line per event on stdout/stderr, which
// Vercel and most log tools index automatically. Never pass secrets, tokens,
// passwords or patient details as fields.
//
// LOG_LEVEL: debug | info | warn | error | silent (default: info, silent in tests)

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function threshold() {
  const configured = String(process.env.LOG_LEVEL || "").toLowerCase();

  if (configured in LEVELS) return LEVELS[configured];

  return process.env.NODE_ENV === "test" ? LEVELS.silent : LEVELS.info;
}

function serializeError(error) {
  if (!error) return undefined;

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    stack: error.stack,
  };
}

function write(level, event, fields = {}) {
  if (LEVELS[level] < threshold()) return;

  const entry = { time: new Date().toISOString(), level, event };

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    entry[key] = value instanceof Error ? serializeError(value) : value;
  }

  const line = JSON.stringify(entry);

  if (LEVELS[level] >= LEVELS.warn) {
    console.error(line);
  } else {
    console.log(line);
  }
}

module.exports = {
  debug: (event, fields) => write("debug", event, fields),
  info: (event, fields) => write("info", event, fields),
  warn: (event, fields) => write("warn", event, fields),
  error: (event, fields) => write("error", event, fields),
};
