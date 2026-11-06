import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import "./shell.css";
import "./ui/ui.css";

import Auth from "./auth";
import AdminDashboard from "./AdminDashboard";
import AdminLogin from "./AdminLogin";
import AppBar from "./AppBar";
import HomePage from "./home/HomePage";
import PatientDashboard from "./PatientDashboard";
import ToastHost from "./ToastHost";
import DatePicker from "./ui/DatePicker";

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

function normalizeDoctor(doctor) {
  return {
    id: String(doctor.id || doctor._id || ""),
    name: doctor.name || "",
    specialty: doctor.specialty || "",
    experience: Number(doctor.experience) || 0,
    fee: Number(doctor.fee) || 0,
    rating: String(doctor.rating ?? "0"),
    bio: doctor.bio || "",
    available: doctor.available !== false,
  };
}

async function fetchDoctorList() {
  const data = await apiRequest("/api/doctors", {
    auth: false,
  });

  const doctorList = Array.isArray(data.doctors) ? data.doctors : [];

  return doctorList
    .map(normalizeDoctor)
    .filter((doctor) => doctor.id && doctor.available);
}

function reportDoctorsError(error) {
  console.error("Load doctors error:", error);

  showToast(error.message || "Unable to load doctors.", "error");
}

function appointmentListFrom(data) {
  const appointmentList = Array.isArray(data.appointments)
    ? data.appointments
    : [];

  return appointmentList.map(normalizeAppointment);
}

// A new screen starts at its top at once (the CSS smooth scroll is for in-page jumps only).
function scrollTop() {
  window.scrollTo({ top: 0, behavior: "instant" });
}

export default function App() {
  return (
    <>
      <Screens />
      <ToastHost />
    </>
  );
}

function Screens() {
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

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [appointmentDate, setAppointmentDate] = useState("");
  const [appointmentTime, setAppointmentTime] = useState("");
  const [patientName, setPatientName] = useState("");
  const [reason, setReason] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);
  // Booked times are kept with the doctor and date they answer, so a new date
  // shows the slots loading instead of the previous date's answer.
  const [slotState, setSlotState] = useState({ key: "", times: [] });

  const slotKey =
    page === "booking" && selectedDoctor?.id && appointmentDate
      ? `${selectedDoctor.id}|${appointmentDate}`
      : "";
  const bookedSlots =
    slotKey && slotState.key === slotKey ? slotState.times : [];
  const slotsLoading = Boolean(slotKey) && slotState.key !== slotKey;

  // =====================================
  // LOAD DOCTORS
  // =====================================

  const loadDoctors = useCallback(async () => {
    setLoadingDoctors(true);

    try {
      setDoctors(await fetchDoctorList());
    } catch (error) {
      reportDoctorsError(error);
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
    setSelectedDoctor(null);
    setPage("login");

    showToast("Your session has expired. Please sign in again.", "error");
  }, []);

  // =====================================
  // LOAD PATIENT APPOINTMENTS
  // =====================================

  const handleAppointmentsError = useCallback(
    (error) => {
      console.error("Load appointments error:", error);

      if (error.status === 401 || error.status === 403) {
        handlePatientSessionExpired();
      } else {
        showToast(error.message || "Unable to load appointments.", "error");
      }
    },
    [handlePatientSessionExpired]
  );

  const loadAppointments = useCallback(async () => {
    if (!getToken("patient")) {
      setAppointments([]);
      return false;
    }

    try {
      const data = await apiRequest("/api/appointments");

      setAppointments(appointmentListFrom(data));

      return true;
    } catch (error) {
      handleAppointmentsError(error);

      return false;
    }
  }, [handleAppointmentsError]);

  // =====================================
  // INITIAL DATA LOADING
  // =====================================

  // State is only set once the request settles (loadingDoctors starts true).
  useEffect(() => {
    let active = true;

    fetchDoctorList()
      .then(
        (list) => {
          if (active) setDoctors(list);
        },
        (error) => {
          if (active) reportDoctorsError(error);
        }
      )
      .finally(() => {
        if (active) setLoadingDoctors(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Every path that signs the patient out (logout, session expiry) already
  // clears the appointments, so this only loads them for a signed-in patient.
  useEffect(() => {
    if (!user || !getToken("patient")) return undefined;

    let active = true;

    apiRequest("/api/appointments").then(
      (data) => {
        if (active) setAppointments(appointmentListFrom(data));
      },
      (error) => {
        if (active) handleAppointmentsError(error);
      }
    );

    return () => {
      active = false;
    };
  }, [user, handleAppointmentsError]);

  // =====================================
  // NAVIGATION HELPERS
  // =====================================

  function goToHome() {
    setPage("home");
    setSelectedDoctor(null);
    setBookingError("");
    scrollTop();
  }

  function goToDoctors() {
    setPage("home");
    setSelectedDoctor(null);
    setBookingError("");

    window.setTimeout(() => {
      document.getElementById("doctors")?.scrollIntoView({ block: "start" });
    }, 100);
  }

  function openPatientDashboard() {
    if (!user || !getToken("patient")) {
      showToast("Please sign in to see your appointments.", "error");

      setPage("login");
      scrollTop();
      return;
    }

    setPage("patient-dashboard");
    scrollTop();
  }

  function openAdmin() {
    if (adminUser && getToken("admin")) {
      setPage("admin");
    } else {
      setPage("admin-login");
    }

    scrollTop();
  }

  function openAuth(mode) {
    setPage(mode);
    scrollTop();
  }

  // =====================================
  // PATIENT LOGIN SUCCESS
  // =====================================

  function handleAuthSuccess(authUser) {
    if (!authUser || typeof authUser !== "object" || !authUser.email) {
      showToast("Sign-in response is incomplete. Please try again.", "error");

      return;
    }

    const savedUser = getSavedUser("patient") || authUser;

    setUser(savedUser);
    setPage("home");

    // Auth already shows the one welcome toast ("Welcome back" or "Account created").
    scrollTop();
  }

  // =====================================
  // PATIENT LOGOUT
  // =====================================

  function logout() {
    clearSession("patient");

    setUser(null);
    setAppointments([]);
    setSelectedDoctor(null);
    setPage("home");

    showToast("You have signed out.", "success");
  }

  // =====================================
  // ADMIN LOGIN SUCCESS
  // =====================================

  function handleAdminLogin(admin) {
    if (!admin || typeof admin !== "object" || admin.role !== "admin") {
      showToast("Invalid administrator account.", "error");
      return;
    }

    if (!getToken("admin")) {
      showToast("Admin session was not saved. Please sign in again.", "error");
      return;
    }

    setAdminUser(admin);
    setPage("admin");
    scrollTop();
  }

  // =====================================
  // ADMIN LOGOUT
  // =====================================

  function adminLogout(expired = false) {
    clearSession("admin");
    setAdminUser(null);

    // Expired or not, the next step is signing in again.
    setPage("admin-login");

    if (expired) {
      showToast("Your admin session has expired. Please sign in again.", "error");
    } else {
      showToast("Signed out of the staff dashboard.", "success");
    }

    scrollTop();
  }

  function returnFromAdmin() {
    setPage("home");
    loadDoctors();
    scrollTop();
  }

  // =====================================
  // UPDATE PATIENT PROFILE
  // =====================================

  const updatePatientProfile = useCallback(
    async (profileData) => {
      try {
        const body =
          typeof profileData === "string" ? { name: profileData } : profileData;

        const data = await apiRequest("/api/profile", {
          method: "PUT",
          body,
        });

        const updatedUser = data.user || data.profile;

        if (!updatedUser) {
          throw new Error("Updated profile was not returned by the server.");
        }

        setUser(updatedUser);

        saveSession("patient", getToken("patient"), updatedUser);

        showToast("Profile updated.", "success");

        return updatedUser;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          handlePatientSessionExpired();
        } else {
          showToast(error.message || "Could not update your profile.", "error");
        }

        throw error;
      }
    },
    [handlePatientSessionExpired]
  );

  // =====================================
  // START APPOINTMENT BOOKING
  // =====================================

  function bookDoctor(doctor) {
    if (!user || !getToken("patient")) {
      showToast("Please create an account or sign in to book.", "error");

      setPage("login");
      scrollTop();
      return;
    }

    setSelectedDoctor(doctor);
    setPatientName(user.name || "");
    setAppointmentDate("");
    setAppointmentTime("");
    setSlotState({ key: "", times: [] });
    setReason("");
    setBookingError("");
    setPage("booking");
    scrollTop();
  }

  // =====================================
  // FETCH BOOKED APPOINTMENT SLOTS
  // =====================================

  useEffect(() => {
    if (!slotKey || !getToken("patient")) {
      return undefined;
    }

    const [doctorId, date] = slotKey.split("|");
    const controller = new AbortController();

    async function loadBookedSlots() {
      try {
        const query = new URLSearchParams({
          doctorId,
          date,
        });

        const data = await apiRequest(
          `/api/appointments/booked?${query.toString()}`,
          {
            signal: controller.signal,
          }
        );

        setSlotState({
          key: slotKey,
          times: Array.isArray(data.bookedTimes) ? data.bookedTimes : [],
        });

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

        setSlotState({ key: slotKey, times: [] });

        setBookingError(error.message || "Unable to check available times.");
      }
    }

    loadBookedSlots();

    return () => controller.abort();
  }, [slotKey, handlePatientSessionExpired]);

  // =====================================
  // CONFIRM APPOINTMENT
  // =====================================

  async function confirmAppointment(event) {
    event.preventDefault();

    setBookingError("");

    if (!selectedDoctor || !appointmentDate || !appointmentTime) {
      setBookingError("Please choose a date and a time.");
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
      setAppointmentDate("");
      setAppointmentTime("");
      setReason("");

      showToast("Appointment requested. It shows as pending until the clinic confirms.", "success");

      scrollTop();
    } catch (error) {
      setBookingError(error.message || "Could not book the appointment.");

      if (error.status === 401 || error.status === 403) {
        handlePatientSessionExpired();
      }

      if (error.status === 409) {
        // The slot went to someone else: drop it from the selection and say what to do.
        setAppointmentTime("");
        setBookingError(
          "This doctor already has an appointment at this time. Pick another time."
        );
        setSlotState((current) =>
          current.key !== slotKey || current.times.includes(appointmentTime)
            ? current
            : { key: current.key, times: [...current.times, appointmentTime] }
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

        showToast("Appointment cancelled.", "success");

        return true;
      } catch (error) {
        if (error.status === 401 || error.status === 403) {
          handlePatientSessionExpired();
        } else {
          showToast(error.message || "Could not cancel the appointment.", "error");
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
      if (!newDate || !newTime || !TIME_SLOTS.includes(newTime)) {
        showToast("Please select a valid date and time.", "error");
        return false;
      }

      if (isPastDate(newDate)) {
        showToast("Please select today or a future date.", "error");
        return false;
      }

      try {
        await apiRequest(`/api/appointments/${id}/reschedule`, {
          method: "PUT",
          body: {
            appointmentDate: newDate,
            appointmentTime: newTime,
          },
        });

        await loadAppointments();

        showToast("Appointment rescheduled.", "success");

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
  // BOOKING SCREEN
  // =====================================

  if (page === "booking" && selectedDoctor) {
    return (
      <div className="screen">
        <AppBar onHome={goToHome} label="Book a visit">
          <button
            className="btn btn--secondary btn--sm"
            onClick={goToDoctors}
            type="button"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Back to doctors
          </button>
        </AppBar>

        <main className="screen__main wrap">
          <div className="screen__head">
            <p className="eyebrow-label">Step 2 of 3</p>
            <h1>Choose a date and time</h1>
            <p>
              Times another patient already holds for this doctor are marked
              Booked. Your request stays pending until the clinic confirms it.
            </p>
          </div>

          <div className="grid booking">
            <aside className="panel-box booking__doc span-5">
              <div className="booking__who">
                <span className="avatar avatar--lg">
                  {getInitials(selectedDoctor.name)}
                </span>
                <div>
                  <h2>{selectedDoctor.name}</h2>
                  <p>{selectedDoctor.specialty}</p>
                </div>
              </div>

              <dl className="booking__facts">
                <div>
                  <dt>Consultation</dt>
                  <dd>₹{selectedDoctor.fee.toLocaleString("en-IN")}</dd>
                </div>
                <div>
                  <dt>Experience</dt>
                  <dd>{selectedDoctor.experience} years</dd>
                </div>
                <div>
                  <dt>Rating</dt>
                  <dd>{selectedDoctor.rating}</dd>
                </div>
              </dl>

              {selectedDoctor.bio && (
                <p className="booking__bio">{selectedDoctor.bio}</p>
              )}
            </aside>

            <form
              className="form panel-box panel-box--light span-6 start-7"
              onSubmit={confirmAppointment}
            >
              <label className="field field--full" htmlFor="patient-name">
                Patient
                <input id="patient-name" value={patientName} readOnly required />
              </label>

              <label className="field field--full" htmlFor="appointment-date">
                Date
                <DatePicker
                  id="appointment-date"
                  min={todayString()}
                  value={appointmentDate}
                  onChange={(value) => {
                    setAppointmentDate(value);
                    setAppointmentTime("");
                    setBookingError("");
                  }}
                />
              </label>

              <fieldset className="field field--full slot-field">
                <legend>Time</legend>

                {appointmentDate && slotsLoading ? (
                  <div className="slot-grid" aria-busy="true">
                    <span className="sr-only">Checking the free times…</span>
                    {TIME_SLOTS.map((value) => (
                      <span key={value} className="skel slot-skel" aria-hidden="true" />
                    ))}
                  </div>
                ) : appointmentDate ? (
                  <div className="slot-grid slot-grid--in" key={appointmentDate}>
                    {TIME_SLOTS.map((value) => {
                      const unavailable = bookedSlots.includes(value);

                      return (
                        <button
                          key={value}
                          type="button"
                          className={
                            appointmentTime === value ? "slot is-on" : "slot"
                          }
                          disabled={unavailable}
                          aria-pressed={appointmentTime === value}
                          aria-label={
                            unavailable ? `${value}, already booked` : value
                          }
                          onClick={() => {
                            setAppointmentTime(value);
                            setBookingError("");
                          }}
                        >
                          <span className="slot__time">{value}</span>
                          {unavailable && (
                            <span className="slot__note" aria-hidden="true">
                              Booked
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <span className="field-hint">Pick a date to see the times.</span>
                )}
              </fieldset>

              <label className="field field--full" htmlFor="appointment-reason">
                Reason for the visit (optional)
                <textarea
                  id="appointment-reason"
                  rows="3"
                  placeholder="A few words about your concern"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>

              {bookingError && (
                <p className="form-error" role="alert">
                  {bookingError}
                </p>
              )}

              <div className="btn-row">
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={bookingLoading}
                >
                  {bookingLoading ? "Sending request…" : "Request this appointment"}
                </button>
              </div>
            </form>
          </div>
        </main>
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
          onModeChange={openAuth}
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
        onBookNew={goToDoctors}
        onRefresh={loadAppointments}
        onCancel={cancelAppointment}
        onReschedule={rescheduleAppointment}
        onUpdateProfile={updatePatientProfile}
        onSessionExpired={handlePatientSessionExpired}
        onLogout={logout}
      />
    );
  }

  // =====================================
  // ADMIN
  // =====================================

  if (page === "admin-login" || (page === "admin" && (!adminUser || !getToken("admin")))) {
    return <AdminLogin onLogin={handleAdminLogin} onBack={goToHome} />;
  }

  if (page === "admin") {
    return (
      <AdminDashboard
        adminUser={adminUser}
        onBack={returnFromAdmin}
        onLogout={adminLogout}
      />
    );
  }

  // =====================================
  // SIGN IN AND REGISTRATION
  // =====================================

  if (page === "login" || page === "register") {
    return (
      <Auth
        mode={page}
        onModeChange={openAuth}
        onHome={goToHome}
        onSuccess={handleAuthSuccess}
      />
    );
  }

  // =====================================
  // HOME
  // =====================================

  return (
    <HomePage
      user={user}
      doctors={doctors}
      loadingDoctors={loadingDoctors}
      onBook={bookDoctor}
      onLogin={() => openAuth("login")}
      onRegister={() => openAuth("register")}
      onLogout={logout}
      onDashboard={openPatientDashboard}
      onAdmin={openAdmin}
    />
  );
}
