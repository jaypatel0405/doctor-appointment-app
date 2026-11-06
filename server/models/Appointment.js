
const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    // Patient information
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
      index: true,
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Improve appointment lookup and sorting.
appointmentSchema.index({
  patient: 1,
  createdAt: -1,
});

appointmentSchema.index({
  doctorId: 1,
  appointmentDate: 1,
  appointmentTime: 1,
  status: 1,
});

module.exports = mongoose.model(
  "Appointment",
  appointmentSchema
);
