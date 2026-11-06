
import { useCallback, useEffect, useState } from "react";
import "./App.css";

import Auth from "./auth";
import AdminDashboard from "./AdminDashboard";
import AdminLogin from "./AdminLogin";
import PatientDashboard from "./PatientDashboard";

import {
  apiRequest,
  getToken,
  getSavedUser,
  saveSession,
  clearSession,
  normalizeAppointment,
  getInitials,
  TIME_SLOTS,
  todayString,
  isPastDate,
} from "./api";

import { showToast } from "./toast";

function LogoMark({ large = false }) {
  return (
    <svg
      className={large ? "logo-mark logo-mark-large" : "logo-mark"}
      viewBox="0 0 64 64"
      role="img"
      aria-label="MediBook+ logo"
    >
      <rect x="3" y="3" width="58" height="58" rx="17" fill="#1769aa" />
      <path
        d="M32 14V50M14 32H50"
        stroke="white"
        strokeWidth="9"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="5" fill="#72d7d0" />
    </svg>
  );
}

function MediBookLogo({ footer = false }) {
  return (
    <span className={footer ? "footer-brand" : "brand"}>
      <LogoMark />
      <span className="brand-name">
        MediBook<span className="brand-plus">+</span>
      </span>
    </span>
  );
}

function normalizeDoctor(doctor) {
  return {
    id: String(doctor.id || doctor._id || ""),
    name: doctor.name || "",
    specialty: doctor.specialty || "",
    experience: `${Number(doctor.experience) || 0} years`,
    fee: Number(doctor.fee) || 0,
    rating: String(doctor.rating ?? "0"),
    bio: doctor.bio || "",
    available: doctor.available !== false,
  };
}

export default function App() {
  const [page, setPage] = useState("home");

  const [user, setUser] = useState(() =>
    getToken("patient") ? getSavedUser("patient") : null
  );

  const [adminUser, setAdminUser] = useState(() =>
    getToken("admin") ? getSavedUser("admin") : null
  );

  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  const [specialty, setSpecialty] = useState("All");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [reason, setReason] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedSlots, setBookedSlots] = useState([]);

  const [showAppointments, setShowAppointments] = useState(false);

  const loggedInUser = user?.name || "";

  const specialties = [
    "All",
    ...new Set(doctors.map((doctor) => doctor.specialty).filter(Boolean)),
  ];

  const filteredDoctors = doctors.filter((doctor) => {
    const search = searchTerm.trim().toLowerCase();

    const matchesSearch =
      doctor.name.toLowerCase().includes(search) ||
      doctor.specialty.toLowerCase().includes(search);

    const matchesSpecialty =
      specialty === "All" || doctor.specialty === specialty;

    return matchesSearch && matchesSpecialty;
  });

  const myAppointments = appointments;

  // =====================================
  // LOAD DOCTORS
  // =====================================

  const loadDoctors = useCallback(async () => {
    setLoadingDoctors(true);

    try {
      const data = await apiRequest("/api/doctors", {
        auth: false,
      });

      const doctorList = Array.isArray(data.doctors)
        ? data.doctors
        : [];

      setDoctors(
        doctorList
          .map(normalizeDoctor)
          .filter((doctor) => doctor.id && doctor.available)
      );
    } catch (error) {
      console.error("Load doctors error:", error);

      showToast(error.message || "Unable to load doctors.", "error");
    } finally {
      setLoadingDoctors(false);
    }
  }, []);

  // =====================================
  // PATIENT SESSION EXPIRY
  // =====================================

  const handlePatientSessionExpired = useCallback(() => {
    clearSession("patient");
    setUser(null);
    setAppointments([]);
    setShowAppointments(false);
    setSelectedDoctor(null);
    setPage("login");

    showToast(
      "Your session has expired. Please log in again.",
      "error"
    );
  }, []);

  // =====================================
  // LOAD PATIENT APPOINTMENTS
  // =====================================

  const loadAppointments = useCallback(async () => {
    if (!getToken("patient")) {
      setAppointments([]);
      return false;
    }

    setLoadingAppointments(true);

    try {
      const data = await apiRequest("/api/appointments");

      const appointmentList = Array.isArray(data.appointments)
        ? data.appointments
        : [];

      setAppointments(appointmentList.map(normalizeAppointment));

      return true;
    } catch (error) {
      console.error("Load appointments error:", error);

      if (error.status === 401 || error.status === 403) {
        handlePatientSessionExpired();
      } else {
        showToast(
          error.message || "Unable to load appointments.",
          "error"
        );
      }

      return false;
    } finally {
      setLoadingAppointments(false);
    }
  }, [handlePatientSessionExpired]);

  // =====================================
  // INITIAL DATA LOADING
  // =====================================

  useEffect(() => {
    loadDoctors();
  }, [loadDoctors]);

  useEffect(() => {
    if (user && getToken("patient")) {
      loadAppointments();
    } else {
      setAppointments([]);
    }
  }, [user, loadAppointments]);

  // =====================================
  // NAVIGATION HELPERS
  // =====================================

  function scrollToSection(sectionId) {
    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function handleDoctorSearch(event) {
    event.preventDefault();

    setSearchTerm(searchInput.trim());
    scrollToSection("doctors");
  }

  function resetDoctorSearch() {
    setSearchInput("");
    setSearchTerm("");
    setSpecialty("All");
  }

  function goToHome() {
    setPage("home");
    setSelectedDoctor(null);
    setBookingError("");
    setShowAppointments(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function openMyAppointments() {
    if (!user || !getToken("patient")) {
      showToast(
        "Please log in to view your appointments.",
        "error"
      );

      setPage("login");
      return;
    }

    const success = await loadAppointments();

    if (!success || !getToken("patient")) {
      return;
    }

    setPage("home");
    setShowAppointments(true);

    window.setTimeout(() => {
      scrollToSection("appointments");
    }, 150);
  }

  function openPatientDashboard() {
    if (!user || !getToken("patient")) {
      showToast(
        "Please log in to access your Patient Dashboard.",
        "error"
      );

      setPage("login");
      return;
    }

    setPage("patient-dashboard");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function openAdmin() {
    if (adminUser && getToken("admin")) {
      setPage("admin");
    } else {
      setPage("admin-login");
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // PATIENT LOGIN SUCCESS
  // =====================================

  function handleAuthSuccess(authUser) {
    if (
      !authUser ||
      typeof authUser !== "object" ||
      !authUser.email
    ) {
      showToast(
        "Login response is incomplete. Please try again.",
        "error"
      );

      return;
    }

    const savedUser = getSavedUser("patient") || authUser;

    setUser(savedUser);
    setPage("home");
    setShowAppointments(false);

    showToast(
      `Welcome to MediBook+, ${savedUser.name || "Patient"}!`,
      "success"
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // PATIENT LOGOUT
  // =====================================

  function logout() {
    clearSession("patient");

    setUser(null);
    setAppointments([]);
    setSelectedDoctor(null);
    setShowAppointments(false);
    setPage("home");

    showToast(
      "You have logged out successfully.",
      "success"
    );
  }

  // =====================================
  // ADMIN LOGIN SUCCESS
  // =====================================

  function handleAdminLogin(admin) {
    if (
      !admin ||
      typeof admin !== "object" ||
      admin.role !== "admin"
    ) {
      showToast("Invalid administrator account.", "error");
      return;
    }

    if (!getToken("admin")) {
      showToast(
        "Admin session was not saved. Please log in again.",
        "error"
      );
      return;
    }

    setAdminUser(admin);
    setPage("admin");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // ADMIN LOGOUT
  // =====================================

  function adminLogout(expired = false) {
    clearSession("admin");
    setAdminUser(null);

    setPage(expired ? "home" : "admin-login");

    if (expired) {
      showToast(
        "Your admin session has expired. Please log in again.",
        "error"
      );
    } else {
      showToast("Admin logged out successfully.", "success");
    }

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function returnFromAdmin() {
    setPage("home");
    setShowAppointments(false);
    loadDoctors();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // UPDATE PATIENT PROFILE
  // =====================================

  const updatePatientProfile = useCallback(async (profileData) => {
    try {
      const body =
        typeof profileData === "string"
          ? { name: profileData }
          : profileData;

      const data = await apiRequest("/api/profile", {
        method: "PUT",
        body,
      });

      const updatedUser = data.user || data.profile;

      if (!updatedUser) {
        throw new Error(
          "Updated profile was not returned by the server."
        );
      }

      setUser(updatedUser);

      saveSession(
        "patient",
        getToken("patient"),
        updatedUser
      );

      showToast("Profile updated successfully.", "success");

      return updatedUser;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        handlePatientSessionExpired();
      } else {
        showToast(
          error.message || "Could not update your profile.",
          "error"
        );
      }

      throw error;
    }
  }, [handlePatientSessionExpired]);

  // =====================================
  // START APPOINTMENT BOOKING
  // =====================================

  function bookDoctor(doctor) {
    if (!user || !getToken("patient")) {
      showToast(
        "Please register or log in before booking an appointment.",
        "error"
      );

      setPage("login");
      return;
    }

    setSelectedDoctor(doctor);
    setPatientName(user.name || "");
    setAppointmentDate("");
    setAppointmentTime("");
    setBookedSlots([]);
    setReason("");
    setBookingError("");
    setPage("booking");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  // =====================================
  // FETCH BOOKED APPOINTMENT SLOTS
  // =====================================

  useEffect(() => {
    if (
      page !== "booking" ||
      !selectedDoctor?.id ||
      !appointmentDate ||
      !getToken("patient")
    ) {
      setBookedSlots([]);
      return;
    }

    const controller = new AbortController();

    async function loadBookedSlots() {
      try {
        const query = new URLSearchParams({
          doctorId: selectedDoctor.id,
          date: appointmentDate,
        });

        const data = await apiRequest(
          `/api/appointments/booked?${query.toString()}`,
          {
            signal: controller.signal,
          }
        );

        setBookedSlots(
          Array.isArray(data.bookedTimes)
            ? data.bookedTimes
            : []
        );

        setBookingError("");
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }

        console.error("Load booked slots error:", error);

        if (error.status === 401 || error.status === 403) {
          handlePatientSessionExpired();
          return;
        }

        setBookedSlots([]);

        setBookingError(
          error.message || "Unable to check available times."
        );
      }
    }

    loadBookedSlots();

    return () => controller.abort();
  }, [
    page,
    selectedDoctor,
    appointmentDate,
    handlePatientSessionExpired,
  ]);

  // =====================================
  // CONFIRM APPOINTMENT
  // =====================================

  async function confirmAppointment(event) {
    event.preventDefault();

    setBookingError("");

    if (!selectedDoctor || !appointmentDate || !appointmentTime) {
      setBookingError("Please complete all required fields.");
      return;
    }

    if (!TIME_SLOTS.includes(appointmentTime)) {
      setBookingError("Please select a valid appointment time.");
      return;
    }

    if (isPastDate(appointmentDate)) {
      setBookingError("Please select today or a future date.");
      return;
    }

    if (bookedSlots.includes(appointmentTime)) {
      setBookingError(
        "This doctor is already booked at this time. Please select another slot."
      );
      return;
    }

    setBookingLoading(true);

    try {
      await apiRequest("/api/appointments", {
        method: "POST",
        body: {
          doctorId: selectedDoctor.id,
          appointmentDate,
          appointmentTime,
          reason: reason.trim(),
        },
      });

      const success = await loadAppointments();

      if (!success || !getToken("patient")) {
        return;
      }

      setPage("patient-dashboard");
      setSelectedDoctor(null);
      setShowAppointments(false);
      setAppointmentDate("");
      setAppointmentTime("");
      setReason("");

      showToast(
        "Appointment booked successfully! Your status is Pending.",
        "success"
      );

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      setBookingError(
        error.message || "Could not book the appointment."
      );

      if (error.status === 401 || error.status === 403) {
        handlePatientSessionExpired();
      }

      if (error.status === 409) {
        setBookedSlots((current) =>
          current.includes(appointmentTime)
            ? current
            : [...current, appointmentTime]
        );
      }
    } finally {
      setBookingLoading(false);
    }
  }

  // =====================================
  // CANCEL APPOINTMENT
  // =====================================

  const cancelAppointment = useCallback(
    async (id) => {
      try {
        await apiRequest(`/api/appointments/${id}/cancel`, {
          method: "PUT",
        });

        await loadAppointments();

        showToast(
          "Appointment cancelled successfully.",
          "success"
        );

        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          handlePatientSessionExpired();
        } else {
          showToast(
            error.message || "Could not cancel the appointment.",
            "error"
          );
        }

        return false;
      }
    },
    [loadAppointments, handlePatientSessionExpired]
  );

  // =====================================
  // RESCHEDULE APPOINTMENT
  // =====================================

  const rescheduleAppointment = useCallback(
    async (id, newDate, newTime) => {
      if (
        !newDate ||
        !newTime ||
        !TIME_SLOTS.includes(newTime)
      ) {
        showToast(
          "Please select a valid date and time.",
          "error"
        );
        return false;
      }

      if (isPastDate(newDate)) {
        showToast(
          "Please select today or a future date.",
          "error"
        );
        return false;
      }

      try {
        await apiRequest(
          `/api/appointments/${id}/reschedule`,
          {
            method: "PUT",
            body: {
              appointmentDate: newDate,
              appointmentTime: newTime,
            },
          }
        );

        await loadAppointments();

        showToast(
          "Appointment rescheduled successfully.",
          "success"
        );

        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          handlePatientSessionExpired();
        } else {
          showToast(
            error.message || "Could not reschedule the appointment.",
            "error"
          );
        }

        return false;
      }
    },
    [loadAppointments, handlePatientSessionExpired]
  );

  // =====================================
  // SEPARATE APPOINTMENT BOOKING PAGE
  // =====================================

  if (page === "booking" && selectedDoctor) {
    return (
      <div className="app">
        <section className="booking-section">
          <div className="booking-card">
            <button
              className="back-link"
              onClick={goToHome}
              type="button"
            >
              Back to doctors
            </button>

            <span className="eyebrow">BOOK YOUR VISIT</span>

            <h1>Appointment details</h1>

            <div className="selected-doctor">
              <span className="selected-doctor-initials">
                {getInitials(selectedDoctor.name)}
              </span>

              <div>
                <h3>{selectedDoctor.name}</h3>

                <p>
                  {selectedDoctor.specialty} ·{" "}
                  {selectedDoctor.experience}
                </p>

                <strong>
                  Consultation fee: ₹{selectedDoctor.fee}
                </strong>
              </div>
            </div>

            <form
              className="booking-form"
              onSubmit={confirmAppointment}
            >
              <label htmlFor="patient-name">
                Patient name
              </label>

              <input
                id="patient-name"
                value={patientName}
                readOnly
                required
              />

              <label htmlFor="appointment-date">
                Appointment date
              </label>

              <input
                id="appointment-date"
                type="date"
                min={todayString()}
                value={appointmentDate}
                onChange={(event) => {
                  setAppointmentDate(event.target.value);
                  setAppointmentTime("");
                  setBookingError("");
                }}
                required
              />

              <label htmlFor="appointment-time">
                Appointment time
              </label>

              <select
                id="appointment-time"
                value={appointmentTime}
                onChange={(event) => {
                  setAppointmentTime(event.target.value);
                  setBookingError("");
                }}
                required
                disabled={!appointmentDate}
              >
                <option value="">
                  {appointmentDate
                    ? "Select a time"
                    : "Select a date first"}
                </option>

                {TIME_SLOTS.map((value) => {
                  const unavailable = bookedSlots.includes(value);

                  return (
                    <option
                      key={value}
                      value={value}
                      disabled={unavailable}
                    >
                      {value}
                      {unavailable ? " - Unavailable" : ""}
                    </option>
                  );
                })}
              </select>

              <label htmlFor="appointment-reason">
                Reason for visit (optional)
              </label>

              <textarea
                id="appointment-reason"
                rows="3"
                placeholder="Briefly describe your concern"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />

              {bookingError && (
                <p className="form-error" role="alert">
                  {bookingError}
                </p>
              )}

              <button
                className="primary-button full-button"
                type="submit"
                disabled={bookingLoading}
              >
                {bookingLoading
                  ? "Booking appointment..."
                  : "Confirm Appointment"}
              </button>
            </form>
          </div>
        </section>
      </div>
    );
  }

  // =====================================
  // PATIENT DASHBOARD
  // =====================================

  if (page === "patient-dashboard") {
    if (!user || !getToken("patient")) {
      return (
        <Auth
          mode="login"
          onModeChange={setPage}
          onHome={goToHome}
          onSuccess={handleAuthSuccess}
        />
      );
    }

    return (
      <PatientDashboard
        user={user}
        appointments={appointments}
        onBack={goToHome}
        onBookNew={() => {
          setPage("home");
          setShowAppointments(false);

          window.setTimeout(() => {
            scrollToSection("doctors");
          }, 100);
        }}
        onRefresh={loadAppointments}
        onCancel={cancelAppointment}
        onReschedule={rescheduleAppointment}
        onUpdateProfile={updatePatientProfile}
        onSessionExpired={handlePatientSessionExpired}
      />
    );
  }

  // =====================================
  // ADMIN LOGIN
  // =====================================

  if (page === "admin-login") {
    return (
      <AdminLogin
        onLogin={handleAdminLogin}
        onBack={goToHome}
      />
    );
  }

  // =====================================
  // ADMIN DASHBOARD
  // =====================================

  if (page === "admin") {
    if (!adminUser || !getToken("admin")) {
      return (
        <AdminLogin
          onLogin={handleAdminLogin}
          onBack={goToHome}
        />
      );
    }

    return (
      <AdminDashboard
        adminUser={adminUser}
        onBack={returnFromAdmin}
        onLogout={adminLogout}
      />
    );
  }

  // =====================================
  // LOGIN AND REGISTRATION
  // =====================================

  if (page === "login" || page === "register") {
    return (
      <Auth
        mode={page}
        onModeChange={setPage}
        onHome={goToHome}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  // =====================================
  // HOMEPAGE
  // =====================================

  return (
    <div className="app">
      {/* HEADER */}

      <header className="site-header">
        <button
          className="brand-button"
          onClick={goToHome}
          type="button"
          aria-label="MediBook+ home"
        >
          <MediBookLogo />
        </button>

        <nav className="navigation">
          <button onClick={goToHome} type="button">
            Home
          </button>

          <button onClick={openMyAppointments} type="button">
            My Appointments
          </button>

          <button onClick={openPatientDashboard} type="button">
            Patient Dashboard
          </button>

          <button onClick={openAdmin} type="button">
            Admin
          </button>

          {!loggedInUser ? (
            <>
              <button
                className="nav-login"
                onClick={() => setPage("login")}
                type="button"
              >
                Login
              </button>

              <button
                className="nav-register"
                onClick={() => setPage("register")}
                type="button"
              >
                Register
              </button>
            </>
          ) : (
            <div className="user-menu">
              <span className="welcome-user">
                Hi, {loggedInUser}
              </span>

              <button
                className="nav-login"
                onClick={logout}
                type="button"
              >
                Logout
              </button>
            </div>
          )}
        </nav>
      </header>

      {/* HERO SECTION */}

      <section className="hero" id="home">
        <div className="hero-content">
          <span className="eyebrow">
            YOUR HEALTH, OUR PRIORITY
          </span>

          <h1>
            Find the right doctor.
            <br />
            Book with confidence.
          </h1>

          <p>
            Discover trusted doctors and book appointments easily.
            Your journey to better health starts here.
          </p>

          <button
            className="primary-button"
            onClick={() => scrollToSection("doctors")}
            type="button"
          >
            Find a Doctor
          </button>

          <div className="hero-stats">
            <div>
              <strong>{doctors.length}+</strong>
              <span>Expert Doctors</span>
            </div>

            <div>
              <strong>1,000+</strong>
              <span>Happy Patients</span>
            </div>

            <div>
              <strong>24/7</strong>
              <span>Easy Booking</span>
            </div>
          </div>
        </div>

        <div className="hero-illustration">
          <div className="hero-logo-card">
            <LogoMark large />

            <h2>
              MediBook<span className="brand-plus">+</span>
            </h2>

            <p>Your Healthcare Partner</p>

            <div className="hero-logo-line" />

            <span className="hero-logo-caption">
              Trusted Healthcare. Easy Appointments.
            </span>
          </div>

          <div className="floating-card">
            Trusted healthcare
          </div>
        </div>
      </section>

      {/* ABOUT SECTION */}

      <section className="section about-section" id="about">
        <div className="section-heading">
          <span className="eyebrow">ABOUT US</span>

          <h2>About MediBook+</h2>

          <p>
            Making healthcare simpler, faster and more accessible.
          </p>
        </div>

        <div className="about-content">
          <div>
            <h3>Your healthcare journey, made easier</h3>

            <p>
              MediBook+ is a doctor appointment booking platform
              designed to help patients find doctors and manage
              appointments conveniently.
            </p>

            <p>
              Patients can explore medical specialists, check
              consultation fees, select available appointment
              slots and manage their bookings from one place.
            </p>
          </div>

          <div className="about-highlight">
            <LogoMark large />

            <h3>Care made convenient</h3>

            <p>
              Find doctors. Book appointments. Manage your visits.
            </p>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}

      <section className="section how-it-works" id="services">
        <div className="section-heading">
          <span className="eyebrow">SIMPLE PROCESS</span>

          <h2>How MediBook+ works</h2>

          <p>
            Book your doctor appointment in three simple steps.
          </p>
        </div>

        <div className="steps-grid">
          <article className="step-card">
            <span className="step-number">01</span>

            <h3>Find a Doctor</h3>

            <p>
              Browse doctors by name or medical specialty and
              choose the right specialist.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">02</span>

            <h3>Book Appointment</h3>

            <p>
              Select your preferred date and available time slot
              to request an appointment.
            </p>
          </article>

          <article className="step-card">
            <span className="step-number">03</span>

            <h3>Manage Your Booking</h3>

            <p>
              View your appointment details and manage eligible
              bookings through your patient dashboard.
            </p>
          </article>
        </div>
      </section>

      {/* DOCTORS SECTION */}

      <section className="section doctors-section" id="doctors">
        <div className="section-heading">
          <span className="eyebrow">OUR SPECIALISTS</span>

          <h2>Meet our expert doctors</h2>

          <p>
            Search for a doctor and book your appointment easily.
          </p>
        </div>

        <form
          className="doctor-search"
          onSubmit={handleDoctorSearch}
        >
          <input
            type="search"
            placeholder="Search by doctor name or specialty..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label="Search doctors by name or specialty"
          />

          <button type="submit" className="search-button">
            Search
          </button>

          <button
            type="button"
            className="search-reset"
            onClick={resetDoctorSearch}
          >
            Reset
          </button>
        </form>

        <div className="specialty-filters">
          {specialties.map((item) => (
            <button
              key={item}
              type="button"
              className={
                specialty === item
                  ? "filter active-filter"
                  : "filter"
              }
              onClick={() => setSpecialty(item)}
            >
              {item}
            </button>
          ))}
        </div>

        <p className="search-result-count" aria-live="polite">
          {filteredDoctors.length} doctor
          {filteredDoctors.length === 1 ? "" : "s"} found
          {searchTerm ? ` for "${searchTerm}"` : ""}
        </p>

        {loadingDoctors ? (
          <div className="empty-state">
            <h3>Loading doctors...</h3>

            <p>Please wait while we load our specialists.</p>
          </div>
        ) : filteredDoctors.length === 0 ? (
          <div className="empty-state">
            <h3>No doctors found</h3>

            <p>
              Please try another doctor name or specialty.
            </p>

            <button
              type="button"
              className="primary-button"
              onClick={resetDoctorSearch}
            >
              Show All Doctors
            </button>
          </div>
        ) : (
          <div className="doctor-grid">
            {filteredDoctors.map((doctor) => (
              <article className="doctor-card" key={doctor.id}>
                <div className="doctor-photo">
                  <span className="doctor-initials">
                    {getInitials(doctor.name)}
                  </span>

                  <span className="availability">
                    Available
                  </span>
                </div>

                <div className="doctor-info">
                  <div className="doctor-rating">
                    Rating: {doctor.rating}
                  </div>

                  <h3>{doctor.name}</h3>

                  <p className="doctor-specialty">
                    {doctor.specialty}
                  </p>

                  <p className="experience">
                    {doctor.experience} experience
                  </p>

                  <div className="doctor-card-bottom">
                    <div>
                      <span>Consultation</span>

                      <strong>
                        ₹{doctor.fee.toLocaleString("en-IN")}
                      </strong>
                    </div>

                    <button
                      className="book-button"
                      onClick={() => bookDoctor(doctor)}
                      type="button"
                    >
                      Book Now
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* MY APPOINTMENTS */}

      {showAppointments && (
        <section
          className="section appointments-section"
          id="appointments"
        >
          <div className="section-heading">
            <span className="eyebrow">YOUR BOOKINGS</span>

            <h2>My Appointments</h2>

            <p>View and manage your appointments.</p>
          </div>

          {loadingAppointments ? (
            <div className="empty-state">
              <h3>Loading appointments...</h3>
            </div>
          ) : myAppointments.length === 0 ? (
            <div className="empty-state">
              <h3>No appointments yet</h3>

              <p>
                Your booked appointments will appear here.
              </p>
            </div>
          ) : (
            <div className="appointment-list">
              {myAppointments.map((appointment) => (
                <article
                  className="appointment-card"
                  key={appointment.id}
                >
                  <div className="appointment-icon">
                    Appointment
                  </div>

                  <div className="appointment-details">
                    <h3>{appointment.doctorName}</h3>

                    <p>{appointment.specialty}</p>

                    <p>Date: {appointment.date}</p>

                    <p>Time: {appointment.time}</p>

                    <p>Patient: {appointment.patientName}</p>

                    <p>Fee: ₹{appointment.fee}</p>

                    {appointment.reason && (
                      <p>Reason: {appointment.reason}</p>
                    )}
                  </div>

                  <div className="appointment-actions">
                    <span
                      className={`status status-${(
                        appointment.status || "Pending"
                      ).toLowerCase()}`}
                    >
                      {appointment.status || "Pending"}
                    </span>

                    {appointment.status !== "Cancelled" &&
                      appointment.status !== "Completed" && (
                        <button
                          className="cancel-button"
                          onClick={() =>
                            cancelAppointment(appointment.id)
                          }
                          type="button"
                        >
                          Cancel
                        </button>
                      )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* FOOTER */}

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-column footer-about">
            <MediBookLogo footer />

            <p>
              MediBook+ makes finding doctors and booking healthcare
              appointments simple and convenient.
            </p>

            <p>Your health, our priority.</p>
          </div>

          <div className="footer-column">
            <h4>Quick Links</h4>

            <div className="footer-links">
              <button type="button" onClick={goToHome}>
                Home
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("about")}
              >
                About Us
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("services")}
              >
                Our Services
              </button>

              <button
                type="button"
                onClick={() => scrollToSection("doctors")}
              >
                Find Doctors
              </button>

              <button
                type="button"
                onClick={openMyAppointments}
              >
                My Appointments
              </button>
            </div>
          </div>

          <div className="footer-column">
            <h4>Our Services</h4>

            <p>Doctor Search</p>
            <p>Online Appointment Booking</p>
            <p>Appointment Management</p>
            <p>Patient Dashboard</p>
            <p>Patient Profile Management</p>
          </div>
        </div>

        <p className="footer-small">
          © {new Date().getFullYear()} MediBook+. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
