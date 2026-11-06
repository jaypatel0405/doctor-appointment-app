const express = require("express");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { validate, rules } = require("../middleware/validate");
const { handle } = require("../utils/errors");

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

// ---------- validation schemas ----------

const idParams = {
  params: { id: rules.objectId({ required: true, message: "Invalid doctor ID" }) },
};

// Empty strings / null count as "not provided" (except bio, which may be cleared).
function doctorBody({ partial }) {
  return {
    name: rules.string({
      required: !partial,
      min: 2,
      max: 100,
      requiredMessage: "Doctor name is required.",
      message: "Doctor name must contain at least 2 characters.",
      maxMessage: "Doctor name must be at most 100 characters.",
    }),
    specialty: rules.string({
      required: !partial,
      min: 2,
      max: 100,
      requiredMessage: "Specialty is required.",
      message: "Specialty must contain at least 2 characters.",
      maxMessage: "Specialty must be at most 100 characters.",
    }),
    fee: rules.number({
      required: !partial,
      min: 0,
      max: 1000000,
      requiredMessage: "Consultation fee is required.",
      message: "Fee must be a valid non-negative number.",
    }),
    experience: rules.number({
      min: 0,
      max: 80,
      message: "Experience must be a valid non-negative number.",
    }),
    rating: rules.number({ min: 0, max: 5, message: "Rating must be between 0 and 5." }),
    bio: rules.string({
      allowEmpty: true,
      max: 1000,
      message: "Bio must be at most 1000 characters.",
    }),
    available: rules.boolean({ message: "Availability must be true or false." }),
  };
}

// ======================================
// GET ALL DOCTORS - PUBLIC
// GET /api/doctors
// ======================================
router.get(
  "/",
  handle("Unable to fetch doctors", async (req, res) => {
    const doctors = await Doctor.find().sort({ createdAt: 1 }).lean();

    return res.status(200).json({
      success: true,
      doctors: doctors.map(publicDoctor),
    });
  })
);

// ======================================
// GET ONE DOCTOR - PUBLIC
// GET /api/doctors/:id
// ======================================
router.get(
  "/:id",
  validate(idParams),
  handle("Unable to fetch doctor", async (req, res) => {
    const doctor = await Doctor.findById(req.valid.params.id).lean();

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
  })
);

// ======================================
// ADD DOCTOR - ADMIN ONLY
// POST /api/doctors
// ======================================
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  validate({ body: doctorBody({ partial: false }) }),
  handle("Unable to add doctor", async (req, res) => {
    const doctor = await Doctor.create(req.body);

    return res.status(201).json({
      success: true,
      message: "Doctor added successfully",
      doctor: publicDoctor(doctor),
    });
  })
);

// ======================================
// UPDATE DOCTOR - ADMIN ONLY
// PUT /api/doctors/:id
// ======================================
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate({ ...idParams, body: doctorBody({ partial: true }) }),
  handle("Unable to update doctor", async (req, res) => {
    const { id } = req.valid.params;
    const output = req.body;

    if (Object.keys(output).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one doctor field to update.",
      });
    }

    const doctor = await Doctor.findByIdAndUpdate(id, { $set: output }, {
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

      if (output.name) updates.doctorName = output.name;
      if (output.specialty) updates.specialty = output.specialty;

      await Appointment.updateMany({ doctorId: id }, { $set: updates });
    }

    return res.status(200).json({
      success: true,
      message: "Doctor updated successfully",
      doctor: publicDoctor(doctor),
    });
  })
);

// ======================================
// DELETE DOCTOR - ADMIN ONLY
// DELETE /api/doctors/:id
// ======================================
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  validate(idParams),
  handle("Unable to delete doctor", async (req, res) => {
    const { id } = req.valid.params;

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
  })
);

module.exports = router;
