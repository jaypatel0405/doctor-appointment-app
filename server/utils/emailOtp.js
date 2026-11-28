// One-time codes that prove a new patient owns the email they registered with.
//
// A 6-digit code is emailed at sign-up (and again when an unverified account
// tries to sign in). Only an HMAC of the code is stored; it expires after
// OTP_TTL_MINUTES and is locked after OTP_MAX_ATTEMPTS wrong guesses.
//
// Verification is required when email can actually be sent (SMTP configured),
// and always outside production so it can be tried locally, where the code is
// written to the server log instead. EMAIL_VERIFICATION=on|off overrides this.

const crypto = require("node:crypto");
const config = require("../config");
const logger = require("./logger");
const { sendMail, isConfigured } = require("./mailer");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;

function verificationRequired() {
  const setting = String(process.env.EMAIL_VERIFICATION || "").trim().toLowerCase();

  if (["on", "true", "1"].includes(setting)) return true;
  if (["off", "false", "0"].includes(setting)) return false;

  return isConfigured() || !config.isProduction();
}

function hashCode(userId, code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET || "")
    .update(`email-otp:${userId}:${code}`)
    .digest("hex");
}

function codesMatch(user, code) {
  const stored = Buffer.from(String(user.emailOtp?.codeHash || ""), "hex");
  const given = Buffer.from(hashCode(user._id, code), "hex");
  return stored.length === given.length && crypto.timingSafeEqual(stored, given);
}

// Seconds until another code may be sent (0 when one can be sent now).
function resendWait(user, now = Date.now()) {
  const sentAt = user.emailOtp?.sentAt ? new Date(user.emailOtp.sentAt).getTime() : 0;
  const wait = Math.ceil((sentAt + OTP_RESEND_SECONDS * 1000 - now) / 1000);
  return Math.max(0, wait);
}

function codeEmail(name, code) {
  const text =
    `Hello ${name},\n\n` +
    `Your MediBook+ verification code is ${code}.\n\n` +
    `It expires in ${OTP_TTL_MINUTES} minutes. If you did not create a MediBook+ account, ignore this email.`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2a24;max-width:480px">
  <p>Hello ${escapeHtml(name)},</p>
  <p>Your MediBook+ verification code is:</p>
  <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:16px 0">${code}</p>
  <p>It expires in ${OTP_TTL_MINUTES} minutes. If you did not create a MediBook+ account, ignore this email.</p>
</div>`;

  return { subject: `${code} is your MediBook+ verification code`, text, html };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Creates a new code for the user, saves its hash and emails it.
// Returns { sent: true } | { wait: seconds } (cooldown) | { error: message }.
async function issueCode(user, { ignoreCooldown = false } = {}) {
  const wait = resendWait(user);
  if (!ignoreCooldown && wait > 0) return { wait };

  const code = String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
  const now = new Date();

  user.emailOtp = {
    codeHash: hashCode(user._id, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000),
    attempts: 0,
    sentAt: now,
  };
  await user.save();

  const result = await sendMail({ to: user.email, ...codeEmail(user.name, code) });

  if (result.skipped && !config.isProduction() && !config.isTest()) {
    // Local development without SMTP: show the code in the server log.
    logger.warn("email.verification_code", { email: user.email, code, note: "SMTP not configured" });
  }

  if (result.error) return { error: result.error };
  return { sent: true };
}

// Checks a code. Returns { ok: true } or { ok: false, status, message }.
// A wrong code counts towards the attempt limit; a correct one clears the code.
async function checkCode(user, code) {
  const otp = user.emailOtp;

  if (!otp?.codeHash) {
    return { ok: false, status: 400, message: "No code is waiting for this email. Request a new code." };
  }

  if (new Date(otp.expiresAt).getTime() < Date.now()) {
    return { ok: false, status: 400, message: "This code has expired. Request a new code." };
  }

  if ((otp.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, message: "Too many wrong codes. Request a new code." };
  }

  if (!codesMatch(user, code)) {
    // Atomic increment so parallel guesses cannot skip the limit.
    const updated = await user.constructor.findOneAndUpdate(
      { _id: user._id, "emailOtp.codeHash": otp.codeHash },
      { $inc: { "emailOtp.attempts": 1 } },
      { new: true, projection: { "emailOtp.attempts": 1 } }
    );
    const left = OTP_MAX_ATTEMPTS - (updated?.emailOtp?.attempts ?? OTP_MAX_ATTEMPTS);

    return left > 0
      ? { ok: false, status: 400, message: `Incorrect code. ${left} ${left === 1 ? "attempt" : "attempts"} left.` }
      : { ok: false, status: 429, message: "Too many wrong codes. Request a new code." };
  }

  user.emailVerified = true;
  user.emailOtp = undefined;
  await user.save();

  return { ok: true };
}

module.exports = {
  OTP_LENGTH,
  OTP_TTL_MINUTES,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_SECONDS,
  verificationRequired,
  issueCode,
  checkCode,
  resendWait,
};
