// API tests: node:test + supertest against an in-memory MongoDB.
// Run with `npm --prefix server test`.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const jwt = require("jsonwebtoken");

const { startTestApp, stopTestApp } = require("./setup");

let app;
let User;
let Doctor;
let Appointment;
let hashPassword;
let todayString;

// YYYY-MM-DD n days after today (clinic time zone).
function dayOffset(days) {
  const [y, m, d] = todayString().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const api = () => request(app);

// A token with "alg": "none" (no signature) must never be accepted.
function unsignedToken(payload) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none", typ: "JWT" })}.${part(payload)}.`;
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function registerPatient(suffix) {
  const res = await api()
    .post("/api/auth/register")
    .send({ name: `Patient ${suffix}`, email: `patient.${suffix}@example.com`, password: "password123" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return { token: res.body.token, user: res.body.user };
}

let adminToken;
let patientA;
let patientB;
let doctor;

before(async () => {
  app = await startTestApp();
  User = require("../models/User");
  Doctor = require("../models/Doctor");
  Appointment = require("../models/Appointment");
  ({ hashPassword } = require("../utils/tokens"));
  ({ todayString } = require("../utils/constants"));

  await User.create({
    name: "Admin",
    email: "admin@example.com",
    password: await hashPassword("admin-password-123"),
    role: "admin",
  });

  doctor = await Doctor.create({ name: "Dr. Test", specialty: "Cardiologist", fee: 500 });
  patientA = await registerPatient("a");
  patientB = await registerPatient("b");

  const res = await api()
    .post("/api/auth/admin-login")
    .send({ email: "admin@example.com", password: "admin-password-123" });
  assert.equal(res.status, 200);
  adminToken = res.body.token;
});

after(stopTestApp);

// ------------------------------------------------------------------
describe("platform", () => {
  it("reports health with database state", async () => {
    const res = await api().get("/api/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.database, "connected");
  });

  it("returns JSON 404 for unknown API routes", async () => {
    const res = await api().get("/api/nope?secret=1");
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Route not found: GET /api/nope");
  });

  it("sets API security headers and no-store", async () => {
    const res = await api().get("/api/health");
    assert.equal(res.headers["x-content-type-options"], "nosniff");
    assert.match(res.headers["content-security-policy"], /default-src 'none'/);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.ok(res.headers["x-request-id"]);
    assert.equal(res.headers["x-powered-by"], undefined);
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await api()
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"email":');
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid JSON in request body");
  });

  it("rejects oversized bodies with 413", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "x@example.com", password: "a".repeat(30 * 1024) });
    assert.equal(res.status, 413);
    assert.equal(res.body.success, false);
  });
});

// ------------------------------------------------------------------
describe("auth", () => {
  it("registers a patient and never returns the password", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "  New Person ", email: "New.Person@Example.com ", password: "password123" });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, "new.person@example.com");
    assert.equal(res.body.user.name, "New Person");
    assert.equal(res.body.user.role, "patient");
    assert.equal(res.body.user.password, undefined);
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Dup", email: "patient.a@example.com", password: "password123" });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, "Email is already registered.");
  });

  it("validates registration input with a consistent error shape", async () => {
    const res = await api()
      .post("/api/auth/register")
      .send({ name: "Valid Name", email: "not-an-email", password: "short" });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
    assert.equal(res.body.message, "Please enter a valid email address.");
    assert.deepEqual(
      res.body.errors.map((e) => e.field),
      ["email", "password"]
    );

    const missing = await api().post("/api/auth/register").send({});
    assert.equal(missing.status, 400);
    assert.equal(missing.body.message, "Please provide name, email and password.");
  });

  it("blocks NoSQL operator injection in login", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: { $gt: "" }, password: { $gt: "" } });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });

  it("logs a patient in", async () => {
    const res = await api()
      .post("/api/auth/login")
      .send({ email: "PATIENT.A@example.com", password: "password123" });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, "patient.a@example.com");
  });

  it("uses the same 401 message for unknown email and wrong password", async () => {
    const wrong = await api()
      .post("/api/auth/login")
      .send({ email: "patient.a@example.com", password: "wrong-password" });
    const unknown = await api()
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong-password" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.body.message, unknown.body.message);
  });

  it("does not reveal admin accounts on the patient login without the password", async () => {
    const wrong = await api()
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "wrong-password" });
    assert.equal(wrong.status, 401);

    const right = await api()
      .post("/api/auth/login")
      .send({ email: "admin@example.com", password: "admin-password-123" });
    assert.equal(right.status, 403);
    assert.equal(right.body.message, "Please use the admin login page.");
  });

  it("rejects patients on the admin login", async () => {
    const res = await api()
      .post("/api/auth/admin-login")
      .send({ email: "patient.a@example.com", password: "password123" });
    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Invalid admin email or password.");
  });

  it("restores the session with /me", async () => {
    const res = await api().get("/api/auth/me").set(auth(patientA.token));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, "patient.a@example.com");
  });

  it("returns 401 for missing, malformed, forged, unsigned and expired tokens", async () => {
    const secret = process.env.JWT_SECRET;
    const userId = String(patientA.user.id);
    const tokens = [
      null,
      "garbage",
      jwt.sign({ userId, role: "patient" }, "some-other-secret"),
      unsignedToken({ userId, role: "admin" }),
      jwt.sign({ userId, role: "patient", exp: Math.floor(Date.now() / 1000) - 60 }, secret),
      jwt.sign({ userId: { $ne: null }, role: "patient" }, secret),
    ];

    for (const token of tokens) {
      const req = api().get("/api/auth/me");
      if (token) req.set(auth(token));
      const res = await req;
      assert.equal(res.status, 401, `token ${token}`);
      assert.equal(res.body.success, false);
    }
  });

  it("returns 403 (not 401) for a valid non-admin token on admin routes", async () => {
    for (const path of ["/api/admin/stats", "/api/admin/patients", "/api/appointments/admin"]) {
      const res = await api().get(path).set(auth(patientA.token));
      assert.equal(res.status, 403, path);
      assert.equal(res.body.message, "Admin access required");
    }
  });

  it("revokes admin access as soon as the account is no longer admin", async () => {
    const temp = await User.create({
      name: "Temp Admin",
      email: "temp.admin@example.com",
      password: await hashPassword("temp-password-123"),
      role: "admin",
    });
    const login = await api()
      .post("/api/auth/admin-login")
      .send({ email: "temp.admin@example.com", password: "temp-password-123" });
    assert.equal((await api().get("/api/admin/stats").set(auth(login.body.token))).status, 200);

    await User.updateOne({ _id: temp._id }, { role: "patient" });
    assert.equal((await api().get("/api/admin/stats").set(auth(login.body.token))).status, 403);
  });
});

// ------------------------------------------------------------------
describe("doctors", () => {
  it("lists doctors publicly", async () => {
    const res = await api().get("/api/doctors");
    assert.equal(res.status, 200);
    assert.ok(res.body.doctors.some((d) => d.id === String(doctor._id)));
  });

  it("lets only admins add doctors, with validation", async () => {
    const body = { name: "Dr. New", specialty: "Dentist", fee: "650", experience: "4", available: true };

    assert.equal((await api().post("/api/doctors").send(body)).status, 401);
    assert.equal((await api().post("/api/doctors").set(auth(patientA.token)).send(body)).status, 403);

    const bad = await api().post("/api/doctors").set(auth(adminToken)).send({ ...body, fee: -5 });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, "Fee must be a valid non-negative number.");

    const res = await api().post("/api/doctors").set(auth(adminToken)).send(body);
    assert.equal(res.status, 201);
    assert.equal(res.body.doctor.fee, 650);
    assert.equal(res.body.doctor.experience, 4);
  });

  it("validates doctor IDs", async () => {
    const res = await api().get("/api/doctors/not-an-id");
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Invalid doctor ID");
  });
});

// ------------------------------------------------------------------
describe("appointments", () => {
  const date = () => dayOffset(3);
  let appointmentId;

  it("books an appointment", async () => {
    const res = await api()
      .post("/api/appointments")
      .set(auth(patientA.token))
      .send({ doctorId: String(doctor._id), appointmentDate: date(), appointmentTime: "10:00 AM", reason: "Checkup" });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.appointment.status, "Pending");
    assert.equal(res.body.appointment.patientEmail, "patient.a@example.com");
    appointmentId = res.body.appointment._id;
  });

  it("rejects booking an occupied slot with 409", async () => {
    const res = await api()
      .post("/api/appointments")
      .set(auth(patientB.token))
      .send({ doctorId: String(doctor._id), appointmentDate: date(), appointmentTime: "10:00 AM" });
    assert.equal(res.status, 409);
    assert.equal(res.body.message, "This doctor already has an appointment at this time");
  });

  it("allows only one of two simultaneous bookings for the same slot", async () => {
    const body = { doctorId: String(doctor._id), appointmentDate: date(), appointmentTime: "3:00 PM" };
    const results = await Promise.all([
      api().post("/api/appointments").set(auth(patientA.token)).send(body),
      api().post("/api/appointments").set(auth(patientB.token)).send(body),
      api().post("/api/appointments").set(auth(patientA.token)).send(body),
    ]);
    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, 409, 409]);
    assert.equal(
      await Appointment.countDocuments({ appointmentDate: date(), appointmentTime: "3:00 PM" }),
      1
    );
  });

  it("enforces one active appointment per slot at the database level", async () => {
    const base = {
      patient: patientA.user.id,
      patientName: "Patient a",
      patientEmail: "patient.a@example.com",
      doctorId: String(doctor._id),
      doctorName: "Dr. Test",
      specialty: "Cardiologist",
      appointmentDate: dayOffset(20),
      appointmentTime: "12:00 PM",
    };
    await Appointment.create({ ...base, status: "Cancelled" });
    await Appointment.create({ ...base, status: "Cancelled" }); // cancelled ones never block
    await Appointment.create({ ...base, status: "Pending" });
    await assert.rejects(Appointment.create({ ...base, status: "Confirmed" }), { code: 11000 });
  });

  it("validates booking input", async () => {
    const cases = [
      [{ doctorId: "abc", appointmentDate: date(), appointmentTime: "10:00 AM" }, "Please select a valid doctor"],
      [{ doctorId: String(doctor._id), appointmentDate: dayOffset(-1), appointmentTime: "11:00 AM" }, "Please select today or a future date"],
      [{ doctorId: String(doctor._id), appointmentDate: "2026-02-30", appointmentTime: "11:00 AM" }, "Appointment date must be in YYYY-MM-DD format"],
      [{ doctorId: String(doctor._id), appointmentDate: date(), appointmentTime: "9:00 PM" }, "Please select a valid appointment time"],
      [{ doctorId: String(doctor._id) }, "Appointment date and time are required"],
      [{ doctorId: { $ne: null }, appointmentDate: date(), appointmentTime: "10:00 AM" }, "Please select a valid doctor"],
    ];

    for (const [body, message] of cases) {
      const res = await api().post("/api/appointments").set(auth(patientA.token)).send(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.equal(res.body.message, message);
      assert.ok(Array.isArray(res.body.errors));
    }
  });

  it("returns 404 for an unknown doctor and requires a token", async () => {
    const body = { doctorId: "64b7f0c2a1b2c3d4e5f60718", appointmentDate: date(), appointmentTime: "11:00 AM" };
    assert.equal((await api().post("/api/appointments").set(auth(patientA.token)).send(body)).status, 404);
    assert.equal((await api().post("/api/appointments").send(body)).status, 401);
  });

  it("lists booked times for a doctor and date", async () => {
    const res = await api()
      .get("/api/appointments/booked")
      .query({ doctorId: String(doctor._id), date: date() })
      .set(auth(patientB.token));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.bookedTimes.sort(), ["10:00 AM", "3:00 PM"]);
    assert.equal(res.body.timeSlots.length, 6);

    const excluded = await api()
      .get("/api/appointments/booked")
      .query({ doctorId: String(doctor._id), date: date(), exclude: appointmentId })
      .set(auth(patientA.token));
    assert.deepEqual(excluded.body.bookedTimes, ["3:00 PM"]);

    const bad = await api()
      .get("/api/appointments/booked")
      .query({ doctorId: String(doctor._id), date: "tomorrow" })
      .set(auth(patientA.token));
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, "A valid doctorId and date are required");
  });

  it("lists only the patient's own appointments", async () => {
    const res = await api().get("/api/appointments").set(auth(patientB.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.appointments.every((a) => a.patientEmail === "patient.b@example.com"));
  });

  it("reschedules: rejects taken/same slots and other patients", async () => {
    const taken = await api()
      .put(`/api/appointments/${appointmentId}/reschedule`)
      .set(auth(patientA.token))
      .send({ appointmentDate: date(), appointmentTime: "3:00 PM" });
    assert.equal(taken.status, 409);

    const same = await api()
      .put(`/api/appointments/${appointmentId}/reschedule`)
      .set(auth(patientA.token))
      .send({ appointmentDate: date(), appointmentTime: "10:00 AM" });
    assert.equal(same.status, 400);
    assert.equal(same.body.message, "Please choose a different date or time");

    const other = await api()
      .put(`/api/appointments/${appointmentId}/reschedule`)
      .set(auth(patientB.token))
      .send({ appointmentDate: dayOffset(4), appointmentTime: "11:00 AM" });
    assert.equal(other.status, 404);

    const badId = await api()
      .put("/api/appointments/123/reschedule")
      .set(auth(patientA.token))
      .send({ appointmentDate: dayOffset(4), appointmentTime: "11:00 AM" });
    assert.equal(badId.status, 400);
    assert.equal(badId.body.message, "Invalid appointment ID");
  });

  it("admin confirms, then patient reschedules back to Pending and frees the old slot", async () => {
    const confirm = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(adminToken))
      .send({ status: "Confirmed" });
    assert.equal(confirm.status, 200);
    assert.equal(confirm.body.appointment.status, "Confirmed");

    const res = await api()
      .put(`/api/appointments/${appointmentId}/reschedule`)
      .set(auth(patientA.token))
      .send({ appointmentDate: dayOffset(4), appointmentTime: "11:00 AM" });
    assert.equal(res.status, 200);
    assert.equal(res.body.appointment.status, "Pending");
    assert.equal(res.body.appointment.appointmentDate, dayOffset(4));

    // The old 10:00 AM slot is free again.
    const rebook = await api()
      .post("/api/appointments")
      .set(auth(patientB.token))
      .send({ doctorId: String(doctor._id), appointmentDate: date(), appointmentTime: "10:00 AM" });
    assert.equal(rebook.status, 201);
  });

  it("writes notifications with the formatted date", async () => {
    const res = await api().get("/api/notifications").set(auth(patientA.token));
    assert.equal(res.status, 200);
    assert.ok(res.body.unreadCount >= 3);
    const rescheduled = res.body.notifications.find((n) => n.title === "Appointment rescheduled");
    assert.ok(rescheduled);
    // e.g. "Dr. Test on Wed, 11 Nov, 2026 at 11:00 AM"
    assert.match(rescheduled.message, /Dr\. Test on [A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}, \d{4} at 11:00 AM/);

    const one = await api().put(`/api/notifications/${rescheduled.id}/read`).set(auth(patientA.token));
    assert.equal(one.status, 200);
    assert.equal(one.body.notification.read, true);

    const all = await api().put("/api/notifications/read-all").set(auth(patientA.token));
    assert.equal(all.status, 200);
    const after = await api().get("/api/notifications").set(auth(patientA.token));
    assert.equal(after.body.unreadCount, 0);

    const notMine = await api().put(`/api/notifications/${rescheduled.id}/read`).set(auth(patientB.token));
    assert.equal(notMine.status, 404);
  });

  it("admin status changes: permissions, validation, closed appointments", async () => {
    const asPatient = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(patientA.token))
      .send({ status: "Confirmed" });
    assert.equal(asPatient.status, 403);

    const invalid = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(adminToken))
      .send({ status: "Approved" });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.message, "Invalid appointment status");

    const early = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(adminToken))
      .send({ status: "Completed" });
    assert.equal(early.status, 400);
    assert.equal(
      early.body.message,
      "An appointment can only be marked completed once its time has passed"
    );

    // the visit has happened: move it into the past, then it can be completed
    await Appointment.updateOne(
      { _id: appointmentId },
      { $set: { appointmentDate: "2020-01-06" } }
    );

    const done = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(adminToken))
      .send({ status: "Completed" });
    assert.equal(done.status, 200);

    const closed = await api()
      .put(`/api/appointments/${appointmentId}/status`)
      .set(auth(adminToken))
      .send({ status: "Cancelled" });
    assert.equal(closed.status, 400);
    assert.equal(closed.body.message, "This appointment is already closed");

    const list = await api().get("/api/appointments/admin").set(auth(adminToken));
    assert.equal(list.status, 200);
    assert.ok(list.body.appointments.length >= 3);
  });

  it("cancels an appointment once and frees its slot", async () => {
    const book = await api()
      .post("/api/appointments")
      .set(auth(patientA.token))
      .send({ doctorId: String(doctor._id), appointmentDate: dayOffset(5), appointmentTime: "2:00 PM" });
    assert.equal(book.status, 201);
    const id = book.body.appointment._id;

    const notMine = await api().put(`/api/appointments/${id}/cancel`).set(auth(patientB.token));
    assert.equal(notMine.status, 404);

    const cancel = await api().put(`/api/appointments/${id}/cancel`).set(auth(patientA.token));
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.appointment.status, "Cancelled");

    const again = await api().put(`/api/appointments/${id}/cancel`).set(auth(patientA.token));
    assert.equal(again.status, 400);
    assert.equal(again.body.message, "This appointment cannot be cancelled");

    const rebook = await api()
      .post("/api/appointments")
      .set(auth(patientB.token))
      .send({ doctorId: String(doctor._id), appointmentDate: dayOffset(5), appointmentTime: "2:00 PM" });
    assert.equal(rebook.status, 201);
  });

  it("admin cannot book; admin stats and patients load", async () => {
    const book = await api()
      .post("/api/appointments")
      .set(auth(adminToken))
      .send({ doctorId: String(doctor._id), appointmentDate: dayOffset(6), appointmentTime: "2:00 PM" });
    assert.equal(book.status, 403);

    const stats = await api().get("/api/admin/stats").set(auth(adminToken));
    assert.equal(stats.status, 200);
    assert.ok(stats.body.stats.appointments.total >= 4);

    const patients = await api().get("/api/admin/patients").set(auth(adminToken));
    assert.equal(patients.status, 200);
    const a = patients.body.patients.find((p) => p.email === "patient.a@example.com");
    assert.ok(a.appointmentCount >= 1);
    assert.equal(a.password, undefined);
  });

  it("refuses to delete a doctor with active appointments", async () => {
    const res = await api().delete(`/api/doctors/${doctor._id}`).set(auth(adminToken));
    assert.equal(res.status, 409);
  });
});

// ------------------------------------------------------------------
describe("profile", () => {
  it("updates and validates the profile", async () => {
    const ok = await api()
      .put("/api/profile")
      .set(auth(patientB.token))
      .send({ name: "Patient Bee", phone: "+91 98765 43210", age: "34", gender: "Female", role: "admin" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.profile.age, 34);
    assert.equal(ok.body.profile.role, "patient"); // role is not editable

    const cleared = await api().put("/api/profile").set(auth(patientB.token)).send({ age: "", phone: "" });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.profile.age, null);
    assert.equal(cleared.body.profile.phone, "");

    const bad = await api().put("/api/profile").set(auth(patientB.token)).send({ phone: "call me" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.message, "Please enter a valid phone number");

    const empty = await api().put("/api/profile").set(auth(patientB.token)).send({});
    assert.equal(empty.status, 400);

    const profile = await api().get("/api/profile").set(auth(patientB.token));
    assert.equal(profile.body.profile.name, "Patient Bee");
  });
});

// ------------------------------------------------------------------
describe("rate limiting", () => {
  it("returns 429 JSON after repeated failed logins", async () => {
    let res;
    for (let i = 0; i < 12; i += 1) {
      res = await api().post("/api/auth/login").send({ email: "nobody@example.com", password: "wrong-password" });
      if (res.status === 429) break;
    }
    assert.equal(res.status, 429);
    assert.equal(res.body.success, false);
    assert.match(res.body.message, /Too many failed login attempts/);
  });
});

// ------------------------------------------------------------------
describe("database unavailable", () => {
  it("answers 503 quickly instead of hanging", async () => {
    const { disconnectDB } = require("../db");
    await disconnectDB();
    process.env.MONGO_URI = "mongodb://127.0.0.1:1/medibook-down";
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS = "300";

    const started = Date.now();
    const first = await api().get("/api/doctors");
    assert.equal(first.status, 503);
    assert.equal(first.body.success, false);
    assert.equal(first.headers["retry-after"], "5");

    // Within the cool-down, no new connection attempt: immediate 503.
    const second = await api().get("/api/doctors");
    assert.equal(second.status, 503);
    assert.ok(Date.now() - started < 3000, "should fail fast");

    const health = await api().get("/api/health");
    assert.equal(health.status, 503);
    assert.equal(health.body.database, "disconnected");
  });
});
