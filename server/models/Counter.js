const mongoose = require("mongoose");

// Named sequences (e.g. "receipt-2026"), advanced atomically with $inc so two
// requests never get the same number.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

module.exports = mongoose.model("Counter", counterSchema);
