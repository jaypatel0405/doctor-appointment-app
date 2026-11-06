const Doctor = require("../models/Doctor");

// Starter doctors inserted the first time the server runs against an empty database.
const DEFAULT_DOCTORS = [
  {
    name: "Dr. Sarah Johnson",
    specialty: "Cardiologist",
    experience: 10,
    fee: 800,
    rating: 4.9,
    bio: "Heart specialist focused on preventive cardiology and long-term care.",
  },
  {
    name: "Dr. Michael Chen",
    specialty: "Dermatologist",
    experience: 8,
    fee: 600,
    rating: 4.8,
    bio: "Treats skin, hair and nail conditions for adults and children.",
  },
  {
    name: "Dr. Emily Davis",
    specialty: "Pediatrician",
    experience: 12,
    fee: 700,
    rating: 4.9,
    bio: "Caring for newborns through teenagers with a gentle approach.",
  },
  {
    name: "Dr. James Wilson",
    specialty: "Neurologist",
    experience: 15,
    fee: 1000,
    rating: 4.7,
    bio: "Expert in migraine, epilepsy and nerve disorders.",
  },
  {
    name: "Dr. Priya Patel",
    specialty: "Dentist",
    experience: 7,
    fee: 500,
    rating: 4.8,
    bio: "General and cosmetic dentistry with painless procedures.",
  },
  {
    name: "Dr. David Miller",
    specialty: "Orthopedic",
    experience: 11,
    fee: 900,
    rating: 4.8,
    bio: "Bone, joint and sports injury specialist.",
  },
];

// Returns the number of doctors inserted (0 when the collection already has data).
async function seedDoctors() {
  const count = await Doctor.countDocuments();

  if (count > 0) return 0;

  await Doctor.insertMany(DEFAULT_DOCTORS);

  return DEFAULT_DOCTORS.length;
}

module.exports = { seedDoctors, DEFAULT_DOCTORS };
