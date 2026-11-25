const Counter = require("../models/Counter");
const { todayString } = require("./constants");

const PAYMENT_METHODS = ["Cash", "UPI", "Card"];

// The next receipt number for the clinic's current year: MB-2026-00001, MB-2026-00002, ...
// One sequence per year; the $inc is atomic, so concurrent completions never share a number.
async function nextReceiptNumber() {
  const year = todayString().slice(0, 4);

  const counter = await Counter.findOneAndUpdate(
    { _id: `receipt-${year}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).lean();

  return `MB-${year}-${String(counter.seq).padStart(5, "0")}`;
}

// The receipt issued when the clinic marks an appointment completed.
async function buildReceipt(appointment, { method, issuedBy }) {
  return {
    number: await nextReceiptNumber(),
    amount: Number(appointment.fee) || 0,
    currency: "INR",
    method: PAYMENT_METHODS.includes(method) ? method : "Cash",
    issuedAt: new Date(),
    issuedBy: issuedBy || "MediBook+ clinic",
  };
}

module.exports = { PAYMENT_METHODS, buildReceipt, nextReceiptNumber };
