// Creates (or resets) the admin account.
// Usage:  npm run seed:admin
// Override the defaults with ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME in .env.
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createAdmin() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const email = (process.env.ADMIN_EMAIL || "admin@medibook.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "Admin@12345";
    const name = process.env.ADMIN_NAME || "MediBook Admin";

    if (password.length < 8) {
      throw new Error("ADMIN_PASSWORD must be at least 8 characters long");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let admin = await User.findOne({ email });

    if (admin) {
      admin.name = name;
      admin.role = "admin";
      admin.password = hashedPassword;
      await admin.save();

      console.log("Admin account updated successfully!");
    } else {
      await User.create({
        name,
        email,
        password: hashedPassword,
        role: "admin",
      });

      console.log("Admin account created successfully!");
    }

    console.log("Email:", email);
    console.log("Password:", password);
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

createAdmin();
