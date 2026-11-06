const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { validate, rules } = require("../middleware/validate");
const { loginLimiter, registerLimiter } = require("../middleware/security");
const { signToken, hashPassword, verifyPassword, upgradePasswordHash } = require("../utils/tokens");
const { handle, isDuplicateKey } = require("../utils/errors");

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

    if (await User.exists({ email })) return alreadyRegistered();

    let user;

    try {
      user = await User.create({
        name,
        email,
        password: await hashPassword(password),
        role: "patient",
      });
    } catch (error) {
      // Two simultaneous sign-ups with the same email: the unique index wins.
      if (isDuplicateKey(error)) return alreadyRegistered();
      throw error;
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

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token: signToken(user),
      user: publicUser(user),
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
