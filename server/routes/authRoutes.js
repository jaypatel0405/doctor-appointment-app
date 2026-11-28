const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { validate, rules } = require("../middleware/validate");
const { loginLimiter, registerLimiter, otpLimiter } = require("../middleware/security");
const { signToken, hashPassword, verifyPassword, upgradePasswordHash } = require("../utils/tokens");
const { handle, isDuplicateKey } = require("../utils/errors");
const { verificationRequired, issueCode, checkCode, OTP_LENGTH } = require("../utils/emailOtp");

const router = express.Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Shape of the user object sent to the browser.
// Never includes the password.
const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || "",
  age: user.age ?? null,
  gender: user.gender || "",
});

// ---------- validation schemas ----------

const registerSchema = {
  body: {
    name: rules.string({
      required: true,
      min: 2,
      max: 100,
      requiredMessage: "Please provide name, email and password.",
      message: "Please enter your full name.",
      maxMessage: "Name must be at most 100 characters.",
    }),
    email: rules.string({
      required: true,
      lowercase: true,
      max: 254,
      pattern: EMAIL_PATTERN,
      requiredMessage: "Please provide name, email and password.",
      message: "Please enter a valid email address.",
    }),
    password: rules.string({
      required: true,
      trim: false,
      min: 8,
      max: 128,
      requiredMessage: "Please provide name, email and password.",
      minMessage: "Password must be at least 8 characters long.",
      maxMessage: "Password must be at most 128 characters long.",
      message: "Please provide a valid password.",
    }),
  },
};

const emailRule = rules.string({
  required: true,
  lowercase: true,
  max: 254,
  pattern: EMAIL_PATTERN,
  requiredMessage: "Please enter your email address.",
  message: "Please enter a valid email address.",
});

const verifySchema = {
  body: {
    email: emailRule,
    code: rules.string({
      required: true,
      pattern: new RegExp(`^\\d{${OTP_LENGTH}}$`),
      requiredMessage: `Please enter the ${OTP_LENGTH}-digit code.`,
      message: `The code is ${OTP_LENGTH} digits.`,
    }),
  },
};

const resendSchema = { body: { email: emailRule } };

// Response telling the browser to show the code screen for this email.
function needsVerification(res, status, email, sendResult, intro) {
  let message = `${intro} We sent a ${OTP_LENGTH}-digit code to ${email}.`;

  if (sendResult.wait) {
    message = `${intro} Enter the code we sent to ${email}. You can request a new one in ${sendResult.wait} seconds.`;
  } else if (sendResult.error) {
    message = `${intro} We could not send the code to ${email} right now. Please press "Send a new code".`;
  }

  return res.status(status).json({
    success: status < 400,
    needsVerification: true,
    email,
    retryAfter: sendResult.wait || 0,
    message,
  });
}

const loginSchema = (requiredMessage) => ({
  body: {
    email: rules.string({ required: true, lowercase: true, max: 254, requiredMessage }),
    // Generous max: bounds hashing work without rejecting older long passwords.
    password: rules.string({ required: true, trim: false, max: 1024, requiredMessage }),
  },
});

// ======================================
// PATIENT REGISTRATION
// POST /api/auth/register
// ======================================
router.post(
  "/register",
  registerLimiter,
  validate(registerSchema),
  handle("Registration failed.", async (req, res) => {
    const { name, email, password } = req.body;

    const alreadyRegistered = () =>
      res.status(409).json({
        success: false,
        message: "Email is already registered.",
      });

    const verify = verificationRequired();
    const existing = await User.findOne({ email }).select("+emailOtp");

    // An unverified sign-up can be repeated (new name/password, new code), so a
    // typo or someone else's earlier attempt never locks the real owner out.
    if (existing && !(verify && existing.role === "patient" && existing.emailVerified === false)) {
      return alreadyRegistered();
    }

    let user = existing;

    try {
      if (user) {
        user.name = name;
        user.password = await hashPassword(password);
        await user.save();
      } else {
        user = await User.create({
          name,
          email,
          password: await hashPassword(password),
          role: "patient",
          ...(verify ? { emailVerified: false } : {}),
        });
      }
    } catch (error) {
      // Two simultaneous sign-ups with the same email: the unique index wins.
      if (isDuplicateKey(error)) return alreadyRegistered();
      throw error;
    }

    if (verify) {
      const sent = await issueCode(user, { ignoreCooldown: !existing });
      return needsVerification(res, 201, email, sent, "Account created. Verify your email to sign in.");
    }

    return res.status(201).json({
      success: true,
      message: "Registration successful.",
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

// ======================================
// PATIENT LOGIN
// POST /api/auth/login
// ======================================
router.post(
  "/login",
  loginLimiter,
  validate(loginSchema("Please provide email and password.")),
  handle("Login failed.", async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });

    // The password is always checked first (also for unknown emails, against a
    // dummy hash) so responses and timing don't reveal which emails exist.
    const isMatch = await verifyPassword(password, user ? user.password : null);

    if (!user || !isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    await upgradePasswordHash(user, password);

    if (user.role === "admin") {
      return res.status(403).json({
        success: false,
        message: "Please use the admin login page.",
      });
    }

    if (user.emailVerified === false && verificationRequired()) {
      const pending = await User.findById(user._id).select("+emailOtp");
      const sent = await issueCode(pending);
      return needsVerification(res, 403, email, sent, "Please verify your email before signing in.");
    }

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

// ======================================
// VERIFY EMAIL (code from the sign-up email)
// POST /api/auth/verify-email  { email, code }
// Success signs the patient in.
// ======================================
router.post(
  "/verify-email",
  otpLimiter,
  validate(verifySchema),
  handle("Verification failed.", async (req, res) => {
    const { email, code } = req.body;
    const user = await User.findOne({ email, role: "patient" }).select("+emailOtp");

    if (!user) {
      return res.status(400).json({ success: false, message: "Incorrect code. Check the email and try again." });
    }

    if (user.emailVerified !== false) {
      return res.status(409).json({
        success: false,
        message: "This email is already verified. Please sign in.",
      });
    }

    const result = await checkCode(user, code);

    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: true,
      message: "Email verified.",
      token: signToken(user),
      user: publicUser(user),
    });
  })
);

// ======================================
// SEND A NEW VERIFICATION CODE
// POST /api/auth/resend-code  { email }
// ======================================
router.post(
  "/resend-code",
  otpLimiter,
  validate(resendSchema),
  handle("Could not send a new code.", async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email, role: "patient", emailVerified: false }).select("+emailOtp");

    // Same answer for unknown and already-verified emails.
    if (!user) {
      return res.status(200).json({
        success: true,
        retryAfter: 60,
        message: `If ${email} is waiting for verification, a new code is on its way.`,
      });
    }

    const sent = await issueCode(user);

    if (sent.wait) {
      return res.status(429).json({
        success: false,
        retryAfter: sent.wait,
        message: `Please wait ${sent.wait} seconds before requesting a new code.`,
      });
    }

    if (sent.error) {
      return res.status(503).json({
        success: false,
        message: "We could not send the email right now. Please try again in a minute.",
      });
    }

    return res.status(200).json({
      success: true,
      retryAfter: 60,
      message: `A new code was sent to ${email}.`,
    });
  })
);

// ======================================
// ADMIN LOGIN
// POST /api/auth/admin-login
// ======================================
router.post(
  "/admin-login",
  loginLimiter,
  validate(loginSchema("Please provide admin email and password.")),
  handle("Admin login failed.", async (req, res) => {
    const { email, password } = req.body;

    const admin = await User.findOne({ email, role: "admin" });
    const isMatch = await verifyPassword(password, admin ? admin.password : null);

    if (!admin || !isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid admin email or password.",
      });
    }

    await upgradePasswordHash(admin, password);

    const user = publicUser(admin);

    return res.status(200).json({
      success: true,
      message: "Admin login successful.",
      token: signToken(admin),
      user,
      admin: user,
    });
  })
);

// ======================================
// CURRENT USER
// GET /api/auth/me
// Restore session using saved token.
// ======================================
router.get(
  "/me",
  authMiddleware,
  handle("Could not load user.", async (req, res) => {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    return res.status(200).json({
      success: true,
      user: publicUser(user),
    });
  })
);

module.exports = router;
