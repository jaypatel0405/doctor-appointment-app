
const express = require("express");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const router = express.Router();

// Shape sent to the browser.
const publicDoctor = (doctor) => ({
  id: String(doctor._id),
  name: doctor.name,
  specialty: doctor.specialty,
  experience: doctor.experience,
  fee: doctor.fee,
  rating: doctor.rating,
  bio: doctor.bio || "",
  available: doctor.available !== false,
});

// Validate and normalize doctor input.
function parseDoctorInput(body, { partial = false } = {}) {
  const errors = [];
  const output = {};

  const has = (key) =>
    body[key] !== undefined &&
    body[key] !== null &&
    body[key] !== "";

  if (has("name")) {
    const name = String(body.name).trim();

    if (name.length < 2) {
      errors.push("Doctor name must contain at least 2 characters.");
    }

    output.name = name;
  } else if (!partial) {
    errors.push("Doctor name is required.");
  }

  if (has("specialty")) {
    const specialty = String(body.specialty).trim();

    if (specialty.length < 2) {
      errors.push("Specialty must contain at least 2 characters.");
    }

    output.specialty = specialty;
  } else if (!partial) {
    errors.push("Specialty is required.");
  }

  if (has("fee")) {
    const fee = Number(body.fee);

    if (!Number.isFinite(fee) || fee < 0) {
      errors.push("Fee must be a valid non-negative number.");
    } else {
      output.fee = fee;
    }
  } else if (!partial) {
    errors.push("Consultation fee is required.");
  }

  if (has("experience")) {
    const experience = Number(body.experience);

    if (!Number.isFinite(experience) || experience < 0) {
      errors.push("Experience must be a valid non-negative number.");
    } else {
      output.experience = experience;
    }
  }

  if (has("rating")) {
    const rating = Number(body.rating);

    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      errors.push("Rating must be between 0 and 5.");
    } else {
      output.rating = rating;
    }
  }

  if (body.bio !== undefined) {
    output.bio = String(body.bio).trim();
  }

  if (body.available !== undefined) {
    if (typeof body.available === "boolean") {
      output.available = body.available;
    } else if (body.available === "true") {
      output.available = true;
    } else if (body.available === "false") {
      output.available = false;
    } else {
      errors.push("Availability must be true or false.");
    }
  }

  return { errors, output };
}

// ======================================
// GET ALL DOCTORS - PUBLIC
// GET /api/doctors
// ======================================
router.get("/", async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      doctors: doctors.map(publicDoctor),
    });
  } catch (error) {
    console.error("Get doctors error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctors",
    });
  }
});

// ======================================
// GET ONE DOCTOR - PUBLIC
// GET /api/doctors/:id
// ======================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const doctor = await Doctor.findById(id).lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    return res.status(200).json({
      success: true,
      doctor: publicDoctor(doctor),
    });
  } catch (error) {
    console.error("Get doctor error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch doctor",
    });
  }
});

// ======================================
// ADD DOCTOR - ADMIN ONLY
// POST /api/doctors
// ======================================
router.post("/", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { errors, output } = parseDoctorInput(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
      });
    }

    const doctor = await Doctor.create(output);

    return res.status(201).json({
      success: true,
      message: "Doctor added successfully",
      doctor: publicDoctor(doctor),
    });
  } catch (error) {
    console.error("Add doctor error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to add doctor",
    });
  }
});

// ======================================
// UPDATE DOCTOR - ADMIN ONLY
// PUT /api/doctors/:id
// ======================================
router.put("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const { errors, output } = parseDoctorInput(req.body, {
      partial: true,
    });

    if (errors.length) {
      return res.status(400).json({
        success: false,
        message: errors[0],
      });
    }

    if (Object.keys(output).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one doctor field to update.",
      });
    }

    const doctor = await Doctor.findByIdAndUpdate(id, output, {
      new: true,
      runValidators: true,
    });

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    // Keep appointment details synchronized with updated doctor details.
    if (output.name || output.specialty) {
      const updates = {};

      if (output.name) {
        updates.doctorName = output.name;
      }

      if (output.specialty) {
        updates.specialty = output.specialty;
      }

      await Appointment.updateMany(
        { doctorId: id },
        { $set: updates }
      );
    }

    return res.status(200).json({
      success: true,
      message: "Doctor updated successfully",
      doctor: publicDoctor(doctor),
    });
  } catch (error) {
    console.error("Update doctor error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update doctor",
    });
  }
});

// ======================================
// DELETE DOCTOR - ADMIN ONLY
// DELETE /api/doctors/:id
// ======================================
router.delete("/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid doctor ID",
      });
    }

    const activeAppointments = await Appointment.countDocuments({
      doctorId: id,
      status: { $in: ["Pending", "Confirmed"] },
    });

    if (activeAppointments > 0) {
      return res.status(409).json({
        success: false,
        message:
          "This doctor has active appointments. Complete or cancel them before deleting.",
      });
    }

    const doctor = await Doctor.findByIdAndDelete(id);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Doctor deleted successfully",
    });
  } catch (error) {
    console.error("Delete doctor error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete doctor",
    });
  }
});

module.exports = router;
