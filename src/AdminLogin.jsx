
import { useState } from "react";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";

export default function AdminLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    // Validate email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Please enter a valid admin email address.");
      return;
    }

    // Validate password
    if (!password) {
      setError("Please enter your admin password.");
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest("/api/auth/admin-login", {
        method: "POST",
        auth: false,
        body: {
          email: cleanEmail,
          password,
        },
      });

      const adminUser = data.user || data.admin;

      if (!data.token || !adminUser) {
        throw new Error(
          "Admin information was not received from the server."
        );
      }

      if (adminUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }

      // Save admin session separately from patient session
      saveSession("admin", data.token, adminUser);

      showToast(
        `Signed in as ${adminUser.name}.`,
        "success"
      );

      onLogin(adminUser);
    } catch (requestError) {
      setError(
        requestError.message ||
          "Unable to sign in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <button
          className="auth-back"
          type="button"
          onClick={onBack}
        >
          ← Back to Website
        </button>

        <div className="auth-logo auth-logo-admin">
          A
        </div>

        <p className="auth-eyebrow">
          MEDIBOOK+ ADMIN PORTAL
        </p>

        <h1>Admin sign in</h1>

        <p className="auth-subtitle">
          Manage doctors, patients and appointment requests.
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
        >
          <label htmlFor="admin-email">
            Admin email
          </label>

          <input
            id="admin-email"
            type="email"
            placeholder="admin@medibook.com"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            autoComplete="username"
            required
          />

          <label htmlFor="admin-password">
            Password
          </label>

          <input
            id="admin-password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            autoComplete="current-password"
            required
          />

          <label className="show-password">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) =>
                setShowPassword(event.target.checked)
              }
            />
            Show password
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="primary-button auth-submit"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "Signing in..."
              : "Sign in as Admin"}
          </button>
        </form>

        <p className="auth-demo-note">
          Admin access is restricted to clinic staff.
        </p>
      </div>
    </main>
  );
}
