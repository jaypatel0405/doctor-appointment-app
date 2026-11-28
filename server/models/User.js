
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    password: {
      type: String,
      required: true,
    },

    role: {
      type: String,
      enum: ["patient", "doctor", "admin"],
      default: "patient",
    },

    phone: {
      type: String,
      default: "",
    },

    age: {
      type: Number,
      default: null,
    },

    gender: {
      type: String,
      default: "",
    },

    // false until a new patient enters the code emailed at sign-up.
    // Accounts created before email verification existed have no value and
    // are treated as verified (only an explicit false blocks sign-in).
    emailVerified: {
      type: Boolean,
    },

    // The pending verification code (hash only). Never selected by default.
    emailOtp: {
      type: new mongoose.Schema(
        {
          codeHash: String,
          expiresAt: Date,
          attempts: { type: Number, default: 0 },
          sentAt: Date,
        },
        { _id: false }
      ),
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// Admin patient list (role filter, newest first). Email is unique (above).
userSchema.index({ role: 1, createdAt: -1 });

module.exports = mongoose.model("User", userSchema);
