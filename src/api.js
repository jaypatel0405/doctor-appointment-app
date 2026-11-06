
// Shared helpers for talking to the MediBook+ backend
// and managing user sessions.

// =====================================
// API CONFIGURATION
// =====================================

// VITE_API_URL always wins. Otherwise: localhost:5000 in dev, and same-origin
// ("") in production builds so /api/... hits the Vercel function.
export const API_BASE = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "")
).replace(/\/+$/, "");

// =====================================
// LOCAL STORAGE KEYS
// =====================================

export const STORAGE_KEYS = {
  patient: {
    token: "medibook_token",
    user: "medibook_user",
  },
  admin: {
    token: "medibook_admin_token",
    user: "medibook_admin_user",
  },
};

// =====================================
// APPOINTMENT CONFIGURATION
// =====================================

export const TIME_SLOTS = [
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
];

export const APPOINTMENT_STATUSES = [
  "Pending",
  "Confirmed",
  "Completed",
  "Cancelled",
];

// =====================================
// API ERROR HANDLING
// =====================================

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function isAuthError(error) {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403)
  );
}

export function isNetworkError(error) {
  return error instanceof ApiError && error.status === 0;
}

// =====================================
// SESSION STORAGE
// =====================================

function readJSON(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");

    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function getToken(scope = "patient") {
  try {
    const storage = STORAGE_KEYS[scope];

    if (!storage) return "";

    return localStorage.getItem(storage.token) || "";
  } catch {
    return "";
  }
}

export function getSavedUser(scope = "patient") {
  const storage = STORAGE_KEYS[scope];

  if (!storage) return null;

  return readJSON(storage.user);
}

export function saveSession(scope, token, user) {
  try {
    const storage = STORAGE_KEYS[scope];

    if (!storage || !token) return;

    localStorage.setItem(storage.token, token);
    localStorage.setItem(storage.user, JSON.stringify(user));
  } catch {
    // Ignore storage errors.
  }
}

export function clearSession(scope) {
  try {
    const storage = STORAGE_KEYS[scope];

    if (!storage) return;

    localStorage.removeItem(storage.token);
    localStorage.removeItem(storage.user);
  } catch {
    // Ignore storage errors.
  }
}

// =====================================
// API REQUEST FUNCTION
// =====================================

export async function apiRequest(
  path,
  {
    method = "GET",
    body,
    scope = "patient",
    auth = true,
    signal,
  } = {}
) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken(scope);

    if (!token) {
      throw new ApiError("Please log in to continue.", 401);
    }

    headers.Authorization = `Bearer ${token}`;
  }

  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Cannot connect to the server. Please make sure the backend is running.",
      0
    );
  }

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok || (data && data.success === false)) {
    const message =
      (data && data.message) ||
      `Request failed (${response.status})`;

    throw new ApiError(message, response.status, data);
  }

  return data || {};
}

// =====================================
// DATE FORMATTING
// =====================================

export function todayString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function isPastDate(dateString) {
  if (!dateString) return false;

  return dateString < todayString();
}

export function formatDate(dateString) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// =====================================
// CURRENCY FORMATTING
// =====================================

export function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

// =====================================
// USER INITIALS
// =====================================

export function getInitials(name = "") {
  return String(name)
    .replace(/^Dr\.?\s*/i, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// =====================================
// APPOINTMENT DATA NORMALIZATION
// =====================================

export function normalizeAppointment(item = {}) {
  return {
    id: String(item._id || item.id || ""),
    patientName: item.patientName || "Patient",
    userEmail: (
      item.patientEmail ||
      item.userEmail ||
      ""
    ).toLowerCase(),
    doctorId: String(item.doctorId || ""),
    doctorName: item.doctorName || "",
    specialty: item.specialty || "",
    date: item.appointmentDate || item.date || "",
    time: item.appointmentTime || item.time || "",
    fee: Number(item.fee) || 0,
    reason: item.reason || "",
    status: item.status || "Pending",
    createdAt: item.createdAt || null,
  };
}

// =====================================
// APPOINTMENT STATUS COLORS
// =====================================

export function getStatusColor(status) {
  if (status === "Confirmed") {
    return "#16834a";
  }

  if (status === "Completed") {
    return "#087f8c";
  }

  if (status === "Cancelled") {
    return "#dc3545";
  }

  return "#e69b19";
}
