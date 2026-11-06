
import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import AppBar from "./AppBar";
import "./auth.css";
import { apiRequest, saveSession } from "./api";
import { showToast } from "./toast";

export default function AdminLogin({ onLogin, onBack }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const cleanEmail = email.trim().toLowerCase();

    // Both fields are checked at once; each message sits under its field.
    const errors = {};

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = "Enter your staff email, like name@clinic.com.";
    }

    if (!password) {
      errors.password = "Enter your password.";
    }

    setFieldErrors(errors);

    if (errors.email || errors.password) {
      document
        .getElementById(errors.email ? "admin-email" : "admin-password")
        ?.focus();
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
    <div className="screen">
      <AppBar onHome={onBack} label="Staff sign in">
        <button
          className="btn btn--secondary btn--sm"
          type="button"
          onClick={onBack}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </button>
      </AppBar>

      <main className="screen__main wrap auth__main">
        <div className="panel-box panel-box--light auth__card">
          <div className="auth__head">
            <p className="eyebrow-label">Clinic staff</p>
            <h1>Staff sign in</h1>
            <p>Manage doctors, patients and appointment requests.</p>
          </div>

          <form
            className="form auth__form"
            onSubmit={handleSubmit}
            noValidate
          >
            <label className="field field--full" htmlFor="admin-email">
              Staff email
              <input
                id="admin-email"
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? "admin-email-error" : undefined}
                type="email"
                placeholder="admin@medibook.com"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
                autoComplete="username"
                required
              />
              {fieldErrors.email && (
                <span className="field-error" id="admin-email-error">
                  {fieldErrors.email}
                </span>
              )}
            </label>

            <label className="field field--full" htmlFor="admin-password">
              Password
              <span className="ui-affix ui-affix--trail">
                <input
                  id="admin-password"
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={fieldErrors.password ? "admin-password-error" : undefined}
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="ui-affix__btn"
                  aria-label="Show password"
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <EyeOff size={18} aria-hidden="true" />
                  ) : (
                    <Eye size={18} aria-hidden="true" />
                  )}
                </button>
              </span>
              {fieldErrors.password && (
                <span className="field-error" id="admin-password-error">
                  {fieldErrors.password}
                </span>
              )}
            </label>


            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <button
              className="btn btn--primary auth__submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="auth__note">
            Only clinic staff can sign in here. Patients sign in from the home page.
          </p>
        </div>
      </main>
    </div>
  );
}
