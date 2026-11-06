# MediBook+ — Doctor Appointment Website

A full-stack doctor appointment booking website. Patients can register, browse
doctors, book / reschedule / cancel appointments and receive notifications.
Admins manage doctors, patients and appointment requests from a dashboard.

**Stack:** React 19 + Vite (frontend) · Node.js + Express 5 + MongoDB / Mongoose (backend) · JWT authentication

---

## Features

### Patients
- Register and log in (JWT sessions that survive a page refresh)
- Search doctors by name or specialty and filter by specialty
- Book an appointment with live slot availability (booked slots are disabled)
- Patient dashboard: profile (name, phone, age, gender), appointment history with
  status filters, reschedule and cancel, in-app notifications
- "My Appointments" summary on the homepage

### Admin
- Separate admin login
- Overview with live counts (doctors, patients, appointments by status)
- Confirm / complete / cancel appointment requests (patient is notified)
- Add, edit, delete doctors and mark them available / unavailable
- Registered patients list with booking counts

### Backend
- MongoDB models: `User`, `Doctor`, `Appointment`, `Notification`
- Starter doctors are seeded automatically on first run
- Double-booking protection (same doctor, date and time)
- Optional email notifications through SMTP (disabled unless configured)

---

## Project structure

```
doctor-appointment-app/
├── index.html, vite.config.js     # Vite frontend
├── src/
│   ├── App.jsx                    # Homepage, doctors, booking, routing between views
│   ├── auth.jsx                   # Patient login / register
│   ├── AdminLogin.jsx             # Admin login
│   ├── AdminDashboard.jsx         # Admin dashboard
│   ├── PatientDashboard.jsx       # Patient dashboard
│   ├── api.js                     # API helper, session storage, formatting utilities
│   ├── toast.js / ToastHost.jsx   # Toast notifications
│   └── *.css
└── server/
    ├── server.js                  # Express app entry point
    ├── createAdmin.js             # Creates / resets the admin account
    ├── models/                    # Mongoose schemas
    ├── routes/                    # auth, profile, doctors, appointments, notifications, admin
    ├── middleware/                # JWT auth + admin guard
    └── utils/                     # constants, doctor seeding, mailer
```

---

## Getting started

### 1. Backend

```bash
cd server
npm install
copy .env.example .env      # then edit .env
```

Fill in `server/.env`:

```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>/medibook?retryWrites=true&w=majority
JWT_SECRET=some-long-random-string
```

Create the admin account (defaults to `admin@medibook.com` / `Admin@12345`;
override with `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` in `.env`):

```bash
npm run seed:admin
```

Start the API:

```bash
npm start          # or: npm run dev   (restarts on file changes)
```

The server listens on http://localhost:5000 and prints every available route.
On the first run it inserts six starter doctors.

> **MongoDB Atlas:** if the server fails with an "IP not whitelisted" error, add
> your current IP address under *Network Access* in the Atlas dashboard.

### 2. Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173.

The frontend talks to `http://localhost:5000` by default. To use another backend
URL, create a `.env` file in the project root (see `.env.example`):

```
VITE_API_URL=https://your-api.example.com
```

### 3. Production build

```bash
npm run build      # outputs to dist/
npm run preview    # serves the build locally
```

---

## API overview

| Method | Route                               | Access  | Purpose                              |
| ------ | ----------------------------------- | ------- | ------------------------------------ |
| POST   | `/api/auth/register`                | public  | Patient registration                 |
| POST   | `/api/auth/login`                   | public  | Patient login                        |
| POST   | `/api/auth/admin-login`             | public  | Admin login                          |
| GET    | `/api/auth/me`                      | token   | Current user                         |
| GET    | `/api/profile`                      | patient | Get profile                          |
| PUT    | `/api/profile`                      | patient | Update name / phone / age / gender   |
| GET    | `/api/doctors`                      | public  | List doctors                         |
| POST   | `/api/doctors`                      | admin   | Add doctor                           |
| PUT    | `/api/doctors/:id`                  | admin   | Update doctor                        |
| DELETE | `/api/doctors/:id`                  | admin   | Delete doctor (no active bookings)   |
| POST   | `/api/appointments`                 | patient | Book appointment                     |
| GET    | `/api/appointments`                 | patient | My appointments                      |
| GET    | `/api/appointments/booked`          | token   | Booked times for a doctor and date   |
| PUT    | `/api/appointments/:id/cancel`      | patient | Cancel my appointment                |
| PUT    | `/api/appointments/:id/reschedule`  | patient | Reschedule my appointment            |
| GET    | `/api/appointments/admin`           | admin   | All appointments                     |
| PUT    | `/api/appointments/:id/status`      | admin   | Confirm / complete / cancel          |
| GET    | `/api/notifications`                | token   | My notifications                     |
| PUT    | `/api/notifications/read-all`       | token   | Mark all as read                     |
| PUT    | `/api/notifications/:id/read`       | token   | Mark one as read                     |
| GET    | `/api/admin/stats`                  | admin   | Dashboard counts                     |
| GET    | `/api/admin/patients`               | admin   | Registered patients                  |

Every response has the shape `{ success: true | false, message?, ...data }`.
Protected routes expect an `Authorization: Bearer <token>` header.

Appointment time slots: 10:00 AM, 11:00 AM, 12:00 PM, 2:00 PM, 3:00 PM, 4:00 PM.

---

## Optional email notifications

Add SMTP settings to `server/.env` to email patients when they book and when an
admin changes the status of their appointment:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM="MediBook+ <no-reply@medibook.com>"
```

Leave them blank to disable email (in-app notifications still work).

---

## Scripts

| Location | Command              | Description                        |
| -------- | -------------------- | ---------------------------------- |
| root     | `npm run dev`        | Start the Vite dev server          |
| root     | `npm run build`      | Production build                   |
| root     | `npm run lint`       | ESLint                             |
| server   | `npm start`          | Start the API                      |
| server   | `npm run dev`        | Start the API with auto-restart    |
| server   | `npm run seed:admin` | Create / reset the admin account   |
