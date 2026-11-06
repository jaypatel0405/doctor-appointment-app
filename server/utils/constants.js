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

// Returns true when the date is before today (server local time).
function isPastDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date < today;
}

module.exports = {
  TIME_SLOTS,
  APPOINTMENT_STATUSES,
  isValidDateString,
  isPastDate,
};
