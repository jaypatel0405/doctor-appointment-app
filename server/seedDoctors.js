// Inserts the starter doctors once (skips if the doctors collection has data).
// Usage:  npm run seed:doctors   (uses MONGO_URI from .env or the environment)
// Safe to re-run: it never modifies or duplicates existing doctors.
require("dotenv").config({ quiet: true });

const { connectDB, disconnectDB } = require("./db");
const { seedDoctors } = require("./utils/seedDoctors");

async function run() {
  try {
    await connectDB({ onlyMongo: true });

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
    await disconnectDB();
  }
}

run();
