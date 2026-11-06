// Inserts the starter doctors once (skips if the doctors collection has data).
// Usage:  npm run seed:doctors   (uses MONGO_URI from .env or the environment)
require("dotenv").config();

const mongoose = require("mongoose");
const { seedDoctors } = require("./utils/seedDoctors");

async function run() {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is missing from .env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    const seeded = await seedDoctors();

    console.log(
      seeded > 0
        ? `Seeded ${seeded} starter doctors.`
        : "Doctors already exist - nothing to seed."
    );
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
