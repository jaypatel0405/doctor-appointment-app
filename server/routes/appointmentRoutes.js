
const express = require("express");
const mongoose = require("mongoose");

const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const Notification = require("../models/Notification");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

const { sendMail } = require("../utils/mailer");

const {
  TIME_SLOTS,
  APPOINTMENT_STATUSES,
  isValidDateString,
  isPastDate,
} = require("../utils/constants");

const router = express.Router();

// ---------- HELPERS ----------

// Validate appointment date and time.
function validateSlot(appointmentDate, appointmentTime) {
  if (!appointmentDate || !appointmentTime) {
    return "Appointment date and time are required";
  }

  if (!isValidDateString(appointmentDate)) {
    return "Appointment date must be in YYYY-MM-DD format";
  }

  if (isPastDate(appointmentDate)) {
    return "Please select today or a future date";
  }

  if (!TIME_SLOTS.includes(appointmentTime)) {
    return "Please select a valid appointment time";
  }

  return null;
}

// Find another appointment for the same doctor and slot.
function slotConflictQuery(
  { doctorId, doctorName },
  appointmentDate,
  appointmentTime,
  excludeId
) {
  const doctorMatch = [
    { doctorId: String(doctorId) },
  ];

  if (doctorName) {
    doctorMatch.push({ doctorName });
  }

  const query = {
    $or: doctorMatch,
    appointmentDate,
    appointmentTime,
    status: { $ne: "Cancelled" },
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  return query;
}

// Create notification and send optional email.
async function notifyPatient(appointment, title, message) {
  try {
    await Notification.create({
      user: appointment.patient,
      appointment: appointment._id,
      title,
      message,
      status: appointment.status,
    });
  } catch (error) {
    console.error("Notification error:", error.message);
  }

  try {
    await sendMail({
      to: appointment.patientEmail,
      subject: `MediBook+ - ${title}`,
      text: `Hello ${appointment.patientName},

${message}

Thank you for choosing MediBook+.`,
    });
  } catch (error) {
    console.error("Email sending error:", error.message);
  }
}

// Format appointment details.
function describeSlot(appointment) {
  return `${appointment.doctorName} on ${appointment.appointmentDate} at ${appointment.appointmentTime}`;
}

// ---------- BOOK APPOINTMENT - PATIENT ----------

router.post("/", authMiddleware, async (req, res) => {
  try {
    const {
      doctorId,
      appointmentDate,
      appointmentTime,
      reason,
    } = req.body;

    if (!doctorId || !mongoose.isValidObjectId(doctorId)) {
      return res.status(400).json({
        success: false,
        message: "Please select a valid doctor",
      });
    }

    const slotError = validateSlot(
      appointmentDate,
      appointmentTime
    );

    if (slotError) {
      return res.status(400).json({
        success: false,
        message: slotError,
      });
    }

    const [doctor, patient] = await Promise.all([
      Doctor.findById(doctorId),
      User.findById(req.user.userId),
    ]);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    if (doctor.available === false) {
      return res.status(400).json({
        success: false,
        message: "This doctor is not accepting appointments right now",
      });
    }

    if (!patient || patient.role !== "patient") {
      return res.status(403).json({
        success: false,
        message: "Only registered patients can book appointments",
      });
    }

    // Check whether the selected slot is already booked.
    const existingAppointment = await Appointment.findOne(
      slotConflictQuery(
        {
          doctorId: doctor._id,
          doctorName: doctor.name,
        },
        appointmentDate,
        appointmentTime
      )
    );

    if (existingAppointment) {
      return res.status(409).json({
        success: false,
        message: "This doctor already has an appointment at this time",
      });
    }

    // Create appointment.
    const appointment = await Appointment.create({
      patient: patient._id,
      patientName: patient.name,
      patientEmail: patient.email,
      doctorId: String(doctor._id),
      doctorName: doctor.name,
      specialty: doctor.specialty,
      fee: doctor.fee,
      appointmentDate,
      appointmentTime,
      reason:
        typeof reason === "string"
          ? reason.trim().slice(0, 500)
          : "",
      status: "Pending",
    });

    await notifyPatient(
      appointment,
      "Appointment request received",
      `Your appointment with ${describeSlot(
        appointment
      )} has been received and is waiting for confirmation.`
    );

    return res.status(201).json({
      success: true,
      message: "Appointment booked successfully",
      appointment,
    });
  } catch (error) {
    console.error("Book appointment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to book appointment",
    });
  }
});

// ---------- GET PATIENT'S APPOINTMENTS ----------

router.get("/", authMiddleware, async (req, res) => {
  try {
    const appointments = await Appointment.find({
      patient: req.user.userId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      appointments,
    });
  } catch (error) {
    console.error("Get appointments error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch appointments",
    });
  }
});

// ---------- GET BOOKED TIME SLOTS ----------

router.get("/booked", authMiddleware, async (req, res) => {
  try {
    const { doctorId, date, exclude } = req.query;

    if (
      !doctorId ||
      !mongoose.isValidObjectId(doctorId) ||
      !isValidDateString(String(date || ""))
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid doctorId and date are required",
      });
    }

    const doctor = await Doctor.findById(doctorId)
      .select("name")
      .lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const doctorMatch = [
      { doctorId: String(doctorId) },
      { doctorName: doctor.name },
    ];

    const query = {
      $or: doctorMatch,
      appointmentDate: date,
      status: { $ne: "Cancelled" },
    };

    if (exclude && mongoose.isValidObjectId(exclude)) {
      query._id = { $ne: exclude };
    }

    const appointments = await Appointment.find(query)
      .select("appointmentTime")
      .lean();

    const bookedTimes = [
      ...new Set(
        appointments.map((item) => item.appointmentTime)
      ),
    ];

    return res.status(200).json({
      success: true,
      bookedTimes,
      timeSlots: TIME_SLOTS,
    });
  } catch (error) {
    console.error("Booked slots error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to check availability",
    });
  }
});

// ---------- GET ALL APPOINTMENTS - ADMIN ----------

router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const appointments = await Appointment.find()
        .sort({ createdAt: -1 })
        .lean();

      return res.status(200).json({
        success: true,
        appointments,
      });
    } catch (error) {
      console.error("Admin get appointments error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to fetch all appointments",
      });
    }
  }
);

// ---------- UPDATE APPOINTMENT STATUS - ADMIN ----------

router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment ID",
        });
      }

      if (!APPOINTMENT_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid appointment status",
        });
      }

      const appointment = await Appointment.findById(id);

      if (!appointment) {
        return res.status(404).json({
          success: false,
          message: "Appointment not found",
        });
      }

      if (
        appointment.status === "Cancelled" ||
        appointment.status === "Completed"
      ) {
        return res.status(400).json({
          success: false,
          message: "This appointment is already closed",
        });
      }

      if (appointment.status === status) {
        return res.status(400).json({
          success: false,
          message: `This appointment is already ${status.toLowerCase()}`,
        });
      }

      appointment.status = status;
      await appointment.save();

      const messages = {
        Confirmed: `Your appointment with ${describeSlot(
          appointment
        )} has been confirmed. Please arrive 10 minutes early.`,

        Completed: `Your appointment with ${describeSlot(
          appointment
        )} has been marked as completed. We hope you are feeling better!`,

        Cancelled: `Your appointment with ${describeSlot(
          appointment
        )} was cancelled by the clinic. Please book another slot.`,

        Pending: `Your appointment with ${describeSlot(
          appointment
        )} is pending confirmation.`,
      };

      await notifyPatient(
        appointment,
        `Appointment ${status.toLowerCase()}`,
        messages[status]
      );

      return res.status(200).json({
        success: true,
        message: `Appointment ${status.toLowerCase()} successfully`,
        appointment,
      });
    } catch (error) {
      console.error("Admin update appointment error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to update appointment status",
      });
    }
  }
);

// ---------- CANCEL APPOINTMENT - PATIENT ----------

router.put("/:id/cancel", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      patient: req.user.userId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      appointment.status === "Cancelled" ||
      appointment.status === "Completed"
    ) {
      return res.status(400).json({
        success: false,
        message: "This appointment cannot be cancelled",
      });
    }

    appointment.status = "Cancelled";
    await appointment.save();

    await notifyPatient(
      appointment,
      "Appointment cancelled",
      `You cancelled your appointment with ${describeSlot(
        appointment
      )}.`
    );

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      appointment,
    });
  } catch (error) {
    console.error("Cancel appointment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to cancel appointment",
    });
  }
});

// ---------- RESCHEDULE APPOINTMENT - PATIENT ----------

router.put("/:id/reschedule", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { appointmentDate, appointmentTime } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID",
      });
    }

    const slotError = validateSlot(
      appointmentDate,
      appointmentTime
    );

    if (slotError) {
      return res.status(400).json({
        success: false,
        message: slotError,
      });
    }

    const appointment = await Appointment.findOne({
      _id: id,
      patient: req.user.userId,
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (
      appointment.status === "Cancelled" ||
      appointment.status === "Completed"
    ) {
      return res.status(400).json({
        success: false,
        message: "This appointment cannot be rescheduled",
      });
    }

    if (
      appointment.appointmentDate === appointmentDate &&
      appointment.appointmentTime === appointmentTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Please choose a different date or time",
      });
    }

    const conflict = await Appointment.findOne(
      slotConflictQuery(
        {
          doctorId: appointment.doctorId,
          doctorName: appointment.doctorName,
        },
        appointmentDate,
        appointmentTime,
        appointment._id
      )
    );

    if (conflict) {
      return res.status(409).json({
        success: false,
        message: "This doctor already has an appointment at this time",
      });
    }

    appointment.appointmentDate = appointmentDate;
    appointment.appointmentTime = appointmentTime;
    appointment.status = "Pending";

    await appointment.save();

    await notifyPatient(
      appointment,
      "Appointment rescheduled",
      `Your appointment with ${describeSlot(
        appointment
      )} has been rescheduled and is waiting for confirmation.`
    );

    return res.status(200).json({
      success: true,
      message: "Appointment rescheduled successfully",
      appointment,
    });
  } catch (error) {
    console.error("Reschedule appointment error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to reschedule appointment",
    });
  }
});

module.exports = router;
