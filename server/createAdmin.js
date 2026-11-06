// Creates the admin account, or resets the password of an existing admin.
// Usage:  npm run seed:admin
// ADMIN_PASSWORD is required (no default, min 12 characters).
// ADMIN_EMAIL / ADMIN_NAME are optional.
// Safe to re-run. Refuses to turn an existing patient account into an admin.
require("dotenv").config({ quiet: true });

const User = require("./models/User");
const { connectDB, disconnectDB } = require("./db");
const { hashPassword } = require("./utils/tokens");

const MIN_ADMIN_PASSWORD = 12;

async function createAdmin() {
  try {
    const email = String(process.env.ADMIN_EMAIL || "admin@medibook.com").trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "";
    const name = String(process.env.ADMIN_NAME || "MediBook Admin").trim();

    if (!password) {
      throw new Error("ADMIN_PASSWORD is required (set it in .env or the environment)");
    }

    if (password.length < MIN_ADMIN_PASSWORD || password.length > 128) {
      throw new Error(`ADMIN_PASSWORD must be ${MIN_ADMIN_PASSWORD}-128 characters long`);
    }

    await connectDB({ onlyMongo: true });

    const existing = await User.findOne({ email });

    if (existing && existing.role !== "admin") {
      throw new Error(
        `${email} belongs to a ${existing.role} account. Use a different ADMIN_EMAIL.`
      );
    }

    const hashedPassword = await hashPassword(password);

    if (existing) {
      existing.name = name;
      existing.password = hashedPassword;
      await existing.save();
      console.log("Admin account updated (password reset).");
    } else {
      await User.create({ name, email, password: hashedPassword, role: "admin" });
      console.log("Admin account created.");
    }

    console.log("Email:", email);
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

createAdmin();
