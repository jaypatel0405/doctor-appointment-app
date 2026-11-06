
const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

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

// ======================================
// GET PATIENT PROFILE
// GET /api/profile
// ======================================
router.get("/", authMiddleware, async (req, res) => {
  try {
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
  } catch (error) {
    console.error("Get profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch profile",
    });
  }
});

// ======================================
// UPDATE PATIENT PROFILE
// PUT /api/profile
// ======================================
router.put("/", authMiddleware, async (req, res) => {
  try {
    const { name, phone, age, gender } = req.body;

    const hasEditableField =
      name !== undefined ||
      phone !== undefined ||
      age !== undefined ||
      gender !== undefined;

    if (!hasEditableField) {
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

    // Validate and update name.
    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid name",
        });
      }

      user.name = name.trim();
    }

    // Validate and update phone.
    if (phone !== undefined) {
      const cleanPhone = String(phone).trim();

      if (cleanPhone && !/^[+\d][\d\s-]{6,19}$/.test(cleanPhone)) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid phone number",
        });
      }

      user.phone = cleanPhone;
    }

    // Validate and update age.
    if (age !== undefined) {
      if (age === null || age === "") {
        user.age = null;
      } else {
        const numericAge = Number(age);

        if (
          !Number.isInteger(numericAge) ||
          numericAge < 0 ||
          numericAge > 120
        ) {
          return res.status(400).json({
            success: false,
            message: "Please enter a valid age",
          });
        }

        user.age = numericAge;
      }
    }

    // Validate and update gender.
    if (gender !== undefined) {
      const cleanGender = String(gender).trim();

      if (!GENDERS.includes(cleanGender)) {
        return res.status(400).json({
          success: false,
          message: "Please select a valid gender option",
        });
      }

      user.gender = cleanGender;
    }

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile: publicProfile(user),
    });
  } catch (error) {
    console.error("Update profile error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
});

module.exports = router;
