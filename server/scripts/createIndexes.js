// Creates the MongoDB indexes declared in the models (idempotent).
// Usage:  npm run db:indexes        (uses MONGO_URI from .env or the environment)
//
// Run once after deploying this version, and again whenever a model's indexes
// change. It only ADDS missing indexes; it never drops existing ones.
//
// The "unique_active_slot" index (no two active appointments for the same
// doctor/date/time) cannot be built if such duplicates already exist. In that
// case the script lists them so they can be cancelled first, then re-run it.
require("dotenv").config({ quiet: true, path: require("node:path").join(__dirname, "..", ".env") });

const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { connectDB, disconnectDB } = require("../db");

async function findDuplicateSlots() {
  return Appointment.aggregate([
    { $match: { status: { $in: ["Pending", "Confirmed", "Completed"] } } },
    {
      $group: {
        _id: { doctorId: "$doctorId", date: "$appointmentDate", time: "$appointmentTime" },
        ids: { $push: "$_id" },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);
}

async function run() {
  try {
    await connectDB({ onlyMongo: true });

    let failed = false;

    for (const model of [User, Doctor, Appointment, Notification]) {
      try {
        await model.createIndexes();
        console.log(`${model.modelName}: indexes OK`);
      } catch (error) {
        failed = true;
        console.error(`${model.modelName}: ${error.message}`);
      }
    }

    if (failed) {
      const duplicates = await findDuplicateSlots();

      if (duplicates.length) {
        console.error("\nActive appointments sharing the same doctor/date/time:");
        for (const row of duplicates) {
          console.error(
            `  doctor ${row._id.doctorId} on ${row._id.date} at ${row._id.time}: ${row.ids.join(", ")}`
          );
        }
        console.error("Cancel all but one in each group, then run this script again.");
      }

      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

run();
