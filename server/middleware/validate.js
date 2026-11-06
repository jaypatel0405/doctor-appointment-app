// Small, dependency-free request validator.
//
// Usage:
//   router.post("/", validate({ body: { name: rules.string({ required: true, min: 2 }) } }), handler)
//
// Each rule checks type strictly (a string field never accepts an object or
// array, which also blocks NoSQL operator injection such as {"$gt": ""}),
// trims strings and enforces lengths/ranges/enums. Only declared fields are
// kept: the cleaned body replaces req.body, cleaned query/params are exposed
// as req.valid.query / req.valid.params (Express 5 makes req.query read-only).
//
// On failure the response is
//   400 { success: false, message: "<first error>", errors: [{ field, message }] }

const { isValidDateString } = require("../utils/constants");

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

// ---------- rule builders ----------

function string(options = {}) {
  return { type: "string", trim: true, ...options };
}

function number(options = {}) {
  return { type: "number", ...options };
}

function boolean(options = {}) {
  return { type: "boolean", ...options };
}

function objectId(options = {}) {
  return { type: "objectId", ...options };
}

function date(options = {}) {
  return { type: "date", ...options };
}

function oneOf(values, options = {}) {
  return { type: "string", trim: true, oneOf: values, ...options };
}

const rules = { string, number, boolean, objectId, date, oneOf };

// ---------- checking ----------

const fail = (message) => ({ error: message });

function checkString(rule, raw) {
  if (typeof raw !== "string") return fail(rule.message || "Must be text");

  let value = rule.trim ? raw.trim() : raw;
  if (rule.lowercase) value = value.toLowerCase();
  if (rule.truncate) value = value.slice(0, rule.truncate);

  if (rule.min !== undefined && value.length < rule.min) {
    return fail(rule.minMessage || rule.message || `Must be at least ${rule.min} characters`);
  }

  if (rule.max !== undefined && value.length > rule.max) {
    return fail(rule.maxMessage || rule.message || `Must be at most ${rule.max} characters`);
  }

  if (rule.pattern && value !== "" && !rule.pattern.test(value)) {
    return fail(rule.message || "Has an invalid format");
  }

  if (rule.oneOf && !rule.oneOf.includes(value)) {
    return fail(rule.message || `Must be one of: ${rule.oneOf.filter(Boolean).join(", ")}`);
  }

  return { value };
}

function checkNumber(rule, raw) {
  let value = raw;

  // Accept numeric strings from HTML form fields ("800").
  if (typeof raw === "string" && raw.trim() !== "") value = Number(raw.trim());

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(rule.message || "Must be a number");
  }

  if (rule.integer && !Number.isInteger(value)) return fail(rule.message || "Must be a whole number");
  if (rule.min !== undefined && value < rule.min) return fail(rule.message || `Must be at least ${rule.min}`);
  if (rule.max !== undefined && value > rule.max) return fail(rule.message || `Must be at most ${rule.max}`);

  return { value };
}

function checkBoolean(rule, raw) {
  if (typeof raw === "boolean") return { value: raw };
  if (raw === "true") return { value: true };
  if (raw === "false") return { value: false };

  return fail(rule.message || "Must be true or false");
}

function checkObjectId(rule, raw) {
  if (typeof raw !== "string" || !OBJECT_ID_PATTERN.test(raw.trim())) {
    return fail(rule.message || "Invalid ID");
  }

  return { value: raw.trim() };
}

function checkDate(rule, raw) {
  if (typeof raw !== "string" || !isValidDateString(raw.trim())) {
    return fail(rule.message || "Date must be in YYYY-MM-DD format");
  }

  const value = raw.trim();

  if (rule.check) {
    const problem = rule.check(value);
    if (problem) return fail(problem);
  }

  return { value };
}

const CHECKERS = {
  string: checkString,
  number: checkNumber,
  boolean: checkBoolean,
  objectId: checkObjectId,
  date: checkDate,
};

// Returns { value } | { error } | { skip: true } for one field.
function checkField(rule, raw) {
  const blankString = typeof raw === "string" && raw.trim() === "";
  const absent = raw === undefined || raw === null || (blankString && !rule.allowEmpty);

  if (absent) {
    if (rule.required) return fail(rule.requiredMessage || rule.message || "This field is required");
    if (rule.nullable && raw !== undefined) return { value: null };
    if (rule.allowEmpty && raw === null) return { value: "" };
    if (rule.default !== undefined) return { value: rule.default };
    return { skip: true };
  }

  return CHECKERS[rule.type](rule, raw);
}

function checkObject(schema, input, errors) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const output = {};

  for (const [field, rule] of Object.entries(schema)) {
    const result = checkField(rule, Object.prototype.hasOwnProperty.call(source, field) ? source[field] : undefined);

    if (result.error) {
      errors.push({ field, message: result.error });
    } else if (!result.skip) {
      output[field] = result.value;
    }
  }

  return output;
}

// Express middleware factory. `schemas` may contain body, query and params.
function validate(schemas) {
  return function validateRequest(req, res, next) {
    const errors = [];
    const valid = {};

    for (const part of ["params", "query", "body"]) {
      if (schemas[part]) valid[part] = checkObject(schemas[part], req[part], errors);
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0].message,
        errors,
      });
    }

    req.valid = valid;
    if (valid.body) req.body = valid.body;

    return next();
  };
}

module.exports = { validate, rules, OBJECT_ID_PATTERN };
