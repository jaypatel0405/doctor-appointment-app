
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    // Patient information
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    patientName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    patientEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
    },

    // Doctor information
    doctorId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 24,
    },

    doctorName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    specialty: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    fee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Appointment date and time
    appointmentDate: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },

    appointmentTime: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "10:00 AM",
        "11:00 AM",
        "12:00 PM",
        "2:00 PM",
        "3:00 PM",
        "4:00 PM",
      ],
    },

    // Reason for appointment
    reason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 500,
    },

    // Appointment status
    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Cancelled",
        "Completed",
      ],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

// ---------- Indexes ----------
// Created by `npm run db:indexes` (autoIndex is off; see db.js).

// Patient's own list, newest first: GET /api/appointments
appointmentSchema.index({ patient: 1, createdAt: -1 });

// Admin list, newest first: GET /api/appointments/admin
appointmentSchema.index({ createdAt: -1 });

// Slot lookups: GET /api/appointments/booked and the booking conflict check.
appointmentSchema.index({
  doctorId: 1,
  appointmentDate: 1,
  appointmentTime: 1,
  status: 1,
});

// Legacy records matched by doctor name in the same lookups.
appointmentSchema.index({ doctorName: 1, appointmentDate: 1 });

// Race-safe double-booking guard: at most one active (not cancelled)
// appointment per doctor, date and time. Two simultaneous bookings for the
// same slot cannot both be inserted; the loser gets a duplicate-key error
// which the API reports as 409.
appointmentSchema.index(
  { doctorId: 1, appointmentDate: 1, appointmentTime: 1 },
  {
    name: "unique_active_slot",
    unique: true,
    partialFilterExpression: { status: { $in: ["Pending", "Confirmed", "Completed"] } },
  }
);

module.exports = mongoose.model(
  "Appointment",
  appointmentSchema
);
