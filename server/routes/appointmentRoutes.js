const express = require("express");

const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const User = require("../models/User");
const Notification = require("../models/Notification");

const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const { validate, rules, OBJECT_ID_PATTERN } = require("../middleware/validate");
const { bookingLimiter } = require("../middleware/security");

const { sendMail } = require("../utils/mailer");
const { handle, isDuplicateKey } = require("../utils/errors");
const logger = require("../utils/logger");

const {
  TIME_SLOTS,
  APPOINTMENT_STATUSES,
  CLOSED_STATUSES,
  MAX_DAYS_AHEAD,
  isPastDate,
  hasStarted,
  isTooFarAhead,
} = require("../utils/constants");

const router = express.Router();

// ---------- VALIDATION SCHEMAS ----------

const appointmentIdParams = {
  params: { id: rules.objectId({ required: true, message: "Invalid appointment ID" }) },
};

const SLOT_REQUIRED = "Appointment date and time are required";

const slotBody = {
  appointmentDate: rules.date({
    required: true,
    requiredMessage: SLOT_REQUIRED,
    message: "Appointment date must be in YYYY-MM-DD format",
    check: (value) => {
      if (isPastDate(value)) return "Please select today or a future date";
      if (isTooFarAhead(value)) {
        return `Please select a date within the next ${Math.round(MAX_DAYS_AHEAD / 365)} years`;
      }
      return null;
    },
  }),
  appointmentTime: rules.oneOf(TIME_SLOTS, {
    required: true,
    requiredMessage: SLOT_REQUIRED,
    message: "Please select a valid appointment time",
  }),
};

const bookSchema = {
  body: {
    doctorId: rules.objectId({ required: true, message: "Please select a valid doctor" }),
    ...slotBody,
    // Over-long reasons are truncated (historical behaviour), not rejected.
    reason: rules.string({ allowEmpty: true, truncate: 500, default: "", message: "Reason must be text" }),
  },
};

const bookedQuerySchema = {
  query: {
    doctorId: rules.objectId({ required: true, message: "A valid doctorId and date are required" }),
    date: rules.date({ required: true, message: "A valid doctorId and date are required" }),
    // Optional appointment to ignore (when rescheduling); invalid values are ignored.
    exclude: rules.string({ max: 24 }),
  },
};

const statusSchema = {
  ...appointmentIdParams,
  body: {
    status: rules.oneOf(APPOINTMENT_STATUSES, {
      required: true,
      message: "Invalid appointment status",
    }),
  },
};

const rescheduleSchema = { ...appointmentIdParams, body: slotBody };

// ---------- HELPERS ----------

const SLOT_TAKEN_MESSAGE = "This doctor already has an appointment at this time";
const CHANGED_MESSAGE =
  "This appointment was just updated. Please refresh and try again.";

// Find another active appointment for the same doctor and slot. Matching by
// name as well covers older records saved with a different doctorId.
function slotConflictQuery({ doctorId, doctorName }, appointmentDate, appointmentTime, excludeId) {
  const doctorMatch = [{ doctorId: String(doctorId) }];

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

const MAIL_TIMEOUT_MS = 4000;

// Create notification and send optional email. Never fails the request.
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
    logger.error("notification.create_failed", { error: { name: error.name, message: error.message } });
  }

  // Bounded so a slow SMTP server cannot hold the response (or a serverless
  // function) open; the send itself continues in the background.
  let timer;

  try {
    await Promise.race([
      sendMail({
        to: appointment.patientEmail,
        subject: `MediBook+ - ${title}`,
        text: `Hello ${appointment.patientName},

${message}

Thank you for choosing MediBook+.`,
      }),
      new Promise((resolve) => {
        timer = setTimeout(resolve, MAIL_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    logger.error("email.send_failed", { error: { name: error.name, message: error.message } });
  } finally {
    clearTimeout(timer);
  }
}

// Format a YYYY-MM-DD date the way the app shows it ("Sun, 8 Nov, 2026").
function formatSlotDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Format appointment details.
function describeSlot(appointment) {
  return `${appointment.doctorName} on ${formatSlotDate(appointment.appointmentDate)} at ${appointment.appointmentTime}`;
}

// ---------- BOOK APPOINTMENT - PATIENT ----------

router.post(
  "/",
  authMiddleware,
  bookingLimiter,
  validate(bookSchema),
  handle("Unable to book appointment", async (req, res) => {
    const { doctorId, appointmentDate, appointmentTime, reason } = req.body;

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

    const slotTaken = () =>
      res.status(409).json({
        success: false,
        message: SLOT_TAKEN_MESSAGE,
      });

    // Friendly early check (also covers legacy records matched by name)...
    const existingAppointment = await Appointment.exists(
      slotConflictQuery(
        { doctorId: doctor._id, doctorName: doctor.name },
        appointmentDate,
        appointmentTime
      )
    );

    if (existingAppointment) return slotTaken();

    let appointment;

    try {
      appointment = await Appointment.create({
        patient: patient._id,
        patientName: patient.name,
        patientEmail: patient.email,
        doctorId: String(doctor._id),
        doctorName: doctor.name,
        specialty: doctor.specialty,
        fee: doctor.fee,
        appointmentDate,
        appointmentTime,
        reason,
        status: "Pending",
      });
    } catch (error) {
      // ...and the unique slot index settles simultaneous bookings.
      if (isDuplicateKey(error)) return slotTaken();
      throw error;
    }

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
  })
);

// ---------- GET PATIENT'S APPOINTMENTS ----------

router.get(
  "/",
  authMiddleware,
  handle("Unable to fetch appointments", async (req, res) => {
    const appointments = await Appointment.find({
      patient: req.user.userId,
    }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      appointments,
    });
  })
);

// ---------- GET BOOKED TIME SLOTS ----------

router.get(
  "/booked",
  authMiddleware,
  validate(bookedQuerySchema),
  handle("Unable to check availability", async (req, res) => {
    const { doctorId, date, exclude } = req.valid.query;

    const doctor = await Doctor.findById(doctorId).select("name").lean();

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
      });
    }

    const query = {
      $or: [{ doctorId: String(doctorId) }, { doctorName: doctor.name }],
      appointmentDate: date,
      status: { $ne: "Cancelled" },
    };

    if (exclude && OBJECT_ID_PATTERN.test(exclude)) {
      query._id = { $ne: exclude };
    }

    const appointments = await Appointment.find(query).select("appointmentTime").lean();

    const bookedTimes = [...new Set(appointments.map((item) => item.appointmentTime))];

    return res.status(200).json({
      success: true,
      bookedTimes,
      timeSlots: TIME_SLOTS,
    });
  })
);

// ---------- GET ALL APPOINTMENTS - ADMIN ----------

router.get(
  "/admin",
  authMiddleware,
  adminMiddleware,
  handle("Unable to fetch all appointments", async (req, res) => {
    const appointments = await Appointment.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      appointments,
    });
  })
);

// ---------- UPDATE APPOINTMENT STATUS - ADMIN ----------

router.put(
  "/:id/status",
  authMiddleware,
  adminMiddleware,
  validate(statusSchema),
  handle("Unable to update appointment status", async (req, res) => {
    const { id } = req.valid.params;
    const { status } = req.body;

    const current = await Appointment.findById(id);

    if (!current) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (CLOSED_STATUSES.includes(current.status)) {
      return res.status(400).json({
        success: false,
        message: "This appointment is already closed",
      });
    }

    if (current.status === status) {
      return res.status(400).json({
        success: false,
        message: `This appointment is already ${status.toLowerCase()}`,
      });
    }

    if (status === "Completed" && !hasStarted(current.appointmentDate, current.appointmentTime)) {
      return res.status(400).json({
        success: false,
        message: "An appointment can only be marked completed once its time has passed",
      });
    }

    // Only apply the change if nobody else changed the status meanwhile.
    const appointment = await Appointment.findOneAndUpdate(
      { _id: id, status: current.status },
      { $set: { status } },
      { new: true, runValidators: true }
    );

    if (!appointment) {
      return res.status(409).json({ success: false, message: CHANGED_MESSAGE });
    }

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

    await notifyPatient(appointment, `Appointment ${status.toLowerCase()}`, messages[status]);

    return res.status(200).json({
      success: true,
      message: `Appointment ${status.toLowerCase()} successfully`,
      appointment,
    });
  })
);

// ---------- CANCEL APPOINTMENT - PATIENT ----------

router.put(
  "/:id/cancel",
  authMiddleware,
  validate(appointmentIdParams),
  handle("Unable to cancel appointment", async (req, res) => {
    const { id } = req.valid.params;

    const current = await Appointment.findOne({ _id: id, patient: req.user.userId });

    if (!current) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (CLOSED_STATUSES.includes(current.status)) {
      return res.status(400).json({
        success: false,
        message: "This appointment cannot be cancelled",
      });
    }

    const appointment = await Appointment.findOneAndUpdate(
      { _id: id, patient: req.user.userId, status: current.status },
      { $set: { status: "Cancelled" } },
      { new: true }
    );

    if (!appointment) {
      return res.status(409).json({ success: false, message: CHANGED_MESSAGE });
    }

    await notifyPatient(
      appointment,
      "Appointment cancelled",
      `You cancelled your appointment with ${describeSlot(appointment)}.`
    );

    return res.status(200).json({
      success: true,
      message: "Appointment cancelled successfully",
      appointment,
    });
  })
);

// ---------- RESCHEDULE APPOINTMENT - PATIENT ----------

router.put(
  "/:id/reschedule",
  authMiddleware,
  bookingLimiter,
  validate(rescheduleSchema),
  handle("Unable to reschedule appointment", async (req, res) => {
    const { id } = req.valid.params;
    const { appointmentDate, appointmentTime } = req.body;

    const current = await Appointment.findOne({ _id: id, patient: req.user.userId });

    if (!current) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    if (CLOSED_STATUSES.includes(current.status)) {
      return res.status(400).json({
        success: false,
        message: "This appointment cannot be rescheduled",
      });
    }

    if (current.appointmentDate === appointmentDate && current.appointmentTime === appointmentTime) {
      return res.status(400).json({
        success: false,
        message: "Please choose a different date or time",
      });
    }

    const slotTaken = () =>
      res.status(409).json({
        success: false,
        message: SLOT_TAKEN_MESSAGE,
      });

    const conflict = await Appointment.exists(
      slotConflictQuery(
        { doctorId: current.doctorId, doctorName: current.doctorName },
        appointmentDate,
        appointmentTime,
        current._id
      )
    );

    if (conflict) return slotTaken();

    let appointment;

    try {
      // Conditional on the record being unchanged since it was read.
      appointment = await Appointment.findOneAndUpdate(
        {
          _id: id,
          patient: req.user.userId,
          status: current.status,
          appointmentDate: current.appointmentDate,
          appointmentTime: current.appointmentTime,
        },
        { $set: { appointmentDate, appointmentTime, status: "Pending" } },
        { new: true, runValidators: true }
      );
    } catch (error) {
      if (isDuplicateKey(error)) return slotTaken();
      throw error;
    }

    if (!appointment) {
      return res.status(409).json({ success: false, message: CHANGED_MESSAGE });
    }

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
  })
);

module.exports = router;
