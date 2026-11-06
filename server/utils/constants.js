const { timeZone } = require("../config");

// Appointment time slots offered by the clinic (stored exactly as shown).
const TIME_SLOTS = [
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
];

const APPOINTMENT_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];

// Statuses that occupy a doctor's time slot (everything except Cancelled).
const ACTIVE_STATUSES = ["Pending", "Confirmed", "Completed"];

// Appointments in these statuses can no longer be changed.
const CLOSED_STATUSES = ["Cancelled", "Completed"];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Returns true when the given YYYY-MM-DD string is a real calendar date.
// Compares local date parts (not UTC) so time zones never shift the day.
function isValidDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// Today's date as YYYY-MM-DD in the clinic's time zone (APP_TIMEZONE, default
// Asia/Kolkata), so "today" does not depend on the server's own time zone
// (Vercel functions run in UTC).
function todayString(now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone(),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // Unknown time zone name: fall back to the server's local date.
    const pad = (n) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }
}

// Returns true when the YYYY-MM-DD date is before today (clinic time zone).
function isPastDate(value) {
  return value < todayString();
}

// The clinic's current date and time as "YYYY-MM-DD HH:MM" (24-hour), in APP_TIMEZONE.
function nowStamp(now = new Date()) {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timeZone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value])
    );
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
  } catch {
    return `${todayString(now)} 00:00`;
  }
}

// "2:00 PM" -> "14:00"; anything unreadable sorts as the start of the day.
function slotTo24h(slot) {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(slot).trim());
  if (!match) return "00:00";
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

// Returns true once the appointment's date and time slot have begun (clinic time zone).
function hasStarted(date, slot, now = new Date()) {
  return `${date} ${slotTo24h(slot)}` <= nowStamp(now);
}

// How far ahead appointments may be booked.
const MAX_DAYS_AHEAD = 730;

// Returns true when the YYYY-MM-DD date is more than MAX_DAYS_AHEAD days away.
function isTooFarAhead(value) {
  const [year, month, day] = todayString().split("-").map(Number);
  const limit = new Date(Date.UTC(year, month - 1, day + MAX_DAYS_AHEAD));

  return value > limit.toISOString().slice(0, 10);
}

module.exports = {
  TIME_SLOTS,
  APPOINTMENT_STATUSES,
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  DATE_PATTERN,
  MAX_DAYS_AHEAD,
  isValidDateString,
  isPastDate,
  isTooFarAhead,
  hasStarted,
  todayString,
};
