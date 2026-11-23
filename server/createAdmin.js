// Creates the admin account, or resets the password of an existing admin.
// Usage:  npm run seed:admin
// ADMIN_PASSWORD is required (no default, min 12 characters).
// ADMIN_EMAIL / ADMIN_NAME are optional.
// Run in a terminal without ADMIN_PASSWORD and it asks for the email, name and
// password instead (the password is not shown as you type).
// Safe to re-run. Refuses to turn an existing patient account into an admin.
require("dotenv").config({ quiet: true });

const readline = require("node:readline");

const User = require("./models/User");
const { connectDB, disconnectDB } = require("./db");
const { hashPassword } = require("./utils/tokens");

const MIN_ADMIN_PASSWORD = 12;

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

    if (hidden) {
      // echo nothing but the prompt itself while the password is typed
      rl._writeToOutput = (text) => {
        if (text.includes(question)) rl.output.write(text);
      };
    }

    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function askForDetails() {
  const email = (await ask("Staff email [admin@medibook.com]: ")).trim() || "admin@medibook.com";
  const name = (await ask("Name [MediBook Admin]: ")).trim() || "MediBook Admin";
  const password = await ask(`Password (${MIN_ADMIN_PASSWORD}-128 characters, hidden): `, { hidden: true });
  const again = await ask("Password again: ", { hidden: true });

  if (password !== again) {
    throw new Error("The two passwords do not match");
  }

  return { email, name, password };
}

async function createAdmin() {
  try {
    const interactive = !process.env.ADMIN_PASSWORD && process.stdin.isTTY;
    const details = interactive ? await askForDetails() : {};

    const email = String(details.email || process.env.ADMIN_EMAIL || "admin@medibook.com").trim().toLowerCase();
    const password = details.password || process.env.ADMIN_PASSWORD || "";
    const name = String(details.name || process.env.ADMIN_NAME || "MediBook Admin").trim();

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
