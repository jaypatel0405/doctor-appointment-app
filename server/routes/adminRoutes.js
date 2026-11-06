const express = require("express");
const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Appointment = require("../models/Appointment");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { handle } = require("../utils/errors");

const router = express.Router();

// Every route in this file requires an admin token.
router.use(authMiddleware, adminMiddleware);

// GET /api/admin/stats - counts for the dashboard overview
router.get(
  "/stats",
  handle("Unable to load statistics", async (req, res) => {
    const [doctors, patients, statusCounts] = await Promise.all([
      Doctor.countDocuments(),
      User.countDocuments({ role: "patient" }),
      Appointment.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ]);

    const appointments = {
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
    };

    for (const row of statusCounts) {
      const key = String(row._id || "").toLowerCase();
      if (key in appointments) appointments[key] = row.count;
      appointments.total += row.count;
    }

    return res.status(200).json({
      success: true,
      stats: { doctors, patients, appointments },
    });
  })
);

// GET /api/admin/patients - registered patients with their booking counts
router.get(
  "/patients",
  handle("Unable to load patients", async (req, res) => {
    const [patients, counts] = await Promise.all([
      User.find({ role: "patient" })
        .select("name email phone age gender createdAt")
        .sort({ createdAt: -1 })
        .lean(),
      Appointment.aggregate([
        {
          $group: {
            _id: "$patient",
            total: { $sum: 1 },
            lastDate: { $max: "$appointmentDate" },
          },
        },
      ]),
    ]);

    const countByPatient = new Map(counts.map((row) => [String(row._id), row]));

    const result = patients.map((patient) => {
      const row = countByPatient.get(String(patient._id));

      return {
        id: String(patient._id),
        name: patient.name,
        email: patient.email,
        phone: patient.phone || "",
        age: patient.age ?? null,
        gender: patient.gender || "",
        joinedAt: patient.createdAt,
        appointmentCount: row ? row.total : 0,
        lastAppointmentDate: row ? row.lastDate : null,
      };
    });

    return res.status(200).json({
      success: true,
      patients: result,
    });
  })
);

module.exports = router;
