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

Create the admin account. `ADMIN_PASSWORD` is required (min 8 chars); `ADMIN_EMAIL`
(default `admin@medibook.com`) and `ADMIN_NAME` are optional:

```bash
npm run seed:admin
```

Start the API:

```bash
npm start          # or: npm run dev   (restarts on file changes)
```

The server listens on http://localhost:5000 and prints every available route.
On start it inserts six starter doctors if the collection is empty (idempotent;
also available as `npm run seed:doctors`).

> **MongoDB Atlas:** if the server fails with an "IP not whitelisted" error, add
> your current IP address under *Network Access* in the Atlas dashboard.

### 2. Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173.

In dev the frontend talks to `http://localhost:5000`; production builds call the
same origin (`/api/...`). To use another backend
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

---

## Deploy to Vercel (free Hobby plan)

One Vercel project serves both parts:

- **Frontend**: `npm run build` (Vite) -> static files in `dist/` (including `public/taste/`).
- **API**: `api/index.js` is a single serverless function that wraps the Express app
  from `server/app.js`. `vercel.json` rewrites `/api/(.*)` to it; Express sees the
  original path (e.g. `/api/doctors`). Every other path that is not a real file falls
  back to `/index.html`.
- **Database**: your existing MongoDB Atlas cluster. The connection is cached across
  warm invocations (`server/db.js`).

`vercel.json` installs root deps and `server/` deps (`npm install --prefix server`),
so the function can use the server's own `package.json`.

### 1. Prepare MongoDB Atlas

1. *Network Access* -> *Add IP Address* -> `0.0.0.0/0` (Vercel functions have no fixed IPs).
2. Because the cluster is then reachable from anywhere, use a dedicated database user
   with a long random password and only the `readWrite` role on the app database.
3. Copy the `mongodb+srv://...` connection string (include the database name, e.g. `/medibook`).

### 2. Import the project

1. Push this repo to GitHub (`jaypatel0405/doctor-appointment-app`).
2. vercel.com -> *Add New...* -> *Project* -> import `jaypatel0405/doctor-appointment-app`.
3. Framework preset: **Vite**. Root directory: the repo root. Leave build/output/install
   settings at their defaults - `vercel.json` sets them.
4. Add the environment variables below (Production and Preview), then *Deploy*.

### 3. Environment variables (Vercel -> Project -> Settings -> Environment Variables)

| Variable       | Required | Notes |
| -------------- | -------- | ----- |
| `MONGO_URI`    | yes      | Atlas connection string |
| `JWT_SECRET`   | yes      | long random string (e.g. `openssl rand -hex 32`) |
| `CORS_ORIGINS` | no       | comma list of extra allowed origins, e.g. `https://medibook.vercel.app,https://www.example.com`. Same-origin requests and the Vercel deployment URL are allowed automatically. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | no | email notifications; disabled when unset |

Do **not** set `VITE_API_URL` - production builds call the API on the same domain.
If `MONGO_URI`/`JWT_SECRET` are missing, the API answers `500` with a JSON message.

### 4. One-time seeds (run from your machine against Atlas)

The function never seeds. Run once, with `server/.env` pointing at the Atlas database
(`MONGO_URI`) and a strong `ADMIN_PASSWORD`:

```bash
cd server
npm run seed:doctors   # inserts starter doctors only if none exist
npm run seed:admin     # creates/updates the admin account (ADMIN_PASSWORD required)
```

Your machine's IP must be allowed in Atlas (it is, with `0.0.0.0/0`).

### 5. Check it

- `https://<your-app>.vercel.app/api/health` -> `{"success":true,...,"database":"connected"}`
- `https://<your-app>.vercel.app/` -> the app

### Hobby plan limits

- Non-commercial / personal use only; a commercial app needs the Pro plan.
- Function duration is capped (this project sets `maxDuration: 10` seconds); slow SMTP
  servers count against it because emails are sent inside the request.
- Cold starts: the first request after idle time loads Express and opens a new MongoDB
  connection (typically 1-3 s). Warm requests reuse it.
- Atlas free tier (M0) allows a limited number of connections; each warm function
  instance holds a small pool (`maxPoolSize: 5`).
