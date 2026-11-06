const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");
const { validate, rules } = require("../middleware/validate");
const { handle } = require("../utils/errors");

const router = express.Router();

const GENDERS = ["", "Male", "Female", "Other", "Prefer not to say"];

const publicProfile = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone || "",
  age: user.age ?? null,
  gender: user.gender || "",
  createdAt: user.createdAt,
});

const updateProfileSchema = {
  body: {
    name: rules.string({ allowEmpty: true, min: 2, max: 100, message: "Please enter a valid name" }),
    phone: rules.string({
      allowEmpty: true,
      max: 20,
      pattern: /^[+\d][\d\s-]{6,19}$/,
      message: "Please enter a valid phone number",
    }),
    age: rules.number({ nullable: true, integer: true, min: 0, max: 120, message: "Please enter a valid age" }),
    gender: rules.oneOf(GENDERS, { allowEmpty: true, message: "Please select a valid gender option" }),
  },
};

// ======================================
// GET PATIENT PROFILE
// GET /api/profile
// ======================================
router.get(
  "/",
  authMiddleware,
  handle("Unable to fetch profile", async (req, res) => {
    const user = await User.findById(req.user.userId).select("-password");

    if (!user || user.role !== "patient") {
      return res.status(404).json({
        success: false,
        message: "Patient profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      profile: publicProfile(user),
    });
  })
);

// ======================================
// UPDATE PATIENT PROFILE
// PUT /api/profile
// ======================================
router.put(
  "/",
  authMiddleware,
  validate(updateProfileSchema),
  handle("Unable to update profile", async (req, res) => {
    if (Object.keys(req.body).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one profile field to update",
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user || user.role !== "patient") {
      return res.status(404).json({
        success: false,
        message: "Patient profile not found",
      });
    }

    Object.assign(user, req.body);
    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile: publicProfile(user),
    });
  })
);

module.exports = router;
